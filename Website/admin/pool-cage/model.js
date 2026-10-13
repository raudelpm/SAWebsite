/**
 * Pool cage layout model.
 *
 * The drawing is derived from wall sections and a roof grid.
 * Coordinates are inches. X increases east, Y increases north.
 * Beam and post sizes are estimator labels, not a structural design.
 */

import { roundInches } from "./units.js?v=11";

export const HEADER_SIZES = ["2x7", "2x8", "2x9"];
export const SUPPORT_POSTS = ["3x3", "4x4"];
export const BEAM_SIZES = ["1x2", "2x2", "2x3", "2x4", "2x5", "2x7", "2x8", "2x9"];
export const ROOF_TYPES = ["grid"];
const THREE_WALL_NAMES = ["LEFT WALL", "REAR WALL", "RIGHT WALL"];

export function createEmptyProject() {
  const now = new Date().toISOString();
  return {
    schemaVersion: 2,
    id: "",
    name: "",
    customerName: "",
    notes: "",
    cageHeightIn: 120,
    cornersManual: false,
    showGrid: true,
    showBeamLabels: true,
    snap: { enabled: true, gridSizeIn: 6 },
    walls: [],
    clearViewGroups: [],
    nodes: [],
    roof: {
      type: "grid",
      columns: [],
      rows: [],
      defaultBeam: "2x2",
      perimeterBeam: "2x4",
      manual: false,
    },
    roofNodes: [],
    roofBeams: [],
    doors: [],
    gutterPoints: [],
    versioning: {
      currentVersionId: "v1",
      versions: [{ id: "v1", label: "Version 1", createdAt: now }],
    },
    seq: 0,
  };
}

function nextId(project, prefix) {
  project.seq = (project.seq || 0) + 1;
  return prefix + project.seq;
}

export function cloneProject(project) {
  return structuredClone(project);
}

export function divideEvenly(totalIn, count) {
  const total = Math.max(0, Number(totalIn) || 0);
  const n = Math.max(1, Math.round(Number(count) || 1));
  const parts = [];
  let used = 0;
  for (let i = 0; i < n; i += 1) {
    if (i === n - 1) parts.push(roundInches(total - used));
    else {
      const part = roundInches(total / n);
      parts.push(part);
      used += part;
    }
  }
  return parts;
}

/** Two or more rows: the chair rail is always 3' off the floor. The height above it is split across the upper rows. */
export function chairRowHeights(heightIn, count) {
  const height = Math.max(1, roundInches(heightIn));
  const n = Math.max(1, Math.min(12, Math.round(Number(count) || 1)));
  if (n === 1) return [height];
  const chair = 36;
  if (height <= chair + n * 6) return divideEvenly(height, n);
  const upper = divideEvenly(height - chair, n - 1);
  return [chair].concat(upper);
}

export function wallById(project, wallId) {
  return (project.walls || []).find((wall) => wall.id === wallId) || null;
}

export function sectionSum(wall) {
  return (wall.verticalSections || []).reduce((sum, section) => sum + (Number(section.widthIn) || 0), 0);
}

export function rowSum(wall) {
  return (wall.horizontalRows || []).reduce((sum, row) => sum + (Number(row.heightIn) || 0), 0);
}

export function sectionGap(wall) {
  return roundInches(sectionSum(wall) - (Number(wall.lengthIn) || 0));
}

export function rowGap(wall) {
  const height = Number(wall.heightIn) || 0;
  return roundInches(rowSum(wall) - height);
}

function boundsOf(points) {
  const nodes = points && points.length ? points : [{ x: 0, y: 0 }];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  nodes.forEach((node) => {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x);
    maxY = Math.max(maxY, node.y);
  });
  return { minX, minY, maxX, maxY, width: maxX - minX, depth: maxY - minY };
}

/** Wall corners only. The roof grid stays on this rectangle. */
export function screenBounds(project) {
  return boundsOf(project.nodes);
}

export function planBounds(project) {
  return boundsOf(
    []
      .concat(project.nodes && project.nodes.length ? project.nodes : [{ x: 0, y: 0 }])
      .concat(project.gutterPoints || [])
  );
}

/**
 * Screened walls are chained from the left end of the house, turning 90°
 * at each corner. The extra point is the right end of the house/gutter side.
 * A 20/30/20 cage becomes a rectangle. The house edge is not a screened wall.
 */
export function attachedCorners(lengths) {
  const spans = (lengths || []).map((length) => Math.max(12, Number(length) || 12));
  let x = 0;
  let y = spans[0] || 12;
  let angle = -Math.PI / 2;
  const points = [];
  spans.forEach((length) => {
    points.push({ x: roundInches(x), y: roundInches(y) });
    x += length * Math.cos(angle);
    y += length * Math.sin(angle);
    angle += Math.PI / 2;
  });
  points.push({ x: roundInches(x), y: roundInches(y) });
  return points;
}

export function isAttachedPlan(project) {
  if (!project || project.attached === false) return false;
  const nodes = (project && project.nodes) || [];
  if (nodes.length < 2) return false;
  if (project.attached === true) return true;
  return nodes.length === (project.walls || []).length + 1;
}

export function wallNodes(project, index) {
  const nodes = project.nodes || [];
  const start = nodes[index];
  const end = isAttachedPlan(project) ? nodes[index + 1] : nodes[(index + 1) % nodes.length];
  return { a: start, b: end };
}

