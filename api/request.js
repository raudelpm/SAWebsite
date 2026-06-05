import { Resend } from "resend";

function json(res, status, body) {
  return res
    .status(status)
    .setHeader("Content-Type", "application/json; charset=utf-8")
    .send(JSON.stringify(body));
}

function getString(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}

function escapeHtml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseEmailList(value) {
  const raw = getString(value);
  if (!raw) return [];
  return raw
    .split(/[;,]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isValidEmail(value) {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isTestApiRequest(body) {
  const testEmail = getString(body?.email).toLowerCase();
  const testMessage = getString(body?.message);
  const testFirst = getString(body?.firstName);
  const testLast = getString(body?.lastName);
  return (
    testEmail === "test-api@screenarmors.com" ||
    testMessage.includes("TEST API button") ||
    (testFirst === "Test" && testLast === "API")
  );
}

const CONFIRMATION_FROM =
  process.env.CONFIRMATION_FROM_EMAIL || "Screen Armors <info@screenarmors.com>";

function buildConfirmationHtml(firstName) {
  const greeting = firstName
    ? `Hi ${escapeHtml(firstName)},`
    : "Hi,";
  return `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.6; color: #1a1a1a;">
      <p style="margin:0 0 16px;">${greeting}</p>
      <p style="margin:0 0 16px;">Thank you for contacting Screen Armors. We've received your request and appreciate you reaching out.</p>
      <p style="margin:0 0 16px;">We usually respond within 1 hour during business hours.</p>
      <p style="margin:0 0 8px;">
        Screen Armors<br>
        (941) 404-9699<br>
        <a href="https://www.screenarmors.com">www.screenarmors.com</a>
      </p>
    </div>
  `.trim();
}

function buildRequestEmailHtml({
  fullName,
  address,
  phone,
  email,
  leadSource,
  projectType,
  message,
}) {
  return `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.45;">
      <h2 style="margin:0 0 12px;">New quote request</h2>
      <table cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 6px 0; width: 140px;"><strong>Name</strong></td><td style="padding: 6px 0;">${escapeHtml(fullName)}</td></tr>
        ${
          address
            ? `<tr><td style="padding: 6px 0;"><strong>Address</strong></td><td style="padding: 6px 0;"><pre style="margin: 0; white-space: pre-wrap; font-family: inherit;">${escapeHtml(address)}</pre></td></tr>`
            : ""
        }
        <tr><td style="padding: 6px 0;"><strong>Phone</strong></td><td style="padding: 6px 0;">${escapeHtml(phone)}</td></tr>
        ${email ? `<tr><td style="padding: 6px 0;"><strong>Email</strong></td><td style="padding: 6px 0;">${escapeHtml(email)}</td></tr>` : ""}
        <tr><td style="padding: 6px 0;"><strong>Lead source</strong></td><td style="padding: 6px 0;">${escapeHtml(leadSource)}</td></tr>
        ${projectType ? `<tr><td style="padding: 6px 0;"><strong>Project</strong></td><td style="padding: 6px 0;">${escapeHtml(projectType)}</td></tr>` : ""}
      </table>
      ${message ? `<h3 style="margin: 16px 0 8px;">Additional Details</h3>
      <pre style="white-space: pre-wrap; margin: 0; padding: 12px; background: #f6f7f9; border-radius: 8px;">${escapeHtml(message)}</pre>` : ""}
    </div>
  `.trim();
}

function buildResendAttachments(attachments) {
  const safeAttachments = attachments
    .slice(0, 3)
    .map((a) => ({
      filename: getString(a?.filename).slice(0, 140) || "photo",
      dataUrl: getString(a?.dataUrl),
      contentType: getString(a?.contentType) || "application/octet-stream",
    }))
    .filter((a) => a.dataUrl.startsWith("data:image/"));

  if (safeAttachments.length === 0) return undefined;

  return safeAttachments.map((a) => {
    const commaIdx = a.dataUrl.indexOf(",");
    const base64 = commaIdx >= 0 ? a.dataUrl.slice(commaIdx + 1) : "";
    return {
      filename: a.filename,
      content: Buffer.from(base64, "base64"),
    };
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return json(res, 500, { ok: false, error: "Missing RESEND_API_KEY" });

  const toEmailRaw = process.env.REQUEST_TO_EMAIL || process.env.TO_EMAIL;
  const fromEmail = process.env.REQUEST_FROM_EMAIL || process.env.FROM_EMAIL;
  const toEmails = parseEmailList(toEmailRaw);
  if (toEmails.length === 0 || !fromEmail) {
    return json(res, 500, {
      ok: false,
      error: "Missing REQUEST_TO_EMAIL/TO_EMAIL or REQUEST_FROM_EMAIL/FROM_EMAIL",
    });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const fullNameInput = getString(body?.fullName);
  const firstName = getString(body?.firstName);
  const lastName = getString(body?.lastName);
  const email = getString(body?.email);
  const phone = getString(body?.phone);
  const addressSingle = getString(body?.address);
  const address1 = getString(body?.address1);
  const address2 = getString(body?.address2);
  const city = getString(body?.city);
  const stateRaw = getString(body?.state);
  const zip = getString(body?.zip);
  const leadSource = getString(body?.leadSource);
  const projectType = getString(body?.projectType);
  const message = getString(body?.message);
  const attachments = Array.isArray(body?.attachments) ? body.attachments : [];
  const website = getString(body?.website);

  if (website) return json(res, 200, { ok: true });

  const state = stateRaw ? stateRaw.toUpperCase() : "";
  const addressLines = [address1, address2].filter(Boolean);
  const cityStateZip = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const addressFromParts = [addressLines.join("\n"), cityStateZip].filter(Boolean).join("\n");
  const address = addressSingle || addressFromParts;

  const fullName =
    fullNameInput ||
    `${firstName}${lastName ? ` ${lastName}` : ""}`.trim();
  const greetingName = firstName || fullNameInput.split(/\s+/)[0] || "";

  if (!fullName || !phone || !leadSource) {
    return json(res, 400, { ok: false, error: "Missing required fields" });
  }

  if (isTestApiRequest(body)) {
    console.log("[api/request] Test API request — skipping Resend emails", {
      email: email || "(none)",
    });
    return json(res, 200, {
      ok: true,
      test: true,
      emailsSkipped: true,
      confirmationSent: false,
    });
  }

  const hasQuickScreen =
    getString(message).includes("Quick Screen Quote") ||
    getString(message).includes("Panel breakdown:");
  const subject = hasQuickScreen
    ? `New quote request (Quick Screen Quote) from ${fullName || "Website"}`
    : `New quote request from ${fullName || "Website"}`;
  const html = buildRequestEmailHtml({
    fullName,
    address,
    phone,
    email,
    leadSource,
    projectType,
    message,
  });
  const resendAttachments = buildResendAttachments(attachments);

  console.log("[api/request] Form submission received", {
    fullName,
    customerEmail: email || "(none)",
    leadSource,
    hasAttachments: Boolean(resendAttachments),
  });

  const resend = new Resend(apiKey);

  try {
    console.log("[api/request] Sending internal notification", {
      from: fromEmail,
      to: toEmails,
    });

    const internalResult = await resend.emails.send({
      from: fromEmail,
      to: toEmails.length === 1 ? toEmails[0] : toEmails,
      ...(email ? { replyTo: email } : {}),
      subject,
      html,
      ...(resendAttachments ? { attachments: resendAttachments } : {}),
    });

    if (internalResult.error) {
      console.error("[api/request] Internal notification failed", internalResult.error);
      return json(res, 502, {
        ok: false,
        error: internalResult.error.message || "Resend error (internal)",
      });
    }

    console.log("[api/request] Internal notification sent", {
      id: internalResult.data?.id,
    });

    let confirmationSent = false;
    let confirmationId = null;

    if (isValidEmail(email)) {
      console.log("[api/request] Sending customer confirmation", {
        from: CONFIRMATION_FROM,
        to: email,
      });

      const confirmationResult = await resend.emails.send({
        from: CONFIRMATION_FROM,
        to: email,
        subject: "We Received Your Request",
        html: buildConfirmationHtml(greetingName),
      });

      if (confirmationResult.error) {
        console.error("[api/request] Customer confirmation failed", {
          to: email,
          error: confirmationResult.error,
        });

        return json(res, 200, {
          ok: true,
          id: internalResult.data?.id,
          confirmationSent: false,
          confirmationError:
            confirmationResult.error.message ||
            "Resend error (customer confirmation)",
        });
      }

      confirmationSent = true;
      confirmationId = confirmationResult.data?.id;
      console.log("[api/request] Customer confirmation sent", {
        to: email,
        id: confirmationId,
      });
    } else {
      console.log("[api/request] Skipping customer confirmation (no valid email)", {
        email: email || "(empty)",
      });
    }

    return json(res, 200, {
      ok: true,
      id: internalResult.data?.id,
      confirmationSent,
      ...(confirmationId ? { confirmationId } : {}),
    });
  } catch (e) {
    console.error("[api/request] Unexpected error", e);
    return json(res, 500, { ok: false, error: e?.message || "Server error" });
  }
}
