/**
 * Pool cage layout designer.
 * Numbers define the walls and the roof grid. The drawing is generated from that model.
 */

import { formatApprox, formatLength, roundInches, splitInches, toInches } from "./units.js?v=19";
import {
  BEAM_SIZES,
  HEADER_SIZES,
  SUPPORT_POSTS,
  addDoor,
  addGutterBreak,
  clearClearView,
  deleteDoor,
  deleteGutterPoint,
  columnSum,
  createProject,
  divideRowsEvenly,
  divideWallEvenly,
  gutterPath,
  houseEdge,
  insertColumnDivider,
  insertRowDivider,
  migrateProject,
  moveCorner,
  moveDoor,
  moveGutterPoint,
  screenBounds,
  roofFootprint,
  rowDepthSum,
  rowGap,
  sectionGap,
  sectionSum,
  setCageHeight,
  setClearView,
  setDoorWidth,
  setColumnWidth,
  setHorizontalCount,
  setRoofColumns,
  setRoofRows,
  setRowDepth,
  setRowHeight,
  setSectionWidth,
  setVerticalCount,
  setWallCount,
  setWallLength,
  updateClearView,
  wallById,
  wallPath,
  offsetAlongPath,
  withRoofSettings,
} from "./model.js?v=20";
import {
  addRoofBeam,
  deleteRoofBeam,
  deleteRoofNode,
  generateRoof,
  moveDivider,
  moveRoofBeam,
  finishRoofNodeMove,
  MERGE_EPSILON,
  moveRoofNode,
  roofPanelCount,
  splitRoofBeam,
  updateRoofBeam,
} from "./roof.js?v=21";
import { editorCamera, renderClientHtml, renderEditorSvg, selectedSections } from "./render.js?v=22";
import { mountClient3D } from "./client3d.js?v=22";
import { calculateRoofZ, getRoofHeightAtPosition, normalizeRoofProfile, profileSpans, roofAxisRange, roofFlatZone, wallTopHeight } from "./roof-topology.js?v=20";
import { esc, fromWorld } from "./draw.js?v=12";

const API = "/api/admin/pool-cage-projects";
const PANEL = "/admin/estimator-panel.html";
const HISTORY = 50;

const app = document.getElementById("pcdApp");
const boot = document.getElementById("adminBootStatus");
const toolbar = document.getElementById("pcdToolbar");
const sidebar = document.getElementById("pcdSidebar");
const props = document.getElementById("pcdProps");
const canvas = document.getElementById("pcdCanvas");
const statusEl = document.getElementById("pcdStatus");
const setup = document.getElementById("pcdSetup");
const userLabel = document.getElementById("pcdUser");
const dialog = document.getElementById("pcdDialog");
const dialogText = document.getElementById("pcdDialogText");
const dialogOk = document.getElementById("pcdDialogOk");
const dialogCancel = document.getElementById("pcdDialogCancel");

const state = {
  project: null,
  view: "floor",
  tool: "select",
  wallId: "",
  selection: null,
  camera: null,
  undo: [],
  redo: [],
  username: "",
  drag: null,
  preview: null,
  beamStart: null,
  clientMode: "both",
};

function partsFromInches(total) {
  const n = Math.max(0, Number(total) || 0);
  const ft = Math.floor((n + 1e-6) / 12);
  const inn = Math.round((n - ft * 12) * 10) / 10;
  return { ft, inn };
}

function readMeasure(root) {
  const feet = root.querySelector("[data-ft]");
  const inches = root.querySelector("[data-in]");
  if (!feet || !inches) return 0;
  return toInches(feet.value, inches.value);
}

function measureHtml(total) {
  const parts = partsFromInches(total);
  return (
    '<span class="pcd-measure"><input data-ft type="number" min="0" step="1" value="' +
    parts.ft +
    '"> <span>ft</span><input data-in type="number" min="0" step="0.1" value="' +
    parts.inn +
    '"> <span>in</span></span>'
  );
}

function setStatus(text) {
  if (statusEl) statusEl.textContent = text || "";
}

function workingProject() {
  return state.preview || state.project;
}

function commit(project) {
  if (!state.project) {
    state.project = project;
  } else {
    state.undo.push(structuredClone(state.project));
    if (state.undo.length > HISTORY) state.undo.shift();
    state.redo = [];
    state.project = project;
  }
  if (state.project.roof) state.project.roofType = state.project.roof.type;
  state.preview = null;
  if (!state.project.walls.some((wall) => wall.id === state.wallId)) {
    state.wallId = state.project.walls[0] ? state.project.walls[0].id : "";
  }
  refresh({ forcePanels: true });
}

function undo() {
  if (!state.undo.length) return;
  state.redo.push(structuredClone(state.project));
  state.project = state.undo.pop();
  state.preview = null;
  refresh({ forcePanels: true });
}

function redo() {
  if (!state.redo.length) return;
  state.undo.push(structuredClone(state.project));
  state.project = state.redo.pop();
  state.preview = null;
  refresh({ forcePanels: true });
}

function offsetAlongWall(project, wallId, x, y) {
  const wall = (project.walls || []).find((item) => item.id === wallId);
  if (!wall) return 0;
  const path = wallPath(project, wall);
  if (path.length < 2) return 0;
  return Math.max(0, Math.min(wall.lengthIn || offsetAlongPath(path, x, y), offsetAlongPath(path, x, y)));
}

function eventPoint(event) {
  const svg = canvas.querySelector("svg");
  const rect = svg.getBoundingClientRect();
  const camera = state.camera;
  const x = ((event.clientX - rect.left) / rect.width) * camera.w + camera.x;
  const y = ((event.clientY - rect.top) / rect.height) * camera.h + camera.y;
  return fromWorld(x, y);
}

function snap(point) {
  const grid = state.project && state.project.snap && state.project.snap.enabled ? state.project.snap.gridSizeIn || 6 : 0;
  if (!grid) return { x: roundInches(point.x), y: roundInches(point.y) };
  return {
    x: roundInches(Math.round(point.x / grid) * grid),
    y: roundInches(Math.round(point.y / grid) * grid),
  };
}

function zoom(factor) {
  if (!state.camera) return;
  const camera = state.camera;
  const cx = camera.x + camera.w / 2;
  const cy = camera.y + camera.h / 2;
  camera.w *= factor;
  camera.h *= factor;
  camera.x = cx - camera.w / 2;
  camera.y = cy - camera.h / 2;
  renderCanvas();
}

function fit() {
  if (!state.project) return;
  state.camera = editorCamera(workingProject(), viewState());
  renderCanvas();
}

function viewState() {
  return {
    view: state.view,
    wallId: state.wallId,
    camera: state.camera,
    viewportWidth: canvas.clientWidth || 1000,
    selection: state.selection,
    mergeTarget: state.mergeTarget || null,
    client: false,
  };
}

let clientView = null;

function renderCanvas() {
  const project = workingProject();
  if (!project) return;
  if (state.view === "client") {
    if (clientView) {
      clientView.dispose();
      clientView = null;
    }
    canvas.innerHTML = renderClientHtml(project, { mode: state.clientMode || "both" });
    try {
      clientView = mountClient3D(canvas.querySelector("[data-client-stage]"), project);
    } catch (error) {
      clientView = null;
      const stage = canvas.querySelector("[data-client-stage]");
      if (stage) stage.textContent = "The 3D view could not start in this browser. The 2D layout below is unchanged.";
    }
    return;
  }
  if (clientView) {
    clientView.dispose();
    clientView = null;
  }
  if (!state.camera) state.camera = editorCamera(project, viewState());
  const ui = viewState();
  ui.camera = state.camera;
  canvas.innerHTML = renderEditorSvg(project, ui);
}

