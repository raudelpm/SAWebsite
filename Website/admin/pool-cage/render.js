/**
 * Floor plan, wall elevations, roof grid, and the client sheet
 * are all drawn from the wall and roof model.
 */

import { formatApprox, formatInches, formatLength } from "./units.js?v=19";
import {
  cageRing,
  doorJambs,
  elevationModel,
  groupForSection,
  houseEdge,
  planBounds,
  pointAlongPath,
  roofFootprint,
  sectionGap,
  sectionSum,
  wallPath,
} from "./model.js?v=22";
import { roofBeamLength, roofPanelCount } from "./roof.js?v=11";
import { beamStyle, dimensionLine, esc, fitCamera, screenUnits, toWorld } from "./draw.js?v=13";

function memberWeight(size) {
  const text = String(size || "2x2").toLowerCase();
  if (text.indexOf("4x4") === 0 || text.indexOf("4x3") === 0) return 5.8;
  if (text.indexOf("3x3") === 0 || text.indexOf("3x4") === 0) return 4.2;
  return 1.9;
}

function headerDepthIn(size) {
  const face = Number(String(size || "").toLowerCase().split("x")[1]) || 8;
  return Math.max(4, Math.min(12, face));
}

function cutSpans(start, end, blocks) {
  let spans = [[start, end]];
  blocks.forEach((block) => {
    const next = [];
    spans.forEach((span) => {
      const a = span[0];
      const b = span[1];
      if (block.end <= a + 0.5 || block.start >= b - 0.5) {
        next.push(span);
        return;
      }
      if (block.start > a + 0.5) next.push([a, Math.min(b, block.start)]);
      if (block.end < b - 0.5) next.push([Math.max(a, block.end), b]);
    });
    spans = next;
  });
  return spans.filter((span) => span[1] - span[0] > 1);
}

function selected(ui, kind, id) {
  if (!ui.selection) return false;
  if (ui.selection.kind === kind && ui.selection.id === id) return true;
  if (kind === "section" && ui.selection.kind === "sections" && ui.selection.ids && ui.selection.ids.indexOf(id) >= 0) {
    return true;
  }
  return false;
}

function pathLengthOf(path) {
  let length = 0;
  for (let index = 1; index < path.length; index += 1) {
    length += Math.hypot(path[index].x - path[index - 1].x, path[index].y - path[index - 1].y);
  }
  return length;
}

function wallLabel(wall) {
  const facing = wall.direction ? " — " + wall.direction : "";
  return wall.name + facing + " · Approx. " + formatApprox(wall.lengthIn);
}

function outward(project, a, b) {
  const nodes = project.nodes;
  let area = 0;
  for (let i = 0; i < nodes.length; i += 1) {
    const p = nodes[i];
    const q = nodes[(i + 1) % nodes.length];
    area += p.x * q.y - q.x * p.y;
  }
  const sign = area >= 0 ? 1 : -1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: (dy / length) * sign, y: (-dx / length) * sign };
}

function hitLine(kind, id, x1, y1, x2, y2) {
  return (
    '<line class="pcd-hit" data-kind="' +
    kind +
    '" data-id="' +
    esc(id) +
    '" x1="' +
    x1 +
    '" y1="' +
    y1 +
    '" x2="' +
    x2 +
    '" y2="' +
    y2 +
    '" stroke-width="18" vector-effect="non-scaling-stroke" />'
  );
}

function floorDoors(project, wall, a, b, normal, sectionTotal, ui, font) {
  const length = wall.lengthIn || sectionTotal || 1;
  const geom = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  let markup = "";
  (project.doors || [])
    .filter((door) => door.wallId === wall.id)
    .forEach((door) => {
      const width = door.widthIn || 36;
      const t0 = door.offsetIn / length;
      const t1 = (door.offsetIn + width) / length;
      const hinge = { x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 };
      const latch = { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 };
      const span = geom * (width / length);
      const leaf = { x: hinge.x - normal.x * span, y: hinge.y - normal.y * span };
      const h = toWorld(hinge.x, hinge.y);
      const l = toWorld(latch.x, latch.y);
      const tip = toWorld(leaf.x, leaf.y);
      const on = selected(ui, "door", door.id);
      markup +=
        '<line class="pcd-door-gap' +
        (on ? " is-selected" : "") +
        '" x1="' +
        h.x +
        '" y1="' +
        h.y +
        '" x2="' +
        l.x +
        '" y2="' +
        l.y +
        '" vector-effect="non-scaling-stroke" />';
      const cross = (latch.x - hinge.x) * (leaf.y - hinge.y) - (latch.y - hinge.y) * (leaf.x - hinge.x);
      const sweep = cross > 0 ? 0 : 1;
      const radius = Math.hypot(l.x - h.x, l.y - h.y);
      markup +=
        '<path class="pcd-door-swing" d="M ' +
        l.x +
        " " +
        l.y +
        " A " +
        radius +
        " " +
        radius +
        " 0 0 " +
        sweep +
        " " +
        tip.x +
        " " +
        tip.y +
        '" />';
      markup += '<line class="pcd-door-swing" x1="' + h.x + '" y1="' + h.y + '" x2="' + tip.x + '" y2="' + tip.y + '" />';
      if (!ui.client) {
        markup +=
          '<line class="pcd-hit pcd-door-hit" data-kind="door" data-id="' +
          esc(door.id) +
          '" x1="' +
          h.x +
          '" y1="' +
          h.y +
          '" x2="' +
          l.x +
          '" y2="' +
          l.y +
          '" stroke-width="28" vector-effect="non-scaling-stroke" />';
      }
      const label = toWorld((hinge.x + latch.x) / 2 - normal.x * 22, (hinge.y + latch.y) / 2 - normal.y * 22);
      markup +=
        '<text class="pcd-tag" x="' +
        label.x +
        '" y="' +
        label.y +
        '" font-size="' +
        font * 0.72 +
        '" text-anchor="middle">Door</text>';
    });
  return markup;
}

