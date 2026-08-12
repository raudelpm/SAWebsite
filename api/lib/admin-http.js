import { getSessionFromRequest } from "./admin-auth.js";

export function json(res, status, body, headers = {}) {
  const response = res
    .status(status)
    .setHeader("Content-Type", "application/json; charset=utf-8");
  Object.entries(headers).forEach(([key, value]) => {
    response.setHeader(key, value);
  });
  return response.send(JSON.stringify(body));
}

export function parseJsonBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  return body && typeof body === "object" ? body : {};
}

export function requireAdmin(req, res) {
  const session = getSessionFromRequest(req);
  if (!session) {
    json(res, 401, { ok: false, error: "Not authenticated." });
    return null;
  }
  return session;
}
