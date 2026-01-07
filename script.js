const FEED_URL = "https://medium.com/feed/@aichalaafia1";
const grid = document.getElementById("blogs-grid");

fetch(`https://api.rss2json.com/v1/api.json?rss_url=${FEED_URL}`)
  .then(res => res.json())
  .then(data => {
    data.items.forEach(item => {
      const article = document.createElement("div");
      article.className = "article";

      const image = item.thumbnail
        ? `<img src="${item.thumbnail}" alt="">`
        : "";

      const text = item.description
        .replace(/<[^>]*>/g, "")
        .slice(0, 160);

      const date = new Date(item.pubDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
      });

      article.innerHTML = `
        ${image}
        <h2>${item.title}</h2>
        <p>${text}...</p>
        <div class="article-meta">${date}</div>
      `;

      article.onclick = () => {
        window.open(item.link, "_blank");
      };

      grid.appendChild(article);
    });
  })
  .catch(() => {
    grid.innerHTML = "<p>Unable to load articles.</p>";
  });
