/**
 * Roof drawings are a standard column and row grid on the footprint
 * derived from the screened walls. Each corner bay gets a corner jack.
 * Any other diagonal is added by hand.
 * Sizes are labels, not engineering.
 */

import { roundInches } from "./units.js?v=19";
import { applyDerivedWalls, cloneProject, screenBounds } from "./model.js?v=19";
import { deriveCageGeometry, footprintContains, footprintStatus, roofStructure } from "./roof-topology.js?v=21";

/** Inches. A node dropped this close to another node becomes that node. */
export const MERGE_EPSILON = 3;

function syncWalls(project) {
  const derived = deriveCageGeometry(project);
  if (!derived.walls.length) return project;
  return applyDerivedWalls(project, derived.walls);
}

function nextId(project, prefix) {
  project.seq = (project.seq || 0) + 1;
  return prefix + project.seq;
}

function addNode(project, x, y) {
  const found = project.roofNodes.find((node) => Math.hypot(node.x - x, node.y - y) < 0.4);
  if (found) return found.id;
  const id = nextId(project, "rn");
  project.roofNodes.push({ id, x: roundInches(x), y: roundInches(y) });
  return id;
}

function addBeam(project, x1, y1, x2, y2, category, beamSize) {
  if (Math.hypot(x2 - x1, y2 - y1) < 1) return;
  const startNodeId = addNode(project, x1, y1);
  const endNodeId = addNode(project, x2, y2);
  if (startNodeId === endNodeId) return;
  const duplicate = project.roofBeams.some(
    (beam) =>
      (beam.startNodeId === startNodeId && beam.endNodeId === endNodeId) ||
      (beam.startNodeId === endNodeId && beam.endNodeId === startNodeId)
  );
  if (duplicate) return;
  project.roofBeams.push({
    id: nextId(project, "rb"),
    startNodeId,
    endNodeId,
    beamSize: beamSize || "2x2",
    category: category || "internal",
  });
}

function cumulatives(parts, key) {
  const stops = [0];
  parts.forEach((part) => stops.push(stops[stops.length - 1] + (Number(part[key]) || 0)));
  return stops;
}

function generateGrid(project, x0, y0, length, depth) {
  const center = project.roof.defaultBeam || "2x2";
  const perimeter = project.roof.perimeterBeam || "2x4";
  const xStops = cumulatives(project.roof.columns || [], "widthIn");
  const yStops = cumulatives(project.roof.rows || [], "depthIn");
  for (let row = 0; row < yStops.length - 1; row += 1) {
    for (let column = 0; column < xStops.length - 1; column += 1) {
      const x1 = x0 + xStops[column];
      const x2 = x0 + xStops[column + 1];
      const y1 = y0 + yStops[row];
      const y2 = y0 + yStops[row + 1];
      if (row === 0) addBeam(project, x1, y1, x2, y1, "perimeter", perimeter);
      if (column === xStops.length - 2) addBeam(project, x2, y1, x2, y2, "perimeter", perimeter);
      if (row === yStops.length - 2) addBeam(project, x2, y2, x1, y2, "perimeter", perimeter);
      if (column === 0) addBeam(project, x1, y2, x1, y1, "perimeter", perimeter);
      if (column > 0) addBeam(project, x1, y1, x1, y2, "internal", center);
      if (row > 0) addBeam(project, x1, y1, x2, y1, "internal", center);
    }
  }
  if (xStops.length >= 3 && yStops.length >= 3) {
    const xFar = x0 + xStops[xStops.length - 1];
    const yFar = y0 + yStops[yStops.length - 1];
    const insetLeft = xStops[1] - xStops[0];
    const insetRight = xStops[xStops.length - 1] - xStops[xStops.length - 2];
    const insetBottom = yStops[1] - yStops[0];
    const insetTop = yStops[yStops.length - 1] - yStops[yStops.length - 2];
    const jack = center;
    addBeam(project, x0, y0, x0 + insetLeft, y0 + insetBottom, "jack", jack);
    addBeam(project, xFar, y0, xFar - insetRight, y0 + insetBottom, "jack", jack);
    addBeam(project, x0, yFar, x0 + insetLeft, yFar - insetTop, "jack", jack);
    addBeam(project, xFar, yFar, xFar - insetRight, yFar - insetTop, "jack", jack);
  }
}

