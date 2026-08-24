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
   * Door and kick-plate areas must already exclude overlapping regions
   * (kick plate LF excludes door openings in the porch calculator).
   *
   * @param {Array<{grossSqFt:number, doorSqFt?:number, kickPlateSqFt?:number}>} sectionMetrics
   * @param {string} screenType
   * @returns {{
   *   screenType: string,
   *   screenTypeLabel: string,
   *   pricePerSqFt: number,
   *   grossSqFt: number,
   *   doorSqFt: number,
   *   kickPlateSqFt: number,
   *   deductionsSqFt: number,
   *   netSqFt: number,
   *   materialCost: number
   * }}
   */
  function calculateScreenMaterial(sectionMetrics, screenType) {
    var config = getScreenTypeConfig(screenType);
    var gross = 0;
    var door = 0;
    var kick = 0;

    (sectionMetrics || []).forEach(function (m) {
      if (!m) return;
      gross += Math.max(0, Number(m.grossSqFt) || 0);
      door += Math.max(0, Number(m.doorSqFt) || 0);
      kick += Math.max(0, Number(m.kickPlateSqFt) || 0);
    });

    gross = roundSqFt(gross);
    door = roundSqFt(door);
    kick = roundSqFt(kick);
    var deductions = roundSqFt(door + kick);
    var net = Math.max(0, roundSqFt(gross - deductions));
    var materialCost = roundMoney(net * config.pricePerSqFt);

    return {
      screenType: config.id,
      screenTypeLabel: config.label,
      pricePerSqFt: config.pricePerSqFt,
      grossSqFt: gross,
      doorSqFt: door,
      kickPlateSqFt: kick,
      deductionsSqFt: deductions,
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