function refresh(options) {
  const project = state.project;
  if (!project) return;
  app.classList.toggle("is-client", state.view === "client");
  document.querySelectorAll("#pcdTabs button").forEach((button) => {
    button.classList.toggle("is-active", button.getAttribute("data-view") === state.view);
  });
  const gridButton = toolbar.querySelector('[data-action="grid"]');
  const snapButton = toolbar.querySelector('[data-action="snap"]');
  if (gridButton) gridButton.classList.toggle("is-active", project.showGrid !== false);
  if (snapButton) snapButton.classList.toggle("is-active", !project.snap || project.snap.enabled !== false);
  updateWallSwitch();
  if (state.view !== "client") {
    state.camera = state.camera || editorCamera(project, viewState());
  }
  renderCanvas();
  const typing = sidebar.contains(document.activeElement) || props.contains(document.activeElement);
  if (!typing || (options && options.forcePanels)) {
    renderSidebar();
    renderProps();
  }
}

function updateWallSwitch() {
  const wrap = document.getElementById("pcdWallSwitch");
  const select = document.getElementById("pcdWallSelect");
  if (!wrap || !select || !state.project) return;
  wrap.hidden = state.view !== "walls";
  const html = state.project.walls
    .map((wall) => '<option value="' + esc(wall.id) + '">' + esc(wall.name + (wall.direction ? " — " + wall.direction : "")) + "</option>")
    .join("");
  if (select.innerHTML !== html) select.innerHTML = html;
  if (state.wallId) select.value = state.wallId;
}

function sizeControl(label, key, value, presets) {
  const known = presets.includes(value);
  const options = presets
    .map((size) => '<option value="' + esc(size) + '"' + (size === value ? " selected" : "") + ">" + esc(size) + "</option>")
    .join("");
  let html =
    "<label>" +
    esc(label) +
    '<select data-size-key="' +
    esc(key) +
    '">' +
    options +
    '<option value="custom"' +
    (known ? "" : " selected") +
    ">Custom</option></select></label>";
  if (!known) {
    html +=
      '<label>Custom size<input data-size-custom="' +
      esc(key) +
      '" type="text" maxlength="24" value="' +
      esc(value) +
      '"></label>';
  }
  return html;
}

function wallEditor(wall) {
  const gap = sectionGap(wall);
  const rowsOff = rowGap(wall);
  const widths = wall.verticalSections
    .map((section, index) => {
      return (
        '<div class="pcd-section-row"><span>' +
        (index + 1) +
        "</span>" +
        measureHtml(section.widthIn).replace("<span class=\"pcd-measure\">", '<span class="pcd-measure" data-section="' + esc(section.id) + '">') +
        "</div>"
      );
    })
    .join("");
  const rowLines = wall.horizontalRows
    .map((row, index) => {
      return (
        '<div class="pcd-section-row"><span>Row ' +
        (index + 1) +
        "</span>" +
        measureHtml(row.heightIn).replace("<span class=\"pcd-measure\">", '<span class="pcd-measure" data-row="' + esc(row.id) + '">') +
        "</div>"
      );
    })
    .join("");
  return (
    '<section class="pcd-wall-card" data-wall="' +
    esc(wall.id) +
    '"><h3>' +
    esc(wall.name + (wall.direction ? " — " + wall.direction : "")) +
    '</h3><label>Name <input data-name type="text" maxlength="80" value="' +
    esc(wall.name) +
    '"></label><p class="pcd-note">Approx. length ' +
    esc(formatApprox(wall.lengthIn)) +
    ". Taken from the roof outline.</p><label>Vertical sections <input data-vertical type=\"number\" min=\"1\" max=\"24\" value=\"" +
    wall.verticalSections.length +
    '"></label><label>Horizontal rows <input data-horizontal type="number" min="1" max="12" value="' +
    wall.horizontalRows.length +
    '"></label><div class="pcd-inline-actions"><button type="button" class="btn btn-secondary" data-wall-action="add">+ Section</button><button type="button" class="btn btn-secondary" data-wall-action="remove">− Section</button><button type="button" class="btn btn-secondary" data-wall-action="even">Evenly divide</button></div><div class="pcd-bay-list">' +
    widths +
    "</div>" +
    (Math.abs(gap) > 0.2 ? '<p class="pcd-warn">Section widths total ' + esc(formatLength(sectionSum(wall))) + ". Wall length is " + esc(formatLength(wall.lengthIn)) + ".</p>" : "") +
    "<div>" +
    rowLines +
    '</div><button type="button" class="btn btn-secondary" data-wall-action="even-rows">Chair rail at 3\'</button>' +
    (Math.abs(rowsOff) > 0.2 ? '<p class="pcd-warn">Row heights do not match the wall height.</p>' : "") +
    "</section>"
  );
}

function houseCard(project) {
  const foot = roofFootprint(project);
  const house = houseEdge(project);
  return (
    '<section class="pcd-wall-card"><h3>House / gutter</h3><p>Attached to the house. Not a screened wall. Add a break where the gutter turns, then drag that point.</p><p><strong>' +
    esc(formatLength(house ? house.lengthIn : foot.houseLengthIn)) +
    '</strong></p><button type="button" class="btn btn-secondary" data-action="add-gutter">Add gutter break</button><p>Roof footprint ' +
    esc(formatLength(foot.lengthIn)) +
    " × " +
    esc(formatLength(foot.depthIn)) +
    "</p><p>Plan area " +
    foot.areaSqFt +
    " sq ft</p>" +
    (foot.warning ? '<p class="pcd-warn">' + esc(foot.warning) + "</p>" : "") +
    "</section>"
  );
}

function renderProjectSidebar() {
  const project = state.project;
  const height = splitInches(project.cageHeightIn);
  sidebar.innerHTML =
    "<h2>Walls</h2><p class=\"pcd-note\">Set each wall, then open Walls to mark ClearView. Click a section. Shift-click selects a run of sections.</p><label>Project name<input data-field=\"name\" type=\"text\" maxlength=\"160\" value=\"" +
    esc(project.name) +
    "\"></label><label>Customer<input data-field=\"customer\" type=\"text\" maxlength=\"160\" value=\"" +
    esc(project.customerName || "") +
    "\"></label><label>Cage height <span class=\"pcd-measure\" data-height=\"1\"><input data-ft type=\"number\" min=\"0\" step=\"1\" value=\"" +
    height.ft +
    "\"> <span>ft</span><input data-in type=\"number\" min=\"0\" max=\"11\" step=\"1\" value=\"" +
    height.inn +
    "\"> <span>in</span></span></label><p class=\"pcd-note\">" +
    project.walls.length +
    " screened walls follow the roof outline. A turn in the perimeter starts the next wall. The house / gutter is not one of them.</p>" +
    project.walls.map(wallEditor).join("") +
    houseCard(project) +
    "<p class=\"pcd-note\">Layout tool only. Beam/post sizes require field verification and applicable engineering.</p><p data-save-status class=\"pcd-note\"></p><div class=\"pcd-side-actions\"><button type=\"button\" class=\"btn btn-quote\" data-action=\"save\">Save project</button><button type=\"button\" class=\"btn btn-secondary\" data-action=\"new\">New project</button></div>";
}

function applyRoofProfile(project, patch) {
  const next = structuredClone(project);
  next.roof.profile = normalizeRoofProfile(Object.assign({}, next.roof && next.roof.profile, patch), next.cageHeightIn);
  return next;
}

