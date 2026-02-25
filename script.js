/**
 * Aicha Laafia — Blog
 * Fetches articles from Medium RSS feed and renders them.
 *
 * Fetch strategy (in order):
 *   1. rss2json   — returns clean JSON, includes thumbnail & categories
 *   2. allorigins — returns raw RSS/XML as fallback
 */

(() => {
  'use strict';

  // ─── Configuration ──────────────────────────────────────────────────────────

  const MEDIUM_USERNAME = 'aichalaafia1';
  const FEED_URL        = `https://medium.com/feed/@${MEDIUM_USERNAME}`;
  const FETCH_TIMEOUT   = 8000; // ms per proxy attempt

  // ─── DOM references ─────────────────────────────────────────────────────────

  const featuredSection = document.getElementById('featured-section');
  const skeletonFeatured = document.getElementById('skeleton-featured');
  const gridSection     = document.getElementById('grid-section');
  const articlesGrid    = document.getElementById('articles-grid');
  const articleCountEl  = document.getElementById('article-count-text');
  const errorState      = document.getElementById('error-state');
  const emptyState      = document.getElementById('empty-state');
  const retryBtn        = document.getElementById('retry-btn');
  const footerYear      = document.getElementById('footer-year');

  // ─── Boot ───────────────────────────────────────────────────────────────────

  if (footerYear) footerYear.textContent = new Date().getFullYear();

  // ─── Fetch helpers ──────────────────────────────────────────────────────────

  /**
   * fetch() with a real AbortController-backed timeout.
   * The signal is passed directly to fetch so the request is actually cancelled.
   */
  function fetchWithTimeout(url, ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, { signal: controller.signal })
      .finally(() => clearTimeout(timer));
  }

  /**
   * Primary: rss2json API — returns clean JSON including thumbnails & categories.
   */
  async function fetchViaRss2Json() {
    // count=50 requests more items; Medium's native RSS caps at 10 anyway,
    // but this prevents rss2json's own 10-item default from cutting us short.
    const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(FEED_URL)}&count=50`;
    const res  = await fetchWithTimeout(url, FETCH_TIMEOUT);
    if (!res.ok) throw new Error(`rss2json HTTP ${res.status}`);
    const data = await res.json();
    if (data.status !== 'ok' || !Array.isArray(data.items)) {
      throw new Error('rss2json returned unexpected payload');
    }
    return data.items.map(normaliseRss2JsonItem);
  }

  /**
   * Fallback 1: allorigins — returns raw RSS XML.
   */
  async function fetchViaAllorigins() {
    const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(FEED_URL)}`;
    const res  = await fetchWithTimeout(url, FETCH_TIMEOUT);
    if (!res.ok) throw new Error(`allorigins HTTP ${res.status}`);
    const xml  = await res.text();
    return parseRSSXML(xml);
  }

  /**
   * Fallback 2: corsproxy.io — another reliable CORS proxy for RSS/XML.
   */
  async function fetchViaCorsproxy() {
    const url = `https://corsproxy.io/?${encodeURIComponent(FEED_URL)}`;
    const res  = await fetchWithTimeout(url, FETCH_TIMEOUT);
    if (!res.ok) throw new Error(`corsproxy HTTP ${res.status}`);
    const xml  = await res.text();
    return parseRSSXML(xml);
  }

  async function fetchArticles() {
    // Try each proxy in order; log failures and keep trying.
    const proxies = [
      ['rss2json',   fetchViaRss2Json],
      ['allorigins', fetchViaAllorigins],
      ['corsproxy',  fetchViaCorsproxy],
    ];

    let lastErr;
    for (const [name, fn] of proxies) {
      try {
        const items = await fn();
        console.log(`[Blog] Loaded via ${name} (${items.length} articles)`);
        return items;
      } catch (err) {
        lastErr = err;
        console.warn(`[Blog] ${name} failed:`, err.message);
      }
    }

    throw lastErr;
  }

  // ─── Normalisers ────────────────────────────────────────────────────────────

  /**
   * rss2json already does the heavy lifting.
   * Field names: title, pubDate, link, author, thumbnail, description, content, categories[]
   */
  function normaliseRss2JsonItem(item) {
    return {
      title:      item.title       || '',
      link:       item.link        || '',
      pubDate:    item.pubDate     || '',
      thumbnail:  item.thumbnail   || '',
      description: item.description || '',
      content:    item.content     || '',
      categories: Array.isArray(item.categories) ? item.categories : [],
    };
  }

  /**
   * Parse raw RSS XML into the same normalised shape.
   */
  function parseRSSXML(xml) {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(xml, 'application/xml');

    // Graceful parse-error check
    const parseErr = doc.querySelector('parsererror');
    if (parseErr) throw new Error('RSS XML parse error');

    return Array.from(doc.querySelectorAll('item')).map(item => {
      const title   = item.querySelector('title')?.textContent?.trim()   || '';
      const link    = item.querySelector('link')?.textContent?.trim()    || '';
      const pubDate = item.querySelector('pubDate')?.textContent?.trim() || '';
      const categories = Array.from(item.querySelectorAll('category'))
                              .map(c => c.textContent.trim())
                              .filter(Boolean);

      // content:encoded holds the full article HTML
      const contentEl = item.querySelector('content\\:encoded') ||
                        item.querySelector('encoded');
      const content   = contentEl?.textContent || '';

      // Cover image: media:thumbnail first, then first <img> in content
      let thumbnail = item.querySelector('media\\:thumbnail, thumbnail')
                          ?.getAttribute('url') || '';
      if (!thumbnail && content) {
        const m = content.match(/<img[^>]+src=["']([^"']+)["']/);
        if (m) thumbnail = m[1];
      }

      return { title, link, pubDate, thumbnail, description: '', content, categories };
    });
  }

  // ─── Text utilities ─────────────────────────────────────────────────────────

  /**
   * Decode HTML entities using the browser's own parser.
   * This is XSS-safe: we use a <textarea> (no script execution)
   * and read back .value (plain text).
   *
   * rss2json returns titles/descriptions already HTML-encoded, e.g.
   *   "Search &amp; Replace"
   * Without this step, escapeHTML() would double-encode to "&amp;amp;"
   * and the browser would display "&amp;" literally in the UI.
   */
  function decodeHTML(html) {
    const el = document.createElement('textarea');
    el.innerHTML = String(html || '');
    return el.value;
  }

  function stripHTML(html) {
    return html
      .replace(/<figure[\s\S]*?<\/figure>/gi, '') // remove images + captions
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g,  '&')
      .replace(/&lt;/g,   '<')
      .replace(/&gt;/g,   '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function escapeHTML(str) {
    return String(str)
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;')
      .replace(/"/g,  '&quot;');
  }

  function getExcerpt(item, maxLen) {
    // rss2json description is a short HTML excerpt
    let text = item.description ? stripHTML(item.description) : '';

    // Fall back to full content
    if (text.length < 40 && item.content) {
      text = stripHTML(item.content);
    }

    // Skip if still just the title echoed back
    if (text.toLowerCase().startsWith(item.title.toLowerCase())) {
      text = text.slice(item.title.length).trim().replace(/^[:—–\s]+/, '');
    }

    return text.length > maxLen
      ? text.slice(0, maxLen).replace(/\s+\S*$/, '') + '\u2026' // ellipsis
      : text;
  }

  function readingTime(item) {
    const raw   = item.content || item.description || '';
    const words = stripHTML(raw).trim().split(/\s+/).filter(Boolean).length;
    const mins  = Math.max(1, Math.ceil(words / 200));
    return `${mins}\u202Fmin read`;
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day:   'numeric',
      year:  'numeric',
    });
  }

  // ─── HTML builders ──────────────────────────────────────────────────────────

  function pillsHTML(categories) {
    if (!categories.length) return '';
    const pills = categories
      .slice(0, 3)
      .map(c => `<span class="pill">${escapeHTML(c)}</span>`)
      .join('');
    return `<div class="article-pills">${pills}</div>`;
  }

  function coverImgHTML(item, className, fallbackClass, minH) {
    if (item.thumbnail) {
      return `<img
        class="${className}"
        src="${escapeHTML(item.thumbnail)}"
        alt="${escapeHTML(item.title)}"
        loading="lazy"
        decoding="async"
      />`;
    }
    return `<div class="${fallbackClass}" style="min-height:${minH}" aria-hidden="true">✦</div>`;
  }

  // ─── Render: featured card ───────────────────────────────────────────────────

  function renderFeatured(item) {
    const excerpt = getExcerpt(item, 300);
    const date    = formatDate(item.pubDate);
    const rt      = readingTime(item);
    const href    = escapeHTML(item.link || '#');

    const el = document.createElement('a');
    el.className = 'featured-card';
    el.href      = item.link || '#';
    el.target    = '_blank';
    el.rel       = 'noopener noreferrer';
    el.setAttribute('aria-label', `Read "${item.title}" on Medium`);

    el.innerHTML = `
      <div class="featured-card__body">
        <div class="featured-badge">Featured</div>
        ${pillsHTML(item.categories)}
        <h2 class="featured-card__title">${escapeHTML(decodeHTML(item.title))}</h2>
        ${excerpt ? `<p class="featured-card__excerpt">${escapeHTML(decodeHTML(excerpt))}</p>` : ''}
        <div class="featured-card__footer">
          <div class="article-meta">
            ${date ? `<span>${date}</span><span class="meta-dot" aria-hidden="true"></span>` : ''}
            <span>${rt}</span>
          </div>
          <span class="read-link" aria-hidden="true">
            Read Article
            <span class="read-link__arrow">&#x2197;</span>
          </span>
        </div>
      </div>
      <div class="featured-card__img-wrap">
        ${coverImgHTML(item, 'featured-card__img', 'featured-card__img-fallback', '360px')}
      </div>
    `;

    return el;
  }

  // ─── Render: grid card ───────────────────────────────────────────────────────

  function renderCard(item, index) {
    const excerpt = getExcerpt(item, 160);
    const date    = formatDate(item.pubDate);
    const rt      = readingTime(item);

    const el = document.createElement('a');
    el.className = 'article-card';
    el.href      = item.link || '#';
    el.target    = '_blank';
    el.rel       = 'noopener noreferrer';
    el.setAttribute('role', 'listitem');
    el.setAttribute('aria-label', `Read "${item.title}" on Medium`);

    // Stagger entrance delay per card
    el.style.transitionDelay = `${index * 75}ms`;

    el.innerHTML = `
      <div class="card__img-wrap">
        ${coverImgHTML(item, 'card__img', 'card__img-fallback', 'auto')}
      </div>
      <div class="card__body">
        ${pillsHTML(item.categories)}
        <h3 class="card__title">${escapeHTML(decodeHTML(item.title))}</h3>
        ${excerpt ? `<p class="card__excerpt">${escapeHTML(decodeHTML(excerpt))}</p>` : ''}
        <div class="card__footer">
          <span class="card__meta">${date}${date && rt ? ' \u00B7 ' : ''}${rt}</span>
          <span class="card__arrow" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 12L12 2M12 2H5M12 2V9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
        </div>
      </div>
    `;

    return el;
  }

  // ─── IntersectionObserver for scroll-triggered card entrances ───────────────

  const io = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.07, rootMargin: '0px 0px -30px 0px' }
  );

  // ─── UI state helpers ────────────────────────────────────────────────────────

  function clearSkeletons() {
    // Query fresh from the DOM — the cached `skeletonFeatured` reference goes
    // stale after a retry (restoreSkeletons rebuilds it via innerHTML).
    featuredSection.querySelector('.skeleton-featured')?.remove();
    articlesGrid.innerHTML = '';
  }

  function setCount(text) {
    if (articleCountEl) articleCountEl.textContent = text;
  }

  function showError() {
    clearSkeletons();
    gridSection.hidden = true;
    errorState.hidden  = false;
    setCount('Failed to load articles');
  }

  function showEmpty() {
    clearSkeletons();
    gridSection.hidden = true;
    emptyState.hidden  = false;
    setCount('No articles yet');
  }

  function restoreSkeletons() {
    // Re-inject featured skeleton
    featuredSection.innerHTML = `
      <div class="skeleton-featured" id="skeleton-featured" aria-hidden="true">
        <div class="skeleton-featured__content">
          <div class="sk sk--tag"></div>
          <div class="sk sk--title"></div>
          <div class="sk sk--title sk--short"></div>
          <div class="sk sk--text"></div>
          <div class="sk sk--text sk--mid"></div>
          <div class="sk sk--meta"></div>
        </div>
        <div class="skeleton-featured__img"></div>
      </div>
    `;

    articlesGrid.innerHTML = `
      <div class="skeleton-card" aria-hidden="true">
        <div class="skeleton-card__img"></div>
        <div class="skeleton-card__body">
          <div class="sk sk--tag"></div>
          <div class="sk sk--title"></div>
          <div class="sk sk--title sk--short"></div>
          <div class="sk sk--text"></div>
          <div class="sk sk--meta"></div>
        </div>
      </div>
      <div class="skeleton-card" aria-hidden="true">
        <div class="skeleton-card__img"></div>
        <div class="skeleton-card__body">
          <div class="sk sk--tag"></div>
          <div class="sk sk--title"></div>
          <div class="sk sk--title sk--short"></div>
          <div class="sk sk--text"></div>
          <div class="sk sk--meta"></div>
        </div>
      </div>
      <div class="skeleton-card" aria-hidden="true">
        <div class="skeleton-card__img"></div>
        <div class="skeleton-card__body">
          <div class="sk sk--tag"></div>
          <div class="sk sk--title"></div>
          <div class="sk sk--title sk--short"></div>
          <div class="sk sk--text"></div>
          <div class="sk sk--meta"></div>
        </div>
      </div>
    `;

    gridSection.hidden = false;
    setCount('Loading articles\u2026');
  }

  // ─── Main render ─────────────────────────────────────────────────────────────

  function render(items) {
    if (!items || items.length === 0) {
      showEmpty();
      return;
    }

    clearSkeletons();

    // Featured: first article
    const featured = renderFeatured(items[0]);
    featuredSection.appendChild(featured);

    // Grid: remaining articles
    const rest = items.slice(1);
    if (rest.length === 0) {
      gridSection.hidden = true;
    } else {
      gridSection.hidden = false;
      rest.forEach((item, i) => {
        const card = renderCard(item, i);
        articlesGrid.appendChild(card);
        io.observe(card);
      });
    }

    // Count label
    const n = items.length;
    setCount(`${n} article${n !== 1 ? 's' : ''} published`);
  }

  // ─── Init & retry ────────────────────────────────────────────────────────────

  async function init() {
    errorState.hidden = true;
    emptyState.hidden = true;

    try {
      const items = await fetchArticles();
      render(items);
    } catch (err) {
      console.error('[Blog] Could not load articles:', err);
      showError();
    }
  }

  retryBtn?.addEventListener('click', () => {
    errorState.hidden = true;
    restoreSkeletons();
    init();
  });

  // ─── Theme toggle ─────────────────────────────────────────────────────────────
  //
  // The <html data-theme="…"> attribute was already set by the inline <script>
  // in <head> (reads localStorage / prefers-color-scheme) so there's no flash.
  // Here we wire up the toggle buttons and keep their active state in sync.

  const THEME_KEY   = 'blog-theme';
  const htmlEl      = document.documentElement;
  const themeToggle = document.getElementById('theme-toggle');
  const themeOpts   = themeToggle
    ? Array.from(themeToggle.querySelectorAll('.theme-opt'))
    : [];

  function syncToggleUI(theme) {
    themeOpts.forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.themeVal === theme);
      btn.setAttribute('aria-pressed', String(btn.dataset.themeVal === theme));
    });
  }

  function applyTheme(theme) {
    htmlEl.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    syncToggleUI(theme);
  }

  // Initialise toggle UI to reflect the theme already applied by the inline script
  syncToggleUI(htmlEl.getAttribute('data-theme') || 'dark');

  // Enable smooth CSS transitions only after the first paint so the
  // initial theme application (from the inline script) never animates.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      htmlEl.classList.add('theme-transitions');
    });
  });

  themeOpts.forEach(btn => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.themeVal);
    });
  });

  init();
})();