function awayFromCage(project, a, b) {
  const ring = cageRing(project);
  let cx = 0;
  let cy = 0;
  ring.forEach((point) => {
    cx += point.x;
    cy += point.y;
  });
  const count = ring.length || 1;
  cx /= count;
  cy /= count;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let nx = dy / len;
  let ny = -dx / len;
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  if ((cx - midX) * nx + (cy - midY) * ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: nx, y: ny };
}

function gutterMarkup(project, ui, options) {
  const house = houseEdge(project);
  if (!house || !house.path || house.path.length < 2) return "";
  const font = options.font || screenUnits(ui.camera, 13, ui.viewportWidth);
  const nodeHit = screenUnits(ui.camera, 28, ui.viewportWidth);
  const nodeR = screenUnits(ui.camera, 8, ui.viewportWidth);
  const path = house.path;
  let markup = options.lines ? '<g class="pcd-house">' : '<g class="pcd-gutter-handles">';
  let labelSegment = 0;
  let labelLength = -1;
  for (let index = 0; index < path.length - 1; index += 1) {
    const length = Math.hypot(path[index + 1].x - path[index].x, path[index + 1].y - path[index].y);
    if (length > labelLength) {
      labelLength = length;
      labelSegment = index;
    }
  }
  if (options.lines) {
    for (let index = 0; index < path.length - 1; index += 1) {
      const a = path[index];
      const b = path[index + 1];
      const normal = awayFromCage(project, a, b);
      const wa = toWorld(a.x, a.y);
      const wb = toWorld(b.x, b.y);
      const echoA = toWorld(a.x + normal.x * 6, a.y + normal.y * 6);
      const echoB = toWorld(b.x + normal.x * 6, b.y + normal.y * 6);
      const on = selected(ui, "gutter", String(index));
      markup +=
        '<line class="pcd-visible' +
        (on ? " is-selected" : "") +
        '" x1="' +
        wa.x +
        '" y1="' +
        wa.y +
        '" x2="' +
        wb.x +
        '" y2="' +
        wb.y +
        '" vector-effect="non-scaling-stroke" />';
      markup +=
        '<line class="pcd-house-echo" x1="' +
        echoA.x +
        '" y1="' +
        echoA.y +
        '" x2="' +
        echoB.x +
        '" y2="' +
        echoB.y +
        '" vector-effect="non-scaling-stroke" />';
    }
    const a = path[labelSegment];
    const b = path[labelSegment + 1];
    const normal = awayFromCage(project, a, b);
    const label = toWorld((a.x + b.x) / 2 + normal.x * 28, (a.y + b.y) / 2 + normal.y * 28);
    markup +=
      '<text class="pcd-house-name" x="' +
      label.x +
      '" y="' +
      label.y +
      '" font-size="' +
      font +
      '" text-anchor="middle">HOUSE / GUTTER · ' +
      esc(formatLength(house.lengthIn)) +
      "</text>";
  }
  if (options.hits) {
    for (let index = 0; index < path.length - 1; index += 1) {
      const wa = toWorld(path[index].x, path[index].y);
      const wb = toWorld(path[index + 1].x, path[index + 1].y);
      markup +=
        '<line class="pcd-hit" data-kind="gutter" data-id="' +
        index +
        '" x1="' +
        wa.x +
        '" y1="' +
        wa.y +
        '" x2="' +
        wb.x +
        '" y2="' +
        wb.y +
        '" stroke-width="28" vector-effect="non-scaling-stroke" />';
    }
    (project.gutterPoints || []).forEach((point) => {
      const world = toWorld(point.x, point.y);
      const on = selected(ui, "gutter-point", point.id);
      markup +=
        '<g class="pcd-node' +
        (on ? " is-selected" : "") +
        '"><circle class="pcd-hit" data-kind="gutter-point" data-id="' +
        esc(point.id) +
        '" cx="' +
        world.x +
        '" cy="' +
        world.y +
        '" r="' +
        nodeHit +
        '" /><circle class="pcd-visible" cx="' +
        world.x +
        '" cy="' +
        world.y +
        '" r="' +
        nodeR +
        '" /></g>';
    });
  }
  return markup + "</g>";
}