function profilePreview(project) {
  const profile = normalizeRoofProfile(project.roof && project.roof.profile, project.cageHeightIn);
  const range = roofAxisRange(project, profile.direction);
  const span = Math.max(12, range.max - range.min);
  const samples = [];
  const zone = profile.type === "slope-flat-slope" ? roofFlatZone(project) : null;
  const base = wallTopHeight(project);
  const rise = Math.max(0, profile.topHeightIn - profile.wallHeightIn);
  for (let step = 0; step <= 24; step += 1) {
    const t = range.min + (span * step) / 24;
    if (zone) {
      const midY = (zone.minY + zone.maxY) / 2;
      const midX = (zone.minX + zone.maxX) / 2;
      const x = profile.direction === "z" ? midX : t;
      const y = profile.direction === "z" ? -t : midY;
      samples.push(calculateRoofZ(x, y, zone, base, base + rise));
    } else {
      const x = profile.direction === "z" ? 0 : t;
      const z = profile.direction === "z" ? t : 0;
      samples.push(getRoofHeightAtPosition(x, z, profile, range));
    }
  }
  const low = Math.min(...samples) - 12;
  const high = Math.max(...samples) + 18;
  const width = 220;
  const svgHeight = 78;
  const points = samples
    .map((sample, index) => {
      const x = (index / (samples.length - 1)) * (width - 16) + 8;
      const y = svgHeight - 16 - ((sample - low) / Math.max(1, high - low)) * (svgHeight - 28);
      return x + "," + y;
    })
    .join(" ");
  const floor = svgHeight - 16;
  const start = "8," + floor;
  const end = width - 8 + "," + floor;
  const leftLabel = profile.direction === "z" ? "House" : "Left";
  const rightLabel = profile.direction === "z" ? "Yard" : "Right";
  return (
    '<svg class="pcd-profile-preview" viewBox="0 0 ' +
    width +
    " " +
    svgHeight +
    '" role="img" aria-label="Roof profile"><polygon points="' +
    start +
    " " +
    points +
    " " +
    end +
    '" /><polyline points="' +
    points +
    '" /><text x="8" y="' +
    (svgHeight - 3) +
    '">' +
    leftLabel +
    '</text><text x="' +
    (width - 8) +
    '" y="' +
    (svgHeight - 3) +
    '" text-anchor="end">' +
    rightLabel +
    "</text></svg>"
  );
}

function roofProfileCard(project) {
  const profile = normalizeRoofProfile(project.roof && project.roof.profile, project.cageHeightIn);
  const range = roofAxisRange(project, profile.direction);
  const fitted = profileSpans(Math.max(0, range.max - range.min), profile);
  const option = (value, label) => '<option value="' + value + '"' + (profile.type === value ? " selected" : "") + ">" + label + "</option>";
  const direction = (value, label) => '<option value="' + value + '"' + (profile.direction === value ? " selected" : "") + ">" + label + "</option>";
  let fields = "";
  if (profile.type === "flat") {
    fields = "<label>Roof height " + measureHtml(profile.wallHeightIn).replace('<span class="pcd-measure">', '<span class="pcd-measure" data-profile-measure="wallHeightIn">') + "</label>";
  } else if (profile.type === "shed") {
    const highLabel = profile.direction === "z" ? (profile.highSide === "end" ? "Yard side" : "House side") : profile.highSide === "end" ? "Right side" : "Left side";
    fields =
      "<label>High side <select data-profile=\"highSide\"><option value=\"start\"" +
      (profile.highSide !== "end" ? " selected" : "") +
      ">" +
      (profile.direction === "z" ? "House side" : "Left") +
      "</option><option value=\"end\"" +
      (profile.highSide === "end" ? " selected" : "") +
      ">" +
      (profile.direction === "z" ? "Yard side" : "Right") +
      "</option></select></label><label>High side height " +
      measureHtml(profile.highHeightIn).replace('<span class="pcd-measure">', '<span class="pcd-measure" data-profile-measure="highHeightIn">') +
      "</label><label>Low side height " +
      measureHtml(profile.lowHeightIn).replace('<span class="pcd-measure">', '<span class="pcd-measure" data-profile-measure="lowHeightIn">') +
      "</label><p class=\"pcd-note\">High side is the " +
      highLabel.toLowerCase() +
      ".</p>";
  } else {
    const custom = profile.leftSlopeIn != null || profile.rightSlopeIn != null;
    fields =
      "<label>Wall height " +
      measureHtml(profile.wallHeightIn).replace('<span class="pcd-measure">', '<span class="pcd-measure" data-profile-measure="wallHeightIn">') +
      "</label><label>" +
      (profile.type === "gable" ? "Ridge height " : "Top height ") +
      measureHtml(profile.topHeightIn).replace('<span class="pcd-measure">', '<span class="pcd-measure" data-profile-measure="topHeightIn">') +
      "</label>" +
      (profile.type === "slope-flat-slope"
        ? "<label>Flat top width " +
          measureHtml(profile.flatWidthIn).replace('<span class="pcd-measure">', '<span class="pcd-measure" data-profile-measure="flatWidthIn">') +
          '</label><label class="pcd-check"><input data-profile="customSlopes" type="checkbox"' +
          (custom ? " checked" : "") +
          "> Custom slope widths</label>" +
          (custom
            ? "<label>Left slope " +
              measureHtml(profile.leftSlopeIn || 0).replace('<span class="pcd-measure">', '<span class="pcd-measure" data-profile-measure="leftSlopeIn">') +
              "</label><label>Right slope " +
              measureHtml(profile.rightSlopeIn || 0).replace('<span class="pcd-measure">', '<span class="pcd-measure" data-profile-measure="rightSlopeIn">') +
              "</label>"
            : "") +
          "<p class=\"pcd-note\">Fitted to this roof: slopes " +
          esc(formatLength(fitted.left)) +
          " · flat " +
          esc(formatLength(fitted.flat)) +
          " · " +
          esc(formatLength(fitted.right)) +
          ".</p>"
        : "");
  }
  return (
    '<section class="pcd-profile"><h2>Roof profile</h2><p class="pcd-note">The roof grid is the footprint. This sets how high those same beams sit in 3D.</p>' +
    profilePreview(project) +
    '<label>Profile <select data-profile="type">' +
    option("flat", "Flat") +
    option("gable", "Gable") +
    option("slope-flat-slope", "Slope + flat + slope") +
    option("shed", "Single slope") +
    "</select></label>" +
    (profile.type === "flat"
      ? ""
      : '<label>Direction <select data-profile="direction">' +
        direction("x", "Left ↔ Right") +
        direction("z", "Front ↔ Back") +
        "</select></label>") +
    fields +
    "</section>"
  );
}

function renderRoofSidebar() {
  const project = state.project;
  const roof = project.roof;
  const bounds = screenBounds(project);
  const foot = roofFootprint(project);
  const columns = (roof.columns || [])
    .map((column, index) => {
      return (
        '<div class="pcd-section-row"><span>' +
        (index + 1) +
        "</span>" +
        measureHtml(column.widthIn).replace("<span class=\"pcd-measure\">", '<span class="pcd-measure" data-column="' + esc(column.id) + '">') +
        "</div>"
      );
    })
    .join("");
  const rows = (roof.rows || [])
    .map((row, index) => {
      return (
        '<div class="pcd-section-row"><span>' +
        (index + 1) +
        "</span>" +
        measureHtml(row.depthIn).replace("<span class=\"pcd-measure\">", '<span class="pcd-measure" data-roof-row="' + esc(row.id) + '">') +
        "</div>"
      );
    })
    .join("");
  const columnGap = roundInches(columnSum(project) - bounds.width);
  const rowGapIn = roundInches(rowDepthSum(project) - bounds.depth);
  sidebar.innerHTML =
    roofProfileCard(project) +
    "<h2>Roof grid</h2><p class=\"pcd-note\">Standard grid. House / rear length " +
    esc(formatLength(foot.houseLengthIn)) +
    ". Projection from house " +
    esc(formatLength(foot.depthIn)) +
    ". Plan area " +
    foot.areaSqFt +
    " sq ft.</p>" +
    (foot.warning ? '<p class="pcd-warn">' + esc(foot.warning) + "</p>" : "") +
    "<label>Columns <input data-roof=\"columns\" type=\"number\" min=\"1\" max=\"24\" value=\"" +
    (roof.columns || []).length +
    "\"></label><label>Rows <input data-roof=\"rows\" type=\"number\" min=\"1\" max=\"24\" value=\"" +
    (roof.rows || []).length +
    "\"></label><label>Default roof beam <select data-roof=\"default\">" +
    BEAM_SIZES.map((size) => '<option value="' + size + '"' + (roof.defaultBeam === size ? " selected" : "") + ">" + size + "</option>").join("") +
    "</select></label><label>Perimeter beam <select data-roof=\"perimeter\">" +
    BEAM_SIZES.map((size) => '<option value="' + size + '"' + (roof.perimeterBeam === size ? " selected" : "") + ">" + size + "</option>").join("") +
    "</select></label><p class=\"pcd-note\">Roof length " +
    esc(formatLength(bounds.width)) +
    " · Roof width " +
    esc(formatLength(bounds.depth)) +
    " · Roof panels " +
    roofPanelCount(project) +
    "</p><div class=\"pcd-side-actions\"><button type=\"button\" class=\"btn btn-quote\" data-action=\"generate\">Generate roof</button><button type=\"button\" class=\"btn btn-secondary\" data-action=\"reset-roof\">Reset roof</button></div><div class=\"pcd-inline-actions\"><button type=\"button\" class=\"btn btn-secondary\" data-action=\"even-columns\">Evenly distribute columns</button><button type=\"button\" class=\"btn btn-secondary\" data-action=\"even-rows\">Evenly distribute rows</button></div><div class=\"pcd-inline-actions\"><button type=\"button\" class=\"btn btn-secondary\" data-action=\"add-column\">Add vertical divider</button><button type=\"button\" class=\"btn btn-secondary\" data-action=\"add-row\">Add horizontal divider</button></div><h3>Columns</h3>" +
    columns +
    (Math.abs(columnGap) > 0.5 ? '<p class="pcd-warn">Column widths do not match the roof length.</p>' : "") +
    "<h3>Rows</h3>" +
    rows +
    (Math.abs(rowGapIn) > 0.5 ? '<p class="pcd-warn">Row widths do not match the roof width.</p>' : "") +
    "<p class=\"pcd-note\">Layout tool only. Beam/post sizes require field verification and applicable engineering.</p><p data-save-status class=\"pcd-note\"></p><button type=\"button\" class=\"btn btn-quote\" data-action=\"save\">Save project</button>";
}