/** The roof outline for this wall, or the original measured side when the roof has not been generated. */
export function wallPath(project, wall) {
  if (wall && wall.path && wall.path.length >= 2) return wall.path;
  const index = (project.walls || []).indexOf(wall);
  if (index < 0) return [];
  const ends = wallNodes(project, index);
  if (!ends.a || !ends.b) return [];
  return [
    { x: ends.a.x, y: ends.a.y },
    { x: ends.b.x, y: ends.b.y },
  ];
}

export function pathLength(path) {
  let length = 0;
  for (let index = 1; index < (path || []).length; index += 1) {
    length += Math.hypot(path[index].x - path[index - 1].x, path[index].y - path[index - 1].y);
  }
  return length;
}

export function pointAlongPath(path, distance) {
  const points = path || [];
  if (!points.length) return { x: 0, y: 0 };
  if (points.length === 1 || distance <= 0) return { x: points[0].x, y: points[0].y };
  let left = distance;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const span = Math.hypot(end.x - start.x, end.y - start.y);
    if (left <= span || index === points.length - 1) {
      const t = span ? Math.max(0, Math.min(1, left / span)) : 0;
      return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
    }
    left -= span;
  }
  const last = points[points.length - 1];
  return { x: last.x, y: last.y };
}

export function offsetAlongPath(path, x, y) {
  let best = 0;
  let bestDistance = Infinity;
  let traveled = 0;
  for (let index = 1; index < (path || []).length; index += 1) {
    const start = path[index - 1];
    const end = path[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const span = dx * dx + dy * dy || 1;
    let t = ((x - start.x) * dx + (y - start.y) * dy) / span;
    t = Math.max(0, Math.min(1, t));
    const px = start.x + dx * t;
    const py = start.y + dy * t;
    const distance = Math.hypot(x - px, y - py);
    const along = traveled + Math.hypot(px - start.x, py - start.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = along;
    }
    traveled += Math.hypot(dx, dy);
  }
  return best;
}

/** House side from the left corner through any gutter breaks to the right corner. */
export function gutterPath(project) {
  if (!isAttachedPlan(project)) return null;
  const nodes = project.nodes || [];
  const start = nodes[0];
  const end = nodes[nodes.length - 1];
  if (!start || !end) return null;
  return [start].concat(project.gutterPoints || []).concat([end]);
}

/** Screened walls, then back along the gutter so a bend is part of the cage. */
export function cageRing(project) {
  const nodes = project.nodes || [];
  if (!isAttachedPlan(project)) return nodes.slice();
  return nodes.concat([...(project.gutterPoints || [])].reverse());
}

export function houseEdge(project) {
  const path = gutterPath(project);
  if (!path || path.length < 2) return null;
  let length = 0;
  for (let index = 1; index < path.length; index += 1) {
    length += Math.hypot(path[index].x - path[index - 1].x, path[index].y - path[index - 1].y);
  }
  return {
    name: "House / Gutter",
    a: path[0],
    b: path[path.length - 1],
    path,
    lengthIn: roundInches(length),
  };
}

export function addGutterBreak(project, segmentIndex, point) {
  const next = cloneProject(project);
  const path = gutterPath(next);
  if (!path) return { ok: false, error: "The gutter is the house side of the cage.", project };
  if (!Array.isArray(next.gutterPoints)) next.gutterPoints = [];
  const index = Math.max(0, Math.min(path.length - 2, Math.round(Number(segmentIndex) || 0)));
  const start = path[index];
  const end = path[index + 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const span = dx * dx + dy * dy || 1;
  let t = 0.5;
  if (point) {
    t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / span;
    t = Math.max(0.12, Math.min(0.88, t));
  }
  const created = {
    id: nextId(next, "g"),
    x: roundInches(start.x + dx * t),
    y: roundInches(start.y + dy * t),
  };
  next.gutterPoints.splice(index, 0, created);
  return { ok: true, project: next, pointId: created.id };
}

export function moveGutterPoint(project, pointId, x, y) {
  const next = cloneProject(project);
  const point = (next.gutterPoints || []).find((item) => item.id === pointId);
  if (!point) return { ok: false, project };
  point.x = roundInches(x);
  point.y = roundInches(y);
  return { ok: true, project: next };
}

export function deleteGutterPoint(project, pointId) {
  const next = cloneProject(project);
  next.gutterPoints = (next.gutterPoints || []).filter((point) => point.id !== pointId);
  return next;
}

export function sideWallWarning(project) {
  if (!project.walls || project.walls.length !== 3) return "";
  const left = Number(project.walls[0].lengthIn) || 0;
  const right = Number(project.walls[2].lengthIn) || 0;
  if (Math.abs(left - right) > 0.5) {
    return "Left and right wall measurements differ. Adjust the floor plan manually.";
  }
  return "";
}

export function roofFootprint(project) {
  const bounds = screenBounds(project);
  const house = houseEdge(project);
  const ring = cageRing(project);
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    area += p.x * q.y - q.x * p.y;
  }
  return {
    lengthIn: roundInches(bounds.width),
    depthIn: roundInches(bounds.depth),
    areaSqFt: Math.round((Math.abs(area) / 2 / 144) * 10) / 10,
    houseLengthIn: house ? house.lengthIn : roundInches(bounds.width),
    warning: sideWallWarning(project),
  };
}

export function rebuildCorners(project) {
  const points = attachedCorners(project.walls.map((wall) => wall.lengthIn));
  project.nodes = points.map((point) => ({ id: nextId(project, "n"), x: point.x, y: point.y }));
  project.cornersManual = false;
  nameWalls(project);
  return project;
}

function nameWalls(project) {
  if (project.walls.length === 3) {
    project.walls.forEach((wall, index) => {
      const generic = /^Wall \d+$/i.test(wall.name || "") || THREE_WALL_NAMES.includes(wall.name);
      if (generic) wall.name = THREE_WALL_NAMES[index];
    });
    return;
  }
  project.walls.forEach((wall, index) => {
    if (THREE_WALL_NAMES.includes(wall.name)) wall.name = "Wall " + (index + 1);
  });
}

function makeSections(project, widths) {
  return widths.map((width) => ({
    id: nextId(project, "s"),
    widthIn: width,
    clearViewGroupId: null,
  }));
}

function makeRows(project, heights) {
  return heights.map((height) => ({
    id: nextId(project, "hr"),
    heightIn: height,
  }));
}

function makeWall(project, index, spec, cageHeightIn) {
  const lengthIn = Math.max(12, roundInches(spec.lengthIn || 240));
  const heightIn = Math.max(24, roundInches(spec.heightIn || cageHeightIn || 120));
  const verticalCount = Math.max(1, Math.min(24, Math.round(spec.verticalCount || spec.verticalSections || 4)));
  const horizontalCount = Math.max(1, Math.min(12, Math.round(spec.horizontalCount || spec.horizontalRows || 1)));
  return {
    id: nextId(project, "w"),
    name: spec.name || "Wall " + (index + 1),
    lengthIn,
    heightIn,
    verticalSections: makeSections(project, divideEvenly(lengthIn, verticalCount)),
    horizontalRows: makeRows(project, chairRowHeights(heightIn, horizontalCount)),
  };
}

function roofSpan(project) {
  const bounds = screenBounds(project);
  return {
    length: Math.max(12, roundInches(bounds.width)),
    depth: Math.max(12, roundInches(bounds.depth)),
  };
}

export function setRoofColumns(project, count) {
  const next = cloneProject(project);
  const span = roofSpan(next).length;
  const n = Math.max(1, Math.min(24, Math.round(count || 1)));
  next.roof.columns = divideEvenly(span, n).map((width) => ({
    id: nextId(next, "c"),
    widthIn: width,
  }));
  return next;
}

export function setRoofRows(project, count) {
  const next = cloneProject(project);
  const span = roofSpan(next).depth;
  const n = Math.max(1, Math.min(24, Math.round(count || 1)));
  next.roof.rows = divideEvenly(span, n).map((depth) => ({
    id: nextId(next, "r"),
    depthIn: depth,
  }));
  return next;
}

export function createProject(input) {
  const source = input || {};
  const project = createEmptyProject();
  project.name = String(source.name || "Pool cage").slice(0, 160);
  project.customerName = String(source.customerName || "").slice(0, 160);
  project.notes = String(source.notes || "").slice(0, 4000);
  project.cageHeightIn = Math.max(24, roundInches(source.cageHeightIn || 120));
  const specs = Array.isArray(source.walls) && source.walls.length ? source.walls : defaultWallSpecs(source.wallCount || 3);
  specs.forEach((spec, index) => {
    project.walls.push(makeWall(project, index, spec, project.cageHeightIn));
  });
  rebuildCorners(project);
  project.roof.type = "grid";
  project.roof.defaultBeam = source.defaultBeam || "2x2";
  project.roof.perimeterBeam = source.perimeterBeam || "2x4";
  const withColumns = setRoofColumns(project, source.columns || 5);
  return setRoofRows(withColumns, source.rows || 4);
}

function defaultWallSpecs(count) {
  const n = Math.max(2, Math.min(16, Math.round(count || 3)));
  if (n === 3) {
    return [
      { name: "LEFT WALL", lengthIn: 240, verticalCount: 4, horizontalCount: 2 },
      { name: "REAR WALL", lengthIn: 360, verticalCount: 5, horizontalCount: 2 },
      { name: "RIGHT WALL", lengthIn: 240, verticalCount: 4, horizontalCount: 2 },
    ];
  }
  const specs = [];
  for (let i = 0; i < n; i += 1) {
    specs.push({ name: "Wall " + (i + 1), lengthIn: 240, verticalCount: 4, horizontalCount: 2 });
  }
  return specs;
}

export function insertColumnDivider(project) {
  const next = cloneProject(project);
  const columns = next.roof.columns || [];
  if (!columns.length) return next;
  let index = 0;
  columns.forEach((column, item) => {
    if (column.widthIn > columns[index].widthIn) index = item;
  });
  const width = columns[index].widthIn;
  const left = Math.max(1, roundInches(width / 2));
  columns.splice(
    index,
    1,
    { id: nextId(next, "c"), widthIn: left },
    { id: nextId(next, "c"), widthIn: Math.max(1, roundInches(width - left)) }
  );
  return next;
}

export function insertRowDivider(project) {
  const next = cloneProject(project);
  const rows = next.roof.rows || [];
  if (!rows.length) return next;
  let index = 0;
  rows.forEach((row, item) => {
    if (row.depthIn > rows[index].depthIn) index = item;
  });
  const depth = rows[index].depthIn;
  const near = Math.max(1, roundInches(depth / 2));
  rows.splice(
    index,
    1,
    { id: nextId(next, "r"), depthIn: near },
    { id: nextId(next, "r"), depthIn: Math.max(1, roundInches(depth - near)) }
  );
  return next;
}

export function setVerticalCount(project, wallId, count) {
  const next = cloneProject(project);
  const wall = wallById(next, wallId);
  if (!wall) return next;
  const n = Math.max(1, Math.min(24, Math.round(count || 1)));
  wall.verticalSections = makeSections(next, divideEvenly(wall.lengthIn, n));
  next.clearViewGroups = (next.clearViewGroups || []).filter((group) => group.wallId !== wall.id);
  return next;
}

export function setHorizontalCount(project, wallId, count) {
  const next = cloneProject(project);
  const wall = wallById(next, wallId);
  if (!wall) return next;
  const n = Math.max(1, Math.min(12, Math.round(count || 1)));
  const height = wall.heightIn || next.cageHeightIn;
  wall.heightIn = height;
  wall.horizontalRows = makeRows(next, chairRowHeights(height, n));
  return next;
}

export function setWallLength(project, wallId, lengthIn) {
  const next = cloneProject(project);
  const wall = wallById(next, wallId);
  if (!wall) return next;
  const length = Math.max(12, roundInches(lengthIn));
  const old = sectionSum(wall) || wall.lengthIn || 1;
  const scale = length / old;
  wall.lengthIn = length;
  let used = 0;
  wall.verticalSections.forEach((section, index) => {
    if (index === wall.verticalSections.length - 1) section.widthIn = roundInches(length - used);
    else {
      section.widthIn = Math.max(1, roundInches(section.widthIn * scale));
      used += section.widthIn;
    }
  });
  (next.doors || []).forEach((door) => {
    if (door.wallId !== wall.id) return;
    const width = door.widthIn || 36;
    door.offsetIn = roundInches(Math.max(0, Math.min(Math.max(0, length - width), door.offsetIn * scale)));
  });
  rebuildCorners(next);
  return next;
}

export function addDoor(project, wallId) {
  const next = cloneProject(project);
  const wall = wallById(next, wallId);
  if (!wall) return { ok: false, error: "Pick a wall for the door.", project };
  if (!Array.isArray(next.doors)) next.doors = [];
  const width = 36;
  const length = wall.lengthIn || sectionSum(wall);
  if (length < width + 6) return { ok: false, error: "That wall is too short for a door.", project };
  let offset = Math.max(0, roundInches((length - width) / 2));
  const taken = next.doors.filter((door) => door.wallId === wall.id);
  while (taken.some((door) => Math.abs(door.offsetIn - offset) < width) && offset + width * 2 <= length) {
    offset = roundInches(offset + width + 6);
  }
  offset = Math.max(0, Math.min(length - width, offset));
  const door = { id: nextId(next, "d"), wallId: wall.id, offsetIn: offset, widthIn: width };
  next.doors.push(door);
  return { ok: true, project: next, doorId: door.id };
}

export function moveDoor(project, doorId, offsetIn) {
  const next = cloneProject(project);
  const door = (next.doors || []).find((item) => item.id === doorId);
  if (!door) return { ok: false, project };
  const wall = wallById(next, door.wallId);
  const length = wall ? wall.lengthIn || sectionSum(wall) : 0;
  const width = door.widthIn || 36;
  door.offsetIn = roundInches(Math.max(0, Math.min(Math.max(0, length - width), Number(offsetIn) || 0)));
  return { ok: true, project: next };
}

/**
 * Frame posts for a door. A side that already lands on a wall post
 * (the corner, when the door is against that end) is not doubled.
 * A door in the middle gets a post on each side.
 */
export function doorJambs(lengthIn, doors, posts) {
  const length = Number(lengthIn) || 0;
  const list = Array.isArray(doors) ? doors : doors ? [doors] : [];
  const jambs = [];
  const covered = (at) => (posts || []).concat(jambs).some((post) => Math.abs(post.at - at) < 3);
  list.forEach((door) => {
    const width = door.widthIn || 36;
    const left = Number(door.offsetIn) || 0;
    const right = left + width;
    if (left >= -0.5 && !covered(left)) jambs.push({ at: roundInches(left), size: "2x2", role: "jamb" });
    if (right <= length + 0.5 && !covered(right)) jambs.push({ at: roundInches(right), size: "2x2", role: "jamb" });
  });
  return jambs;
}

export function setDoorWidth(project, doorId, widthIn) {
  const next = cloneProject(project);
  const door = (next.doors || []).find((item) => item.id === doorId);
  if (!door) return { ok: false, project };
  const wall = wallById(next, door.wallId);
  const length = wall ? wall.lengthIn || sectionSum(wall) : widthIn;
  door.widthIn = roundInches(Math.max(24, Math.min(length, Number(widthIn) || 36)));
  door.offsetIn = roundInches(Math.max(0, Math.min(length - door.widthIn, door.offsetIn)));
  return { ok: true, project: next };
}

export function deleteDoor(project, doorId) {
  const next = cloneProject(project);
  next.doors = (next.doors || []).filter((door) => door.id !== doorId);
  return next;
}

export function setSectionWidth(project, wallId, sectionId, widthIn) {
  const next = cloneProject(project);
  const wall = wallById(next, wallId);
  if (!wall) return next;
  const section = wall.verticalSections.find((item) => item.id === sectionId);
  if (!section) return next;
  section.widthIn = Math.max(1, roundInches(widthIn));
  return next;
}

export function setRowHeight(project, wallId, rowId, heightIn) {
  const next = cloneProject(project);
  const wall = wallById(next, wallId);
  if (!wall) return next;
  const row = wall.horizontalRows.find((item) => item.id === rowId);
  if (!row) return next;
  row.heightIn = Math.max(1, roundInches(heightIn));
  return next;
}

export function sectionsAreConsecutive(wall, sectionIds) {
  const indexes = sectionIds
    .map((id) => wall.verticalSections.findIndex((section) => section.id === id))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);
  if (!indexes.length || indexes.length !== sectionIds.length) return false;
  for (let i = 1; i < indexes.length; i += 1) {
    if (indexes[i] !== indexes[i - 1] + 1) return false;
  }
  return true;
}

