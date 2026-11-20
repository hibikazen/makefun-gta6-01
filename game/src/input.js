// Keyboard and mouse state: held keys, drag-to-orbit camera deltas,
// wheel zoom and edge-triggered action presses (E, F, Space, Esc, M).
import { clamp } from './utils.js';

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDown = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelDelta = 0;
    this.clicked = false;
    this.lastX = 0;
    this.lastY = 0;
    this.enabled = true;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; });

    canvas.addEventListener('pointerdown', (e) => {
      this.mouseDown = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.mouseDown) return;
      this.mouseDX += e.clientX - this.lastX;
      this.mouseDY += e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    const release = () => { this.mouseDown = false; };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.wheelDelta += e.deltaY;
    }, { passive: false });
    canvas.addEventListener('click', () => { this.clicked = true; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  isDown(code) { return this.enabled && this.keys.has(code); }
  wasPressed(code) { return this.enabled && this.pressed.has(code); }

  // Forward/strafe axes in camera space: -1..1.
  moveAxis() {
    let f = 0, s = 0;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) f += 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) f -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) s += 1;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) s -= 1;
    return { forward: f, strafe: s };
  }

  get running() { return this.isDown('ShiftLeft') || this.isDown('ShiftRight'); }

  consumeMouse() {
    const dx = this.mouseDX, dy = this.mouseDY;
    this.mouseDX = 0; this.mouseDY = 0;
    return { dx, dy };
  }

  consumeWheel() {
    const d = clamp(this.wheelDelta / 500, -1, 1);
    this.wheelDelta = 0;
    return d;
  }

  consumeClick() {
    const c = this.clicked;
    this.clicked = false;
    return c;
  }

  // Call at the end of each frame: edge presses live for exactly one frame.
  endFrame() { this.pressed.clear(); }
}