export function generateRoof(project) {
  const next = cloneProject(project);
  next.roofNodes = [];
  next.roofBeams = [];
  next.roof.manual = false;
  next.roof.type = "grid";
  const bounds = screenBounds(next);
  if (bounds.width < 12 || bounds.depth < 12) return next;
  generateGrid(next, bounds.minX, bounds.minY, bounds.width, bounds.depth);
  return syncWalls(next);
}

export function roofPanelCount(project) {
  const columns = (project.roof && project.roof.columns) || [];
  const rows = (project.roof && project.roof.rows) || [];
  if (!columns.length || !rows.length) return 0;
  return columns.length * rows.length;
}

function roofNode(project, id) {
  return (project.roofNodes || []).find((node) => node.id === id) || null;
}

function axisStops(project, bounds, vertical) {
  const stops = new Set([roundInches(vertical ? bounds.minX : bounds.minY), roundInches(vertical ? bounds.maxX : bounds.maxY)]);
  (project.roofBeams || []).forEach((beam) => {
    if (beam.category === "perimeter") return;
    const a = roofNode(project, beam.startNodeId);
    const b = roofNode(project, beam.endNodeId);
    if (!a || !b) return;
    const sameX = Math.abs(a.x - b.x) < 1.5;
    const sameY = Math.abs(a.y - b.y) < 1.5;
    if (vertical && sameX && Math.abs(a.y - b.y) > 6) stops.add(roundInches(a.x));
    if (!vertical && sameY && Math.abs(a.x - b.x) > 6) stops.add(roundInches(a.y));
  });
  return Array.from(stops).sort((a, b) => a - b);
}

function writeSpans(project, stops, key, prefix) {
  const widths = [];
  for (let i = 0; i < stops.length - 1; i += 1) widths.push(Math.max(1, roundInches(stops[i + 1] - stops[i])));
  const current = key === "widthIn" ? project.roof.columns : project.roof.rows;
  if (current && current.length === widths.length) {
    widths.forEach((width, index) => {
      current[index][key] = width;
    });
    return;
  }
  const made = widths.map((width) => {
    const item = { id: nextId(project, prefix) };
    item[key] = width;
    return item;
  });
  if (key === "widthIn") project.roof.columns = made;
  else project.roof.rows = made;
}

/** Slide one grid line and keep the column or row widths in step with it. */
export function moveDivider(project, beamId, x, y) {
  const beam = (project.roofBeams || []).find((item) => item.id === beamId);
  if (!beam || beam.category === "perimeter") return { ok: false, grid: false, project };
  const a = roofNode(project, beam.startNodeId);
  const b = roofNode(project, beam.endNodeId);
  if (!a || !b) return { ok: false, grid: false, project };
  const vertical = Math.abs(a.x - b.x) < 1.5 && Math.abs(a.y - b.y) > 6;
  const horizontal = Math.abs(a.y - b.y) < 1.5 && Math.abs(a.x - b.x) > 6;
  if (!vertical && !horizontal) return { ok: false, grid: false, project };
  const next = cloneProject(project);
  const bounds = screenBounds(next);
  const origin = vertical ? a.x : a.y;
  const stops = axisStops(next, bounds, vertical).filter((stop) => Math.abs(stop - origin) > 1);
  const low = Math.max(vertical ? bounds.minX : bounds.minY, ...stops.filter((stop) => stop < origin));
  const highValues = stops.filter((stop) => stop > origin);
  const high = highValues.length ? Math.min(...highValues) : vertical ? bounds.maxX : bounds.maxY;
  const nextPos = roundInches(Math.min(high - 6, Math.max(low + 6, vertical ? x : y)));
  next.roofNodes.forEach((node) => {
    if (vertical && Math.abs(node.x - origin) < 1.2) node.x = nextPos;
    if (horizontal && Math.abs(node.y - origin) < 1.2) node.y = nextPos;
  });
  if (vertical) writeSpans(next, axisStops(next, bounds, true), "widthIn", "c");
  else writeSpans(next, axisStops(next, bounds, false), "depthIn", "r");
  next.roof.manual = true;
  next.roof.type = "grid";
  return { ok: true, grid: true, project: syncWalls(next) };
}

