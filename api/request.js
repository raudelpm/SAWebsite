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
  // Some deployments may send raw string if content-type is off.
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const firstName = getString(body?.firstName);
  const lastName = getString(body?.lastName);
  const email = getString(body?.email);
  const phone = getString(body?.phone);
  const address = getString(body?.address);
  const leadSource = getString(body?.leadSource);
  const projectType = getString(body?.projectType);
  const message = getString(body?.message);
  const attachments = Array.isArray(body?.attachments) ? body.attachments : [];
  const website = getString(body?.website); // honeypot

  if (website) return json(res, 200, { ok: true }); // silently accept bots

  // Required fields (match the ones marked with "*" in the form)
  if (!firstName || !lastName || !phone || !leadSource) {
    return json(res, 400, { ok: false, error: "Missing required fields" });
  }

  const resend = new Resend(apiKey);

  const fullName = `${firstName}${lastName ? ` ${lastName}` : ""}`.trim();
  const subject = `New quote request from ${fullName || "Website"}`;
  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.45;">
      <h2 style="margin:0 0 12px;">New quote request</h2>
      <table cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 6px 0; width: 140px;"><strong>First name</strong></td><td style="padding: 6px 0;">${escapeHtml(firstName)}</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Last name</strong></td><td style="padding: 6px 0;">${escapeHtml(lastName)}</td></tr>
        ${address ? `<tr><td style="padding: 6px 0;"><strong>Address</strong></td><td style="padding: 6px 0;">${escapeHtml(address)}</td></tr>` : ""}
        <tr><td style="padding: 6px 0;"><strong>Phone</strong></td><td style="padding: 6px 0;">${escapeHtml(phone)}</td></tr>
        ${email ? `<tr><td style="padding: 6px 0;"><strong>Email</strong></td><td style="padding: 6px 0;">${escapeHtml(email)}</td></tr>` : ""}
        <tr><td style="padding: 6px 0;"><strong>Lead source</strong></td><td style="padding: 6px 0;">${escapeHtml(leadSource)}</td></tr>
        ${projectType ? `<tr><td style="padding: 6px 0;"><strong>Project</strong></td><td style="padding: 6px 0;">${escapeHtml(projectType)}</td></tr>` : ""}
      </table>
      ${message ? `<h3 style="margin: 16px 0 8px;">Additional Details</h3>
      <pre style="white-space: pre-wrap; margin: 0; padding: 12px; background: #f6f7f9; border-radius: 8px;">${escapeHtml(message)}</pre>` : ""}
    </div>
  `.trim();

  const safeAttachments = attachments
    .slice(0, 3)
    .map((a) => ({
      filename: getString(a?.filename).slice(0, 140) || "photo",
      dataUrl: getString(a?.dataUrl),
      contentType: getString(a?.contentType) || "application/octet-stream",
    }))
    .filter((a) => a.dataUrl.startsWith("data:image/"));

  const resendAttachments =
    safeAttachments.length === 0
      ? undefined
      : safeAttachments.map((a) => {
          const commaIdx = a.dataUrl.indexOf(",");
          const base64 = commaIdx >= 0 ? a.dataUrl.slice(commaIdx + 1) : "";
          return {
            filename: a.filename,
            content: Buffer.from(base64, "base64"),
          };
        });

  try {
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: toEmails.length === 1 ? toEmails[0] : toEmails,
      ...(email ? { replyTo: email } : {}),
      subject,
      html,
      ...(resendAttachments ? { attachments: resendAttachments } : {}),
    });

    if (error) return json(res, 502, { ok: false, error: error.message || "Resend error" });
    return json(res, 200, { ok: true, id: data?.id });
  } catch (e) {
    return json(res, 500, { ok: false, error: e?.message || "Server error" });
  }
}