function sectionRuns(wall, ids) {
  const indexes = ids
    .map((id) => wall.verticalSections.findIndex((section) => section.id === id))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b);
  const runs = [];
  indexes.forEach((index) => {
    const last = runs[runs.length - 1];
    if (!last || index !== last[last.length - 1] + 1) runs.push([index]);
    else last.push(index);
  });
  return runs.map((run) => run.map((index) => wall.verticalSections[index].id));
}

function stampGroups(wall, groups) {
  const owner = new Map();
  groups.forEach((group) => {
    if (group.wallId !== wall.id) return;
    group.sectionIds.forEach((id) => owner.set(id, group.id));
  });
  wall.verticalSections.forEach((section) => {
    section.clearViewGroupId = owner.get(section.id) || null;
  });
}

export function setClearView(project, wallId, sectionIds, options) {
  const next = cloneProject(project);
  const wall = wallById(next, wallId);
  if (!wall) return { ok: false, error: "Wall not found.", project };
  const ids = sectionIds.filter((id) => wall.verticalSections.some((section) => section.id === id));
  if (!sectionsAreConsecutive(wall, ids)) {
    return { ok: false, error: "Select consecutive sections on the same wall.", project };
  }
  const settings = options || {};
  const claimed = new Set(ids);
  const kept = [];
  (next.clearViewGroups || []).forEach((group) => {
    if (group.wallId !== wall.id) {
      kept.push(group);
      return;
    }
    const remain = group.sectionIds.filter((id) => !claimed.has(id));
    sectionRuns(wall, remain).forEach((run) => {
      kept.push(Object.assign({}, group, { id: nextId(next, "cv"), sectionIds: run }));
    });
  });
  const group = {
    id: nextId(next, "cv"),
    wallId: wall.id,
    sectionIds: ids.slice(),
    headerBeamSize: String(settings.headerBeamSize || "2x8").slice(0, 24),
    leftPostSize: String(settings.leftPostSize || "4x4").slice(0, 24),
    rightPostSize: String(settings.rightPostSize || "4x4").slice(0, 24),
    removeIntermediatePosts: settings.removeIntermediatePosts !== false,
  };
  kept.push(group);
  next.clearViewGroups = kept;
  stampGroups(wall, kept);
  absorbAdjacentClearView(next, wall, group.id);
  return { ok: true, project: next, groupId: group.id };
}

