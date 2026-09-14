/**
 * Deterministic Screen Armors service-area checks.
 * Do not let the LLM invent eligibility — call checkServiceArea() server-side.
 */

export const PRIMARY_SERVICE_COUNTIES = [
  "Sarasota County",
  "Manatee County",
  "Charlotte County",
];

/** Canonical display name -> county label (for reason strings). */
export const IN_AREA_CITIES = {
  // Sarasota County
  Sarasota: "Sarasota County",
  Venice: "Sarasota County",
  "North Port": "Sarasota County",
  Nokomis: "Sarasota County",
  Osprey: "Sarasota County",
  Englewood: "Sarasota / Charlotte County",

  // Manatee County
  Bradenton: "Manatee County",
  "Lakewood Ranch": "Manatee County",
  Parrish: "Manatee County",
  Ellenton: "Manatee County",
  Palmetto: "Manatee County",
  "Longboat Key": "Manatee County",

  // Charlotte County
  "Port Charlotte": "Charlotte County",
  "Punta Gorda": "Charlotte County",
  "Rotonda West": "Charlotte County",
};

/** Explicit out-of-area cities (canonical display names). */
export const OUT_OF_AREA_CITIES = [
  "Tampa",
  "St. Petersburg",
  "Clearwater",
  "Orlando",
  "Fort Myers",
  "Naples",
  "Brandon",
  "Riverview",
];

/**
 * Lowercase compact key -> canonical city name.
 * Includes common spelling variants.
 */
const CITY_ALIASES = {
  // In-area
  sarasota: "Sarasota",
  venice: "Venice",
  "north port": "North Port",
  northport: "North Port",
  nokomis: "Nokomis",
  osprey: "Osprey",
  englewood: "Englewood",
  bradenton: "Bradenton",
  "lakewood ranch": "Lakewood Ranch",
  lakewoodranch: "Lakewood Ranch",
  parrish: "Parrish",
  ellenton: "Ellenton",
  palmetto: "Palmetto",
  "longboat key": "Longboat Key",
  longboatkey: "Longboat Key",
  longboat: "Longboat Key",
  "port charlotte": "Port Charlotte",
  portcharlotte: "Port Charlotte",
  "punta gorda": "Punta Gorda",
  puntagorda: "Punta Gorda",
  "rotonda west": "Rotonda West",
  rotondawest: "Rotonda West",
  rotonda: "Rotonda West",

  // Counties (treat as in-area)
  "sarasota county": "Sarasota County",
  "manatee county": "Manatee County",
  "charlotte county": "Charlotte County",

  // Out-of-area
  tampa: "Tampa",
  "st petersburg": "St. Petersburg",
  "st. petersburg": "St. Petersburg",
  "saint petersburg": "St. Petersburg",
  stpetersburg: "St. Petersburg",
  clearwater: "Clearwater",
  orlando: "Orlando",
  "fort myers": "Fort Myers",
  fortmyers: "Fort Myers",
  "ft myers": "Fort Myers",
  "ft. myers": "Fort Myers",
  naples: "Naples",
  brandon: "Brandon",
  riverview: "Riverview",
};

const IN_AREA_KEYS = new Set(
  Object.keys(IN_AREA_CITIES).map((name) => normalizeKey(name))
);
// Counties as in-area keys
IN_AREA_KEYS.add(normalizeKey("Sarasota County"));
IN_AREA_KEYS.add(normalizeKey("Manatee County"));
IN_AREA_KEYS.add(normalizeKey("Charlotte County"));

const OUT_OF_AREA_KEYS = new Set(
  OUT_OF_AREA_CITIES.map((name) => normalizeKey(name))
);

function getString(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}

