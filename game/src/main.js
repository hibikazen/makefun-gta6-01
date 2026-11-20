// Sunset Bay — game bootstrap and loop: wires the city, player, traffic,
// pedestrians, police, missions, combat, HUD, minimap and audio together,
// runs the third-person camera, and stages screenshot scenes (?scene=...).
import * as THREE from 'three';
import { WORLD, STREETS, PLACES, GAME, CAR_COLORS, districtAt } from './config.js';
import { clamp, angleLerp, pick, rand } from './utils.js';
import { buildCity } from './city.js';
import { Car } from './vehicles.js';
import { TrafficManager } from './traffic.js';
import { PedestrianManager } from './pedestrians.js';
import { Player } from './player.js';
import { PoliceManager } from './police.js';
import { MissionManager } from './missions.js';
import { Combat } from './combat.js';
import { HUD } from './hud.js';
import { Minimap } from './minimap.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { saveGame, loadGame, hasSave } from './save.js';

// Collect page errors for the automated play-test (and for debugging).
window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message || e.error)));
window.addEventListener('unhandledrejection', (e) => window.__errors.push('rejection: ' + String(e.reason)));

class Game {
  constructor() {
    const canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.camera.position.set(0, 40, 120);

    // Golden-hour lighting: warm sun from the west, soft violet bounce.
    // Kept strong on purpose: Lambert's divide-by-pi plus ACES leaves dark
    // asphalt nearly black at low intensities.
    const hemi = new THREE.HemisphereLight(0xffd9b3, 0x3a2a4a, 1.5);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffb36b, 2.4);
    sun.position.set(-220, 190, 130);
    this.scene.add(sun);

    this.city = buildCity(this.scene);
    this.cars = [];
    this.traffic = new TrafficManager(this.scene, this.city, this.cars);
    this.peds = new PedestrianManager(this.scene, this.city);
    this.player = new Player(this.scene, PLACES.playerStart.x, PLACES.playerStart.z);
    this.police = new PoliceManager(this.scene, this.city, this.cars);
    this.combat = new Combat(this.scene, this.camera);
    this.hud = new HUD();
    this.minimap = new Minimap(document.getElementById('minimap'), this.city);
    this.audio = new AudioEngine();
    this.input = new Input(canvas);
    this.missions = new MissionManager(this.scene, this);

    this.spawnParkedCars();
    this.spawnPickups();

    // Run state.
    this.mode = 'menu'; // menu | playing | paused | ended
    this.money = GAME.START_MONEY;
    this.health = GAME.MAX_HEALTH;
    this.clockMinutes = GAME.CLOCK_START_MINUTES;
    this.cameraYaw = Math.PI;
    this.cameraPitch = 0.34;
    this.cameraDist = 10;
    this.lastDragTime = -10;
    this.saveTimer = 0;
    this.menuOrbit = 0;
    this.lastHud = { wanted: -1, money: -1, health: -1, district: '' };

    this.wireButtons();
    this.hud.showStart(hasSave());
    window.addEventListener('resize', () => this.onResize());

    // Debug handle for the automated play-test (read-only state + the live
    // game object for scripted checks; harmless in normal play).
    window.__game = {
      get state() { return window.__gameState; },
    };
    window.__gameDebug = this;
    window.__gameState = this.debugState();