/** Neighboring ClearView sections become one open span, so the posts between them drop out. */
function absorbAdjacentClearView(project, wall, groupId) {
  const group = (project.clearViewGroups || []).find((item) => item.id === groupId);
  if (!group) return;
  const indexOf = (id) => wall.verticalSections.findIndex((section) => section.id === id);
  const indexes = group.sectionIds.map(indexOf).filter((index) => index >= 0);
  let grew = true;
  while (grew) {
    grew = false;
    const min = Math.min.apply(null, indexes);
    const max = Math.max.apply(null, indexes);
    [min - 1, max + 1].forEach((index) => {
      const section = wall.verticalSections[index];
      if (!section || !section.clearViewGroupId || indexes.indexOf(index) >= 0) return;
      indexes.push(index);
      grew = true;
    });
  }
  indexes.sort((a, b) => a - b);
  const ownerAt = (index) => {
    const section = wall.verticalSections[index];
    if (!section) return null;
    return (project.clearViewGroups || []).find((item) => item.id === section.clearViewGroupId) || null;
  };
  const leftOwner = ownerAt(indexes[0]);
  const rightOwner = ownerAt(indexes[indexes.length - 1]);
  if (leftOwner) group.leftPostSize = leftOwner.leftPostSize;
  if (rightOwner) group.rightPostSize = rightOwner.rightPostSize;
  group.sectionIds = indexes.map((index) => wall.verticalSections[index].id);
  const taken = new Set(group.sectionIds);
  project.clearViewGroups = (project.clearViewGroups || [])
    .map((item) => {
      if (item.id === group.id || item.wallId !== wall.id) return item;
      return Object.assign({}, item, { sectionIds: item.sectionIds.filter((id) => !taken.has(id)) });
    })
    .filter((item) => item.sectionIds.length);
  stampGroups(wall, project.clearViewGroups);
}

