// Pedestrians: low-poly walkers who stroll the sidewalks, turn at corners,
// flee from gunfire and fast cars, and can be knocked down (which the law
// notices). Hostile guards are pedestrians with a gun and a grudge.
import * as THREE from 'three';
import { STREETS, GAME } from './config.js';
import { rand, pick, clamp } from './utils.js';

const SHIRTS = [0xe8e8e8, 0x3b6fc2, 0xc23b3b, 0x3bc25a, 0xd8a03b, 0x7a3bc2, 0xe07a3b, 0x3bc2b8];
const PANTS = [0x2b2b33, 0x3a4a5a, 0x5a3a2a, 0x2a3a2a];

export function makePersonMesh(shirt, pants, skin) {
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const hairMat = new THREE.MeshLambertMaterial({ color: pick([0x1a1a1a, 0x4a2f1a, 0x8a6a3a, 0xd8d8d8]) });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.34), shirtMat);
  torso.position.y = 1.18;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.4), skinMat);
  head.position.y = 1.78;
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.44), hairMat);
  hair.position.y = 2.0;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.8, 0.28), pantsMat);
  legL.position.set(-0.16, 0.4, 0);
  const legR = legL.clone();
  legR.position.x = 0.16;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.68, 0.22), shirtMat);
  armL.position.set(-0.42, 1.18, 0);
  const armR = armL.clone();
  armR.position.x = 0.42;
  group.add(torso, head, hair, legL, legR, armL, armR);
  group.userData = { torso, head, legL, legR, armL, armR, shirtMat };
  return group;
}

