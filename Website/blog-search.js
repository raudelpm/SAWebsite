(() => {
  const state = {
    posts: [],
    loaded: false,
  };

  function norm(str) {
    return (str || "")
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function buildHaystack(post) {
    const parts = [
      post.title,
      post.excerpt,
      (post.tags || []).join(" "),
      post.date,
    ];
    return norm(parts.filter(Boolean).join(" | "));
  }

  function escapeHtml(s) {
    return (s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderResults(posts) {
    const root = document.querySelector("[data-blog-results]");
    const countEl = document.querySelector("[data-blog-count]");
    if (!root) return;

    if (countEl) {
      countEl.textContent = `${posts.length} post${posts.length === 1 ? "" : "s"}`;
    }

    if (posts.length === 0) {
      root.innerHTML =
        `<div class="blog-empty">
          <p><strong>No posts found.</strong> Try a different keyword (e.g. “no-see-um”, “20x20”, “Sarasota”).</p>
        </div>`;
      return;
    }

    root.innerHTML = posts
      .map((p) => {
        const date = p.date ? new Date(p.date + "T00:00:00") : null;
        const human = date
          ? date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
          : "";
        const tags = (p.tags || []).slice(0, 6);
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
                ${tags.length ? `<p class="blog-card-tags">${tags.map((t) => `<span class="blog-tag">${escapeHtml(t)}</span>`).join("")}</p>` : ""}
                <span class="blog-card-cta">Read post →</span>
              </div>
            </a>
          </article>
        `;
      })
      .join("");
  }

  function applyFilter() {
    const input = document.querySelector("[data-blog-search]");
    const q = norm(input ? input.value : "");

    if (!q) {
      renderResults(state.posts);
      return;
    }

    const terms = q.split(" ").filter(Boolean);
    const results = state.posts
      .map((p) => ({ p, hay: p.__haystack || (p.__haystack = buildHaystack(p)) }))
      .filter(({ hay }) => terms.every((t) => hay.includes(t)))
      .map(({ p }) => p);

    renderResults(results);
  }

  async function loadIndex() {
    if (state.loaded) return;
    state.loaded = true;

    const resultsRoot = document.querySelector("[data-blog-results]");
    if (resultsRoot) {
      resultsRoot.innerHTML =
        `<div class="blog-loading"><p>Loading posts…</p></div>`;
    }

    try {
      const res = await fetch("blog-index.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`Index load failed: ${res.status}`);
      const data = await res.json();
      state.posts = Array.isArray(data.posts) ? data.posts : [];
      renderResults(state.posts);
      applyFilter();
    } catch (e) {
      if (resultsRoot) {
        resultsRoot.innerHTML =
          `<div class="blog-empty">
            <p><strong>Couldn’t load blog posts.</strong> Please refresh the page.</p>
          </div>`;
      }
    }
  }

  function bind() {
    const input = document.querySelector("[data-blog-search]");
    const clearBtn = document.querySelector("[data-blog-clear]");

    if (input) {
      input.addEventListener("input", applyFilter, { passive: true });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          input.value = "";
          applyFilter();
        }
      });
    }

    if (clearBtn && input) {
      clearBtn.addEventListener("click", () => {
        input.value = "";
        input.focus();
        applyFilter();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      bind();
      loadIndex();
    });
  } else {
    bind();
    loadIndex();
  }
})();

