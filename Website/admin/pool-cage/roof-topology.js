/**
 * The edited roof is the cage footprint.
 * Plan x is east. Plan y is north, which is the top of the roof editor.
 * Three.js uses the same x, height as y, and z = -planY so the top of the
 * 2D roof stays the far/back side instead of flipping to the front.
 */
import { gutterPath, wallNodes } from "./model.js?v=14";

export function roof2DToWorld3D(point, elevation = 0) {
  return { x: point.x, y: elevation, z: -point.y };
}

const PROFILE_TYPES = ["flat", "gable", "slope-flat-slope", "shed"];

function clampInches(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** Missing profile means a flat roof at the cage height. */
export function normalizeRoofProfile(profile, cageHeightIn) {
  const source = profile && typeof profile === "object" ? profile : {};
  const wall = clampInches(source.wallHeightIn, cageHeightIn || 120, 36, 480);
  const top = Math.max(wall, clampInches(source.topHeightIn, wall + 36, 36, 600));
  const slope = (value) => (value == null || value === "" ? null : clampInches(value, 0, 0, 2400));
  return {
    type: PROFILE_TYPES.includes(source.type) ? source.type : "flat",
    direction: source.direction === "z" ? "z" : "x",
    wallHeightIn: wall,
    topHeightIn: top,
    flatWidthIn: clampInches(source.flatWidthIn, 120, 0, 2400),
    leftSlopeIn: slope(source.leftSlopeIn),
    rightSlopeIn: slope(source.rightSlopeIn),
    highSide: source.highSide === "end" ? "end" : "start",
    highHeightIn: clampInches(source.highHeightIn, wall + 24, 36, 600),
    lowHeightIn: clampInches(source.lowHeightIn, wall, 36, 600),
  };
}

/** Extent of the current roof footprint on the profile axis. X is left-right. Z is front-back, and the house is the low-Z end. */
export function roofAxisRange(project, direction) {
  const points = (project.roofNodes && project.roofNodes.length ? project.roofNodes : project.nodes) || [];
  if (!points.length) return { min: 0, max: 120 };
  const values = points.map((point) => (direction === "z" ? -point.y : point.x));
  return { min: Math.min(...values), max: Math.max(...values) };
}

/** Fit the requested widths onto the real span without changing the saved profile. */
export function profileSpans(span, profile) {
  const width = Math.max(0, span);
  if (!profile || profile.type === "flat" || profile.type === "shed") return { left: 0, flat: width, right: 0 };
  if (profile.type === "gable") return { left: width / 2, flat: 0, right: width / 2 };
  const flatWanted = Math.max(0, Number(profile.flatWidthIn) || 0);
  let left = profile.leftSlopeIn;
  let right = profile.rightSlopeIn;
  if (left == null && right == null) {
    const flat = Math.min(flatWanted, width);
    const rest = width - flat;
    return { left: rest / 2, flat, right: rest / 2 };
  }
  left = Math.max(0, left == null ? 0 : left);
  right = Math.max(0, right == null ? 0 : right);
  const flat = flatWanted;
  const sum = left + flat + right;
  if (sum <= 0) return { left: width / 2, flat: 0, right: width / 2 };
  const scale = width / sum;
  return { left: left * scale, flat: flat * scale, right: right * scale };
}

function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/**
 * Roof height in inches at a 3D plan position.
 * x is left-right. z is front-back (house is the smaller z).
 * Gable and shed still follow one axis. Slope + flat + slope uses calculateRoofZ.
 */
export function getRoofHeightAtPosition(x, z, roofProfile, axisRange) {
  const profile = normalizeRoofProfile(roofProfile, roofProfile && roofProfile.wallHeightIn);
  const range = axisRange || { min: 0, max: 1 };
  const span = Math.max(0, range.max - range.min);
  const t = profile.direction === "z" ? z : x;
  if (profile.type === "flat" || span < 1) return profile.wallHeightIn;
  const local = t - range.min;
  if (profile.type === "shed") {
    const high = Math.max(profile.lowHeightIn, profile.highHeightIn);
    const low = Math.min(profile.lowHeightIn, profile.highHeightIn);
    const fromHigh = profile.highSide !== "end";
    return lerp(fromHigh ? high : low, fromHigh ? low : high, local / span);
  }
  if (profile.type === "slope-flat-slope") return profile.wallHeightIn;
  const parts = profileSpans(span, profile);
  if (local <= parts.left) return lerp(profile.wallHeightIn, profile.topHeightIn, parts.left <= 0 ? 1 : local / parts.left);
  if (local <= parts.left + parts.flat) return profile.topHeightIn;
  const down = local - parts.left - parts.flat;
  return lerp(profile.topHeightIn, profile.wallHeightIn, parts.right <= 0 ? 1 : down / parts.right);
}

function uniqueStops(points, key) {
  const values = [...new Set((points || []).map((point) => Math.round(point[key] * 100) / 100))];
  values.sort((a, b) => a - b);
  return values;
}

/** Posts stop here. The roof rises above this line and never lengthens a post. */
export function wallTopHeight(project) {
  const cage = project.cageHeightIn || 120;
  if (!project.roof || !project.roof.profile) return cage;
  return normalizeRoofProfile(project.roof.profile, cage).wallHeightIn;
}

function insetStops(stops, slopeIn) {
  if (stops.length < 3) return { min: stops[0], max: stops[stops.length - 1] };
  const bay = Math.max(1, stops[1] - stops[0]);
  const bays = stops.length - 1;
  const maxInset = Math.max(1, Math.floor((bays - 1) / 2));
  const wanted = Math.max(1, Math.floor((Number(slopeIn) || bay) / bay));
  const inset = Math.min(wanted, maxInset);
  return { min: stops[inset], max: stops[stops.length - 1 - inset] };
}

/**
 * Flat center of a slope + flat + slope roof.
 * The slope width is snapped to whole grid bays so the pitch break lands on a beam.
 * On the standard 5 by 4 grid that leaves the middle 6 panels flat.
 */
export function roofFlatZone(project) {
  const points = project.roofNodes && project.roofNodes.length ? project.roofNodes : project.nodes || [];
  const xs = uniqueStops(points, "x");
  const ys = uniqueStops(points, "y");
  if (xs.length < 2 || ys.length < 2) return null;
  const profile = normalizeRoofProfile(project.roof && project.roof.profile, project.cageHeightIn);
  const x = insetStops(xs, profileSpans(xs[xs.length - 1] - xs[0], profile).left);
  const y = insetStops(ys, profileSpans(ys[ys.length - 1] - ys[0], profile).left);
  return {
    minX: x.min,
    maxX: x.max,
    minY: y.min,
    maxY: y.max,
    boundMinX: xs[0],
    boundMaxX: xs[xs.length - 1],
    boundMinY: ys[0],
    boundMaxY: ys[ys.length - 1],
  };
}

function axisProgress(value, outerMin, outerMax, flatMin, flatMax) {
  if (value <= outerMin + 0.01 || value >= outerMax - 0.01) return 0;
  if (flatMax - flatMin < 1) {
    const mid = (outerMin + outerMax) / 2;
    const half = Math.max(1, mid - outerMin);
    return Math.max(0, 1 - Math.abs(value - mid) / half);
  }
  if (value >= flatMin && value <= flatMax) return 1;
  if (value < flatMin) return (value - outerMin) / Math.max(1, flatMin - outerMin);
  return (outerMax - value) / Math.max(1, outerMax - flatMax);
}

/** Height of the roof surface. The flat center is surrounded by slopes on every side. */
export function calculateRoofZ(x, y, zone, wallHeight, flatHeight) {
  if (!zone) return wallHeight;
  const tx = axisProgress(x, zone.boundMinX, zone.boundMaxX, zone.minX, zone.maxX);
  const ty = axisProgress(y, zone.boundMinY, zone.boundMaxY, zone.minY, zone.maxY);
  return wallHeight + Math.min(tx, ty) * (flatHeight - wallHeight);
}

/**
 * Plan points from A to B, including a kink wherever the profile changes slope.
 * Short grid beams that miss a break still meet the flat top at the right height.
 */
export function roofProfileSamples(a, b, project) {
  const profile = normalizeRoofProfile(project.roof && project.roof.profile, project.cageHeightIn);
  if (!a || !b || profile.type === "flat" || profile.type === "shed" || profile.type === "slope-flat-slope") return [a, b];
  const range = roofAxisRange(project, profile.direction);
  const span = Math.max(0, range.max - range.min);
  const parts = profileSpans(span, profile);
  const breaks = profile.type === "gable" ? [range.min + parts.left] : [range.min + parts.left, range.min + parts.left + parts.flat];
  const axisOf = (point) => (profile.direction === "z" ? -point.y : point.x);
  const start = axisOf(a);
  const delta = axisOf(b) - start;
  if (Math.abs(delta) < 1) return [a, b];
  const mids = breaks
    .map((value) => (value - start) / delta)
    .filter((t) => t > 0.02 && t < 0.98)
    .sort((left, right) => left - right)
    .map((t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }));
  return [a, ...mids, b];
}

