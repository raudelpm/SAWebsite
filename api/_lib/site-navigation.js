/**
 * Approved Screen Armors website navigation map.
 * Only real routes that exist under Website/. Never invent URLs.
 */

function getString(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}

/**
 * @typedef {{ id: string, title: string, path: string, description: string, keywords: string[], ctaLabel?: string }} SitePage
 */

/** @type {SitePage[]} */
export const APPROVED_SITE_PAGES = [
  {
    id: "home",
    title: "Home",
    path: "/",
    description: "Screen Armors home page — screen repair and pool cage services.",
    keywords: ["home", "screen armors", "main page"],
    ctaLabel: "Visit Home",
  },
  {
    id: "services",
    title: "Our Services",
    path: "/services.html",
    description: "Overview of Screen Armors screen enclosure and pool cage services.",
    keywords: [
      "services",
      "all services",
      "what do you offer",
      "screen enclosure services",
    ],
    ctaLabel: "View Our Services",
  },
  {
    id: "screen-repair",
    title: "Pool & Lanai Screen Repair",
    path: "/service-screening.html",
    description:
      "Pool cage and lanai screen repair, panel replacement, partial and full rescreens, including Florida Glass and other screen types.",
    keywords: [
      "pool cage repair",
      "screen repair",
      "lanai repair",
      "panel replacement",
      "torn screen",
      "full rescreen",
      "rescreen",
      "rescreening",
      "florida glass",
      "screen types",
      "petscreen",
      "no-see-um",
      "screen door",
      "screen doors",
      "door screen",
    ],
    ctaLabel: "View Screen Repair",
  },
  {
    id: "restoration",
    title: "Pool Cage Restoration",
    path: "/service-refurbishing.html",
    description:
      "Complete pool cage and lanai restoration and refurbishing for aging or damaged enclosures.",
    keywords: [
      "restoration",
      "refurbishing",
      "refurbish",
      "pool cage restoration",
      "lanai restoration",
      "restore",
      "rebuild screen",
    ],
    ctaLabel: "View Pool Cage Restoration",
  },
  {
    id: "custom-enclosures",
    title: "Front & Back Porch Screen Enclosures",
    path: "/service-custom-enclosures.html",
    description:
      "Custom aluminum screen enclosures for front porches, back porches, and outdoor living spaces.",
    keywords: [
      "front porch",
      "back porch",
      "porch enclosure",
      "front porch enclosure",
      "screen enclosure",
      "custom enclosure",
      "aluminum screen enclosure",
      "patio enclosure",
    ],
    ctaLabel: "View Porch Enclosures",
  },
  {
    id: "new-pool-cage",
    title: "New Pool Cage Construction",
    path: "/service-new-pool-cage.html",
    description:
      "New pool cage construction and enclosure extensions designed for Florida homes.",
    keywords: [
      "new pool cage",
      "pool cage construction",
      "new enclosure",
      "build pool cage",
      "pool cage extension",
      "cage extension",
    ],
    ctaLabel: "View New Pool Cage Construction",
  },
  {
    id: "construction",
    title: "Construction Services",
    path: "/service-construction.html",
    description: "New screen enclosure and pool cage construction services.",
    keywords: ["construction", "build enclosure", "new screen enclosure construction"],
    ctaLabel: "View Construction Services",
  },
  {
    id: "hurricane-cables",
    title: "Hurricane Cables",
    path: "/service-hurricane-cables.html",
    description: "Hurricane cable replacement and storm cable services for pool cages.",
    keywords: [
      "hurricane cables",
      "hurricane cable",
      "storm cables",
      "hurricane wires",
      "cable replacement",
    ],
    ctaLabel: "View Hurricane Cables",
  },
  {
    id: "screw-replacement",
    title: "Screw Replacement",
    path: "/service-screw-replacement.html",
    description: "Stainless steel screw replacement for screen enclosures and pool cages.",
    keywords: [
      "screw replacement",
      "stainless screws",
      "stainless steel screws",
      "enclosure screws",
    ],
    ctaLabel: "View Screw Replacement",
  },
  {
    id: "dog-door",
    title: "Dog Door",
    path: "/service-dog-door.html",
    description: "Dog door installation for screen enclosures.",
    keywords: ["dog door", "pet door", "screen dog door"],
    ctaLabel: "View Dog Door",
  },
  {
    id: "pressure-wash",
    title: "Pressure Wash",
    path: "/service-pressure-wash.html",
    description: "Pressure washing for pool cages and screen enclosures.",
    keywords: ["pressure wash", "pressure washing", "clean cage", "wash enclosure"],
    ctaLabel: "View Pressure Wash",
  },
  {
    id: "gutter",
    title: "Gutter Services",
    path: "/service-gutter.html",
    description: "Gutter services related to screen enclosures and outdoor structures.",
    keywords: ["gutter", "gutters", "gutter services"],
    ctaLabel: "View Gutter Services",
  },
  {
    id: "areas",
    title: "Areas We Serve",
    path: "/areas-we-serve.html",
    description: "Screen Armors service areas across Sarasota, Manatee, and Charlotte counties.",
    keywords: [
      "service area",
      "areas we serve",
      "where do you serve",
      "cities",
      "coverage",
    ],
    ctaLabel: "View Areas We Serve",
  },
  {
    id: "sarasota",
    title: "Screen Repair in Sarasota",
    path: "/sarasota.html",
    description: "Screen repair and pool cage services in Sarasota, FL.",
    keywords: ["sarasota", "sarasota fl", "sarasota screen repair"],
    ctaLabel: "View Sarasota Services",
  },
  {
    id: "bradenton",
    title: "Screen Repair in Bradenton",
    path: "/bradenton.html",
    description: "Screen repair and pool cage services in Bradenton, FL.",
    keywords: ["bradenton", "bradenton fl", "bradenton screen repair"],
    ctaLabel: "View Bradenton Services",
  },
  {
    id: "venice",
    title: "Screen Repair in Venice",
    path: "/venice.html",
    description: "Screen repair and pool cage services in Venice, FL.",
    keywords: ["venice", "venice fl", "venice screen repair"],
    ctaLabel: "View Venice Services",
  },
  {
    id: "north-port",
    title: "Screen Repair in North Port",
    path: "/north-port.html",
    description: "Screen repair and pool cage services in North Port, FL.",
    keywords: ["north port", "northport", "north port fl"],
    ctaLabel: "View North Port Services",
  },
  {
    id: "port-charlotte",
    title: "Screen Repair in Port Charlotte",
    path: "/port-charlotte.html",
    description: "Screen repair and pool cage services in Port Charlotte, FL.",
    keywords: ["port charlotte", "port charlotte fl"],
    ctaLabel: "View Port Charlotte Services",
  },
  {
    id: "lakewood-ranch",
    title: "Screen Repair in Lakewood Ranch",
    path: "/lakewood-ranch.html",
    description: "Screen repair and pool cage services in Lakewood Ranch, FL.",
    keywords: ["lakewood ranch", "lakewoodranch"],
    ctaLabel: "View Lakewood Ranch Services",
  },
  {
    id: "quote",
    title: "Request an Estimate",
    path: "/quote.html",
    description: "Request a free Screen Armors estimate or quote for your screen project.",
    keywords: [
      "quote",
      "estimate",
      "request estimate",
      "get quote",
      "free estimate",
      "contact",
    ],
    ctaLabel: "Request an Estimate",
  },
  {
    id: "quick-quote",
    title: "Quick Screen Quote",
    path: "/quick-screen-quote.html",
    description: "Quick screen quote calculator for panel-based screen estimates.",
    keywords: ["quick quote", "quick screen quote", "panel quote", "quote calculator"],
    ctaLabel: "Open Quick Screen Quote",
  },
  {
    id: "about",
    title: "About Us",
    path: "/about.html",
    description: "About Screen Armors — local screen enclosure specialists.",
    keywords: ["about", "about us", "company", "who are you"],
    ctaLabel: "About Screen Armors",
  },
  {
    id: "reviews",
    title: "Customer Reviews",
    path: "/reviews.html",
    description: "Customer reviews and testimonials for Screen Armors.",
    keywords: ["reviews", "testimonials", "ratings"],
    ctaLabel: "View Reviews",
  },
  {
    id: "faq",
    title: "FAQ",
    path: "/faq.html",
    description: "Frequently asked questions about Screen Armors services.",
    keywords: ["faq", "questions", "frequently asked"],
    ctaLabel: "View FAQ",
  },
  {
    id: "insurance",
    title: "Insurance & Registration",
    path: "/insurance.html",
    description: "Insurance and registration information for Screen Armors.",
    keywords: ["insurance", "licensed", "registered", "registration"],
    ctaLabel: "View Insurance Info",
  },
  {
    id: "blog",
    title: "Blog",
    path: "/blog.html",
    description: "Screen Armors blog with pool cage and screening tips.",
    keywords: ["blog", "articles", "tips"],
    ctaLabel: "Visit Blog",
  },
];