export class PedestrianManager {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.peds = [];
    for (let i = 0; i < GAME.PED_COUNT; i++) this.spawnPed();
  }

  randomSidewalkSpot() {
    for (let tries = 0; tries < 12; tries++) {
      const street = pick(STREETS);
      const along = rand(-270, 270);
      const side = Math.random() < 0.5 ? 8.5 : -8.5;
      const x = Math.random() < 0.5 ? street + side : along;
      const z = Math.random() < 0.5 ? along : street + side;
      if (this.city.isRoad(x, z)) continue;
      let blocked = false;
      for (const c of this.city.colliders) {
        if (x > c.minX - 1 && x < c.maxX + 1 && z > c.minZ - 1 && z < c.maxZ + 1) { blocked = true; break; }
      }
      if (!blocked) return { x, z };
    }
    return { x: 0, z: 0 };
  }

  spawnPed(x, z, opts = {}) {
    const spot = x === undefined ? this.randomSidewalkSpot() : { x, z };
    const hostile = !!opts.hostile;
    const mesh = makePersonMesh(
      hostile ? 0x8a1a1a : pick(SHIRTS),
      pick(PANTS),
      pick([0xe8b98a, 0xc98a5a, 0x8a5a3a, 0xf2c9a0]),
    );
    mesh.position.set(spot.x, 0, spot.z);
    const heading = rand(0, Math.PI * 2);
    mesh.rotation.y = heading;
    this.scene.add(mesh);
    const ped = {
      mesh, heading,
      speed: hostile ? 0 : rand(1.2, 2.2),
      state: hostile ? 'guard' : 'walk', // walk | flee | down | dead | guard
      stateTimer: 0,
      hp: hostile ? 100 : 60,
      walkPhase: rand(0, Math.PI * 2),
      targetHeading: heading,
      hostile,
      shootTimer: rand(0.5, 1.5),
      downAt: 0,
    };
    mesh.traverse((m) => { m.userData.ped = ped; });
    this.peds.push(ped);
    return ped;
  }

  nearestPed(x, z, radius, includeDown = false) {
    let best = null, bestD = radius;
    for (const p of this.peds) {
      if (p.state === 'dead') continue;
      if (!includeDown && p.state === 'down') continue;
      const d = Math.hypot(p.mesh.position.x - x, p.mesh.position.z - z);
      if (d < bestD) { best = p; bestD = d; }
    }
    return best;
  }

  // A loud bang or a speeding car nearby makes walkers run away.
  scare(x, z, radius) {
    for (const p of this.peds) {
      if (p.state !== 'walk' || p.hostile) continue;
      const dx = p.mesh.position.x - x, dz = p.mesh.position.z - z;
      if (dx * dx + dz * dz < radius * radius) {
        p.state = 'flee';
        p.stateTimer = rand(2.5, 4);
        p.targetHeading = Math.atan2(dx, dz);
      }
    }
  }

  knockDown(ped, fromX, fromZ) {
    if (ped.state === 'down' || ped.state === 'dead') return;
    ped.state = 'down';
    ped.stateTimer = 6;
    ped.downAt = performance.now();
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.4;
    if (fromX !== undefined) {
      const dx = ped.mesh.position.x - fromX, dz = ped.mesh.position.z - fromZ;
      const d = Math.hypot(dx, dz) || 1;
      ped.mesh.position.x += (dx / d) * 1.5;
      ped.mesh.position.z += (dz / d) * 1.5;
    }
  }

  damage(ped, amount, fromX, fromZ) {
    if (ped.state === 'dead') return false;
    ped.hp -= amount;
    ped.mesh.userData.shirtMat.emissive = new THREE.Color(0x550000);
    setTimeout(() => {
      if (ped.mesh.userData.shirtMat) ped.mesh.userData.shirtMat.emissive = new THREE.Color(0x000000);
    }, 120);
    if (ped.hp <= 0) {
      ped.state = 'dead';
      ped.stateTimer = 8;
      ped.mesh.rotation.x = -Math.PI / 2;
      ped.mesh.position.y = 0.3;
      return true;
    }
    if (ped.state === 'walk') {
      ped.state = 'flee';
      ped.stateTimer = 4;
      if (fromX !== undefined) ped.targetHeading = Math.atan2(ped.mesh.position.x - fromX, ped.mesh.position.z - fromZ);
    }
    return false;
  }

  update(dt, ctx) {
    for (const p of this.peds) {
      const m = p.mesh;
      if (p.state === 'dead' || p.state === 'down') {
        p.stateTimer -= dt;
        if (p.stateTimer <= 0) {
          if (p.state === 'dead' && !p.hostile) {
            // The fallen quietly respawn across town; guards stay down.
            const spot = this.randomSidewalkSpot();
            m.position.set(spot.x, 0, spot.z);
            m.rotation.set(0, rand(0, Math.PI * 2), 0);
            p.state = 'walk';
            p.hp = 60;
          } else if (p.state === 'down') {
            m.rotation.set(0, p.heading, 0);
            m.position.y = 0;
            p.state = 'flee';
            p.stateTimer = 4;
            p.hp = 60;
          }
        }
        continue;
      }
      if (p.state === 'guard') {
        // Guards stand their post; shooting is handled by the mission logic.
        m.rotation.y = p.heading;
        continue;
      }
      // Walk or flee along the sidewalk grid.
      const speed = p.state === 'flee' ? 6.5 : p.speed;
      p.stateTimer -= dt;
      if (p.state === 'flee' && p.stateTimer <= 0) {
        p.state = 'walk';
        p.speed = rand(1.2, 2.2);
      }
      // Turn at intersections or when blocked.
      const px = m.position.x, pz = m.position.z;
      const nearCrossX = STREETS.some((s) => Math.abs(px - s) < 2);
      const nearCrossZ = STREETS.some((s) => Math.abs(pz - s) < 2);
      if ((nearCrossX || nearCrossZ) && Math.random() < dt * 0.7) {
        p.targetHeading = Math.floor(rand(0, 4)) * (Math.PI / 2);
      }
      let dh = p.targetHeading - p.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      p.heading += clamp(dh, -2.4 * dt, 2.4 * dt);
      const nx = px + Math.sin(p.heading) * speed * dt;
      const nz = pz + Math.cos(p.heading) * speed * dt;
      const probe = { x: nx, z: nz };
      if (this.city.resolveCircle(probe, 0.6)) {
        // Bumped into a building: turn around.
        p.targetHeading = p.heading + Math.PI;
      } else {
        m.position.x = clamp(nx, -295, 320);
        m.position.z = clamp(nz, -295, 320);
      }
      m.rotation.y = p.heading;
      // Walk-cycle swing.
      p.walkPhase += dt * speed * 2.4;
      const swing = Math.sin(p.walkPhase) * 0.55;
      m.userData.legL.rotation.x = swing;
      m.userData.legR.rotation.x = -swing;
      m.userData.armL.rotation.x = -swing * 0.7;
      m.userData.armR.rotation.x = swing * 0.7;
    }
  }
}
