// Maus/Touch (Pointer Events) und Tastatur -> logische 320x180-Koordinaten.
import { W, H } from './render.js';

export function attachInput(canvas, handlers) {
  const toLogical = (ev) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.floor(((ev.clientX - r.left) / r.width) * W),
      y: Math.floor(((ev.clientY - r.top) / r.height) * H),
    };
  };
  canvas.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    const p = toLogical(ev);
    handlers.gesture && handlers.gesture();
    handlers.down && handlers.down(p.x, p.y, ev.pointerType || 'mouse');
  });
  canvas.addEventListener('pointermove', (ev) => {
    const p = toLogical(ev);
    handlers.move && handlers.move(p.x, p.y, ev.pointerType || 'mouse');
  });
  canvas.addEventListener('pointerleave', () => handlers.move && handlers.move(-1, -1, 'mouse'));
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
  window.addEventListener('keydown', (ev) => {
    if (ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA')) return;
    handlers.gesture && handlers.gesture();
    if (handlers.key && handlers.key(ev.key, ev)) ev.preventDefault();
  });
}
