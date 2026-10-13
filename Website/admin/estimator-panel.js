/**
 * Screen Armors Estimator Panel — authenticated hub for internal estimating tools.
 */
(function () {
  var PANEL_PATH = "/admin/estimator-panel.html";
  var LOGIN_PATH = "/admin/estimator-panel.html";
  var CALCULATOR_PATH = "/admin/porch-calculator.html";

  var estimatorTools = [
    {
      name: "Front / Back Porch Calculator",
      description:
        "Create porch estimates, calculate framing materials, optimize cut plans, calculate worker pay and generate project layouts.",
      href: CALCULATOR_PATH,
      status: "active",
      actionLabel: "Open Calculator",
      image: "../public/frontporch.jpeg",
      imageAlt: "Front porch screen enclosure",
      savedEstimates: true,
      savedKind: "estimates",
    },
    {
      name: "Pool Cage Layout Designer",
      description:
        "Create interactive pool cage layouts, configure walls and roof geometry, add ClearView openings, customize beams and posts, and generate client-ready project drawings.",
      href: "/admin/pool-cage-designer.html",
      status: "active",
      actionLabel: "Open Designer",
      savedLabel: "Saved Projects",
      image: "../public/cages1.webp",
      imageAlt: "Pool cage screen enclosure",
      savedEstimates: true,
      savedKind: "pool-cage",
    },
  ];

  var bootStatus = document.getElementById("adminBootStatus");
  var loginPanel = document.getElementById("adminLoginPanel");
  var toolPanel = document.getElementById("adminToolPanel");
  var loginForm = document.getElementById("adminLoginForm");
  var loginStatus = document.getElementById("adminLoginStatus");
  var loginBtn = document.getElementById("adminLoginBtn");
  var logoutBtn = document.getElementById("adminLogoutBtn");
  var userLabel = document.getElementById("adminUserLabel");
  var toolGrid = document.getElementById("estimatorToolGrid");

  if (!loginPanel || !toolPanel || !loginForm) return;

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isActiveTool(tool) {
    return tool && tool.status === "active" && tool.href;
  }

  function formatModifiedDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function projectTypeLabel(value) {
    return value === "back" ? "Back porch" : "Front porch";
  }

  function renderTools() {
    if (!toolGrid) return;
    toolGrid.innerHTML = estimatorTools
      .map(function (tool) {
        var active = isActiveTool(tool);
        var name = escapeHtml(tool.name);
        var description = escapeHtml(tool.description || "Coming soon");
        var image = tool.image
          ? '<div class="admin-estimator-card__photo"><img src="' +
            escapeHtml(tool.image) +
            '" alt="' +
            escapeHtml(tool.imageAlt || "") +
            '" loading="lazy" decoding="async"></div>'
          : "";
        if (active) {
          var href = escapeHtml(tool.href);
          var label = escapeHtml(tool.actionLabel || "Open");
          var savedLabel = escapeHtml(tool.savedLabel || "Saved Estimates");
          var savedKind = escapeHtml(tool.savedKind || "estimates");
          var savedToggle = tool.savedEstimates
            ? '<button type="button" class="btn btn-secondary admin-estimator-card__action" data-saved-toggle aria-expanded="false">' +
              savedLabel +
              "</button>"
            : "";
          var savedSearch =
            savedKind === "estimates"
              ? '<label class="admin-estimator-saved__search">' +
                '<span class="sr-only">Search saved estimates by client name</span>' +
                '<input type="search" data-saved-search placeholder="Client name" autocomplete="off" enterkeyhint="search">' +
                "</label>"
              : "";
          var savedList = tool.savedEstimates
            ? '<div class="admin-estimator-saved" data-saved-list hidden>' +
              savedSearch +
              '<p class="admin-estimator-saved__status" data-saved-status>Click ' +
              savedLabel +
              " to load the list.</p>" +
              '<ul class="admin-estimator-saved__items" data-saved-items></ul>' +
              "</div>"
            : "";
          return (
            '<article class="admin-porch-card admin-estimator-card admin-estimator-card--featured" data-saved-kind="' +
            savedKind +
            '">' +
            image +
            "<h2 class=\"admin-estimator-card__name\">" +
            name +
            "</h2>" +
            "<p class=\"admin-estimator-card__desc\">" +
            description +
            "</p>" +
            '<div class="admin-estimator-card__actions">' +
            '<a class="btn btn-quote admin-estimator-card__action" href="' +
            href +
            '">' +
            label +
            "</a>" +
            savedToggle +
            "</div>" +
            savedList +
            "</article>"
          );
        }
        return (
          '<article class="admin-porch-card admin-estimator-card admin-estimator-card--soon" aria-disabled="true">' +
          image +
          "<h2 class=\"admin-estimator-card__name\">" +
          name +
          "</h2>" +
          "<p class=\"admin-estimator-card__desc\">" +
          description +
          "</p>" +
          "</article>"
        );
      })
      .join("");
    bindSavedEstimates();
  }

  function bindSavedEstimates() {
    if (!toolGrid) return;
    var toggles = toolGrid.querySelectorAll("[data-saved-toggle]");
    Array.prototype.forEach.call(toggles, function (toggle) {
      var card = toggle.closest(".admin-estimator-card");
      var wrap = card && card.querySelector("[data-saved-list]");
      if (!wrap) return;
      toggle.addEventListener("click", function () {
        var opening = wrap.hasAttribute("hidden");
        if (opening) {
          wrap.removeAttribute("hidden");
          toggle.setAttribute("aria-expanded", "true");
          loadSavedForCard(card);
        } else {
          wrap.setAttribute("hidden", "");
          toggle.setAttribute("aria-expanded", "false");
        }
      });
      var search = card.querySelector("[data-saved-search]");
      if (search) {
        search.addEventListener("input", function () {
          applySavedFilter(card);
        });
      }
    });
  }

  function applySavedFilter(card) {
    var input = card.querySelector("[data-saved-search]");
    var listEl = card.querySelector("[data-saved-items]");
    if (!listEl) return;
    var query = input ? input.value.trim().toLowerCase() : "";
    var shown = 0;
    var total = 0;
    Array.prototype.forEach.call(listEl.children, function (li) {
      total += 1;
      var name = (li.getAttribute("data-name") || "").toLowerCase();
      var match = !query || name.indexOf(query) !== -1;
      li.hidden = !match;
      if (match) shown += 1;
    });
    if (!total || card.getAttribute("data-saved-kind") !== "estimates") return;
    if (query && !shown) setSavedStatus(card, "No estimates match that name.");
    else setSavedStatus(card, "Select an estimate to open layouts and downloads.");
  }

  function setSavedStatus(card, message) {
    var statusEl = card && card.querySelector("[data-saved-status]");
    if (statusEl) statusEl.textContent = message || "";
  }

  async function loadSavedForCard(card) {
    if (!card || card.getAttribute("data-loaded") === "1") return;
    var kind = card.getAttribute("data-saved-kind");
    if (kind === "pool-cage") loadPoolCageProjects(card);
    else loadSavedEstimates(card);
  }

  async function loadSavedEstimates(card) {
    var listEl = card.querySelector("[data-saved-items]");
    if (!listEl) return;
    setSavedStatus(card, "Loading saved estimates…");
    try {
      var res = await fetch("/api/admin/estimates", {
        method: "GET",
        credentials: "same-origin",
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data.ok) {
        setSavedStatus(card, data.error || "Could not load saved estimates.");
        return;
      }
      var items = Array.isArray(data.estimates) ? data.estimates : [];
      listEl.innerHTML = "";
      if (!items.length) {
        setSavedStatus(card, "No saved estimates yet. Open the calculator to create one.");
        card.setAttribute("data-loaded", "1");
        return;
      }
      setSavedStatus(card, "Select an estimate to open layouts and downloads.");
      items.forEach(function (item) {
        var li = document.createElement("li");
        li.setAttribute("data-name", item.name || item.title || item.id || "");
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "admin-estimator-saved__item";
        var title = document.createElement("strong");
        title.textContent = item.name || item.title || item.id;
        var meta = document.createElement("span");
        meta.textContent =
          projectTypeLabel(item.projectType) +
          (item.sectionCount ? " · " + item.sectionCount + " section" + (item.sectionCount === 1 ? "" : "s") : "") +
          (formatModifiedDate(item.updatedAt) ? " · " + formatModifiedDate(item.updatedAt) : "");
        btn.appendChild(title);
        btn.appendChild(meta);
        btn.addEventListener("click", function () {
          window.location.href = CALCULATOR_PATH + "?id=" + encodeURIComponent(item.id);
        });
        li.appendChild(btn);
        listEl.appendChild(li);
      });
      applySavedFilter(card);
      card.setAttribute("data-loaded", "1");
    } catch (err) {
      setSavedStatus(card, "Network error loading saved estimates.");
    }
  }

  function roofLabel(value) {
    if (!value || value === "grid") return "Standard grid";
    var name = String(value);
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  async function loadPoolCageProjects(card) {
    var listEl = card.querySelector("[data-saved-items]");
    if (!listEl) return;
    setSavedStatus(card, "Loading saved projects…");
    try {
      var res = await fetch("/api/admin/pool-cage-projects", {
        method: "GET",
        credentials: "same-origin",
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data.ok) {
        setSavedStatus(card, data.error || "Could not load saved projects.");
        return;
      }
      var items = Array.isArray(data.projects) ? data.projects : [];
      listEl.innerHTML = "";
      if (!items.length) {
        setSavedStatus(card, "No saved projects yet. Open the designer to create one.");
        card.setAttribute("data-loaded", "1");
        return;
      }
      setSavedStatus(card, "");
      items.forEach(function (item) {
        var li = document.createElement("li");
        var row = document.createElement("div");
        row.className = "admin-estimator-saved__item";
        var title = document.createElement("strong");
        title.textContent = item.name || item.id;
        var meta = document.createElement("span");
        meta.textContent =
          (item.customerName ? item.customerName + " · " : "") +
          roofLabel(item.roofType) +
          (formatModifiedDate(item.updatedAt) ? " · Updated " + formatModifiedDate(item.updatedAt) : "");
        var actions = document.createElement("div");
        actions.className = "admin-estimator-saved__actions";
        actions.appendChild(savedAction("Open", function () {
          window.location.href = "/admin/pool-cage-designer.html?id=" + encodeURIComponent(item.id);
        }));
        actions.appendChild(savedAction("Duplicate", function () {
          duplicatePoolCageProject(card, item.id);
        }));
        actions.appendChild(savedAction("Delete", function () {
          deletePoolCageProject(card, item);
        }));
        row.appendChild(title);
        row.appendChild(meta);
        row.appendChild(actions);
        li.appendChild(row);
        listEl.appendChild(li);
      });
      card.setAttribute("data-loaded", "1");
    } catch (err) {
      setSavedStatus(card, "Network error loading saved projects.");
    }
  }

  function savedAction(label, onClick) {
    var button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  async function duplicatePoolCageProject(card, id) {
    setSavedStatus(card, "Duplicating…");
    try {
      var res = await fetch("/api/admin/pool-cage-projects", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "duplicate", id: id }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data.ok) {
        setSavedStatus(card, data.error || "Could not duplicate that project.");
        return;
      }
      card.removeAttribute("data-loaded");
      loadPoolCageProjects(card);
    } catch (err) {
      setSavedStatus(card, "Network error duplicating the project.");
    }
  }

  async function deletePoolCageProject(card, item) {
    var name = item.name || "this project";
    if (!window.confirm('Delete "' + name + '"?')) return;
    setSavedStatus(card, "Deleting…");
    try {
      var res = await fetch("/api/admin/pool-cage-projects?id=" + encodeURIComponent(item.id), {
        method: "DELETE",
        credentials: "same-origin",
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data.ok) {
        setSavedStatus(card, data.error || "Could not delete that project.");
        return;
      }
      card.removeAttribute("data-loaded");
      loadPoolCageProjects(card);
    } catch (err) {
      setSavedStatus(card, "Network error deleting the project.");
    }
  }

  function showLogin() {
    document.body.classList.add("estimator-is-login");
    if (bootStatus) bootStatus.hidden = true;
    loginPanel.hidden = false;
    toolPanel.hidden = true;
  }

  function showPanel(username) {
    document.body.classList.remove("estimator-is-login");
    if (bootStatus) bootStatus.hidden = true;
    loginPanel.hidden = true;
    toolPanel.hidden = false;
    if (userLabel) userLabel.textContent = "Signed in as " + username;
    renderTools();
  }

  function goToLoginPage() {
    if (window.location.pathname.replace(/\/+$/, "") === LOGIN_PATH.replace(/\/+$/, "")) {
      showLogin();
      return;
    }
    window.location.replace(LOGIN_PATH);
  }

  async function checkSession() {
    var local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
    try {
      var res = await fetch("/api/admin/session", {
        method: "GET",
        credentials: "same-origin",
        signal: AbortSignal.timeout(2500),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (res.ok && data.authenticated) {
        showPanel(data.username);
        return;
      }
    } catch (err) {
      /* fall through */
    }
    if (local) {
      showPanel("local preview");
      return;
    }
    goToLoginPage();
  }

  loginForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (loginStatus) loginStatus.textContent = "";
    if (loginBtn) loginBtn.disabled = true;
    try {
      var res = await fetch("/api/admin/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: document.getElementById("adminUsername").value,
          password: document.getElementById("adminPassword").value,
        }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data.ok) {
        if (loginStatus) {
          loginStatus.textContent =
            data.error || "Could not sign in. Check username/password and server config.";
        }
        return;
      }
      if (window.location.pathname.replace(/\/+$/, "") !== PANEL_PATH.replace(/\/+$/, "")) {
        window.location.replace(PANEL_PATH);
        return;
      }
      showPanel(data.username);
    } catch (err) {
      if (loginStatus) loginStatus.textContent = "Network error. Try again.";
    } finally {
      if (loginBtn) loginBtn.disabled = false;
    }
  });

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async function () {
      try {
        await fetch("/api/admin/session", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "logout" }),
        });
      } catch (err) {
        /* ignore */
      }
      if (loginForm) loginForm.reset();
      if (loginStatus) loginStatus.textContent = "";
      showLogin();
    });
  }

  checkSession();
})();
