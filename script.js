const FEED_URL = "https://medium.com/feed/@aichalaafia1";
const grid = document.getElementById("blogs-grid");

if (!grid) {
  console.error("blogs-grid not found");
}

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

      const content =
        item.querySelector("content\\:encoded")?.textContent || "";

      const imgMatch = content.match(/<img[^>]+src="([^">]+)"/);
      const image = imgMatch ? imgMatch[1] : null;

      const text = content
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160);

      const article = document.createElement("article");
      article.className = "article";

      article.innerHTML = `
        ${image ? `<img src="${image}" alt="">` : ""}
        <h2>${title}</h2>
        <p>${text}...</p>
        <div class="article-meta">${date}</div>
      `;

      article.onclick = () => {
        window.open(link, "_blank");
      };

      grid.appendChild(article);
    });
  })
  .catch(err => {
    console.error("Failed to load Medium feed", err);
    grid.innerHTML = "<p>Unable to load articles.</p>";
  });
