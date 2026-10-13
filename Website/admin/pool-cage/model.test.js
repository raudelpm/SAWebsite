import assert from "node:assert/strict";
import test from "node:test";
import { formatInches, formatLength, toInches } from "./units.js?v=11";
import {
  addDoor,
  doorJambs,
  addGutterBreak,
  createProject,
  deleteGutterPoint,
  elevationModel,
  houseEdge,
  migrateProject,
  moveDoor,
  moveGutterPoint,
  roofFootprint,
  sectionGap,
  setCageHeight,
  setClearView,
  setSectionWidth,
  setWallLength,
  sideWallWarning,
} from "./model.js?v=11";
import { deleteRoofNode, finishRoofNodeMove, generateRoof, moveRoofNode, roofPanelCount } from "./roof.js?v=21";
import { calculateRoofZ, footprintContains, getRoofNodeWorldPosition, normalizeRoofProfile, roof2DToWorld3D, roofFlatZone, roofProfileSamples, roofStructure, wallTopHeight } from "./roof-topology.js?v=21";
import { editorCamera, renderClientHtml, renderEditorSvg } from "./render.js?v=14";

function testCage() {
  return generateRoof(
    createProject({
      name: "Pool cage",
      cageHeightIn: 10 * 12,
      columns: 5,
      rows: 4,
    })
  );
}

test("architectural inches keep a tenth when a bay does not land evenly", () => {
  assert.equal(toInches(10, 0), 120);
  assert.equal(formatInches(126), "10' 6\"");
  assert.equal(formatLength((31 * 12) / 5), "6' 2.4\"");
});

test("a standard cage is three screened walls plus a house side", () => {
  const project = testCage();
  assert.equal(project.walls.length, 3);
  assert.equal(project.nodes.length, 4);
  assert.equal(project.walls[0].name, "Wall 1");
  assert.equal(project.walls[0].direction, "East");
  assert.equal(project.walls[1].direction, "South");
  assert.equal(project.walls[2].direction, "West");
  assert.equal(project.walls[1].name, "Wall 2");
  assert.equal(project.walls[2].name, "Wall 3");
  assert.equal(project.walls[0].lengthIn, 240);
  assert.equal(project.walls[0].verticalSections.length, 4);
  assert.equal(project.walls[1].lengthIn, 360);
  assert.equal(project.walls[1].verticalSections.length, 5);
  assert.equal(project.walls[1].verticalSections[0].widthIn, 72);
  assert.equal(project.walls[2].lengthIn, 240);
  assert.equal(houseEdge(project).lengthIn, 360);
  const foot = roofFootprint(project);
  assert.equal(foot.lengthIn, 360);
  assert.equal(foot.depthIn, 240);
  assert.equal(foot.areaSqFt, 600);
  assert.equal(foot.warning, "");
  assert.equal(project.nodes[0].x, 0);
  assert.equal(project.nodes[0].y, 240);
  assert.equal(project.nodes[3].x, 360);
  assert.equal(project.nodes[3].y, 240);
});

test("different side walls stay irregular and warn", () => {
  const project = createProject({
    cageHeightIn: 120,
    walls: [
      { name: "LEFT WALL", lengthIn: 18 * 12, verticalCount: 4, horizontalCount: 2 },
      { name: "REAR WALL", lengthIn: 30 * 12, verticalCount: 5, horizontalCount: 2 },
      { name: "RIGHT WALL", lengthIn: 21 * 12, verticalCount: 4, horizontalCount: 2 },
    ],
  });
  assert.match(sideWallWarning(project), /differ/);
  assert.equal(roofFootprint(project).areaSqFt, 585);
  assert.notEqual(houseEdge(project).lengthIn, 360);
});

