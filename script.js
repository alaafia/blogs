const FEED_URL = "https://medium.com/feed/@aichalaafia1";
const container = document.getElementById("blogs-carousel");

fetch(`https://api.rss2json.com/v1/api.json?rss_url=${FEED_URL}`)
  .then(res => res.json())
  .then(data => {
    data.items.forEach(item => {
      const card = document.createElement("div");
      card.className = "card";

      const date = new Date(item.pubDate).getFullYear();

      card.innerHTML = `
        <h3>${item.title}</h3>
        <p>${item.description.replace(/<[^>]*>/g, "").slice(0, 120)}...</p>
        <a href="${item.link}" target="_blank">
          Read on Medium (${date})
        </a>
      `;

      container.appendChild(card);
    });
  });