const APPROVED_PATH_SET = new Set(
  APPROVED_SITE_PAGES.map((p) => normalizePath(p.path))
);

export function normalizePath(path) {
  let p = getString(path).split("?")[0].split("#")[0];
  if (!p) return "";
  if (!p.startsWith("/")) p = "/" + p;
  // Treat /index.html as /
  if (p === "/index.html" || p === "/index") return "/";
  return p;
}

export function isApprovedPath(path) {
  return APPROVED_PATH_SET.has(normalizePath(path));
}

export function getApprovedPageByPath(path) {
  const n = normalizePath(path);
  return APPROVED_SITE_PAGES.find((p) => normalizePath(p.path) === n) || null;
}

function tokenize(text) {
  return getString(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]/g, " ")
    .split(/[\s/-]+/)
    .filter((t) => t.length > 1);
}

function scorePage(page, query) {
  const q = getString(query).toLowerCase();
  if (!q) return 0;

  let score = 0;
  const title = page.title.toLowerCase();
  const desc = page.description.toLowerCase();
  const keywords = page.keywords.map((k) => k.toLowerCase());

  if (title === q) score += 100;
  if (keywords.includes(q)) score += 90;
  if (title.includes(q)) score += 40;

  for (const kw of keywords) {
    if (q.includes(kw) || kw.includes(q)) score += 35;
  }

  const qTokens = tokenize(q);
  const hayTokens = new Set([
    ...tokenize(title),
    ...tokenize(desc),
    ...keywords.flatMap((k) => tokenize(k)),
  ]);

  for (const token of qTokens) {
    if (hayTokens.has(token)) score += 8;
  }

  // Prefer longer keyword phrase hits
  for (const kw of keywords) {
    if (kw.length >= 8 && q.includes(kw)) score += 20;
  }

  return score;
}