function layoutRing(project) {
  const walls = (project.walls || []).filter((wall) => wall.path && wall.path.length >= 2);
  if (!walls.length) return cageRing(project);
  const ring = [];
  const push = (point) => {
    const last = ring[ring.length - 1];
    if (last && Math.hypot(last.x - point.x, last.y - point.y) < 1) return;
    ring.push(point);
  };
  const house = houseEdge(project);
  if (house && house.path) house.path.forEach(push);
  walls.forEach((wall) => wall.path.forEach(push));
  return ring;
}

function renderFloor(project, ui) {
  const font = screenUnits(ui.camera, 13, ui.viewportWidth);
  const nodeR = screenUnits(ui.camera, 8, ui.viewportWidth);
  const nodeHit = screenUnits(ui.camera, 28, ui.viewportWidth);
  const nodes = project.nodes || [];
  let markup = "";
  const ring = layoutRing(project);
  if (ring.length) {
    const d = ring
      .map((node, index) => {
        const world = toWorld(node.x, node.y);
        return (index === 0 ? "M" : "L") + world.x + " " + world.y;
      })
      .join(" ");
    markup += '<path class="pcd-footprint" d="' + d + ' Z" />';
  }
  project.walls.forEach((wall) => {
    const path = wallPath(project, wall);
    const a = path[0];
    const b = path[path.length - 1];
    if (!a || !b) return;
    const wa = toWorld(a.x, a.y);
    const wb = toWorld(b.x, b.y);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const span = Math.hypot(dx, dy) || 1;
    const normal = wall.path ? { x: -dy / span, y: dx / span } : outward(project, a, b);
    markup += '<g class="pcd-wall' + (selected(ui, "wall", wall.id) ? " is-selected" : "") + '">';
    const sectionTotal = sectionSum(wall) || pathLengthOf(path) || 1;
    const placed = (distance) => pointAlongPath(path, distance);
    let drawn = 0;
    wall.verticalSections.forEach((section) => {
      const start = drawn;
      drawn += section.widthIn;
      const p1 = toWorld(placed(start).x, placed(start).y);
      const p2 = toWorld(placed(drawn).x, placed(drawn).y);
      const clear = Boolean(section.clearViewGroupId);
      markup +=
        '<line class="pcd-visible' +
        (clear ? " is-clearview" : "") +
        '" x1="' +
        p1.x +
        '" y1="' +
        p1.y +
        '" x2="' +
        p2.x +
        '" y2="' +
        p2.y +
        '" vector-effect="non-scaling-stroke" />';
    });
    if (!ui.client) markup += hitLine("wall", wall.id, wa.x, wa.y, wb.x, wb.y);
    const nameAt = toWorld((a.x + b.x) / 2 - normal.x * 16, (a.y + b.y) / 2 - normal.y * 16);
    markup +=
      '<text class="pcd-wall-name" x="' +
      nameAt.x +
      '" y="' +
      nameAt.y +
      '" font-size="' +
      font * 0.9 +
      '" text-anchor="middle">' +
      esc(wallLabel(wall)) +
      "</text>";
    markup += dimensionLine(a, b, formatApprox(wall.lengthIn), normal.x, normal.y, font);
    let along = 0;
    wall.verticalSections.forEach((section, sectionIndex) => {
      along += section.widthIn;
      if (sectionIndex === wall.verticalSections.length - 1) return;
      const next = wall.verticalSections[sectionIndex + 1];
      const leftGroup = groupForSection(project, section);
      const rightGroup = groupForSection(project, next);
      if (
        leftGroup &&
        rightGroup &&
        leftGroup.removeIntermediatePosts !== false &&
        rightGroup.removeIntermediatePosts !== false
      ) {
        return;
      }
      const at = placed(along);
      const px = at.x;
      const py = at.y;
      const tick = 8;
      const p1 = toWorld(px + normal.x * 2, py + normal.y * 2);
      const p2 = toWorld(px - normal.x * tick, py - normal.y * tick);
      markup += '<line class="pcd-tick" x1="' + p1.x + '" y1="' + p1.y + '" x2="' + p2.x + '" y2="' + p2.y + '" />';
    });
    const elev = elevationModel(project, wall.id);
    (elev ? elev.posts : []).forEach((post) => {
      if (post.role !== "clearview") return;
      const at = placed(post.at);
      const px = at.x;
      const py = at.y;
      const p1 = toWorld(px + normal.x * 4, py + normal.y * 4);
      const p2 = toWorld(px - normal.x * 14, py - normal.y * 14);
      markup +=
        '<line class="pcd-post" x1="' +
        p1.x +
        '" y1="' +
        p1.y +
        '" x2="' +
        p2.x +
        '" y2="' +
        p2.y +
        '" stroke-width="' +
        memberWeight(post.size) +
        '" vector-effect="non-scaling-stroke" />';
    });
    const sillAt = toWorld((a.x + b.x) / 2 - normal.x * 30, (a.y + b.y) / 2 - normal.y * 30);
    markup +=
      '<text class="pcd-tag" x="' +
      sillAt.x +
      '" y="' +
      sillAt.y +
      '" font-size="' +
      font * 0.72 +
      '" text-anchor="middle">1x2</text>';
    if (!ui.skipDoors) markup += floorDoors(project, wall, a, b, normal, sectionTotal, ui, font);
    markup += "</g>";
  });
  if (!ui.skipHouse) markup += gutterMarkup(project, ui, { lines: true, hits: !ui.client, font });
  if (!ui.client) {
    nodes.forEach((node, index) => {
      const world = toWorld(node.x, node.y);
      const on = selected(ui, "node", String(index));
      markup +=
        '<g class="pcd-node' +
        (on ? " is-selected" : "") +
        '"><circle class="pcd-hit" data-kind="node" data-id="' +
        index +
        '" cx="' +
        world.x +
        '" cy="' +
        world.y +
        '" r="' +
        nodeHit +
        '" /><circle class="pcd-visible" cx="' +
        world.x +
        '" cy="' +
        world.y +
        '" r="' +
        nodeR +
        '" /></g>';
    });
  }
  return markup;
}