function renderSidebar() {
  if (!state.project || state.view === "client") {
    sidebar.innerHTML = "";
    return;
  }
  if (state.view === "roof") renderRoofSidebar();
  else renderProjectSidebar();
}

function renderProps() {
  const project = state.project;
  if (!project || state.view === "client") {
    props.innerHTML = "";
    return;
  }
  const picked = selectedSections(project, state.selection);
  if (picked.length) {
    const wall = picked[0].wall;
    const ids = picked.map((item) => item.section.id);
    const groupIds = [...new Set(picked.map((item) => item.section.clearViewGroupId).filter(Boolean))];
    const group = groupIds.length === 1 ? (project.clearViewGroups || []).find((item) => item.id === groupIds[0]) : null;
    const allOn = picked.every((item) => item.section.clearViewGroupId) && groupIds.length === 1;
    props.innerHTML =
      "<h2>" +
      esc(wall.name) +
      "</h2><p class=\"pcd-note\">Sections " +
      picked.map((item) => wall.verticalSections.findIndex((section) => section.id === item.section.id) + 1).join(", ") +
      "</p><p>ClearView</p><div class=\"pcd-choices\"><button type=\"button\" data-cv=\"on\"" +
      (allOn ? ' class="is-active"' : "") +
      ">On</button><button type=\"button\" data-cv=\"off\"" +
      (!allOn ? ' class="is-active"' : "") +
      ">Off</button></div>" +
      (allOn && group
        ? sizeControl("ClearView header beam", "header", group.headerBeamSize, HEADER_SIZES) +
          sizeControl("Left support post", "left", group.leftPostSize, SUPPORT_POSTS) +
          sizeControl("Right support post", "right", group.rightPostSize, SUPPORT_POSTS) +
          "<label>Remove intermediate posts <select data-cv-posts><option value=\"yes\"" +
          (group.removeIntermediatePosts !== false ? " selected" : "") +
          ">Yes</option><option value=\"no\"" +
          (group.removeIntermediatePosts === false ? " selected" : "") +
          ">No</option></select></label>"
        : "<p class=\"pcd-note\">Turn ClearView on to drop the posts inside this run and mark a header.</p>") +
      "<p class=\"pcd-note\">Layout tool only. Beam/post sizes require field verification and applicable engineering.</p>";
    props.dataset.wallId = wall.id;
    props.dataset.sectionIds = ids.join(",");
    props.dataset.groupId = group ? group.id : "";
    return;
  }
  if (state.selection && state.selection.kind === "roof-beam") {
    const beam = (project.roofBeams || []).find((item) => item.id === state.selection.id);
    if (!beam) {
      props.innerHTML = "<h2>Roof</h2>";
      return;
    }
    props.innerHTML =
      "<h2>Roof beam</h2><p class=\"pcd-note\">" +
      esc(beam.category) +
      "</p>" +
      sizeControl("Beam size", "beam", beam.beamSize, BEAM_SIZES) +
      "<div class=\"pcd-side-actions\"><button type=\"button\" class=\"btn btn-secondary\" data-action=\"split\">Split</button><button type=\"button\" class=\"btn btn-secondary\" data-action=\"delete\">Delete</button></div>";
    return;
  }
  if (state.selection && state.selection.kind === "roof-node") {
    props.innerHTML =
      "<h2>Intersection</h2><p class=\"pcd-note\">Drag the point to move it. Deleting it removes the beams that meet there.</p><button type=\"button\" class=\"btn btn-secondary\" data-action=\"delete\">Delete</button>";
    return;
  }
  if (state.selection && state.selection.kind === "gutter") {
    const path = gutterPath(project);
    const index = Number(state.selection.id) || 0;
    const a = path && path[index];
    const b = path && path[index + 1];
    const length = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
    props.innerHTML =
      "<h2>Gutter</h2><p class=\"pcd-note\">This piece is " +
      esc(formatLength(length)) +
      ". Add a break, then drag the new point to make the angle.</p><button type=\"button\" class=\"btn btn-quote\" data-action=\"add-gutter\">Add gutter break</button>";
    return;
  }
  if (state.selection && state.selection.kind === "gutter-point") {
    props.innerHTML =
      "<h2>Gutter break</h2><p class=\"pcd-note\">Drag this point to set the bend. Delete it to make the gutter straight through here again.</p><button type=\"button\" class=\"btn btn-secondary\" data-action=\"delete\">Delete</button>";
    return;
  }
  if (state.selection && state.selection.kind === "door") {
    const door = (project.doors || []).find((item) => item.id === state.selection.id);
    const wall = door && wallById(project, door.wallId);
    if (!door || !wall) {
      props.innerHTML = "<h2>Door</h2>";
      return;
    }
    props.innerHTML =
      "<h2>Door</h2><p class=\"pcd-note\">" +
      esc(wall.name) +
      " · " +
      esc(formatLength(door.widthIn)) +
      " wide, starting " +
      esc(formatLength(door.offsetIn)) +
      " from the left of the wall.</p><label>Width " +
      '<span data-door-size>' +
      measureHtml(door.widthIn) +
      "</span></label><p class=\"pcd-note\">Drag the door on the floor plan or the wall elevation.</p><button type=\"button\" class=\"btn btn-secondary\" data-action=\"delete\">Delete</button>";
    return;
  }
  if (state.selection && state.selection.kind === "wall") {
    const wall = wallById(project, state.selection.id);
    props.innerHTML = wall
      ? "<h2>" +
        esc(wall.name) +
        "</h2><p>" +
        esc(formatLength(wall.lengthIn)) +
        " · " +
        wall.verticalSections.length +
        " sections · " +
        wall.horizontalRows.length +
        " rows</p><button type=\"button\" class=\"btn btn-quote\" data-action=\"open-wall\">Edit elevation</button>"
      : "";
    return;
  }
  props.innerHTML =
    "<h2>Properties</h2><p class=\"pcd-note\">Select a wall section to set ClearView, or a roof beam after the grid is generated.</p><p class=\"pcd-note\">Layout tool only. Beam/post sizes require field verification and applicable engineering.</p>";
}