    // Screenshot staging scenes (?scene=drive|chase|mission|foot).
    const sceneParam = new URLSearchParams(window.location.search).get('scene');
    if (sceneParam) this.startScene(sceneParam);

    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.loop());
  }

  wireButtons() {
    const h = this.hud.el;
    h['btn-start'].addEventListener('click', () => this.startGame(false));
    h['btn-continue'].addEventListener('click', () => this.startGame(true));
    h['btn-resume'].addEventListener('click', () => this.resume());
    h['btn-save'].addEventListener('click', () => {
      this.saveProgress();
      h['pause-stats'].textContent = 'Saved. ' + this.statsText();
    });
    h['btn-mute'].addEventListener('click', () => {
      const muted = this.audio.toggleMute();
      h['btn-mute'].textContent = muted ? 'SOUND: OFF' : 'SOUND: ON';
    });
    h['btn-menu'].addEventListener('click', () => {
      this.saveProgress();
      this.mode = 'menu';
      this.hud.showStart(hasSave());
      this.hud.hidePause();
    });
    h['btn-respawn'].addEventListener('click', () => this.respawn());
  }

  statsText() {
    return 'Money $' + Math.floor(this.money) + '  ·  Missions ' +
      this.missions.missionsDone + '/3  ·  Health ' + Math.round(this.health);
  }

  spawnParkedCars() {
    const spots = [...this.city.parkedSpots];
    for (let i = spots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [spots[i], spots[j]] = [spots[j], spots[i]];
    }
    const types = ['sedan', 'sedan', 'pickup', 'van', 'sports', 'sedan', 'taxi'];
    for (let i = 0; i < Math.min(GAME.PARKED_COUNT, spots.length); i++) {
      const s = spots[i];
      const type = pick(types);
      const car = new Car(this.scene, type, type === 'taxi' ? 0xf2c200 : pick(CAR_COLORS),
        s.x, s.z, s.heading);
      car.driver = 'parked';
      this.cars.push(car);
    }
  }

  spawnPickups() {
    this.pickups = [];
    const mat = new THREE.MeshBasicMaterial({ color: 0x4dff88 });
    for (let i = 0; i < GAME.PICKUP_COUNT; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.14, 0.7), mat);
      mesh.position.y = 1;
      this.scene.add(mesh);
      const p = { mesh, taken: false, timer: 0 };
      this.placePickup(p);
      this.pickups.push(p);
    }
  }

  placePickup(p) {
    const street = pick(STREETS);
    const along = rand(-270, 270);
    const off = pick([9, -9]);
    if (Math.random() < 0.5) p.mesh.position.set(street + off, 1, along);
    else p.mesh.position.set(along, 1, street + off);
    p.taken = false;
    p.mesh.visible = true;
  }

  startGame(fromSave) {
    this.audio.init();
    this.audio.resume();
    if (fromSave) {
      const s = loadGame();
      if (s) {
        this.money = s.money;
        this.health = s.health;
        this.clockMinutes = s.clockMinutes || GAME.CLOCK_START_MINUTES;
        this.player.pos.set(s.x, 0, s.z);
        this.player.heading = s.heading || 0;
        this.missions.index = Math.min(s.missionsDone || 0, 3);
        if (this.missions.index >= 3) this.missions.allDone = true;
        this.missions.placeStartMarker();
        this.hud.flashPrompt('Save loaded — welcome back to Sunset Bay');
      }
    }
    this.mode = 'playing';
    this.hud.showGame();
    this.refreshHud(true);
  }

  pause() {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.hud.showPause(this.statsText());
    this.saveProgress();
  }

  resume() {
    if (this.mode !== 'paused') return;
    this.mode = 'playing';
    this.hud.hidePause();
    this.audio.resume();
  }

  // Screenshot scenes: jump straight into a staged situation, no menu.
  startScene(name) {
    this.mode = 'playing';
    this.hud.showGame();
    const p = this.player;
    if (name === 'drive') {
      const car = new Car(this.scene, 'sports', 0xc23b3b, 0, 185, Math.PI);
      car.driver = 'player';
      car.speed = 16;
      this.cars.push(car);
      p.car = car;
      p.mesh.visible = false;
      this.cameraYaw = Math.PI;
      this.cameraDist = 11;
      // Two traffic cars ahead on the boulevard, so the cover shot has life.
      for (const [lx, lz] of [[3, 120], [-3, 60]]) {
        const t = new Car(this.scene, 'sedan', 0xd8d8d8, lx, lz, Math.PI);
        t.driver = 'traffic';
        t.speed = 10;
        this.cars.push(t);
        this.traffic.entries.push({ car: t, axis: 'z', street: 0, dir: -1, lane: lx, cruise: 10, pause: 0 });
      }
    } else if (name === 'chase') {
      const car = new Car(this.scene, 'sedan', 0x3b6fc2, 60, 60, Math.PI / 2);
      car.driver = 'player';
      car.speed = 22;
      this.cars.push(car);
      p.car = car;
      p.mesh.visible = false;
      this.cameraYaw = Math.PI / 2;
      this.police.setWanted(3);
      // Two cruisers behind (the chase), one ahead coming at the player so
      // the shot shows police in frame, not just behind the camera.
      for (const [ox, oz, heading] of [[-26, 2, Math.PI / 2], [-36, 8, Math.PI / 2], [45, -4, -Math.PI / 2]]) {
        const c = new Car(this.scene, 'police', 0x14161c, 60 + ox, 60 + oz, heading);
        c.driver = 'police';
        c.speed = 20;
        this.cars.push(c);
        this.police.cruisers.push(c);
      }
      this.hud.flashPrompt('3 stars — lose the cops!');
    } else if (name === 'mission') {
      p.pos.set(60, 0, -120);
      p.heading = Math.PI / 2; // facing east along the road, toward the coupe
      this.cameraYaw = p.heading;
      this.missions.startMission(0);
    } else if (name === 'foot') {
      p.pos.set(90, 0, 250);
      p.heading = 0; // facing south toward the ferris wheel
      this.cameraYaw = p.heading;
      this.cameraPitch = 0.22;
    }
    this.refreshHud(true);
  }

  addMoney(n) {
    this.money += n;
    this.hud.setMoney(this.money);
  }

  damagePlayer(n) {
    if (this.mode !== 'playing') return;
    this.health = Math.max(0, this.health - n);
    this.hud.flashDamage();
    this.hud.setHealth(this.health);
    if (this.health <= 0) this.onWasted();
  }

  onBusted() {
    if (this.mode !== 'playing') return;
    this.mode = 'ended';
    const fine = Math.floor(this.money * 0.1);
    this.money -= fine;
    this.police.clearWanted();
    this.missions.failMission('Busted by the police');
    this.hud.showEnd('BUSTED', 'The Sunset Bay PD caught up with you. Fine: $' + fine +
      '. Your car is impounded; you walk out of the station with your pride dented.');
    this.audio.blip(220);
  }

  onWasted() {
    if (this.mode !== 'playing') return;
    this.mode = 'ended';
    const bill = Math.floor(this.money * 0.1);
    this.money -= bill;
    this.police.clearWanted();
    this.missions.failMission('Mara got wasted');
    this.hud.showEnd('WASTED', 'You wake up in Bay General with a headache and a $' + bill +
      ' hospital bill. The city is still out there.');
    this.audio.blip(180);
  }

  respawn() {
    const atStation = this.hud.el['end-title'].textContent === 'BUSTED';
    const spot = atStation ? PLACES.policeStation : PLACES.hospital;
    if (this.player.car) {
      this.player.car.driver = 'parked';
      this.player.car.stop();
      this.player.car = null;
    }
    this.player.mesh.visible = true;
    this.player.pos.set(spot.x, 0, spot.z);
    this.player.heading = 0;
    this.health = GAME.MAX_HEALTH;
    this.mode = 'playing';
    this.hud.hideEnd();
    this.hud.showGame();
    this.refreshHud(true);
    this.saveProgress();
  }

  saveProgress() {
    saveGame({
      money: this.money,
      missionsDone: this.missions.missionsDone,
      health: this.health,
      x: this.player.pos.x,
      z: this.player.pos.z,
      heading: this.player.heading,
      clockMinutes: this.clockMinutes,
    });
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  refreshHud(force) {
    const h = this.lastHud;
    if (force || h.wanted !== this.police.wanted) {
      this.hud.setWanted(this.police.wanted);
      h.wanted = this.police.wanted;
    }
    if (force || h.money !== Math.floor(this.money)) {
      this.hud.setMoney(this.money);
      h.money = Math.floor(this.money);
    }
    if (force || h.health !== Math.round(this.health)) {
      this.hud.setHealth(this.health);
      h.health = Math.round(this.health);
    }
    const d = districtAt(this.player.pos.x, this.player.pos.z).name;
    if (force || h.district !== d) {
      this.hud.setDistrict(d);
      h.district = d;
    }
  }

  updateCamera(dt) {
    const mouse = this.input.consumeMouse();
    if (mouse.dx !== 0 || mouse.dy !== 0) {
      this.cameraYaw -= mouse.dx * 0.0052;
      this.cameraPitch = clamp(this.cameraPitch + mouse.dy * 0.003, 0.06, 1.15);
      this.lastDragTime = performance.now() / 1000;
    }
    const wheel = this.input.consumeWheel();
    if (wheel !== 0) this.cameraDist = clamp(this.cameraDist + wheel * 3, 6, 20);

    // While driving, the camera eases behind the car unless just dragged.
    const now = performance.now() / 1000;
    if (this.player.inCar && now - this.lastDragTime > 2.5) {
      this.cameraYaw = angleLerp(this.cameraYaw, this.player.car.heading, Math.min(1, dt * 1.6));
    }
    const target = this.player.inCar ? this.player.car.pos : this.player.pos;
    const ty = target.y + 2.4;
    const dist = this.player.inCar ? this.cameraDist + 2.5 : this.cameraDist;
    const horiz = Math.cos(this.cameraPitch) * dist;
    const cx = target.x - Math.sin(this.cameraYaw) * horiz;
    const cz = target.z - Math.cos(this.cameraYaw) * horiz;
    const cy = Math.max(1.4, ty + Math.sin(this.cameraPitch) * dist);
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(target.x, ty, target.z);
  }

  collideCars(dt) {
    const cars = this.cars;
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i], b = cars[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        if (d >= 3.4 || d < 1e-4) continue;
        const push = (3.4 - d) / 2;
        const nx = dx / d, nz = dz / d;
        const aPlayer = a.driver === 'player';
        const bPlayer = b.driver === 'player';
        const impact = Math.abs(a.speed - b.speed);
        a.pos.x -= nx * push; a.pos.z -= nz * push;
        b.pos.x += nx * push; b.pos.z += nz * push;
        if (impact > 5) {
          a.speed *= 0.55;
          b.speed *= 0.55;
          if (aPlayer || bPlayer) {
            this.audio.crash();
            if (aPlayer) a.health -= impact * 0.4;
            if (bPlayer) b.health -= impact * 0.4;
          }
        }
      }
    }
  }

  // The player's car vs pedestrians: running someone over is a crime.
  collideCarWithPeds() {
    if (!this.player.inCar) return;
    const car = this.player.car;
    if (Math.abs(car.speed) < 3) return;
    for (const ped of this.peds.peds) {
      if (ped.state === 'down' || ped.state === 'dead') continue;
      const d = Math.hypot(ped.mesh.position.x - car.pos.x, ped.mesh.position.z - car.pos.z);
      if (d < 2.3) {
        this.peds.knockDown(ped, car.pos.x, car.pos.z);
        this.police.addWanted(1, 'hit a pedestrian');
        this.audio.crash();
        this.peds.scare(car.pos.x, car.pos.z, 25);
      }
    }
  }

  updatePickups(dt) {
    const t = performance.now() / 1000;
    for (const p of this.pickups) {
      if (p.taken) {
        p.timer -= dt;
        if (p.timer <= 0) this.placePickup(p);
        continue;
      }
      p.mesh.rotation.y = t * 2;
      p.mesh.position.y = 1 + Math.sin(t * 3) * 0.15;
      const d = Math.hypot(p.mesh.position.x - this.player.pos.x, p.mesh.position.z - this.player.pos.z);
      if (d < 2.2) {
        p.taken = true;
        p.timer = 60;
        p.mesh.visible = false;
        this.addMoney(GAME.PICKUP_VALUE);
        this.audio.chime();
        this.hud.flashPrompt('+$' + GAME.PICKUP_VALUE + ' — street cash');
      }
    }
  }

  updatePrompt() {
    if (this.mode !== 'playing') return;
    const p = this.player;
    if (!p.inCar) {
      const car = p.nearestCar(this.cars, 4.5);
      if (car) {
        this.hud.setPrompt(car.driver === 'traffic'
          ? 'Press E to steal the car  (the law will notice)'
          : 'Press E to get in the car');
        return;
      }
      const m = this.missions.current;
      if (!this.missions.active && m) {
        const d = Math.hypot(p.pos.x - m.start.x, p.pos.z - m.start.z);
        if (d < 14) {
          this.hud.setPrompt(m.startLabel);
          return;
        }
      }
    }
    this.hud.setPrompt(null);
  }

  debugState() {
    return {
      mode: this.mode,
      money: Math.floor(this.money),
      health: Math.round(this.health),
      wanted: this.police.wanted,
      inCar: this.player.inCar,
      speed: this.player.inCar ? Math.abs(this.player.car.speed) : this.player.speed2D,
      x: Math.round(this.player.pos.x * 10) / 10,
      z: Math.round(this.player.pos.z * 10) / 10,
      missionIndex: this.missions.index,
      missionActive: this.missions.active,
      missionStep: this.missions.step,
      police: this.police.cruisers.length,
      cars: this.cars.length,
      peds: this.peds.peds.length,
    };
  }

  loop() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    // Ferris wheel always turns.
    this.city.ferrisRing.rotation.z += dt * 0.12;
    for (const c of this.city.ferrisCabins) c.rotation.z = -this.city.ferrisRing.rotation.z;

    if (this.mode === 'menu') {
      this.menuOrbit += dt * 0.045;
      const cx = Math.sin(this.menuOrbit) * 150;
      const cz = Math.cos(this.menuOrbit) * 150;
      this.camera.position.set(cx, 55, cz);
      this.camera.lookAt(0, 8, 0);
      this.traffic.update(dt, this.player.pos);
      this.peds.update(dt, this);
      this.renderer.render(this.scene, this.camera);
      this.input.endFrame();
      return;
    }

    if (this.mode === 'playing') {
      if (this.input.wasPressed('Escape')) { this.pause(); this.input.endFrame(); return; }
      if (this.input.wasPressed('KeyM')) {
        const muted = this.audio.toggleMute();
        this.hud.el['btn-mute'].textContent = muted ? 'SOUND: OFF' : 'SOUND: ON';
      }
      this.player.update(dt, this);
      this.traffic.update(dt, this.player.pos);
      this.peds.update(dt, this);
      this.police.update(dt, this);
      this.missions.update(dt);
      this.combat.update(dt);
      this.collideCars(dt);
      this.collideCarWithPeds();
      this.updatePickups(dt);
      if (this.input.consumeClick() && !this.player.inCar) this.combat.shoot(this);
      if (this.input.wasPressed('KeyF') && !this.player.inCar) this.combat.punch(this);

      // Clock, health regen, autosave.
      this.clockMinutes = (this.clockMinutes + dt * GAME.CLOCK_RATE) % 1440;
      if (this.police.wanted === 0 && this.health < GAME.MAX_HEALTH) {
        this.health = Math.min(GAME.MAX_HEALTH, this.health + 2 * dt);
      }
      this.saveTimer += dt;
      if (this.saveTimer > 30) { this.saveTimer = 0; this.saveProgress(); }

      this.updateCamera(dt);
      this.refreshHud(false);
      this.hud.setClock(this.clockMinutes);
      this.hud.setSpeed(this.player.inCar ? Math.abs(this.player.car.speed) * 2.2 : 0, this.player.inCar);
      this.hud.setCrosshair(!this.player.inCar);
      this.updatePrompt();
      this.hud.update(dt);
      this.minimap.draw(this);
      const nearestCop = this.police.cruisers.length
        ? this.police.nearestCruiserDistance(this.player.pos.x, this.player.pos.z)
        : null;
      this.audio.update(this.player.inCar ? Math.abs(this.player.car.speed) : 0, this.player.inCar, nearestCop);
      window.__gameState = this.debugState();
    }

    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }
}

new Game();
