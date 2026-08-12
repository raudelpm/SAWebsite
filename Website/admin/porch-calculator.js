/**
 * Admin porch enclosure estimate tool.
 * Pricing formulas are client-side after server login session is verified.
 */
(function () {
  var PRICE_1X2_STICK = 37;
  var PRICE_2X2_STICK = 60;
  var STICK_FT = 24;
  var PRICE_DOOR = 150;
  var PRICE_KICK_PLATE_PER_FT = 10;
  var PRICE_KICK_MOLDING_PER_FT = 1;
  var PRICE_SCREWS = 100;
  var PRICE_OVERHEAD = 200;
  var MARKUP_DIVISOR = 0.7;
  var WORKER_RATE = 0.25;
  var DOOR_HEADER_FT = 3;

  var bootStatus = document.getElementById("adminBootStatus");
  var loginPanel = document.getElementById("adminLoginPanel");
  var toolPanel = document.getElementById("adminToolPanel");
  var loginForm = document.getElementById("adminLoginForm");
  var loginStatus = document.getElementById("adminLoginStatus");
  var loginBtn = document.getElementById("adminLoginBtn");
  var logoutBtn = document.getElementById("adminLogoutBtn");
  var userLabel = document.getElementById("adminUserLabel");
  var calcForm = document.getElementById("porchCalcForm");
  var resultsEl = document.getElementById("porchResults");
  var resultsBody = document.getElementById("porchResultsBody");
  var kickSelect = document.getElementById("porchKickPlate");
  var kickHeightWrap = document.getElementById("porchKickPlateHeightWrap");
  var kickLfWrap = document.getElementById("porchKickPlateLfWrap");

  if (!loginPanel || !toolPanel || !calcForm) return;

  function money(n) {
    return "$" + Number(n).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function num(n, digits) {
    var d = digits == null ? 1 : digits;
    return Number(n).toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: d,
    });
  }

  function toFeet(ft, inches) {
    return (Number(ft) || 0) + (Number(inches) || 0) / 12;
  }

  function ceilSticks(linearFt) {
    if (linearFt <= 0) return 0;
    return Math.ceil(linearFt / STICK_FT);
  }

  function setKickVisibility() {
    var on = kickSelect && kickSelect.value === "yes";
    if (kickHeightWrap) kickHeightWrap.hidden = !on;
    if (kickLfWrap) kickLfWrap.hidden = !on;
  }

  function showLogin() {
    if (bootStatus) bootStatus.hidden = true;
    loginPanel.hidden = false;
    toolPanel.hidden = true;
    resultsEl.hidden = true;
  }

  function showTool(username) {
    if (bootStatus) bootStatus.hidden = true;
    loginPanel.hidden = true;
    toolPanel.hidden = false;
    if (userLabel) userLabel.textContent = "Signed in as " + username;
  }

  function row(label, value, opts) {
    var strong = opts && opts.strong;
    var dt = document.createElement("dt");
    dt.textContent = label;
    if (strong) dt.className = "is-strong";
    var dd = document.createElement("dd");
    dd.textContent = value;
    if (strong) dd.className = "is-strong";
    resultsBody.appendChild(dt);
    resultsBody.appendChild(dd);
  }

  function calculate(input) {
    var width = input.widthFt;
    var height = input.heightFt;
    var doors = Math.max(0, Math.floor(input.doors));
    var kickOn = input.kickPlate;
    var chairOn = input.chairRail;
    var kickLf = kickOn
      ? input.kickPlateLf != null && input.kickPlateLf > 0
        ? input.kickPlateLf
        : width
      : 0;

    var areaSqft = width * height;

    var track1x2Lf = width * 2 + height * 2;
    var track1x2Sticks = ceilSticks(track1x2Lf);
    var track1x2Cost = track1x2Sticks * PRICE_1X2_STICK;

    var door2x2Lf = doors * (height * 2 + DOOR_HEADER_FT);
    var kick2x2Lf = kickOn ? kickLf : 0;
    var chair2x2Lf = chairOn ? width : 0;
    var track2x2Lf = door2x2Lf + kick2x2Lf + chair2x2Lf;
    var track2x2Sticks = ceilSticks(track2x2Lf);
    var track2x2Cost = track2x2Sticks * PRICE_2X2_STICK;

    var doorCost = doors * PRICE_DOOR;
    var kickPlateCost = kickLf * PRICE_KICK_PLATE_PER_FT;
    var kickMoldingCost = kickLf * PRICE_KICK_MOLDING_PER_FT;

    var materialCost =
      track1x2Cost +
      track2x2Cost +
      doorCost +
      kickPlateCost +
      kickMoldingCost +
      PRICE_SCREWS +
      PRICE_OVERHEAD;

    var calculatedPrice = materialCost / MARKUP_DIVISOR;
    var workerPay = calculatedPrice * WORKER_RATE;
    var afterMaterialsAndLabor = calculatedPrice - materialCost - workerPay;

    return {
      width: width,
      height: height,
      areaSqft: areaSqft,
      doors: doors,
      kickOn: kickOn,
      kickLf: kickLf,
      kickHeightIn: input.kickPlateHeightIn,
      chairOn: chairOn,
      track1x2Lf: track1x2Lf,
      track1x2Sticks: track1x2Sticks,
      track1x2Cost: track1x2Cost,
      door2x2Lf: door2x2Lf,
      kick2x2Lf: kick2x2Lf,
      chair2x2Lf: chair2x2Lf,
      track2x2Lf: track2x2Lf,
      track2x2Sticks: track2x2Sticks,
      track2x2Cost: track2x2Cost,
      doorCost: doorCost,
      kickPlateCost: kickPlateCost,
      kickMoldingCost: kickMoldingCost,
      screws: PRICE_SCREWS,
      overhead: PRICE_OVERHEAD,
      materialCost: materialCost,
      calculatedPrice: calculatedPrice,
      workerPay: workerPay,
      afterMaterialsAndLabor: afterMaterialsAndLabor,
    };
  }

  function renderResults(r) {
    resultsBody.innerHTML = "";
    row("Opening", num(r.width, 2) + " ft W × " + num(r.height, 2) + " ft H");
    row("Area", num(r.areaSqft, 1) + " sqft");
    row(
      "1x2 track",
      num(r.track1x2Lf, 1) +
        " LF → " +
        r.track1x2Sticks +
        " stick(s) · " +
        money(r.track1x2Cost)
    );
    row(
      "2x2 track",
      num(r.track2x2Lf, 1) +
        " LF → " +
        r.track2x2Sticks +
        " stick(s) · " +
        money(r.track2x2Cost)
    );
    if (r.doors > 0 || r.kickOn || r.chairOn) {
      var parts = [];
      if (r.doors > 0) parts.push("door " + num(r.door2x2Lf, 1) + " LF");
      if (r.kickOn) parts.push("kick plate 2x2 " + num(r.kick2x2Lf, 1) + " LF");
      if (r.chairOn) parts.push("chair rail " + num(r.chair2x2Lf, 1) + " LF");
      row("2x2 detail", parts.join(" · "));
    }
    row("Door(s)", r.doors + " × " + money(PRICE_DOOR) + " = " + money(r.doorCost));
    row(
      "Kick plate",
      r.kickOn
        ? num(r.kickLf, 2) +
            " LF × $10" +
            (r.kickHeightIn ? " (height note: " + r.kickHeightIn + '")' : "") +
            " = " +
            money(r.kickPlateCost)
        : money(0)
    );
    row("Kick plate molding", r.kickOn ? num(r.kickLf, 2) + " LF × $1 = " + money(r.kickMoldingCost) : money(0));
    row("Screws & misc", money(r.screws));
    row("Overhead", money(r.overhead));
    row("Material cost", money(r.materialCost), { strong: true });
    row("Calculated price (÷ 0.70)", money(r.calculatedPrice), { strong: true });
    row("Worker pay (25%)", money(r.workerPay), { strong: true });
    row("Left after materials + labor", money(r.afterMaterialsAndLabor));
    resultsEl.hidden = false;
    resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function readForm() {
    var kickLfRaw = document.getElementById("porchKickPlateLf").value;
    var kickHRaw = document.getElementById("porchKickPlateHeight").value;
    return {
      widthFt: toFeet(
        document.getElementById("porchWidthFt").value,
        document.getElementById("porchWidthIn").value
      ),
      heightFt: toFeet(
        document.getElementById("porchHeightFt").value,
        document.getElementById("porchHeightIn").value
      ),
      doors: Number(document.getElementById("porchDoors").value) || 0,
      kickPlate: kickSelect.value === "yes",
      chairRail: document.getElementById("porchChairRail").value === "yes",
      kickPlateLf: kickLfRaw === "" ? null : Number(kickLfRaw),
      kickPlateHeightIn: kickHRaw === "" ? null : Number(kickHRaw),
    };
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
        showTool(data.username);
        return;
      }
    } catch (err) {
      /* fall through to login */
    }
    showLogin();
  }

  if (loginForm) {
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
        showTool(data.username);
      } catch (err) {
        if (loginStatus) {
          loginStatus.textContent = "Network error. Try again.";
        }
      } finally {
        if (loginBtn) loginBtn.disabled = false;
      }
    });
  }

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

  if (kickSelect) {
    kickSelect.addEventListener("change", setKickVisibility);
    setKickVisibility();
  }

  calcForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var input = readForm();
    if (input.widthFt <= 0 || input.heightFt <= 0) {
      resultsBody.innerHTML = "";
      row("Error", "Enter a valid width and height.");
      resultsEl.hidden = false;
      return;
    }
    renderResults(calculate(input));
  });

  calcForm.addEventListener("reset", function () {
    setTimeout(function () {
      setKickVisibility();
      resultsEl.hidden = true;
      resultsBody.innerHTML = "";
    }, 0);
  });

  checkSession();
})();