export function getRoofNodeWorldPosition(node, project) {
  const horizontal = roof2DToWorld3D(node, 0);
  const profile = normalizeRoofProfile(project.roof && project.roof.profile, project.cageHeightIn);
  const base = wallTopHeight(project);
  let y = base;
  if (profile.type === "slope-flat-slope") {
    const rise = Math.max(0, profile.topHeightIn - profile.wallHeightIn);
    y = calculateRoofZ(node.x, node.y, roofFlatZone(project), base, base + rise);
  } else if (profile.type !== "flat") {
    const range = roofAxisRange(project, profile.direction);
    y = getRoofHeightAtPosition(horizontal.x, horizontal.z, profile, range) + (base - profile.wallHeightIn);
  }
  return {
    x: horizontal.x,
    y,
    z: horizontal.z,
  };
}

function nodeMap(project) {
  const map = new Map();
  (project.roofNodes || []).forEach((node) => map.set(node.id, node));
  return map;
}

function shoelace(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    area += points[index].x * next.y - next.x * points[index].y;
  }
  return area / 2;
}

function walkFaces(nodes, beams) {
  const adj = new Map();
  function addLink(fromId, toId) {
    const from = nodes.get(fromId);
    const to = nodes.get(toId);
    if (!from || !to) return;
    if (Math.hypot(to.x - from.x, to.y - from.y) < 0.4) return;
    if (!adj.has(fromId)) adj.set(fromId, []);
    const list = adj.get(fromId);
    if (list.some((item) => item.to === toId)) return;
    list.push({ to: toId, angle: Math.atan2(to.y - from.y, to.x - from.x) });
  }
  beams.forEach((beam) => {
    if (!beam || beam.category === "jack") return;
    addLink(beam.startNodeId, beam.endNodeId);
    addLink(beam.endNodeId, beam.startNodeId);
  });
  adj.forEach((list) => list.sort((a, b) => a.angle - b.angle));

  const used = new Set();
  const faces = [];
  adj.forEach((list, fromId) => {
    list.forEach((start) => {
      const startKey = fromId + ">" + start.to;
      if (used.has(startKey)) return;
      const face = [];
      const trail = [];
      let current = fromId;
      let next = start.to;
      let closed = false;
      for (let guard = 0; guard < 500; guard += 1) {
        const key = current + ">" + next;
        if (used.has(key) || trail.includes(key)) break;
        trail.push(key);
        face.push(current);
        const options = adj.get(next) || [];
        const incoming = options.findIndex((item) => item.to === current);
        if (incoming < 0 || !options.length) break;
        const follow = options[(incoming - 1 + options.length) % options.length];
        if (follow.to === current) break;
        current = next;
        next = follow.to;
        if (current === fromId && next === start.to) {
          closed = true;
          break;
        }
      }
      if (!closed || face.length < 3) return;
      const points = face.map((id) => nodes.get(id)).filter(Boolean);
      if (points.length !== face.length) return;
      const area = shoelace(points);
      trail.forEach((key) => used.add(key));
      if (area > 20) faces.push({ ids: face, points, area });
    });
  });
  return faces;
}

