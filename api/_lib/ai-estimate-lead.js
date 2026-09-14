/**
 * AI chat estimate lead — validate tool args and send via Resend.
 * No Jobber. Never claim success to the model unless Resend succeeds.
 */

import {
  escapeHtml,
  getString,
  isValidEmail,
  sendInternalLeadEmail,
} from "./lead-email.js";
import {
  checkServiceArea,
  extractCityFromAddress,
} from "./service-area.js";

const MAX = {
  name: 100,
  phone: 40,
  email: 120,
  serviceAddress: 300,
  serviceType: 120,
  projectDescription: 2000,
  currentPath: 300,
  conversationSummary: 2000,
};

/** In-memory dedupe for warm serverless instances (best-effort). */
const recentSubmissions = new Map();
const DEDUPE_TTL_MS = 15 * 60 * 1000;

function pruneDedupe(now) {
  for (const [key, ts] of recentSubmissions.entries()) {
    if (now - ts > DEDUPE_TTL_MS) recentSubmissions.delete(key);
  }
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

/**
 * Normalize US phone to (XXX) XXX-XXXX.
 * Rejects numbers that are not 10-digit NANP after stripping a leading 1.
 * @returns {{ ok: true, formatted: string, digits: string } | { ok: false, error: string }}
 */
export function normalizeUsPhone(raw) {
  const input = getString(raw).slice(0, MAX.phone);
  if (!input) return { ok: false, error: "Phone is required." };

  let digits = digitsOnly(input);
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }

  if (digits.length !== 10) {
    return {
      ok: false,
      error: "Phone number must be a valid 10-digit US number.",
    };
  }

  if (/^(\d)\1{9}$/.test(digits)) {
    return { ok: false, error: "Phone number looks invalid." };
  }

  // NANP: area code and exchange cannot start with 0 or 1
  if (digits[0] === "0" || digits[0] === "1") {
    return { ok: false, error: "Phone number looks invalid." };
  }
  if (digits[3] === "0" || digits[3] === "1") {
    return { ok: false, error: "Phone number looks invalid." };
  }

  const formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return { ok: true, formatted, digits };
}

/**
 * Validate and normalize submit_estimate_request tool arguments.
 * Never trust model output blindly.
 */
export function validateEstimateLeadArgs(rawArgs, { currentPathFallback = "" } = {}) {
  let args = rawArgs;
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch {
      return { ok: false, error: "Invalid tool arguments." };
    }
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return { ok: false, error: "Invalid tool arguments." };
  }

  const name = getString(args.name).slice(0, MAX.name);
  const phoneRaw = getString(args.phone).slice(0, MAX.phone);
  const emailRaw = getString(args.email).slice(0, MAX.email);
  const serviceAddress = getString(args.serviceAddress).slice(0, MAX.serviceAddress);
  const serviceType = getString(args.serviceType).slice(0, MAX.serviceType);
  const projectDescription = getString(args.projectDescription).slice(
    0,
    MAX.projectDescription
  );
  const currentPath = getString(args.currentPath || currentPathFallback).slice(
    0,
    MAX.currentPath
  );
  const conversationSummary = getString(args.conversationSummary).slice(
    0,
    MAX.conversationSummary
  );
  const cityHint = getString(args.city).slice(0, 80);

  if (!name) return { ok: false, error: "Name is required." };
  if (!serviceAddress) return { ok: false, error: "Service address is required." };
  if (!projectDescription) {
    return { ok: false, error: "Project description is required." };
  }

  const phoneResult = normalizeUsPhone(phoneRaw);
  if (!phoneResult.ok) return phoneResult;

  if (!emailRaw) {
    return {
      ok: false,
      error: "Email is required. Ask the visitor for a valid email address before submitting.",
    };
  }
  if (!isValidEmail(emailRaw)) {
    return {
      ok: false,
      error:
        "Email looks invalid. Ask the visitor to confirm or provide a valid email address before submitting.",
    };
  }
  const email = emailRaw;

  const extracted = extractCityFromAddress(serviceAddress);
  const cityForCheck = cityHint || extracted.city || "";
  const zipForCheck = extracted.zip || "";
  const area = checkServiceArea({ city: cityForCheck, zip: zipForCheck });

  return {
    ok: true,
    lead: {
      name,
      phone: phoneResult.formatted,
      phoneDigits: phoneResult.digits,
      email,
      serviceAddress,
      serviceType,
      projectDescription,
      currentPath,
      conversationSummary,
      source: "AI Website Chat",
      cityHint: cityHint || extracted.city || "",
      areaStatus: area.status,
      areaCity: area.normalizedCity,
      areaReason: area.reason,
    },
  };
}