function ask(text, okLabel) {
  dialogText.textContent = text;
  dialogOk.textContent = okLabel || "Continue";
  dialog.hidden = false;
  return new Promise((resolve) => {
    const yes = () => finish(true);
    const no = () => finish(false);
    function finish(answer) {
      dialog.hidden = true;
      dialogOk.removeEventListener("click", yes);
      dialogCancel.removeEventListener("click", no);
      resolve(answer);
    }
    dialogOk.addEventListener("click", yes);
    dialogCancel.addEventListener("click", no);
  });
}

async function generateCurrentRoof() {
  if (!state.project) return;
  if (state.project.roof.manual) {
    const ok = await ask("Replace the roof drawing with a new grid? Manual beam edits on this roof will be cleared.", "Generate roof");
    if (!ok) return;
  }
  const next = generateRoof(state.project);
  next.roofType = next.roof.type;
  commit(next);
  setStatus("Roof generated. Panels: " + roofPanelCount(next) + ".");
}

function selectSection(wallId, sectionId, shift) {
  const wall = wallById(state.project, wallId);
  if (!wall) return;
  state.wallId = wallId;
  if (
    shift &&
    state.selection &&
    state.selection.wallId === wallId &&
    (state.selection.kind === "section" || state.selection.kind === "sections")
  ) {
    const anchorId = state.selection.anchorId || state.selection.id;
    const anchor = wall.verticalSections.findIndex((section) => section.id === anchorId);
    const index = wall.verticalSections.findIndex((section) => section.id === sectionId);
    if (anchor >= 0 && index >= 0) {
      const start = Math.min(anchor, index);
      const end = Math.max(anchor, index);
      state.selection = {
        kind: "sections",
        wallId,
        anchorId,
        ids: wall.verticalSections.slice(start, end + 1).map((section) => section.id),
      };
      refresh({ forcePanels: true });
      return;
    }
  }
  state.selection = { kind: "section", id: sectionId, wallId, anchorId: sectionId };
  refresh({ forcePanels: true });
}

sidebar.addEventListener("change", (event) => {
  if (!state.project) return;
  const target = event.target;
  const card = target.closest("[data-wall]");
  if (target.matches("[data-field]")) {
    const next = structuredClone(state.project);
    if (target.getAttribute("data-field") === "name") next.name = target.value.slice(0, 160);
    if (target.getAttribute("data-field") === "customer") next.customerName = target.value.slice(0, 160);
    commit(next);
    return;
  }
  if (target.closest("[data-height]")) {
    commit(setCageHeight(state.project, readMeasure(target.closest("[data-height]"))));
    return;
  }
  if (target.matches("[data-wall-count]")) {
    const count = Math.max(2, Math.min(16, Math.round(Number(target.value) || state.project.walls.length)));
    if (count === state.project.walls.length) return;
    commit(setWallCount(state.project, count));
    state.camera = null;
    setStatus("Wall count updated. The outline was rebuilt from the wall lengths.");
    refresh({ forcePanels: true });
    return;
  }
  if (card) {
    const wallId = card.getAttribute("data-wall");
    if (target.matches("[data-name]")) {
      const next = structuredClone(state.project);
      const wall = next.walls.find((item) => item.id === wallId);
      if (wall) wall.name = target.value.trim().slice(0, 80) || wall.name;
      commit(next);
      return;
    }
    if (target.matches("[data-vertical]")) {
      commit(setVerticalCount(state.project, wallId, Number(target.value)));
      setStatus("Vertical sections updated. ClearView on this wall was cleared.");
      return;
    }
    if (target.matches("[data-horizontal]")) {
      commit(setHorizontalCount(state.project, wallId, Number(target.value)));
      return;
    }
    const length = target.closest("[data-length]");
    if (length) {
      commit(setWallLength(state.project, wallId, readMeasure(length)));
      state.camera = null;
      refresh({ forcePanels: true });
      return;
    }
    const section = target.closest("[data-section]");
    if (section) {
      commit(setSectionWidth(state.project, wallId, section.getAttribute("data-section"), readMeasure(section)));
      return;
    }
    const row = target.closest("[data-row]");
    if (row) {
      commit(setRowHeight(state.project, wallId, row.getAttribute("data-row"), readMeasure(row)));
      return;
    }
  }
  const profileMeasure = target.closest("[data-profile-measure]");
  if (profileMeasure) {
    const key = profileMeasure.getAttribute("data-profile-measure");
    commit(applyRoofProfile(state.project, { [key]: readMeasure(profileMeasure) }));
    refresh({ forcePanels: true });
    return;
  }
  if (target.matches("[data-profile]")) {
    const key = target.getAttribute("data-profile");
    if (key === "customSlopes") {
      if (target.checked) {
        const profile = normalizeRoofProfile(state.project.roof && state.project.roof.profile, state.project.cageHeightIn);
        const range = roofAxisRange(state.project, profile.direction);
        const fitted = profileSpans(Math.max(0, range.max - range.min), Object.assign({}, profile, { leftSlopeIn: null, rightSlopeIn: null }));
        commit(applyRoofProfile(state.project, { leftSlopeIn: fitted.left, rightSlopeIn: fitted.right }));
      } else {
        commit(applyRoofProfile(state.project, { leftSlopeIn: null, rightSlopeIn: null }));
      }
      refresh({ forcePanels: true });
      return;
    }
    commit(applyRoofProfile(state.project, { [key]: target.value }));
    refresh({ forcePanels: true });
    return;
  }
  if (target.matches("[data-roof]")) {
    const key = target.getAttribute("data-roof");
    if (key === "columns") {
      commit(setRoofColumns(state.project, Number(target.value)));
      setStatus("Columns updated. Generate the roof to redraw it.");
      return;
    }
    if (key === "rows") {
      commit(setRoofRows(state.project, Number(target.value)));
      setStatus("Rows updated. Generate the roof to redraw it.");
      return;
    }
    const patch = {};
    if (key === "default") patch.defaultBeam = target.value;
    if (key === "perimeter") patch.perimeterBeam = target.value;
    commit(withRoofSettings(state.project, patch));
    return;
  }
  const column = target.closest("[data-column]");
  if (column) {
    commit(setColumnWidth(state.project, column.getAttribute("data-column"), readMeasure(column)));
    setStatus("Column width updated. Generate the roof to redraw it.");
    return;
  }
  const roofRow = target.closest("[data-roof-row]");
  if (roofRow) {
    commit(setRowDepth(state.project, roofRow.getAttribute("data-roof-row"), readMeasure(roofRow)));
    setStatus("Row width updated. Generate the roof to redraw it.");
  }
});

sidebar.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || !state.project) return;
  const action = button.getAttribute("data-action");
  const wallAction = button.getAttribute("data-wall-action");
  const card = button.closest("[data-wall]");
  const wallId = card ? card.getAttribute("data-wall") : "";
  if (wallAction === "add") {
    const wall = wallById(state.project, wallId);
    if (wall) commit(setVerticalCount(state.project, wallId, wall.verticalSections.length + 1));
    return;
  }
  if (wallAction === "remove") {
    const wall = wallById(state.project, wallId);
    if (wall && wall.verticalSections.length > 1) commit(setVerticalCount(state.project, wallId, wall.verticalSections.length - 1));
    return;
  }
  if (wallAction === "even") {
    commit(divideWallEvenly(state.project, wallId));
    return;
  }
  if (wallAction === "even-rows") {
    commit(divideRowsEvenly(state.project, wallId));
    return;
  }
  if (action === "save") {
    saveProject();
    return;
  }
  if (action === "new") {
    openSetup();
    return;
  }
  if (action === "add-gutter") {
    addGutterBreakHere();
    return;
  }
  if (action === "generate" || action === "reset-roof") {
    generateCurrentRoof();
    return;
  }
  if (action === "even-columns") {
    commit(setRoofColumns(state.project, state.project.roof.columns.length || 1));
    return;
  }
  if (action === "even-rows") {
    commit(setRoofRows(state.project, state.project.roof.rows.length || 1));
    return;
  }
  if (action === "add-column" || action === "add-row") addDivider(action);
});

