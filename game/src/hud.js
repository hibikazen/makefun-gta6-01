// The HUD: wanted stars, money, health, clock, mission objective, banners,
// context prompts, the bust meter, and the start / pause / end screens.
import { GAME } from './config.js';

export class HUD {
  constructor() {
    this.el = {};
    for (const id of [
      'hud', 'wanted-stars', 'clock', 'money', 'health-fill', 'objective-box',
      'objective-title', 'objective-text', 'banner', 'banner-title', 'banner-sub',
      'speed-box', 'speed-value', 'prompt', 'crosshair', 'damage-flash',
      'district-label', 'start-screen', 'btn-start', 'btn-continue',
      'pause-screen', 'pause-stats', 'btn-resume', 'btn-save', 'btn-mute',
      'btn-menu', 'end-screen', 'end-title', 'end-text', 'btn-respawn',
      'controls-hint',
    ]) {
      this.el[id] = document.getElementById(id);
    }
    this.bannerTimer = 0;
    this.promptTimer = 0;
    this.bustProgress = 0;
  }

  showGame() {
    this.el.hud.classList.remove('hidden');
    this.el['start-screen'].classList.add('hidden');
    this.el['pause-screen'].classList.add('hidden');
    this.el['end-screen'].classList.add('hidden');
  }

  showStart(hasSave) {
    this.el['start-screen'].classList.remove('hidden');
    this.el.hud.classList.add('hidden');
    if (hasSave) this.el['btn-continue'].classList.remove('hidden');
    else this.el['btn-continue'].classList.add('hidden');
  }

  showPause(statsText) {
    this.el['pause-stats'].textContent = statsText;
    this.el['pause-screen'].classList.remove('hidden');
  }

  hidePause() { this.el['pause-screen'].classList.add('hidden'); }

  showEnd(kind, text) {
    this.el['end-title'].textContent = kind;
    this.el['end-title'].className = kind.toLowerCase();
    this.el['end-text'].textContent = text;
    this.el['end-screen'].classList.remove('hidden');
  }

  hideEnd() { this.el['end-screen'].classList.add('hidden'); }

  setWanted(n) {
    let html = '';
    for (let i = 0; i < 5; i++) {
      html += i < n ? '&#9733;' : '<span class="dim">&#9733;</span>';
    }
    this.el['wanted-stars'].innerHTML = html;
  }

  setMoney(m) { this.el.money.textContent = '$' + Math.floor(m).toLocaleString('en-US'); }

  setHealth(h) {
    this.el['health-fill'].style.width = Math.max(0, h) + '%';
  }

  setClock(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    const m = Math.floor(minutes % 60);
    this.el.clock.textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  setDistrict(name) { this.el['district-label'].textContent = name; }

  setObjective(title, text) {
    if (!title) {
      this.el['objective-box'].classList.add('hidden');
      return;
    }
    this.el['objective-box'].classList.remove('hidden');
    this.el['objective-title'].textContent = title;
    this.el['objective-text'].textContent = text;
  }

  setSpeed(mph, visible) {
    if (visible) {
      this.el['speed-box'].classList.remove('hidden');
      this.el['speed-value'].textContent = Math.round(mph);
    } else {
      this.el['speed-box'].classList.add('hidden');
    }
  }

  setCrosshair(visible) {
    this.el.crosshair.classList.toggle('hidden', !visible);
  }

  showBanner(title, sub) {
    this.el['banner-title'].textContent = title;
    this.el['banner-sub'].textContent = sub || '';
    this.el.banner.classList.remove('hidden');
    this.bannerTimer = 3.2;
  }

  flashPrompt(text) {
    this.el.prompt.textContent = text;
    this.el.prompt.classList.remove('hidden');
    this.promptTimer = 3;
  }

  setPrompt(text) {
    if (this.promptTimer > 0) return; // a flash prompt owns the slot
    if (text) {
      this.el.prompt.textContent = text;
      this.el.prompt.classList.remove('hidden');
    } else {
      this.el.prompt.classList.add('hidden');
    }
  }

  setBustProgress(p) {
    this.bustProgress = p;
    if (p > 0) {
      this.el.prompt.textContent = 'BUSTED IN ' + Math.ceil((1 - p) * 3) + '… RUN!';
      this.el.prompt.classList.remove('hidden');
    }
  }

  flashDamage() {
    const f = this.el['damage-flash'];
    f.style.opacity = '1';
    setTimeout(() => { f.style.opacity = '0'; }, 180);
  }

  update(dt) {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.el.banner.classList.add('hidden');
    }
    if (this.promptTimer > 0) {
      this.promptTimer -= dt;
      if (this.promptTimer <= 0) this.el.prompt.classList.add('hidden');
    }
  }
}