export function clearClearView(project, wallId, sectionIds) {
  const next = cloneProject(project);
  const wall = wallById(next, wallId);
  if (!wall) return next;
  const drop = new Set(sectionIds);
  const kept = [];
  (next.clearViewGroups || []).forEach((group) => {
    if (group.wallId !== wall.id) {
      kept.push(group);
      return;
    }
    const remain = group.sectionIds.filter((id) => !drop.has(id));
    sectionRuns(wall, remain).forEach((run) => {
      kept.push(Object.assign({}, group, { id: nextId(next, "cv"), sectionIds: run }));
    });
  });
  next.clearViewGroups = kept;
  stampGroups(wall, kept);
  return next;
}

export function updateClearView(project, groupId, patch) {
  const next = cloneProject(project);
  const group = (next.clearViewGroups || []).find((item) => item.id === groupId);
  if (!group) return next;
  if (patch.headerBeamSize) group.headerBeamSize = String(patch.headerBeamSize).slice(0, 24);
  if (patch.leftPostSize) group.leftPostSize = String(patch.leftPostSize).slice(0, 24);
  if (patch.rightPostSize) group.rightPostSize = String(patch.rightPostSize).slice(0, 24);
  if (patch.removeIntermediatePosts != null) group.removeIntermediatePosts = Boolean(patch.removeIntermediatePosts);
  return next;
}

