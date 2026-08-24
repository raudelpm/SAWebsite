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

const ESTIMATE_VERSION = 1;

function newId() {
  return `est_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function yesNo(value, defaultYes) {
  if (value === false || value === "no" || value === "false") return false;
  if (value === true || value === "yes" || value === "true") return true;
  return Boolean(defaultYes);
}

function estimateOwner(estimate) {
  if (!estimate || typeof estimate !== "object") return "";
  return String(estimate.userId || estimate.createdBy || "").trim().toLowerCase();
}

export function estimateBelongsTo(estimate, username) {
  const owner = estimateOwner(estimate);
  const user = String(username || "")
    .trim()
    .toLowerCase();
  return Boolean(owner && user && owner === user);
}

function normalizeSection(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  const door = Boolean(s.door);
  let doorPosition = String(s.doorPosition || "")
    .trim()
    .toLowerCase();
  if (doorPosition === "middle") doorPosition = "center";
  if (doorPosition !== "left" && doorPosition !== "center" && doorPosition !== "right") {
    doorPosition = "";
  }
  const members = ["none", "1x2", "2x2", "2x3", "2x4"];
  function member(value, fallback) {
    const v = String(value || "")
      .trim()
      .toLowerCase();
    if (v === "1x1") return "1x2";
    if (members.includes(v)) return v;
    return fallback == null ? "1x2" : fallback;
  }
  function zBarLike(value, fallback) {
    const v = String(value || "")
      .trim()
      .toLowerCase();
    if (!v) return fallback;
    if (v === "zbar") return "z-bar";
    return v;
  }
  const openingShape = String(s.openingShape || "").toLowerCase() === "arch" ? "arch" : "rectangle";
  const customDoor = door && yesNo(s.customDoor, false);
  return {
    widthFt: Math.max(0, Number(s.widthFt) || 0),
    widthIn: Math.max(0, Number(s.widthIn) || 0),
    heightFt: Math.max(0, Number(s.heightFt) || 0),
    heightIn: Math.max(0, Number(s.heightIn) || 0),
    openingShape,
    centerHeightFt: Math.max(0, Number(s.centerHeightFt) || 0),
    centerHeightIn: Math.max(0, Number(s.centerHeightIn) || 0),
    straightAngle2x2: openingShape === "arch" ? yesNo(s.straightAngle2x2, true) : true,
    leftMember: member(s.leftMember),
    rightMember: member(s.rightMember),
    topMember: member(s.topMember),
    bottomMember: member(s.bottomMember),
    door,
    doorPosition: door ? doorPosition : "",
    customDoor,
    panelAboveDoor: door ? yesNo(s.panelAboveDoor, true) : true,
    doorWidthFt: Math.max(0, Number(s.doorWidthFt) || 0),
    doorWidthIn: Math.max(0, Number(s.doorWidthIn) || 0),
    doorHeightFt: Math.max(0, Number(s.doorHeightFt) || 0),
    doorHeightIn: Math.max(0, Number(s.doorHeightIn) || 0),
    customDoorPrice: Math.max(0, Math.round((Number(s.customDoorPrice) || 0) * 100) / 100),
    doorLeftPost: door ? member(s.doorLeftPost, "2x2") : "",
    doorRightPost: door ? member(s.doorRightPost, "2x2") : "",
    doorFrame: door ? zBarLike(s.doorFrame, "z-bar") : "",
    doorHeader: door ? member(s.doorHeader, "2x2") : "",
    doorHeaderInsert: door ? zBarLike(s.doorHeaderInsert, "z-bar") : "",
    kickPlate: Boolean(s.kickPlate),
    kickPlateHeightIn: Boolean(s.kickPlate)
      ? (() => {
          const n = Math.round(Number(s.kickPlateHeightIn));
          if (n === 8 || n === 36) return n;
          return 16;
        })()
      : 0,
    chairRail: Boolean(s.chairRail),
    chairRailMember: Boolean(s.chairRail) ? member(s.chairRailMember, "2x2") : "",
    chairRailHeightIn: Boolean(s.chairRail)
      ? Math.max(0, Number(s.chairRailHeightIn) || 36)
      : 0,
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

  for (let i = 0; i < sections.length; i++) {
    if (sections[i].door && !sections[i].doorPosition) {
      return {
        ok: false,
        error: `Section ${i + 1}: select Door Position (Left / Center / Right).`,
      };
    }
    if (sections[i].customDoor) {
      const dw = sections[i].doorWidthFt + sections[i].doorWidthIn / 12;
      const dh = sections[i].doorHeightFt + sections[i].doorHeightIn / 12;
      if (dw <= 0 || dh <= 0) {
        return {
          ok: false,
          error: `Section ${i + 1}: enter Custom Door width and height.`,
        };
      }
    }
    if (sections[i].openingShape === "arch") {
      const straight = sections[i].heightFt + sections[i].heightIn / 12;
      const center = sections[i].centerHeightFt + sections[i].centerHeightIn / 12;
      if (center <= straight) {
        return {
          ok: false,
          error: `Section ${i + 1}: Center Height must be greater than Straight Height.`,
        };
      }
    }
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
      : existing?.screenCost;
  let screenCost = Number(screenRaw);
  if (!Number.isFinite(screenCost) || screenCost < 0) screenCost = 0;
  screenCost = Math.round(screenCost * 100) / 100;

  const SCREEN_TYPE_IDS = ["18/14", "20/20", "16/14", "17/20"];
  const DEFAULT_SCREEN_TYPE = "18/14";
  let screenType = String(body?.screenType ?? existing?.screenType ?? DEFAULT_SCREEN_TYPE)
    .trim();
  if (!SCREEN_TYPE_IDS.includes(screenType)) screenType = DEFAULT_SCREEN_TYPE;

  function normalizeCostField(raw, fallback) {
    let n = Number(raw);
    if (!Number.isFinite(n) || n < 0) n = fallback;
    return Math.round(n * 100) / 100;
  }

  const screwsRaw =
    body?.screwsAndMisc != null ? body.screwsAndMisc : existing?.screwsAndMisc;
  const overheadRaw = body?.overhead != null ? body.overhead : existing?.overhead;
  const screwsAndMisc = normalizeCostField(screwsRaw, 100);
  const overhead = normalizeCostField(overheadRaw, 300);

  const owner = String(existing?.userId || existing?.createdBy || username || "")
    .trim()
    .toLowerCase();

  const estimate = {
    version: ESTIMATE_VERSION,
    id: existing?.id || newId(),
    userId: owner,
    name: title,
    title,
    projectType,
    notes,
    screenType,
    screenCost,
    screwsAndMisc,
    overhead,
    sections,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    createdBy: existing?.createdBy || owner || username || "admin",
    updatedBy: username || existing?.updatedBy || owner || "admin",
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

export async function listEstimates(username) {
  const estimates = hasBlob() ? await listBlobEstimates() : await readLocalAll();
  estimates.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  if (!username) return [];
  return estimates.filter((e) => estimateBelongsTo(e, username));
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
