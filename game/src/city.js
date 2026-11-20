// Sunset Bay, the city: a 9x9 street grid with five districts, procedural
// buildings with lit windows, palms, streetlights, neon signs, a marina pier
// with a ferris wheel, a port yard and a park — all built from geometry and
// canvas textures at load time. Returns colliders and helper lookups.
import * as THREE from 'three';
import { WORLD, STREETS, PLACES, districtAt } from './config.js';
import { mulberry32, makeWindowTexture, makeSignTexture, makeSkyTexture, pick } from './utils.js';

const SIGN_TEXTS = [
  ['SUNSET BAY', '#ff5ea8'], ['MARINA', '#4de8ff'], ['DINER 24', '#ffd23f'],
  ['GARAGE', '#ff7a3c'], ['HOTEL PALM', '#ff5ea8'], ['NEON', '#4dff88'],
  ['PORT DELMAR', '#4de8ff'], ['CLUB CORAL', '#ff5ea8'], ['TACOS', '#ffd23f'],
  ['CINEMA', '#b78cff'], ['PIER', '#4de8ff'], ['SUNSET FM', '#ff7a3c'],
];

const CONTAINER_COLORS = [0xc23b3b, 0x3b6fc2, 0x3bc25a, 0xd8a03b, 0x7a3bc2, 0xe07a3b];