function renderRoof(project, ui) {
  const font = screenUnits(ui.camera, 12, ui.viewportWidth);
  const nodeR = screenUnits(ui.camera, 8, ui.viewportWidth);
  const nodeHit = screenUnits(ui.camera, 28, ui.viewportWidth);
  let markup = '<g class="pcd-roof-cage">' + renderFloor(project, Object.assign({}, ui, { client: true, selection: null, skipHouse: true, skipDoors: true })) + "</g>";
  markup += gutterMarkup(project, ui, { lines: true, hits: !ui.client });
  (project.roofBeams || []).forEach((beam) => {
    const a = (project.roofNodes || []).find((node) => node.id === beam.startNodeId);
    const b = (project.roofNodes || []).find((node) => node.id === beam.endNodeId);
    if (!a || !b) return;
    const wa = toWorld(a.x, a.y);
    const wb = toWorld(b.x, b.y);
    const style = beamStyle(beam.category, ui.client);
    const on = selected(ui, "roof-beam", beam.id);
    const dash = beam.category === "rafter" ? ' stroke-dasharray="7 5"' : "";
    markup += '<g class="pcd-beam pcd-beam--' + esc(beam.category) + (on ? " is-selected" : "") + '">';
    markup +=
      '<line class="pcd-visible" x1="' +
      wa.x +
      '" y1="' +
      wa.y +
      '" x2="' +
      wb.x +
      '" y2="' +
      wb.y +
      '" stroke="' +
      style.color +
      '" stroke-width="' +
      style.width +
      '"' +
      dash +
      ' vector-effect="non-scaling-stroke" />';
    if (!ui.client) markup += hitLine("roof-beam", beam.id, wa.x, wa.y, wb.x, wb.y);
    if (project.showBeamLabels && !ui.client && (beam.category === "perimeter" || beam.category === "hip" || beam.category === "ridge" || beam.category === "ring")) {
      const mid = toWorld((a.x + b.x) / 2, (a.y + b.y) / 2);
      markup +=
        '<text class="pcd-tag" x="' + mid.x + '" y="' + mid.y + '" font-size="' + font * 0.75 + '" text-anchor="middle">' + esc(beam.beamSize) + "</text>";
    }
    markup += "</g>";
  });
  if (!ui.client) {
    (project.roofNodes || []).forEach((node) => {
      const world = toWorld(node.x, node.y);
      const on = selected(ui, "roof-node", node.id);
      markup +=
        '<g class="pcd-node pcd-node--roof' +
        (on ? " is-selected" : "") +
        (ui.mergeTarget === node.id ? " is-merge" : "") +
        '"><circle class="pcd-hit" data-kind="roof-node" data-id="' +
        esc(node.id) +
        '" cx="' +
        world.x +
        '" cy="' +
        world.y +
        '" r="' +
        nodeHit +
        '" /><circle class="pcd-visible" cx="' +
        world.x +
        '" cy="' +
        world.y +
        '" r="' +
        nodeR +
        '" /></g>';
    });
  }
  const count = roofPanelCount(project);
  const label = toWorld(planBounds(project).minX, planBounds(project).maxY);
  markup +=
    '<text class="pcd-wall-title" x="' +
    label.x +
    '" y="' +
    (label.y - font * 2.2) +
    '" font-size="' +
    font +
    '">Roof panels: ' +
    count +
    "</text>";
  return markup;
}

