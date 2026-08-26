// Inserts 4 random "View more photos" images above the bottom CTA section.
// Strip uses 720px thumbs; lightbox uses the full-size WebP.
(function () {
  const PHOTO_POOL = [
    { thumb: "public/thumbs/Photo%206.webp", full: "public/Photo%206.webp" },
    { thumb: "public/thumbs/Photo%207.webp", full: "public/Photo%207.webp" },
    { thumb: "public/thumbs/Photo%208.webp", full: "public/Photo%208.webp" },
    { thumb: "public/thumbs/Photo%209.webp", full: "public/Photo%209.webp" },
    { thumb: "public/thumbs/Photo%2010.webp", full: "public/Photo%2010.webp" },
    { thumb: "public/thumbs/Photo%2017.webp", full: "public/Photo%2017.webp" },
    { thumb: "public/thumbs/Photo%2018.webp", full: "public/Photo%2018.webp" },
    { thumb: "public/thumbs/Photo%2019.webp", full: "public/Photo%2019.webp" },
    { thumb: "public/thumbs/Photo%2023.webp", full: "public/Photo%2023.webp" },
    { thumb: "public/thumbs/Photo%2028.webp", full: "public/Photo%2028.webp" },
    { thumb: "public/thumbs/Photo%2046.webp", full: "public/Photo%2046.webp" },
    { thumb: "public/thumbs/Photo%2052.webp", full: "public/Photo%2052.webp" },
    { thumb: "public/thumbs/photopool.webp", full: "public/photopool.webp" },
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

  function buildSection(photos) {
    const section = document.createElement("section");
    section.className = "random-photos-strip";
    section.setAttribute("aria-label", "More project photos");

    const grid = document.createElement("div");
    grid.className = "random-photos-strip__grid";

    photos.forEach((photo) => {
      const card = document.createElement("div");
      card.className = "random-photos-strip__card";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "random-photos-strip__btn";
      btn.setAttribute("aria-label", "Open photo");

      const img = document.createElement("img");
      img.src = photo.thumb;
      img.alt = "";
      img.width = 400;
      img.height = 400;
      img.loading = "lazy";
      img.decoding = "async";

      btn.appendChild(img);
      btn.addEventListener("click", () => openLightbox(photo.full));
      card.appendChild(btn);
      grid.appendChild(card);
    });

    section.appendChild(grid);
    return section;
  }

  function ensureLightbox() {
    const existing = document.getElementById("saLightbox");
    if (existing) return existing;

    const overlay = document.createElement("div");
    overlay.id = "saLightbox";
    overlay.className = "lightbox";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Photo preview");

    const img = document.createElement("img");
    img.className = "lightbox-content";
    img.alt = "";
    img.loading = "eager";
    img.decoding = "async";

    const close = document.createElement("button");
    close.type = "button";
    close.className = "lightbox-close";
    close.setAttribute("aria-label", "Close");
    close.textContent = "×";

    overlay.appendChild(close);
    overlay.appendChild(img);

    function hide() {
      overlay.style.display = "none";
      img.removeAttribute("src");
    }

    close.addEventListener("click", hide);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) hide();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && overlay.style.display === "flex") hide();
    });

    document.body.appendChild(overlay);
    return overlay;
  }

  function openLightbox(src) {
    const overlay = ensureLightbox();
    const img = overlay.querySelector(".lightbox-content");
    if (!img) return;
    img.src = src;
    overlay.style.display = "flex";
  }

  function init() {
    const path = (window.location.pathname || "").replace(/\\/g, "/").toLowerCase();
    if (path.endsWith("/thank-you.html") || path.endsWith("thank-you.html")) return;

    const buttonsInContainer = document.querySelector(".container .cta-buttons");
    if (buttonsInContainer) {
      const contentSection = buttonsInContainer.closest(".content-section");
      if (!contentSection || !contentSection.parentNode) return;

      if (contentSection.parentNode.querySelector(":scope > .random-photos-strip")) return;

      const photos = pickUnique(PHOTO_POOL, 4);
      if (photos.length < 4) return;

      const section = buildSection(photos);
      contentSection.parentNode.insertBefore(section, contentSection);
      return;
    }

    const quoteBand = document.querySelector(".quote-why-band");
    const buttonsInQuoteBand = quoteBand ? quoteBand.querySelector(".cta-buttons") : null;
    if (!quoteBand || !buttonsInQuoteBand || !quoteBand.parentNode) return;

    if (quoteBand.parentNode.querySelector(":scope > .random-photos-strip")) return;

    const photos = pickUnique(PHOTO_POOL, 4);
    if (photos.length < 4) return;

    const section = buildSection(photos);
    quoteBand.parentNode.insertBefore(section, quoteBand);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