test("31 feet across 5 sections stays in tenths and a mismatch warns", () => {
  const project = testCage();
  const sized = setWallLength(project, project.walls[1].id, 31 * 12);
  assert.equal(formatLength(sized.walls[1].verticalSections[0].widthIn), "6' 2.4\"");
  assert.equal(sectionGap(sized.walls[1]), 0);
  const edited = setSectionWidth(sized, sized.walls[1].id, sized.walls[1].verticalSections[0].id, 60);
  assert.notEqual(sectionGap(edited.walls[1]), 0);
});

test("ClearView is a run of sections and drops only the posts inside that run", () => {
  const project = testCage();
  const wall = project.walls[1];
  const ids = wall.verticalSections.slice(1, 4).map((section) => section.id);
  const marked = setClearView(project, wall.id, ids, {
    headerBeamSize: "2x9",
    leftPostSize: "4x4",
    rightPostSize: "4x4",
    removeIntermediatePosts: true,
  });
  assert.equal(marked.ok, true);
  const elevation = elevationModel(marked.project, wall.id);
  assert.equal(elevation.posts.length, 4);
  assert.deepEqual(
    elevation.posts.map((post) => post.at),
    [0, 72, 288, 360]
  );
  assert.equal(elevation.posts[1].size, "4x4");
  assert.equal(elevation.posts[2].size, "4x4");
  assert.equal(elevation.posts.filter((post) => post.at > 72 && post.at < 288).length, 0);
  const opening = elevation.openings.find((item) => item.type === "clearview");
  assert.equal(opening.start, 72);
  assert.equal(opening.end, 288);
  const rejected = setClearView(project, wall.id, [wall.verticalSections[0].id, wall.verticalSections[2].id]);
  assert.equal(rejected.ok, false);
  const svg = renderEditorSvg(marked.project, {
    view: "walls",
    wallId: wall.id,
    camera: editorCamera(marked.project, { view: "walls", wallId: wall.id }),
    viewportWidth: 900,
    selection: null,
    client: false,
  });
  assert.match(svg, /ClearView 2x9/);
  assert.equal(svg.split('class="pcd-rail"').length - 1, 2);
  assert.equal(svg.split("is-heavy").length - 1, 2);
  assert.deepEqual(
    wall.horizontalRows.map((row) => row.heightIn),
    [36, 84]
  );
  assert.deepEqual(elevation.rails, [36]);
  assert.match(svg, />1x2</);
  assert.match(svg, /pcd-header-beam/);
  assert.doesNotMatch(svg, /pcd-header-cap/);
});

test("ClearView sections beside each other open into one bay", () => {
  let project = testCage();
  const wall = project.walls[0];
  project = setClearView(project, wall.id, [wall.verticalSections[1].id], {
    headerBeamSize: "2x8",
    leftPostSize: "4x4",
    rightPostSize: "4x4",
  }).project;
  project = setClearView(project, wall.id, [wall.verticalSections[2].id], {
    headerBeamSize: "2x8",
    leftPostSize: "4x4",
    rightPostSize: "3x3",
  }).project;
  assert.equal(project.clearViewGroups.length, 1);
  assert.equal(project.clearViewGroups[0].sectionIds.length, 2);
  const elevation = elevationModel(project, wall.id);
  assert.deepEqual(
    elevation.posts.map((post) => post.at),
    [0, 60, 180, 240]
  );
  assert.equal(elevation.posts[1].size, "4x4");
  assert.equal(elevation.posts[2].size, "3x3");
  const svg = renderEditorSvg(project, {
    view: "walls",
    wallId: wall.id,
    camera: editorCamera(project, { view: "walls", wallId: wall.id }),
    viewportWidth: 900,
    selection: null,
    client: false,
  });
  assert.equal(svg.split("ClearView 2x8").length - 1, 1);
  assert.match(svg, />2x2</);
});

