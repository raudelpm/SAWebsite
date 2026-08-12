/**
 * Admin porch enclosure estimate tool — multi-section calculator + online saves.
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
  var sectionsEl = document.getElementById("porchSections");
  var sectionTemplate = document.getElementById("porchSectionTemplate");
  var addSectionBtn = document.getElementById("porchAddSectionBtn");
  var resultsEl = document.getElementById("porchResults");
  var resultsBody = document.getElementById("porchResultsBody");
  var estimateIdInput = document.getElementById("porchEstimateId");
  var titleInput = document.getElementById("porchEstimateTitle");
  var projectTypeInput = document.getElementById("porchProjectType");
  var notesInput = document.getElementById("porchNotes");
  var screenCostInput = document.getElementById("porchScreenCost");
  var saveBtn = document.getElementById("porchSaveBtn");
  var deleteBtn = document.getElementById("porchDeleteBtn");
  var newBtn = document.getElementById("porchNewEstimateBtn");
  var saveStatus = document.getElementById("porchSaveStatus");
  var savedList = document.getElementById("porchSavedList");
  var savedEmpty = document.getElementById("porchSavedEmpty");
  var storageModeEl = document.getElementById("porchStorageMode");

  var lastTotals = null;

  if (!loginPanel || !toolPanel || !calcForm || !sectionsEl || !sectionTemplate) return;

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

  function roundLf(n) {
    return Math.round(Number(n) * 1000) / 1000;
  }

  /**
   * First Fit Decreasing cutting-stock for continuous (non-spliced) members.
   * Each required cut must fit fully on one 24 ft stick.
   */
  function packCuts(cuts, stickLength) {
    var stock = stickLength == null ? STICK_FT : stickLength;
    var cleaned = (cuts || [])
      .map(function (c) {
        return roundLf(c);
      })
      .filter(function (c) {
        return c > 0;
      });

    var oversized = cleaned.filter(function (c) {
      return c > stock;
    });
    var packable = cleaned.filter(function (c) {
      return c <= stock;
    });

    packable.sort(function (a, b) {
      return b - a;
    });

    var bins = [];
    packable.forEach(function (cut) {
      var placed = false;
      for (var i = 0; i < bins.length; i++) {
        if (roundLf(bins[i].remaining - cut) >= -0.0001) {
          bins[i].cuts.push(cut);
          bins[i].used = roundLf(bins[i].used + cut);
          bins[i].remaining = roundLf(stock - bins[i].used);
          placed = true;
          break;
        }
      }
      if (!placed) {
        bins.push({
          cuts: [cut],
          used: cut,
          remaining: roundLf(stock - cut),
        });
      }
    });

    var totalLf = cleaned.reduce(function (sum, c) {
      return sum + c;
    }, 0);

    return {
      cuts: cleaned,
      sticks: bins,
      stickCount: bins.length,
      totalLf: roundLf(totalLf),
      wasteLf: roundLf(bins.reduce(function (sum, b) {
        return sum + b.remaining;
      }, 0)),
      oversized: oversized,
      exceedsStock: oversized.length > 0,
    };
  }

  function showLogin() {
    if (bootStatus) bootStatus.hidden = true;
    loginPanel.hidden = false;
    toolPanel.hidden = true;
    if (resultsEl) resultsEl.hidden = true;
  }

  function showTool(username) {
    if (bootStatus) bootStatus.hidden = true;
    loginPanel.hidden = true;
    toolPanel.hidden = false;
    if (userLabel) userLabel.textContent = "Signed in as " + username;
    if (!sectionsEl.querySelector("[data-section]")) {
      addSection({
        widthFt: 12,
        widthIn: 10,
        heightFt: 8,
        heightIn: 5,
        door: true,
        kickPlate: false,
        chairRail: false,
      });
    }
    refreshSavedList();
  }

  function renumberSections() {
    var cards = sectionsEl.querySelectorAll("[data-section]");
    cards.forEach(function (card, i) {
      var title = card.querySelector(".admin-porch-section-title");
      if (title) title.textContent = "Section " + (i + 1);
      var del = card.querySelector('[data-action="delete"]');
      if (del) del.disabled = cards.length <= 1;
    });
  }

  function setSectionValues(card, data) {
    var d = data || {};
    var map = {
      widthFt: d.widthFt != null ? d.widthFt : 12,
      widthIn: d.widthIn != null ? d.widthIn : 0,
      heightFt: d.heightFt != null ? d.heightFt : 8,
      heightIn: d.heightIn != null ? d.heightIn : 0,
      door: d.door ? "yes" : "no",
      kickPlate: d.kickPlate ? "yes" : "no",
      chairRail: d.chairRail ? "yes" : "no",
    };
    Object.keys(map).forEach(function (key) {
      var el = card.querySelector('[data-field="' + key + '"]');
      if (el) el.value = map[key];
    });
  }

  function readSectionCard(card) {
    function val(field) {
      var el = card.querySelector('[data-field="' + field + '"]');
      return el ? el.value : "";
    }
    return {
      widthFt: Number(val("widthFt")) || 0,
      widthIn: Number(val("widthIn")) || 0,
      heightFt: Number(val("heightFt")) || 0,
      heightIn: Number(val("heightIn")) || 0,
      door: val("door") === "yes",
      kickPlate: val("kickPlate") === "yes",
      chairRail: val("chairRail") === "yes",
    };
  }

  function addSection(data, afterCard) {
    var node = sectionTemplate.content.firstElementChild.cloneNode(true);
    setSectionValues(node, data);
    if (afterCard && afterCard.parentNode === sectionsEl) {
      afterCard.insertAdjacentElement("afterend", node);
    } else {
      sectionsEl.appendChild(node);
    }
    renumberSections();
    return node;
  }

  function clearSections() {
    sectionsEl.innerHTML = "";
  }

  function readSections() {
    return Array.prototype.map.call(
      sectionsEl.querySelectorAll("[data-section]"),
      readSectionCard
    );
  }

  function readScreenCost() {
    var raw = screenCostInput ? screenCostInput.value : "0";
    if (raw === "" || raw == null) return 0;
    var n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n * 100) / 100;
  }

  function setScreenCost(value) {
    if (!screenCostInput) return;
    var n = Number(value);
    if (!Number.isFinite(n) || n < 0) n = 0;
    screenCostInput.value = String(Math.round(n * 100) / 100);
  }

  function calculateProject(sectionsInput, screenCostInputValue) {
    var sectionResults = [];
    var cuts1x2 = [];
    var cuts2x2 = [];
    var totalArea = 0;
    var doorCount = 0;
    var kickPlateLf = 0;
    var screenCost = Math.max(0, Number(screenCostInputValue) || 0);
    screenCost = Math.round(screenCost * 100) / 100;

    sectionsInput.forEach(function (s, index) {
      var width = roundLf(toFeet(s.widthFt, s.widthIn));
      var height = roundLf(toFeet(s.heightFt, s.heightIn));
      var areaSqft = roundLf(width * height);

      // Perimeter 1x2: each side is one continuous member (no splicing).
      var section1x2Cuts = [width, width, height, height];
      var section2x2Cuts = [];
      var door2x2Cuts = [];
      var kick2x2Cuts = [];
      var chair2x2Cuts = [];

      if (s.door) {
        door2x2Cuts = [height, height, DOOR_HEADER_FT];
        doorCount += 1;
      }
      if (s.kickPlate) {
        kick2x2Cuts = [width];
        kickPlateLf += width;
      }
      if (s.chairRail) {
        chair2x2Cuts = [width];
      }

      section2x2Cuts = door2x2Cuts.concat(kick2x2Cuts, chair2x2Cuts);

      cuts1x2 = cuts1x2.concat(section1x2Cuts);
      cuts2x2 = cuts2x2.concat(section2x2Cuts);
      totalArea += areaSqft;

      var track1x2Lf = roundLf(
        section1x2Cuts.reduce(function (sum, c) {
          return sum + c;
        }, 0)
      );
      var door2x2Lf = roundLf(
        door2x2Cuts.reduce(function (sum, c) {
          return sum + c;
        }, 0)
      );
      var kick2x2Lf = roundLf(
        kick2x2Cuts.reduce(function (sum, c) {
          return sum + c;
        }, 0)
      );
      var chair2x2Lf = roundLf(
        chair2x2Cuts.reduce(function (sum, c) {
          return sum + c;
        }, 0)
      );

      sectionResults.push({
        index: index + 1,
        width: width,
        height: height,
        areaSqft: areaSqft,
        door: s.door,
        kickPlate: s.kickPlate,
        chairRail: s.chairRail,
        cuts1x2: section1x2Cuts,
        cuts2x2: section2x2Cuts,
        track1x2Lf: track1x2Lf,
        door2x2Lf: door2x2Lf,
        kick2x2Lf: kick2x2Lf,
        chair2x2Lf: chair2x2Lf,
        track2x2Lf: roundLf(door2x2Lf + kick2x2Lf + chair2x2Lf),
      });
    });

    var pack1x2 = packCuts(cuts1x2, STICK_FT);
    var pack2x2 = packCuts(cuts2x2, STICK_FT);
    var track1x2Sticks = pack1x2.stickCount;
    var track1x2Cost = track1x2Sticks * PRICE_1X2_STICK;
    var track2x2Sticks = pack2x2.stickCount;
    var track2x2Cost = track2x2Sticks * PRICE_2X2_STICK;
    var doorCost = doorCount * PRICE_DOOR;
    var kickPlateCost = kickPlateLf * PRICE_KICK_PLATE_PER_FT;
    var kickMoldingCost = kickPlateLf * PRICE_KICK_MOLDING_PER_FT;

    var materialCost =
      track1x2Cost +
      track2x2Cost +
      doorCost +
      kickPlateCost +
      kickMoldingCost +
      PRICE_SCREWS +
      PRICE_OVERHEAD +
      screenCost;

    // Labor is added BEFORE markup: (Material + Worker Pay) / 0.70
    var workerPay = materialCost * WORKER_RATE;
    var costPlusLabor = materialCost + workerPay;
    var calculatedPrice = costPlusLabor / MARKUP_DIVISOR;

    return {
      sections: sectionResults,
      areaSqft: roundLf(totalArea),
      cuts1x2: pack1x2.cuts,
      cuts2x2: pack2x2.cuts,
      pack1x2: pack1x2,
      pack2x2: pack2x2,
      track1x2Lf: pack1x2.totalLf,
      track1x2Sticks: track1x2Sticks,
      track1x2Cost: track1x2Cost,
      track2x2Lf: pack2x2.totalLf,
      track2x2Sticks: track2x2Sticks,
      track2x2Cost: track2x2Cost,
      doorCount: doorCount,
      doorCost: doorCost,
      kickPlateLf: roundLf(kickPlateLf),
      kickPlateCost: kickPlateCost,
      kickMoldingCost: kickMoldingCost,
      screws: PRICE_SCREWS,
      overhead: PRICE_OVERHEAD,
      screenCost: screenCost,
      materialCost: materialCost,
      workerPay: workerPay,
      costPlusLabor: costPlusLabor,
      calculatedPrice: calculatedPrice,
      hasOversizedCuts: pack1x2.exceedsStock || pack2x2.exceedsStock,
    };
  }

  function formatCutList(cuts) {
    return (cuts || [])
      .map(function (c) {
        return num(c, 2) + " ft";
      })
      .join(" + ");
  }

  function appendCutPlan(parent, title, pack, unitPrice) {
    var wrap = document.createElement("div");
    wrap.className = "admin-porch-cutplan";

    var h = document.createElement("h4");
    h.className = "admin-porch-cutplan__title";
    h.textContent = title;
    wrap.appendChild(h);

    if (pack.exceedsStock) {
      var warn = document.createElement("p");
      warn.className = "admin-porch-cutplan__warn";
      warn.textContent =
        "Required continuous piece exceeds 24 ft stock length: " +
        pack.oversized
          .map(function (c) {
            return num(c, 2) + " ft";
          })
          .join(", ") +
        ".";
      wrap.appendChild(warn);
    }

    if (!pack.cuts.length) {
      var empty = document.createElement("p");
      empty.className = "admin-porch-hint";
      empty.textContent = "No cuts required.";
      wrap.appendChild(empty);
      parent.appendChild(wrap);
      return;
    }

    var required = document.createElement("p");
    required.className = "admin-porch-cutplan__required";
    required.textContent =
      "Required cuts: " +
      pack.cuts
        .map(function (c) {
          return num(c, 2);
        })
        .join(", ") +
      " ft";
    wrap.appendChild(required);

    pack.sticks.forEach(function (stick, i) {
      var item = document.createElement("div");
      item.className = "admin-porch-cutplan__stick";
      item.innerHTML =
        "<strong>Stick " +
        (i + 1) +
        ":</strong> " +
        formatCutList(stick.cuts) +
        "<br>Used: " +
        num(stick.used, 2) +
        " ft · Waste: " +
        num(stick.remaining, 2) +
        " ft";
      wrap.appendChild(item);
    });

    var summary = document.createElement("p");
    summary.className = "admin-porch-cutplan__summary";
    summary.textContent =
      pack.stickCount +
      " stick(s) × " +
      money(unitPrice) +
      " = " +
      money(pack.stickCount * unitPrice) +
      " · Total LF " +
      num(pack.totalLf, 2) +
      " · Waste " +
      num(pack.wasteLf, 2) +
      " ft";
    wrap.appendChild(summary);
    parent.appendChild(wrap);
  }

  function renderResults(r) {
    resultsBody.innerHTML = "";

    if (r.hasOversizedCuts) {
      var banner = document.createElement("p");
      banner.className = "admin-porch-cutplan__warn admin-porch-cutplan__warn--banner";
      banner.textContent =
        "Required continuous piece exceeds 24 ft stock length. Review cut plan below — pieces were not spliced.";
      resultsBody.appendChild(banner);
    }

    r.sections.forEach(function (s) {
      var block = document.createElement("section");
      block.className = "admin-porch-section-result";
      var h = document.createElement("h3");
      h.textContent = "SECTION " + s.index;
      block.appendChild(h);
      var dl = document.createElement("dl");
      dl.className = "admin-porch-dl";
      function add(label, value) {
        var dt = document.createElement("dt");
        dt.textContent = label;
        var dd = document.createElement("dd");
        dd.textContent = value;
        dl.appendChild(dt);
        dl.appendChild(dd);
      }
      add("Opening", num(s.width, 2) + " ft W × " + num(s.height, 2) + " ft H");
      add("Area", num(s.areaSqft, 1) + " sqft");
      add("1x2 cuts", formatCutList(s.cuts1x2) + " (" + num(s.track1x2Lf, 1) + " LF)");
      if (s.door) add("Door 2x2 cuts", formatCutList([s.height, s.height, DOOR_HEADER_FT]));
      if (s.kickPlate) add("Kick plate 2x2 cut", formatCutList([s.width]));
      if (s.chairRail) add("Chair rail 2x2 cut", formatCutList([s.width]));
      if (!s.door && !s.kickPlate && !s.chairRail) add("2x2 cuts", "none");
      block.appendChild(dl);
      resultsBody.appendChild(block);
    });

    var total = document.createElement("section");
    total.className = "admin-porch-section-result admin-porch-section-result--total";
    var th = document.createElement("h3");
    th.textContent = "PROJECT TOTAL";
    total.appendChild(th);

    appendCutPlan(total, "1x2 CUT PLAN", r.pack1x2, PRICE_1X2_STICK);
    appendCutPlan(total, "2x2 CUT PLAN", r.pack2x2, PRICE_2X2_STICK);

    var tdl = document.createElement("dl");
    tdl.className = "admin-porch-dl";
    function trow(label, value, strong) {
      var dt = document.createElement("dt");
      dt.textContent = label;
      if (strong) dt.className = "is-strong";
      var dd = document.createElement("dd");
      dd.textContent = value;
      if (strong) dd.className = "is-strong";
      tdl.appendChild(dt);
      tdl.appendChild(dd);
    }
    trow("Total area", num(r.areaSqft, 1) + " sqft");
    trow(
      "1x2 track",
      num(r.track1x2Lf, 1) +
        " LF · " +
        r.track1x2Sticks +
        " stick(s) · " +
        money(r.track1x2Cost) +
        " (no splicing)"
    );
    trow(
      "2x2 track",
      num(r.track2x2Lf, 1) +
        " LF · " +
        r.track2x2Sticks +
        " stick(s) · " +
        money(r.track2x2Cost) +
        " (no splicing)"
    );
    trow("Doors", r.doorCount + " · " + money(r.doorCost));
    trow(
      "Kick plate",
      r.kickPlateLf > 0
        ? num(r.kickPlateLf, 2) + " LF × $10 = " + money(r.kickPlateCost)
        : money(0)
    );
    trow(
      "Kick plate molding",
      r.kickPlateLf > 0
        ? num(r.kickPlateLf, 2) + " LF × $1 = " + money(r.kickMoldingCost)
        : money(0)
    );
    trow("Screws & misc", money(r.screws));
    trow("Overhead", money(r.overhead));
    trow("Screen cost", money(r.screenCost || 0));
    trow("Material cost", money(r.materialCost), true);
    trow("Worker pay (25%)", money(r.workerPay), true);
    trow("Cost + labor", money(r.costPlusLabor), true);
    trow("Calculated price (÷ 0.70)", money(r.calculatedPrice), true);
    total.appendChild(tdl);
    resultsBody.appendChild(total);

    resultsEl.hidden = false;
    resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function setSaveStatus(msg, isError) {
    if (!saveStatus) return;
    saveStatus.textContent = msg || "";
    saveStatus.classList.toggle("is-error", Boolean(isError));
  }

  function syncDeleteVisibility() {
    if (deleteBtn) deleteBtn.hidden = !estimateIdInput.value;
  }

  function resetEstimateForm() {
    estimateIdInput.value = "";
    titleInput.value = "";
    projectTypeInput.value = "front";
    notesInput.value = "";
    setScreenCost(0);
    clearSections();
    addSection({
      widthFt: 12,
      widthIn: 10,
      heightFt: 8,
      heightIn: 5,
      door: true,
      kickPlate: false,
      chairRail: false,
    });
    lastTotals = null;
    resultsEl.hidden = true;
    resultsBody.innerHTML = "";
    setSaveStatus("");
    syncDeleteVisibility();
  }

  function loadEstimateIntoForm(estimate) {
    estimateIdInput.value = estimate.id || "";
    titleInput.value = estimate.title || "";
    projectTypeInput.value = estimate.projectType === "back" ? "back" : "front";
    notesInput.value = estimate.notes || "";
    // Preserve the originally saved screen cost — do not invent a new one.
    var savedScreen =
      estimate.screenCost != null
        ? estimate.screenCost
        : estimate.totals && estimate.totals.screenCost != null
          ? estimate.totals.screenCost
          : 0;
    setScreenCost(savedScreen);
    clearSections();
    var sections = Array.isArray(estimate.sections) ? estimate.sections : [];
    if (!sections.length) {
      addSection();
    } else {
      sections.forEach(function (s) {
        addSection(s);
      });
    }
    // Recalculate with the restored screen cost so cut plans stay current,
    // without changing the saved Screen Cost value itself.
    lastTotals = calculateProject(readSections(), readScreenCost());
    renderResults(lastTotals);
    setSaveStatus("Loaded “" + (estimate.title || estimate.id) + "”");
    syncDeleteVisibility();
  }

  function buildPayload() {
    var sections = readSections();
    var screenCost = readScreenCost();
    var totals = calculateProject(sections, screenCost);
    lastTotals = totals;
    return {
      title: titleInput.value.trim(),
      projectType: projectTypeInput.value,
      notes: notesInput.value.trim(),
      screenCost: screenCost,
      sections: sections,
      totals: {
        areaSqft: totals.areaSqft,
        cuts1x2: totals.cuts1x2,
        cuts2x2: totals.cuts2x2,
        pack1x2: totals.pack1x2,
        pack2x2: totals.pack2x2,
        track1x2Lf: totals.track1x2Lf,
        track1x2Sticks: totals.track1x2Sticks,
        track1x2Cost: totals.track1x2Cost,
        track2x2Lf: totals.track2x2Lf,
        track2x2Sticks: totals.track2x2Sticks,
        track2x2Cost: totals.track2x2Cost,
        doorCount: totals.doorCount,
        doorCost: totals.doorCost,
        kickPlateLf: totals.kickPlateLf,
        kickPlateCost: totals.kickPlateCost,
        kickMoldingCost: totals.kickMoldingCost,
        screws: totals.screws,
        overhead: totals.overhead,
        screenCost: totals.screenCost,
        materialCost: totals.materialCost,
        workerPay: totals.workerPay,
        costPlusLabor: totals.costPlusLabor,
        calculatedPrice: totals.calculatedPrice,
        hasOversizedCuts: totals.hasOversizedCuts,
        sections: totals.sections,
      },
    };
  }

  async function refreshSavedList() {
    if (!savedList) return;
    try {
      var res = await fetch("/api/admin/estimates", {
        method: "GET",
        credentials: "same-origin",
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data.ok) {
        if (storageModeEl) {
          storageModeEl.textContent = data.error || "Could not load saved estimates.";
        }
        return;
      }
      if (storageModeEl) {
        storageModeEl.textContent =
          data.storage === "blob"
            ? "Online database connected (private Blob store)"
            : "Dev file store (.data) — set BLOB_READ_WRITE_TOKEN for production database";
      }
      savedList.innerHTML = "";
      var items = Array.isArray(data.estimates) ? data.estimates : [];
      if (savedEmpty) savedEmpty.hidden = items.length > 0;
      items.forEach(function (item) {
        var li = document.createElement("li");
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "admin-porch-saved-item";
        if (item.id === estimateIdInput.value) btn.classList.add("is-active");
        var price =
          item.totals && item.totals.calculatedPrice != null
            ? money(item.totals.calculatedPrice)
            : "";
        btn.innerHTML =
          "<span class=\"admin-porch-saved-item__title\"></span>" +
          "<span class=\"admin-porch-saved-item__meta\"></span>";
        btn.querySelector(".admin-porch-saved-item__title").textContent = item.title || item.id;
        btn.querySelector(".admin-porch-saved-item__meta").textContent =
          (item.projectType === "back" ? "Back" : "Front") +
          " · " +
          (item.sectionCount || 0) +
          " section(s)" +
          (price ? " · " + price : "");
        btn.addEventListener("click", function () {
          openEstimate(item.id);
        });
        li.appendChild(btn);
        savedList.appendChild(li);
      });
    } catch (err) {
      if (storageModeEl) storageModeEl.textContent = "Could not reach estimate database.";
    }
  }

  async function openEstimate(id) {
    setSaveStatus("Loading…");
    try {
      var res = await fetch("/api/admin/estimates?id=" + encodeURIComponent(id), {
        method: "GET",
        credentials: "same-origin",
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data.ok) {
        setSaveStatus(data.error || "Could not open estimate.", true);
        return;
      }
      loadEstimateIntoForm(data.estimate);
      refreshSavedList();
    } catch (err) {
      setSaveStatus("Network error loading estimate.", true);
    }
  }

  async function saveEstimate() {
    var payload = buildPayload();
    var invalid = payload.sections.some(function (s) {
      return toFeet(s.widthFt, s.widthIn) <= 0 || toFeet(s.heightFt, s.heightIn) <= 0;
    });
    if (invalid) {
      setSaveStatus("Each section needs a valid width and height.", true);
      return;
    }
    renderResults(lastTotals);
    setSaveStatus("Saving…");
    saveBtn.disabled = true;
    try {
      var id = estimateIdInput.value;
      var res = await fetch(
        id ? "/api/admin/estimates?id=" + encodeURIComponent(id) : "/api/admin/estimates",
        {
          method: id ? "PUT" : "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data.ok) {
        setSaveStatus(data.error || "Save failed.", true);
        return;
      }
      estimateIdInput.value = data.estimate.id;
      if (!titleInput.value.trim() && data.estimate.title) {
        titleInput.value = data.estimate.title;
      }
      setSaveStatus("Saved “" + data.estimate.title + "”");
      syncDeleteVisibility();
      refreshSavedList();
    } catch (err) {
      setSaveStatus("Network error while saving.", true);
    } finally {
      saveBtn.disabled = false;
    }
  }

  async function deleteCurrentEstimate() {
    var id = estimateIdInput.value;
    if (!id) return;
    if (!window.confirm("Delete this saved estimate?")) return;
    setSaveStatus("Deleting…");
    try {
      var res = await fetch("/api/admin/estimates?id=" + encodeURIComponent(id), {
        method: "DELETE",
        credentials: "same-origin",
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data.ok) {
        setSaveStatus(data.error || "Delete failed.", true);
        return;
      }
      resetEstimateForm();
      setSaveStatus("Estimate deleted.");
      refreshSavedList();
    } catch (err) {
      setSaveStatus("Network error while deleting.", true);
    }
  }

  sectionsEl.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-action]");
    if (!btn) return;
    var card = btn.closest("[data-section]");
    if (!card) return;
    var action = btn.getAttribute("data-action");
    if (action === "delete") {
      if (sectionsEl.querySelectorAll("[data-section]").length <= 1) return;
      card.remove();
      renumberSections();
    } else if (action === "duplicate") {
      addSection(readSectionCard(card), card);
    }
  });

  if (addSectionBtn) {
    addSectionBtn.addEventListener("click", function () {
      addSection();
    });
  }

  if (newBtn) {
    newBtn.addEventListener("click", function () {
      resetEstimateForm();
      refreshSavedList();
    });
  }

  if (saveBtn) saveBtn.addEventListener("click", function () {
    saveEstimate();
  });
  if (deleteBtn) deleteBtn.addEventListener("click", deleteCurrentEstimate);

  calcForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var sections = readSections();
    var invalid = sections.some(function (s) {
      return toFeet(s.widthFt, s.widthIn) <= 0 || toFeet(s.heightFt, s.heightIn) <= 0;
    });
    if (!sections.length || invalid) {
      resultsBody.innerHTML = "<p class=\"admin-porch-hint\">Enter valid width and height for every section.</p>";
      resultsEl.hidden = false;
      return;
    }
    lastTotals = calculateProject(sections, readScreenCost());
    renderResults(lastTotals);
    setSaveStatus("");
  });

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
      /* fall through */
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
        if (loginStatus) loginStatus.textContent = "Network error. Try again.";
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

  checkSession();
})();
