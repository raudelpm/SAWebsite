import {
  createSessionToken,
  sessionCookieHeader,
  validateCredentials,
} from "../lib/admin-auth.js";

function json(res, status, body, headers = {}) {
  const response = res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  Object.entries(headers).forEach(([key, value]) => {
    response.setHeader(key, value);
  });
  return response.send(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, error: "Method not allowed." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  body = body && typeof body === "object" ? body : {};

  const result = validateCredentials(body.username, body.password);
  if (!result.ok) {
    return json(res, 401, { ok: false, error: result.error });
  }

  const token = createSessionToken(result.username);
  if (!token) {
    return json(res, 500, {
      ok: false,
      error: "Admin login is not configured on the server.",
    });
  }

  return json(
    res,
    200,
    { ok: true, username: result.username },
    { "Set-Cookie": sessionCookieHeader(token) }
  );
}