test("the roof is a clean column and row grid", () => {
  const project = testCage();
  assert.equal(project.roof.type, "grid");
  assert.equal(project.roof.columns.length, 5);
  assert.equal(project.roof.columns[0].widthIn, 72);
  assert.equal(project.roof.rows.length, 4);
  assert.equal(project.roof.rows[0].depthIn, 60);
  assert.equal(project.roofBeams.some((beam) => beam.category === "hip"), false);
  assert.equal(project.roofBeams.some((beam) => beam.category === "ridge"), false);
  assert.equal(project.roofBeams.some((beam) => beam.category === "ring"), false);
  assert.equal(project.roofBeams.filter((beam) => beam.category === "jack").length, 4);
  assert.equal(project.roofBeams.some((beam) => beam.category === "internal"), true);
  assert.equal(project.roofBeams.some((beam) => beam.category === "perimeter"), true);
  assert.equal(roofPanelCount(project), 20);
  const floor = renderEditorSvg(project, {
    view: "floor",
    camera: editorCamera(project, { view: "floor" }),
    viewportWidth: 900,
    selection: null,
    client: false,
  });
  assert.match(floor, /HOUSE \/ GUTTER/);
  const extra = createProject({ wallCount: 5, cageHeightIn: 120 });
  assert.equal(extra.walls.length, 5);
  assert.equal(extra.nodes.length, 6);
  assert.equal(extra.walls[0].name, "Wall 1");
});

test("an older edge-based project still opens", () => {
  const migrated = migrateProject({
    name: "Saved cage",
    cageHeightIn: 120,
    roofType: "gable",
    nodes: [
      { id: "n1", x: 0, y: 0 },
      { id: "n2", x: 360, y: 0 },
      { id: "n3", x: 360, y: 240 },
      { id: "n4", x: 0, y: 240 },
    ],
    edges: [
      { id: "e1", startNodeId: "n1", endNodeId: "n2", clearview: false },
      { id: "e2", startNodeId: "n2", endNodeId: "n3", clearview: true, headerSize: "2x9", supportPostSize: "4x4" },
      { id: "e3", startNodeId: "n3", endNodeId: "n4", clearview: false },
      { id: "e4", startNodeId: "n4", endNodeId: "n1", clearview: false },
    ],
    walls: [
      { id: "w1", name: "Wall 1", edgeIds: ["e1"] },
      { id: "w2", name: "Wall 2", edgeIds: ["e2"] },
      { id: "w3", name: "Wall 3", edgeIds: ["e3"] },
      { id: "w4", name: "Wall 4", edgeIds: ["e4"] },
    ],
    roofNodes: [
      { id: "rn1", x: 0, y: 0 },
      { id: "rn2", x: 360, y: 0 },
    ],
    roofBeams: [{ id: "rb1", startNodeId: "rn1", endNodeId: "rn2", beamSize: "2x4", category: "perimeter" }],
  });
  assert.equal(migrated.walls.length, 4);
  assert.equal(migrated.clearViewGroups.length, 1);
  assert.equal(migrated.clearViewGroups[0].headerBeamSize, "2x9");
  assert.equal(migrated.roof.type, "grid");
  assert.equal(migrated.roof.manual, true);
  assert.equal(migrated.roofBeams.length, 1);
});

