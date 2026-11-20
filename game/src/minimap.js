// The circular minimap: roads, buildings, the ocean, the player arrow,
// traffic, flashing police blips and the mission markers — north-up.
import { STREETS } from './config.js';

export class Minimap {
  constructor(canvas, city) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.city = city;
    this.size = canvas.width;
    this.scale = this.size / 660; // world -330..330 maps onto the canvas
  }

  toMap(x, z) {
    return [
      (x + 330) * this.scale,
      (z + 330) * this.scale,
    ];
  }

  draw(game) {
    const g = this.ctx;
    const S = this.size;
    g.clearRect(0, 0, S, S);
    // Ocean to the south.
    g.fillStyle = '#0d1a24';
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#155a7a';
    const [, oceanY] = this.toMap(0, 305);
    g.fillRect(0, oceanY, S, S - oceanY);
    // City ground.
    g.fillStyle = '#232830';
    g.fillRect(0, 0, S, oceanY);
    // Buildings as blocks.
    g.fillStyle = '#3a4150';
    for (const c of this.city.colliders) {
      const [x0, z0] = this.toMap(c.minX, c.minZ);
      const [x1, z1] = this.toMap(c.maxX, c.maxZ);
      g.fillRect(x0, z0, Math.max(1, x1 - x0), Math.max(1, z1 - z0));
    }
    // Roads.
    g.strokeStyle = '#5a6270';
    g.lineWidth = 2;
    for (const s of STREETS) {
      const [x] = this.toMap(s, 0);
      const [, z] = this.toMap(0, s);
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke();
      g.beginPath(); g.moveTo(0, z); g.lineTo(S, z); g.stroke();
    }
    // Mission markers.
    const missions = game.missions;
    const blink = Math.floor(performance.now() / 400) % 2 === 0;
    if (missions.startMarker.visible) {
      const [x, z] = this.toMap(missions.startMarker.position.x, missions.startMarker.position.z);
      this.diamond(g, x, z, blink ? 7 : 5, '#ffd23f');
    }
    if (missions.targetMarker.visible) {
      const [x, z] = this.toMap(missions.targetMarker.position.x, missions.targetMarker.position.z);
      this.diamond(g, x, z, blink ? 7 : 5, '#4de8ff');
    }
    // Traffic (white) and police (flashing red/blue).
    for (const c of game.cars) {
      const [x, z] = this.toMap(c.pos.x, c.pos.z);
      if (c.type === 'police') {
        g.fillStyle = blink ? '#ff2222' : '#2266ff';
        g.beginPath(); g.arc(x, z, 3.4, 0, Math.PI * 2); g.fill();
      } else if (c.driver !== 'player') {
        g.fillStyle = 'rgba(255,255,255,0.75)';
        g.fillRect(x - 1.5, z - 1.5, 3, 3);
      }
    }
    // The player: a white arrow pointing where they face.
    const p = game.player;
    const [px, pz] = this.toMap(p.pos.x, p.pos.z);
    g.save();
    g.translate(px, pz);
    g.rotate(Math.atan2(Math.sin(p.heading), -Math.cos(p.heading)) + Math.PI);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#000000';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(5, 5);
    g.lineTo(0, 2);
    g.lineTo(-5, 5);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }

  diamond(g, x, z, r, color) {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(x, z - r);
    g.lineTo(x + r, z);
    g.lineTo(x, z + r);
    g.lineTo(x - r, z);
    g.closePath();
    g.fill();
  }
}
