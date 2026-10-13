/**
 * Customer 3D view of the pool cage. Built from the same layout the 2D sheet uses.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { memberProfile } from "./units.js?v=19";
import { doorJambs, elevationModel, gutterPath, pointAlongPath, wallPath } from "./model.js?v=22";
import { getRoofNodeWorldPosition, roof2DToWorld3D, roofStructure, wallTopHeight } from "./roof-topology.js?v=20";

const DOOR_OPENING_IN = 80;

function doorOpeningIn(height) {
  const wall = Number(height) || 0;
  if (wall <= 54) return Math.max(36, wall - 6);
  return Math.min(DOOR_OPENING_IN, wall - 8);
}

function addBox(group, material, size, position, rotY) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  mesh.position.set(position.x, position.y, position.z);
  if (rotY) mesh.rotation.y = rotY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function member(group, material, a, b, elevation, height, depth) {
  const start = roof2DToWorld3D(a, elevation);
  const end = roof2DToWorld3D(b, elevation);
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.4) return;
  addBox(
    group,
    material,
    { x: length, y: height, z: depth },
    { x: (start.x + end.x) / 2, y: elevation, z: (start.z + end.z) / 2 },
    -Math.atan2(dz, dx)
  );
}

function beam3D(group, material, a, b, width, depth) {
  const start = new THREE.Vector3(a.x, a.y, a.z);
  const end = new THREE.Vector3(b.x, b.y, b.z);
  const length = start.distanceTo(end);
  if (length < 0.4) return;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, depth || width, width), material);
  const direction = end.clone().sub(start).normalize();
  const up = Math.abs(direction.y) > 0.98 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const zAxis = new THREE.Vector3().crossVectors(direction, up).normalize();
  const yAxis = new THREE.Vector3().crossVectors(zAxis, direction).normalize();
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(direction, yAxis, zAxis));
  mesh.position.copy(start).lerp(end, 0.5);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

function slopedQuad(group, material, a, b, yA0, yB0, yA1, yB1) {
  const start = roof2DToWorld3D(a, 0);
  const end = roof2DToWorld3D(b, 0);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([start.x, yA0, start.z, end.x, yB0, end.z, end.x, yB1, end.z, start.x, yA1, start.z], 3)
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  group.add(mesh);
}

function planCenter(panels) {
  let x = 0;
  let y = 0;
  let count = 0;
  panels.forEach((panel) => {
    panel.forEach((point) => {
      x += point.x;
      y += point.y;
      count += 1;
    });
  });
  if (!count) return { x: 0, y: 0 };
  return { x: x / count, y: y / count };
}

function inwardPlan(a, b, center) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let nx = dy / len;
  let ny = -dx / len;
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  if ((center.x - midX) * nx + (center.y - midY) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: nx, y: ny };
}

function cutIntervals(start, end, blocks) {
  let spans = [[start, end]];
  blocks.forEach((block) => {
    const next = [];
    spans.forEach((span) => {
      if (block.end <= span[0] || block.start >= span[1]) next.push(span);
      else {
        if (block.start > span[0]) next.push([span[0], block.start]);
        if (block.end < span[1]) next.push([block.end, span[1]]);
      }
    });
    spans = next;
  });
  return spans.filter((span) => span[1] - span[0] > 0.5);
}

function screenPanel(group, material, a, b, y0, y1) {
  const start = roof2DToWorld3D(a, 0);
  const end = roof2DToWorld3D(b, 0);
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  const panelHeight = y1 - y0;
  if (length < 1 || panelHeight < 1) return;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(length, panelHeight), material);
  mesh.position.set((start.x + end.x) / 2, y0 + panelHeight / 2, (start.z + end.z) / 2);
  mesh.rotation.y = -Math.atan2(dz, dx);
  mesh.receiveShadow = true;
  group.add(mesh);
}

function buildCage(project) {
  const group = new THREE.Group();
  const height = project.cageHeightIn || 120;
  const structure = roofStructure(project);
  const center = planCenter(structure.panels);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xd5d8dc, metalness: 0.55, roughness: 0.38 });
  const postMat = new THREE.MeshStandardMaterial({ color: 0xc5c9ce, metalness: 0.5, roughness: 0.42 });
  const heavyMat = new THREE.MeshStandardMaterial({ color: 0xb7bcc2, metalness: 0.45, roughness: 0.4 });
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0xb7c3c8,
    transparent: true,
    opacity: 0.22,
    roughness: 0.85,
    metalness: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const clearMat = new THREE.MeshStandardMaterial({
    color: 0xd5e4ea,
    transparent: true,
    opacity: 0.1,
    roughness: 0.2,
    metalness: 0.05,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.55, metalness: 0.05 });
  const gutterMat = new THREE.MeshStandardMaterial({ color: 0x8d98a3, metalness: 0.45, roughness: 0.4 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0xe7e2da, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  const posted = new Map();
  (project.walls || []).forEach((wall) => {
    const path = wallPath(project, wall);
    if (path.length < 2) return;
    const model = elevationModel(project, wall.id);
    if (!model) return;
    const at = (distance) => pointAlongPath(path, distance);
    const wallTop = wallTopHeight(project);
    for (let index = 1; index < path.length; index += 1) {
      member(group, frameMat, path[index - 1], path[index], 0.5, 1, 2);
      member(group, frameMat, path[index - 1], path[index], wallTop - 1, 2, 2);
    }
    const doors = (project.doors || []).filter((door) => door.wallId === wall.id);
    const head = doorOpeningIn(model.height || height);
    const rows = wall.horizontalRows && wall.horizontalRows.length ? wall.horizontalRows : [{ heightIn: height }];
    (model.openings || []).forEach((opening) => {
      const length = opening.end - opening.start;
      if (length < 1) return;
      const origin = at(opening.start);
      const finish = at(opening.end);
      const place = (local) => at(opening.start + local);
      const doorCuts = doors
        .map((door) => {
          const cutStart = Math.max(opening.start, door.offsetIn) - opening.start;
          const cutEnd = Math.min(opening.end, door.offsetIn + (door.widthIn || 36)) - opening.start;
          if (cutEnd - cutStart < 1) return null;
          return { start: cutStart, end: cutEnd };
        })
        .filter(Boolean);
      if (opening.type === "clearview" && opening.group) {
        const profile = memberProfile(opening.group.headerBeamSize || "2x8");
        const headerY = wallTop - profile.depth / 2;
        const start = roof2DToWorld3D(origin, headerY);
        const end = roof2DToWorld3D(finish, headerY);
        beam3D(group, heavyMat, start, end, profile.width, profile.depth);
        cutIntervals(0, length, doorCuts).forEach((span) => {
          screenPanel(group, clearMat, place(span[0]), place(span[1]), 0, wallTop - profile.depth);
        });
        return;
      }
      model.rails.forEach((rail) => {
        if (rail >= wallTop - 1) return;
        const blocks = rail < head - 0.5 ? doorCuts : [];
        cutIntervals(0, length, blocks).forEach((span) => {
          member(group, frameMat, place(span[0]), place(span[1]), rail, 1.5, 2);
        });
      });
      let rowBottom = 0;
      rows.forEach((row) => {
        const rowTop = Math.min(rowBottom + row.heightIn, wallTop);
        if (rowTop <= rowBottom + 0.5) return;
        const blocks = rowTop <= head + 0.5 ? doorCuts : rowBottom >= head - 0.5 ? [] : doorCuts;
        if (rowBottom >= head - 0.5) {
          screenPanel(group, screenMat, origin, finish, rowBottom, rowTop);
        } else if (rowTop <= head + 0.5) {
          cutIntervals(0, length, blocks).forEach((span) => {
            screenPanel(group, screenMat, place(span[0]), place(span[1]), rowBottom, rowTop);
          });
        } else {
          cutIntervals(0, length, doorCuts).forEach((span) => {
            screenPanel(group, screenMat, place(span[0]), place(span[1]), rowBottom, head);
          });
          screenPanel(group, screenMat, origin, finish, head, rowTop);
        }
        rowBottom = rowTop;
      });
    });
    doors.forEach((door) => {
      const start = at(door.offsetIn);
      const end = at(door.offsetIn + (door.widthIn || 36));
      const mid = at(door.offsetIn + (door.widthIn || 36) / 2);
      const normal = inwardPlan(start, end, center);
      const world = roof2DToWorld3D({ x: mid.x + normal.x * 1.2, y: mid.y + normal.y * 1.2 }, head / 2);
      const delta = roof2DToWorld3D(end, 0);
      const origin = roof2DToWorld3D(start, 0);
      addBox(
        group,
        doorMat,
        { x: Math.max(8, (door.widthIn || 36) - 3), y: Math.max(12, head - 3), z: 1.2 },
        world,
        -Math.atan2(delta.z - origin.z, delta.x - origin.x)
      );
      member(group, frameMat, start, end, head, 2, 2);
    });
    model.posts.concat(doorJambs(model.length, doors, model.posts)).forEach((post) => {
      const point = at(post.at);
      const key = Math.round(point.x / 3) * 3 + ":" + Math.round(point.y / 3) * 3;
      const profile = memberProfile(post.size || "2x2");
      const area = profile.width * profile.depth;
      const previous = posted.get(key);
      if (previous && previous.area >= area) return;
      posted.set(key, { point, post, profile, area, head, doors });
    });
  });
  const wallTop = wallTopHeight(project);
  posted.forEach((item) => {
    const world = roof2DToWorld3D(item.point, 0);
    const inside = item.doors.some((door) => item.post.at > door.offsetIn + 1 && item.post.at < door.offsetIn + (door.widthIn || 36) - 1);
    const y0 = inside ? item.head : 0;
    const y1 = Math.max(y0 + 4, wallTop);
    addBox(
      group,
      item.post.role === "clearview" ? heavyMat : postMat,
      { x: item.profile.width, y: y1 - y0, z: item.profile.depth },
      { x: world.x, y: (y0 + y1) / 2, z: world.z }
    );
  });

  const gutter = gutterPath(project);
  if (gutter) {
    for (let index = 1; index < gutter.length; index += 1) {
      beam3D(group, gutterMat, roof2DToWorld3D(gutter[index - 1], wallTop), roof2DToWorld3D(gutter[index], wallTop), 3.2);
    }
  }

  (project.roofBeams || []).forEach((beam) => {
    const a = (project.roofNodes || []).find((node) => node.id === beam.startNodeId);
    const b = (project.roofNodes || []).find((node) => node.id === beam.endNodeId);
    if (!a || !b) return;
    const vertical = Math.abs(a.y - b.y) > Math.abs(a.x - b.x) + 1;
    let size = beam.beamSize || "2x2";
    if (beam.category === "jack") size = "2x2";
    else if (beam.category === "perimeter") size = beam.beamSize || (project.roof && project.roof.perimeterBeam) || "2x4";
    else if (vertical) size = (project.roof && project.roof.perimeterBeam) || "2x4";
    const section = memberProfile(size);
    const start = getRoofNodeWorldPosition(a, project);
    const end = getRoofNodeWorldPosition(b, project);
    beam3D(group, frameMat, start, end, section.width, section.depth);
  });

  const roofSkin = new THREE.MeshStandardMaterial({
    color: 0xd5dde2,
    transparent: true,
    opacity: 0.16,
    roughness: 0.8,
    metalness: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  structure.panels.forEach((panel) => {
    if (panel.length < 3) return;
    const world = panel.map((point) => getRoofNodeWorldPosition(point, project));
    const triangles = [];
    if (world.length === 4) {
      const heights = world.map((point) => point.y);
      const twisted = Math.abs(heights[0] + heights[2] - heights[1] - heights[3]) > 0.5;
      if (twisted) {
        const high = heights.indexOf(Math.max.apply(null, heights));
        const opposite = (high + 2) % 4;
        [0, 1, 2, 3]
          .filter((index) => index !== high && index !== opposite)
          .forEach((index) => triangles.push([world[high], world[opposite], world[index]]));
      } else {
        triangles.push([world[0], world[1], world[2]], [world[0], world[2], world[3]]);
      }
    } else {
      for (let index = 1; index < world.length - 1; index += 1) triangles.push([world[0], world[index], world[index + 1]]);
    }
    const positions = [];
    triangles.forEach((triangle) => {
      triangle.forEach((point) => positions.push(point.x, point.y, point.z));
    });
    const skin = new THREE.BufferGeometry();
    skin.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    skin.computeVertexNormals();
    const mesh = new THREE.Mesh(skin, roofSkin);
    mesh.receiveShadow = true;
    group.add(mesh);
  });

  structure.panels.forEach((panel) => {
    if (panel.length < 3) return;
    const shape = new THREE.Shape();
    panel.forEach((point, index) => {
      if (index === 0) shape.moveTo(point.x, point.y);
      else shape.lineTo(point.x, point.y);
    });
    const deck = new THREE.Mesh(new THREE.ShapeGeometry(shape), deckMat);
    deck.rotation.x = -Math.PI / 2;
    deck.position.y = 0.15;
    deck.receiveShadow = true;
    group.add(deck);
  });

  return group;
}

function boundsOf(object) {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) box.set(new THREE.Vector3(-20, 0, -20), new THREE.Vector3(20, 40, 20));
  return box;
}

function placeCamera(camera, controls, box, preset) {
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const dist = Math.max(size.x, size.y, size.z, 80) * 1.2;
  const eye = {
    "3d": new THREE.Vector3(center.x + dist * 0.9, center.y + dist * 0.55, center.z + dist * 0.9),
    front: new THREE.Vector3(center.x, center.y + dist * 0.22, center.z + dist),
    rear: new THREE.Vector3(center.x, center.y + dist * 0.22, center.z - dist),
    left: new THREE.Vector3(center.x - dist, center.y + dist * 0.22, center.z),
    right: new THREE.Vector3(center.x + dist, center.y + dist * 0.22, center.z),
    top: new THREE.Vector3(center.x, center.y + dist, center.z + dist * 0.02),
    fit: new THREE.Vector3(center.x + dist * 0.9, center.y + dist * 0.55, center.z + dist * 0.9),
    reset: new THREE.Vector3(center.x + dist * 0.9, center.y + dist * 0.55, center.z + dist * 0.9),
  };
  const next = eye[preset] || eye["3d"];
  camera.position.copy(next);
  camera.near = 1;
  camera.far = dist * 20;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
}

export function mountClient3D(container, project) {
  if (!container) return null;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0xf6f5f3, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = "pcd-client-3d__canvas";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf6f5f3);
  const camera = new THREE.PerspectiveCamera(38, 1, 1, 20000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.screenSpacePanning = true;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

  scene.add(new THREE.AmbientLight(0xffffff, 0.72));
  const hemi = new THREE.HemisphereLight(0xf7f7f4, 0xc8c2b8, 0.45);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.05);
  sun.position.set(280, 520, 180);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 1800;
  sun.shadow.camera.left = -700;
  sun.shadow.camera.right = 700;
  sun.shadow.camera.top = 700;
  sun.shadow.camera.bottom = -700;
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(2400, 48), new THREE.MeshStandardMaterial({ color: 0xeeeae4, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.4;
  ground.receiveShadow = true;
  scene.add(ground);

  const cage = buildCage(project);
  scene.add(cage);
  const box = boundsOf(cage);
  placeCamera(camera, controls, box, "3d");

  let frame = 0;
  function resize() {
    const width = container.clientWidth || 640;
    const height = container.clientHeight || 480;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }
  function tick() {
    frame = requestAnimationFrame(tick);
    if (!container.clientWidth) return;
    controls.update();
    renderer.render(scene, camera);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  tick();

  return {
    resize,
    setCamera(preset) {
      placeCamera(camera, controls, box, preset);
    },
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        const materials = object.material ? [].concat(object.material) : [];
        materials.forEach((material) => {
          if (material && material.dispose) material.dispose();
        });
      });
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    },
  };
}
