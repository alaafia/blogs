const FEED_URL = "https://medium.com/feed/@aichalaafia1";
const grid = document.getElementById("blogs-grid");

fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(FEED_URL)}`)
  .then(res => res.text())
  .then(xml => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "application/xml");
    const items = doc.querySelectorAll("item");

    items.forEach(item => {
      const title = item.querySelector("title")?.textContent || "";
      const link = item.querySelector("link")?.textContent || "";

      const date = new Date(
        item.querySelector("pubDate")?.textContent
      ).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
      });

      // 1️⃣ IMAGE: try media:thumbnail first
      let image = item.querySelector("media\\:thumbnail")?.getAttribute("url");

      // 2️⃣ fallback: extract first img from content
      const contentEncoded =
        item.querySelector("content\\:encoded")?.textContent || "";

      if (!image && contentEncoded) {
        const imgMatch = contentEncoded.match(/<img[^>]+src="([^">]+)"/);
        if (imgMatch) image = imgMatch[1];
      }

      // 3️⃣ TEXT
      const text = contentEncoded
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 180);

      const article = document.createElement("article");
      article.className = "article";

      article.innerHTML = `
        ${image ? `<img src="${image}" alt="">` : ""}
        <h2>${title}</h2>
        <p>${text || "Read the full article on Medium."}</p>
        <div class="article-meta">${date}</div>
      `;

      article.onclick = () => window.open(link, "_blank");

      grid.appendChild(article);
    });
  })
  .catch(err => {
    console.error(err);
    grid.innerHTML = "<p>Unable to load articles.</p>";
  });