const DOOR_OPENING_IN = 80;

function doorOpeningIn(height) {
  const wall = Number(height) || 0;
  if (wall <= 54) return Math.max(36, wall - 6);
  return Math.min(DOOR_OPENING_IN, wall - 8);
}

/** Door the way the porch layout draws one: jambs, header at 80", frame, and screen above. */
function elevationDoors(doors, model, ui, font) {
  const head = doorOpeningIn(model.height);
  let markup = "";
  doors.forEach((door) => {
    const width = door.widthIn || 36;
    const x1 = toWorld(door.offsetIn, 0).x;
    const x2 = toWorld(door.offsetIn + width, 0).x;
    const yFloor = toWorld(0, 0).y;
    const yHead = toWorld(0, head).y;
    const left = Math.min(x1, x2);
    const right = Math.max(x1, x2);
    const top = Math.min(yFloor, yHead);
    const bottom = Math.max(yFloor, yHead);
    const w = Math.max(1, right - left);
    const h = Math.max(1, bottom - top);
    const inset = Math.min(14, w * 0.08, h * 0.035);
    const on = selected(ui, "door", door.id);
    markup +=
      '<rect class="pcd-door' +
      (on ? " is-selected" : "") +
      '" data-kind="door" data-id="' +
      esc(door.id) +
      '" x="' +
      left +
      '" y="' +
      top +
      '" width="' +
      w +
      '" height="' +
      h +
      '" />';
    markup +=
      '<rect class="pcd-door-frame" x="' +
      (left + inset) +
      '" y="' +
      (top + inset) +
      '" width="' +
      Math.max(4, w - inset * 2) +
      '" height="' +
      Math.max(4, h - inset * 2) +
      '" />';
    markup +=
      '<rect class="pcd-door-mesh" x="' +
      (left + inset * 2) +
      '" y="' +
      (top + inset * 2) +
      '" width="' +
      Math.max(4, w - inset * 4) +
      '" height="' +
      Math.max(4, h - inset * 4) +
      '" />';
    markup +=
      '<text class="pcd-tag pcd-tag--strong" x="' +
      (left + w / 2) +
      '" y="' +
      (top + h / 2 - font * 0.15) +
      '" text-anchor="middle" font-size="' +
      font * 0.78 +
      '">DOOR</text>';
    markup +=
      '<text class="pcd-tag" x="' +
      (left + w / 2) +
      '" y="' +
      (top + h / 2 + font * 0.85) +
      '" text-anchor="middle" font-size="' +
      font * 0.62 +
      '">' +
      esc(formatLength(width) + " × " + formatLength(head)) +
      "</text>";
  });
  return markup;
}

