// Combat: a hitscan pistol with a muzzle flash and tracers, and a punch
// for close work. Shooting in public raises the wanted level.
import * as THREE from 'three';

export class Combat {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.raycaster = new THREE.Raycaster();
    this.cooldown = 0;
    this.punchCooldown = 0;
    this.tracers = [];

    // Muzzle flash: a small additive sprite shown for a blink.
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffe9a8, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), flashMat);
    this.flash.visible = false;
    scene.add(this.flash);
    this.flashTimer = 0;
  }

  fireTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xffe9a8, transparent: true, opacity: 0.9,
    }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  shoot(ctx) {
    if (this.cooldown > 0) return;
    this.cooldown = 0.22;
    const player = ctx.player;
    ctx.audio.shot();
    // Flash at the gun tip.
    const gunWorld = new THREE.Vector3();
    player.gun.getWorldPosition(gunWorld);
    this.flash.position.copy(gunWorld);
    this.flash.lookAt(this.camera.position);
    this.flash.visible = true;
    this.flashTimer = 0.06;

    // Hitscan from the camera through the crosshair.
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.raycaster.set(this.camera.position, dir);
    this.raycaster.far = 70;
    const targets = [];
    for (const p of ctx.peds.peds) {
      if (p.state !== 'dead') targets.push(p.mesh);
    }
    for (const c of ctx.cars) targets.push(c.mesh);
    const hits = this.raycaster.intersectObjects(targets, true);
    let end = this.camera.position.clone().add(dir.clone().multiplyScalar(60));
    if (hits.length > 0) {
      const hit = hits[0];
      end = hit.point.clone();
      let obj = hit.object;
      let ped = null;
      while (obj && !ped) { ped = obj.userData.ped || null; obj = obj.parent; }
      if (ped) {
        const killed = ctx.peds.damage(ped, 34, player.pos.x, player.pos.z);
        ctx.police.addWanted(killed ? 2 : 1, killed ? 'shot a pedestrian' : 'fired a weapon');
        ctx.peds.scare(player.pos.x, player.pos.z, 25);
      } else {
        // Hit a car: damage it, and the law notices shots near police.
        for (const c of ctx.cars) {
          if (hit.object === c.mesh || c.mesh.children.includes(hit.object) ||
              hit.object.parent === c.mesh) {
            c.health -= 20;
            if (c.health <= 0) c.disabled = true;
            if (c.type === 'police') ctx.police.addWanted(1, 'shot at police');
            break;
          }
        }
        ctx.police.addWanted(0, ''); // no-op, keeps the call sites honest
        ctx.peds.scare(player.pos.x, player.pos.z, 20);
      }
    } else {
      ctx.peds.scare(player.pos.x, player.pos.z, 18);
    }
    this.fireTracer(gunWorld, end);
  }

  punch(ctx) {
    if (this.punchCooldown > 0) return;
    this.punchCooldown = 0.45;
    const player = ctx.player;
    ctx.audio.punch();
    const target = ctx.peds.nearestPed(player.pos.x, player.pos.z, 2.4);
    if (!target) return;
    const dx = target.mesh.position.x - player.pos.x;
    const dz = target.mesh.position.z - player.pos.z;
    const facing = Math.sin(player.heading) * dx + Math.cos(player.heading) * dz;
    if (facing < 0) return; // must be roughly in front
    const killed = ctx.peds.damage(target, 25, player.pos.x, player.pos.z);
    if (killed) ctx.police.addWanted(1, 'beat down a pedestrian');
    else ctx.police.addWanted(0, '');
    target.mesh.position.x += (dx / (Math.hypot(dx, dz) || 1)) * 0.8;
    target.mesh.position.z += (dz / (Math.hypot(dx, dz) || 1)) * 0.8;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flash.visible = false;
    }
    for (const t of [...this.tracers]) {
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.tracers.splice(this.tracers.indexOf(t), 1);
      }
    }
  }
}
