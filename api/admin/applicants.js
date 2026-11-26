import { getSessionFromRequest } from "../_lib/admin-auth.js";
import { json, parseJsonBody } from "../_lib/admin-http.js";
import {
  deleteApplicant,
  listApplicants,
  normalizeApplicantInput,
  saveApplicant,
  storageMode,
} from "../_lib/applicants-store.js";

function localPreview(req) {
  const host = String(req.headers?.host || "");
  const local = /^localhost(?::\d+)?$/i.test(host) || /^127\.0\.0\.1(?::\d+)?$/i.test(host);
  const prod = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  return local && !prod;
}

function authorize(req, res) {
  const session = getSessionFromRequest(req);
  if (session) return session;
  if (localPreview(req)) return { username: "local" };
  json(res, 401, { ok: false, error: "Not authenticated." });
  return null;
}

function getId(req, body) {
  const fromQuery =
    (typeof req.query?.id === "string" && req.query.id) ||
    (Array.isArray(req.query?.id) ? req.query.id[0] : "");
  if (fromQuery) return fromQuery;
  if (body && typeof body.id === "string") return body.id;
  return "";
}

export default async function handler(req, res) {
  const session = authorize(req, res);
  if (!session) return;

  if (req.method === "GET") {
    const applicants = await listApplicants();
    return json(res, 200, { ok: true, storage: storageMode(), applicants });
  }

  if (req.method === "POST") {
    const body = parseJsonBody(req);
    const result = normalizeApplicantInput(body);
    if (!result.ok) return json(res, 400, { ok: false, error: "validation", fields: result.fields });
    const saved = await saveApplicant(result.applicant);
    return json(res, 201, { ok: true, storage: storageMode(), applicant: saved });
  }

  if (req.method === "DELETE") {
    const body = parseJsonBody(req);
    const id = getId(req, body);
    if (!id) return json(res, 400, { ok: false, error: "Missing applicant id." });
    const removed = await deleteApplicant(id);
    if (!removed) return json(res, 404, { ok: false, error: "Applicant not found." });
    return json(res, 200, { ok: true });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return json(res, 405, { ok: false, error: "Method not allowed." });
}