function renderWalls(project, ui) {
  const model = elevationModel(project, ui.wallId);
  if (!model) return "";
  const font = screenUnits(ui.camera, 13, ui.viewportWidth);
  let markup = "";
  markup +=
    '<text class="pcd-wall-title" x="' +
    toWorld(model.length / 2, model.height + 64).x +
    '" y="' +
    toWorld(model.length / 2, model.height + 64).y +
    '" text-anchor="middle" font-size="' +
    font * 1.05 +
    '">' +
    esc(model.wall.name + (model.wall.direction ? " — " + model.wall.direction : "") + "  ·  Approx. " + formatApprox(model.length) + "  ·  " + model.sections.length + " sections") +
    "</text>";
  model.sections.forEach((section) => {
    const x1 = toWorld(section.start, 0).x;
    const x2 = toWorld(section.end, 0).x;
    const y1 = toWorld(0, 0).y;
    const y2 = toWorld(0, model.height).y;
    const on = selected(ui, "section", section.id);
    markup +=
      '<rect class="pcd-elev-bay' +
      (section.group ? " is-clearview" : "") +
      (on ? " is-selected" : "") +
      '" data-kind="section" data-wall="' +
      esc(model.wall.id) +
      '" data-id="' +
      esc(section.id) +
      '" x="' +
      Math.min(x1, x2) +
      '" y="' +
      Math.min(y1, y2) +
      '" width="' +
      Math.abs(x2 - x1) +
      '" height="' +
      Math.abs(y2 - y1) +
      '" />';
    markup +=
      '<text class="pcd-tag" x="' +
      ((x1 + x2) / 2) +
      '" y="' +
      toWorld(0, 10).y +
      '" text-anchor="middle" font-size="' +
      font * 0.8 +
      '">' +
      (section.index + 1) +
      "  " +
      esc(formatLength(section.widthIn)) +
      "</text>";
  });
  const topY = toWorld(0, model.height).y;
  const baseY = toWorld(0, 0).y;
  const runs = [];
  model.sections.forEach((section) => {
    const open = Boolean(section.group && section.group.removeIntermediatePosts !== false);
    const key = open ? "open" : section.group ? "kept:" + section.group.id : "plain";
    const last = runs[runs.length - 1];
    if (last && last.key === key) last.sections.push(section);
    else runs.push({ key, group: section.group, sections: [section] });
  });
  const wallDoors = (project.doors || []).filter((door) => door.wallId === model.wall.id);
  markup += elevationDoors(wallDoors, model, ui, font);
  runs.forEach((run) => {
    const start = run.sections[0].start;
    const end = run.sections[run.sections.length - 1].end;
    const x1 = toWorld(start, 0).x;
    const x2 = toWorld(end, 0).x;
    const mid = (x1 + x2) / 2;
    if (run.group) {
      const depth = headerDepthIn(run.group.headerBeamSize);
      const yBottom = toWorld(0, model.height - depth).y;
      markup +=
        '<rect class="pcd-header-beam" x="' +
        Math.min(x1, x2) +
        '" y="' +
        Math.min(topY, yBottom) +
        '" width="' +
        Math.abs(x2 - x1) +
        '" height="' +
        Math.abs(yBottom - topY) +
        '" />';
      markup +=
        '<text class="pcd-tag pcd-tag--strong" x="' +
        mid +
        '" y="' +
        (topY - font * 0.7) +
        '" text-anchor="middle" font-size="' +
        font * 0.82 +
        '">ClearView ' +
        esc(run.group.headerBeamSize) +
        "</text>";
    } else {
      markup +=
        '<text class="pcd-tag" x="' +
        mid +
        '" y="' +
        (topY - font * 0.55) +
        '" text-anchor="middle" font-size="' +
        font * 0.72 +
        '">2x2</text>';
    }
  });
  markup +=
    '<line class="pcd-top" x1="' +
    toWorld(0, 0).x +
    '" y1="' +
    topY +
    '" x2="' +
    toWorld(model.length, 0).x +
    '" y2="' +
    topY +
    '" stroke="#1c1c1c" stroke-width="2.1" vector-effect="non-scaling-stroke" />';
  markup +=
    '<line class="pcd-visible pcd-sill" x1="' +
    toWorld(0, 0).x +
    '" y1="' +
    baseY +
    '" x2="' +
    toWorld(model.length, 0).x +
    '" y2="' +
    baseY +
    '" vector-effect="non-scaling-stroke" />';
  markup +=
    '<text class="pcd-tag" x="' +
    toWorld(model.length / 2, 0).x +
    '" y="' +
    (baseY + font * 1.15) +
    '" text-anchor="middle" font-size="' +
    font * 0.72 +
    '">1x2</text>';
  const doorBlocks = wallDoors.map((door) => ({ start: door.offsetIn, end: door.offsetIn + (door.widthIn || 36) }));
  const doorHead = doorOpeningIn(model.height);
  model.rails.forEach((rail) => {
    const y = toWorld(0, rail).y;
    const blocks = rail < doorHead - 0.5 ? doorBlocks : [];
    model.sections.forEach((section) => {
      if (section.group) return;
      cutSpans(section.start, section.end, blocks).forEach((span) => {
        markup +=
          '<line class="pcd-rail" x1="' +
          toWorld(span[0], 0).x +
          '" y1="' +
          y +
          '" x2="' +
          toWorld(span[1], 0).x +
          '" y2="' +
          y +
          '" vector-effect="non-scaling-stroke" />';
      });
    });
  });
  model.posts.concat(doorJambs(model.length, wallDoors, model.posts)).forEach((post) => {
    const x = toWorld(post.at, 0).x;
    const insideDoor = wallDoors.some((door) => post.at > door.offsetIn + 1 && post.at < door.offsetIn + (door.widthIn || 36) - 1);
    const postBottom = insideDoor ? toWorld(0, doorHead).y : baseY;
    markup +=
      '<line class="pcd-stud' +
      (post.role === "clearview" ? " is-heavy" : "") +
      '" x1="' +
      x +
      '" y1="' +
      postBottom +
      '" x2="' +
      x +
      '" y2="' +
      topY +
      '" stroke-width="' +
      memberWeight(post.size) +
      '" vector-effect="non-scaling-stroke" />';
    if (post.role === "clearview" || post.role === "corner" || post.role === "jamb") {
      markup +=
        '<text class="pcd-tag" x="' +
        x +
        '" y="' +
        (baseY + font * 1.3) +
        '" text-anchor="middle" font-size="' +
        font * 0.72 +
        '">' +
        esc(post.size) +
        "</text>";
    }
  });
  markup += dimensionLine({ x: 0, y: model.height }, { x: model.length, y: model.height }, formatLength(model.length), 0, 1, font);
  markup += dimensionLine({ x: 0, y: 0 }, { x: 0, y: model.height }, formatLength(model.height), -1, 0, font);
  const gap = sectionGap(model.wall);
  if (Math.abs(gap) > 0.2) {
    markup +=
      '<text class="pcd-tag pcd-tag--strong" x="' +
      toWorld(model.length / 2, -18).x +
      '" y="' +
      toWorld(model.length / 2, -18).y +
      '" text-anchor="middle" font-size="' +
      font +
      '">Section widths do not match the wall length</text>';
  }
  return markup;
}

