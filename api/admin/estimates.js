import { json, parseJsonBody, requireAdmin } from "../lib/admin-http.js";
import {
  deleteEstimate,
  getEstimate,
  listEstimates,
  normalizeEstimateInput,
  saveEstimate,
  storageMode,
} from "../lib/porch-estimates-store.js";

function getId(req, body) {
  const fromQuery =
    (typeof req.query?.id === "string" && req.query.id) ||
    (Array.isArray(req.query?.id) ? req.query.id[0] : "");
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
      const estimate = await getEstimate(id);
      if (!estimate) return json(res, 404, { ok: false, error: "Estimate not found." });
      return json(res, 200, { ok: true, storage: storageMode(), estimate });
    }
    const estimates = await listEstimates();
    return json(res, 200, {
      ok: true,
      storage: storageMode(),
      estimates: estimates.map((e) => ({
        id: e.id,
        title: e.title,
        projectType: e.projectType,
        sectionCount: Array.isArray(e.sections) ? e.sections.length : 0,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        createdBy: e.createdBy,
        updatedBy: e.updatedBy,
        totals: e.totals
          ? {
              areaSqft: e.totals.areaSqft,
              materialCost: e.totals.materialCost,
              calculatedPrice: e.totals.calculatedPrice,
            }
          : null,
      })),
    });
  }

  if (req.method === "POST") {
    const result = normalizeEstimateInput(body, { username: session.username });
    if (!result.ok) return json(res, 400, { ok: false, error: result.error });
    const saved = await saveEstimate(result.estimate);
    return json(res, 201, { ok: true, storage: storageMode(), estimate: saved });
  }

  if (req.method === "PUT") {
    if (!id) return json(res, 400, { ok: false, error: "Missing estimate id." });
    const existing = await getEstimate(id);
    if (!existing) return json(res, 404, { ok: false, error: "Estimate not found." });
    const result = normalizeEstimateInput(body, {
      existing,
      username: session.username,
    });
    if (!result.ok) return json(res, 400, { ok: false, error: result.error });
    result.estimate.id = existing.id;
    result.estimate.createdAt = existing.createdAt;
    result.estimate.createdBy = existing.createdBy;
    const saved = await saveEstimate(result.estimate);
    return json(res, 200, { ok: true, storage: storageMode(), estimate: saved });
  }

  if (req.method === "DELETE") {
    if (!id) return json(res, 400, { ok: false, error: "Missing estimate id." });
    const removed = await deleteEstimate(id);
    if (!removed) return json(res, 404, { ok: false, error: "Estimate not found." });
    return json(res, 200, { ok: true });
  }

  res.setHeader("Allow", "GET, POST, PUT, DELETE");
  return json(res, 405, { ok: false, error: "Method not allowed." });
}
