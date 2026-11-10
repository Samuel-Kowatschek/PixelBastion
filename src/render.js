// Rendering der Spielwelt. Liest den Simulationszustand nur, verändert ihn nie.
import { PAL, SPR, DARKER, buildSprite, buildSilhouette } from './sprites.js';
import { MAP_THEMES } from './data/balance.js';
import { towerStats } from './game.js';
import { mulberry32 } from './rng.js';
import { drawText, textWidth } from './font.js';

export const W = 320, H = 180, WORLD_H = 160;

const ENEMY_SPRITES = ['runner', 'tank', 'healer', 'splitter', 'flyer', 'mite'];
const TOWER_SPRITES = ['arrow', 'cannon', 'frost', 'tesla', 'poison', 'support'];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.rand = mulberry32(0xb45710); // nur für Optik (Partikel), nie für die Simulation
    this.spr = {};
    this.flash = {};
    for (const k of [...ENEMY_SPRITES, ...ENEMY_SPRITES.map((e) => e + '2'), ...TOWER_SPRITES, 'base', 'plot', 'castle', 'portal', 'boss', 'boss2',
      'heart', 'coin', 'sword', 'skull', 'bolt', 'snow', 'eye', 'hammer', 'star', 'drop', 'hourglass', 'arrowIcon', 'bomb',
      'play', 'pause', 'speaker', 'muted', 'menu', 'flag', 'card', 'rock']) {
      this.spr[k] = buildSprite(SPR[k]);
    }
    for (const k of [...ENEMY_SPRITES, 'boss']) this.flash[k] = buildSilhouette(SPR[k], 7);
    this.particles = [];
    this.floaters = [];
    this.fx = [];
    this.recoil = new Map();
    this.shake = 0;
    this.leakFlash = 0;
    this.frame = 0;
    this.circleCache = new Map();
    this.mapLayer = null;
  }

  // ------------------------------------------------------------ Karte vorrendern
  prepareMap(state) {
    const theme = MAP_THEMES[state.themeIdx];
    this.theme = theme;
    const map = state.map;
    const c = document.createElement('canvas');
    c.width = W; c.height = WORLD_H;
    const g = c.getContext('2d');
    g.fillStyle = PAL[theme.ground];
    g.fillRect(0, 0, W, WORLD_H);
    const pathSet = new Set(map.pathSet);
    const isPath = (x, y) => pathSet.has(y * 1000 + x);
    for (let ty = 0; ty < map.rows; ty++) {
      for (let tx = 0; tx < map.cols; tx++) {
        const r = mulberry32(map.groundVar[ty * map.cols + tx] + 1);
        const px = tx * 16, py = ty * 16;
        if (isPath(tx, ty)) {
          g.fillStyle = PAL[theme.path];
          g.fillRect(px, py, 16, 16);
          g.fillStyle = PAL[theme.pathEdge];
          for (let i = 0; i < 2; i++) g.fillRect(px + 2 + Math.floor(r() * 12), py + 2 + Math.floor(r() * 12), 1, 1);
          if (!isPath(tx, ty - 1)) g.fillRect(px, py, 16, 1);
          if (!isPath(tx, ty + 1)) g.fillRect(px, py + 15, 16, 1);
          if (!isPath(tx - 1, ty) && !(tx === 0)) g.fillRect(px, py, 1, 16);
          if (!isPath(tx + 1, ty) && !(tx === map.cols - 1)) g.fillRect(px + 15, py, 1, 16);
        } else {
          g.fillStyle = PAL[theme.ground2];
          if (r() < 0.5) {
            const x = px + 2 + Math.floor(r() * 12), y = py + 2 + Math.floor(r() * 12);
            g.fillRect(x, y, 1, 1);
            g.fillRect(x + 1, y, 1, 1);
          }
        }
      }
    }
    // Deko
    const decoSprites = {};
    for (const d of map.deco) {
      const r = mulberry32(d.x * 7919 + d.y);
      const dc = theme.deco[Math.floor(r() * theme.deco.length)];
      const key = d.kind + dc;
      if (!decoSprites[key]) {
        decoSprites[key] = buildSprite(SPR[d.kind], { T: theme.tree, H: theme.treeHi, G: theme.ground2, D: dc });
      }
      g.drawImage(decoSprites[key], d.x, d.y);
    }
    // Portal + Burg
    const st = map.startTile, en = map.endTile;
    g.drawImage(this.spr.portal, st.x * 16, st.y * 16);
    g.drawImage(this.spr.castle, en.x * 16, en.y * 16);
    this.mapLayer = c;
    // Nebel = abgedunkelte Kopie der Karte (2 Stufen dunkler, kein Muster)
    const fog = document.createElement('canvas');
    fog.width = W; fog.height = WORLD_H;
    const fg = fog.getContext('2d');
    fg.drawImage(c, 0, 0);
    darkenCtx(fg, 0, 0, W, WORLD_H, 2);
    this.fogLayer = fog;
    this.particles = []; this.floaters = []; this.fx = []; this.recoil.clear();
  }

  // ------------------------------------------------------------ Events -> Effekte
  consumeEvents(events) {
    const R = this.rand;
    for (const e of events) {
      switch (e.type) {
        case 'kill': {
          const col = { runner: 8, tank: 6, healer: 7, splitter: 2, flyer: 9, mite: 14, boss: 2 }[e.enemy] ?? 7;
          const n = e.enemy === 'boss' ? 30 : 8;
          for (let i = 0; i < n; i++) {
            this.particles.push({ x: e.x, y: e.y, vx: (R() - 0.5) * 2.4, vy: (R() - 0.8) * 2.2, life: 14 + R() * 14, c: R() < 0.3 ? 7 : col, g: 0.12 });
          }
          if (e.gold) this.floaters.push({ x: e.x, y: e.y - 6, text: '+' + e.gold, c: 10, life: 36 });
          if (e.enemy === 'boss') this.shake = 14;
          break;
        }
        case 'shoot': this.recoil.set(e.x * 1000 + e.y, 4); break;
        case 'zap': this.fx.push({ kind: 'zap', pts: e.pts, life: 8 }); this.recoil.set(e.pts[0].x * 1000 + e.pts[0].y + 5, 4); break;
        case 'splash': this.fx.push({ kind: 'ring', x: e.x, y: e.y, r: e.r, life: 10, max: 10, c: { cannon: 9, frost: 12, poison: 11 }[e.kind] ?? 7 }); break;
        case 'boom': this.fx.push({ kind: 'ring', x: e.x, y: e.y, r: e.r, life: 8, max: 8, c: 8 }); break;
        case 'hit':
          for (let i = 0; i < 3; i++) this.particles.push({ x: e.x, y: e.y, vx: (R() - 0.5) * 1.5, vy: (R() - 0.5) * 1.5, life: 6 + R() * 5, c: e.kind === 'poison' ? 11 : 7, g: 0 });
          break;
        case 'heal': this.fx.push({ kind: 'ring', x: e.x, y: e.y, r: e.r, life: 12, max: 12, c: 14 }); break;
        case 'leak': this.leakFlash = 14; this.shake = Math.max(this.shake, 6); break;
        case 'build': case 'upgrade':
          for (let i = 0; i < 12; i++) this.particles.push({ x: e.x + (R() - 0.5) * 14, y: e.y + 6, vx: (R() - 0.5) * 1, vy: -R() * 1.2, life: 12 + R() * 10, c: e.type === 'upgrade' ? 10 : 6, g: 0.02 });
          break;
        case 'sell': this.floaters.push({ x: e.x, y: e.y - 8, text: 'VERKAUFT', c: 10, life: 40 }); break;
        case 'boss': this.shake = 10; break;
      }
    }
  }

  // ------------------------------------------------------------ Zeichnen
  drawWorld(state, view) {
    const ctx = this.ctx;
    this.frame++;
    let ox = 0, oy = 0;
    if (this.shake > 0) {
      ox = Math.round((this.rand() - 0.5) * Math.min(4, this.shake / 2));
      oy = Math.round((this.rand() - 0.5) * Math.min(4, this.shake / 2));
      this.shake--;
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, WORLD_H); ctx.clip();
    ctx.translate(ox, oy);
    ctx.drawImage(this.mapLayer, 0, 0);
    if (state.mutator === 'fog') this.drawFog(state);

    // Bauplätze
    for (const p of state.map.plots) {
      if (p.hidden || p.tower !== null) continue;
      ctx.drawImage(this.spr.plot, p.x - 8, p.y - 8);
    }
    if (view.hoverPlot != null) {
      const p = state.map.plots[view.hoverPlot];
      if (p && !p.hidden) this.rectOutline(p.x - 8, p.y - 8, 16, 16, (this.frame >> 3) % 2 ? 10 : 7);
    }

    // Türme
    const towers = state.towers.slice().sort((a, b) => a.y - b.y);
    for (const t of towers) this.drawTower(state, t);

    // Gegner (Boden zuerst, dann Luft)
    const visible = (e) => !state.mutator || state.mutator !== 'fog' || this.inSight(state, e.x, e.y);
    for (const e of state.enemies) if (!e.air && !e.dead && visible(e)) this.drawEnemy(state, e);
    for (const e of state.enemies) if (e.air && !e.dead && visible(e)) this.drawEnemy(state, e);

    // Projektile
    for (const p of state.projectiles) {
      const x = Math.round(p.x), y = Math.round(p.y);
      if (state.mutator === 'fog' && !this.inSight(state, x, y)) continue;
      switch (p.kind) {
        case 'arrow': this.px(x, y, 15); this.px(x - 1, y, 4); this.px(x + 1, y, 7); break;
        case 'cannon': this.box(x - 1, y - 1, 3, 3, 0); this.px(x, y - 1, 5); break;
        case 'frost': this.box(x - 1, y - 1, 2, 2, 12); this.px(x, y, 7); break;
        case 'poison': this.box(x - 1, y - 1, 2, 2, 11); this.px(x - 1, y - 1, 3); break;
      }
    }

    // Effekte
    for (const f of this.fx) {
      if (f.kind === 'zap') {
        for (let i = 0; i < f.pts.length - 1; i++) this.zapLine(f.pts[i], f.pts[i + 1], f.life > 4 ? 7 : 10);
      } else if (f.kind === 'ring') {
        const r = Math.max(1, Math.round(f.r * (1 - f.life / (f.max + 2))));
        this.circle(Math.round(f.x), Math.round(f.y), r, f.c, false);
      }
      f.life--;
    }
    this.fx = this.fx.filter((f) => f.life > 0);

    for (const p of this.particles) {
      p.x += p.vx; p.y += p.vy; p.vy += p.g; p.life--;
      this.px(Math.round(p.x), Math.round(p.y), p.c);
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);

    // Reichweite
    if (view.rangeOf) {
      const { x, y, r } = view.rangeOf;
      this.circle(Math.round(x), Math.round(y), Math.round(r), 7, true);
    }

    for (const f of this.floaters) {
      f.y -= 0.35; f.life--;
      drawText(ctx, f.text, Math.round(f.x - textWidth(f.text) / 2) + 1, Math.round(f.y) + 1, PAL[0]);
      drawText(ctx, f.text, Math.round(f.x - textWidth(f.text) / 2), Math.round(f.y), PAL[f.c]);
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);

    ctx.restore();

    if (this.leakFlash > 0) {
      const c = this.leakFlash % 4 < 2 ? 8 : 2;
      this.box(0, 0, W, 2, c); this.box(0, WORLD_H - 2, W, 2, c);
      this.box(0, 0, 2, WORLD_H, c); this.box(W - 2, 0, 2, WORLD_H, c);
      this.leakFlash--;
    }
  }

  drawTower(state, t) {
    const ctx = this.ctx;
    const key = t.x * 1000 + t.y;
    let rec = this.recoil.get(key) || 0;
    if (rec > 0) this.recoil.set(key, rec - 1);
    const x = t.x - 8, y = t.y - 8;
    ctx.drawImage(this.spr.base, x, y);
    const flip = t.aimX !== undefined && t.aimX < t.x && t.type === 'cannon';
    if (flip) {
      ctx.save(); ctx.translate(x + 16, y + (rec > 0 ? 1 : 0)); ctx.scale(-1, 1); ctx.drawImage(this.spr[t.type], 0, 0); ctx.restore();
    } else {
      ctx.drawImage(this.spr[t.type], x, y + (rec > 0 ? 1 : 0));
    }
    if (t.type === 'tesla' && (this.frame >> 2) % 3 === 0) this.px(t.x - 1 + ((this.frame >> 4) % 3), y + 1, 7);
    // Stufen-Punkte
    for (let i = 0; i < t.level; i++) this.box(x + 5 + i * 4, y + 13, 2, 1, t.path === 'A' ? 9 : 12);
  }

  drawEnemy(state, e) {
    const ctx = this.ctx;
    const big = e.type === 'boss';
    const size = big ? 16 : 8;
    const frame = ((this.frame >> 3) + e.id) % 2 === 0 ? '' : '2';
    let x = Math.round(e.x - size / 2), y = Math.round(e.y - size / 2);
    if (e.air) {
      y -= 3 + ((this.frame >> 4) + e.id) % 2;
      this.box(Math.round(e.x) - 2, Math.round(e.y) + 3, 4, 1, 0);
    }
    const name = big ? 'boss' : e.type;
    const img = e.hitFlash > 0 ? this.flash[name] : this.spr[name + frame] || this.spr[name];
    ctx.drawImage(img, x, y);
    if (e.slowT > 0) this.px(x + 1, y + 1, 12);
    if (e.stunT > 0) { this.px(x + size / 2, y - 2, 10); this.px(x + size / 2 - 2, y - 1, 10); }
    if (e.poison.length) this.px(x + size - 2, y + 1, 11);
    // HP-Balken
    if (e.hp < e.maxHp) {
      const bw = big ? 16 : 8;
      const fw = Math.max(1, Math.round(bw * Math.max(0, e.hp) / e.maxHp));
      this.box(x, y - 2, bw, 1, 2);
      this.box(x, y - 2, fw, 1, e.hp / e.maxHp > 0.4 ? 11 : 8);
    }
  }

  inSight(state, x, y) {
    const b = state.map.base;
    if ((x - b.x) ** 2 + (y - b.y) ** 2 <= 30 * 30) return true;
    for (const t of state.towers) {
      const r = t.type === 'support' ? 30 : towerStatsCached(state, t).range;
      if ((x - t.x) ** 2 + (y - t.y) ** 2 <= r * r) return true;
    }
    return false;
  }

  drawFog(state) {
    // Dunkle Karte über alles, dann Sichtbereiche (Turmreichweiten) wieder hell
    this.ctx.drawImage(this.fogLayer, 0, 0);
    const reveal = (cx, cy, r) => {
      for (const [dy, dx] of this.spans(r)) {
        const y = cy + dy, x = cx - dx, w = dx * 2 + 1;
        if (y < 0 || y >= WORLD_H) continue;
        const sx = Math.max(0, x), sw = Math.min(W, x + w) - sx;
        if (sw > 0) this.ctx.drawImage(this.mapLayer, sx, y, sw, 1, sx, y, sw, 1);
      }
    };
    reveal(Math.round(state.map.base.x), Math.round(state.map.base.y), 30);
    for (const t of state.towers) reveal(t.x, t.y, Math.round(t.type === 'support' ? 30 : towerStatsCached(state, t).range));
  }

  /** Bereich des Bildschirms um `steps` Palettenstufen abdunkeln. */
  darken(x, y, w, h, steps = 1) { darkenCtx(this.ctx, x, y, w, h, steps); }

  // ------------------------------------------------------------ Primitive
  px(x, y, c) { this.ctx.fillStyle = PAL[c]; this.ctx.fillRect(x, y, 1, 1); }
  box(x, y, w, h, c) { this.ctx.fillStyle = PAL[c]; this.ctx.fillRect(x, y, w, h); }
  rectOutline(x, y, w, h, c) {
    this.box(x, y, w, 1, c); this.box(x, y + h - 1, w, 1, c);
    this.box(x, y, 1, h, c); this.box(x + w - 1, y, 1, h, c);
  }
  spans(r) {
    if (!this.circleCache.has(r)) {
      const s = [];
      for (let dy = -r; dy <= r; dy++) s.push([dy, Math.floor(Math.sqrt(r * r - dy * dy))]);
      this.circleCache.set(r, s);
    }
    return this.circleCache.get(r);
  }
  /** Pixel-Kreis (Mittelpunkt-Algorithmus), optional gepunktet. */
  circle(cx, cy, r, c, dotted) {
    this.ctx.fillStyle = PAL[c];
    let x = r, y = 0, err = 1 - r, i = 0;
    while (x >= y) {
      if (!dotted || (i >> 1) % 2 === 0) {
        for (const [a, b] of [[x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]]) this.ctx.fillRect(cx + a, cy + b, 1, 1);
      }
      y++; i++;
      if (err < 0) err += 2 * y + 1;
      else { x--; err += 2 * (y - x) + 1; }
    }
  }
  line(x0, y0, x1, y1, c) {
    this.ctx.fillStyle = PAL[c];
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let n = 0; n < 400; n++) {
      this.ctx.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  zapLine(a, b, c) {
    const mx = (a.x + b.x) / 2 + (this.rand() - 0.5) * 6;
    const my = (a.y + b.y) / 2 + (this.rand() - 0.5) * 6;
    this.line(a.x, a.y, mx, my, c);
    this.line(mx, my, b.x, b.y, c);
  }
}

// Palettenfarbe -> dunklere Palettenfarbe, direkt auf Pixeldaten.
const DARK_LUT = (() => {
  const m = new Map();
  const rgb = PAL.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  rgb.forEach((c, i) => m.set((c[0] << 16) | (c[1] << 8) | c[2], i));
  return { m, rgb };
})();
export function darkenCtx(ctx, x, y, w, h, steps = 1) {
  const img = ctx.getImageData(x, y, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let idx = DARK_LUT.m.get((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    if (idx === undefined) idx = 0;
    for (let k = 0; k < steps; k++) idx = DARKER[idx];
    const c = DARK_LUT.rgb[idx];
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
  }
  ctx.putImageData(img, x, y);
}

// Kleiner Cache, damit der Nebel nicht jeden Frame alle Buffs neu rechnet.
const statCache = new WeakMap();
function towerStatsCached(state, t) {
  const c = statCache.get(t);
  if (c && c.tick === state.tick) return c.st;
  const st = towerStats(state, t);
  statCache.set(t, { tick: state.tick, st });
  return st;
}
export { towerStatsCached };