function gridMarkup(project, camera) {
  if (!project.showGrid || !camera) return "";
  const world = 4;
  const minX = camera.x / world;
  const maxX = (camera.x + camera.w) / world;
  const maxY = -camera.y / world;
  const minY = -(camera.y + camera.h) / world;
  let step = 12;
  while (step * world < camera.w / 40 && step < 120) step *= 2;
  let lines = "";
  const startX = Math.floor(minX / step) * step;
  const startY = Math.floor(minY / step) * step;
  for (let x = startX; x <= maxX; x += step) {
    const point = toWorld(x, 0);
    lines += '<line x1="' + point.x + '" y1="' + camera.y + '" x2="' + point.x + '" y2="' + (camera.y + camera.h) + '" />';
  }
  for (let y = startY; y <= maxY; y += step) {
    const point = toWorld(0, y);
    lines += '<line x1="' + camera.x + '" y1="' + point.y + '" x2="' + (camera.x + camera.w) + '" y2="' + point.y + '" />';
  }
  return '<g class="pcd-grid" pointer-events="none">' + lines + "</g>";
}

export function editorCamera(project, ui) {
  if (ui.view === "walls") {
    const model = elevationModel(project, ui.wallId);
    const length = model ? model.length : 120;
    const height = model ? model.height : project.cageHeightIn;
    return fitCamera({ minX: 0, minY: 0, maxX: length, maxY: height }, 78);
  }
  const bounds = project.nodes && project.nodes.length ? planBounds(project) : { minX: 0, minY: 0, maxX: 360, maxY: 240 };
  return fitCamera(bounds, ui.view === "roof" ? 72 : 64);
}

export function renderEditorSvg(project, ui) {
  const camera = ui.camera;
  let body = "";
  if (ui.view === "roof") body = renderRoof(project, ui);
  else if (ui.view === "walls") body = renderWalls(project, ui);
  else body = renderFloor(project, ui);
  return (
    '<svg class="pcd-svg pcd-svg--' +
    (ui.view || "floor") +
    '" viewBox="' +
    camera.x +
    " " +
    camera.y +
    " " +
    camera.w +
    " " +
    camera.h +
    '" xmlns="http://www.w3.org/2000/svg">' +
    gridMarkup(project, camera) +
    body +
    "</svg>"
  );
}

function clearviewLines(project) {
  const lines = [];
  (project.clearViewGroups || []).forEach((group) => {
    const wall = project.walls.find((item) => item.id === group.wallId);
    if (!wall) return;
    const widths = group.sectionIds.map((id) => {
      const section = wall.verticalSections.find((item) => item.id === id);
      return section ? section.widthIn : 0;
    });
    const total = widths.reduce((sum, width) => sum + width, 0);
    const indexes = group.sectionIds
      .map((id) => wall.verticalSections.findIndex((section) => section.id === id))
      .filter((index) => index >= 0)
      .sort((a, b) => a - b);
    const label = indexes.length ? indexes[0] + 1 + (indexes.length > 1 ? "–" + (indexes[indexes.length - 1] + 1) : "") : "";
    lines.push(
      "<li><strong>" +
        esc(wall.name) +
        " sections " +
        esc(label) +
        "</strong> · " +
        esc(formatLength(total)) +
        " · header " +
        esc(group.headerBeamSize) +
        " · posts " +
        esc(group.leftPostSize) +
        " / " +
        esc(group.rightPostSize) +
        "</li>"
    );
  });
  return lines;
}

export function doorLine(project, wall) {
  const doors = (project.doors || []).filter((door) => door.wallId === wall.id);
  if (!doors.length) return "";
  return (
    "<p>Doors: " +
    doors.map((door) => esc(formatLength(door.widthIn)) + " at " + esc(formatLength(door.offsetIn))).join(", ") +
    "</p>"
  );
}

