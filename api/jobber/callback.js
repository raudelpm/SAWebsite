const JOBBER_TOKEN_URL = "https://api.getjobber.com/api/oauth/token";
const JOBBER_REDIRECT_URI = "https://screenarmors.com/api/jobber/callback";

function html(res, status, body) {
  return res
    .status(status)
    .setHeader("Content-Type", "text/html; charset=utf-8")
    .send(body);
}

function getString(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}

function successPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Jobber connected</title>
</head>
<body style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5; padding: 2rem; max-width: 36rem;">
  <h1 style="margin: 0 0 0.75rem;">Jobber connected successfully</h1>
  <p style="margin: 0;">Add JOBBER_ACCESS_TOKEN and JOBBER_REFRESH_TOKEN to your Vercel environment variables.</p>
</body>
</html>`;
}

function errorPage(message) {
  const safe = String(message)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Jobber connection failed</title>
</head>
<body style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.5; padding: 2rem; max-width: 36rem;">
  <h1 style="margin: 0 0 0.75rem;">Jobber connection failed</h1>
  <p style="margin: 0;">${safe}</p>
</body>
</html>`;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return html(res, 405, errorPage("Method not allowed"));
  }

  const code = getString(req.query?.code);
  const oauthError = getString(req.query?.error);

  console.log("[api/jobber/callback] OAuth callback received", {
    hasCode: Boolean(code),
    error: oauthError || undefined,
  });

  if (oauthError) {
    console.error("[api/jobber/callback] Jobber returned error", { error: oauthError });
    return html(res, 400, errorPage(`Jobber authorization error: ${oauthError}`));
  }

  if (!code) {
    console.error("[api/jobber/callback] Missing authorization code");
    return html(res, 400, errorPage("Missing authorization code."));
  }

  const clientId = process.env.JOBBER_CLIENT_ID;
  const clientSecret = process.env.JOBBER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("[api/jobber/callback] Missing JOBBER_CLIENT_ID or JOBBER_CLIENT_SECRET");
    return html(res, 500, errorPage("Server is missing Jobber OAuth credentials."));
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: JOBBER_REDIRECT_URI,
  });

  try {
    console.log("[api/jobber/callback] Exchanging authorization code", {
      redirect_uri: JOBBER_REDIRECT_URI,
    });

    const tokenResponse = await fetch(JOBBER_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const rawText = await tokenResponse.text();
    let tokenData = {};
    try {
      tokenData = rawText ? JSON.parse(rawText) : {};
    } catch {
      tokenData = {};
    }

    if (!tokenResponse.ok) {
      console.error("[api/jobber/callback] Token exchange failed", {
        status: tokenResponse.status,
        error: getString(tokenData?.error),
        error_description: getString(tokenData?.error_description),
      });
      const detail =
        getString(tokenData?.error_description) ||
        getString(tokenData?.error) ||
        `HTTP ${tokenResponse.status}`;
      return html(res, 502, errorPage(`Token exchange failed: ${detail}`));
    }

    const accessToken = getString(tokenData?.access_token);
    const refreshToken = getString(tokenData?.refresh_token);

    if (!accessToken) {
      console.error("[api/jobber/callback] Token exchange succeeded but access_token was missing");
      return html(res, 502, errorPage("Token exchange succeeded but access_token was missing."));
    }

    console.log("[api/jobber/callback] Token exchange succeeded", {
      hasRefreshToken: Boolean(refreshToken),
    });
    // TEMPORARY: remove after updating Vercel JOBBER_* env vars
    console.log("NEW_JOBBER_ACCESS_TOKEN =", tokenData.access_token);
    console.log("NEW_JOBBER_REFRESH_TOKEN =", tokenData.refresh_token);

    return html(res, 200, successPage());
  } catch (e) {
    console.error("[api/jobber/callback] Unexpected error", e);
    return html(res, 500, errorPage(e?.message || "Server error"));
  }
}