function scaleWallToLength(wall, length) {
  const old = sectionSum(wall) || 1;
  const scale = length / old;
  wall.lengthIn = roundInches(length);
  let used = 0;
  wall.verticalSections.forEach((section, index) => {
    if (index === wall.verticalSections.length - 1) section.widthIn = roundInches(wall.lengthIn - used);
    else {
      section.widthIn = Math.max(1, roundInches(section.widthIn * scale));
      used += section.widthIn;
    }
  });
}

export function moveCorner(project, nodeIndex, x, y) {
  const next = cloneProject(project);
  const node = next.nodes[nodeIndex];
  if (!node) return { ok: false, error: "Corner not found.", project };
  node.x = roundInches(x);
  node.y = roundInches(y);
  next.cornersManual = true;
  const indexes = [];
  if (isAttachedPlan(next)) {
    if (nodeIndex > 0) indexes.push(nodeIndex - 1);
    if (nodeIndex < next.walls.length) indexes.push(nodeIndex);
  } else {
    const count = next.nodes.length;
    [nodeIndex - 1, nodeIndex].forEach((index) => indexes.push((index + count) % count));
  }
  indexes.forEach((wallIndex) => {
    const wall = next.walls[wallIndex];
    const ends = wallNodes(next, wallIndex);
    if (!wall || !ends.a || !ends.b) return;
    scaleWallToLength(wall, Math.max(12, Math.hypot(ends.b.x - ends.a.x, ends.b.y - ends.a.y)));
  });
  return { ok: true, project: next };
}

export function groupForSection(project, section) {
  if (!section || !section.clearViewGroupId) return null;
  return (project.clearViewGroups || []).find((group) => group.id === section.clearViewGroupId) || null;
}