function distanceToPath(point, path) {
  let best = Infinity;
  for (let index = 1; index < path.length; index += 1) {
    const a = path[index - 1];
    const b = path[index];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const span = dx * dx + dy * dy || 1;
    let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / span;
    t = Math.max(0, Math.min(1, t));
    const x = a.x + dx * t;
    const y = a.y + dy * t;
    best = Math.min(best, Math.hypot(point.x - x, point.y - y));
  }
  return best;
}

function isHouseEdge(a, b, gutter) {
  if (!gutter || gutter.length < 2) return false;
  return distanceToPath(a, gutter) < 8 && distanceToPath(b, gutter) < 8;
}

/**
 * Closed roof panels, then the outer boundary of their union.
 * An edge used by two panels is internal framing. An edge used by one
 * panel is the cage perimeter. The house/gutter line is not a screened wall.
 */
export function roofStructure(project) {
  const nodes = nodeMap(project);
  const beams = project.roofBeams || [];
  const panels = walkFaces(nodes, beams);
  const counts = new Map();
  panels.forEach((panel) => {
    panel.ids.forEach((id, index) => {
      const next = panel.ids[(index + 1) % panel.ids.length];
      const key = id < next ? id + "|" + next : next + "|" + id;
      const record = counts.get(key) || { count: 0, a: nodes.get(id), b: nodes.get(next) };
      record.count += 1;
      counts.set(key, record);
    });
  });
  const gutter = gutterPath(project);
  const edges = [];
  counts.forEach((record) => {
    if (!record.a || !record.b) return;
    const kind = record.count === 1 ? (isHouseEdge(record.a, record.b, gutter) ? "house" : "perimeter") : "internal";
    edges.push({
      a: { id: record.a.id, x: record.a.x, y: record.a.y },
      b: { id: record.b.id, x: record.b.x, y: record.b.y },
      aId: record.a.id,
      bId: record.b.id,
      kind,
    });
  });
  return {
    panels: panels.map((panel) => panel.points.map((point) => ({ x: point.x, y: point.y }))),
    edges,
  };
}

