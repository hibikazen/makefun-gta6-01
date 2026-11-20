// Mara Quinn, the player: on-foot movement with a walk cycle and jumping,
// plus getting in and out of cars — including stealing them, which the
// police take personally.
import * as THREE from 'three';
import { GAME } from './config.js';
import { clamp, angleLerp } from './utils.js';
import { makePersonMesh } from './pedestrians.js';

export class Player {
  constructor(scene, x, z) {
    this.mesh = makePersonMesh(0x2a9d8f, 0x2b2b33, 0xe8b98a);
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    // Pistol in the right hand, always carried.
    this.gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.42),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
    this.gun.position.set(0.48, 0.95, 0.25);
    this.mesh.add(this.gun);
    this.heading = Math.PI;
    this.mesh.rotation.y = this.heading;
    this.vy = 0;
    this.onGround = true;
    this.walkPhase = 0;
    this.car = null;         // the Car being driven, or null on foot
    // Wall-clock cooldown (not game time): entering then immediately
    // exiting must feel the same even if the frame rate is low.
    this.enterReadyAt = 0;
    this.moving = false;
    this.speed2D = 0;
  }

  get pos() { return this.mesh.position; }
  get inCar() { return this.car !== null; }

  nearestCar(cars, radius) {
    let best = null, bestD = radius;
    for (const c of cars) {
      if (c === this.car) continue;
      const d = Math.hypot(c.pos.x - this.pos.x, c.pos.z - this.pos.z);
      if (d < bestD) { best = c; bestD = d; }
    }
    return best;
  }

  enterCar(car, ctx) {
    if (performance.now() < this.enterReadyAt) return;
    const wasTraffic = car.driver === 'traffic';
    const wasPolice = car.type === 'police';
    if (wasTraffic) {
      // Carjacking: the driver bails out and runs.
      ctx.traffic.release(car);
      const driver = ctx.peds.spawnPed(car.pos.x + 2, car.pos.z + 2);
      driver.state = 'flee';
      driver.stateTimer = 5;
      driver.targetHeading = Math.atan2(driver.mesh.position.x - car.pos.x, driver.mesh.position.z - car.pos.z);
      ctx.police.addWanted(1, 'carjacking');
      ctx.hud.flashPrompt('Car stolen — the cops noticed!');
    }
    if (wasPolice) ctx.police.addWanted(2, 'stole a police car');
    car.driver = 'player';
    this.car = car;
    this.mesh.visible = false;
    ctx.audio.blip(520);
    this.enterReadyAt = performance.now() + 400;
  }

  exitCar(ctx) {
    if (!this.car || performance.now() < this.enterReadyAt) return;
    const car = this.car;
    car.driver = 'parked';
    car.stop();
    this.car = null;
    const side = { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
    this.pos.set(car.pos.x + side.x * 2.4, 0, car.pos.z + side.z * 2.4);
    this.heading = car.heading;
    this.mesh.rotation.y = this.heading;
    this.mesh.visible = true;
    this.enterReadyAt = performance.now() + 400;
    ctx.audio.blip(440);
  }

  update(dt, ctx) {
    const input = ctx.input;

    if (this.car) {
      // Driving: W/S throttle, A/D steer, Space handbrake.
      const axis = input.moveAxis();
      const throttle = axis.forward;
      let steer = -axis.strafe;
      if (this.car.speed < 0) steer = -steer;
      const brake = input.isDown('Space');
      const hit = this.car.drive(dt, brake ? (this.car.speed > 0.5 ? -1 : 0) : throttle, steer, ctx.city);
      if (hit) {
        ctx.audio.crash();
        ctx.damagePlayer(2);
      }
      this.pos.copy(this.car.pos);
      this.heading = this.car.heading;
      this.moving = Math.abs(this.car.speed) > 0.5;
      this.speed2D = Math.abs(this.car.speed);
      if (input.wasPressed('KeyE')) this.exitCar(ctx);
      return;
    }

    // On foot: move relative to the camera.
    const axis = input.moveAxis();
    const yaw = ctx.cameraYaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    let mx = fx * axis.forward + rx * axis.strafe;
    let mz = fz * axis.forward + rz * axis.strafe;
    const len = Math.hypot(mx, mz);
    this.moving = len > 0.1;
    const speed = input.running ? GAME.RUN_SPEED : GAME.WALK_SPEED;
    if (len > 0.1) {
      mx /= len; mz /= len;
      const targetHeading = Math.atan2(mx, mz);
      this.heading = angleLerp(this.heading, targetHeading, Math.min(1, dt * 12));
      const nx = this.pos.x + mx * speed * dt;
      const nz = this.pos.z + mz * speed * dt;
      const probe = { x: nx, z: nz };
      ctx.city.resolveCircle(probe, 0.6);
      this.pos.x = clamp(probe.x, -298, 322);
      this.pos.z = clamp(probe.z, -298, 322);
      this.speed2D = speed;
    } else {
      this.speed2D = 0;
    }
    // Jump + gravity.
    if (input.wasPressed('Space') && this.onGround) {
      this.vy = GAME.JUMP_SPEED;
      this.onGround = false;
    }
    if (!this.onGround) {
      this.vy -= GAME.GRAVITY * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= 0) { this.pos.y = 0; this.vy = 0; this.onGround = true; }
    }
    // Walk-cycle swing.
    if (this.moving && this.onGround) this.walkPhase += dt * this.speed2D * 1.6;
    const swing = this.moving ? Math.sin(this.walkPhase) * 0.6 : 0;
    const u = this.mesh.userData;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.7;
    u.armR.rotation.x = swing * 0.7;
    this.mesh.rotation.y = this.heading;

    if (input.wasPressed('KeyE')) {
      const car = this.nearestCar(ctx.cars, 4.5);
      if (car) this.enterCar(car, ctx);
    }
  }
}
