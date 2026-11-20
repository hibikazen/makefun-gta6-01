// The wanted system and the Sunset Bay police: stars rise with every crime,
// patrol cars spawn and chase, ramming the player, and the heat only cools
// when no cruiser can see the player for a while.
import { Car } from './vehicles.js';
import { clamp, angleDiff } from './utils.js';

export class PoliceManager {
  constructor(scene, city, cars) {
    this.scene = scene;
    this.city = city;
    this.cars = cars;
    this.wanted = 0;
    this.cruisers = [];
    this.bustTimer = 0;
    this.unseenTimer = 0;
    this.spawnTimer = 0;
    this.ramCooldown = 0;
  }

  get maxCruisers() { return Math.min(this.wanted + 1, 6); }
  get chasing() { return this.cruisers.length; }

  addWanted(n, reason) {
    const before = this.wanted;
    this.wanted = clamp(this.wanted + n, 0, 5);
    if (this.wanted > before) this.unseenTimer = 0;
    return this.wanted;
  }

  clearWanted() {
    this.wanted = 0;
    this.bustTimer = 0;
    this.unseenTimer = 0;
  }

  setWanted(n) {
    this.wanted = clamp(n, 0, 5);
    this.unseenTimer = 0;
  }

  nearestCruiserDistance(x, z) {
    let best = Infinity;
    for (const c of this.cruisers) {
      const d = Math.hypot(c.pos.x - x, c.pos.z - z);
      if (d < best) best = d;
    }
    return best;
  }

  spawnCruiser(playerPos) {
    // Spawn on a nearby road, just out of the player's immediate view: pick
    // a point on a ring around the player and snap its nearer axis onto a
    // street, so a spawn always lands on a road even near the map edge.
    for (let tries = 0; tries < 12; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = 55 + Math.random() * 35;
      let x = clamp(playerPos.x + Math.cos(a) * r, -285, 285);
      let z = clamp(playerPos.z + Math.sin(a) * r, -285, 285);
      const nsx = this.city.nearestStreet(x);
      const nsz = this.city.nearestStreet(z);
      if (Math.abs(nsx - x) < Math.abs(nsz - z)) x = nsx + 3;
      else z = nsz + 3;
      if (Math.hypot(x - playerPos.x, z - playerPos.z) < 42) continue;
      const heading = Math.atan2(playerPos.x - x, playerPos.z - z);
      const car = new Car(this.scene, 'police', 0x14161c, x, z, heading);
      car.driver = 'police';
      this.cars.push(car);
      this.cruisers.push(car);
      return car;
    }
    return null;
  }

  removeCruiser(car) {
    const i = this.cruisers.indexOf(car);
    if (i !== -1) this.cruisers.splice(i, 1);
    const j = this.cars.indexOf(car);
    if (j !== -1) this.cars.splice(j, 1);
    car.remove(this.scene);
  }

  update(dt, ctx) {
    const player = ctx.player;
    this.ramCooldown = Math.max(0, this.ramCooldown - dt);
    this.spawnTimer -= dt;

    // Spawn cruisers up to the wanted level's allowance; a failed spawn
    // retries quickly instead of waiting out the full interval.
    if (this.wanted > 0 && this.cruisers.length < this.maxCruisers && this.spawnTimer <= 0) {
      this.spawnTimer = this.spawnCruiser(player.pos) ? 1.2 : 0.3;
    }
    // No heat: cruisers give up and drive off (despawn when far).
    if (this.wanted === 0) {
      for (const c of [...this.cruisers]) {
        const d = Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z);
        c.drive(dt, 0.6, 0, ctx.city);
        if (d > 160) this.removeCruiser(c);
      }
      this.bustTimer = 0;
      return;
    }

    const nearest = this.nearestCruiserDistance(player.pos.x, player.pos.z);
    // Heat cools when no cruiser is anywhere near for a while.
    if (nearest > 80) {
      this.unseenTimer += dt;
      if (this.unseenTimer > 11) {
        this.unseenTimer = 0;
        this.wanted = Math.max(0, this.wanted - 1);
        ctx.hud.flashPrompt(this.wanted === 0 ? 'You lost them. Heat is off.' : 'Heat dropping… ' + this.wanted + ' stars left');
      }
    } else {
      this.unseenTimer = 0;
    }

    // Chase AI: steer toward the player, throttle by distance, ram on contact.
    for (const c of [...this.cruisers]) {
      if (c.disabled) {
        // A wrecked cruiser is abandoned; a replacement spawns soon.
        this.spawnTimer = Math.min(this.spawnTimer, 0.5);
        continue;
      }
      const dx = player.pos.x - c.pos.x;
      const dz = player.pos.z - c.pos.z;
      const dist = Math.hypot(dx, dz);
      const wantHeading = Math.atan2(dx, dz);
      const dh = angleDiff(c.heading, wantHeading);
      const steer = clamp(dh * 2.2, -1, 1);
      // Slow down for corners and when close, so cruisers can actually turn.
      const throttle = dist > 90 ? 1 : dist > 25 ? 0.85 : (Math.abs(dh) > 0.9 ? 0.25 : 0.7);
      const hit = c.drive(dt, throttle, steer, ctx.city);
      if (hit && dist < 12) ctx.audio.crash();
      // Ramming the player hurts.
      if (dist < 3.4 && this.ramCooldown <= 0 && Math.abs(c.speed) > 4) {
        this.ramCooldown = 1.2;
        ctx.audio.crash();
        ctx.damagePlayer(this.wanted >= 3 ? 8 : 4);
        if (player.inCar) {
          player.car.health -= 6;
          player.car.speed *= 0.6;
        }
      }
      // Despawn cruisers that fell hopelessly behind (they respawn near the player).
      if (dist > 220) this.removeCruiser(c);
    }

    // BUSTED: a cruiser sits on a slow or stationary player.
    const playerSpeed = player.inCar ? Math.abs(player.car.speed) : player.speed2D;
    if (nearest < 7.5 && playerSpeed < 1.5) {
      this.bustTimer += dt;
      ctx.hud.setBustProgress(this.bustTimer / 3);
      if (this.bustTimer > 3) {
        this.bustTimer = 0;
        ctx.onBusted();
      }
    } else {
      this.bustTimer = Math.max(0, this.bustTimer - dt * 2);
      ctx.hud.setBustProgress(0);
    }
  }
}