function formatServiceAreaStatusForEmail(lead) {
  if (lead.areaStatus === "in_area") {
    return lead.areaCity
      ? `In Area (${lead.areaCity})`
      : "In Area";
  }
  if (lead.areaStatus === "out_of_area") {
    return lead.areaCity
      ? `Out of Area (${lead.areaCity})`
      : "Out of Area";
  }
  if (lead.areaStatus === "unknown") {
    return "Needs Confirmation";
  }
  return "Needs Confirmation";
}

function buildAiLeadEmailHtml(lead) {
  const rows = [
    ["Name", lead.name],
    ["Phone", lead.phone],
    ["Email", lead.email],
    ["Service Address", lead.serviceAddress],
    ["Service Type", lead.serviceType || "(not provided)"],
    ["Project Description", lead.projectDescription],
    ["Source", lead.source],
    ["Page", lead.currentPath || "(unknown)"],
    ["Service Area Status", formatServiceAreaStatusForEmail(lead)],
  ];

  const tableRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding: 6px 0; width: 160px; vertical-align: top;"><strong>${escapeHtml(
          label
        )}</strong></td><td style="padding: 6px 0;"><pre style="margin:0; white-space:pre-wrap; font-family:inherit;">${escapeHtml(
          value
        )}</pre></td></tr>`
    )
    .join("");

  const summaryBlock = lead.conversationSummary
    ? `<h3 style="margin: 16px 0 8px;">Conversation Summary</h3>
      <pre style="white-space: pre-wrap; margin: 0; padding: 12px; background: #f6f7f9; border-radius: 8px;">${escapeHtml(
        lead.conversationSummary
      )}</pre>`
    : "";

  return `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.45;">
      <h2 style="margin:0 0 12px;">New AI Website Lead</h2>
      <table cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
        ${tableRows}
      </table>
      ${summaryBlock}
    </div>
  `.trim();
}

function dedupeKey(lead) {
  return `${lead.phoneDigits}|${lead.name.toLowerCase()}`;
}

/**
 * Execute submit_estimate_request after validation.
 * @returns {Promise<{ ok: true, id?: string, duplicate?: boolean } | { ok: false, error: string }>}
 */
export async function submitEstimateRequest(rawArgs, options = {}) {
  if (options.leadAlreadySubmitted) {
    return {
      ok: false,
      error:
        "An estimate request was already submitted for this chat session. Do not claim a new submission. Tell the visitor the team already has their request.",
    };
  }

  const validated = validateEstimateLeadArgs(rawArgs, {
    currentPathFallback: options.currentPath || "",
  });
  if (!validated.ok) {
    console.error("[ai-estimate-lead] Tool argument validation failed", {
      error: validated.error,
    });
    return { ok: false, error: validated.error };
  }

  const lead = validated.lead;
  if (!lead.conversationSummary && options.fallbackSummary) {
    lead.conversationSummary = getString(options.fallbackSummary).slice(
      0,
      MAX.conversationSummary
    );
  }

  if (lead.areaStatus === "out_of_area") {
    console.warn("[ai-estimate-lead] Blocked out-of-area estimate submit", {
      city: lead.areaCity,
      address: lead.serviceAddress,
    });
    return {
      ok: false,
      error:
        lead.areaReason ||
        "This location is outside Screen Armors' normal service area (Sarasota, Manatee, and Charlotte counties). Do not submit a normal estimate request. Politely explain the service area and offer (941) 404-9699 only if appropriate.",
    };
  }

  const now = Date.now();
  pruneDedupe(now);
  const key = dedupeKey(lead);
  if (recentSubmissions.has(key)) {
    console.log("[ai-estimate-lead] Duplicate suppressed", { key });
    return {
      ok: true,
      duplicate: true,
      message:
        "This estimate request was already received recently. Confirm to the visitor that Screen Armors already has their request — do not say you submitted it again.",
    };
  }

  const subject =
    lead.areaStatus === "unknown"
      ? `New AI Website Lead (Needs Confirmation) from ${lead.name}`
      : `New AI Website Lead from ${lead.name}`;
  const html = buildAiLeadEmailHtml(lead);

  console.log("[ai-estimate-lead] Submitting lead", {
    name: lead.name,
    phone: lead.phone,
    hasEmail: Boolean(lead.email),
    path: lead.currentPath || "(none)",
    areaStatus: lead.areaStatus || "(none)",
  });

  const sent = await sendInternalLeadEmail({
    subject,
    html,
    replyTo: lead.email,
    logPrefix: "[ai-estimate-lead]",
  });

  if (!sent.ok) {
    console.error("[ai-estimate-lead] submit_estimate_request failed", {
      error: sent.error,
      status: sent.status || null,
      // Tool args validated OK if we reached send — failure is Resend/config
    });
    return {
      ok: false,
      error:
        sent.error ||
        "Could not send the estimate request email. Ask the visitor to call (941) 404-9699.",
    };
  }

  recentSubmissions.set(key, now);

  const successMessage =
    lead.areaStatus === "unknown"
      ? "Estimate request email sent successfully with Service Area Status: Needs Confirmation. Tell the visitor you are not completely sure whether that location is within the normal service area, but you sent their request to the Screen Armors team so they can confirm. Do not say the location was rejected."
      : "Estimate request email sent successfully to Screen Armors. You may now tell the visitor their request was submitted.";

  return {
    ok: true,
    id: sent.id,
    areaStatus: lead.areaStatus,
    message: successMessage,
  };
}

export const SUBMIT_ESTIMATE_TOOL = {
  type: "function",
  name: "submit_estimate_request",
  description:
    "Submit a Screen Armors estimate/quote request after collecting ALL required visitor details. Only call when name, phone, email, serviceAddress, and projectDescription are all known. Prefer calling check_service_area first when a city is known. Submit for in_area and unknown locations (unknown is emailed as Needs Confirmation). Never submit for known out_of_area. Never invent an email. The server validates fields and sends email via Resend. Never claim success until this tool returns ok: true.",
  parameters: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Visitor full name",
      },
      phone: {
        type: "string",
        description: "Visitor phone number (US)",
      },
      email: {
        type: "string",
        description: "Visitor email address (required)",
      },
      serviceAddress: {
        type: "string",
        description: "Property address where work is needed (include city when known)",
      },
      city: {
        type: "string",
        description: "Optional city name if already known (server also extracts city from serviceAddress)",
      },
      serviceType: {
        type: "string",
        description: "Optional service type (repair, rescreen, new enclosure, etc.)",
      },
      projectDescription: {
        type: "string",
        description: "Short description of the project or problem",
      },
      currentPath: {
        type: "string",
        description: "Optional website path the visitor is on",
      },
      conversationSummary: {
        type: "string",
        description: "Brief summary of the chat for the Screen Armors team",
      },
    },
    required: ["name", "phone", "email", "serviceAddress", "projectDescription"],
    additionalProperties: false,
  },
};