export function addRoofBeam(project, x1, y1, x2, y2) {
  const next = cloneProject(project);
  const before = next.roofBeams.length;
  addBeam(next, x1, y1, x2, y2, "internal", next.roof.defaultBeam || "2x2");
  if (next.roofBeams.length === before) return { ok: false, error: "That beam is too short or already exists.", project };
  next.roof.manual = true;
  return { ok: true, project: syncWalls(next), beamId: next.roofBeams[next.roofBeams.length - 1].id };
}

export function deleteRoofBeam(project, beamId) {
  const next = cloneProject(project);
  if (!next.roofBeams.some((beam) => beam.id === beamId)) return { ok: false, error: "Beam not found.", project };
  next.roofBeams = next.roofBeams.filter((beam) => beam.id !== beamId);
  const used = new Set();
  next.roofBeams.forEach((beam) => {
    used.add(beam.startNodeId);
    used.add(beam.endNodeId);
  });
  next.roofNodes = next.roofNodes.filter((node) => used.has(node.id));
  next.roof.manual = true;
  return { ok: true, project: syncWalls(next) };
}

export function updateRoofBeam(project, beamId, patch) {
  const next = cloneProject(project);
  const beam = next.roofBeams.find((item) => item.id === beamId);
  if (!beam) return { ok: false, error: "Beam not found.", project };
  if (patch.beamSize) beam.beamSize = String(patch.beamSize).slice(0, 24);
  if (patch.category) beam.category = String(patch.category).slice(0, 24);
  next.roof.manual = true;
  return { ok: true, project: next };
}

export function moveRoofBeam(project, beamId, dx, dy) {
  const next = cloneProject(project);
  const beam = next.roofBeams.find((item) => item.id === beamId);
  if (!beam) return { ok: false, error: "Beam not found.", project };
  [beam.startNodeId, beam.endNodeId].forEach((nodeId) => {
    const node = roofNode(next, nodeId);
    if (!node) return;
    node.x = roundInches(node.x + dx);
    node.y = roundInches(node.y + dy);
  });
  next.roof.manual = true;
  return { ok: true, project: syncWalls(next) };
}

export function moveRoofNode(project, nodeId, x, y) {
  const next = cloneProject(project);
  const node = roofNode(next, nodeId);
  if (!node) return { ok: false, error: "Intersection not found.", project };
  node.x = roundInches(x);
  node.y = roundInches(y);
  next.roof.manual = true;
  return { ok: true, project: syncWalls(next) };
}

function beamKey(a, b) {
  return a < b ? a + "|" + b : b + "|" + a;
}

function aligned(a, b) {
  return Math.abs(a.x - b.x) < 1.5 || Math.abs(a.y - b.y) < 1.5;
}

function dedupeBeams(project) {
  const byKey = new Map();
  (project.roofBeams || []).forEach((beam) => {
    const a = roofNode(project, beam.startNodeId);
    const b = roofNode(project, beam.endNodeId);
    if (!a || !b || beam.startNodeId === beam.endNodeId) return;
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1) return;
    const key = beamKey(beam.startNodeId, beam.endNodeId);
    const existing = byKey.get(key);
    if (!existing || (existing.category === "jack" && beam.category !== "jack")) byKey.set(key, beam);
  });
  project.roofBeams = Array.from(byKey.values());
}

function dropOrphanNodes(project) {
  const used = new Set();
  (project.roofBeams || []).forEach((beam) => {
    used.add(beam.startNodeId);
    used.add(beam.endNodeId);
  });
  project.roofNodes = (project.roofNodes || []).filter((node) => used.has(node.id));
}