async function addDivider(action) {
  if (!state.project) return;
  if (state.project.roof.manual) {
    const ok = await ask("Adding a divider rebuilds the roof grid. Manual beam edits on this roof will be cleared.", "Add divider");
    if (!ok) return;
  }
  const split = action === "add-column" ? insertColumnDivider(state.project) : insertRowDivider(state.project);
  commit(generateRoof(split));
  setStatus("Divider added. The grid was rebuilt.");
}

props.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || !state.project) return;
  const cv = button.getAttribute("data-cv");
    if (cv === "on" || cv === "off") {
    const wallId = props.dataset.wallId;
    const ids = (props.dataset.sectionIds || "").split(",").filter(Boolean);
    if (cv === "on" && props.dataset.groupId) return;
    if (cv === "off") {
      commit(clearClearView(state.project, wallId, ids));
      return;
    }
    const result = setClearView(state.project, wallId, ids, {
      headerBeamSize: "2x8",
      leftPostSize: "4x4",
      rightPostSize: "4x4",
      removeIntermediatePosts: true,
    });
    if (!result.ok) {
      setStatus(result.error);
      return;
    }
    commit(result.project);
    return;
  }
  if (button.getAttribute("data-action") === "delete") deleteSelection();
  if (button.getAttribute("data-action") === "add-gutter") addGutterBreakHere();
  if (button.getAttribute("data-action") === "split") splitSelection();
  if (button.getAttribute("data-action") === "open-wall" && state.selection && state.selection.kind === "wall") {
    state.wallId = state.selection.id;
    state.view = "walls";
    state.camera = null;
    state.selection = null;
    refresh({ forcePanels: true });
  }
});

props.addEventListener("change", (event) => {
  const target = event.target;
  if (!state.project) return;
  if (target.matches("[data-cv-posts]")) {
    const groupId = props.dataset.groupId;
    if (!groupId) return;
    commit(updateClearView(state.project, groupId, { removeIntermediatePosts: target.value !== "no" }));
    return;
  }
  if (target.matches("[data-size-key]")) {
    const key = target.getAttribute("data-size-key");
    if (target.value === "custom") {
      applySize(key, "custom");
      return;
    }
    applySize(key, target.value);
    return;
  }
  if (target.matches("[data-size-custom]")) {
    applySize(target.getAttribute("data-size-custom"), target.value.trim() || "custom");
  }
  const doorSize = target.closest("[data-door-size]");
  if (doorSize && state.selection && state.selection.kind === "door") {
    const result = setDoorWidth(state.project, state.selection.id, readMeasure(doorSize));
    if (result.ok) commit(result.project);
  }
});

function applySize(key, value) {
  if (state.selection && state.selection.kind === "roof-beam" && key === "beam") {
    const result = updateRoofBeam(state.project, state.selection.id, { beamSize: value });
    if (result.ok) commit(result.project);
    return;
  }
  const groupId = props.dataset.groupId;
  if (!groupId) return;
  const patch = {};
  if (key === "header") patch.headerBeamSize = value;
  if (key === "left") patch.leftPostSize = value;
  if (key === "right") patch.rightPostSize = value;
  commit(updateClearView(state.project, groupId, patch));
}

function deleteSelection() {
  if (!state.selection) return;
  if (state.selection.kind === "roof-beam") {
    const result = deleteRoofBeam(state.project, state.selection.id);
    if (!result.ok) return;
    state.selection = null;
    commit(result.project);
  }
  if (state.selection && state.selection.kind === "roof-node") {
    const result = deleteRoofNode(state.project, state.selection.id);
    if (!result.ok) return;
    state.selection = null;
    commit(result.project);
  }
  if (state.selection && state.selection.kind === "door") {
    const id = state.selection.id;
    state.selection = null;
    commit(deleteDoor(state.project, id));
  }
  if (state.selection && state.selection.kind === "gutter-point") {
    const id = state.selection.id;
    state.selection = null;
    commit(deleteGutterPoint(state.project, id));
  }
}

function addGutterBreakHere() {
  if (!state.project) return;
  const path = gutterPath(state.project);
  if (!path) {
    setStatus("The gutter runs along the house side.");
    return;
  }
  let segment = 0;
  let point = null;
  if (state.selection && state.selection.kind === "gutter") {
    segment = Number(state.selection.id) || 0;
    point = state.gutterClick;
  } else {
    let longest = -1;
    for (let index = 0; index < path.length - 1; index += 1) {
      const length = Math.hypot(path[index + 1].x - path[index].x, path[index + 1].y - path[index].y);
      if (length > longest) {
        longest = length;
        segment = index;
      }
    }
  }
  const result = addGutterBreak(state.project, segment, point);
  if (!result.ok) {
    setStatus(result.error);
    return;
  }
  state.selection = { kind: "gutter-point", id: result.pointId };
  state.gutterClick = null;
  if (state.view === "walls" || state.view === "client") {
    state.view = "floor";
    state.camera = null;
  }
  commit(result.project);
  setStatus("Drag the gutter break to set the angle.");
}

function addDoorToLayout() {
  if (!state.project || !state.project.walls.length) return;
  const wallId =
    (state.view === "walls" && state.wallId) ||
    (state.selection && state.selection.kind === "wall" && state.selection.id) ||
    state.wallId ||
    state.project.walls[0].id;
  const result = addDoor(state.project, wallId);
  if (!result.ok) {
    setStatus(result.error);
    return;
  }
  state.selection = { kind: "door", id: result.doorId };
  state.wallId = wallId;
  if (state.view === "roof" || state.view === "client") {
    state.view = "walls";
    state.camera = null;
  }
  commit(result.project);
  setStatus("Drag the door along the wall.");
}

function splitSelection() {
  if (!state.selection || state.selection.kind !== "roof-beam") return;
  const result = splitRoofBeam(state.project, state.selection.id);
  if (!result.ok) {
    setStatus(result.error);
    return;
  }
  state.selection = { kind: "roof-node", id: result.nodeId };
  commit(result.project);
}

toolbar.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || !state.project) return;
  const tool = button.getAttribute("data-tool");
  const action = button.getAttribute("data-action");
  if (tool) {
    state.tool = tool;
    state.beamStart = null;
    toolbar.querySelectorAll("[data-tool]").forEach((item) => item.classList.toggle("is-active", item === button));
    if (tool === "beam") {
      state.view = "roof";
      setStatus("Click the two ends of the new roof beam.");
      refresh({ forcePanels: true });
    }
    return;
  }
  if (action === "undo") undo();
  if (action === "redo") redo();
  if (action === "zoom-in") zoom(0.85);
  if (action === "zoom-out") zoom(1.15);
  if (action === "fit") fit();
  if (action === "auto") generateCurrentRoof();
  if (action === "add-door") addDoorToLayout();
  if (action === "add-gutter") addGutterBreakHere();
  if (action === "delete") deleteSelection();
  if (action === "split") splitSelection();
  if (action === "grid") {
    const next = structuredClone(state.project);
    next.showGrid = !next.showGrid;
    commit(next);
  }
  if (action === "snap") {
    const next = structuredClone(state.project);
    next.snap.enabled = !next.snap.enabled;
    commit(next);
  }
  if (action === "print") {
    state.view = "client";
    state.camera = null;
    refresh({ forcePanels: true });
    window.print();
  }
  if (action === "panel") {
    const panel = button.getAttribute("data-panel") === "props" ? props : sidebar;
    panel.classList.toggle("is-open");
  }
});

document.getElementById("pcdTabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (!button || !state.project) return;
  state.view = button.getAttribute("data-view");
  state.camera = null;
  state.beamStart = null;
  if (state.view === "walls" && !state.wallId && state.project.walls[0]) state.wallId = state.project.walls[0].id;
  refresh({ forcePanels: true });
});

