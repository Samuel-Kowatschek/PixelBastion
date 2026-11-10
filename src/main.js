// Einstieg: Canvas-Skalierung, Fixed-Timestep-Schleife (60 Ticks/s), Verdrahtung.
import { Renderer, W, H } from './render.js';
import { Chip } from './audio.js';
import { App } from './ui.js';
import { attachInput } from './input.js';
import { step } from './game.js';
import { TPS } from './data/balance.js';

const canvas = document.getElementById('screen');
canvas.width = W;
canvas.height = H;

function resize() {
  const s = Math.max(1, Math.floor(Math.min(window.innerWidth / W, window.innerHeight / H)));
  canvas.style.width = W * s + 'px';
  canvas.style.height = H * s + 'px';
}
window.addEventListener('resize', resize);
resize();

const renderer = new Renderer(canvas);
const audio = new Chip();
const app = new App(renderer, audio);
window.__app = app; // für Debugging/Tests im Browser

attachInput(canvas, {
  gesture: () => audio.init(),
  down: (x, y, t) => app.onDown(x, y, t),
  move: (x, y, t) => app.onMove(x, y, t),
  key: (k, ev) => app.onKey(k, ev),
});

function playSounds(events) {
  for (const e of events) {
    switch (e.type) {
      case 'shoot': audio.sfx('shoot_' + e.tower); break;
      case 'zap': audio.sfx('zap'); break;
      case 'splash': if (e.kind === 'cannon') audio.sfx('hit'); break;
      case 'kill':
        audio.sfx(e.enemy === 'boss' ? 'bosskill' : 'kill');
        if (e.combo && e.combo % 10 === 0) audio.sfx('combo');
        break;
      case 'leak': audio.sfx('leak'); break;
      case 'waveStart': audio.sfx(e.boss ? 'boss' : 'wave'); break;
      case 'build': audio.sfx('build'); break;
      case 'upgrade': audio.sfx('upgrade'); break;
      case 'sell': audio.sfx('sell'); break;
      case 'victory': audio.sfx('victory'); break;
      case 'defeat': audio.sfx('defeat'); break;
    }
  }
}

const STEP_MS = 1000 / TPS;
let last = performance.now();
let acc = 0;

function frame(now) {
  const dt = Math.min(250, now - last);
  last = now;
  const g = app.game;
  if (app.screen === 'game' && g && !app.paused && !app.tutorial && !g.over && g.phase !== 'pick') {
    acc += dt * app.speed;
    let n = 0;
    while (acc >= STEP_MS && n < 40) {
      step(g);
      acc -= STEP_MS;
      n++;
      if (g.over || g.phase === 'pick') { acc = 0; break; }
    }
    if (n >= 40) acc = 0;
  } else {
    acc = 0;
  }
  if (g && g.events.length) {
    app.afterSteps();
    renderer.consumeEvents(g.events);
    playSounds(g.events);
    g.events.length = 0;
  } else if (g) {
    app.afterSteps();
  }
  app.draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Fortschritt sichern, wenn der Tab verlassen wird
const persist = () => app.saveProgress();
window.addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    persist();
    if (app.screen === 'game' && app.game && !app.game.over) app.paused = true;
  }
});
