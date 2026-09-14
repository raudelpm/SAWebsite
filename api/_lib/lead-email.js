/**
 * Shared Resend helpers for website lead notifications.
 * Used by api/request.js (quote form) and AI chat estimate leads.
 */

import { Resend } from "resend";

export function getString(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}

export function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function parseEmailList(value) {
  const raw = getString(value);
  if (!raw) return [];
  return raw
    .split(/[;,]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isValidEmail(value) {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * @returns {{ ok: true, apiKey: string, fromEmail: string, toEmails: string[] } | { ok: false, error: string }}
 */
export function getLeadEmailConfig() {
  const apiKey = getString(process.env.RESEND_API_KEY);
  const toEmailRaw = process.env.REQUEST_TO_EMAIL || process.env.TO_EMAIL;
  const fromEmail = process.env.REQUEST_FROM_EMAIL || process.env.FROM_EMAIL;
  const toEmails = parseEmailList(toEmailRaw);

  if (!apiKey) {
    return { ok: false, error: "Missing RESEND_API_KEY" };
  }

  if (toEmails.length === 0 || !getString(fromEmail)) {
    return {
      ok: false,
      error: "Missing REQUEST_TO_EMAIL/TO_EMAIL or REQUEST_FROM_EMAIL/FROM_EMAIL",
    };
  }

  return { ok: true, apiKey, fromEmail: getString(fromEmail), toEmails };
}

/** Safe debug flags only — never log secret values. */
export function getLeadEmailConfigDebug() {
  return {
    hasResendApiKey: Boolean(getString(process.env.RESEND_API_KEY)),
    hasRequestToEmail: Boolean(
      getString(process.env.REQUEST_TO_EMAIL || process.env.TO_EMAIL)
    ),
    hasRequestFromEmail: Boolean(
      getString(process.env.REQUEST_FROM_EMAIL || process.env.FROM_EMAIL)
    ),
    requestToEmailCount: parseEmailList(
      process.env.REQUEST_TO_EMAIL || process.env.TO_EMAIL
    ).length,
  };
}

/**
 * Send the internal Screen Armors lead notification via Resend.
 * @returns {Promise<{ ok: true, id?: string } | { ok: false, error: string, status?: number }>}
 */
export async function sendInternalLeadEmail({
  subject,
  html,
  replyTo,
  attachments,
  logPrefix = "[lead-email]",
}) {
  const config = getLeadEmailConfig();
  if (!config.ok) {
    console.error(`${logPrefix} Resend config incomplete — cannot send`, {
      error: config.error,
      ...getLeadEmailConfigDebug(),
    });
    return { ok: false, status: 500, error: config.error };
  }

  const resend = new Resend(config.apiKey);

  try {
    console.log(`${logPrefix} Sending internal notification`, {
      from: config.fromEmail,
      to: config.toEmails,
      subject,
      hasReplyTo: Boolean(replyTo),
      hasAttachments: Boolean(attachments),
    });

    const result = await resend.emails.send({
      from: config.fromEmail,
      to: config.toEmails.length === 1 ? config.toEmails[0] : config.toEmails,
      ...(replyTo ? { replyTo } : {}),
      subject,
      html,
      ...(attachments ? { attachments } : {}),
    });

    if (result.error) {
      console.error(`${logPrefix} Resend API returned an error`, {
        message: result.error.message || null,
        name: result.error.name || null,
        statusCode: result.error.statusCode ?? null,
        // Full error object for local/server debugging (no API keys here)
        error: result.error,
      });
      return {
        ok: false,
        status: 502,
        error: result.error.message || "Resend error (internal)",
      };
    }

    console.log(`${logPrefix} Internal notification sent`, {
      id: result.data?.id,
    });

    return { ok: true, id: result.data?.id };
  } catch (e) {
    console.error(`${logPrefix} Unexpected Resend exception`, {
      name: e?.name || null,
      message: e?.message || String(e),
      status: e?.status || e?.statusCode || null,
    });
    return { ok: false, status: 500, error: e?.message || "Server error" };
  }
}

/**
 * Optional customer confirmation email (quote form).
 */
export async function sendCustomerConfirmationEmail({
  to,
  subject,
  html,
  from,
  logPrefix = "[lead-email]",
}) {
  const config = getLeadEmailConfig();
  if (!config.ok) {
    return { ok: false, error: config.error };
  }

  const resend = new Resend(config.apiKey);
  const confirmationFrom =
    from ||
    process.env.CONFIRMATION_FROM_EMAIL ||
    "Screen Armors <info@screenarmors.com>";

  try {
    const result = await resend.emails.send({
      from: confirmationFrom,
      to,
      subject,
      html,
    });

    if (result.error) {
      console.error(`${logPrefix} Customer confirmation failed`, {
        to,
        error: result.error,
      });
      return {
        ok: false,
        error: result.error.message || "Resend error (customer confirmation)",
      };
    }

    return { ok: true, id: result.data?.id };
  } catch (e) {
    console.error(`${logPrefix} Customer confirmation unexpected error`, e);
    return { ok: false, error: e?.message || "Server error" };
  }
}