document.getElementById("pcdWallSelect").addEventListener("change", (event) => {
  state.wallId = event.target.value;
  state.selection = null;
  state.camera = null;
  refresh({ forcePanels: true });
});

canvas.addEventListener("click", (event) => {
  if (state.view !== "client") return;
  const modeButton = event.target.closest("[data-client-mode]");
  if (modeButton) {
    state.clientMode = modeButton.getAttribute("data-client-mode") || "both";
    const root = canvas.querySelector(".pcd-client");
    if (root) {
      root.classList.remove("is-both", "is-3d", "is-2d");
      root.classList.add("is-" + state.clientMode);
    }
    canvas.querySelectorAll("[data-client-mode]").forEach((button) => {
      button.classList.toggle("is-active", button === modeButton);
    });
    if (clientView) clientView.resize();
    return;
  }
  const cameraButton = event.target.closest("[data-client-cam]");
  if (cameraButton && clientView) clientView.setCamera(cameraButton.getAttribute("data-client-cam"));
});

canvas.addEventListener("dblclick", (event) => {
  if (!state.project || state.view === "client" || state.view === "walls") return;
  const hit = event.target.closest("[data-kind='gutter']");
  if (!hit) return;
  state.selection = { kind: "gutter", id: hit.getAttribute("data-id") };
  state.gutterClick = snap(eventPoint(event));
  addGutterBreakHere();
});

function capturePointer(event) {
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch (error) {
    /* The drag still follows pointermove if the browser will not capture this event. */
  }
}

canvas.addEventListener("pointerdown", (event) => {
  if (!state.project || state.view === "client") return;
  const hit = event.target.closest("[data-kind]");
  const point = snap(eventPoint(event));
  if (state.tool === "beam" && state.view === "roof") {
    if (!state.beamStart) {
      state.beamStart = point;
      setStatus("Click the other end of the beam.");
      return;
    }
    const result = addRoofBeam(state.project, state.beamStart.x, state.beamStart.y, point.x, point.y);
    state.beamStart = null;
    if (!result.ok) {
      setStatus(result.error);
      return;
    }
    state.selection = { kind: "roof-beam", id: result.beamId };
    commit(result.project);
    return;
  }
  if (!hit) {
    state.selection = null;
    refresh({ forcePanels: true });
    return;
  }
  const kind = hit.getAttribute("data-kind");
  const id = hit.getAttribute("data-id");
  if (kind === "section") {
    selectSection(hit.getAttribute("data-wall"), id, event.shiftKey);
    return;
  }
  if (kind === "gutter") {
    state.selection = { kind: "gutter", id };
    state.gutterClick = point;
    refresh({ forcePanels: true });
    return;
  }
  if (kind === "gutter-point") {
    state.selection = { kind: "gutter-point", id };
    state.drag = { kind: "gutter-point", id, moved: false };
    canvas.classList.add("is-grabbing");
    capturePointer(event);
    refresh({ forcePanels: true });
    return;
  }
  if (kind === "door") {
    const door = (state.project.doors || []).find((item) => item.id === id);
    if (!door) return;
    const along = state.view === "walls" ? point.x : offsetAlongWall(state.project, door.wallId, point.x, point.y);
    state.selection = { kind: "door", id };
    state.wallId = door.wallId;
    state.drag = { kind: "door", id, grab: along - door.offsetIn, wallId: door.wallId, moved: false };
    canvas.classList.add("is-grabbing");
    capturePointer(event);
    refresh({ forcePanels: true });
    return;
  }
  if (kind === "wall") {
    state.selection = { kind: "wall", id };
    state.wallId = id;
    refresh({ forcePanels: true });
    return;
  }
  if (kind === "node") {
    state.selection = { kind: "node", id };
    state.drag = { kind: "node", index: Number(id), moved: false };
    capturePointer(event);
    return;
  }
  if (kind === "roof-node") {
    state.selection = { kind: "roof-node", id };
    state.drag = { kind: "roof-node", id, moved: false };
    capturePointer(event);
    refresh({ forcePanels: true });
    return;
  }
  if (kind === "roof-beam") {
    state.selection = { kind: "roof-beam", id };
    state.drag = { kind: "roof-beam", id, last: point, moved: false };
    capturePointer(event);
    refresh({ forcePanels: true });
  }
});

canvas.addEventListener("pointermove", (event) => {
  if (!state.drag || !state.project) return;
  const point = snap(eventPoint(event));
  if (state.drag.kind === "gutter-point") {
    const result = moveGutterPoint(state.project, state.drag.id, point.x, point.y);
    if (!result.ok) return;
    state.preview = result.project;
    state.drag.moved = true;
    renderCanvas();
    return;
  }
  if (state.drag.kind === "door") {
    const along = state.view === "walls" ? point.x : offsetAlongWall(state.project, state.drag.wallId, point.x, point.y);
    const result = moveDoor(state.project, state.drag.id, along - state.drag.grab);
    if (!result.ok) return;
    state.preview = result.project;
    state.drag.moved = true;
    renderCanvas();
    return;
  }
  if (state.drag.kind === "node") {
    const result = moveCorner(state.project, state.drag.index, point.x, point.y);
    if (!result.ok) return;
    state.preview = result.project;
    state.drag.moved = true;
    renderCanvas();
    return;
  }
  if (state.drag.kind === "roof-node") {
    const result = moveRoofNode(state.project, state.drag.id, point.x, point.y);
    if (!result.ok) return;
    const moved = result.project.roofNodes.find((node) => node.id === state.drag.id);
    let hint = null;
    let nearest = MERGE_EPSILON;
    if (moved) {
      result.project.roofNodes.forEach((node) => {
        if (node.id === moved.id) return;
        const distance = Math.hypot(node.x - moved.x, node.y - moved.y);
        if (distance < nearest) {
          nearest = distance;
          hint = node.id;
        }
      });
    }
    state.mergeTarget = hint;
    state.preview = result.project;
    state.drag.moved = true;
    renderCanvas();
    return;
  }
  if (state.drag.kind === "roof-beam") {
    const divided = moveDivider(state.project, state.drag.id, point.x, point.y);
    if (divided.grid) {
      if (!divided.ok) return;
      state.preview = divided.project;
      state.drag.moved = true;
      renderCanvas();
      return;
    }
    const dx = point.x - state.drag.last.x;
    const dy = point.y - state.drag.last.y;
    if (!dx && !dy) return;
    const result = moveRoofBeam(state.preview || state.project, state.drag.id, dx, dy);
    if (!result.ok) return;
    state.preview = result.project;
    state.drag.last = point;
    state.drag.moved = true;
    renderCanvas();
  }
});

canvas.addEventListener("pointerup", () => {
  canvas.classList.remove("is-grabbing");
  if (!state.drag) return;
  const drag = state.drag;
  const moved = drag.moved && state.preview;
  const preview = state.preview;
  state.drag = null;
  state.mergeTarget = null;
  if (moved && drag.kind === "roof-node") {
    const finished = finishRoofNodeMove(state.project, preview, drag.id);
    if (!finished.ok) {
      state.preview = null;
      setStatus("That point would cross the outline or open the cage. The move was put back.");
      refresh({ forcePanels: true });
      return;
    }
    state.selection = { kind: "roof-node", id: finished.nodeId };
    if (finished.merged) setStatus("Those points are now one corner. The collapsed section was removed.");
    commit(finished.project);
    return;
  }
  if (moved) commit(preview);
  else refresh({ forcePanels: true });
});

canvas.addEventListener(
  "wheel",
  (event) => {
    if (!state.project || state.view === "client") return;
    event.preventDefault();
    zoom(event.deltaY > 0 ? 1.12 : 0.9);
  },
  { passive: false }
);

