import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { del, get, list, put } from "@vercel/blob";

const PREFIX = "pool-cage-projects/";
const LOCAL_DIR = path.join(process.cwd(), ".data");
const LOCAL_FILE = path.join(LOCAL_DIR, "pool-cage-projects.json");

function hasBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function newId() {
  return `cage_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function ownerOf(project) {
  if (!project || typeof project !== "object") return "";
  return String(project.userId || project.createdBy || "")
    .trim()
    .toLowerCase();
}

export function projectBelongsTo(project, username) {
  const owner = ownerOf(project);
  const user = String(username || "")
    .trim()
    .toLowerCase();
  return Boolean(owner && user && owner === user);
}

function text(value, max) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function num(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
}

function cleanPoint(raw, prefix) {
  const point = raw && typeof raw === "object" ? raw : {};
  const id = text(point.id, 40);
  if (!id) return null;
  return {
    id,
    x: num(point.x, 0, -100000, 100000),
    y: num(point.y, 0, -100000, 100000),
    postSize: text(point.postSize || "", 24),
    postHeightIn: point.postHeightIn == null ? null : num(point.postHeightIn, null, 0, 1000),
    prefix,
  };
}

function layoutVersions(source, existing, now) {
  const versionsIn = Array.isArray(source.versioning?.versions) ? source.versioning.versions : [];
  const versions = (versionsIn.length ? versionsIn : [{ id: "v1", label: "Version 1", createdAt: existing?.createdAt || now }])
    .slice(0, 20)
    .map((version, index) => ({
      id: text(version && version.id, 40) || `v${index + 1}`,
      label: text((version && version.label) || `Version ${index + 1}`, 80),
      createdAt: text(version && version.createdAt, 40) || now,
    }));
  return versions;
}

function cleanRoofProfile(profile, cageHeightIn) {
  const source = profile && typeof profile === "object" ? profile : {};
  const types = ["flat", "gable", "slope-flat-slope", "shed"];
  const wall = num(source.wallHeightIn, cageHeightIn || 120, 36, 480);
  const slope = (value) => (value == null || value === "" ? null : num(value, 0, 0, 2400));
  return {
    type: types.includes(source.type) ? source.type : "flat",
    direction: source.direction === "z" ? "z" : "x",
    wallHeightIn: wall,
    topHeightIn: Math.max(wall, num(source.topHeightIn, wall + 36, 36, 600)),
    flatWidthIn: num(source.flatWidthIn, 120, 0, 2400),
    leftSlopeIn: slope(source.leftSlopeIn),
    rightSlopeIn: slope(source.rightSlopeIn),
    highSide: source.highSide === "end" ? "end" : "start",
    highHeightIn: num(source.highHeightIn, wall + 24, 36, 600),
    lowHeightIn: num(source.lowHeightIn, wall, 36, 600),
  };
}

function normalizeLayoutProject(source, { existing, username } = {}) {
  const now = new Date().toISOString();
  const walls = (Array.isArray(source.walls) ? source.walls : [])
    .slice(0, 32)
    .map((wall, index) => {
      const item = wall && typeof wall === "object" ? wall : {};
      const id = text(item.id, 40) || `w${index + 1}`;
      const sections = (Array.isArray(item.verticalSections) ? item.verticalSections : [])
        .slice(0, 24)
        .map((section, sectionIndex) => {
          const raw = section && typeof section === "object" ? section : {};
          const sectionId = text(raw.id, 40) || `${id}s${sectionIndex + 1}`;
          return {
            id: sectionId,
            widthIn: num(raw.widthIn, 12, 1, 2400),
            clearViewGroupId: text(raw.clearViewGroupId || "", 40) || null,
          };
        });
      if (!sections.length) return null;
      const rows = (Array.isArray(item.horizontalRows) ? item.horizontalRows : [])
        .slice(0, 12)
        .map((row, rowIndex) => {
          const raw = row && typeof row === "object" ? row : {};
          return {
            id: text(raw.id, 40) || `${id}h${rowIndex + 1}`,
            heightIn: num(raw.heightIn, 60, 1, 480),
          };
        });
      return {
        id,
        name: text(item.name || `Wall ${index + 1}`, 80),
        lengthIn: num(item.lengthIn, sections.reduce((sum, section) => sum + section.widthIn, 0), 12, 5000),
        heightIn: num(item.heightIn, source.cageHeightIn || 120, 24, 480),
        verticalSections: sections,
        horizontalRows: rows.length ? rows : [{ id: `${id}h1`, heightIn: num(item.heightIn || source.cageHeightIn, 120, 24, 480) }],
        direction: text(item.direction || "", 16),
        signature: text(item.signature || "", 80),
        path: (Array.isArray(item.path) ? item.path : [])
          .slice(0, 40)
          .map((point) => ({
            x: num(point && point.x, 0, -100000, 100000),
            y: num(point && point.y, 0, -100000, 100000),
          }))
          .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)),
      };
    })
    .filter(Boolean);
  if (walls.length < 2) return { ok: false, error: "The cage needs at least two screened walls." };

  const wallIds = new Set(walls.map((wall) => wall.id));
  const sectionIds = new Set(walls.flatMap((wall) => wall.verticalSections.map((section) => section.id)));
  const clearViewGroups = (Array.isArray(source.clearViewGroups) ? source.clearViewGroups : [])
    .slice(0, 80)
    .map((group, index) => {
      const item = group && typeof group === "object" ? group : {};
      const ids = (Array.isArray(item.sectionIds) ? item.sectionIds : [])
        .map((id) => text(id, 40))
        .filter((id) => sectionIds.has(id));
      if (!wallIds.has(text(item.wallId, 40)) || !ids.length) return null;
      return {
        id: text(item.id, 40) || `cv${index + 1}`,
        wallId: text(item.wallId, 40),
        sectionIds: ids,
        headerBeamSize: text(item.headerBeamSize || "2x8", 24),
        leftPostSize: text(item.leftPostSize || "4x4", 24),
        rightPostSize: text(item.rightPostSize || "4x4", 24),
        removeIntermediatePosts: item.removeIntermediatePosts !== false,
      };
    })
    .filter(Boolean);
  const groupIds = new Set(clearViewGroups.map((group) => group.id));
  walls.forEach((wall) => {
    wall.verticalSections.forEach((section) => {
      if (!groupIds.has(section.clearViewGroupId)) section.clearViewGroupId = null;
    });
  });

  const nodes = (Array.isArray(source.nodes) ? source.nodes : [])
    .slice(0, 16)
    .map((node) => {
      const point = cleanPoint(node);
      if (!point) return null;
      return { id: point.id, x: point.x, y: point.y };
    })
    .filter(Boolean);
  const roofNodes = (Array.isArray(source.roofNodes) ? source.roofNodes : [])
    .slice(0, 800)
    .map((node) => {
      const point = cleanPoint(node);
      if (!point) return null;
      return { id: point.id, x: point.x, y: point.y };
    })
    .filter(Boolean);
  const roofIds = new Set(roofNodes.map((node) => node.id));
  const roofBeams = (Array.isArray(source.roofBeams) ? source.roofBeams : [])
    .slice(0, 800)
    .map((beam) => {
      const item = beam && typeof beam === "object" ? beam : {};
      const id = text(item.id, 40);
      if (!id || !roofIds.has(item.startNodeId) || !roofIds.has(item.endNodeId)) return null;
      return {
        id,
        startNodeId: text(item.startNodeId, 40),
        endNodeId: text(item.endNodeId, 40),
        beamSize: text(item.beamSize || "2x2", 24),
        category: text(item.category || "internal", 24),
      };
    })
    .filter(Boolean);

  const doors = (Array.isArray(source.doors) ? source.doors : [])
    .slice(0, 40)
    .map((door, index) => {
      const item = door && typeof door === "object" ? door : {};
      const wallId = text(item.wallId, 40);
      const wall = walls.find((entry) => entry.id === wallId);
      if (!wall) return null;
      const widthIn = num(item.widthIn, 36, 24, 240);
      const maxOffset = Math.max(0, wall.lengthIn - widthIn);
      return {
        id: text(item.id, 40) || `d${index + 1}`,
        wallId,
        widthIn,
        offsetIn: Math.min(num(item.offsetIn, 0, 0, 5000), maxOffset),
      };
    })
    .filter(Boolean);

  const roofIn = source.roof && typeof source.roof === "object" ? source.roof : {};
  const roofType = "grid";
  const columns = (Array.isArray(roofIn.columns) ? roofIn.columns : []).slice(0, 24).map((column, index) => ({
    id: text(column && column.id, 40) || `c${index + 1}`,
    widthIn: num(column && column.widthIn, 72, 1, 2400),
  }));
  const rows = (Array.isArray(roofIn.rows) ? roofIn.rows : []).slice(0, 24).map((row, index) => ({
    id: text(row && row.id, 40) || `r${index + 1}`,
    depthIn: num(row && row.depthIn, 60, 1, 2400),
  }));
  const versions = layoutVersions(source, existing, now);
  const recordOwner = String(existing?.userId || existing?.createdBy || username || "")
    .trim()
    .toLowerCase();

  return {
    ok: true,
    project: {
      schemaVersion: 2,
      id: existing?.id || newId(),
      userId: recordOwner,
      name: text(source.name || existing?.name || "Pool cage", 160),
      customerName: text(source.customerName, 160),
      notes: text(source.notes, 4000),
      cageHeightIn: num(source.cageHeightIn, 120, 24, 480),
      cornersManual: Boolean(source.cornersManual),
      attached: source.attached === true,
      roofType,
      showBeamLabels: source.showBeamLabels !== false,
      showGrid: source.showGrid !== false,
      snap: {
        enabled: source.snap?.enabled !== false,
        gridSizeIn: [1, 6, 12].includes(Number(source.snap?.gridSizeIn)) ? Number(source.snap.gridSizeIn) : 6,
      },
      walls,
      clearViewGroups,
      nodes,
      roof: {
        type: roofType,
        columns,
        rows,
        defaultBeam: text(roofIn.defaultBeam || "2x2", 24),
        perimeterBeam: text(roofIn.perimeterBeam || "2x4", 24),
        manual: Boolean(roofIn.manual),
        profile: cleanRoofProfile(roofIn.profile, num(source.cageHeightIn, 120, 24, 480)),
      },
      roofNodes,
      roofBeams,
      doors,
      gutterPoints: (Array.isArray(source.gutterPoints) ? source.gutterPoints : [])
        .slice(0, 24)
        .map((point, index) => {
          const item = point && typeof point === "object" ? point : {};
          const id = text(item.id, 40) || `g${index + 1}`;
          return { id, x: num(item.x, 0, -100000, 100000), y: num(item.y, 0, -100000, 100000) };
        }),
      versioning: {
        currentVersionId: text(source.versioning?.currentVersionId || versions[0].id, 40),
        versions,
      },
      seq: num(source.seq, existing?.seq || 1, 0, 1000000),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      createdBy: existing?.createdBy || recordOwner || username || "admin",
      updatedBy: username || existing?.updatedBy || recordOwner || "admin",
    },
  };
}

function normalizeProject(body, { existing, username } = {}) {
  const source = body && typeof body === "object" ? body : {};
  const incomingWalls = Array.isArray(source.walls) ? source.walls : [];
  if (incomingWalls.some((wall) => wall && Array.isArray(wall.verticalSections))) {
    return normalizeLayoutProject(source, { existing, username });
  }
  const now = new Date().toISOString();
  const nodes = (Array.isArray(source.nodes) ? source.nodes : [])
    .slice(0, 400)
    .map((node) => cleanPoint(node))
    .filter(Boolean)
    .map(({ prefix, ...node }) => node);
  if (nodes.length < 3) return { ok: false, error: "The cage needs at least three corners." };

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = (Array.isArray(source.edges) ? source.edges : [])
    .slice(0, 400)
    .map((edge) => {
      const item = edge && typeof edge === "object" ? edge : {};
      const id = text(item.id, 40);
      if (!id || !nodeIds.has(item.startNodeId) || !nodeIds.has(item.endNodeId)) return null;
      return {
        id,
        startNodeId: text(item.startNodeId, 40),
        endNodeId: text(item.endNodeId, 40),
        clearview: Boolean(item.clearview),
        headerSize: text(item.headerSize || "2x8", 24),
        supportPostSize: text(item.supportPostSize || "4x4", 24),
        bayIn: num(item.bayIn, 36, 12, 240),
      };
    })
    .filter(Boolean);
  if (!edges.length) return { ok: false, error: "Add the cage walls before saving." };

  const edgeIds = new Set(edges.map((edge) => edge.id));
  const walls = (Array.isArray(source.walls) ? source.walls : [])
    .slice(0, 80)
    .map((wall, index) => {
      const item = wall && typeof wall === "object" ? wall : {};
      const ids = (Array.isArray(item.edgeIds) ? item.edgeIds : []).map((id) => text(id, 40)).filter((id) => edgeIds.has(id));
      if (!ids.length) return null;
      return {
        id: text(item.id, 40) || `w${index + 1}`,
        name: text(item.name || `Wall ${index + 1}`, 80),
        edgeIds: ids,
      };
    })
    .filter(Boolean);
  if (!walls.length) return { ok: false, error: "The project needs at least one wall." };

  const roofNodes = (Array.isArray(source.roofNodes) ? source.roofNodes : [])
    .slice(0, 800)
    .map((node) => {
      const point = cleanPoint(node);
      if (!point) return null;
      return { id: point.id, x: point.x, y: point.y };
    })
    .filter(Boolean);
  const roofIds = new Set(roofNodes.map((node) => node.id));
  const roofBeams = (Array.isArray(source.roofBeams) ? source.roofBeams : [])
    .slice(0, 800)
    .map((beam) => {
      const item = beam && typeof beam === "object" ? beam : {};
      const id = text(item.id, 40);
      if (!id || !roofIds.has(item.startNodeId) || !roofIds.has(item.endNodeId)) return null;
      return {
        id,
        startNodeId: text(item.startNodeId, 40),
        endNodeId: text(item.endNodeId, 40),
        beamSize: text(item.beamSize || "2x2", 24),
        category: text(item.category || "internal", 24),
      };
    })
    .filter(Boolean);

  const posts = (Array.isArray(source.posts) ? source.posts : []).slice(0, 800).map((post) => {
    const item = post && typeof post === "object" ? post : {};
    return {
      id: text(item.id, 40),
      key: text(item.key, 80),
      source: text(item.source, 24),
      nodeId: text(item.nodeId, 40),
      edgeId: text(item.edgeId, 40),
      x: num(item.x, 0, -100000, 100000),
      y: num(item.y, 0, -100000, 100000),
      size: text(item.size || "2x2", 24),
      heightIn: item.heightIn == null ? null : num(item.heightIn, 0, 0, 1000),
    };
  });

  const roofTypes = ["mansard", "gable", "shed", "custom"];
  const shapes = ["rectangle", "l", "custom"];
  const roofType = roofTypes.includes(source.roofType) ? source.roofType : existing?.roofType || "mansard";
  const shape = shapes.includes(source.shape) ? source.shape : existing?.shape || "rectangle";
  const versionsIn = Array.isArray(source.versioning?.versions) ? source.versioning.versions : [];
  const versions = (versionsIn.length ? versionsIn : [{ id: "v1", label: "Version 1", createdAt: existing?.createdAt || now }])
    .slice(0, 20)
    .map((version, index) => ({
      id: text(version && version.id, 40) || `v${index + 1}`,
      label: text((version && version.label) || `Version ${index + 1}`, 80),
      createdAt: text(version && version.createdAt, 40) || now,
    }));

  const recordOwner = String(existing?.userId || existing?.createdBy || username || "")
    .trim()
    .toLowerCase();

  return {
    ok: true,
    project: {
      schemaVersion: 1,
      id: existing?.id || newId(),
      userId: recordOwner,
      name: text(source.name || existing?.name || "Pool cage", 160),
      customerName: text(source.customerName, 160),
      notes: text(source.notes, 4000),
      cageHeightIn: num(source.cageHeightIn, 120, 24, 480),
      shape,
      autoUpdate: source.autoUpdate !== false,
      maxPanelWidthIn: num(source.maxPanelWidthIn, 96, 12, 360),
      roofType,
      showBeamLabels: source.showBeamLabels !== false,
      showGrid: source.showGrid !== false,
      wallPostSize: text(source.wallPostSize || "2x2", 24),
      snap: {
        enabled: source.snap?.enabled !== false,
        grid: source.snap?.grid !== false,
        nodes: source.snap?.nodes !== false,
        midpoints: source.snap?.midpoints !== false,
        ortho: source.snap?.ortho !== false,
        gridSizeIn: [1, 6, 12].includes(Number(source.snap?.gridSizeIn)) ? Number(source.snap.gridSizeIn) : 6,
        toleranceIn: num(source.snap?.toleranceIn, 6, 1, 48),
      },
      nodes,
      edges,
      walls,
      posts,
      suppressedPostKeys: (Array.isArray(source.suppressedPostKeys) ? source.suppressedPostKeys : [])
        .slice(0, 800)
        .map((key) => text(key, 80))
        .filter(Boolean),
      roofNodes,
      roofBeams,
      roofManual: Boolean(source.roofManual),
      versioning: {
        currentVersionId: text(source.versioning?.currentVersionId || versions[0].id, 40),
        versions,
      },
      seq: num(source.seq, existing?.seq || 1, 0, 1000000),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      createdBy: existing?.createdBy || recordOwner || username || "admin",
      updatedBy: username || existing?.updatedBy || recordOwner || "admin",
    },
  };
}

export function normalizeProjectInput(body, context) {
  return normalizeProject(body, context);
}

function summary(project) {
  return {
    id: project.id,
    name: project.name,
    customerName: project.customerName,
    roofType: project.roofType,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    createdBy: project.createdBy,
    updatedBy: project.updatedBy,
    userId: project.userId || project.createdBy,
  };
}

async function readLocalAll() {
  try {
    const raw = await fs.readFile(LOCAL_FILE, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data?.projects) ? data.projects : [];
  } catch {
    return [];
  }
}

async function writeLocalAll(projects) {
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(LOCAL_FILE, JSON.stringify({ projects, updatedAt: new Date().toISOString() }, null, 2), "utf8");
}

async function readBlobJson(pathnameOrUrl) {
  const got = await get(pathnameOrUrl, {
    access: "private",
    useCache: false,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  if (!got || got.statusCode !== 200 || !got.stream) return null;
  const textBody = await new Response(got.stream).text();
  return JSON.parse(textBody);
}

async function listBlobProjects() {
  const result = await list({
    prefix: PREFIX,
    limit: 1000,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  const projects = [];
  for (const blob of result.blobs || []) {
    try {
      const data = await readBlobJson(blob.pathname);
      if (data && data.id) projects.push(data);
    } catch {
      /* skip unreadable blob */
    }
  }
  return projects;
}

export async function listProjects(username) {
  const projects = hasBlob() ? await listBlobProjects() : await readLocalAll();
  projects.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  if (!username) return [];
  return projects.filter((project) => projectBelongsTo(project, username));
}

export async function getProject(id) {
  if (!id) return null;
  if (hasBlob()) {
    try {
      const data = await readBlobJson(`${PREFIX}${id}.json`);
      if (data && data.id === id) return data;
    } catch {
      /* fall through */
    }
    const projects = await listBlobProjects();
    return projects.find((project) => project.id === id) || null;
  }
  const projects = await readLocalAll();
  return projects.find((project) => project.id === id) || null;
}

export async function saveProject(project) {
  if (hasBlob()) {
    await put(`${PREFIX}${project.id}.json`, JSON.stringify(project, null, 2), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return project;
  }
  const projects = await readLocalAll();
  const index = projects.findIndex((item) => item.id === project.id);
  if (index >= 0) projects[index] = project;
  else projects.unshift(project);
  await writeLocalAll(projects);
  return project;
}

export async function deleteProject(id) {
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
  const projects = await readLocalAll();
  const next = projects.filter((project) => project.id !== id);
  if (next.length === projects.length) return false;
  await writeLocalAll(next);
  return true;
}

export function duplicateProject(project, username) {
  const now = new Date().toISOString();
  const copy = structuredClone(project);
  copy.id = newId();
  copy.name = text(`${project.name || "Pool cage"} copy`, 160);
  copy.createdAt = now;
  copy.updatedAt = now;
  copy.createdBy = username;
  copy.updatedBy = username;
  copy.userId = String(username || "").trim().toLowerCase();
  copy.versioning = copy.versioning || { currentVersionId: "v1", versions: [] };
  return copy;
}

export function toSummary(project) {
  return summary(project);
}

export function storageMode() {
  return hasBlob() ? "blob" : "local-file";
}
