/**
 * Screen material config + calculation for the Front / Back Porch Calculator.
 * Single source of truth for mesh types and $/sqft pricing.
 */
(function (root) {
  "use strict";

  var SCREEN_TYPES = {
    "18/14": {
      label: "18/14",
      pricePerSqFt: 0.2,
    },
    "20/20": {
      label: "20/20",
      pricePerSqFt: 0.35,
    },
    "16/14": {
      label: "16/14",
      pricePerSqFt: 0.38,
    },
    "17/20": {
      label: "17/20",
      pricePerSqFt: 0.42,
    },
  };

  var DEFAULT_SCREEN_TYPE = "18/14";

  function roundSqFt(n) {
    return Math.round(Number(n) * 1000) / 1000;
  }

  function roundMoney(n) {
    return Math.round(Number(n) * 100) / 100;
  }

  function normalizeScreenType(value) {
    var key = String(value == null ? "" : value).trim();
    if (Object.prototype.hasOwnProperty.call(SCREEN_TYPES, key)) return key;
    return DEFAULT_SCREEN_TYPE;
  }

  function getScreenTypeConfig(type) {
    var key = normalizeScreenType(type);
    var cfg = SCREEN_TYPES[key];
    return {
      id: key,
      label: cfg.label,
      pricePerSqFt: cfg.pricePerSqFt,
    };
  }

  function listScreenTypes() {
    return Object.keys(SCREEN_TYPES).map(function (id) {
      return getScreenTypeConfig(id);
    });
  }

  /**
   * Deterministic screen material calculation from per-section metrics.
   *
   * Screen doors (standard and custom) still use screen mesh — do NOT deduct
   * door openings. Only subtract solid non-screen areas such as kick plate.
   * Kick plate LF already excludes door openings in the porch calculator.
   *
   * @param {Array<{grossSqFt:number, kickPlateSqFt?:number, nonScreenSqFt?:number}>} sectionMetrics
   * @param {string} screenType
   * @returns {{
   *   screenType: string,
   *   screenTypeLabel: string,
   *   pricePerSqFt: number,
   *   grossSqFt: number,
   *   kickPlateSqFt: number,
   *   nonScreenSqFt: number,
   *   deductionsSqFt: number,
   *   netSqFt: number,
   *   materialCost: number
   * }}
   */
  function calculateScreenMaterial(sectionMetrics, screenType) {
    var config = getScreenTypeConfig(screenType);
    var gross = 0;
    var kick = 0;
    var otherNonScreen = 0;

    (sectionMetrics || []).forEach(function (m) {
      if (!m) return;
      gross += Math.max(0, Number(m.grossSqFt) || 0);
      kick += Math.max(0, Number(m.kickPlateSqFt) || 0);
      otherNonScreen += Math.max(0, Number(m.nonScreenSqFt) || 0);
    });

    gross = roundSqFt(gross);
    kick = roundSqFt(kick);
    otherNonScreen = roundSqFt(otherNonScreen);
    var nonScreen = roundSqFt(kick + otherNonScreen);
    var net = Math.max(0, roundSqFt(gross - nonScreen));
    var materialCost = roundMoney(net * config.pricePerSqFt);

    return {
      screenType: config.id,
      screenTypeLabel: config.label,
      pricePerSqFt: config.pricePerSqFt,
      grossSqFt: gross,
      kickPlateSqFt: kick,
      nonScreenSqFt: nonScreen,
      deductionsSqFt: nonScreen,
      netSqFt: net,
      materialCost: materialCost,
    };
  }

  root.PorchScreen = {
    SCREEN_TYPES: SCREEN_TYPES,
    DEFAULT_SCREEN_TYPE: DEFAULT_SCREEN_TYPE,
    normalizeScreenType: normalizeScreenType,
    getScreenTypeConfig: getScreenTypeConfig,
    listScreenTypes: listScreenTypes,
    calculateScreenMaterial: calculateScreenMaterial,
  };
})(typeof window !== "undefined" ? window : globalThis);
