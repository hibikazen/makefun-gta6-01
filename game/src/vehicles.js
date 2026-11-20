// Cars: low-poly originals built from boxes and cylinders, plus the arcade
// driving model shared by the player, traffic and the police.
import * as THREE from 'three';
import { GAME } from './config.js';
import { clamp } from './utils.js';

export const CAR_TYPES = {
  sedan:   { length: 4.6, width: 2.0, height: 0.75, cabin: 0.65, topSpeed: 38, accel: 16 },
  sports:  { length: 4.4, width: 2.0, height: 0.6, cabin: 0.5, topSpeed: 46, accel: 21 },
  taxi:    { length: 4.6, width: 2.0, height: 0.75, cabin: 0.65, topSpeed: 36, accel: 15 },
  van:     { length: 5.2, width: 2.1, height: 1.5, cabin: 0.0, topSpeed: 30, accel: 12 },
  police:  { length: 4.7, width: 2.0, height: 0.75, cabin: 0.65, topSpeed: 44, accel: 20 },
  pickup:  { length: 5.0, width: 2.0, height: 0.8, cabin: 0.6, topSpeed: 34, accel: 14 },
};

let nextCarId = 1;

export function makeCarMesh(type, colorHex) {
  const spec = CAR_TYPES[type] || CAR_TYPES.sedan;
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: colorHex });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x101c26 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });

  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.width, spec.height, spec.length), bodyMat);
  body.position.y = 0.55 + spec.height / 2 - 0.35;
  group.add(body);
  if (spec.cabin > 0) {
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(spec.width * 0.86, spec.cabin, spec.length * 0.48), glassMat);
    cabin.position.set(0, 0.55 + spec.height - 0.3 + spec.cabin / 2, -spec.length * 0.05);
    group.add(cabin);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(spec.width * 0.88, 0.08, spec.length * 0.5), bodyMat);
    roof.position.set(0, 0.55 + spec.height - 0.3 + spec.cabin + 0.04, -spec.length * 0.05);
    group.add(roof);
  }
  // Headlights and taillights.
  const lightGeo = new THREE.BoxGeometry(0.42, 0.22, 0.1);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const sx of [-0.62, 0.62]) {
    const h = new THREE.Mesh(lightGeo, headMat);
    h.position.set(sx, 0.62, spec.length / 2 + 0.02);
    group.add(h);
    const t = new THREE.Mesh(lightGeo, tailMat);
    t.position.set(sx, 0.62, -spec.length / 2 - 0.02);
    group.add(t);
  }
  if (type === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
    sign.position.set(0, 0.55 + spec.height + spec.cabin + 0.1, 0);
    group.add(sign);
  }
  if (type === 'police') {
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.x = -0.3;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 0.4),
      new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    blue.position.x = 0.3;
    bar.add(red, blue);
    bar.position.set(0, 0.55 + spec.height + spec.cabin + 0.12, 0);
    bar.userData.red = red;
    bar.userData.blue = blue;
    group.add(bar);
    group.userData.lightBar = bar;
  }
  if (type === 'sports') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 0.5), darkMat);
    spoiler.position.set(0, 1.05, -spec.length / 2 + 0.3);
    group.add(spoiler);
  }
  // Wheels: cylinders rotated to roll around the X axis.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  const frontWheels = [];
  for (const [wx, wz, front] of [
    [-spec.width / 2, spec.length / 2 - 0.8, true],
    [spec.width / 2, spec.length / 2 - 0.8, true],
    [-spec.width / 2, -spec.length / 2 + 0.8, false],
    [spec.width / 2, -spec.length / 2 + 0.8, false],
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, 0.36, wz);
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    pivot.add(wheel);
    group.add(pivot);
    wheels.push(wheel);
    if (front) frontWheels.push(pivot);
  }
  group.userData.wheels = wheels;
  group.userData.frontWheels = frontWheels;
  return group;
}

export class Car {
  constructor(scene, type, colorHex, x, z, heading) {
    this.id = nextCarId++;
    this.type = type;
    this.spec = CAR_TYPES[type] || CAR_TYPES.sedan;
    this.mesh = makeCarMesh(type, colorHex);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.heading = heading;
    this.speed = 0;              // signed, units/second, forward positive
    this.steer = 0;              // -1..1, smoothed
    this.driver = 'parked';      // 'parked' | 'traffic' | 'police' | 'player' | null
    this.health = 100;
    this.disabled = false;
    this.flashTimer = 0;
  }

  get pos() { return this.mesh.position; }
  get forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }

  // Arcade drive step: throttle -1..1, steer -1..1. Returns true on a hard hit.
  drive(dt, throttle, steerTarget, colliders) {
    if (this.disabled) throttle = 0;
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 8);
    const maxF = this.spec.topSpeed;
    if (throttle > 0) {
      this.speed += this.spec.accel * throttle * dt;
      if (this.speed > maxF) this.speed = maxF;
    } else if (throttle < 0) {
      if (this.speed > 0.5) this.speed += GAME.CAR_BRAKE * throttle * dt; // braking
      else {
        this.speed += this.spec.accel * 0.6 * throttle * dt;              // reversing
        if (this.speed < -GAME.CAR_MAX_REVERSE) this.speed = -GAME.CAR_MAX_REVERSE;
      }
    } else {
      this.speed -= this.speed * 0.6 * dt; // rolling drag
      if (Math.abs(this.speed) < 0.05) this.speed = 0;
    }
    const spd = clamp(this.speed / 12, -1, 1);
    this.heading += this.steer * spd * 1.9 * dt;
    const f = this.forward;
    const nx = this.pos.x + f.x * this.speed * dt;
    const nz = this.pos.z + f.z * this.speed * dt;
    const before = { x: this.pos.x, z: this.pos.z };
    this.pos.x = clamp(nx, -WORLD_HALF(), WORLD_HALF());
    this.pos.z = clamp(nz, -WORLD_HALF(), 325);
    let hit = false;
    if (colliders) {
      const probe = { x: this.pos.x, z: this.pos.z };
      if (colliders.resolveCircle(probe, 1.9)) {
        const impact = Math.abs(this.speed);
        this.pos.x = probe.x;
        this.pos.z = probe.z;
        if (impact > 6) {
          hit = true;
          this.health -= (impact - 6) * 1.2;
          if (this.health <= 0) this.disabled = true;
        }
        this.speed *= -0.25; // bounce back a little
      }
    }
    this.mesh.rotation.y = this.heading;
    this.updateWheels(dt);
    // Police light bar strobe.
    if (this.type === 'police' && this.mesh.userData.lightBar) {
      this.flashTimer += dt;
      const on = Math.floor(this.flashTimer * 6) % 2 === 0;
      const bar = this.mesh.userData.lightBar;
      bar.userData.red.material.color.setHex(on ? 0xff2222 : 0x550000);
      bar.userData.blue.material.color.setHex(on ? 0x001155 : 0x2266ff);
    }
    return hit;
  }

  updateWheels(dt) {
    const spin = (this.speed * dt) / 0.36;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
    for (const p of this.mesh.userData.frontWheels) p.rotation.y = this.steer * 0.45;
  }

  stop() { this.speed = 0; }

  remove(scene) { scene.remove(this.mesh); }
}

function WORLD_HALF() { return 300; }