/**
 * Find the best approved page for a visitor query.
 * @returns {{ found: false } | { found: true, title: string, path: string, description: string, ctaLabel: string, id: string }}
 */
export function findServicePage(query) {
  const q = getString(query).slice(0, 200);
  if (!q) return { found: false };

  let best = null;
  let bestScore = 0;

  for (const page of APPROVED_SITE_PAGES) {
    const score = scorePage(page, q);
    if (score > bestScore) {
      bestScore = score;
      best = page;
    }
  }

  // Require a meaningful match — avoid weak accidental hits
  if (!best || bestScore < 20) {
    return { found: false };
  }

  return {
    found: true,
    id: best.id,
    title: best.title,
    path: best.path,
    description: best.description,
    ctaLabel: best.ctaLabel || `View ${best.title}`,
  };
}

export function runFindServicePageTool(rawArgs) {
  let args = rawArgs;
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch {
      return { found: false };
    }
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return { found: false };
  }
  return findServicePage(args.query);
}

/**
 * Build safe chat navigation links from candidate paths.
 * Only approved internal paths; max 2; skip current page.
 * @param {Array<{ path?: string, href?: string, label?: string, title?: string, ctaLabel?: string }>} candidates
 * @param {{ currentPath?: string, max?: number }} options
 * @returns {Array<{ label: string, href: string }>}
 */
export function buildSafeChatLinks(candidates, { currentPath = "", max = 2 } = {}) {
  const current = normalizePath(currentPath);
  const out = [];
  const seen = new Set();

  if (!Array.isArray(candidates)) return out;

  for (const c of candidates) {
    if (out.length >= max) break;
    const href = normalizePath(c?.href || c?.path || "");
    if (!href || !isApprovedPath(href)) continue;
    if (href === current) continue;
    if (seen.has(href)) continue;

    const page = getApprovedPageByPath(href);
    const label = getString(c?.label || c?.ctaLabel || c?.title || page?.ctaLabel || page?.title);
    if (!label) continue;

    // Reject anything that looks external or protocol-based
    if (/^[a-z]+:/i.test(href) || href.includes("//")) continue;

    seen.add(href);
    out.push({
      label: label.slice(0, 80),
      href,
    });
  }

  return out;
}

export const FIND_SERVICE_PAGE_TOOL = {
  type: "function",
  name: "find_service_page",
  description:
    "Find an approved Screen Armors website page that matches the visitor's topic. Only returns real site routes from the navigation map. Use when recommending a service or area page. Never invent URLs.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "What the visitor is asking about (e.g. pool cage restoration, front porch enclosure, Florida Glass, estimate)",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
};
