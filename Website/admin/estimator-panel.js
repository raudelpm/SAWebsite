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
    },
    {
      name: "Pool Cage Repair",
      description: "Coming soon",
      href: "",
      status: "coming-soon",
    },
    {
      name: "Full Rescreen",
      description: "Coming soon",
      href: "",
      status: "coming-soon",
    },
    {
      name: "Pool Cage Restoration",
      description: "Coming soon",
      href: "",
      status: "coming-soon",
    },
    {
      name: "Clearview Conversion",
      description: "Coming soon",
      href: "",
      status: "coming-soon",
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
  var savedLoaded = false;

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
          var savedToggle = tool.savedEstimates
            ? '<button type="button" class="btn btn-secondary admin-estimator-card__action" data-saved-toggle aria-expanded="false">Saved Estimates</button>'
            : "";
          var savedList = tool.savedEstimates
            ? '<div class="admin-estimator-saved" data-saved-list hidden>' +
              '<p class="admin-estimator-saved__status" data-saved-status>Click Saved Estimates to load the list.</p>' +
              '<ul class="admin-estimator-saved__items" data-saved-items></ul>' +
              "</div>"
            : "";
          return (
            '<article class="admin-porch-card admin-estimator-card admin-estimator-card--featured">' +
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
    var toggle = toolGrid.querySelector("[data-saved-toggle]");
    var wrap = toolGrid.querySelector("[data-saved-list]");
    if (!toggle || !wrap) return;
    toggle.addEventListener("click", function () {
      var opening = wrap.hasAttribute("hidden");
      if (opening) {
        wrap.removeAttribute("hidden");
        toggle.setAttribute("aria-expanded", "true");
        loadSavedEstimates();
      } else {
        wrap.setAttribute("hidden", "");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  function setSavedStatus(message) {
    var statusEl = toolGrid && toolGrid.querySelector("[data-saved-status]");
    if (statusEl) statusEl.textContent = message || "";
  }

  async function loadSavedEstimates() {
    var listEl = toolGrid && toolGrid.querySelector("[data-saved-items]");
    if (!listEl) return;
    if (savedLoaded && listEl.children.length) return;
    setSavedStatus("Loading saved estimates…");
    try {
      var res = await fetch("/api/admin/estimates", {
        method: "GET",
        credentials: "same-origin",
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data.ok) {
        setSavedStatus(data.error || "Could not load saved estimates.");
        return;
      }
      var items = Array.isArray(data.estimates) ? data.estimates : [];
      listEl.innerHTML = "";
      if (!items.length) {
        setSavedStatus("No saved estimates yet. Open the calculator to create one.");
        savedLoaded = true;
        return;
      }
      setSavedStatus("Select an estimate to open layouts and downloads.");
      items.forEach(function (item) {
        var li = document.createElement("li");
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
      savedLoaded = true;
    } catch (err) {
      setSavedStatus("Network error loading saved estimates.");
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
    savedLoaded = false;
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
    try {
      var res = await fetch("/api/admin/session", {
        method: "GET",
        credentials: "same-origin",
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