test("a door stays on its wall when it is dragged", () => {
  let project = testCage();
  const wall = project.walls[0];
  const added = addDoor(project, wall.id);
  assert.equal(added.ok, true);
  project = added.project;
  assert.equal(project.doors[0].widthIn, 36);
  project = moveDoor(project, project.doors[0].id, 48).project;
  assert.equal(project.doors[0].offsetIn, 48);
  project = moveDoor(project, project.doors[0].id, 9999).project;
  assert.equal(project.doors[0].offsetIn, wall.lengthIn - 36);
  const svg = renderEditorSvg(project, {
    view: "walls",
    wallId: wall.id,
    camera: editorCamera(project, { view: "walls", wallId: wall.id }),
    viewportWidth: 900,
    selection: null,
    client: false,
  });
  const model = elevationModel(project, wall.id);
  const endJambs = doorJambs(wall.lengthIn, project.doors, model.posts);
  assert.equal(endJambs.length, 1);
  assert.ok(Math.abs(endJambs[0].at - (wall.lengthIn - 36)) < 0.2);
  project = moveDoor(project, project.doors[0].id, 48).project;
  const midJambs = doorJambs(wall.lengthIn, project.doors, elevationModel(project, wall.id).posts);
  assert.equal(midJambs.length, 2);
  const midSvg = renderEditorSvg(project, {
    view: "walls",
    wallId: wall.id,
    camera: editorCamera(project, { view: "walls", wallId: wall.id }),
    viewportWidth: 900,
    selection: null,
    client: false,
  });
  assert.equal((midSvg.match(/pcd-stud/g) || []).length, model.posts.length + 2);
  assert.match(svg, /class="pcd-door/);
  assert.match(svg, /DOOR/);
  assert.match(svg, /pcd-door-mesh/);
  assert.doesNotMatch(svg, /pcd-door-leaf/);
  const floor = renderEditorSvg(project, {
    view: "floor",
    camera: editorCamera(project, { view: "floor" }),
    viewportWidth: 900,
    selection: null,
    client: false,
  });
  assert.match(floor, /data-kind="door"/);
  const roof = renderEditorSvg(project, {
    view: "roof",
    camera: editorCamera(project, { view: "roof" }),
    viewportWidth: 900,
    selection: null,
    client: false,
  });
  assert.doesNotMatch(roof, /pcd-door-swing/);
  assert.doesNotMatch(roof, /data-kind="door"/);
  const client = renderClientHtml(project);
  assert.match(client, /data-client-stage/);
  assert.match(client, /Wall elevations/);
  assert.match(client, /Roof layout/);
  assert.match(client, /DOOR/);
});

test("a gutter break bends the house side without moving the roof grid", () => {
  let project = testCage();
  assert.equal(houseEdge(project).lengthIn, 360);
  assert.equal(roofFootprint(project).areaSqFt, 600);
  const added = addGutterBreak(project, 0);
  assert.equal(added.ok, true);
  project = moveGutterPoint(added.project, added.pointId, 180, 300).project;
  assert.equal(project.nodes.length, 4);
  assert.ok(houseEdge(project).lengthIn > 360);
  assert.equal(roofFootprint(project).areaSqFt, 675);
  assert.equal(roofFootprint(project).lengthIn, 360);
  assert.equal(roofFootprint(project).depthIn, 240);
  assert.equal(roofPanelCount(project), 20);
  assert.equal(project.roofBeams.filter((beam) => beam.category === "jack").length, 4);
  const roofTop = Math.max(...project.roofNodes.map((node) => node.y));
  assert.equal(roofTop, 240);
  const floor = renderEditorSvg(project, {
    view: "floor",
    camera: editorCamera(project, { view: "floor" }),
    viewportWidth: 900,
    selection: null,
    client: false,
  });
  assert.match(floor, /data-kind="gutter-point"/);
  assert.match(floor, /HOUSE \/ GUTTER/);
  project = deleteGutterPoint(project, added.pointId);
  assert.equal(houseEdge(project).lengthIn, 360);
  assert.equal(roofFootprint(project).areaSqFt, 600);
});

function covers(edges, x, y0, y1, vertical) {
  return edges
    .filter((edge) => {
      const same = vertical ? Math.abs(edge.a.x - x) < 2 && Math.abs(edge.b.x - x) < 2 : Math.abs(edge.a.y - x) < 2 && Math.abs(edge.b.y - x) < 2;
      if (!same) return false;
      const low = vertical ? Math.min(edge.a.y, edge.b.y) : Math.min(edge.a.x, edge.b.x);
      const high = vertical ? Math.max(edge.a.y, edge.b.y) : Math.max(edge.a.x, edge.b.x);
      return low < y1 - 1 && high > y0 + 1;
    })
    .reduce((sum, edge) => sum + Math.hypot(edge.b.x - edge.a.x, edge.b.y - edge.a.y), 0);
}

test("an edited L-shaped roof is the 3D footprint and keeps the 2D orientation", () => {
  const bottom = roof2DToWorld3D({ x: 360, y: 0 }, 10);
  const top = roof2DToWorld3D({ x: 360, y: 240 }, 10);
  assert.equal(bottom.x, 360);
  assert.equal(bottom.z + 0, 0);
  assert.equal(top.z, -240);
  assert.ok(bottom.z > top.z);
  let project = testCage();
  const straight = roofStructure(project);
  assert.equal(straight.panels.length, 20);
  assert.ok(straight.edges.some((edge) => edge.kind === "house"));
  assert.ok(straight.edges.some((edge) => edge.kind === "perimeter"));
  assert.equal(straight.edges.filter((edge) => edge.kind === "internal").length > 0, true);
  const hole = project.roofNodes.filter((node) => node.x > 216 && node.y < 120);
  hole.forEach((node) => {
    project = deleteRoofNode(project, node.id).project;
  });
  const shaped = roofStructure(project);
  const perimeter = shaped.edges.filter((edge) => edge.kind === "perimeter");
  assert.ok(covers(perimeter, 216, 0, 120, true) > 100);
  assert.ok(covers(shaped.edges.filter((edge) => edge.kind !== "internal"), 120, 216, 360, false) > 100);
  assert.equal(covers(perimeter, 0, 216, 360, false), 0);
  assert.equal(covers(perimeter, 360, 0, 120, true), 0);
  const houseZ = roof2DToWorld3D({ x: 0, y: 240 }).z;
  const cutZ = roof2DToWorld3D({ x: 300, y: 60 }).z;
  assert.ok(cutZ > houseZ);
  assert.equal(project.walls.length, 5);
  assert.deepEqual(
    project.walls.map((wall) => wall.name),
    ["Wall 1", "Wall 2", "Wall 3", "Wall 4", "Wall 5"]
  );
  const lengths = project.walls.map((wall) => Math.round(wall.lengthIn)).sort((a, b) => a - b);
  assert.deepEqual(lengths, [120, 120, 144, 216, 240]);
  assert.equal(
    project.walls.some((wall) => wall.path && wall.path[0].y < 1 && wall.path[0].x > 216 && wall.path[wall.path.length - 1].x > 300),
    false
  );
});

test("an L-shaped cut keeps ClearView on the wall that is still there", () => {
  let project = testCage();
  const rear = project.walls.find((wall) => wall.direction === "South");
  const ids = rear.verticalSections.slice(1, 4).map((section) => section.id);
  project = setClearView(project, rear.id, ids).project;
  const hole = project.roofNodes.filter((node) => node.x > 216 && node.y < 120);
  hole.forEach((node) => {
    project = deleteRoofNode(project, node.id).project;
  });
  const kept = project.walls.find((wall) => wall.id === rear.id);
  assert.ok(kept);
  assert.equal(Math.round(kept.lengthIn), 216);
  const elevation = elevationModel(project, kept.id);
  assert.equal(elevation.openings.filter((opening) => opening.type === "clearview").length, 1);
  assert.equal(elevation.posts.filter((post) => post.role === "clearview").length, 2);
  assert.equal(project.walls.length, 5);
});

test("a slope-flat-slope profile raises only the roof height and keeps the footprint", () => {
  const project = testCage();
  const nodes = project.roofNodes.length;
  const beams = project.roofBeams.length;
  const profile = normalizeRoofProfile(
    { type: "slope-flat-slope", direction: "x", wallHeightIn: 96, topHeightIn: 132, flatWidthIn: 120 },
    120
  );
  project.roof.profile = profile;
  const zone = roofFlatZone(project);
  assert.equal(zone.minX, 72);
  assert.equal(zone.maxX, 288);
  assert.equal(zone.minY, 60);
  assert.equal(zone.maxY, 180);
  assert.equal(wallTopHeight(project), 96);
  assert.equal(getRoofNodeWorldPosition({ x: 0, y: 0 }, project).y, 96);
  assert.equal(getRoofNodeWorldPosition({ x: 0, y: 120 }, project).y, 96);
  assert.equal(getRoofNodeWorldPosition({ x: 360, y: 120 }, project).y, 96);
  assert.equal(getRoofNodeWorldPosition({ x: 180, y: 0 }, project).y, 96);
  assert.equal(getRoofNodeWorldPosition({ x: 36, y: 120 }, project).y, 114);
  assert.equal(getRoofNodeWorldPosition({ x: 180, y: 120 }, project).y, 132);
  assert.equal(getRoofNodeWorldPosition({ x: 72, y: 60 }, project).y, 132);
  const jack = project.roofBeams.find((beam) => beam.category === "jack");
  const jackStart = project.roofNodes.find((node) => node.id === jack.startNodeId);
  const jackEnd = project.roofNodes.find((node) => node.id === jack.endNodeId);
  const jackHeights = [getRoofNodeWorldPosition(jackStart, project).y, getRoofNodeWorldPosition(jackEnd, project).y].sort((a, b) => a - b);
  assert.deepEqual(jackHeights, [96, 132]);
  const flatCorners = [
    [72, 60],
    [288, 60],
    [72, 180],
    [288, 180],
    [180, 120],
  ];
  flatCorners.forEach(([x, y]) => assert.equal(getRoofNodeWorldPosition({ x, y }, project).y, 132));
  assert.equal(calculateRoofZ(180, 30, zone, 96, 132), 96 + (30 / 60) * 36);
  project.roof.profile = normalizeRoofProfile({ type: "flat", wallHeightIn: 120 }, 120);
  assert.equal(getRoofNodeWorldPosition({ x: 180, y: 0 }, project).y, 120);
  project.roof.profile = normalizeRoofProfile(
    { type: "shed", direction: "z", highSide: "start", highHeightIn: 120, lowHeightIn: 96, wallHeightIn: 96 },
    120
  );
  const house = getRoofNodeWorldPosition({ x: 100, y: 240 }, project);
  const yard = getRoofNodeWorldPosition({ x: 100, y: 0 }, project);
  assert.ok(house.y > yard.y);
  project.roof.profile = profile;
  assert.equal(project.roofNodes.length, nodes);
  assert.equal(project.roofBeams.length, beams);
  const samples = roofProfileSamples({ x: 0, y: 240 }, { x: 360, y: 240 }, project);
  assert.equal(samples.length, 2);
  const lifted = setCageHeight(project, 108);
  assert.equal(wallTopHeight(lifted), 108);
  assert.equal(getRoofNodeWorldPosition({ x: 0, y: 0 }, lifted).y, 108);
  assert.equal(getRoofNodeWorldPosition({ x: 180, y: 120 }, lifted).y, 144);
  lifted.roofNodes.find((node) => node.x === 0 && node.y === 0).x = 12;
  assert.equal(normalizeRoofProfile(lifted.roof.profile, lifted.cageHeightIn).type, "slope-flat-slope");
});

function nodeAt(project, x, y) {
  return project.roofNodes.find((node) => Math.abs(node.x - x) < 0.2 && Math.abs(node.y - y) < 0.2);
}

function collapse(project, from, to) {
  const dragged = nodeAt(project, from[0], from[1]);
  assert.ok(dragged);
  const moved = moveRoofNode(project, dragged.id, to[0], to[1]);
  const finished = finishRoofNodeMove(project, moved.project, dragged.id);
  assert.equal(finished.ok, true);
  return finished;
}

function assertCleanCage(project) {
  const spots = new Set();
  project.roofNodes.forEach((node) => {
    const key = node.x + "," + node.y;
    assert.equal(spots.has(key), false);
    spots.add(key);
  });
  const ids = new Set(project.roofNodes.map((node) => node.id));
  project.roofBeams.forEach((beam) => {
    const a = project.roofNodes.find((node) => node.id === beam.startNodeId);
    const b = project.roofNodes.find((node) => node.id === beam.endNodeId);
    assert.ok(a && b);
    assert.ok(ids.has(beam.startNodeId) && ids.has(beam.endNodeId));
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 1);
  });
  assert.ok(project.walls.length >= 3);
  project.walls.forEach((wall) => {
    assert.ok(wall.lengthIn >= 6);
    assert.ok(wall.path && wall.path.length >= 2);
  });
}

