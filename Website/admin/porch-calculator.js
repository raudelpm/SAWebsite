/**
 * Admin porch enclosure estimate tool — multi-section calculator + online saves.
 */
(function () {
  var PRICE_1X2_STICK = 37;
  var PRICE_2X2_STICK = 60;
  var PRICE_1X1_STICK = 28;
  var PRICE_FLEX_STICK = 30;
  var STICK_FT = 24;
  var STICK_FLEX_FT = 20;
  var PRICE_DOOR = 150;
  var PRICE_KICK_PLATE_PER_FT = 10;
  var PRICE_KICK_MOLDING_PER_FT = 1;
  var PRICE_SCREWS = 100;
  var PRICE_OVERHEAD = 300;
  var MARKUP_DIVISOR = 0.7;
  // Calibrated so $860 materials → $400 total labor (2×$200) → $1,800 final (labor included).
  // Total Worker Pay = Material Cost × (20/43)
  var WORKER_RATE = 20 / 43;
  var DOOR_WIDTH_FT = 3; // 36"
  var DOOR_OPENING_HEIGHT_FT = 80 / 12; // 80"
  var DOOR_HEADER_FT = 3; // 36" header above door opening
  var KICK_PLATE_HEIGHT_FT = 16 / 12;
  var CHAIR_RAIL_HEIGHT_FT = 36 / 12;
  var MIN_KICK_SEGMENT_FT = 0.05;

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
  var screenTypeInput = document.getElementById("porchScreenType");
  var screenTypeHint = document.getElementById("porchScreenTypeHint");
  var saveBtn = document.getElementById("porchSaveBtn");
  var saveAsBtn = document.getElementById("porchSaveAsBtn");
  var deleteBtn = document.getElementById("porchDeleteBtn");
  var newBtn = document.getElementById("porchNewEstimateBtn");
  var saveStatus = document.getElementById("porchSaveStatus");
  var dirtyStatus = document.getElementById("porchDirtyStatus");
  var savedList = document.getElementById("porchSavedList");
  var savedEmpty = document.getElementById("porchSavedEmpty");
  var storageModeEl = document.getElementById("porchStorageMode");
  var layoutPanel = document.getElementById("porchLayoutPanel");
  var layoutHeader = document.getElementById("porchLayoutHeader");
  var layoutDrawings = document.getElementById("porchLayoutDrawings");
  var layoutSheet = document.getElementById("porchLayoutSheet");
  var printLayoutBtn = document.getElementById("porchPrintLayoutBtn");
  var downloadLayoutBtn = document.getElementById("porchDownloadLayoutBtn");
  var downloadMaterialBtn = document.getElementById("porchDownloadMaterialBtn");

  var lastTotals = null;
  var layoutTimer = null;
  var lastSavedSnapshot = "";
  var applyingSaved = false;
  var dirtyTimer = null;
  var SECTION_EXTRA_KEYS = [
    "kickPlateHeightIn",
    "chairRailMember",
    "chairRailHeightIn",
    "doorLeftPost",
    "doorRightPost",
    "doorFrame",
    "doorHeader",
    "doorHeaderInsert",
  ];

  var PorchScreenApi =
    typeof window !== "undefined" && window.PorchScreen ? window.PorchScreen : null;
  var DEFAULT_SCREEN_TYPE =
    (PorchScreenApi && PorchScreenApi.DEFAULT_SCREEN_TYPE) || "18/14";

  function normalizeScreenType(value) {
    if (PorchScreenApi && typeof PorchScreenApi.normalizeScreenType === "function") {
      return PorchScreenApi.normalizeScreenType(value);
    }
    return value ? String(value).trim() || DEFAULT_SCREEN_TYPE : DEFAULT_SCREEN_TYPE;
  }

  function getScreenTypeConfig(type) {
    if (PorchScreenApi && typeof PorchScreenApi.getScreenTypeConfig === "function") {
      return PorchScreenApi.getScreenTypeConfig(type);
    }
    return { id: DEFAULT_SCREEN_TYPE, label: DEFAULT_SCREEN_TYPE, pricePerSqFt: 0.2 };
  }

  function calculateScreenMaterialFromMetrics(sectionMetrics, screenType) {
    if (PorchScreenApi && typeof PorchScreenApi.calculateScreenMaterial === "function") {
      return PorchScreenApi.calculateScreenMaterial(sectionMetrics, screenType);
    }
    return {
      screenType: normalizeScreenType(screenType),
      screenTypeLabel: normalizeScreenType(screenType),
      pricePerSqFt: 0.2,
      grossSqFt: 0,
      doorSqFt: 0,
      kickPlateSqFt: 0,
      deductionsSqFt: 0,
      netSqFt: 0,
      materialCost: 0,
    };
  }

  function readScreenType() {
    return normalizeScreenType(screenTypeInput ? screenTypeInput.value : DEFAULT_SCREEN_TYPE);
  }

  function setScreenType(value) {
    if (!screenTypeInput) return;
    screenTypeInput.value = normalizeScreenType(value);
    updateScreenTypeHint();
  }

  function updateScreenTypeHint() {
    if (!screenTypeHint) return;
    var cfg = getScreenTypeConfig(readScreenType());
    screenTypeHint.textContent =
      "$" +
      Number(cfg.pricePerSqFt).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) +
      " / sqft";
  }

  if (!loginPanel || !toolPanel || !calcForm || !sectionsEl || !sectionTemplate) return;

  updateScreenTypeHint();

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

  function formatFtInParts(ft, inches) {
    var f = Math.max(0, Math.floor(Number(ft) || 0));
    var inch = Number(inches) || 0;
    if (inch < 0) inch = 0;
    if (inch >= 12) {
      f += Math.floor(inch / 12);
      inch = inch % 12;
    }
    inch = Math.round(inch * 100) / 100;
    if (inch === 0) return f + "'";
    var inchStr = Number.isInteger(inch) ? String(inch) : String(inch);
    return f + "' " + inchStr + '"';
  }

  function formatFtInDecimal(totalFeet) {
    var totalIn = Math.round((Number(totalFeet) || 0) * 12 * 100) / 100;
    var f = Math.floor(totalIn / 12);
    var inch = Math.round((totalIn - f * 12) * 100) / 100;
    return formatFtInParts(f, inch);
  }

  function escapeXml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizeDoorPosition(pos) {
    var p = String(pos || "")
      .trim()
      .toLowerCase();
    if (p === "middle") return "center";
    if (p === "left" || p === "center" || p === "right") return p;
    return "";
  }

  var MEMBER_NONE = "none";
  var MEMBER_DEFAULT = "1x2";

  function normalizeMember(value) {
    var v = String(value == null ? "" : value)
      .trim()
      .toLowerCase();
    if (v === "1x2" || v === "2x2" || v === MEMBER_NONE) return v;
    return MEMBER_DEFAULT;
  }

  function memberFromData(data, key) {
    if (data && data[key] != null && String(data[key]).trim() !== "") {
      return normalizeMember(data[key]);
    }
    return MEMBER_DEFAULT;
  }

  var MEMBER_FLEX = "1x1/2";

  function memberStrokeWidth(size) {
    if (size === "2x2") return 4.8;
    if (size === "1x2") return 2.6;
    if (size === "1x1") return 1.5;
    if (size === MEMBER_FLEX || size === "flex") return 2.2;
    return 0;
  }

  function formatMemberShort(size) {
    return !size || size === MEMBER_NONE ? "—" : size;
  }

  function formatMemberSummary(section) {
    var base =
      "L " +
      formatMemberShort(normalizeMember(section.leftMember)) +
      " · R " +
      formatMemberShort(normalizeMember(section.rightMember));
    if (isArchSection(section)) {
      if (isStraightAngle2x2(section)) base += " · Arch base 2x2";
      base += " · Arch 1x1/2 Flexible";
    } else {
      base += " · T " + formatMemberShort(normalizeMember(section.topMember));
    }
    base += " · B " + formatMemberShort(normalizeMember(section.bottomMember));
    return base;
  }

  var MEMBER_ZBAR = "z-bar";
  var MEMBER_2X2_ZBAR = "2x2+z-bar";
  var DOOR_LEFT_POST_DEFAULT = "2x2";
  var DOOR_RIGHT_POST_DEFAULT = "2x2";
  var DOOR_FRAME_DEFAULT = MEMBER_ZBAR;
  var DOOR_HEADER_DEFAULT = "2x2";
  var DOOR_HEADER_INSERT_DEFAULT = MEMBER_ZBAR;
  var CHAIR_RAIL_MEMBER_DEFAULT = "2x2";

  function getKickPlateHeightIn(section) {
    var custom = Number(section && section.kickPlateHeightIn);
    if (Number.isFinite(custom) && custom > 0) return custom;
    return Math.round(KICK_PLATE_HEIGHT_FT * 12 * 100) / 100;
  }

  function getKickPlateHeightFt(section) {
    return roundLf(getKickPlateHeightIn(section) / 12);
  }

  function getChairRailMember(section) {
    if (section && section.chairRailMember) return normalizeMember(section.chairRailMember);
    return CHAIR_RAIL_MEMBER_DEFAULT;
  }

  function getDoorConstruction(section) {
    var s = section || {};
    return {
      leftPost: s.doorLeftPost ? normalizeMember(s.doorLeftPost) : DOOR_LEFT_POST_DEFAULT,
      rightPost: s.doorRightPost ? normalizeMember(s.doorRightPost) : DOOR_RIGHT_POST_DEFAULT,
      frame: s.doorFrame ? String(s.doorFrame).toLowerCase() : DOOR_FRAME_DEFAULT,
      header: s.doorHeader ? normalizeMember(s.doorHeader) : DOOR_HEADER_DEFAULT,
      headerInsert: s.doorHeaderInsert
        ? String(s.doorHeaderInsert).toLowerCase()
        : DOOR_HEADER_INSERT_DEFAULT,
    };
  }

  function openingTouchesLeft(openings) {
    return (openings || []).some(function (op) {
      return roundLf(op.left) <= 0.05;
    });
  }

  function openingTouchesRight(openings, widthFt) {
    var w = roundLf(widthFt);
    return (openings || []).some(function (op) {
      return roundLf(w - op.right) <= 0.05;
    });
  }

  function getEffectiveLeftMember(section, widthFt) {
    var openings = getDoorOpenings(section, widthFt);
    if (section && section.door && openingTouchesLeft(openings)) {
      return getDoorConstruction(section).leftPost;
    }
    return normalizeMember(section && section.leftMember);
  }

  function getEffectiveRightMember(section, widthFt) {
    var openings = getDoorOpenings(section, widthFt);
    if (section && section.door && openingTouchesRight(openings, widthFt)) {
      return getDoorConstruction(section).rightPost;
    }
    return normalizeMember(section && section.rightMember);
  }

  function formatMemberLabel(type, compact) {
    var t = String(type || "")
      .trim()
      .toLowerCase();
    if (!t || t === MEMBER_NONE) return "";
    if (t === "z-bar" || t === "zbar") return compact ? "ZB" : "Z-BAR";
    if (t === "z-bar-door" || t === "z-bar-frame") return compact ? "Z-BAR" : "Z-BAR DOOR FRAME";
    if (t === "2x2+z-bar" || t === "2x2+zbar") return compact ? "2x2+ZB" : "2x2 + Z-BAR";
    if (t === "1x1/2" || t === "1x1/2 flexible" || t === "flex") {
      return compact ? "FLEX" : "1x1/2 FLEXIBLE";
    }
    if (t === "1x2" || t === "2x2") return t;
    return t.toUpperCase();
  }

  function formatKickPlateLabel(section, compact) {
    var inches = getKickPlateHeightIn(section);
    var inchStr = Number.isInteger(inches) ? String(inches) : String(inches);
    return compact ? 'KP ' + inchStr + '"' : 'KICK PLATE — ' + inchStr + '"';
  }

  function formatChairRailLabel(section, compact) {
    var member = getChairRailMember(section);
    return compact
      ? "CR " + formatMemberLabel(member, true)
      : "CHAIR RAIL — " + formatMemberLabel(member, false);
  }

  function doorZBarCount(section) {
    // One Z-Bar per door. "Above door 2x2 + ZB" is the same assembly, not extra material.
    return section && section.door ? 1 : 0;
  }

  function appendShopLabel(parts, x, y, text, options) {
    if (!text) return;
    var o = options || {};
    var anchor = o.anchor || "middle";
    var size = o.size || 8.5;
    var fill = o.fill || "#1f1f1f";
    var cls = o.cls || "admin-porch-svg-shop";
    var extra = o.rotate ? ' transform="rotate(-90 ' + x + " " + y + ')"' : "";
    parts.push(
      '<text x="' +
        x +
        '" y="' +
        y +
        '" text-anchor="' +
        anchor +
        '" font-size="' +
        size +
        '" font-weight="700" font-family="Segoe UI, Arial, sans-serif" fill="' +
        fill +
        '"' +
        extra +
        ' class="' +
        cls +
        '">' +
        escapeXml(text) +
        "</text>"
    );
  }

  function isArchSection(section) {
    var v = section && section.openingShape;
    return v === "arch" || v === true;
  }

  /** Default Yes. Only meaningful when the opening is an arch. */
  function isStraightAngle2x2(section) {
    if (!isArchSection(section)) return false;
    var v = section && section.straightAngle2x2;
    if (v === false || v === "no" || v === "false") return false;
    return true;
  }

  function getStraightHeightFt(section) {
    return roundLf(toFeet(section && section.heightFt, section && section.heightIn));
  }

  function getCenterHeightFt(section) {
    if (!isArchSection(section)) return getStraightHeightFt(section);
    return roundLf(toFeet(section.centerHeightFt, section.centerHeightIn));
  }

  function getArchRiseFt(section) {
    return roundLf(Math.max(0, getCenterHeightFt(section) - getStraightHeightFt(section)));
  }

  function getSectionOverallHeightFt(section) {
    return isArchSection(section) ? getCenterHeightFt(section) : getStraightHeightFt(section);
  }

  /**
   * Circular-arc length for a chord of `widthFt` and sagitta `riseFt`.
   * This is the 1x1/2 Flexible run from the left straight top, over the arch, to the right.
   */
  function circularArcLength(widthFt, riseFt) {
    var c = roundLf(widthFt);
    var h = roundLf(riseFt);
    if (c <= 0) return 0;
    if (h <= 0.001) return c;
    var r = (h * h + (c / 2) * (c / 2)) / (2 * h);
    var ratio = Math.max(-1, Math.min(1, (r - h) / r));
    return roundLf(r * 2 * Math.acos(ratio));
  }

  function getArchFlexibleLength(section) {
    if (!isArchSection(section)) return 0;
    return circularArcLength(toFeet(section.widthFt, section.widthIn), getArchRiseFt(section));
  }

  /**
   * Height from the opening bottom to the circular arch at horizontal position xFt.
   * At the left/right edges this equals Straight Height; at center it equals Center Height.
   */
  function circularArchHeightAtX(widthFt, straightH, riseFt, xFt) {
    var w = roundLf(widthFt);
    var s = roundLf(straightH);
    var h = roundLf(riseFt);
    var x = roundLf(xFt);
    if (w <= 0 || h <= 0.001) return s;
    if (x < 0) x = 0;
    if (x > w) x = w;
    var r = (h * h + (w / 2) * (w / 2)) / (2 * h);
    var dx = x - w / 2;
    var inside = Math.max(0, r * r - dx * dx);
    return roundLf(s + h - r + Math.sqrt(inside));
  }

  function getArchHeightAtX(section, xFt) {
    return circularArchHeightAtX(
      toFeet(section.widthFt, section.widthIn),
      getStraightHeightFt(section),
      getArchRiseFt(section),
      xFt
    );
  }

  function getDoorPostHeightFt(section, widthFt, xFt, fallbackHeight) {
    if (isArchSection(section) && !isStraightAngle2x2(section)) {
      return getArchHeightAtX(section, xFt);
    }
    return roundLf(fallbackHeight);
  }

  function circularSegmentArea(widthFt, riseFt) {
    var c = roundLf(widthFt);
    var h = roundLf(riseFt);
    if (c <= 0 || h <= 0.001) return 0;
    var r = (h * h + (c / 2) * (c / 2)) / (2 * h);
    var ratio = Math.max(-1, Math.min(1, (r - h) / r));
    return roundLf(
      r * r * Math.acos(ratio) - (r - h) * Math.sqrt(Math.max(0, 2 * r * h - h * h))
    );
  }

  function flexStickCount(totalLf) {
    var lf = Number(totalLf) || 0;
    if (lf <= 0) return 0;
    return Math.ceil(lf / STICK_FLEX_FT - 1e-9);
  }

  /**
   * Frame/post cuts per section. Each opening is an independent concrete frame
   * with its own left and right posts. Adjacent sections never share members.
   */
  function getSectionFrameCuts(sectionsInput) {
    var n = (sectionsInput || []).length;
    var out = [];
    var i;
    for (i = 0; i < n; i++) {
      out.push({
        leftMember: MEMBER_DEFAULT,
        rightMember: MEMBER_DEFAULT,
        effectiveLeft: MEMBER_DEFAULT,
        effectiveRight: MEMBER_DEFAULT,
        topMember: MEMBER_DEFAULT,
        bottomMember: MEMBER_DEFAULT,
        cuts1x1: [],
        cuts1x2: [],
        cuts2x2: [],
        cutsFlex: [],
        archRiseFt: 0,
        flexLf: 0,
      });
    }

    function addCut(index, size, length) {
      if (!size || size === MEMBER_NONE || !(length > 0)) return;
      var len = roundLf(length);
      if (size === "2x2") out[index].cuts2x2.push(len);
      else if (size === "1x1") out[index].cuts1x1.push(len);
      else out[index].cuts1x2.push(len);
    }

    for (i = 0; i < n; i++) {
      var s = sectionsInput[i];
      var width = roundLf(toFeet(s.widthFt, s.widthIn));
      var straightH = getStraightHeightFt(s);
      var isArch = isArchSection(s);
      var leftSelected = normalizeMember(s.leftMember);
      var rightSelected = normalizeMember(s.rightMember);
      var left = getEffectiveLeftMember(s, width);
      var right = getEffectiveRightMember(s, width);
      var top = isArch ? MEMBER_NONE : normalizeMember(s.topMember);
      var bottom = normalizeMember(s.bottomMember);
      out[i].leftMember = leftSelected;
      out[i].rightMember = rightSelected;
      out[i].effectiveLeft = left;
      out[i].effectiveRight = right;
      out[i].topMember = top;
      out[i].bottomMember = bottom;
      out[i].archRiseFt = isArch ? getArchRiseFt(s) : 0;
      out[i].flexLf = isArch ? getArchFlexibleLength(s) : 0;
      if (out[i].flexLf > 0) out[i].cutsFlex.push(out[i].flexLf);

      if (!isArch) addCut(i, top, width);
      else if (isStraightAngle2x2(s)) addCut(i, "2x2", width); // full-width 2x2 at Straight Height
      addCut(i, bottom, width);
      addCut(i, left, straightH);
      addCut(i, right, straightH);
    }
    return out;
  }

  function getDoorWidthFt(section) {
    if (isCustomDoor(section)) {
      var customW = roundLf(toFeet(section.doorWidthFt, section.doorWidthIn));
      if (customW > 0) return customW;
    }
    return DOOR_WIDTH_FT;
  }

  function getDoorHeightFt(section) {
    if (isCustomDoor(section)) {
      var customH = roundLf(toFeet(section.doorHeightFt, section.doorHeightIn));
      if (customH > 0) return customH;
    }
    return DOOR_OPENING_HEIGHT_FT;
  }

  function isCustomDoor(section) {
    if (!section || !section.door) return false;
    var v = section.customDoor;
    return v === true || v === "yes" || v === "true";
  }

  function getDoorPrice(section) {
    if (!section || !section.door) return 0;
    if (isCustomDoor(section)) {
      var p = Number(section.customDoorPrice);
      if (!Number.isFinite(p) || p < 0) return 0;
      return Math.round(p * 100) / 100;
    }
    return PRICE_DOOR;
  }

  function formatDoorSizeLabel(section) {
    var wIn;
    var hIn;
    if (isCustomDoor(section)) {
      wIn = Math.round(((Number(section.doorWidthFt) || 0) * 12 + (Number(section.doorWidthIn) || 0)) * 100) / 100;
      hIn = Math.round(((Number(section.doorHeightFt) || 0) * 12 + (Number(section.doorHeightIn) || 0)) * 100) / 100;
    } else {
      wIn = 36;
      hIn = 80;
    }
    var wStr = Number.isInteger(wIn) ? String(wIn) : String(wIn);
    var hStr = Number.isInteger(hIn) ? String(hIn) : String(hIn);
    return wStr + '" × ' + hStr + '"';
  }

  /**
   * Door openings in feet from the section left edge.
   * Requires an explicit doorPosition when Door = Yes.
   */
  function getDoorOpenings(section, widthFt) {
    var w = roundLf(widthFt);
    if (w <= 0) return [];
    var openings = [];

    if (Array.isArray(section.doors) && section.doors.length) {
      section.doors.forEach(function (d) {
        var doorW = Math.min(
          w,
          roundLf(Number(d && d.widthFt) > 0 ? d.widthFt : getDoorWidthFt(section))
        );
        var left = Number(d && d.leftFt);
        if (!Number.isFinite(left) || left < 0) left = 0;
        if (left + doorW > w) left = Math.max(0, w - doorW);
        openings.push({
          left: roundLf(left),
          width: doorW,
          right: roundLf(left + doorW),
        });
      });
    } else if (section.door) {
      var pos = normalizeDoorPosition(section.doorPosition);
      if (!pos) return [];
      var doorW = Math.min(w, getDoorWidthFt(section));
      var left = 0;
      if (pos === "center") left = Math.max(0, (w - doorW) / 2);
      else if (pos === "right") left = Math.max(0, w - doorW);
      openings.push({
        left: roundLf(left),
        width: doorW,
        right: roundLf(left + doorW),
      });
    }

    openings.sort(function (a, b) {
      return a.left - b.left;
    });
    return openings;
  }

  /**
   * Continuous horizontal wall runs (kick plate / chair rail), excluding door openings.
   * Each returned segment is one continuous 2x2 cut — never spliced across a door.
   */
  function getHorizontalSegmentsExcludingDoors(widthFt, openings) {
    var w = roundLf(widthFt);
    if (w <= 0) return [];
    var sorted = (openings || []).slice().sort(function (a, b) {
      return a.left - b.left;
    });
    var segments = [];
    var cursor = 0;
    sorted.forEach(function (op) {
      var left = Math.max(0, Math.min(w, Number(op.left) || 0));
      var right = Math.max(
        left,
        Math.min(w, op.right != null ? Number(op.right) : left + (Number(op.width) || 0))
      );
      if (left - cursor >= MIN_KICK_SEGMENT_FT) {
        segments.push({
          start: roundLf(cursor),
          end: roundLf(left),
          length: roundLf(left - cursor),
        });
      }
      cursor = Math.max(cursor, right);
    });
    if (w - cursor >= MIN_KICK_SEGMENT_FT) {
      segments.push({
        start: roundLf(cursor),
        end: roundLf(w),
        length: roundLf(w - cursor),
      });
    }
    return segments;
  }

  function getKickPlateSegments(widthFt, openings) {
    return getHorizontalSegmentsExcludingDoors(widthFt, openings);
  }

  function getChairRailSegments(widthFt, openings) {
    return getHorizontalSegmentsExcludingDoors(widthFt, openings);
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

  function buildSectionSvg(section, index) {
    var widthFt = roundLf(toFeet(section.widthFt, section.widthIn));
    var straightH = getStraightHeightFt(section);
    var isArch = isArchSection(section);
    var riseFt = isArch ? getArchRiseFt(section) : 0;
    var centerH = isArch ? getCenterHeightFt(section) : straightH;
    var heightFt = straightH;
    var overallH = isArch ? Math.max(centerH, straightH) : straightH;
    if (widthFt <= 0 || straightH <= 0) {
      return (
        '<div class="admin-porch-drawing-card">' +
        "<h3>SECTION " +
        (index + 1) +
        "</h3>" +
        '<p class="admin-porch-hint">Enter width and ' +
        (isArch ? "straight height" : "height") +
        " to preview this section.</p>" +
        "</div>"
      );
    }
    if (isArch && riseFt <= 0) {
      return (
        '<div class="admin-porch-drawing-card">' +
        "<h3>SECTION " +
        (index + 1) +
        "</h3>" +
        '<p class="admin-porch-hint">Center Height must be greater than Straight Height to preview the arch.</p>' +
        "</div>"
      );
    }
    if (section.door && !normalizeDoorPosition(section.doorPosition)) {
      return (
        '<div class="admin-porch-drawing-card">' +
        "<h3>SECTION " +
        (index + 1) +
        "</h3>" +
        '<p class="admin-porch-hint">Select Door Position (Left / Center / Right) to preview the door layout.</p>' +
        "</div>"
      );
    }

    var dimLabel = isArch
      ? formatFtInParts(section.widthFt, section.widthIn) +
        " W × " +
        formatFtInParts(section.heightFt, section.heightIn) +
        " straight × " +
        formatFtInParts(section.centerHeightFt, section.centerHeightIn) +
        " center"
      : formatFtInParts(section.widthFt, section.widthIn) + " W × " + formatFtInParts(section.heightFt, section.heightIn) + " H";
    var memberSummary = formatMemberSummary(section);
    var leftMember = normalizeMember(section.leftMember);
    var rightMember = normalizeMember(section.rightMember);
    var topMember = isArch ? MEMBER_NONE : normalizeMember(section.topMember);
    var bottomMember = normalizeMember(section.bottomMember);
    var padL = isArch ? 96 : 78;
    var padR = 28;
    var padT = isArch ? 64 : 54;
    var padB = 36;
    var maxDrawW = 320;
    var maxDrawH = 340;
    var scale = Math.min(maxDrawW / widthFt, maxDrawH / overallH);
    var drawW = widthFt * scale;
    var drawH = overallH * scale;
    var x0 = padL;
    var y0 = padT;
    var x1 = x0 + drawW;
    var y1 = y0 + drawH;
    var yFrameTop = isArch ? y0 + riseFt * scale : y0;
    var vbW = padL + drawW + padR;
    var vbH = padT + drawH + padB;

    function sx(ft) {
      return x0 + ft * scale;
    }
    function syFromTop(ftFromTop) {
      return y0 + ftFromTop * scale;
    }
    function syFromBottom(ftFromBottom) {
      return y1 - ftFromBottom * scale;
    }

    var parts = [];
    parts.push(
      '<svg class="admin-porch-section-svg" viewBox="0 0 ' +
        vbW +
        " " +
        vbH +
        '" width="' +
        vbW +
        '" height="' +
        vbH +
        '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Section ' +
        (index + 1) +
        ' shop drawing">'
    );
    parts.push(
      '<defs><pattern id="kickHatch' +
        index +
        '" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
        '<line x1="0" y1="0" x2="0" y2="8" stroke="#9aa3ad" stroke-width="1.2"/>' +
        "</pattern></defs>"
    );
    parts.push(
      "<style>" +
        ".admin-porch-svg-label{font:700 12px 'Segoe UI',Arial,sans-serif;fill:#1a1a1a;}" +
        ".admin-porch-svg-label-sm{font:600 10px 'Segoe UI',Arial,sans-serif;fill:#2a2a2a;}" +
        ".admin-porch-svg-dim{font:700 12px 'Segoe UI',Arial,sans-serif;fill:#222;}" +
        ".admin-porch-svg-shop{font:700 8.5px 'Segoe UI',Arial,sans-serif;fill:#1f1f1f;letter-spacing:.02em;}" +
        "</style>"
    );

    // Screen fill. SVG Y increases downward, so sweep-flag 1 draws the circular
    // arc UP from the straight-height chord toward Center Height (y0).
    if (isArch) {
      var rPx = ((riseFt * riseFt + (widthFt / 2) * (widthFt / 2)) / (2 * riseFt)) * scale;
      var largeArc = riseFt > widthFt / 2 ? 1 : 0;
      var archFill =
        "M " +
        x0 +
        " " +
        y1 +
        " L " +
        x0 +
        " " +
        yFrameTop +
        " A " +
        rPx +
        " " +
        rPx +
        " 0 " +
        largeArc +
        " 1 " +
        x1 +
        " " +
        yFrameTop +
        " L " +
        x1 +
        " " +
        y1 +
        " Z";
      parts.push('<path d="' + archFill + '" fill="#f4f7fa" stroke="none"/>');
    } else {
      parts.push(
        '<rect x="' +
          x0 +
          '" y="' +
          y0 +
          '" width="' +
          drawW +
          '" height="' +
          drawH +
          '" fill="#f4f7fa" stroke="none"/>'
      );
    }

    var doorOpenings = getDoorOpenings(section, widthFt);
    var compact = drawW < 150 || widthFt < 3.5;
    var doorConstr = getDoorConstruction(section);
    var doorTouchesLeft = section.door && openingTouchesLeft(doorOpenings);
    var doorTouchesRight = section.door && openingTouchesRight(doorOpenings, widthFt);
    var legendItems = [];
    var legendSeen = {};
    function addLegend(type, note) {
      if (!type || type === MEMBER_NONE) return;
      var key = type + "|" + (note || "");
      if (legendSeen[key]) return;
      legendSeen[key] = true;
      legendItems.push({ type: type, note: note || "" });
    }

    // Kick plate — never continues under door openings; each wall run is its own segment.
    var kickSegments = section.kickPlate
      ? getKickPlateSegments(widthFt, doorOpenings)
      : [];
    if (section.kickPlate && kickSegments.length) {
      var kickH = Math.min(getKickPlateHeightFt(section), heightFt * 0.35);
      var kickTopY = syFromBottom(kickH);
      var largest = kickSegments[0];
      kickSegments.forEach(function (seg) {
        if (seg.length > largest.length) largest = seg;
        var segX = sx(seg.start);
        var segW = Math.max(1, seg.length * scale);
        parts.push(
          '<rect x="' +
            segX +
            '" y="' +
            kickTopY +
            '" width="' +
            segW +
            '" height="' +
            kickH * scale +
            '" fill="url(#kickHatch' +
            index +
            ')" stroke="none"/>'
        );
        parts.push(
          '<line x1="' +
            segX +
            '" y1="' +
            kickTopY +
            '" x2="' +
            (segX + segW) +
            '" y2="' +
            kickTopY +
            '" stroke="#1a1a1a" stroke-width="' +
            memberStrokeWidth("2x2") +
            '"/>'
        );
        if (seg.length >= 2.5 && !compact) {
          appendShopLabel(parts, segX + 8, kickTopY - 5, formatMemberLabel("2x2", compact), {
            anchor: "start",
            size: 8,
          });
        }
      });
      if (largest.length * scale >= 48) {
        appendShopLabel(
          parts,
          sx(largest.start) + (largest.length * scale) / 2,
          kickTopY + (kickH * scale) / 2 + 3,
          formatKickPlateLabel(section, compact || largest.length * scale < 90)
        );
        addLegend("kick", formatKickPlateLabel(section, false));
      }
    }

    // Chair rail — never continues through door openings; each wall run is its own segment.
    if (section.chairRail) {
      var chairMember = getChairRailMember(section);
      var railFromBottom = Math.min(CHAIR_RAIL_HEIGHT_FT, heightFt * 0.55);
      if (section.kickPlate) {
        railFromBottom = Math.max(railFromBottom, getKickPlateHeightFt(section) + 0.75);
      }
      railFromBottom = Math.min(railFromBottom, heightFt - 0.5);
      var railY = syFromBottom(railFromBottom);
      var chairSegments = getChairRailSegments(widthFt, doorOpenings);
      var largestChair = chairSegments[0] || null;
      chairSegments.forEach(function (seg) {
        if (seg.length > largestChair.length) largestChair = seg;
        var segX = sx(seg.start);
        var segW = Math.max(1, seg.length * scale);
        parts.push(
          '<line x1="' +
            segX +
            '" y1="' +
            railY +
            '" x2="' +
            (segX + segW) +
            '" y2="' +
            railY +
            '" stroke="#1a1a1a" stroke-width="' +
            memberStrokeWidth(chairMember) +
            '"/>'
        );
      });
      if (largestChair && largestChair.length * scale >= 70) {
        appendShopLabel(
          parts,
          sx(largestChair.start) + (largestChair.length * scale) / 2,
          railY - 6,
          formatChairRailLabel(section, compact || largestChair.length * scale < 110)
        );
        addLegend(chairMember, "chair rail");
      }
    }

    // Door — vertical 2x2 posts, Z-Bar door frame, 2x2 + Z-Bar header.
    if (doorOpenings.length) {
      doorOpenings.forEach(function (op) {
        var dx0 = sx(op.left);
        var dx1 = sx(op.right);
        var openingH = Math.min(getDoorHeightFt(section), Math.max(1, heightFt - 0.05));
        var headerY = syFromBottom(openingH);
        var doorPx = Math.max(8, dx1 - dx0);
        var doorCompact = compact || doorPx < 78;
        var postStroke = memberStrokeWidth(doorConstr.leftPost);
        var headerStroke = memberStrokeWidth(doorConstr.header);
        var leftPostTopY = isArch && !isStraightAngle2x2(section)
          ? syFromBottom(getArchHeightAtX(section, op.left))
          : yFrameTop;
        var rightPostTopY = isArch && !isStraightAngle2x2(section)
          ? syFromBottom(getArchHeightAtX(section, op.right))
          : yFrameTop;
        parts.push(
          '<line x1="' +
            dx0 +
            '" y1="' +
            leftPostTopY +
            '" x2="' +
            dx0 +
            '" y2="' +
            y1 +
            '" stroke="#1a1a1a" stroke-width="' +
            postStroke +
            '"/>'
        );
        parts.push(
          '<line x1="' +
            dx1 +
            '" y1="' +
            rightPostTopY +
            '" x2="' +
            dx1 +
            '" y2="' +
            y1 +
            '" stroke="#1a1a1a" stroke-width="' +
            postStroke +
            '"/>'
        );
        parts.push(
          '<line x1="' +
            dx0 +
            '" y1="' +
            headerY +
            '" x2="' +
            dx1 +
            '" y2="' +
            headerY +
            '" stroke="#1a1a1a" stroke-width="' +
            headerStroke +
            '"/>'
        );
        var inset = 3.5;
        parts.push(
          '<rect x="' +
            (dx0 + inset) +
            '" y="' +
            (headerY + inset) +
            '" width="' +
            Math.max(6, dx1 - dx0 - inset * 2) +
            '" height="' +
            Math.max(6, y1 - headerY - inset * 2) +
            '" fill="none" stroke="#3a3a3a" stroke-width="1.6"/>'
        );
        parts.push(
          '<rect x="' +
            (dx0 + 7) +
            '" y="' +
            (headerY + 7) +
            '" width="' +
            Math.max(4, dx1 - dx0 - 14) +
            '" height="' +
            Math.max(4, y1 - headerY - 14) +
            '" fill="none" stroke="#5b6770" stroke-width="1" stroke-dasharray="4 3"/>'
        );
        appendShopLabel(
          parts,
          (dx0 + dx1) / 2,
          (headerY + y1) / 2 - 8,
          "DOOR",
          { cls: "admin-porch-svg-label", size: doorCompact ? 9 : 11 }
        );
        appendShopLabel(
          parts,
          (dx0 + dx1) / 2,
          (headerY + y1) / 2 + 5,
          formatDoorSizeLabel(section),
          { size: 8 }
        );
        if (y1 - headerY > 52) {
          appendShopLabel(
            parts,
            (dx0 + dx1) / 2,
            (headerY + y1) / 2 + 18,
            formatMemberLabel("z-bar-door", doorCompact)
          );
        }
        if (headerY - yFrameTop > 20) {
          appendShopLabel(
            parts,
            (dx0 + dx1) / 2,
            (yFrameTop + headerY) / 2 + 3,
            "ABOVE DOOR",
            { size: 8 }
          );
        }
        if (doorPx >= 52) {
          appendShopLabel(
            parts,
            (dx0 + dx1) / 2,
            headerY - 6,
            formatMemberLabel(MEMBER_2X2_ZBAR, doorCompact)
          );
        }
        var postLabelY = headerY + Math.max(28, (y1 - headerY) * 0.32);
        if (!doorTouchesLeft && doorPx >= 44) {
          appendShopLabel(
            parts,
            dx0 + 10,
            postLabelY,
            formatMemberLabel(doorConstr.leftPost, true),
            { rotate: true }
          );
        }
        if (!doorTouchesRight && doorPx >= 44) {
          appendShopLabel(
            parts,
            dx1 - 10,
            postLabelY,
            formatMemberLabel(doorConstr.rightPost, true),
            { rotate: true }
          );
        }
        addLegend(doorConstr.leftPost, "door post");
        addLegend("z-bar-door", "door frame");
        addLegend(MEMBER_2X2_ZBAR, "above door");
      });
    }

    // Light section outline so "None" edges still show the opening bounds.
    if (isArch) {
      var rOutline = ((riseFt * riseFt + (widthFt / 2) * (widthFt / 2)) / (2 * riseFt)) * scale;
      var largeOutline = riseFt > widthFt / 2 ? 1 : 0;
      parts.push(
        '<path d="M ' +
          x0 +
          " " +
          y1 +
          " L " +
          x0 +
          " " +
          yFrameTop +
          " A " +
          rOutline +
          " " +
          rOutline +
          " 0 " +
          largeOutline +
          " 1 " +
          x1 +
          " " +
          yFrameTop +
          " L " +
          x1 +
          " " +
          y1 +
          " Z" +
          '" fill="none" stroke="#c5cdd4" stroke-width="1"/>'
      );
    } else {
      parts.push(
        '<rect x="' +
          x0 +
          '" y="' +
          y0 +
          '" width="' +
          drawW +
          '" height="' +
          drawH +
          '" fill="none" stroke="#c5cdd4" stroke-width="1"/>'
      );
    }

    // Frame / post members (overall W×H stay the same; thickness is visual only)
    function drawPerimeterMember(size, edge, xA, yA, xB, yB, labelX, labelY, rotate, skipLabel) {
      var sw = memberStrokeWidth(size);
      if (!sw) return;
      parts.push(
        '<line x1="' +
          xA +
          '" y1="' +
          yA +
          '" x2="' +
          xB +
          '" y2="' +
          yB +
          '" stroke="#111" stroke-linecap="square" stroke-width="' +
          sw +
          '"/>'
      );
      addLegend(size, edge);
      if (skipLabel) return;
      if ((edge === "top" || edge === "bottom") && drawW < 48) return;
      if ((edge === "left" || edge === "right") && drawH < 56) return;
      appendShopLabel(parts, labelX, labelY, formatMemberLabel(size, compact), {
        rotate: rotate,
        size: 8.5,
      });
    }
    var leftLabelSize = doorTouchesLeft ? getEffectiveLeftMember(section, widthFt) : leftMember;
    var rightLabelSize = doorTouchesRight ? getEffectiveRightMember(section, widthFt) : rightMember;
    var sideLabelY = yFrameTop + (y1 - yFrameTop) * 0.28;
    drawPerimeterMember(
      leftLabelSize,
      "left",
      x0,
      yFrameTop,
      x0,
      y1,
      x0 + 11,
      sideLabelY,
      true,
      false
    );
    drawPerimeterMember(
      rightLabelSize,
      "right",
      x1,
      yFrameTop,
      x1,
      y1,
      x1 - 11,
      sideLabelY,
      true,
      false
    );
    if (isArch) {
      if (isStraightAngle2x2(section)) {
        drawPerimeterMember(
          "2x2",
          "arch-base",
          x0,
          yFrameTop,
          x1,
          yFrameTop,
          x0 + drawW / 2,
          yFrameTop - 7,
          false,
          drawW < 40
        );
      }
      var rFlex = ((riseFt * riseFt + (widthFt / 2) * (widthFt / 2)) / (2 * riseFt)) * scale;
      var largeFlex = riseFt > widthFt / 2 ? 1 : 0;
      var flexStroke = memberStrokeWidth(MEMBER_FLEX);
      parts.push(
        '<path d="M ' +
          x0 +
          " " +
          yFrameTop +
          " A " +
          rFlex +
          " " +
          rFlex +
          " 0 " +
          largeFlex +
          " 1 " +
          x1 +
          " " +
          yFrameTop +
          '" fill="none" stroke="#111" stroke-linecap="square" stroke-width="' +
          flexStroke +
          '"/>'
      );
      addLegend(MEMBER_FLEX, "arch");
      appendShopLabel(
        parts,
        x0 + drawW / 2,
        y0 - 8,
        formatMemberLabel(MEMBER_FLEX, compact),
        { size: compact ? 8 : 9 }
      );
    } else {
      var headerClearanceFt = heightFt - Math.min(getDoorHeightFt(section), Math.max(1, heightFt - 0.05));
      drawPerimeterMember(
        topMember,
        "top",
        x0,
        y0,
        x1,
        y0,
        x0 + drawW / 2,
        y0 + 13,
        false,
        doorOpenings.length && (drawW < 120 || headerClearanceFt < 0.5)
      );
    }
    var bottomLabelX = x0 + drawW * (section.kickPlate ? 0.78 : 0.5);
    drawPerimeterMember(
      bottomMember,
      "bottom",
      x0,
      y1,
      x1,
      y1,
      bottomLabelX,
      y1 - 5,
      false,
      section.kickPlate && drawW < 140
    );

    // Width dimension (top)
    var dimY = 22;
    parts.push(
      '<line x1="' +
        x0 +
        '" y1="' +
        dimY +
        '" x2="' +
        x1 +
        '" y2="' +
        dimY +
        '" stroke="#333" stroke-width="1.2"/>'
    );
    parts.push(
      '<polyline points="' +
        x0 +
        "," +
        (dimY + 5) +
        " " +
        x0 +
        "," +
        (dimY - 5) +
        " " +
        (x0 + 8) +
        "," +
        dimY +
        '" fill="#333"/>'
    );
    parts.push(
      '<polyline points="' +
        x1 +
        "," +
        (dimY + 5) +
        " " +
        x1 +
        "," +
        (dimY - 5) +
        " " +
        (x1 - 8) +
        "," +
        dimY +
        '" fill="#333"/>'
    );
    parts.push(
      '<text x="' +
        (x0 + drawW / 2) +
        '" y="' +
        (dimY - 8) +
        '" text-anchor="middle" font-size="12" font-weight="700" font-family="Segoe UI, Arial, sans-serif" fill="#222" class="admin-porch-svg-dim">' +
        escapeXml(formatFtInParts(section.widthFt, section.widthIn)) +
        "</text>"
    );

    // Height dimension (left)
    var dimX = isArch ? 28 : 34;
    if (isArch) {
      var dimXStraight = 58;
      parts.push(
        '<line x1="' +
          dimX +
          '" y1="' +
          y0 +
          '" x2="' +
          dimX +
          '" y2="' +
          y1 +
          '" stroke="#333" stroke-width="1.2"/>'
      );
      parts.push(
        '<polyline points="' +
          (dimX - 5) +
          "," +
          y0 +
          " " +
          (dimX + 5) +
          "," +
          y0 +
          " " +
          dimX +
          "," +
          (y0 + 8) +
          '" fill="#333"/>'
      );
      parts.push(
        '<polyline points="' +
          (dimX - 5) +
          "," +
          y1 +
          " " +
          (dimX + 5) +
          "," +
          y1 +
          " " +
          dimX +
          "," +
          (y1 - 8) +
          '" fill="#333"/>'
      );
      parts.push(
        '<text x="' +
          (dimX - 12) +
          '" y="' +
          (y0 + drawH / 2) +
          '" text-anchor="middle" transform="rotate(-90 ' +
          (dimX - 12) +
          " " +
          (y0 + drawH / 2) +
          ')" font-size="11" font-weight="700" font-family="Segoe UI, Arial, sans-serif" fill="#222" class="admin-porch-svg-dim">' +
          escapeXml(formatFtInParts(section.centerHeightFt, section.centerHeightIn) + " CTR") +
          "</text>"
      );
      parts.push(
        '<line x1="' +
          dimXStraight +
          '" y1="' +
          yFrameTop +
          '" x2="' +
          dimXStraight +
          '" y2="' +
          y1 +
          '" stroke="#333" stroke-width="1.2"/>'
      );
      parts.push(
        '<polyline points="' +
          (dimXStraight - 5) +
          "," +
          yFrameTop +
          " " +
          (dimXStraight + 5) +
          "," +
          yFrameTop +
          " " +
          dimXStraight +
          "," +
          (yFrameTop + 8) +
          '" fill="#333"/>'
      );
      parts.push(
        '<polyline points="' +
          (dimXStraight - 5) +
          "," +
          y1 +
          " " +
          (dimXStraight + 5) +
          "," +
          y1 +
          " " +
          dimXStraight +
          "," +
          (y1 - 8) +
          '" fill="#333"/>'
      );
      parts.push(
        '<text x="' +
          (dimXStraight - 12) +
          '" y="' +
          (yFrameTop + (y1 - yFrameTop) / 2) +
          '" text-anchor="middle" transform="rotate(-90 ' +
          (dimXStraight - 12) +
          " " +
          (yFrameTop + (y1 - yFrameTop) / 2) +
          ')" font-size="11" font-weight="700" font-family="Segoe UI, Arial, sans-serif" fill="#222" class="admin-porch-svg-dim">' +
          escapeXml(formatFtInParts(section.heightFt, section.heightIn) + " STR") +
          "</text>"
      );
    } else {
      parts.push(
        '<line x1="' +
          dimX +
          '" y1="' +
          y0 +
          '" x2="' +
          dimX +
          '" y2="' +
          y1 +
          '" stroke="#333" stroke-width="1.2"/>'
      );
      parts.push(
        '<polyline points="' +
          (dimX - 5) +
          "," +
          y0 +
          " " +
          (dimX + 5) +
          "," +
          y0 +
          " " +
          dimX +
          "," +
          (y0 + 8) +
          '" fill="#333"/>'
      );
      parts.push(
        '<polyline points="' +
          (dimX - 5) +
          "," +
          y1 +
          " " +
          (dimX + 5) +
          "," +
          y1 +
          " " +
          dimX +
          "," +
          (y1 - 8) +
          '" fill="#333"/>'
      );
      parts.push(
        '<text x="' +
          (dimX - 12) +
          '" y="' +
          (y0 + drawH / 2) +
          '" text-anchor="middle" transform="rotate(-90 ' +
          (dimX - 12) +
          " " +
          (y0 + drawH / 2) +
          ')" font-size="12" font-weight="700" font-family="Segoe UI, Arial, sans-serif" fill="#222" class="admin-porch-svg-dim">' +
          escapeXml(formatFtInParts(section.heightFt, section.heightIn)) +
          "</text>"
      );
    }

    parts.push("</svg>");

    var legendHtml = "";
    if (compact && legendItems.length) {
      legendHtml =
        '<ul class="admin-porch-drawing-legend">' +
        legendItems
          .map(function (item) {
            var label =
              item.type === "kick" ? item.note : formatMemberLabel(item.type, false);
            var note = item.type === "kick" || !item.note ? "" : " — " + item.note;
            return "<li>" + escapeXml(label + note) + "</li>";
          })
          .join("") +
        "</ul>";
    }

    return (
      '<article class="admin-porch-drawing-card">' +
      "<h3>SECTION " +
      (index + 1) +
      "</h3>" +
      '<p class="admin-porch-drawing-card__dims">' +
      escapeXml(dimLabel) +
      "</p>" +
      '<p class="admin-porch-drawing-card__members">' +
      escapeXml(memberSummary) +
      "</p>" +
      '<div class="admin-porch-drawing-preview">' +
      parts.join("") +
      "</div>" +
      legendHtml +
      "</article>"
    );
  }

  function getLayoutMeta() {
    var id = estimateIdInput && estimateIdInput.value ? estimateIdInput.value : "";
    var title = titleInput && titleInput.value.trim() ? titleInput.value.trim() : "Untitled estimate";
    var projectType =
      projectTypeInput && projectTypeInput.value === "back" ? "Back Porch" : "Front Porch";
    var today = new Date();
    var dateStr = today.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    return {
      customerName: title,
      projectType: projectType,
      estimateNumber: id || "Unsaved",
      date: dateStr,
    };
  }

  function refreshLayout() {
    if (!layoutDrawings || !layoutHeader) return;
    var meta = getLayoutMeta();
    layoutHeader.innerHTML =
      '<div class="admin-porch-layout-meta">' +
      "<div><span>Customer Name</span><strong>" +
      escapeXml(meta.customerName) +
      "</strong></div>" +
      "<div><span>Project Type</span><strong>" +
      escapeXml(meta.projectType) +
      "</strong></div>" +
      "<div><span>Estimate Number</span><strong>" +
      escapeXml(meta.estimateNumber) +
      "</strong></div>" +
      "<div><span>Date</span><strong>" +
      escapeXml(meta.date) +
      "</strong></div>" +
      "</div>";

    var sections = readSections();
    if (!sections.length) {
      layoutDrawings.innerHTML = '<p class="admin-porch-hint">Add a section to generate the shop drawing.</p>';
      return;
    }
    layoutDrawings.innerHTML = sections
      .map(function (s, i) {
        return buildSectionSvg(s, i);
      })
      .join("");
  }

  function scheduleLayoutRefresh() {
    if (layoutTimer) clearTimeout(layoutTimer);
    layoutTimer = setTimeout(refreshLayout, 120);
  }

  function printLayout() {
    refreshLayout();
    var sheet = layoutSheet;
    if (!sheet) return;
    var win = window.open("", "_blank", "noopener,noreferrer,width=980,height=720");
    if (!win) {
      window.print();
      return;
    }
    win.document.write(
      "<!DOCTYPE html><html><head><title>Project Layout</title>" +
        "<style>" +
        "body{font-family:Segoe UI,Arial,sans-serif;margin:24px;color:#111;background:#fff;}" +
        ".admin-porch-layout-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 18px;margin-bottom:18px;padding-bottom:12px;border-bottom:1px solid #ddd;}" +
        ".admin-porch-layout-meta span{display:block;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.04em;}" +
        ".admin-porch-layout-meta strong{font-size:14px;}" +
        ".admin-porch-layout-drawings{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:stretch;}" +
        ".admin-porch-drawing-card{break-inside:avoid;page-break-inside:avoid;border:1px solid #ddd;padding:12px;border-radius:8px;display:flex;flex-direction:column;min-width:0;}" +
        ".admin-porch-drawing-card h3{margin:0 0 4px;font-size:15px;letter-spacing:.04em;}" +
        ".admin-porch-drawing-card__dims{margin:0 0 4px;color:#444;font-size:13px;}" +
        ".admin-porch-drawing-card__members{margin:0 0 8px;color:#666;font-size:11px;}" +
        ".admin-porch-drawing-legend{list-style:none;margin:8px 0 0;padding:6px 0 0;border-top:1px solid #ddd;display:flex;flex-wrap:wrap;gap:4px 12px;font-size:10px;font-weight:700;}" +
        ".admin-porch-drawing-preview{display:flex;align-items:center;justify-content:center;width:100%;height:280px;overflow:hidden;}" +
        ".admin-porch-section-svg{max-width:100%;max-height:100%;width:auto;height:auto;display:block;}" +
        ".admin-porch-svg-label,.admin-porch-svg-label-sm,.admin-porch-svg-dim,.admin-porch-svg-shop{font-family:Segoe UI,Arial,sans-serif;fill:#222;}" +
        ".admin-porch-svg-label{font-size:12px;font-weight:700;}" +
        ".admin-porch-svg-label-sm{font-size:10px;font-weight:600;}" +
        ".admin-porch-svg-dim{font-size:12px;font-weight:700;}" +
        ".admin-porch-svg-shop{font-size:8.5px;font-weight:700;}" +
        "</style></head><body>" +
        sheet.innerHTML +
        "</body></html>"
    );
    win.document.close();
    win.focus();
    setTimeout(function () {
      win.print();
    }, 250);
  }

  function slugifyFilename(name) {
    return String(name || "estimate")
      .trim()
      .replace(/['"]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-") || "estimate";
  }

  function escapePdfText(s) {
    return String(s)
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");
  }

  /** Helvetica Type1 PDFs need ASCII-only text strings. */
  function toPdfAscii(s) {
    return String(s || "")
      .replace(/[\u2018\u2019\u2032]/g, "'")
      .replace(/[\u201C\u201D\u2033]/g, '"')
      .replace(/[\u2013\u2014\u2212\u00AD]/g, "-")
      .replace(/[\u00A0\u202F\u2009\u200A\u2007]/g, " ")
      .replace(/[^\x20-\x7E]/g, "");
  }

  function stickLabel(count) {
    var n = Number(count) || 0;
    return n === 1 ? "1 stick" : n + " sticks";
  }

  function buildMaterialListData() {
    var sections = readSections();
    var err = validateSections(sections);
    if (err) return { ok: false, error: err };
    var totals = calculateProject(sections, readScreenType());
    lastTotals = totals;
    var meta = getLayoutMeta();
    return {
      ok: true,
      estimateName: meta.customerName || "Untitled estimate",
      projectType: meta.projectType,
      date: meta.date,
      sticks1x2: totals.track1x2Sticks || 0,
      sticks2x2: totals.track2x2Sticks || 0,
      sticksFlex: totals.flexSticks || 0,
      doors: totals.doorCount || 0,
      zBar: totals.zBarCount || 0,
      kickPlateLf: totals.kickPlateLf || 0,
      kickMoldingLf: totals.kickPlateLf || 0,
      screenType: totals.screenType || readScreenType(),
      netScreenSqFt: totals.netScreenSqFt || 0,
    };
  }

  /**
   * ASCII-only material order/pickup PDF (no cut plans / prices).
   */
  function createMaterialListPdfBlob(data) {
    var leftX = 50;
    var qtyX = 380;
    var tableRight = 562;
    var rowH = 22;

    var rows = [
      { material: "1x2 Aluminum (24 ft)", quantity: stickLabel(data.sticks1x2) },
      { material: "2x2 Aluminum (24 ft)", quantity: stickLabel(data.sticks2x2) },
      { material: "1x1/2 Flexible Aluminum (20 ft)", quantity: stickLabel(data.sticksFlex) },
      { material: "Screen Door", quantity: String(data.doors) },
      { material: "Z-Bar", quantity: String(data.zBar) },
      {
        material: "Kick Plate",
        quantity: num(data.kickPlateLf, 2) + " LF",
      },
      {
        material: "Kick Plate Molding",
        quantity: num(data.kickMoldingLf, 2) + " LF",
      },
      { material: "Screen", quantity: num(data.netScreenSqFt, 2) + " sqft (" + (data.screenType || DEFAULT_SCREEN_TYPE) + ")" },
      { material: "Screws & Misc", quantity: "1 project set" },
    ];

    var ops = [];

    function drawLine(x1, y1, x2, y2, width) {
      ops.push((width || 1) + " w");
      ops.push(x1 + " " + y1 + " m " + x2 + " " + y2 + " l S");
    }

    function drawText(x, y, size, text, bold) {
      ops.push("BT");
      ops.push((bold ? "/F2 " : "/F1 ") + size + " Tf");
      ops.push("1 0 0 1 " + x + " " + y + " Tm");
      ops.push("(" + escapePdfText(toPdfAscii(text)) + ") Tj");
      ops.push("ET");
    }

    drawText(leftX, 760, 22, "SCREEN ARMORS", true);
    drawText(leftX, 736, 14, "MATERIAL LIST", true);
    drawLine(leftX, 728, tableRight, 728, 1.5);

    drawText(leftX, 708, 11, "Estimate: " + data.estimateName, false);
    drawText(leftX, 690, 11, "Project: " + data.projectType, false);
    drawText(leftX, 672, 11, "Date: " + data.date, false);

    var y = 642;
    drawLine(leftX, y + 14, tableRight, y + 14, 1);
    drawText(leftX, y, 11, "MATERIAL", true);
    drawText(qtyX, y, 11, "QUANTITY", true);
    drawLine(leftX, y - 8, tableRight, y - 8, 1);

    y -= 28;
    rows.forEach(function (row, index) {
      drawText(leftX, y, 11, row.material, false);
      drawText(qtyX, y, 11, row.quantity, false);
      if (index < rows.length - 1) {
        drawLine(leftX, y - 8, tableRight, y - 8, 0.4);
      }
      y -= rowH;
    });
    drawLine(leftX, y + rowH - 8, tableRight, y + rowH - 8, 1);

    var stream = ops.join("\n");
    var objects = [];
    objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
    objects.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
    objects.push(
      "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n"
    );
    objects.push(
      "4 0 obj\n<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream\nendobj\n"
    );
    objects.push(
      "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
    );
    objects.push(
      "6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n"
    );

    var pdf = "%PDF-1.4\n";
    var offsets = [0];
    objects.forEach(function (obj) {
      offsets.push(pdf.length);
      pdf += obj;
    });
    var xrefPos = pdf.length;
    pdf += "xref\n0 " + (objects.length + 1) + "\n";
    pdf += "0000000000 65535 f \n";
    for (var i = 1; i < offsets.length; i++) {
      pdf += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
    }
    pdf +=
      "trailer\n<< /Size " +
      (objects.length + 1) +
      " /Root 1 0 R >>\nstartxref\n" +
      xrefPos +
      "\n%%EOF";

    return new Blob([pdf], { type: "application/pdf" });
  }

  function downloadMaterialList() {
    var data = buildMaterialListData();
    if (!data.ok) {
      setSaveStatus(data.error || "Fix section inputs before downloading the material list.", true);
      return;
    }
    try {
      var blob = createMaterialListPdfBlob(data);
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = slugifyFilename(data.estimateName) + "-Material-List.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 1000);
      setSaveStatus("Material list downloaded.");
      // Refresh breakdown with the same totals used for stick counts.
      renderResults(lastTotals);
    } catch (err) {
      setSaveStatus("Could not create the material list PDF.", true);
    }
  }

  function downloadLayout() {
    refreshLayout();
    if (!layoutSheet) return;
    var meta = getLayoutMeta();
    var drawings = Array.prototype.slice.call(
      layoutDrawings.querySelectorAll(".admin-porch-drawing-card")
    );
    var cols = Math.min(4, Math.max(1, drawings.length));
    var cellW = 300;
    var cellH = 430;
    var originX = 36;
    var originY = 110;
    var blocks = drawings
      .map(function (card, i) {
        var title = card.querySelector("h3");
        var dims = card.querySelector(".admin-porch-drawing-card__dims");
        var members = card.querySelector(".admin-porch-drawing-card__members");
        var svg = card.querySelector("svg");
        var col = i % cols;
        var row = Math.floor(i / cols);
        var svgMarkup = "";
        if (svg) {
          var vb = svg.viewBox && svg.viewBox.baseVal;
          var vbW = vb && vb.width ? vb.width : Number(svg.getAttribute("width")) || 300;
          var vbH = vb && vb.height ? vb.height : Number(svg.getAttribute("height")) || 320;
          var fitW = cellW - 16;
          var fitH = cellH - 78;
          var s = Math.min(fitW / vbW, fitH / vbH);
          var ox = (fitW - vbW * s) / 2;
          svgMarkup =
            '<g transform="translate(' +
            ox +
            ",36) scale(" +
            s +
            ')">' +
            svg.outerHTML +
            "</g>";
        }
        return (
          '<g transform="translate(' +
          (originX + col * cellW) +
          "," +
          (originY + row * cellH) +
          ')">' +
          '<text x="0" y="0" font-size="16" font-weight="700" font-family="Segoe UI, Arial, sans-serif">' +
          escapeXml(title ? title.textContent : "SECTION " + (i + 1)) +
          "</text>" +
          '<text x="0" y="18" font-size="12" fill="#444" font-family="Segoe UI, Arial, sans-serif">' +
          escapeXml(dims ? dims.textContent : "") +
          "</text>" +
          '<text x="0" y="34" font-size="11" fill="#666" font-family="Segoe UI, Arial, sans-serif">' +
          escapeXml(members ? members.textContent : "") +
          "</text>" +
          svgMarkup +
          "</g>"
        );
      })
      .join("");

    var rows = Math.max(1, Math.ceil(drawings.length / cols));
    var height = Math.max(700, originY + rows * cellH + 40);
    var width = Math.max(900, originX + cols * cellW + 36);
    var svgDoc =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      width +
      '" height="' +
      height +
      '" viewBox="0 0 ' +
      width +
      " " +
      height +
      '">' +
      '<rect width="100%" height="100%" fill="#ffffff"/>' +
      '<text x="40" y="36" font-size="22" font-weight="800" font-family="Segoe UI, Arial, sans-serif">PROJECT LAYOUT</text>' +
      '<text x="40" y="60" font-size="13" font-family="Segoe UI, Arial, sans-serif">Customer: ' +
      escapeXml(meta.customerName) +
      "</text>" +
      '<text x="40" y="78" font-size="13" font-family="Segoe UI, Arial, sans-serif">Project: ' +
      escapeXml(meta.projectType) +
      " · Estimate: " +
      escapeXml(meta.estimateNumber) +
      " · Date: " +
      escapeXml(meta.date) +
      "</text>" +
      blocks +
      "</svg>";

    var blob = new Blob([svgDoc], { type: "image/svg+xml;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    var safeName = slugifyFilename(meta.customerName || "porch-layout");
    a.href = url;
    a.download = safeName + "-layout.svg";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function showLogin() {
    if (bootStatus) bootStatus.hidden = true;
    loginPanel.hidden = false;
    toolPanel.hidden = true;
  }

  function showTool(username) {
    if (bootStatus) bootStatus.hidden = true;
    loginPanel.hidden = true;
    toolPanel.hidden = false;
    if (userLabel) userLabel.textContent = "Signed in as " + username;
    var openId = "";
    try {
      openId = new URLSearchParams(window.location.search).get("id") || "";
    } catch (err) {
      openId = "";
    }
    if (!openId && !sectionsEl.querySelector("[data-section]")) {
      addSection({
        widthFt: 12,
        widthIn: 10,
        heightFt: 8,
        heightIn: 5,
        door: true,
        doorPosition: "left",
        kickPlate: false,
        chairRail: false,
        leftMember: MEMBER_DEFAULT,
        rightMember: MEMBER_DEFAULT,
        topMember: MEMBER_DEFAULT,
        bottomMember: MEMBER_DEFAULT,
        openingShape: "rectangle",
        centerHeightFt: 10,
        centerHeightIn: 0,
      });
    }
    refreshLayout();
    refreshSavedList();
    markClean();
    if (openId) openEstimate(openId);
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
      doorPosition: normalizeDoorPosition(d.doorPosition) || "",
      customDoor: d.door && isCustomDoor(d) ? "yes" : "no",
      doorWidthFt: d.doorWidthFt != null ? d.doorWidthFt : 3,
      doorWidthIn: d.doorWidthIn != null ? d.doorWidthIn : 0,
      doorHeightFt: d.doorHeightFt != null ? d.doorHeightFt : 6,
      doorHeightIn: d.doorHeightIn != null ? d.doorHeightIn : 8,
      customDoorPrice: d.customDoorPrice != null && d.customDoorPrice !== "" ? d.customDoorPrice : "",
      kickPlate: d.kickPlate ? "yes" : "no",
      chairRail: d.chairRail ? "yes" : "no",
      leftMember: memberFromData(d, "leftMember"),
      rightMember: memberFromData(d, "rightMember"),
      topMember: memberFromData(d, "topMember"),
      bottomMember: memberFromData(d, "bottomMember"),
      openingShape: isArchSection(d) ? "arch" : "rectangle",
      straightAngle2x2: isArchSection(d) && !isStraightAngle2x2(d) ? "no" : "yes",
      centerHeightFt: d.centerHeightFt != null ? d.centerHeightFt : 10,
      centerHeightIn: d.centerHeightIn != null ? d.centerHeightIn : 0,
    };
    Object.keys(map).forEach(function (key) {
      var el = card.querySelector('[data-field="' + key + '"]');
      if (!el) return;
      if (key === "doorPosition") {
        if (map[key]) el.value = map[key];
        else el.selectedIndex = 0;
      } else {
        el.value = map[key];
      }
    });
    writeSectionExtras(card, d);
    syncDoorPositionVisibility(card);
    syncOpeningShapeVisibility(card);
  }

  function syncDoorPositionVisibility(card) {
    var doorEl = card.querySelector('[data-field="door"]');
    var wrap = card.querySelector("[data-door-position-wrap]");
    var posEl = card.querySelector('[data-field="doorPosition"]');
    var customWrap = card.querySelector("[data-custom-door-wrap]");
    var customFields = card.querySelector("[data-custom-door-fields]");
    var customEl = card.querySelector('[data-field="customDoor"]');
    if (!doorEl) return;
    var on = doorEl.value === "yes";
    if (wrap) wrap.hidden = !on;
    if (customWrap) customWrap.hidden = !on;
    var customOn = on && customEl && customEl.value === "yes";
    if (customFields) customFields.hidden = !customOn;
    if (!on && posEl) {
      posEl.selectedIndex = 0;
    }
    if (!on && customEl) {
      customEl.value = "no";
    }
    if (customOn) {
      var wFt = card.querySelector('[data-field="doorWidthFt"]');
      var hFt = card.querySelector('[data-field="doorHeightFt"]');
      var wIn = card.querySelector('[data-field="doorWidthIn"]');
      var hIn = card.querySelector('[data-field="doorHeightIn"]');
      if (wFt && !(Number(wFt.value) || Number(wIn && wIn.value))) wFt.value = "3";
      if (hFt && !(Number(hFt.value) || Number(hIn && hIn.value))) {
        hFt.value = "6";
        if (hIn) hIn.value = "8";
      }
    }
  }

  function syncOpeningShapeVisibility(card) {
    var shapeEl = card.querySelector('[data-field="openingShape"]');
    var isArch = shapeEl && shapeEl.value === "arch";
    var heightLegend = card.querySelector("[data-height-legend]");
    var centerWrap = card.querySelector("[data-center-height-wrap]");
    var topWrap = card.querySelector("[data-top-member-wrap]");
    var angleWrap = card.querySelector("[data-straight-angle-wrap]");
    if (heightLegend) heightLegend.textContent = isArch ? "Straight Height" : "Height";
    if (centerWrap) centerWrap.hidden = !isArch;
    if (topWrap) topWrap.hidden = !!isArch;
    if (angleWrap) angleWrap.hidden = !isArch;
    if (!isArch) return;
    var cFtEl = card.querySelector('[data-field="centerHeightFt"]');
    var cInEl = card.querySelector('[data-field="centerHeightIn"]');
    var hFtEl = card.querySelector('[data-field="heightFt"]');
    var hInEl = card.querySelector('[data-field="heightIn"]');
    var cFt = Number(cFtEl && cFtEl.value) || 0;
    var cIn = Number(cInEl && cInEl.value) || 0;
    var hFt = Number(hFtEl && hFtEl.value) || 0;
    var hIn = Number(hInEl && hInEl.value) || 0;
    if (cFt + cIn / 12 <= hFt + hIn / 12) {
      if (cFtEl) cFtEl.value = String(hFt + 2);
      if (cInEl) cInEl.value = String(hIn);
    }
  }

  function readSectionCard(card) {
    function val(field) {
      var el = card.querySelector('[data-field="' + field + '"]');
      return el ? el.value : "";
    }
    var doorOn = val("door") === "yes";
    var fields = {
      widthFt: Number(val("widthFt")) || 0,
      widthIn: Number(val("widthIn")) || 0,
      heightFt: Number(val("heightFt")) || 0,
      heightIn: Number(val("heightIn")) || 0,
      openingShape: val("openingShape") === "arch" ? "arch" : "rectangle",
      straightAngle2x2: val("openingShape") === "arch" ? val("straightAngle2x2") !== "no" : true,
      centerHeightFt: Number(val("centerHeightFt")) || 0,
      centerHeightIn: Number(val("centerHeightIn")) || 0,
      door: doorOn,
      doorPosition: doorOn ? normalizeDoorPosition(val("doorPosition")) : "",
      customDoor: doorOn && val("customDoor") === "yes",
      doorWidthFt: Number(val("doorWidthFt")) || 0,
      doorWidthIn: Number(val("doorWidthIn")) || 0,
      doorHeightFt: Number(val("doorHeightFt")) || 0,
      doorHeightIn: Number(val("doorHeightIn")) || 0,
      customDoorPrice: val("customDoorPrice") === "" ? "" : Number(val("customDoorPrice")),
      kickPlate: val("kickPlate") === "yes",
      chairRail: val("chairRail") === "yes",
      leftMember: normalizeMember(val("leftMember") || MEMBER_DEFAULT),
      rightMember: normalizeMember(val("rightMember") || MEMBER_DEFAULT),
      topMember: normalizeMember(val("topMember") || MEMBER_DEFAULT),
      bottomMember: normalizeMember(val("bottomMember") || MEMBER_DEFAULT),
    };
    return Object.assign({}, readSectionExtras(card), fields);
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
    scheduleLayoutRefresh();
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

  function readSectionExtras(card) {
    try {
      var parsed = JSON.parse(card.getAttribute("data-section-extras") || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function writeSectionExtras(card, data) {
    var extras = {};
    SECTION_EXTRA_KEYS.forEach(function (key) {
      if (data && data[key] != null && data[key] !== "") extras[key] = data[key];
    });
    card.setAttribute("data-section-extras", JSON.stringify(extras));
  }

  function currentInputSnapshot() {
    return JSON.stringify({
      id: estimateIdInput ? estimateIdInput.value : "",
      title: titleInput ? titleInput.value.trim() : "",
      projectType: projectTypeInput ? projectTypeInput.value : "front",
      notes: notesInput ? notesInput.value.trim() : "",
      screenType: readScreenType(),
      sections: readSections(),
    });
  }

  function markClean() {
    lastSavedSnapshot = currentInputSnapshot();
    updateDirtyStatus();
    updateSaveChrome();
  }

  function updateDirtyStatus() {
    if (!dirtyStatus || applyingSaved) return;
    var dirty = currentInputSnapshot() !== lastSavedSnapshot;
    if (!estimateIdInput || !estimateIdInput.value) {
      dirtyStatus.textContent = dirty ? "Unsaved changes" : "";
    } else {
      dirtyStatus.textContent = dirty ? "Unsaved changes" : "Saved";
    }
    dirtyStatus.classList.toggle("is-dirty", dirty);
  }

  function scheduleDirtyCheck() {
    if (dirtyTimer) clearTimeout(dirtyTimer);
    dirtyTimer = setTimeout(updateDirtyStatus, 80);
  }

  function updateSaveChrome() {
    var hasId = Boolean(estimateIdInput && estimateIdInput.value);
    if (saveBtn) saveBtn.textContent = hasId ? "SAVE CHANGES" : "SAVE ESTIMATE";
    if (saveAsBtn) saveAsBtn.hidden = !hasId;
    syncDeleteVisibility();
  }

  function confirmDiscardUnsaved() {
    if (!dirtyStatus || currentInputSnapshot() === lastSavedSnapshot) return true;
    return window.confirm("You have unsaved changes. Discard them?");
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

  function calculateProject(sectionsInput, screenTypeInputValue) {
    var sectionResults = [];
    var screenSectionMetrics = [];
    var cuts1x1 = [];
    var cuts1x2 = [];
    var cuts2x2 = [];
    var cutsFlex = [];
    var totalArea = 0;
    var doorCount = 0;
    var doorCost = 0;
    var kickPlateLf = 0;
    var screenType = normalizeScreenType(screenTypeInputValue);
    var frameBySection = getSectionFrameCuts(sectionsInput);

    sectionsInput.forEach(function (s, index) {
      var width = roundLf(toFeet(s.widthFt, s.widthIn));
      var height = roundLf(toFeet(s.heightFt, s.heightIn));
      var isArch = isArchSection(s);
      var riseFt = isArch ? getArchRiseFt(s) : 0;
      var centerH = isArch ? getCenterHeightFt(s) : height;
      var flexLf = isArch ? getArchFlexibleLength(s) : 0;
      var areaSqft = roundLf(width * height + (isArch ? circularSegmentArea(width, riseFt) : 0));
      var frame = frameBySection[index] || {
        leftMember: MEMBER_DEFAULT,
        rightMember: MEMBER_DEFAULT,
        topMember: MEMBER_DEFAULT,
        bottomMember: MEMBER_DEFAULT,
        cuts1x1: [],
        cuts1x2: [],
        cuts2x2: [],
        cutsFlex: [],
        archRiseFt: 0,
        flexLf: 0,
      };

      var section1x1Cuts = frame.cuts1x1.slice();
      var section1x2Cuts = frame.cuts1x2.slice();
      var frame2x2Cuts = frame.cuts2x2.slice();
      var door2x2Cuts = [];
      var kick2x2Cuts = [];
      var kickSegments = [];
      var chair2x2Cuts = [];
      var chairSegments = [];
      var zBarCount = 0;
      var openings = s.door || s.kickPlate || s.chairRail ? getDoorOpenings(s, width) : [];
      var sectionDoorSqFt = 0;
      var sectionKickSqFt = 0;
      var sectionKickLf = 0;

      if (s.door) {
        var door = getDoorConstruction(s);
        doorCount += 1;
        doorCost += getDoorPrice(s);
        zBarCount = doorZBarCount(s);
        openings.forEach(function (op) {
          if (roundLf(op.left) > 0.05) {
            door2x2Cuts.push(getDoorPostHeightFt(s, width, op.left, height));
          }
          if (roundLf(width - op.right) > 0.05) {
            door2x2Cuts.push(getDoorPostHeightFt(s, width, op.right, height));
          }
          if (door.header === "2x2") door2x2Cuts.push(roundLf(op.width) || DOOR_HEADER_FT);
          else if (door.header === "1x2") section1x2Cuts.push(roundLf(op.width) || DOOR_HEADER_FT);
          else if (door.header === "1x1") section1x1Cuts.push(roundLf(op.width) || DOOR_HEADER_FT);
        });
        if (openings.length) {
          // Door unit replaces enclosure screen in its opening (standard or custom size).
          sectionDoorSqFt = roundLf(
            Math.min(getDoorWidthFt(s), width) * Math.min(getDoorHeightFt(s), height)
          );
        }
      }
      if (s.kickPlate) {
        // Kick plate never runs under doors — each wall run is a separate continuous cut.
        kickSegments = getKickPlateSegments(width, openings);
        kick2x2Cuts = kickSegments.map(function (seg) {
          return seg.length;
        });
        sectionKickLf = roundLf(
          kickSegments.reduce(function (sum, seg) {
            return sum + seg.length;
          }, 0)
        );
        kickPlateLf += sectionKickLf;
        // Solid kick plate band is not screen; openings already excluded from LF.
        sectionKickSqFt = roundLf(sectionKickLf * getKickPlateHeightFt(s));
      }
      if (s.chairRail) {
        // Chair rail never runs through doors — each wall run is a separate continuous cut.
        chairSegments = getChairRailSegments(width, openings);
        var chairMember = getChairRailMember(s);
        var chairLens = chairSegments.map(function (seg) {
          return seg.length;
        });
        if (chairMember === "1x2") section1x2Cuts = section1x2Cuts.concat(chairLens);
        else if (chairMember === "1x1") section1x1Cuts = section1x1Cuts.concat(chairLens);
        else chair2x2Cuts = chairLens;
      }

      var section2x2Cuts = frame2x2Cuts.concat(door2x2Cuts, kick2x2Cuts, chair2x2Cuts);
      var sectionFlexCuts = (frame.cutsFlex || []).slice();

      cuts1x1 = cuts1x1.concat(section1x1Cuts);
      cuts1x2 = cuts1x2.concat(section1x2Cuts);
      cuts2x2 = cuts2x2.concat(section2x2Cuts);
      cutsFlex = cutsFlex.concat(sectionFlexCuts);
      totalArea += areaSqft;

      screenSectionMetrics.push({
        grossSqFt: areaSqft,
        doorSqFt: sectionDoorSqFt,
        kickPlateSqFt: sectionKickSqFt,
      });

      function sumCuts(arr) {
        return roundLf(
          (arr || []).reduce(function (sum, c) {
            return sum + c;
          }, 0)
        );
      }

      var frame1x1Lf = sumCuts(section1x1Cuts);
      var frame1x2Lf = sumCuts(section1x2Cuts);
      var frame2x2Lf = sumCuts(frame2x2Cuts);
      var door2x2Lf = sumCuts(door2x2Cuts);
      var kick2x2Lf = sumCuts(kick2x2Cuts);
      var chair2x2Lf = sumCuts(chair2x2Cuts);

      sectionResults.push({
        index: index + 1,
        width: width,
        height: height,
        centerHeight: centerH,
        archRiseFt: riseFt,
        openingShape: isArch ? "arch" : "rectangle",
        straightAngle2x2: isStraightAngle2x2(s),
        areaSqft: areaSqft,
        screenGrossSqFt: areaSqft,
        screenDoorSqFt: sectionDoorSqFt,
        screenKickPlateSqFt: sectionKickSqFt,
        door: s.door,
        customDoor: isCustomDoor(s),
        doorPrice: s.door ? getDoorPrice(s) : 0,
        doorSizeLabel: s.door ? formatDoorSizeLabel(s) : "",
        doorPosition: normalizeDoorPosition(s.doorPosition) || "",
        kickPlate: s.kickPlate,
        chairRail: s.chairRail,
        leftMember: frame.leftMember,
        rightMember: frame.rightMember,
        topMember: frame.topMember,
        bottomMember: frame.bottomMember,
        cuts1x1: section1x1Cuts,
        cuts1x2: section1x2Cuts,
        frame2x2Cuts: frame2x2Cuts,
        cuts2x2: section2x2Cuts,
        cutsFlex: sectionFlexCuts,
        kick2x2Cuts: kick2x2Cuts,
        kickPlateSegments: kickSegments,
        chair2x2Cuts: chair2x2Cuts,
        chairRailSegments: chairSegments,
        track1x1Lf: frame1x1Lf,
        track1x2Lf: frame1x2Lf,
        frame2x2Lf: frame2x2Lf,
        door2x2Lf: door2x2Lf,
        kick2x2Lf: kick2x2Lf,
        chair2x2Lf: chair2x2Lf,
        track2x2Lf: roundLf(frame2x2Lf + door2x2Lf + kick2x2Lf + chair2x2Lf),
        flexLf: flexLf,
        zBarCount: zBarCount,
        doorConstruction: s.door ? getDoorConstruction(s) : null,
        kickPlateHeightIn: s.kickPlate ? getKickPlateHeightIn(s) : 0,
        chairRailMember: s.chairRail ? getChairRailMember(s) : "",
      });
    });

    var screenCalc = calculateScreenMaterialFromMetrics(screenSectionMetrics, screenType);
    var screenCost = screenCalc.materialCost;

    var pack1x1 = packCuts(cuts1x1, STICK_FT);
    var pack1x2 = packCuts(cuts1x2, STICK_FT);
    var pack2x2 = packCuts(cuts2x2, STICK_FT);
    var flexLfTotal = roundLf(
      cutsFlex.reduce(function (sum, c) {
        return sum + c;
      }, 0)
    );
    var flexSticks = flexStickCount(flexLfTotal);
    var flexCost = flexSticks * PRICE_FLEX_STICK;
    var track1x1Sticks = pack1x1.stickCount;
    var track1x1Cost = track1x1Sticks * PRICE_1X1_STICK;
    var track1x2Sticks = pack1x2.stickCount;
    var track1x2Cost = track1x2Sticks * PRICE_1X2_STICK;
    var track2x2Sticks = pack2x2.stickCount;
    var track2x2Cost = track2x2Sticks * PRICE_2X2_STICK;
    var zBarCount = doorCount;
    var kickPlateCost = kickPlateLf * PRICE_KICK_PLATE_PER_FT;
    var kickMoldingCost = kickPlateLf * PRICE_KICK_MOLDING_PER_FT;

    var materialCost =
      track1x1Cost +
      track1x2Cost +
      track2x2Cost +
      flexCost +
      doorCost +
      kickPlateCost +
      kickMoldingCost +
      PRICE_SCREWS +
      PRICE_OVERHEAD +
      screenCost;

    // Worker pay is included inside the final price: (Material + Total Worker Pay) / 0.70
    // Total covers 2 workers (e.g. $1,800 final → $200 each / $400 total).
    var workerPay = materialCost * WORKER_RATE;
    var payPerWorker = workerPay / 2;
    var costPlusLabor = materialCost + workerPay;
    var calculatedPrice = costPlusLabor / MARKUP_DIVISOR;

    return {
      sections: sectionResults,
      areaSqft: roundLf(totalArea),
      cuts1x1: pack1x1.cuts,
      cuts1x2: pack1x2.cuts,
      cuts2x2: pack2x2.cuts,
      pack1x1: pack1x1,
      pack1x2: pack1x2,
      pack2x2: pack2x2,
      track1x1Lf: pack1x1.totalLf,
      track1x1Sticks: track1x1Sticks,
      track1x1Cost: track1x1Cost,
      track1x2Lf: pack1x2.totalLf,
      track1x2Sticks: track1x2Sticks,
      track1x2Cost: track1x2Cost,
      track2x2Lf: pack2x2.totalLf,
      track2x2Sticks: track2x2Sticks,
      track2x2Cost: track2x2Cost,
      flexLf: flexLfTotal,
      flexCuts: cutsFlex,
      flexSticks: flexSticks,
      flexCost: flexCost,
      doorCount: doorCount,
      doorCost: doorCost,
      zBarCount: zBarCount,
      kickPlateLf: roundLf(kickPlateLf),
      kickPlateCost: kickPlateCost,
      kickMoldingCost: kickMoldingCost,
      screws: PRICE_SCREWS,
      overhead: PRICE_OVERHEAD,
      screenType: screenCalc.screenType,
      screenTypeLabel: screenCalc.screenTypeLabel,
      screenPricePerSqFt: screenCalc.pricePerSqFt,
      grossScreenSqFt: screenCalc.grossSqFt,
      netScreenSqFt: screenCalc.netSqFt,
      screenDoorSqFt: screenCalc.doorSqFt,
      screenKickPlateSqFt: screenCalc.kickPlateSqFt,
      screenDeductionsSqFt: screenCalc.deductionsSqFt,
      screenMaterialCost: screenCalc.materialCost,
      screenCost: screenCost,
      materialCost: materialCost,
      workerPay: workerPay,
      payPerWorker: payPerWorker,
      costPlusLabor: costPlusLabor,
      calculatedPrice: calculatedPrice,
      hasOversizedCuts: pack1x1.exceedsStock || pack1x2.exceedsStock || pack2x2.exceedsStock,
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
      add(
        "Opening",
        s.openingShape === "arch"
          ? num(s.width, 2) +
            " ft W × " +
            num(s.height, 2) +
            " ft straight × " +
            num(s.centerHeight, 2) +
            " ft center (rise " +
            num(s.archRiseFt, 2) +
            " ft)"
          : num(s.width, 2) + " ft W × " + num(s.height, 2) + " ft H"
      );
      add("Area", num(s.areaSqft, 1) + " sqft");
      add(
        "Frame / posts",
        s.openingShape === "arch"
          ? "L " +
            formatMemberShort(s.leftMember) +
            " · R " +
            formatMemberShort(s.rightMember) +
            (s.straightAngle2x2 ? " · Arch base 2x2" : "") +
            " · Arch 1x1/2 Flexible · B " +
            formatMemberShort(s.bottomMember)
          : "L " +
            formatMemberShort(s.leftMember) +
            " · R " +
            formatMemberShort(s.rightMember) +
            " · T " +
            formatMemberShort(s.topMember) +
            " · B " +
            formatMemberShort(s.bottomMember)
      );
      if (s.openingShape === "arch" && s.straightAngle2x2) {
        add("Arch base 2x2", num(s.width, 2) + " ft (full width at straight height)");
      }
      if (s.openingShape === "arch" && !s.straightAngle2x2 && s.door) {
        add("2x2 at Straight Angle", "No — door posts extend to the arch");
      }
      if (s.cuts1x1 && s.cuts1x1.length) {
        add("1x1 frame cuts", formatCutList(s.cuts1x1) + " (" + num(s.track1x1Lf, 1) + " LF)");
      }
      add(
        "1x2 frame cuts",
        s.cuts1x2 && s.cuts1x2.length
          ? formatCutList(s.cuts1x2) + " (" + num(s.track1x2Lf, 1) + " LF)"
          : "none"
      );
      if (s.flexLf > 0) {
        add(
          "1x1/2 Flexible (arch)",
          formatCutList(s.cutsFlex) + " (" + num(s.flexLf, 2) + " LF)"
        );
      }
      if (s.frame2x2Cuts && s.frame2x2Cuts.length) {
        add(
          "2x2 frame cuts",
          formatCutList(s.frame2x2Cuts) + " (" + num(s.frame2x2Lf, 1) + " LF)"
        );
      }
      if (s.door) {
        add(
          "Door",
          (s.doorSizeLabel || '36" × 80"') +
            (s.customDoor ? " · Custom Door" : "") +
            " · Position: " +
            (normalizeDoorPosition(s.doorPosition) || "—")
        );
        if (s.customDoor) {
          add("Custom Door Price", money(s.doorPrice));
        }
        add(
          "Door posts",
          formatMemberLabel(DOOR_LEFT_POST_DEFAULT, false) +
            " left / " +
            formatMemberLabel(DOOR_RIGHT_POST_DEFAULT, false) +
            " right"
        );
        add("Door frame", formatMemberLabel("z-bar-door", false));
        add("Above door", formatMemberLabel(MEMBER_2X2_ZBAR, false));
        if (s.door2x2Cuts && s.door2x2Cuts.length) {
          add("Door 2x2 cuts", formatCutList(s.door2x2Cuts) + " (" + num(s.door2x2Lf, 1) + " LF)");
        }
        add("Z-Bar", String(s.zBarCount || 0) + " pc");
      }
      if (s.kickPlate) {
        add(
          "Kick plate LF",
          num(s.kick2x2Lf, 2) +
            " LF · " +
            formatKickPlateLabel(s, false)
        );
        add(
          "Kick plate 2x2 cuts",
          s.kick2x2Cuts && s.kick2x2Cuts.length
            ? formatCutList(s.kick2x2Cuts)
            : "none"
        );
      }
      if (s.chairRail) {
        add(
          "Chair rail LF",
          num(s.chair2x2Lf, 2) +
            " LF · " +
            formatChairRailLabel(s, false)
        );
        add(
          "Chair rail 2x2 cuts",
          s.chair2x2Cuts && s.chair2x2Cuts.length
            ? formatCutList(s.chair2x2Cuts)
            : "none"
        );
      }
      if (!s.door && !s.kickPlate && !s.chairRail && !(s.frame2x2Cuts && s.frame2x2Cuts.length)) {
        add("Other 2x2 cuts", "none");
      }
      block.appendChild(dl);
      resultsBody.appendChild(block);
    });

    var total = document.createElement("section");
    total.className = "admin-porch-section-result admin-porch-section-result--total";
    var th = document.createElement("h3");
    th.textContent = "PROJECT TOTAL";
    total.appendChild(th);

    if (r.pack1x1 && r.pack1x1.cuts && r.pack1x1.cuts.length) {
      appendCutPlan(total, "1x1 CUT PLAN", r.pack1x1, PRICE_1X1_STICK);
    }
    appendCutPlan(total, "1x2 CUT PLAN", r.pack1x2, PRICE_1X2_STICK);
    appendCutPlan(total, "2x2 CUT PLAN", r.pack2x2, PRICE_2X2_STICK);
    if (r.flexLf > 0) {
      var flexNote = document.createElement("div");
      flexNote.className = "admin-porch-cutplan";
      var flexH = document.createElement("h4");
      flexH.className = "admin-porch-cutplan__title";
      flexH.textContent = "1x1/2 FLEXIBLE (20 ft sticks)";
      flexNote.appendChild(flexH);
      var flexReq = document.createElement("p");
      flexReq.className = "admin-porch-cutplan__required";
      flexReq.textContent =
        "Required curved length: " +
        (r.flexCuts && r.flexCuts.length ? formatCutList(r.flexCuts) : num(r.flexLf, 2) + " ft") +
        " · " +
        r.flexSticks +
        " stick(s) × " +
        money(PRICE_FLEX_STICK) +
        " = " +
        money(r.flexCost);
      flexNote.appendChild(flexReq);
      total.appendChild(flexNote);
    }

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
    if (r.track1x1Lf > 0) {
      trow(
        "1x1 track",
        num(r.track1x1Lf, 1) +
          " LF · " +
          r.track1x1Sticks +
          " stick(s) · " +
          money(r.track1x1Cost) +
          " (no splicing)"
      );
    }
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
    if (r.flexLf > 0) {
      trow(
        "1x1/2 Flexible Aluminum (20 ft)",
        num(r.flexLf, 2) +
          " LF · " +
          r.flexSticks +
          " stick(s) · " +
          money(r.flexCost) +
          " (round up)"
      );
    }
    trow("Doors", r.doorCount + " · " + money(r.doorCost));
    trow("Z-Bar", (r.zBarCount || 0) + " pc");
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
    total.appendChild(tdl);

    var screenNote = document.createElement("div");
    screenNote.className = "admin-porch-cutplan";
    var screenH = document.createElement("h4");
    screenH.className = "admin-porch-cutplan__title";
    screenH.textContent = "SCREEN";
    screenNote.appendChild(screenH);
    var screenDl = document.createElement("dl");
    screenDl.className = "admin-porch-dl";
    function srow(label, value, strong) {
      var dt = document.createElement("dt");
      dt.textContent = label;
      if (strong) dt.className = "is-strong";
      var dd = document.createElement("dd");
      dd.textContent = value;
      if (strong) dd.className = "is-strong";
      screenDl.appendChild(dt);
      screenDl.appendChild(dd);
    }
    srow("Type", r.screenTypeLabel || r.screenType || DEFAULT_SCREEN_TYPE);
    srow("Screen area", num(r.netScreenSqFt || 0, 2) + " sqft");
    if ((r.screenDeductionsSqFt || 0) > 0) {
      srow(
        "Gross area",
        num(r.grossScreenSqFt || 0, 2) +
          " sqft (−" +
          num(r.screenDeductionsSqFt || 0, 2) +
          " openings)"
      );
    }
    srow(
      "Price per sqft",
      "$" +
        Number(r.screenPricePerSqFt || 0).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
    );
    srow(
      "Screen material",
      money(r.screenMaterialCost != null ? r.screenMaterialCost : r.screenCost || 0),
      true
    );
    screenNote.appendChild(screenDl);
    total.appendChild(screenNote);

    var tdl2 = document.createElement("dl");
    tdl2.className = "admin-porch-dl";
    function trow2(label, value, strong) {
      var dt = document.createElement("dt");
      dt.textContent = label;
      if (strong) dt.className = "is-strong";
      var dd = document.createElement("dd");
      dd.textContent = value;
      if (strong) dd.className = "is-strong";
      tdl2.appendChild(dt);
      tdl2.appendChild(dd);
    }
    trow2("Material Cost", money(r.materialCost), true);
    trow2("Worker Pay — Total (2 workers)", money(r.workerPay), true);
    trow2("Pay Per Worker", money(r.payPerWorker), true);
    trow2("Cost + Labor", money(r.costPlusLabor), true);
    trow2("Calculated Price (÷ 0.70)", money(r.calculatedPrice), true);
    total.appendChild(tdl2);
    resultsBody.appendChild(total);

    resultsEl.hidden = false;
    resultsEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function validateSections(sections) {
    for (var i = 0; i < sections.length; i++) {
      var s = sections[i];
      if (toFeet(s.widthFt, s.widthIn) <= 0 || toFeet(s.heightFt, s.heightIn) <= 0) {
        return "Section " + (i + 1) + ": enter a valid width and height.";
      }
      if (isArchSection(s) && getCenterHeightFt(s) <= getStraightHeightFt(s)) {
        return (
          "Section " +
          (i + 1) +
          ": Center Height must be greater than Straight Height."
        );
      }
      if (s.door && !normalizeDoorPosition(s.doorPosition)) {
        return "Section " + (i + 1) + ": select Door Position (Left / Center / Right).";
      }
      if (isCustomDoor(s)) {
        if (getDoorWidthFt(s) <= 0 || getDoorHeightFt(s) <= 0) {
          return "Section " + (i + 1) + ": enter Custom Door width and height.";
        }
      }
    }
    return "";
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
    setScreenType(DEFAULT_SCREEN_TYPE);
    clearSections();
    addSection({
      widthFt: 12,
      widthIn: 10,
      heightFt: 8,
      heightIn: 5,
      door: true,
      doorPosition: "left",
      kickPlate: false,
      chairRail: false,
      leftMember: MEMBER_DEFAULT,
      rightMember: MEMBER_DEFAULT,
      topMember: MEMBER_DEFAULT,
      bottomMember: MEMBER_DEFAULT,
      openingShape: "rectangle",
      centerHeightFt: 10,
      centerHeightIn: 0,
    });
    lastTotals = null;
    resultsBody.innerHTML =
      '<p class="admin-porch-hint">Click Calculate to see pricing and cut plans.</p>';
    setSaveStatus("");
    syncDeleteVisibility();
    refreshLayout();
    markClean();
  }

  function loadEstimateIntoForm(estimate) {
    applyingSaved = true;
    estimateIdInput.value = estimate.id || "";
    titleInput.value = estimate.title || estimate.name || "";
    projectTypeInput.value = estimate.projectType === "back" ? "back" : "front";
    notesInput.value = estimate.notes || "";
    setScreenType(estimate.screenType || DEFAULT_SCREEN_TYPE);
    clearSections();
    var sections = Array.isArray(estimate.sections) ? estimate.sections : [];
    if (!sections.length) {
      addSection();
    } else {
      sections.forEach(function (s) {
        addSection(s);
      });
    }
    lastTotals = calculateProject(readSections(), readScreenType());
    renderResults(lastTotals);
    refreshLayout();
    setSaveStatus("Loaded “" + (estimate.title || estimate.name || estimate.id) + "”");
    applyingSaved = false;
    markClean();
  }

  function buildPayload() {
    var sections = readSections();
    var screenType = readScreenType();
    var totals = calculateProject(sections, screenType);
    lastTotals = totals;
    return {
      title: titleInput.value.trim(),
      name: titleInput.value.trim(),
      projectType: projectTypeInput.value,
      notes: notesInput.value.trim(),
      screenType: screenType,
      screenCost: totals.screenMaterialCost,
      sections: sections,
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
        var card = document.createElement("div");
        card.className = "admin-porch-saved-item";
        if (item.id === estimateIdInput.value) card.classList.add("is-active");
        var titleBtn = document.createElement("button");
        titleBtn.type = "button";
        titleBtn.className = "admin-porch-saved-item__title";
        titleBtn.textContent = item.name || item.title || item.id;
        titleBtn.addEventListener("click", function () {
          openEstimate(item.id);
        });
        var meta = document.createElement("span");
        meta.className = "admin-porch-saved-item__meta";
        meta.textContent =
          (item.projectType === "back" ? "Back porch" : "Front porch") +
          (formatModifiedDate(item.updatedAt) ? " · " + formatModifiedDate(item.updatedAt) : "");
        var actions = document.createElement("div");
        actions.className = "admin-porch-saved-item__actions";
        function smallBtn(label, handler) {
          var b = document.createElement("button");
          b.type = "button";
          b.className = "btn btn-secondary";
          b.textContent = label;
          b.addEventListener("click", handler);
          return b;
        }
        actions.appendChild(
          smallBtn("OPEN", function () {
            openEstimate(item.id);
          })
        );
        actions.appendChild(
          smallBtn("DUPLICATE", function () {
            duplicateSavedEstimate(item.id);
          })
        );
        actions.appendChild(
          smallBtn("DELETE", function () {
            deleteSavedEstimate(item.id);
          })
        );
        card.appendChild(titleBtn);
        card.appendChild(meta);
        card.appendChild(actions);
        li.appendChild(card);
        savedList.appendChild(li);
      });
    } catch (err) {
      if (storageModeEl) storageModeEl.textContent = "Could not reach estimate database.";
    }
  }

  async function openEstimate(id) {
    if (!confirmDiscardUnsaved()) return;
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

  async function saveEstimate(asNew) {
    var payload = buildPayload();
    var err = validateSections(payload.sections);
    if (err) {
      setSaveStatus(err, true);
      return;
    }
    renderResults(lastTotals);
    setSaveStatus("Saving…");
    if (saveBtn) saveBtn.disabled = true;
    if (saveAsBtn) saveAsBtn.disabled = true;
    try {
      var id = asNew ? "" : estimateIdInput.value;
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
      var savedTitle = data.estimate.title || data.estimate.name || "";
      if (!titleInput.value.trim() && savedTitle) {
        titleInput.value = savedTitle;
      }
      setSaveStatus("Saved “" + savedTitle + "”");
      markClean();
      refreshSavedList();
      refreshLayout();
    } catch (err) {
      setSaveStatus("Network error while saving.", true);
    } finally {
      if (saveBtn) saveBtn.disabled = false;
      if (saveAsBtn) saveAsBtn.disabled = false;
    }
  }

  async function duplicateSavedEstimate(id) {
    setSaveStatus("Duplicating…");
    try {
      var res = await fetch("/api/admin/estimates?id=" + encodeURIComponent(id), {
        method: "GET",
        credentials: "same-origin",
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data.ok || !data.estimate) {
        setSaveStatus(data.error || "Could not duplicate estimate.", true);
        return;
      }
      var source = data.estimate;
      var copyPayload = {
        title: "Copy of " + (source.title || source.name || "estimate"),
        name: "Copy of " + (source.title || source.name || "estimate"),
        projectType: source.projectType,
        notes: source.notes || "",
        screenType: source.screenType || DEFAULT_SCREEN_TYPE,
        screenCost: source.screenCost || 0,
        sections: source.sections || [],
      };
      var saveRes = await fetch("/api/admin/estimates", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(copyPayload),
      });
      var saved = await saveRes.json().catch(function () {
        return {};
      });
      if (!saveRes.ok || !saved.ok) {
        setSaveStatus(saved.error || "Could not duplicate estimate.", true);
        return;
      }
      if (!confirmDiscardUnsaved()) {
        refreshSavedList();
        setSaveStatus("Duplicated “" + saved.estimate.title + "”");
        return;
      }
      loadEstimateIntoForm(saved.estimate);
      refreshSavedList();
    } catch (err) {
      setSaveStatus("Network error while duplicating.", true);
    }
  }

  async function deleteSavedEstimate(id) {
    if (!id) return;
    if (!window.confirm("Delete this saved estimate? This cannot be undone.")) return;
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
      if (estimateIdInput.value === id) resetEstimateForm();
      setSaveStatus("Estimate deleted.");
      refreshSavedList();
    } catch (err) {
      setSaveStatus("Network error while deleting.", true);
    }
  }

  async function deleteCurrentEstimate() {
    await deleteSavedEstimate(estimateIdInput.value);
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
      scheduleLayoutRefresh();
      scheduleDirtyCheck();
    } else if (action === "duplicate") {
      addSection(readSectionCard(card), card);
      scheduleDirtyCheck();
    }
  });

  sectionsEl.addEventListener("change", function (e) {
    var target = e.target;
    if (!target || !target.getAttribute) return;
    if (target.getAttribute("data-field") === "door") {
      var card = target.closest("[data-section]");
      if (card) {
        var customEl = card.querySelector('[data-field="customDoor"]');
        if (target.value === "yes" && customEl) customEl.value = "no";
        syncDoorPositionVisibility(card);
      }
    }
    if (target.getAttribute("data-field") === "customDoor") {
      var customCard = target.closest("[data-section]");
      if (customCard) syncDoorPositionVisibility(customCard);
    }
    if (target.getAttribute("data-field") === "openingShape") {
      var shapeCard = target.closest("[data-section]");
      if (shapeCard) syncOpeningShapeVisibility(shapeCard);
    }
    scheduleLayoutRefresh();
    scheduleDirtyCheck();
  });
  sectionsEl.addEventListener("input", function () {
    scheduleLayoutRefresh();
    scheduleDirtyCheck();
  });
  if (titleInput) titleInput.addEventListener("input", function () {
    scheduleLayoutRefresh();
    scheduleDirtyCheck();
  });
  if (projectTypeInput) projectTypeInput.addEventListener("change", function () {
    scheduleLayoutRefresh();
    scheduleDirtyCheck();
  });
  if (notesInput) notesInput.addEventListener("input", scheduleDirtyCheck);
  if (screenTypeInput) {
    screenTypeInput.addEventListener("change", function () {
      updateScreenTypeHint();
      scheduleDirtyCheck();
    });
  }

  if (addSectionBtn) {
    addSectionBtn.addEventListener("click", function () {
      addSection();
      scheduleDirtyCheck();
    });
  }

  if (newBtn) {
    newBtn.addEventListener("click", function () {
      if (!confirmDiscardUnsaved()) return;
      resetEstimateForm();
      refreshSavedList();
    });
  }

  if (saveBtn) saveBtn.addEventListener("click", function () {
    saveEstimate(false);
  });
  if (saveAsBtn) saveAsBtn.addEventListener("click", function () {
    saveEstimate(true);
  });
  if (deleteBtn) deleteBtn.addEventListener("click", deleteCurrentEstimate);

  calcForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var sections = readSections();
    var err = validateSections(sections);
    if (!sections.length || err) {
      resultsBody.innerHTML =
        '<p class="admin-porch-hint">' +
        escapeXml(err || "Enter valid width and height for every section.") +
        "</p>";
      return;
    }
    lastTotals = calculateProject(sections, readScreenType());
    renderResults(lastTotals);
    refreshLayout();
    setSaveStatus("");
  });

  if (printLayoutBtn) printLayoutBtn.addEventListener("click", printLayout);
  if (downloadLayoutBtn) downloadLayoutBtn.addEventListener("click", downloadLayout);
  if (downloadMaterialBtn) downloadMaterialBtn.addEventListener("click", downloadMaterialList);

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
    window.location.replace("/admin/estimator-panel.html");
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
        window.location.replace("/admin/estimator-panel.html");
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
      window.location.replace("/admin/estimator-panel.html");
    });
  }

  checkSession();
})();
