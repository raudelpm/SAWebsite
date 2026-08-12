import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { del, get, list, put } from "@vercel/blob";

const PREFIX = "porch-estimates/";
const LOCAL_DIR = path.join(process.cwd(), ".data");
const LOCAL_FILE = path.join(LOCAL_DIR, "porch-estimates.json");

function hasBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function newId() {
  return `est_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function normalizeSection(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  return {
    widthFt: Math.max(0, Number(s.widthFt) || 0),
    widthIn: Math.max(0, Number(s.widthIn) || 0),
    heightFt: Math.max(0, Number(s.heightFt) || 0),
    heightIn: Math.max(0, Number(s.heightIn) || 0),
    door: Boolean(s.door),
    kickPlate: Boolean(s.kickPlate),
    chairRail: Boolean(s.chairRail),
  };
}

export function normalizeEstimateInput(body, { existing, username } = {}) {
  const now = new Date().toISOString();
  const sectionsIn = Array.isArray(body?.sections) ? body.sections : [];
  const sections = sectionsIn.map(normalizeSection).filter((s) => {
    const w = s.widthFt + s.widthIn / 12;
    const h = s.heightFt + s.heightIn / 12;
    return w > 0 && h > 0;
  });

  if (!sections.length) {
    return { ok: false, error: "Add at least one section with width and height." };
  }

  const title =
    typeof body?.title === "string" && body.title.trim()
      ? body.title.trim().slice(0, 160)
      : existing?.title || "Untitled porch estimate";

  const projectType =
    body?.projectType === "back" || body?.projectType === "front"
      ? body.projectType
      : existing?.projectType || "front";

  const notes =
    typeof body?.notes === "string" ? body.notes.trim().slice(0, 2000) : existing?.notes || "";

  const screenRaw =
    body?.screenCost != null
      ? body.screenCost
      : body?.totals && body.totals.screenCost != null
        ? body.totals.screenCost
        : existing?.screenCost;
  let screenCost = Number(screenRaw);
  if (!Number.isFinite(screenCost) || screenCost < 0) screenCost = 0;
  screenCost = Math.round(screenCost * 100) / 100;

  const totals =
    body?.totals && typeof body.totals === "object"
      ? { ...body.totals, screenCost }
      : existing?.totals
        ? { ...existing.totals, screenCost }
        : { screenCost };

  const estimate = {
    id: existing?.id || newId(),
    title,
    projectType,
    notes,
    screenCost,
    sections,
    totals,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    createdBy: existing?.createdBy || username || "admin",
    updatedBy: username || existing?.updatedBy || "admin",
  };

  return { ok: true, estimate };
}

async function readLocalAll() {
  try {
    const raw = await fs.readFile(LOCAL_FILE, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data?.estimates) ? data.estimates : [];
  } catch {
    return [];
  }
}

async function writeLocalAll(estimates) {
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(
    LOCAL_FILE,
    JSON.stringify({ estimates, updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

async function readBlobJson(pathnameOrUrl) {
  const got = await get(pathnameOrUrl, {
    access: "private",
    useCache: false,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  if (!got || got.statusCode !== 200 || !got.stream) return null;
  const text = await new Response(got.stream).text();
  return JSON.parse(text);
}

async function listBlobEstimates() {
  const result = await list({
    prefix: PREFIX,
    limit: 1000,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  const estimates = [];
  for (const blob of result.blobs || []) {
    try {
      const data = await readBlobJson(blob.pathname);
      if (data && data.id) estimates.push(data);
    } catch {
      /* skip bad blob */
    }
  }
  estimates.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return estimates;
}

export async function listEstimates() {
  if (hasBlob()) return listBlobEstimates();
  const estimates = await readLocalAll();
  estimates.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return estimates;
}

export async function getEstimate(id) {
  if (!id) return null;
  if (hasBlob()) {
    try {
      const data = await readBlobJson(`${PREFIX}${id}.json`);
      if (data && data.id === id) return data;
    } catch {
      /* fall through to list scan */
    }
    const estimates = await listBlobEstimates();
    return estimates.find((e) => e.id === id) || null;
  }
  const estimates = await readLocalAll();
  return estimates.find((e) => e.id === id) || null;
}

export async function saveEstimate(estimate) {
  if (hasBlob()) {
    await put(`${PREFIX}${estimate.id}.json`, JSON.stringify(estimate, null, 2), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return estimate;
  }
  const estimates = await readLocalAll();
  const idx = estimates.findIndex((e) => e.id === estimate.id);
  if (idx >= 0) estimates[idx] = estimate;
  else estimates.unshift(estimate);
  await writeLocalAll(estimates);
  return estimate;
}

export async function deleteEstimate(id) {
  if (!id) return false;
  if (hasBlob()) {
    const pathname = `${PREFIX}${id}.json`;
    try {
      const existing = await readBlobJson(pathname);
      if (!existing) return false;
      await del(pathname, { token: process.env.BLOB_READ_WRITE_TOKEN });
      return true;
    } catch {
      return false;
    }
  }
  const estimates = await readLocalAll();
  const next = estimates.filter((e) => e.id !== id);
  if (next.length === estimates.length) return false;
  await writeLocalAll(next);
  return true;
}

export function storageMode() {
  return hasBlob() ? "blob" : "local-file";
}