function pruneLooseBeams(project) {
  const structure = roofStructure(project);
  const keys = new Set(structure.edges.map((edge) => beamKey(edge.aId, edge.bId)));
  project.roofBeams = (project.roofBeams || []).filter((beam) => {
    if (keys.has(beamKey(beam.startNodeId, beam.endNodeId))) return true;
    if (beam.category !== "jack") return false;
    const a = roofNode(project, beam.startNodeId);
    const b = roofNode(project, beam.endNodeId);
    if (!a || !b || aligned(a, b) || Math.hypot(a.x - b.x, a.y - b.y) < 1) return false;
    for (let step = 1; step <= 4; step += 1) {
      const t = step / 5;
      if (!footprintContains(project, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false;
    }
    return true;
  });
  dropOrphanNodes(project);
}

/**
 * Pointer-up for a footprint node.
 * Landing on another node merges them into one vertex and drops the collapsed bay.
 * The outline has to stay one closed loop. A crossing move is put back.
 */
export function finishRoofNodeMove(before, after, nodeId) {
  if (!before || !after) return { ok: false, project: before };
  const next = cloneProject(after);
  const moved = roofNode(next, nodeId);
  if (!moved) return { ok: false, project: before };
  let survivor = nodeId;
  let merged = false;
  const candidates = next.roofNodes
    .filter((node) => node.id !== nodeId && Math.hypot(node.x - moved.x, node.y - moved.y) < MERGE_EPSILON)
    .sort((a, b) => Math.hypot(a.x - moved.x, a.y - moved.y) - Math.hypot(b.x - moved.x, b.y - moved.y));
  const target = candidates[0];
  if (target) {
    const doomed = new Set();
    (next.roofBeams || []).forEach((beam) => {
      if (beam.startNodeId !== nodeId && beam.endNodeId !== nodeId) return;
      const otherId = beam.startNodeId === nodeId ? beam.endNodeId : beam.startNodeId;
      if (otherId === target.id) {
        doomed.add(beam.id);
        return;
      }
      const oldA = roofNode(before, beam.startNodeId);
      const oldB = roofNode(before, beam.endNodeId);
      const other = roofNode(next, otherId);
      if (!oldA || !oldB || !other) {
        doomed.add(beam.id);
        return;
      }
      if (beam.category === "jack") {
        if (aligned(target, other)) doomed.add(beam.id);
        return;
      }
      if (aligned(oldA, oldB) && !aligned(target, other)) doomed.add(beam.id);
    });
    next.roofBeams = next.roofBeams.filter((beam) => !doomed.has(beam.id));
    next.roofBeams.forEach((beam) => {
      if (beam.startNodeId === nodeId) beam.startNodeId = target.id;
      if (beam.endNodeId === nodeId) beam.endNodeId = target.id;
    });
    next.roofNodes = next.roofNodes.filter((node) => node.id !== nodeId);
    survivor = target.id;
    merged = true;
  }
  dedupeBeams(next);
  pruneLooseBeams(next);
  const status = footprintStatus(next);
  if (!status.ok) return { ok: false, rejected: true, project: before, reason: status.reason };
  next.roof.manual = true;
  return { ok: true, merged, nodeId: survivor, project: syncWalls(next) };
}

export function deleteRoofNode(project, nodeId) {
  const next = cloneProject(project);
  if (!roofNode(next, nodeId)) return { ok: false, error: "Intersection not found.", project };
  next.roofBeams = next.roofBeams.filter((beam) => beam.startNodeId !== nodeId && beam.endNodeId !== nodeId);
  next.roofNodes = next.roofNodes.filter((node) => node.id !== nodeId);
  next.roof.manual = true;
  return { ok: true, project: syncWalls(next) };
}

export function splitRoofBeam(project, beamId) {
  const next = cloneProject(project);
  const beam = next.roofBeams.find((item) => item.id === beamId);
  if (!beam) return { ok: false, error: "Beam not found.", project };
  const a = roofNode(next, beam.startNodeId);
  const b = roofNode(next, beam.endNodeId);
  const id = nextId(next, "rn");
  next.roofNodes.push({ id, x: roundInches((a.x + b.x) / 2), y: roundInches((a.y + b.y) / 2) });
  const first = Object.assign({}, beam, { id: nextId(next, "rb"), endNodeId: id });
  const second = Object.assign({}, beam, { id: nextId(next, "rb"), startNodeId: id });
  const index = next.roofBeams.findIndex((item) => item.id === beamId);
  next.roofBeams.splice(index, 1, first, second);
  next.roof.manual = true;
  return { ok: true, project: syncWalls(next), nodeId: id };
}

export function roofBeamLength(project, beam) {
  const a = roofNode(project, beam.startNodeId);
  const b = roofNode(project, beam.endNodeId);
  if (!a || !b) return 0;
  return Math.hypot(b.x - a.x, b.y - a.y);
}
