// Story missions: three jobs that chain into one thread — a repo job, a
// getaway, and a harbor run. Markers show where to go; the HUD narrates.
import * as THREE from 'three';
import { PLACES, MISSION_REWARDS } from './config.js';
import { Car } from './vehicles.js';

const MISSIONS = [
  {
    title: 'REPO RUN',
    brief: "Rico needs his coupe back — the gold one parked up in Midtown. Take it, bring it to the garage. Try not to get noticed.",
    start: PLACES.garage,
    startLabel: "Walk into the marker to start 'Repo Run'",
  },
  {
    title: 'HEAT WAVE',
    brief: "The payphone rings. It's a setup — the whole precinct is coming. Lose them. All of them.",
    start: PLACES.payphone,
    startLabel: "Walk into the marker to start 'Heat Wave'",
  },
  {
    title: 'HARBOR HUSTLE',
    brief: "One package, sitting in the dock office at Port Delmar. Del's crew is guarding it. Take it to the Marina drop and the debt is settled.",
    start: PLACES.dock,
    startLabel: "Walk into the marker to start 'Harbor Hustle'",
  },
];

function makeMarker(colorHex) {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(4, 0.35, 8, 32),
    new THREE.MeshBasicMaterial({ color: colorHex }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.3;
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.4, 34, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: 0.22,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  beacon.position.y = 17;
  group.add(ring, beacon);
  group.userData.ring = ring;
  group.userData.beacon = beacon;
  return group;
}

export class MissionManager {
  constructor(scene, ctx) {
    this.scene = scene;
    this.ctx = ctx;
    this.index = 0;            // next mission to play
    this.active = false;
    this.step = 0;
    this.stepTimer = 0;
    this.guards = [];
    this.allDone = false;

    // The gold coupe for mission 1, parked where the story says it is.
    this.coupe = new Car(scene, 'sports', 0xd8a03b, PLACES.coupeSpot.x, PLACES.coupeSpot.z, Math.PI / 2);
    this.coupe.driver = 'parked';
    ctx.cars.push(this.coupe);

    this.startMarker = makeMarker(0xffd23f);
    this.targetMarker = makeMarker(0x4de8ff);
    this.targetMarker.visible = false;
    scene.add(this.startMarker, this.targetMarker);
    this.placeStartMarker();
  }

  get current() { return MISSIONS[this.index] || null; }
  get missionsDone() { return this.index; }

  placeStartMarker() {
    const m = this.current;
    if (!m) {
      this.startMarker.visible = false;
      this.targetMarker.visible = false;
      return;
    }
    this.startMarker.visible = !this.active;
    this.startMarker.position.set(m.start.x, 0, m.start.z);
  }

  setTarget(x, z) {
    this.targetMarker.visible = true;
    this.targetMarker.position.set(x, 0, z);
  }

  startMission(i) {
    this.index = i;
    this.active = true;
    this.step = 0;
    const m = this.current;
    this.placeStartMarker();
    this.ctx.hud.showBanner(m.title, 'Mission started');
    this.ctx.hud.setObjective(m.title, m.brief);
    this.ctx.audio.chime();
    if (i === 0) {
      this.setTarget(PLACES.coupeSpot.x, PLACES.coupeSpot.z);
      this.ctx.hud.setObjective(m.title, 'Steal the gold coupe in Midtown');
    } else if (i === 1) {
      this.ctx.police.setWanted(3);
      this.ctx.hud.setObjective(m.title, 'Lose the cops — drop your wanted level to zero');
      this.targetMarker.visible = false;
    } else if (i === 2) {
      this.setTarget(PLACES.dock.x, PLACES.dock.z);
      this.ctx.hud.setObjective(m.title, 'Drive to the Port Delmar dock');
    }
  }

  completeMission() {
    const reward = MISSION_REWARDS[this.index] || 0;
    this.ctx.addMoney(reward);
    this.ctx.hud.showBanner('MISSION COMPLETE', '+' + reward + ' dollars');
    this.ctx.audio.chime();
    this.active = false;
    this.step = 0;
    this.index++;
    this.targetMarker.visible = false;
    this.clearGuards();
    if (this.index >= MISSIONS.length) {
      this.allDone = true;
      this.ctx.hud.setObjective('', '');
      this.ctx.hud.showBanner('SUNSET BAY', 'The debt is settled. The city is yours, Mara.');
      this.startMarker.visible = false;
    } else {
      this.ctx.hud.setObjective('', '');
      this.placeStartMarker();
    }
    this.ctx.saveProgress();
  }

  failMission(reason) {
    if (!this.active) return;
    this.active = false;
    this.step = 0;
    this.ctx.hud.showBanner('MISSION FAILED', reason || 'Try again at the marker');
    this.ctx.hud.setObjective('', '');
    this.targetMarker.visible = false;
    this.clearGuards();
    this.placeStartMarker();
  }

  clearGuards() {
    for (const g of this.guards) {
      g.state = 'dead';
      g.mesh.visible = false;
    }
    this.guards = [];
  }

  spawnGuards() {
    const spots = [
      { x: PLACES.dock.x - 8, z: PLACES.dock.z + 6 },
      { x: PLACES.dock.x + 8, z: PLACES.dock.z - 6 },
    ];
    for (const s of spots) {
      const g = this.ctx.peds.spawnPed(s.x, s.z, { hostile: true });
      g.heading = Math.atan2(this.ctx.player.pos.x - s.x, this.ctx.player.pos.z - s.z);
      this.guards.push(g);
    }
  }

  // Guards take pot-shots at the player while mission 3 is live.
  updateGuards(dt) {
    const player = this.ctx.player;
    for (const g of this.guards) {
      if (g.state === 'dead') continue;
      const dx = player.pos.x - g.mesh.position.x;
      const dz = player.pos.z - g.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      g.heading = Math.atan2(dx, dz);
      g.mesh.rotation.y = g.heading;
      if (dist > 48) continue;
      g.shootTimer -= dt;
      if (g.shootTimer <= 0) {
        g.shootTimer = 1.4;
        const from = g.mesh.position.clone();
        from.y = 1.5;
        const to = player.pos.clone();
        to.y = 1.2;
        this.ctx.combat.fireTracer(from, to);
        this.ctx.audio.shot();
        if (Math.random() < 0.42) this.ctx.damagePlayer(6);
      }
    }
  }

  update(dt) {
    const ctx = this.ctx;
    const player = ctx.player;
    const t = performance.now() / 1000;
    this.startMarker.userData.ring.rotation.z = t * 0.8;
    this.startMarker.userData.beacon.material.opacity = 0.16 + Math.sin(t * 2.4) * 0.07;
    this.targetMarker.userData.ring.rotation.z = -t * 0.8;
    this.targetMarker.userData.beacon.material.opacity = 0.16 + Math.sin(t * 2.4 + 1) * 0.07;

    if (this.allDone) return;
    const px = player.pos.x, pz = player.pos.z;

    if (!this.active) {
      const m = this.current;
      if (m && Math.hypot(px - m.start.x, pz - m.start.z) < 8) {
        this.startMission(this.index);
      }
      return;
    }

    this.updateGuards(dt);

    if (this.index === 0) {
      if (this.step === 0) {
        if (player.inCar && player.car === this.coupe) {
          this.step = 1;
          this.setTarget(PLACES.garage.x, PLACES.garage.z);
          ctx.hud.setObjective('REPO RUN', "Deliver the coupe to Mara's Garage");
          ctx.hud.flashPrompt('Got it — now get it to the garage!');
        }
      } else if (this.step === 1) {
        if (player.inCar && player.car === this.coupe &&
            Math.hypot(px - PLACES.garage.x, pz - PLACES.garage.z) < 11) {
          this.completeMission();
        }
      }
    } else if (this.index === 1) {
      if (ctx.police.wanted === 0) this.completeMission();
    } else if (this.index === 2) {
      if (this.step === 0) {
        if (Math.hypot(px - PLACES.dock.x, pz - PLACES.dock.z) < 11) {
          this.step = 1;
          this.spawnGuards();
          ctx.police.addWanted(2, 'harbor job');
          this.setTarget(PLACES.dock.x, PLACES.dock.z + 24);
          ctx.hud.setObjective('HARBOR HUSTLE', 'Grab the package from the dock office — guards ahead!');
          ctx.hud.flashPrompt("Del's crew is here. Grab it and run!");
        }
      } else if (this.step === 1) {
        if (Math.hypot(px - PLACES.dock.x, pz - (PLACES.dock.z + 24)) < 6) {
          this.step = 2;
          ctx.audio.chime();
          this.setTarget(PLACES.marinaDrop.x, PLACES.marinaDrop.z);
          ctx.hud.setObjective('HARBOR HUSTLE', 'Deliver the package to the Marina drop-off');
        }
      } else if (this.step === 2) {
        if (Math.hypot(px - PLACES.marinaDrop.x, pz - PLACES.marinaDrop.z) < 9) {
          ctx.police.clearWanted();
          this.completeMission();
        }
      }
    }
  }
}