function lineOverlap(segment, poly) {
  if (!segment || segment.length < 2 || !poly || poly.length < 2) return 0;
  const start = poly[0];
  const end = poly[poly.length - 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const span = Math.hypot(dx, dy) || 1;
  const along = (point) => ((point.x - start.x) * dx + (point.y - start.y) * dy) / span;
  const off = (point) => Math.abs((point.x - start.x) * dy - (point.y - start.y) * dx) / span;
  if (off(segment[0]) > 10 || off(segment[1]) > 10) return 0;
  const low = Math.min(along(segment[0]), along(segment[1]));
  const high = Math.max(along(segment[0]), along(segment[1]));
  return Math.max(0, Math.min(high, span) - Math.max(low, 0));
}

function storedSegment(project, wall) {
  if (wall.path && wall.path.length >= 2) return [wall.path[0], wall.path[wall.path.length - 1]];
  const index = project.walls.indexOf(wall);
  const ends = wallNodes(project, index);
  if (!ends.a || !ends.b) return null;
  return [ends.a, ends.b];
}

/**
 * Replace the wall list with the roof perimeter.
 * A wall that still lies on the same line keeps its sections, ClearView, and doors.
 */
export function applyDerivedWalls(project, derived) {
  if (!derived || !derived.length) return project;
  const next = cloneProject(project);
  const wasAttached = isAttachedPlan(next);
  const previous = next.walls.slice();
  const pairs = [];
  derived.forEach((item, index) => {
    previous.forEach((wall) => {
      const exact = wall.signature && wall.signature === item.key;
      const score = exact ? 1000000 : lineOverlap(storedSegment(next, wall), item.points);
      if (score >= 12) pairs.push({ index, wall, score });
    });
  });
  pairs.sort((a, b) => b.score - a.score);
  const usedWalls = new Set();
  const assignment = new Map();
  pairs.forEach((pair) => {
    if (usedWalls.has(pair.wall.id) || assignment.has(pair.index)) return;
    usedWalls.add(pair.wall.id);
    assignment.set(pair.index, pair.wall);
  });
  const ordered = derived.map((item, index) => {
    const existing = assignment.get(index);
    if (existing) {
      if (Math.abs((existing.lengthIn || 0) - item.lengthIn) > 0.5) scaleWallToLength(existing, item.lengthIn);
      existing.lengthIn = roundInches(item.lengthIn);
      existing.path = item.points.map((point) => ({ x: point.x, y: point.y }));
      existing.signature = item.key;
      existing.direction = item.direction;
      if (/^(left wall|rear wall|right wall|wall \d+)$/i.test(existing.name || "")) existing.name = "Wall " + item.number;
      return existing;
    }
    const bays = Math.max(1, Math.min(24, Math.round(item.lengthIn / 72) || 1));
    const created = makeWall(
      next,
      item.number - 1,
      { name: "Wall " + item.number, lengthIn: item.lengthIn, verticalCount: bays, horizontalCount: 2 },
      next.cageHeightIn
    );
    created.path = item.points.map((point) => ({ x: point.x, y: point.y }));
    created.signature = item.key;
    created.direction = item.direction;
    return created;
  });
  const removed = new Set(previous.filter((wall) => !usedWalls.has(wall.id)).map((wall) => wall.id));
  next.walls = ordered;
  next.clearViewGroups = (next.clearViewGroups || []).filter((group) => !removed.has(group.wallId));
  next.doors = (next.doors || []).filter((door) => {
    if (removed.has(door.wallId)) return false;
    const wall = ordered.find((item) => item.id === door.wallId);
    if (!wall) return false;
    const width = door.widthIn || 36;
    const max = Math.max(0, wall.lengthIn - width);
    if (door.offsetIn > max) door.offsetIn = roundInches(max);
    return true;
  });
  if (wasAttached) next.attached = true;
  return next;
}

/** Elevation geometry for one wall. ClearView drops posts inside the opening. */
export function elevationModel(project, wallId) {
  const wall = wallById(project, wallId) || project.walls[0];
  if (!wall) return null;
  const height = wall.heightIn || project.cageHeightIn;
  let cursor = 0;
  const sections = wall.verticalSections.map((section, index) => {
    const group = groupForSection(project, section);
    const start = cursor;
    cursor += section.widthIn;
    return {
      id: section.id,
      index,
      start,
      end: cursor,
      widthIn: section.widthIn,
      group,
    };
  });
  const posts = [
    {
      at: 0,
      size: sections[0] && sections[0].group ? sections[0].group.leftPostSize || "4x4" : "2x2",
      role: sections[0] && sections[0].group ? "clearview" : "corner",
    },
  ];
  sections.forEach((section, index) => {
    const nextSection = sections[index + 1];
    const sameOpening =
      section.group &&
      nextSection &&
      nextSection.group &&
      section.group.removeIntermediatePosts !== false &&
      nextSection.group.removeIntermediatePosts !== false;
    if (sameOpening) return;
    let size = "2x2";
    let role = "bay";
    if (!nextSection) {
      size = section.group ? section.group.rightPostSize || "4x4" : "2x2";
      role = section.group ? "clearview" : "corner";
    } else if (section.group && (!nextSection.group || nextSection.group.id !== section.group.id)) {
      size = section.group.rightPostSize || "4x4";
      role = "clearview";
    } else if (nextSection.group && (!section.group || section.group.id !== nextSection.group.id)) {
      size = nextSection.group.leftPostSize || "4x4";
      role = "clearview";
    }
    posts.push({ at: section.end, size, role });
  });
  const rails = [];
  let y = 0;
  (wall.horizontalRows || []).forEach((row, index) => {
    y += row.heightIn;
    if (index < wall.horizontalRows.length - 1) rails.push(y);
  });
  const openings = [];
  sections.forEach((section) => {
    const last = openings[openings.length - 1];
    const sameOpening = section.group && last && last.group && last.group.id === section.group.id && section.group.removeIntermediatePosts !== false;
    if (sameOpening) {
      last.end = section.end;
      last.sections.push(section);
      return;
    }
    openings.push({
      type: section.group ? "clearview" : "standard",
      start: section.start,
      end: section.end,
      group: section.group,
      sections: [section],
    });
  });
  return { wall, height, length: cursor, sections, posts, rails, openings };
}

export function columnSum(project) {
  return (project.roof.columns || []).reduce((sum, column) => sum + (Number(column.widthIn) || 0), 0);
}

export function rowDepthSum(project) {
  return (project.roof.rows || []).reduce((sum, row) => sum + (Number(row.depthIn) || 0), 0);
}

export function setColumnWidth(project, columnId, widthIn) {
  const next = cloneProject(project);
  const column = (next.roof.columns || []).find((item) => item.id === columnId);
  if (!column) return next;
  column.widthIn = Math.max(1, roundInches(widthIn));
  return next;
}

export function setRowDepth(project, rowId, depthIn) {
  const next = cloneProject(project);
  const row = (next.roof.rows || []).find((item) => item.id === rowId);
  if (!row) return next;
  row.depthIn = Math.max(1, roundInches(depthIn));
  return next;
}

export function withRoofSettings(project, patch) {
  const next = cloneProject(project);
  next.roof.type = "grid";
  if (patch.defaultBeam) next.roof.defaultBeam = String(patch.defaultBeam).slice(0, 24);
  if (patch.perimeterBeam) next.roof.perimeterBeam = String(patch.perimeterBeam).slice(0, 24);
  if (patch.manual != null) next.roof.manual = Boolean(patch.manual);
  return next;
}

export function divideWallEvenly(project, wallId) {
  const next = cloneProject(project);
  const wall = wallById(next, wallId);
  if (!wall) return next;
  const widths = divideEvenly(wall.lengthIn, wall.verticalSections.length);
  wall.verticalSections.forEach((section, index) => {
    section.widthIn = widths[index];
  });
  return next;
}

export function divideRowsEvenly(project, wallId) {
  const next = cloneProject(project);
  const wall = wallById(next, wallId);
  if (!wall) return next;
  const heights = chairRowHeights(wall.heightIn || next.cageHeightIn, wall.horizontalRows.length);
  wall.horizontalRows.forEach((row, index) => {
    row.heightIn = heights[index];
  });
  return next;
}

export function setCageHeight(project, heightIn) {
  const next = cloneProject(project);
  const height = Math.max(24, roundInches(heightIn));
  const profile = next.roof && next.roof.profile;
  if (profile && typeof profile === "object") {
    const previous = Number(profile.wallHeightIn) || next.cageHeightIn || height;
    const rise = (Number(profile.topHeightIn) || previous) - previous;
    profile.wallHeightIn = height;
    profile.topHeightIn = height + Math.max(0, rise);
    if (profile.highHeightIn != null) profile.highHeightIn = height + Math.max(0, Number(profile.highHeightIn) - previous);
    if (profile.lowHeightIn != null) profile.lowHeightIn = height + Math.max(0, Number(profile.lowHeightIn) - previous);
  }
  next.cageHeightIn = height;
  next.walls.forEach((wall) => {
    const count = Math.max(1, wall.horizontalRows.length);
    wall.heightIn = height;
    const heights = chairRowHeights(height, count);
    if (wall.horizontalRows.length !== count) wall.horizontalRows = makeRows(next, heights);
    else wall.horizontalRows.forEach((row, index) => {
      row.heightIn = heights[index];
    });
  });
  return next;
}

export function setWallCount(project, count) {
  const next = cloneProject(project);
  const n = Math.max(2, Math.min(16, Math.round(Number(count) || next.walls.length || 3)));
  while (next.walls.length < n) {
    const index = next.walls.length;
    next.walls.push(
      makeWall(next, index, { name: "Wall " + (index + 1), lengthIn: 240, verticalCount: 4, horizontalCount: 2 }, next.cageHeightIn)
    );
  }
  if (next.walls.length > n) {
    const removed = new Set(next.walls.slice(n).map((wall) => wall.id));
    next.walls = next.walls.slice(0, n);
    next.clearViewGroups = (next.clearViewGroups || []).filter((group) => !removed.has(group.wallId));
    next.doors = (next.doors || []).filter((door) => !removed.has(door.wallId));
  }
  rebuildCorners(next);
  return next;
}

/** Old saved cages stored edges instead of sections. Keep them openable. */
export function migrateProject(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  if (source.walls && source.walls[0] && Array.isArray(source.walls[0].verticalSections)) {
    const project = Object.assign(createEmptyProject(), source);
    project.roof = Object.assign(createEmptyProject().roof, source.roof || {});
    project.roof.type = "grid";
    if (!project.roof.columns || !project.roof.columns.length) {
      const spanned = setRoofColumns(project, 4);
      return setRoofRows(spanned, 3);
    }
    return project;
  }
  const project = createEmptyProject();
  project.id = source.id || "";
  project.name = source.name || source.title || "Pool cage";
  project.customerName = source.customerName || "";
  project.notes = source.notes || "";
  project.cageHeightIn = source.cageHeightIn || 120;
  project.createdAt = source.createdAt;
  project.updatedAt = source.updatedAt;
  project.createdBy = source.createdBy;
  project.userId = source.userId;
  project.versioning = source.versioning || project.versioning;
  const oldWalls = Array.isArray(source.walls) ? source.walls : [];
  if (!oldWalls.length) return createProject({ name: project.name, cageHeightIn: project.cageHeightIn });
  oldWalls.forEach((wall, index) => {
    const edgeIds = wall.edgeIds || [];
    const edges = (source.edges || []).filter((edge) => edgeIds.includes(edge.id));
    let length = 0;
    const sections = [];
    edges.forEach((edge) => {
      const a = (source.nodes || []).find((node) => node.id === edge.startNodeId);
      const b = (source.nodes || []).find((node) => node.id === edge.endNodeId);
      const width = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
      if (width <= 0) return;
      length += width;
      sections.push({
        id: nextId(project, "s"),
        widthIn: roundInches(width),
        clearViewGroupId: null,
        wasClear: Boolean(edge.clearview),
        header: edge.headerSize,
        post: edge.supportPostSize,
      });
    });
    if (!sections.length) return;
    const made = {
      id: wall.id || nextId(project, "w"),
      name: wall.name || "Wall " + (index + 1),
      lengthIn: roundInches(length),
      heightIn: project.cageHeightIn,
      verticalSections: sections.map((section) => ({
        id: section.id,
        widthIn: section.widthIn,
        clearViewGroupId: null,
      })),
      horizontalRows: makeRows(project, [project.cageHeightIn]),
    };
    project.walls.push(made);
    let run = [];
    const flush = () => {
      if (!run.length) return;
      const result = setClearView(project, made.id, run.map((section) => section.id), {
        headerBeamSize: run[0].header || "2x8",
        leftPostSize: run[0].post || "4x4",
        rightPostSize: run[0].post || "4x4",
      });
      if (result.ok) {
        project.clearViewGroups = result.project.clearViewGroups;
        project.walls = result.project.walls;
        project.seq = result.project.seq;
      }
      run = [];
    };
    sections.forEach((section) => {
      if (section.wasClear) run.push(section);
      else flush();
    });
    flush();
  });
  if (Array.isArray(source.nodes) && source.nodes.length === project.walls.length) {
    project.nodes = source.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y }));
    project.cornersManual = true;
  } else rebuildCorners(project);
  project.roof.type = "grid";
  const spanned = setRoofRows(setRoofColumns(project, 4), 3);
  if (Array.isArray(source.roofBeams) && source.roofBeams.length) {
    spanned.roofNodes = source.roofNodes || [];
    spanned.roofBeams = source.roofBeams || [];
    spanned.roof.manual = true;
  }
  return spanned;
}
