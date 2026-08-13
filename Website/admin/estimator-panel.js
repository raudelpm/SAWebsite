/**
 * Screen Armors Estimator Panel — authenticated hub for internal estimating tools.
 */
(function () {
  var PANEL_PATH = "/admin/estimator-panel.html";
  var LOGIN_PATH = "/admin/estimator-panel.html";

  var estimatorTools = [
    {
      name: "Front / Back Porch Calculator",
      description:
        "Create porch estimates, calculate framing materials, optimize cut plans, calculate worker pay and generate project layouts.",
      href: "/admin/porch-calculator.html",
      status: "active",
      actionLabel: "Open Calculator",
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

  function renderTools() {
    if (!toolGrid) return;
    toolGrid.innerHTML = estimatorTools
      .map(function (tool) {
        var active = isActiveTool(tool);
        var name = escapeHtml(tool.name);
        var description = escapeHtml(tool.description || "Coming soon");
        if (active) {
          var href = escapeHtml(tool.href);
          var label = escapeHtml(tool.actionLabel || "Open");
          return (
            '<article class="admin-porch-card admin-estimator-card">' +
            "<h2 class=\"admin-estimator-card__name\">" +
            name +
            "</h2>" +
            "<p class=\"admin-estimator-card__desc\">" +
            description +
            "</p>" +
            '<a class="btn btn-quote admin-estimator-card__action" href="' +
            href +
            '">' +
            label +
            "</a>" +
            "</article>"
          );
        }
        return (
          '<article class="admin-porch-card admin-estimator-card admin-estimator-card--soon" aria-disabled="true">' +
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
  }

  function showLogin() {
    if (bootStatus) bootStatus.hidden = true;
    loginPanel.hidden = false;
    toolPanel.hidden = true;
  }

  function showPanel(username) {
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
