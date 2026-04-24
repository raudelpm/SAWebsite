(() => {
  const state = {
    posts: [],
    loaded: false,
  };

  function escapeHtml(s) {
    return (s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderPosts(posts) {
    const root = document.querySelector("[data-blog-results]");
    if (!root) return;

    if (posts.length === 0) {
      root.innerHTML =
        `<div class="blog-empty">
          <p><strong>No posts yet.</strong> Check back soon.</p>
        </div>`;
      return;
    }

    root.innerHTML = posts
      .map((p) => {
        const date = p.date ? new Date(p.date + "T00:00:00") : null;
        const human = date
          ? date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
          : "";
        return `
          <article class="blog-card">
            <a class="blog-card-link" href="${escapeHtml(p.url)}" aria-label="${escapeHtml(p.title)}">
              <div class="blog-card-media">
                <img src="${escapeHtml(p.image)}" alt="" loading="lazy" decoding="async">
              </div>
              <div class="blog-card-body">
                <p class="blog-card-meta">${escapeHtml(human)}</p>
                <h2 class="blog-card-title">${escapeHtml(p.title)}</h2>
                <p class="blog-card-excerpt">${escapeHtml(p.excerpt)}</p>
                <span class="blog-card-cta">Read post →</span>
              </div>
            </a>
          </article>
        `;
      })
      .join("");
  }

  async function loadIndex() {
    if (state.loaded) return;
    state.loaded = true;

    const resultsRoot = document.querySelector("[data-blog-results]");
    if (resultsRoot) {
      resultsRoot.innerHTML = `<div class="blog-loading"><p>Loading posts…</p></div>`;
    }

    try {
      const res = await fetch("blog-index.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`Index load failed: ${res.status}`);
      const data = await res.json();
      state.posts = Array.isArray(data.posts) ? data.posts : [];
      renderPosts(state.posts);
    } catch (e) {
      if (resultsRoot) {
        resultsRoot.innerHTML =
          `<div class="blog-empty">
            <p><strong>Couldn’t load blog posts.</strong> Please refresh the page.</p>
          </div>`;
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadIndex);
  } else {
    loadIndex();
  }
})();