function onSegment(wallA, wallB, point) {
  const dx = wallB.x - wallA.x;
  const dy = wallB.y - wallA.y;
  const span = Math.hypot(dx, dy) || 1;
  const cross = Math.abs((point.x - wallA.x) * dy - (point.y - wallA.y) * dx) / span;
  if (cross > 8) return null;
  const along = ((point.x - wallA.x) * dx + (point.y - wallA.y) * dy) / span;
  if (along < -8 || along > span + 8) return null;
  return Math.max(0, Math.min(span, along));
}

/** Where a roof edge still lies on a screened wall, in inches along that wall. */
export function wallSpanOnEdge(project, edge) {
  const walls = project.walls || [];
  for (let index = 0; index < walls.length; index += 1) {
    const wall = walls[index];
    const path = wall.path && wall.path.length >= 2 ? wall.path : null;
    const segment = path ? { a: path[0], b: path[path.length - 1] } : wallNodes(project, index);
    if (!segment || !segment.a || !segment.b) continue;
    const atA = onSegment(segment.a, segment.b, edge.a);
    const atB = onSegment(segment.a, segment.b, edge.b);
    if (atA == null || atB == null) continue;
    return { wall, atA, atB };
  }
  return null;
}

function edgeKey(edge) {
  return edge.aId < edge.bId ? edge.aId + "|" + edge.bId : edge.bId + "|" + edge.aId;
}

function orientEdge(edge, fromId) {
  if (edge.aId === fromId) return edge;
  return { a: edge.b, b: edge.a, aId: edge.bId, bId: edge.aId, kind: edge.kind };
}

function orderedBoundary(edges) {
  if (!edges.length) return [];
  const byNode = new Map();
  edges.forEach((edge) => {
    [edge.aId, edge.bId].forEach((id) => {
      if (!byNode.has(id)) byNode.set(id, []);
      byNode.get(id).push(edge);
    });
  });
  const seen = new Set();
  let current = edges[0].aId;
  const ordered = [];
  for (let guard = 0; guard < edges.length + 2; guard += 1) {
    const options = (byNode.get(current) || []).filter((edge) => !seen.has(edgeKey(edge)));
    if (!options.length) break;
    const oriented = orientEdge(options[0], current);
    seen.add(edgeKey(oriented));
    ordered.push(oriented);
    current = oriented.bId;
    if (ordered.length > 1 && current === ordered[0].aId) break;
  }
  let area = 0;
  ordered.forEach((edge) => {
    area += edge.a.x * edge.b.y - edge.b.x * edge.a.y;
  });
  if (area > 0) {
    const reversed = ordered
      .slice()
      .reverse()
      .map((edge) => orientEdge(edge, edge.bId));
    return reversed;
  }
  return ordered;
}

function exposedRun(ordered) {
  if (!ordered.length) return [];
  const house = ordered.map((edge) => edge.kind === "house");
  if (!house.some(Boolean)) {
    let start = 0;
    ordered.forEach((edge, index) => {
      const best = ordered[start].a;
      const point = edge.a;
      if (point.y > best.y + 0.5 || (Math.abs(point.y - best.y) <= 0.5 && point.x < best.x)) start = index;
    });
    return ordered.slice(start).concat(ordered.slice(0, start));
  }
  const count = ordered.length;
  let bestStart = 0;
  let bestLength = 0;
  for (let index = 0; index < count; index += 1) {
    const previous = house[(index - 1 + count) % count];
    if (!house[index] || previous) continue;
    let length = 0;
    while (length < count && house[(index + length) % count]) length += 1;
    if (length > bestLength) {
      bestLength = length;
      bestStart = index;
    }
  }
  const start = (bestStart + bestLength) % count;
  const exposed = [];
  for (let index = 0; index < count - bestLength; index += 1) exposed.push(ordered[(start + index) % count]);
  return exposed;
}

function turnAngle(before, after) {
  const first = Math.atan2(before.b.y - before.a.y, before.b.x - before.a.x);
  const second = Math.atan2(after.b.y - after.a.y, after.b.x - after.a.x);
  let delta = second - first;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return Math.abs(delta);
}