export function renderClientHtml(project, options) {
  const mode = options && (options.mode === "3d" || options.mode === "2d") ? options.mode : "both";
  const clean = Object.assign({}, project, { showGrid: false, showBeamLabels: false });
  const roofUi = {
    view: "roof",
    camera: editorCamera(clean, { view: "roof" }),
    viewportWidth: 900,
    client: true,
    selection: null,
  };
  const walls = project.walls
    .map((wall) => {
      const model = elevationModel(project, wall.id);
      const camera = fitCamera({ minX: 0, minY: 0, maxX: model.length, maxY: model.height }, 70);
      const sections = wall.verticalSections.map((section) => formatLength(section.widthIn)).join("   ");
      return (
        '<section class="pcd-sheet__spec"><h3>' +
        esc(wall.name) +
        "</h3><p>Approx. length: " +
        esc(formatApprox(wall.lengthIn)) +
        "</p><p>Vertical sections: " +
        wall.verticalSections.length +
        "</p><p>Horizontal rows: " +
        wall.horizontalRows.length +
        "</p>" +
        doorLine(project, wall) +
        '<p class="pcd-sheet__bays">[ ' +
        esc(sections.replace(/   /g, " ][ ")) +
        " ]</p>" +
        renderEditorSvg(clean, {
          view: "walls",
          wallId: wall.id,
          camera,
          viewportWidth: 900,
          client: true,
          selection: null,
        }) +
        "</section>"
      );
    })
    .join("");
  const clearviews = clearviewLines(project);
  const foot = roofFootprint(project);
  const house = houseEdge(project);
  return (
    '<div class="pcd-client is-' +
    mode +
    '"><div class="pcd-client-toolbar" role="tablist"><button type="button" data-client-mode="3d"' +
    (mode === "3d" ? ' class="is-active"' : "") +
    '>3D view</button><button type="button" data-client-mode="2d"' +
    (mode === "2d" ? ' class="is-active"' : "") +
    '>2D view</button><button type="button" data-client-mode="both"' +
    (mode === "both" ? ' class="is-active"' : "") +
    ">Both</button></div>" +
    '<section class="pcd-client-3d"><div class="pcd-client-3d__stage" data-client-stage></div><div class="pcd-client-3d__cams">' +
    ["3d", "front", "rear", "left", "right", "top", "fit", "reset"]
      .map((name) => '<button type="button" data-client-cam="' + name + '">' + (name === "3d" ? "3D" : name === "reset" ? "Reset view" : name === "fit" ? "Fit" : name[0].toUpperCase() + name.slice(1)) + "</button>")
      .join("") +
    '</div></section><div class="pcd-client-2d"><article class="pcd-sheet">' +
    '<header class="pcd-sheet__brand"><img src="../public/Logo%20White%20No%20Background%20.png" alt="SCREEN ARMORS" width="72" height="72"><div><p>SCREEN ARMORS</p><h2>Pool Cage Project</h2></div></header>' +
    '<div class="pcd-sheet__meta"><p><span>Project</span><strong>' +
    esc(project.name || "Pool cage") +
    "</strong></p><p><span>Customer</span><strong>" +
    esc(project.customerName || "—") +
    "</strong></p><p><span>Height</span><strong>" +
    esc(formatLength(project.cageHeightIn)) +
    "</strong></p><p><span>Screened walls</span><strong>" +
    project.walls.length +
    "</strong></p><p><span>House / gutter</span><strong>" +
    esc(house ? formatLength(house.lengthIn) : "—") +
    "</strong></p><p><span>Roof footprint</span><strong>" +
    esc(formatLength(foot.lengthIn) + " × " + formatLength(foot.depthIn)) +
    "</strong></p><p><span>Plan area</span><strong>" +
    foot.areaSqFt +
    " sq ft</strong></p><p><span>Roof panels</span><strong>" +
    roofPanelCount(project) +
    "</strong></p><p><span>ClearView</span><strong>" +
    (clearviews.length ? "Yes" : "No") +
    "</strong></p></div>" +
    (clearviews.length ? '<ul class="pcd-sheet__clear">' + clearviews.join("") + "</ul>" : "") +
    '<section class="pcd-sheet__block"><h3>Roof layout</h3>' +
    renderEditorSvg(clean, roofUi) +
    '</section><section class="pcd-sheet__block"><h3>Wall elevations</h3><div class="pcd-sheet__walls">' +
    walls +
    "</div></section>" +
    '<p class="pcd-sheet__note">Conceptual project layout. Final dimensions and structural requirements are subject to field verification and applicable engineering/code requirements. Layout tool only. Beam/post sizes require field verification and applicable engineering.</p></article></div></div>'
  );
}

export function selectedSections(project, selection) {
  if (!selection) return [];
  if (selection.kind === "section") {
    const wall = project.walls.find((item) => item.verticalSections.some((section) => section.id === selection.id));
    return wall ? [{ wall, section: wall.verticalSections.find((section) => section.id === selection.id) }] : [];
  }
  if (selection.kind === "sections") {
    const wall = project.walls.find((item) => item.id === selection.wallId);
    if (!wall) return [];
    return selection.ids
      .map((id) => wall.verticalSections.find((section) => section.id === id))
      .filter(Boolean)
      .map((section) => ({ wall, section }));
  }
  return [];
}

export { groupForSection };
