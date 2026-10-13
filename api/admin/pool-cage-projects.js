import { json, parseJsonBody, requireAdmin } from "../_lib/admin-http.js";
import {
  deleteProject,
  duplicateProject,
  getProject,
  listProjects,
  normalizeProjectInput,
  projectBelongsTo,
  saveProject,
  storageMode,
  toSummary,
} from "../_lib/pool-cage-projects-store.js";

function getId(req, body) {
  const fromQuery = (typeof req.query?.id === "string" && req.query.id) || (Array.isArray(req.query?.id) ? req.query.id[0] : "");
  if (fromQuery) return fromQuery;
  if (body && typeof body.id === "string") return body.id;
  return "";
}

export default async function handler(req, res) {
  const session = requireAdmin(req, res);
  if (!session) return;

  const body = ["POST", "PUT", "DELETE"].includes(req.method) ? parseJsonBody(req) : {};
  const id = getId(req, body);

  if (req.method === "GET") {
    if (id) {
      const project = await getProject(id);
      if (!project || !projectBelongsTo(project, session.username)) {
        return json(res, 404, { ok: false, error: "Project not found." });
      }
      return json(res, 200, { ok: true, storage: storageMode(), project });
    }
    const projects = await listProjects(session.username);
    return json(res, 200, {
      ok: true,
      storage: storageMode(),
      projects: projects.map(toSummary),
    });
  }

  if (req.method === "POST" && body.action === "duplicate") {
    const existing = await getProject(body.id);
    if (!existing || !projectBelongsTo(existing, session.username)) {
      return json(res, 404, { ok: false, error: "Project not found." });
    }
    const saved = await saveProject(duplicateProject(existing, session.username));
    return json(res, 201, { ok: true, storage: storageMode(), project: toSummary(saved) });
  }

  if (req.method === "POST") {
    const result = normalizeProjectInput(body, { username: session.username });
    if (!result.ok) return json(res, 400, { ok: false, error: result.error });
    result.project.userId = session.username;
    result.project.createdBy = session.username;
    const saved = await saveProject(result.project);
    return json(res, 201, { ok: true, storage: storageMode(), project: saved });
  }

  if (req.method === "PUT") {
    if (!id) return json(res, 400, { ok: false, error: "Missing project id." });
    const existing = await getProject(id);
    if (!existing || !projectBelongsTo(existing, session.username)) {
      return json(res, 404, { ok: false, error: "Project not found." });
    }
    const result = normalizeProjectInput(body, { existing, username: session.username });
    if (!result.ok) return json(res, 400, { ok: false, error: result.error });
    result.project.id = existing.id;
    result.project.createdAt = existing.createdAt;
    result.project.createdBy = existing.createdBy || session.username;
    result.project.userId = existing.userId || existing.createdBy || session.username;
    const saved = await saveProject(result.project);
    return json(res, 200, { ok: true, storage: storageMode(), project: saved });
  }

  if (req.method === "DELETE") {
    if (!id) return json(res, 400, { ok: false, error: "Missing project id." });
    const existing = await getProject(id);
    if (!existing || !projectBelongsTo(existing, session.username)) {
      return json(res, 404, { ok: false, error: "Project not found." });
    }
    const removed = await deleteProject(id);
    if (!removed) return json(res, 404, { ok: false, error: "Project not found." });
    return json(res, 200, { ok: true });
  }

  res.setHeader("Allow", "GET, POST, PUT, DELETE");
  return json(res, 405, { ok: false, error: "Method not allowed." });
}