document.addEventListener("keydown", (event) => {
  if (!state.project || event.target.closest("input, textarea, select")) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
  }
  if (event.key === "Delete" || event.key === "Backspace") deleteSelection();
  if (event.key === "Escape") {
    state.selection = null;
    state.beamStart = null;
    refresh({ forcePanels: true });
  }
});

function setupDefault(index, count) {
  if (count === 3) {
    return [
      { name: "LEFT WALL", lengthIn: 240, vertical: 4, horizontal: 2 },
      { name: "REAR WALL", lengthIn: 360, vertical: 5, horizontal: 2 },
      { name: "RIGHT WALL", lengthIn: 240, vertical: 4, horizontal: 2 },
    ][index];
  }
  return { name: "Wall " + (index + 1), lengthIn: 240, vertical: 4, horizontal: 2 };
}

function readSetupWalls() {
  return Array.from(document.querySelectorAll("#pcdWallCards [data-wall-card]")).map((card, index) => ({
    name: (card.querySelector("[data-name]") && card.querySelector("[data-name]").value.trim()) || "Wall " + (index + 1),
    lengthIn: readMeasure(card),
    vertical: Math.max(1, Math.round(Number(card.querySelector("[data-vertical]").value) || 1)),
    horizontal: Math.max(1, Math.round(Number(card.querySelector("[data-horizontal]").value) || 1)),
  }));
}

function updateHousePreview() {
  const note = document.getElementById("pcdHouseNote");
  const warn = document.getElementById("pcdSideWarn");
  if (!note || !warn) return;
  const walls = readSetupWalls();
  if (walls.length < 2 || walls.some((wall) => wall.lengthIn < 24)) {
    note.textContent = "House / gutter is calculated from the screened walls.";
    warn.textContent = "";
    return;
  }
  const preview = createProject({
    cageHeightIn: 120,
    columns: 1,
    rows: 1,
    walls: walls.map((wall) => ({
      name: wall.name,
      lengthIn: wall.lengthIn,
      verticalCount: 1,
      horizontalCount: 1,
    })),
  });
  const foot = roofFootprint(preview);
  note.textContent =
    "House / gutter: " +
    formatLength(foot.houseLengthIn) +
    " · Roof footprint " +
    formatLength(foot.lengthIn) +
    " × " +
    formatLength(foot.depthIn) +
    " · Plan area " +
    foot.areaSqFt +
    " sq ft";
  warn.textContent = foot.warning || "";
}

function renderSetupWalls() {
  const host = document.getElementById("pcdWallCards");
  const countInput = document.getElementById("pcdWallCount");
  if (!host || !countInput) return;
  let count = Math.round(Number(countInput.value) || 3);
  count = Math.max(2, Math.min(16, count));
  const current = readSetupWalls();
  host.innerHTML = Array.from({ length: count }, (_, index) => {
    const spec = current[index] || setupDefault(index, count);
    const title = count === 3 && !current[index] ? spec.name : spec.name || setupDefault(index, count).name;
    return (
      '<fieldset class="pcd-wall-card" data-wall-card><legend>' +
      esc(title) +
      '</legend><label>Name <input data-name type="text" maxlength="80" value="' +
      esc(title) +
      '"></label><label>Length ' +
      measureHtml(spec.lengthIn) +
      '</label><label>Vertical sections <input data-vertical type="number" min="1" max="24" value="' +
      spec.vertical +
      '"></label><label>Horizontal rows <input data-horizontal type="number" min="1" max="12" value="' +
      spec.horizontal +
      '"></label></fieldset>'
    );
  }).join("");
  updateHousePreview();
}

function openSetup() {
  setup.hidden = false;
  renderSetupWalls();
}

document.getElementById("pcdWallCount").addEventListener("change", renderSetupWalls);
document.getElementById("pcdSetupForm").addEventListener("input", (event) => {
  if (event.target.closest("#pcdWallCards")) updateHousePreview();
});
document.getElementById("pcdSetupCancel").addEventListener("click", () => {
  if (state.project) setup.hidden = true;
});
document.getElementById("pcdSetupForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const walls = readSetupWalls();
  const heightIn = toInches(document.getElementById("pcdHeightFt").value, document.getElementById("pcdHeightIn").value);
  if (walls.length < 2 || walls.some((wall) => wall.lengthIn < 24) || heightIn < 24) {
    document.getElementById("pcdSetupStatus").textContent = "Each screened wall needs a length of at least 2 feet, and the cage needs a height.";
    return;
  }
  const created = createProject({
    name: document.getElementById("pcdProjectName").value.trim() || "Pool cage",
    customerName: document.getElementById("pcdCustomer").value.trim(),
    notes: document.getElementById("pcdNotes").value.trim(),
    cageHeightIn: heightIn,
    walls: walls.map((wall) => ({
      name: wall.name,
      lengthIn: wall.lengthIn,
      verticalCount: wall.vertical,
      horizontalCount: wall.horizontal,
    })),
    columns: Number(document.getElementById("pcdRoofCols").value) || 5,
    rows: Number(document.getElementById("pcdRoofRows").value) || 4,
  });
  const project = generateRoof(created);
  project.roofType = project.roof.type;
  state.undo = [];
  state.redo = [];
  state.project = null;
  state.view = "floor";
  state.selection = null;
  state.camera = null;
  state.wallId = project.walls[0] ? project.walls[0].id : "";
  setup.hidden = true;
  commit(project);
  setStatus("Layout created. Open Walls to choose ClearView, then generate the roof if you change the grid.");
});

async function saveProject() {
  const saveStatus = sidebar.querySelector("[data-save-status]");
  if (saveStatus) saveStatus.textContent = "Saving…";
  state.project.roofType = state.project.roof.type;
  const creating = !state.project.id;
  try {
    const response = await fetch(API + (creating ? "" : "?id=" + encodeURIComponent(state.project.id)), {
      method: creating ? "POST" : "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.project),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      if (saveStatus) saveStatus.textContent = data.error || "Could not save the project.";
      return;
    }
    state.project.id = data.project.id;
    state.project.createdAt = data.project.createdAt;
    state.project.updatedAt = data.project.updatedAt;
    if (saveStatus) saveStatus.textContent = "Saved " + formatStamp(data.project.updatedAt);
    const url = new URL(window.location.href);
    url.searchParams.set("id", data.project.id);
    window.history.replaceState({}, "", url.pathname + url.search);
  } catch (error) {
    if (saveStatus) saveStatus.textContent = "Network error. Start the site with the API server to save.";
  }
}

function formatStamp(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

async function loadProject(id) {
  const response = await fetch(API + "?id=" + encodeURIComponent(id), { credentials: "same-origin" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    setStatus(data.error || "That project could not be opened.");
    openSetup();
    return;
  }
  state.project = migrateProject(data.project);
  if (state.project.roof) state.project.roofType = state.project.roof.type;
  state.wallId = state.project.walls[0] ? state.project.walls[0].id : "";
  state.camera = null;
  state.undo = [];
  state.redo = [];
  setup.hidden = true;
  setStatus("Project opened.");
  refresh({ forcePanels: true });
}

function revealDesigner(username) {
  state.username = username || "";
  if (userLabel) userLabel.textContent = username ? "Signed in as " + username : "Local preview";
  if (boot) boot.hidden = true;
  app.hidden = false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("id") && username) loadProject(params.get("id"));
  else openSetup();
}

async function bootSession() {
  const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (local) {
    revealDesigner("");
    setStatus("Local preview. This server has no sign-in API, so saving needs the API server.");
  }
  try {
    const response = await fetch("/api/admin/session", {
      credentials: "same-origin",
      signal: AbortSignal.timeout(2500),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok && data.authenticated) {
      revealDesigner(data.username);
      return;
    }
  } catch (error) {
    /* The static local server does not run the admin API. */
  }
  if (!local) window.location.replace(PANEL);
}

document.getElementById("pcdLogout").addEventListener("click", async () => {
  try {
    await fetch("/api/admin/session", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
  } catch (error) {
    /* ignore */
  }
  window.location.replace(PANEL);
});

bootSession();
