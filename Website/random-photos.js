// Inserts 4 random "View more photos" images above the bottom CTA section.
// Runs on interior pages that have `.container .cta-buttons`.
(function () {
  const PHOTO_POOL = [
    "public/Photo%206.jpg",
    "public/Photo%207.jpg",
    "public/Photo%208.jpg",
    "public/Photo%209.jpg",
    "public/Photo%2010.jpg",
    "public/Photo%2017.jpg",
    "public/Photo%2018.jpg",
    "public/Photo%2019.jpg",
    "public/Photo%2023.jpeg",
    "public/Photo%2028.jpeg",
    "public/Photo%2046.jpeg",
    "public/Photo%2052.jpeg",
    "public/photopool.jpeg",
  ];

  function pickUnique(arr, count) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy.slice(0, Math.min(count, copy.length));
  }

  function buildSection(urls) {
    const section = document.createElement("section");
    section.className = "random-photos-strip";
    section.setAttribute("aria-label", "More project photos");

    const grid = document.createElement("div");
    grid.className = "random-photos-strip__grid";

    urls.forEach((src) => {
      const card = document.createElement("div");
      card.className = "random-photos-strip__card";
      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      card.appendChild(img);
      grid.appendChild(card);
    });

    section.appendChild(grid);
    return section;
  }

  function init() {
    const path = (window.location.pathname || "").replace(/\\/g, "/").toLowerCase();
    if (path.endsWith("/thank-you.html") || path.endsWith("thank-you.html")) return;

    // Default interior pages: insert above the bottom CTA section inside `.container`.
    const buttonsInContainer = document.querySelector(".container .cta-buttons");
    if (buttonsInContainer) {
      const contentSection = buttonsInContainer.closest(".content-section");
      if (!contentSection || !contentSection.parentNode) return;

      // Avoid double-insert if multiple scripts run.
      if (contentSection.parentNode.querySelector(":scope > .random-photos-strip")) return;

      const urls = pickUnique(PHOTO_POOL, 4);
      if (urls.length < 4) return;

      const section = buildSection(urls);
      contentSection.parentNode.insertBefore(section, contentSection);
      return;
    }

    // Quote page: CTA buttons live inside `.quote-why-band`, not `.container`.
    const quoteBand = document.querySelector(".quote-why-band");
    const buttonsInQuoteBand = quoteBand ? quoteBand.querySelector(".cta-buttons") : null;
    if (!quoteBand || !buttonsInQuoteBand || !quoteBand.parentNode) return;

    // Avoid double-insert.
    if (quoteBand.parentNode.querySelector(":scope > .random-photos-strip")) return;

    const urls = pickUnique(PHOTO_POOL, 4);
    if (urls.length < 4) return;

    const section = buildSection(urls);
    quoteBand.parentNode.insertBefore(section, quoteBand);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
