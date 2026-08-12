import {
  getSessionFromRequest,
  sessionCookieHeader,
} from "../lib/admin-auth.js";

function json(res, status, body, headers = {}) {
  const response = res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  Object.entries(headers).forEach(([key, value]) => {
    response.setHeader(key, value);
  });
  return response.send(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const session = getSessionFromRequest(req);
    if (!session) {
      return json(res, 401, { ok: false, authenticated: false });
    }
    return json(res, 200, {
      ok: true,
      authenticated: true,
      username: session.username,
    });
  }

  if (req.method === "POST") {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }
    body = body && typeof body === "object" ? body : {};
    if (body.action === "logout") {
      return json(
        res,
        200,
        { ok: true, authenticated: false },
        { "Set-Cookie": sessionCookieHeader("", { clear: true }) }
      );
    }
    return json(res, 400, { ok: false, error: "Unknown action." });
  }

  res.setHeader("Allow", "GET, POST");
  return json(res, 405, { ok: false, error: "Method not allowed." });
}
