import { saveWebsiteApplicant } from "./_lib/applicants-store.js";
import { getString, sendInternalLeadEmail } from "./_lib/lead-email.js";
import { buildCareersEmail, validateCareersApplication } from "./_lib/careers-application.js";

function json(res, status, body) {
  return res
    .status(status)
    .setHeader("Content-Type", "application/json; charset=utf-8")
    .send(JSON.stringify(body));
}

function readBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  if (!body || typeof body !== "object") return {};
  return body;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, error: "method_not_allowed" });
  }

  const body = readBody(req);

  // Same honeypot as the quote form: bots get a quiet success and no email.
  if (getString(body.website)) {
    return json(res, 200, { ok: true });
  }

  const validated = validateCareersApplication(body);
  if (!validated.ok) {
    return json(res, 400, { ok: false, error: "validation", fields: validated.fields });
  }

  const application = validated.application;
  const email = buildCareersEmail(application);

  console.log("[api/careers] Application received", {
    fullName: application.fullName,
    city: application.city,
    language: application.language,
    hasEmail: Boolean(application.email),
  });

  try {
    const internalResult = await sendInternalLeadEmail({
      subject: email.subject,
      html: email.html,
      replyTo: email.replyTo,
      logPrefix: "[api/careers]",
    });

    if (!internalResult.ok) {
      return json(res, internalResult.status || 502, { ok: false, error: "send_failed" });
    }

    try {
      await saveWebsiteApplicant(application);
    } catch (error) {
      console.error("[api/careers] Could not store application", error);
    }

    return json(res, 200, { ok: true, id: internalResult.id });
  } catch (error) {
    console.error("[api/careers] Unexpected error", error);
    return json(res, 500, { ok: false, error: "send_failed" });
  }
}