test("dropping a footprint node on another merges them and drops the bay", () => {
  const project = testCage();
  const before = project.roofNodes.length;
  const finished = collapse(project, [360, 0], [288, 0]);
  assert.equal(finished.merged, true);
  assert.equal(finished.project.roofNodes.length, before - 1);
  assert.equal(nodeAt(finished.project, 360, 0), undefined);
  assert.ok(nodeAt(finished.project, 288, 0));
  assertCleanCage(finished.project);
  assert.equal(footprintContains(finished.project, 180, 120), true);
  assert.equal(finished.project.cageHeightIn, 120);
});

test("collapsing nodes into an L keeps return walls and clears the cutout", () => {
  let project = testCage();
  project.roof.profile = normalizeRoofProfile(
    { type: "slope-flat-slope", wallHeightIn: 96, topHeightIn: 132, flatWidthIn: 120 },
    120
  );
  [
    [[360, 0], [216, 0]],
    [[360, 60], [216, 60]],
    [[288, 0], [216, 0]],
    [[288, 60], [216, 60]],
  ].forEach(([from, to]) => {
    project = collapse(project, from, to).project;
  });
  assertCleanCage(project);
  assert.equal(footprintContains(project, 300, 30), false);
  assert.equal(footprintContains(project, 100, 30), true);
  const shaped = roofStructure(project);
  const perimeter = shaped.edges.filter((edge) => edge.kind === "perimeter");
  perimeter.forEach((edge) => {
    assert.ok(Math.abs(edge.a.x - edge.b.x) < 2 || Math.abs(edge.a.y - edge.b.y) < 2);
  });
  assert.ok(covers(perimeter, 216, 0, 120, true) > 100);
  assert.ok(covers(shaped.edges.filter((edge) => edge.kind !== "internal"), 120, 216, 360, false) > 100);
  assert.equal(covers(perimeter, 360, 0, 120, true), 0);
  assert.equal(project.walls.length, 5);
  project.walls.forEach((wall) => assert.equal(wall.heightIn, 120));
  assert.equal(wallTopHeight(project), 96);
  assert.equal(project.cageHeightIn, 120);
  const saved = migrateProject(JSON.parse(JSON.stringify(project)));
  assert.equal(saved.roofNodes.length, project.roofNodes.length);
  assert.equal(saved.walls.length, project.walls.length);
  assert.equal(footprintContains(saved, 300, 30), false);
  const corner = nodeAt(project, 216, 0);
  const moved = moveRoofNode(project, corner.id, 204, 0);
  const again = finishRoofNodeMove(project, moved.project, corner.id);
  assert.equal(again.ok, true);
  assert.equal(again.merged, false);
  assert.equal(again.project.roofNodes.length, project.roofNodes.length);
  assert.equal(nodeAt(again.project, 216, 0), undefined);
  assert.ok(nodeAt(again.project, 204, 0));
});

test("a footprint move that crosses itself is put back", () => {
  const project = testCage();
  const dragged = nodeAt(project, 360, 0);
  const moved = moveRoofNode(project, dragged.id, -80, 180);
  const finished = finishRoofNodeMove(project, moved.project, dragged.id);
  assert.equal(finished.ok, false);
  assert.equal(finished.reason, "cross");
  assert.equal(nodeAt(finished.project, 360, 0).id, dragged.id);
  assert.equal(finished.project.roofNodes.length, project.roofNodes.length);
});