export function buildCity(scene) {
  const rng = mulberry32(20261120);
  const colliders = [];
  const texCache = new Map();
  const matCache = new Map();
  const parkedSpots = [];
  // Buildings are recorded first, then flushed as one InstancedMesh per
  // window-texture variant: hundreds of buildings, only ~25 draw calls.
  const buildingRecords = [];
  const roofRecords = [];

  function windowMaterial(base, h, w) {
    const floors = Math.max(2, Math.round(h / 9));
    const cols = Math.max(2, Math.round(w / 7));
    const key = base + '-' + floors + '-' + cols;
    if (!matCache.has(key)) {
      if (!texCache.has(key)) {
        const tex = makeWindowTexture(base, floors, cols);
        // Tile the facade so windows stay window-sized instead of stretching
        // across the whole face (the grid is sized to the building, so a
        // fixed 3x3 repeat lands windows at roughly 2.3 x 3 units).
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(3, 3);
        texCache.set(key, tex);
      }
      matCache.set(key, new THREE.MeshLambertMaterial({ map: texCache.get(key) }));
    }
    return { key, material: matCache.get(key) };
  }

  // --- Sky, sun and fog ---
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 16),
    new THREE.MeshBasicMaterial({ map: makeSkyTexture(), side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(55, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false }),
  );
  sun.position.set(-620, 120, 320);
  sun.lookAt(0, 40, 0);
  scene.add(sun);
  scene.fog = new THREE.Fog(0xe8825e, 150, 620);

  // --- Ground, beach, ocean, boardwalk ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 760),
    new THREE.MeshLambertMaterial({ color: 0x596066 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 20);
  scene.add(ground);
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 320),
    new THREE.MeshLambertMaterial({ color: 0x1a5f7f }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, -0.4, 470);
  scene.add(ocean);
  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 26),
    new THREE.MeshLambertMaterial({ color: 0xd9b382 }),
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(0, 0.01, 312);
  scene.add(beach);
  const boardwalk = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 14),
    new THREE.MeshLambertMaterial({ color: 0x8a6a4a }),
  );
  boardwalk.rotation.x = -Math.PI / 2;
  boardwalk.position.set(0, 0.03, 292);
  scene.add(boardwalk);

  // --- Roads (dark strips) and centre dashes ---
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x3a3d46 });
  for (const s of STREETS) {
    const ns = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.ROAD_WIDTH, 620), roadMat);
    ns.rotation.x = -Math.PI / 2;
    ns.position.set(s, 0.01, 0);
    scene.add(ns);
    const ew = new THREE.Mesh(new THREE.PlaneGeometry(620, WORLD.ROAD_WIDTH), roadMat);
    ew.rotation.x = -Math.PI / 2;
    ew.position.set(0, 0.01, s);
    scene.add(ew);
  }
  const dashGeo = new THREE.BoxGeometry(0.35, 0.02, 3.2);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c25a });
  const dashPositions = [];
  for (const s of STREETS) {
    for (let p = -290; p <= 290; p += 9) {
      const nearCross = STREETS.some((t) => Math.abs(p - t) < 9);
      if (!nearCross) dashPositions.push([s, p, 0], [p, s, 1]);
    }
  }
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashPositions.length);
  {
    const dummy = new THREE.Object3D();
    dashPositions.forEach(([x, z, rot], i) => {
      dummy.position.set(x, 0.03, z);
      dummy.rotation.set(0, rot ? Math.PI / 2 : 0, 0);
      dummy.updateMatrix();
      dashes.setMatrixAt(i, dummy.matrix);
    });
  }
  scene.add(dashes);

  // --- Blocks: sidewalks, buildings, park, port yard, garage lot ---
  const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0x8b8f99 });
  const parkMat = new THREE.MeshLambertMaterial({ color: 0x3f7a44 });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x2c2f36 });
  const signGeo = new THREE.PlaneGeometry(16, 4);
  let signIndex = 0;

  function addBuilding(cx, cz, w, d, h, palette) {
    const base = palette[Math.floor(rng() * palette.length)];
    const { key } = windowMaterial(base, h, w);
    buildingRecords.push({ cx, cz, w, d, h, key });
    roofRecords.push({ x: cx, y: h + 0.15, z: cz, sx: w + 0.4, sy: 0.3, sz: d + 0.2 });
    colliders.push({ minX: cx - w / 2 - 0.3, maxX: cx + w / 2 + 0.3, minZ: cz - d / 2 - 0.3, maxZ: cz + d / 2 + 0.3 });
    if (rng() < 0.35) {
      roofRecords.push({ x: cx + w * 0.2, y: h + 0.8, z: cz, sx: 3, sy: 1.6, sz: 2.4 });
    }
    // Neon sign on some taller buildings, facing the nearest street.
    if (h >= 14 && signIndex < SIGN_TEXTS.length && rng() < 0.55) {
      const [text, color] = SIGN_TEXTS[signIndex++];
      const sign = new THREE.Mesh(signGeo, new THREE.MeshBasicMaterial({
        map: makeSignTexture(text, color), transparent: true,
      }));
      const faceSouth = cz >= 0;
      sign.position.set(cx, Math.min(h - 3, 16), cz + (faceSouth ? d / 2 + 0.15 : -d / 2 - 0.15));
      if (!faceSouth) sign.rotation.y = Math.PI;
      scene.add(sign);
    }
  }

  // Special blocks, keyed by "i,j" block indices between streets.
  const PARK = '3,1';        // x -60..0, z -180..-120
  const PORT_YARD = new Set(['7,3', '7,4']); // x 180..240, z -60..60
  const GARAGE_LOT = '0,6';  // x -240..-180, z 120..180
  const PIER_LOT = '5,7';    // x 60..120, z 240..300 (ferris wheel)

  for (let i = 0; i < STREETS.length - 1; i++) {
    for (let j = 0; j < STREETS.length - 1; j++) {
      const x0 = STREETS[i] + WORLD.BLOCK_INSET;
      const x1 = STREETS[i + 1] - WORLD.BLOCK_INSET;
      const z0 = STREETS[j] + WORLD.BLOCK_INSET;
      const z1 = STREETS[j + 1] - WORLD.BLOCK_INSET;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const key = i + ',' + j;
      const district = districtAt(cx, cz);

      if (key === PARK) {
        const park = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), parkMat);
        park.rotation.x = -Math.PI / 2;
        park.position.set(cx, 0.02, cz);
        scene.add(park);
        const pond = new THREE.Mesh(new THREE.CircleGeometry(7, 20),
          new THREE.MeshLambertMaterial({ color: 0x2a7a9a }));
        pond.rotation.x = -Math.PI / 2;
        pond.position.set(cx - 8, 0.04, cz + 6);
        scene.add(pond);
        continue;
      }
      if (PORT_YARD.has(key)) {
        const yard = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0),
          new THREE.MeshLambertMaterial({ color: 0x7a7d84 }));
        yard.rotation.x = -Math.PI / 2;
        yard.position.set(cx, 0.02, cz);
        scene.add(yard);
        for (let k = 0; k < 6; k++) {
          const cw = 10 + rng() * 4, cd = 4, ch = 3 + rng() * 3;
          const px = x0 + 6 + (k % 3) * 14, pz = z0 + 8 + Math.floor(k / 3) * 18;
          const box = new THREE.Mesh(new THREE.BoxGeometry(cw, ch, cd),
            new THREE.MeshLambertMaterial({ color: pick(CONTAINER_COLORS) }));
          box.position.set(px, ch / 2 + 0.02, pz);
          scene.add(box);
          colliders.push({ minX: px - cw / 2, maxX: px + cw / 2, minZ: pz - cd / 2, maxZ: pz + cd / 2 });
          if (rng() < 0.5) {
            const top = new THREE.Mesh(new THREE.BoxGeometry(cw * 0.9, 3, cd * 0.9),
              new THREE.MeshLambertMaterial({ color: pick(CONTAINER_COLORS) }));
            top.position.set(px, ch + 1.5, pz);
            scene.add(top);
          }
        }
        continue;
      }
      if (key === GARAGE_LOT) {
        const lot = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), sidewalkMat);
        lot.rotation.x = -Math.PI / 2;
        lot.position.set(cx, 0.02, cz);
        scene.add(lot);
        addBuilding(cx, z0 + 9, 34, 14, 9, [0x8a5a3c, 0x7a4a32]);
        const sign = new THREE.Mesh(signGeo, new THREE.MeshBasicMaterial({
          map: makeSignTexture("MARA'S GARAGE", '#ff7a3c'), transparent: true,
        }));
        sign.position.set(cx, 8, z0 + 16.4);
        scene.add(sign);
        continue;
      }
      if (key === PIER_LOT) {
        const lot = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0),
          new THREE.MeshLambertMaterial({ color: 0x8a6a4a }));
        lot.rotation.x = -Math.PI / 2;
        lot.position.set(cx, 0.02, cz);
        scene.add(lot);
        continue;
      }

      const slab = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), sidewalkMat);
      slab.rotation.x = -Math.PI / 2;
      slab.position.set(cx, 0.02, cz);
      scene.add(slab);

      const lots = district.lots;
      if (lots === 1) {
        const w = 30 + rng() * 10, d = 30 + rng() * 10;
        const h = district.minH + rng() * (district.maxH - district.minH);
        addBuilding(cx, cz, w, d, h, district.palette);
      } else {
        const n = lots === 2 ? 2 : 4;
        for (let k = 0; k < n; k++) {
          if (rng() < 0.2) continue; // empty lot: breathing room
          const ox = (k % 2 === 0 ? -1 : 1) * 11.5;
          const oz = (k < 2 ? -1 : 1) * 11.5;
          const w = 17 + rng() * 5, d = 17 + rng() * 5;
          const h = district.minH + rng() * (district.maxH - district.minH);
          addBuilding(cx + (n === 2 ? ox * 0.4 : ox), cz + (n === 2 ? 0 : oz), w, d, h, district.palette);
        }
      }
    }
  }

  // --- Flush recorded buildings into instanced meshes ---
  {
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const byKey = new Map();
    for (const b of buildingRecords) {
      if (!byKey.has(b.key)) byKey.set(b.key, []);
      byKey.get(b.key).push(b);
    }
    const dummy = new THREE.Object3D();
    for (const [key, list] of byKey) {
      const inst = new THREE.InstancedMesh(unitBox, matCache.get(key), list.length);
      list.forEach((b, i) => {
        dummy.position.set(b.cx, b.h / 2 + 0.02, b.cz);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(b.w, b.h, b.d);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      });
      scene.add(inst);
    }
    const roofs = new THREE.InstancedMesh(unitBox, roofMat, roofRecords.length);
    roofRecords.forEach((r, i) => {
      dummy.position.set(r.x, r.y, r.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(r.sx, r.sy, r.sz);
      dummy.updateMatrix();
      roofs.setMatrixAt(i, dummy.matrix);
    });
    scene.add(roofs);
  }

  // --- Palms (instanced trunks + crowns) ---
  const palmSpots = [];
  for (let x = -280; x <= 280; x += 18) {
    palmSpots.push([x + rng() * 6, 246 + rng() * 4]);
    palmSpots.push([x + rng() * 6, 282 + rng() * 4]);
  }
  for (let k = 0; k < 40; k++) {
    const s = STREETS[Math.floor(rng() * STREETS.length)];
    const p = -280 + rng() * 560;
    if (STREETS.some((t) => Math.abs(p - t) < 10)) continue;
    palmSpots.push(rng() < 0.5 ? [s + 8.5, p] : [p, s + 8.5]);
  }
  for (let k = 0; k < 12; k++) palmSpots.push([-45 + rng() * 36, -165 + rng() * 36]); // park
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.42, 6.5, 5);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2f });
  const crownGeo = new THREE.IcosahedronGeometry(2.6, 0);
  const crownMat = new THREE.MeshLambertMaterial({ color: 0x2e7a3a });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, palmSpots.length);
  {
    const dummy = new THREE.Object3D();
    palmSpots.forEach(([x, z], i) => {
      const tilt = (rng() - 0.5) * 0.16;
      dummy.position.set(x, 3.2, z);
      dummy.rotation.set(tilt, rng() * Math.PI, tilt);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x + tilt * 8, 6.9, z);
      dummy.rotation.set(0, rng() * Math.PI, 0);
      dummy.scale.set(1, 0.55, 1);
      dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
    });
  }
  scene.add(trunks);
  scene.add(crowns);

  // --- Streetlights at intersections (instanced) ---
  const lightSpots = [];
  for (const sx of STREETS) {
    for (const sz of STREETS) {
      lightSpots.push([sx + 8, sz + 8], [sx - 8, sz - 8]);
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.18, 7.5, 5);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3d44 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lightSpots.length);
  const headGeo = new THREE.BoxGeometry(1.6, 0.3, 0.5);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const heads = new THREE.InstancedMesh(headGeo, headMat, lightSpots.length);
  {
    const dummy = new THREE.Object3D();
    lightSpots.forEach(([x, z], i) => {
      dummy.position.set(x, 3.75, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 7.5, z);
      dummy.rotation.set(0, (i % 2) * Math.PI / 2, 0);
      dummy.updateMatrix();
      heads.setMatrixAt(i, dummy.matrix);
    });
  }
  scene.add(poles);
  scene.add(heads);

  // --- Ferris wheel on the Marina pier ---
  const wheelGroup = new THREE.Group();
  wheelGroup.position.set(PLACES.ferrisWheel.x, 0, PLACES.ferrisWheel.z);
  const legMat = new THREE.MeshLambertMaterial({ color: 0xd8d8d8 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(1.2, 24, 1.2), legMat);
  legL.position.set(-7, 12, 0);
  legL.rotation.z = 0.3;
  const legR = legL.clone();
  legR.position.x = 7;
  legR.rotation.z = -0.3;
  wheelGroup.add(legL, legR);
  const ring = new THREE.Group();
  ring.position.y = 23;
  const torus = new THREE.Mesh(new THREE.TorusGeometry(15, 0.7, 8, 40),
    new THREE.MeshBasicMaterial({ color: 0xff5ea8 }));
  ring.add(torus);
  for (let k = 0; k < 4; k++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(30, 0.5, 0.5), legMat);
    spoke.rotation.z = (k * Math.PI) / 4;
    ring.add(spoke);
  }
  const cabins = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2, 2),
      new THREE.MeshLambertMaterial({ color: pick([0xffd23f, 0x4de8ff, 0xff5ea8, 0x4dff88]) }));
    cabin.position.set(Math.cos(a) * 15, Math.sin(a) * 15, 0);
    ring.add(cabin);
    cabins.push(cabin);
  }
  wheelGroup.add(ring);
  scene.add(wheelGroup);
  colliders.push({
    minX: PLACES.ferrisWheel.x - 9, maxX: PLACES.ferrisWheel.x + 9,
    minZ: PLACES.ferrisWheel.z - 3, maxZ: PLACES.ferrisWheel.z + 3,
  });

  // --- Port crane ---
  const crane = new THREE.Group();
  crane.position.set(200, 0, -90);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(4, 34, 4),
    new THREE.MeshLambertMaterial({ color: 0xd8a03b }));
  tower.position.y = 17;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(30, 2.5, 2.5),
    new THREE.MeshLambertMaterial({ color: 0xd8a03b }));
  arm.position.set(8, 33, 0);
  crane.add(tower, arm);
  scene.add(crane);
  colliders.push({ minX: 197, maxX: 203, minZ: -93, maxZ: -87 });

  // --- Parked-car curb spots (along streets, clear of intersections) ---
  for (const s of STREETS) {
    for (let k = 0; k < 5; k++) {
      const p = -270 + rng() * 540;
      if (STREETS.some((t) => Math.abs(p - t) < 12)) continue;
      if (rng() < 0.5) parkedSpots.push({ x: s + 8.6, z: p, heading: 0 });
      else parkedSpots.push({ x: p, z: s + 8.6, heading: Math.PI / 2 });
    }
  }

  function isRoad(x, z) {
    for (const s of STREETS) {
      if (Math.abs(x - s) < WORLD.ROAD_WIDTH / 2 + 0.5) return true;
      if (Math.abs(z - s) < WORLD.ROAD_WIDTH / 2 + 0.5) return true;
    }
    return false;
  }

  function nearestStreet(v) {
    let best = STREETS[0];
    for (const s of STREETS) if (Math.abs(s - v) < Math.abs(best - v)) best = s;
    return best;
  }

  return {
    colliders,
    parkedSpots,
    ferrisRing: ring,
    ferrisCabins: cabins,
    isRoad,
    nearestStreet,
    // Push a circle (x, z, radius) out of every building AABB it overlaps.
    resolveCircle(pos, radius) {
      for (const c of colliders) {
        const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
        const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
        const dx = pos.x - nx, dz = pos.z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 < radius * radius) {
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2);
            pos.x = nx + (dx / d) * radius;
            pos.z = nz + (dz / d) * radius;
          } else {
            // Centre inside the box: push out along the smallest penetration.
            const pl = pos.x - c.minX, pr = c.maxX - pos.x;
            const pt = pos.z - c.minZ, pb = c.maxZ - pos.z;
            const m = Math.min(pl, pr, pt, pb);
            if (m === pl) pos.x = c.minX - radius;
            else if (m === pr) pos.x = c.maxX + radius;
            else if (m === pt) pos.z = c.minZ - radius;
            else pos.z = c.maxZ + radius;
          }
          return true;
        }
      }
      return false;
    },
  };
}