function compassOutward(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const angle = Math.atan2(dx / length, -dy / length);
  const names = ["East", "North", "West", "South"];
  return names[(Math.round(angle / (Math.PI / 2)) + 4) % 4];
}

/**
 * Screened walls are the roof perimeter, split where the outline turns.
 * The house/gutter run is not a wall. Numbering starts at the first exposed
 * corner after that run and walks clockwise.
 */
export function deriveCageGeometry(project) {
  const structure = roofStructure(project);
  const boundary = structure.edges.filter((edge) => edge.kind === "perimeter" || edge.kind === "house");
  const ordered = orderedBoundary(boundary);
  const exposed = exposedRun(ordered);
  const groups = [];
  exposed.forEach((edge) => {
    const current = groups[groups.length - 1];
    if (!current || turnAngle(current[current.length - 1], edge) > (12 * Math.PI) / 180) groups.push([edge]);
    else current.push(edge);
  });
  const walls = groups
    .map((group, index) => {
      const points = [group[0].a].concat(group.map((edge) => edge.b));
      let length = 0;
      for (let point = 1; point < points.length; point += 1) {
        length += Math.hypot(points[point].x - points[point - 1].x, points[point].y - points[point - 1].y);
      }
      if (length < 6) return null;
      const start = points[0];
      const end = points[points.length - 1];
      return {
        key: (start.id || "a") + "|" + (end.id || "b"),
        number: index + 1,
        direction: compassOutward(start, end),
        lengthIn: Math.round(length * 100) / 100,
        points: points.map((point) => ({ id: point.id, x: point.x, y: point.y })),
      };
    })
    .filter(Boolean);
  walls.forEach((wall, index) => {
    wall.number = index + 1;
  });
  return {
    roof: structure,
    walls,
  };
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[previous];
    const b = polygon[index];
    if ((a.y > point.y) === (b.y > point.y)) continue;
    const x = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (point.x < x) inside = !inside;
  }
  return inside;
}

function onLoop(point, polygon) {
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const span = dx * dx + dy * dy || 1;
    let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / span;
    t = Math.max(0, Math.min(1, t));
    if (Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t)) < 2) return true;
  }
  return false;
}

function segmentsCross(a, b, c, d) {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 0.001) return false;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denom;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / denom;
  return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98;
}

function framingCrosses(project) {
  const nodes = nodeMap(project);
  const segments = [];
  (project.roofBeams || []).forEach((beam) => {
    if (!beam || beam.category === "jack") return;
    const a = nodes.get(beam.startNodeId);
    const b = nodes.get(beam.endNodeId);
    if (!a || !b) return;
    segments.push({ a, b, aId: beam.startNodeId, bId: beam.endNodeId });
  });
  for (let left = 0; left < segments.length; left += 1) {
    for (let right = left + 1; right < segments.length; right += 1) {
      const one = segments[left];
      const two = segments[right];
      if (one.aId === two.aId || one.aId === two.bId || one.bId === two.aId || one.bId === two.bId) continue;
      if (segmentsCross(one.a, one.b, two.a, two.b)) return true;
    }
  }
  return false;
}

/** The outline is one closed loop. An L is valid. A bowtie or a gap is not. */
export function footprintStatus(project) {
  const structure = roofStructure(project);
  if (!structure.panels.length) return { ok: false, reason: "open" };
  const boundary = structure.edges.filter((edge) => edge.kind === "perimeter" || edge.kind === "house");
  const ordered = orderedBoundary(boundary);
  if (!ordered.length || ordered.length !== boundary.length) return { ok: false, reason: "open" };
  if (ordered[ordered.length - 1].bId !== ordered[0].aId) return { ok: false, reason: "open" };
  for (let left = 0; left < ordered.length; left += 1) {
    for (let right = left + 2; right < ordered.length; right += 1) {
      if (left === 0 && right === ordered.length - 1) continue;
      if (segmentsCross(ordered[left].a, ordered[left].b, ordered[right].a, ordered[right].b)) return { ok: false, reason: "cross" };
    }
  }
  if (framingCrosses(project)) return { ok: false, reason: "cross" };
  return { ok: true, points: ordered.map((edge) => ({ x: edge.a.x, y: edge.a.y })) };
}

export function footprintContains(project, x, y) {
  const status = footprintStatus(project);
  if (!status.ok || status.points.length < 3) return false;
  const point = { x, y };
  return pointInPolygon(point, status.points) || onLoop(point, status.points);
}
