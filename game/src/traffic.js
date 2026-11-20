// Ambient traffic: cars that cruise the street grid, keep their lane, slow
// for the car ahead and wrap around the map edge. Any of them can be stolen.
import { Car } from './vehicles.js';
import { STREETS, GAME, CAR_COLORS } from './config.js';
import { rand, pick } from './utils.js';

const TRAFFIC_TYPES = ['sedan', 'sedan', 'sedan', 'taxi', 'van', 'pickup', 'sports'];

export class TrafficManager {
  constructor(scene, city, cars) {
    this.scene = scene;
    this.city = city;
    this.cars = cars; // shared fleet array (traffic + parked + police + player)
    this.entries = [];
    for (let i = 0; i < GAME.TRAFFIC_COUNT; i++) this.spawnOne(true);
  }

  spawnOne(anywhere) {
    const axis = Math.random() < 0.5 ? 'x' : 'z';
    const street = pick(STREETS);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const lane = dir > 0 ? 3 : -3;
    const along = anywhere ? rand(-280, 280) : (dir > 0 ? -290 : 290);
    const x = axis === 'x' ? along : street + lane;
    const z = axis === 'x' ? street + lane : along;
    const heading = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    const type = pick(TRAFFIC_TYPES);
    const color = type === 'taxi' ? 0xf2c200 : pick(CAR_COLORS);
    const car = new Car(this.scene, type, color, x, z, heading);
    car.driver = 'traffic';
    car.speed = rand(8, 13);
    this.cars.push(car);
    const entry = { car, axis, street, dir, lane, cruise: car.speed, pause: 0 };
    this.entries.push(entry);
    return entry;
  }

  // A traffic car the player stole stops being traffic.
  release(car) {
    const i = this.entries.findIndex((e) => e.car === car);
    if (i !== -1) this.entries.splice(i, 1);
  }

  update(dt, playerPos) {
    for (const e of this.entries) {
      const car = e.car;
      if (car.disabled) { car.drive(dt, 0, 0, null); continue; }
      // Slow down for the car ahead in the same lane.
      let target = e.cruise;
      const f = car.forward;
      for (const other of this.cars) {
        if (other === car) continue;
        const dx = other.pos.x - car.pos.x;
        const dz = other.pos.z - car.pos.z;
        const ahead = dx * f.x + dz * f.z;
        const side = Math.abs(dx * f.z - dz * f.x);
        if (ahead > 0 && ahead < 13 && side < 2.4) {
          target = Math.min(target, Math.max(0, other.speed * 0.9));
        }
      }
      // Ease speed toward target, then roll forward without steering input.
      car.speed += (target - car.speed) * Math.min(1, dt * 1.5);
      const nx = car.pos.x + f.x * car.speed * dt;
      const nz = car.pos.z + f.z * car.speed * dt;
      car.pos.x = nx;
      car.pos.z = nz;
      car.mesh.rotation.y = car.heading;
      car.updateWheels(dt);
      // Wrap around the map edge so traffic never runs out.
      const along = e.axis === 'x' ? car.pos.x : car.pos.z;
      if (along * e.dir > 295) {
        const back = -295 * e.dir;
        if (e.axis === 'x') car.pos.x = back; else car.pos.z = back;
      }
    }
    // Top the fleet back up if the player stole several cars.
    if (this.entries.length < GAME.TRAFFIC_COUNT && Math.random() < dt * 0.25) {
      this.spawnOne(false);
    }
  }
}
