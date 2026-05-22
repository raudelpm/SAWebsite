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
        941-524-6233<br>
        <a href="https://www.screenarmors.com">www.screenarmors.com</a>
      </p>
    </div>
  `.trim();
}

const JOBBER_GRAPHQL_URL = "https://api.getjobber.com/api/graphql";
const JOBBER_TOKEN_URL = "https://api.getjobber.com/api/oauth/token";
const JOBBER_GRAPHQL_VERSION =
  process.env.JOBBER_GRAPHQL_VERSION || "2025-04-16";
const JOBBER_CLIENT_SEARCH_PAGES = 8;
const JOBBER_CLIENT_PAGE_SIZE = 50;

const JOBBER_CLIENT_CREATE_MUTATION = `
  mutation CreateClient($input: ClientCreateInput!) {
    clientCreate(input: $input) {
      client { id name jobberWebUri }
      userErrors { message path }
    }
  }
`;

const JOBBER_REQUEST_CREATE_MUTATION = `
  mutation CreateRequest($input: RequestCreateInput!) {
    requestCreate(input: $input) {
      request { id title requestStatus jobberWebUri }
      userErrors { message path }
    }
  }
`;

function normalizePhone(value) {
  return getString(value).replace(/\D/g, "");
}

function buildJobberRequestDetails({ leadSource, service, message, phone, email }) {
  const lines = ["Website quote form submission"];
  if (leadSource) lines.push(`Lead source: ${leadSource}`);
  if (service) lines.push(`Service: ${service}`);
  if (phone) lines.push(`Phone: ${phone}`);
  if (email) lines.push(`Email: ${email}`);
  if (message) lines.push("", message);
  return lines.join("\n");
}

function buildJobberRequestTitle(form) {
  return `New Request - ${form.fullName || `${form.firstName || ""} ${form.lastName || ""}`.trim() || "Website Lead"}`;
}

function buildJobberFormDetailsLog(form) {
  return buildJobberRequestDetails({
    leadSource: form.leadSource,
    service: form.service,
    message: form.message,
    phone: form.phone,
    email: form.email,
  });
}

async function jobberGraphql(accessToken, query, variables) {
  const response = await fetch(JOBBER_GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-JOBBER-GRAPHQL-VERSION": JOBBER_GRAPHQL_VERSION,
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(
      getString(payload?.message) ||
        `Jobber HTTP ${response.status}`
    );
    err.status = response.status;
    err.payload = payload;
    throw err;
  }

  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    const err = new Error(payload.errors[0]?.message || "Jobber GraphQL error");
    err.graphqlErrors = payload.errors;
    err.payload = payload;
    throw err;
  }

  return payload;
}

async function refreshJobberAccessToken() {
  const clientId = process.env.JOBBER_CLIENT_ID;
  const clientSecret = process.env.JOBBER_CLIENT_SECRET;
  const refreshToken = process.env.JOBBER_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing Jobber OAuth credentials for token refresh");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch(JOBBER_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const rawText = await response.text();
  let tokenData = {};
  try {
    tokenData = rawText ? JSON.parse(rawText) : {};
  } catch {
    tokenData = {};
  }

  if (!response.ok) {
    throw new Error(
      getString(tokenData?.error_description) ||
        getString(tokenData?.error) ||
        `Token refresh HTTP ${response.status}`
    );
  }

  const accessToken = getString(tokenData?.access_token);
  if (!accessToken) {
    throw new Error("Token refresh succeeded but access_token was missing");
  }

  console.log("[api/request][jobber] Token refreshed");

  return accessToken;
}

async function getJobberAccessToken() {
  let accessToken = getString(process.env.JOBBER_ACCESS_TOKEN);
  if (accessToken) return accessToken;
  return refreshJobberAccessToken();
}

async function jobberGraphqlWithAuth(query, variables) {
  let accessToken = await getJobberAccessToken();

  try {
    return await jobberGraphql(accessToken, query, variables);
  } catch (e) {
    if (e?.status !== 401) throw e;
    console.log("[api/request][jobber] Token rejected, refreshing");
    accessToken = await refreshJobberAccessToken();
    return jobberGraphql(accessToken, query, variables);
  }
}

function clientMatches(node, email, phoneDigits) {
  if (email) {
    const target = email.toLowerCase();
    const emails = Array.isArray(node?.emails) ? node.emails : [];
    if (
      emails.some(
        (item) => getString(item?.address).toLowerCase() === target
      )
    ) {
      return true;
    }
  }

  if (phoneDigits) {
    const phones = Array.isArray(node?.phones) ? node.phones : [];
    if (
      phones.some((item) => normalizePhone(item?.number) === phoneDigits)
    ) {
      return true;
    }
  }

  return false;
}

async function findExistingJobberClient({ email, phone }) {
  const phoneDigits = normalizePhone(phone);
  if (!email && !phoneDigits) return null;

  console.log("[api/request][jobber] Searching for existing client", {
    email: email || "(none)",
    phone: phone || "(none)",
  });

  const query = `
    query FindClients($after: String) {
      clients(first: ${JOBBER_CLIENT_PAGE_SIZE}, after: $after) {
        nodes {
          id
          emails { address }
          phones { number }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  let after = null;

  for (let page = 0; page < JOBBER_CLIENT_SEARCH_PAGES; page += 1) {
    const payload = await jobberGraphqlWithAuth(query, { after });
    const connection = payload?.data?.clients;
    const nodes = Array.isArray(connection?.nodes) ? connection.nodes : [];

    for (const node of nodes) {
      if (clientMatches(node, email, phoneDigits)) {
        console.log("[api/request][jobber] Existing client lookup successful", {
          clientId: node.id,
          page: page + 1,
        });
        return node.id;
      }
    }

    const pageInfo = connection?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo?.endCursor) break;
    after = pageInfo.endCursor;
  }

  console.log("[api/request][jobber] No existing client match");
  return null;
}

async function createJobberClient(form) {
  const firstName = getString(form.firstName);
  const lastName = getString(form.lastName);
  const email = getString(form.email);
  const phone = getString(form.phone);
  const address1 = getString(form.address1);
  const address2 = getString(form.address2);
  const city = getString(form.city);
  const state = getString(form.state);
  const zip = getString(form.zip);

  const clientInput = {
    firstName,
    lastName,
    ...(email
      ? {
          emails: [
            { address: email, primary: true, description: "MAIN" },
          ],
        }
      : {}),
    ...(phone
      ? {
          phones: [{ number: phone, primary: true, description: "MAIN" }],
        }
      : {}),
    ...(address1
      ? {
          billingAddress: {
            street1: address1,
            ...(address2 ? { street2: address2 } : {}),
            ...(city ? { city } : {}),
            province: state || "FL",
            ...(zip ? { postalCode: zip } : {}),
            country: "United States",
          },
        }
      : {}),
  };

  console.log("[api/request][jobber] Client input sent to Jobber", clientInput);

  const payload = await jobberGraphqlWithAuth(JOBBER_CLIENT_CREATE_MUTATION, {
    input: clientInput,
  });
  const result = payload?.data?.clientCreate;
  const userErrors = Array.isArray(result?.userErrors) ? result.userErrors : [];

  if (userErrors.length > 0) {
    throw new Error(
      userErrors.map((e) => getString(e?.message)).filter(Boolean).join("; ") ||
        "clientCreate userErrors"
    );
  }

  const clientId = getString(result?.client?.id);
  if (!clientId) throw new Error("clientCreate returned no client id");

  console.log("[api/request][jobber] Client created", {
    clientId,
    jobberWebUri: result?.client?.jobberWebUri,
  });

  return clientId;
}

async function findOrCreateJobberClient(form) {
  const existingId = await findExistingJobberClient({
    email: form.email,
    phone: form.phone,
  });
  if (existingId) return existingId;
  return createJobberClient(form);
}

async function createJobberRequest(clientId, form) {
  const requestInput = {
    clientId,
    title: buildJobberRequestTitle(form),
  };

  if (JOBBER_REQUEST_CREATE_MUTATION.includes("requestCreate(request:")) {
    throw new Error("Invalid Jobber requestCreate mutation signature in source");
  }

  console.log("[api/request][jobber] Request input sent to Jobber", requestInput);

  const payload = await jobberGraphqlWithAuth(JOBBER_REQUEST_CREATE_MUTATION, {
    input: requestInput,
  });
  const result = payload?.data?.requestCreate;
  const userErrors = Array.isArray(result?.userErrors) ? result.userErrors : [];

  if (userErrors.length > 0) {
    throw new Error(
      userErrors.map((e) => getString(e?.message)).filter(Boolean).join("; ") ||
        "requestCreate userErrors"
    );
  }

  const requestId = getString(result?.request?.id);
  if (!requestId) throw new Error("requestCreate returned no request id");

  console.log("[api/request][jobber] Request created", {
    requestId,
    requestStatus: result?.request?.requestStatus,
    jobberWebUri: result?.request?.jobberWebUri,
  });

  return requestId;
}

async function syncJobberFromQuoteForm(form) {
  if (!getString(process.env.JOBBER_ACCESS_TOKEN) && !getString(process.env.JOBBER_REFRESH_TOKEN)) {
    console.log("[api/request][jobber] Skipped (no Jobber tokens configured)");
    return { created: false, skipped: true };
  }

  console.log("[api/request][jobber] Starting Jobber sync");
  console.log(
    "[api/request][jobber] Full form details (Resend email; lead source on client is set by Jobber app)",
    buildJobberFormDetailsLog(form)
  );

  const clientId = await findOrCreateJobberClient(form);
  const requestId = await createJobberRequest(clientId, form);

  return { created: true, clientId, requestId };
}

async function tryJobberSync(form) {
  try {
    const result = await syncJobberFromQuoteForm(form);
    return {
      jobberRequestCreated: Boolean(result.created),
      jobberRequestId: result.requestId || null,
      jobberClientId: result.clientId || null,
    };
  } catch (jobberError) {
    console.error("[api/request][jobber] Jobber sync failed", {
      message: jobberError?.message || String(jobberError),
      graphqlErrors: jobberError?.graphqlErrors,
    });
    return {
      jobberRequestCreated: false,
      jobberRequestId: null,
      jobberClientId: null,
    };
  }
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
  const address1 = getString(body?.address1);
  const address2 = getString(body?.address2);
  const city = getString(body?.city);
  const stateRaw = getString(body?.state);
  const zip = getString(body?.zip);
  const leadSource = getString(body?.leadSource);
  const projectType = getString(body?.projectType);
  const message = getString(body?.message);
  const attachments = Array.isArray(body?.attachments) ? body.attachments : [];
  const website = getString(body?.website); // honeypot

  if (website) return json(res, 200, { ok: true }); // silently accept bots

  const state = stateRaw ? stateRaw.toUpperCase() : "";
  const addressLines = [address1, address2].filter(Boolean);
  const cityStateZip = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const address = [addressLines.join("\n"), cityStateZip].filter(Boolean).join("\n");

  // Required fields (match the ones marked with "*" in the form)
  if (!firstName || !lastName || !phone || !leadSource) {
    return json(res, 400, { ok: false, error: "Missing required fields" });
  }

  const fullName = `${firstName}${lastName ? ` ${lastName}` : ""}`.trim();

  if (isTestApiRequest(body)) {
    console.log("[api/request] Test API request — skipping Resend emails", {
      email: email || "(none)",
    });
    const jobber = await tryJobberSync({
      firstName,
      lastName,
      email,
      phone,
      address1,
      address2,
      city,
      state,
      zip,
      leadSource,
      service: projectType,
      message,
      fullName,
    });
    return json(res, 200, {
      ok: true,
      test: true,
      emailsSkipped: true,
      confirmationSent: false,
      jobberRequestCreated: jobber.jobberRequestCreated,
      ...(jobber.jobberRequestId ? { jobberRequestId: jobber.jobberRequestId } : {}),
      ...(jobber.jobberClientId ? { jobberClientId: jobber.jobberClientId } : {}),
    });
  }

  const hasQuickScreen =
    getString(message).includes("Quick Screen Quote") ||
    getString(message).includes("Panel breakdown:");
  const subject = hasQuickScreen
    ? `New quote request (Quick Screen Quote) from ${fullName || "Website"}`
    : `New quote request from ${fullName || "Website"}`;
  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.45;">
      <h2 style="margin:0 0 12px;">New quote request</h2>
      <table cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 6px 0; width: 140px;"><strong>First name</strong></td><td style="padding: 6px 0;">${escapeHtml(firstName)}</td></tr>
        <tr><td style="padding: 6px 0;"><strong>Last name</strong></td><td style="padding: 6px 0;">${escapeHtml(lastName)}</td></tr>
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
        html: buildConfirmationHtml(firstName),
      });

      if (confirmationResult.error) {
        console.error("[api/request] Customer confirmation failed", {
          to: email,
          error: confirmationResult.error,
        });

        const jobber = await tryJobberSync({
          firstName,
          lastName,
          email,
          phone,
          address1,
          address2,
          city,
          state,
          zip,
          leadSource,
          service: projectType,
          message,
          fullName,
        });

        return json(res, 200, {
          ok: true,
          id: internalResult.data?.id,
          confirmationSent: false,
          jobberRequestCreated: jobber.jobberRequestCreated,
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

    const jobber = await tryJobberSync({
      firstName,
      lastName,
      email,
      phone,
      address1,
      address2,
      city,
      state,
      zip,
      leadSource,
      service: projectType,
      message,
      fullName,
    });

    return json(res, 200, {
      ok: true,
      id: internalResult.data?.id,
      confirmationSent,
      jobberRequestCreated: jobber.jobberRequestCreated,
      ...(confirmationId ? { confirmationId } : {}),
      ...(jobber.jobberRequestId ? { jobberRequestId: jobber.jobberRequestId } : {}),
      ...(jobber.jobberClientId ? { jobberClientId: jobber.jobberClientId } : {}),
    });
  } catch (e) {
    console.error("[api/request] Unexpected error", e);
    return json(res, 500, { ok: false, error: e?.message || "Server error" });
  }
}