/** Compact lowercase key for matching (collapse spaces/punctuation). */
export function normalizeKey(value) {
  return getString(value)
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolve a free-text city to a canonical display name when known.
 * @returns {string | null}
 */
export function normalizeCityName(city) {
  const raw = getString(city);
  if (!raw) return null;

  const key = normalizeKey(raw);
  if (CITY_ALIASES[key]) return CITY_ALIASES[key];

  // Compact form without spaces (northport already covered; lakewoodranch etc.)
  const compact = key.replace(/\s+/g, "");
  if (CITY_ALIASES[compact]) return CITY_ALIASES[compact];

  return null;
}

/**
 * Best-effort city extraction from a free-form US address string.
 * Does not invent cities — only returns a match against known aliases / lists.
 */
export function extractCityFromAddress(address) {
  const text = getString(address);
  if (!text) return { city: null, zip: null };

  const zipMatch = text.match(/\b(\d{5})(?:-\d{4})?\b/);
  const zip = zipMatch ? zipMatch[1] : null;

  // Prefer ", City, ST" / ", City FL" patterns
  const commaParts = text.split(",").map((p) => p.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    for (let i = 1; i < commaParts.length; i++) {
      const part = commaParts[i]
        .replace(/\b[FL]{2}\b\.?/gi, "")
        .replace(/\b\d{5}(?:-\d{4})?\b/g, "")
        .trim();
      if (!part) continue;
      const canonical = normalizeCityName(part);
      if (canonical) return { city: canonical, zip };
      // First word(s) of the part before state
      const words = part.split(/\s+/).filter(Boolean);
      for (let n = Math.min(3, words.length); n >= 1; n--) {
        const guess = words.slice(0, n).join(" ");
        const c = normalizeCityName(guess);
        if (c) return { city: c, zip };
      }
    }
  }

  // Scan known aliases as whole-word phrases (longest first)
  const lowered = ` ${normalizeKey(text)} `;
  const aliasKeys = Object.keys(CITY_ALIASES).sort((a, b) => b.length - a.length);
  for (const alias of aliasKeys) {
    const needle = ` ${alias} `;
    if (lowered.includes(needle)) {
      return { city: CITY_ALIASES[alias], zip };
    }
  }

  return { city: null, zip };
}

/**
 * Deterministic service-area check.
 * @param {{ city?: string, zip?: string }} input
 * @returns {{ status: "in_area"|"out_of_area"|"unknown", normalizedCity: string|null, reason: string }}
 */
export function checkServiceArea({ city, zip } = {}) {
  const zipDigits = getString(zip).replace(/\D/g, "").slice(0, 5) || null;
  const canonical = normalizeCityName(city);

  if (canonical) {
    const key = normalizeKey(canonical);

    if (IN_AREA_KEYS.has(key) || IN_AREA_CITIES[canonical]) {
      const county = IN_AREA_CITIES[canonical] || "primary service counties";
      return {
        status: "in_area",
        normalizedCity: canonical,
        reason: `${canonical} is in Screen Armors' service area (${county}).`,
      };
    }

    if (OUT_OF_AREA_KEYS.has(key) || OUT_OF_AREA_CITIES.includes(canonical)) {
      return {
        status: "out_of_area",
        normalizedCity: canonical,
        reason: `${canonical} is outside Screen Armors' normal service area (Sarasota, Manatee, and Charlotte counties).`,
      };
    }
  }

  const rawCity = getString(city);
  if (rawCity) {
    return {
      status: "unknown",
      normalizedCity: null,
      reason: `City "${rawCity}" is not in the maintained in-area or out-of-area lists. Do not invent eligibility — the Screen Armors team can confirm.`,
    };
  }

  if (zipDigits) {
    return {
      status: "unknown",
      normalizedCity: null,
      reason: `ZIP ${zipDigits} alone is not enough to determine service area without a known city. Ask for the city or let the team confirm.`,
    };
  }

  return {
    status: "unknown",
    normalizedCity: null,
    reason:
      "No city or ZIP provided. Ask for the city (or a full address) before deciding service-area eligibility.",
  };
}

export const CHECK_SERVICE_AREA_TOOL = {
  type: "function",
  name: "check_service_area",
  description:
    "Deterministically check whether a city/ZIP is in Screen Armors' service area. Always use this tool for service-area questions or before treating a location as in/out of area. Do not invent eligibility yourself.",
  parameters: {
    type: "object",
    properties: {
      city: {
        type: "string",
        description: "City name (or city extracted from an address)",
      },
      zip: {
        type: "string",
        description: "Optional US ZIP code",
      },
    },
    additionalProperties: false,
  },
};

/**
 * Run check_service_area tool args (never trust blindly).
 */
export function runCheckServiceAreaTool(rawArgs) {
  let args = rawArgs;
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch {
      return {
        status: "unknown",
        normalizedCity: null,
        reason: "Invalid tool arguments.",
      };
    }
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return {
      status: "unknown",
      normalizedCity: null,
      reason: "Invalid tool arguments.",
    };
  }

  const city = getString(args.city).slice(0, 80);
  const zip = getString(args.zip).slice(0, 12);
  return checkServiceArea({ city, zip });
}
