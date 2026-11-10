// UI: Menü, HUD, Popups, Kartenwahl, Endscreen, Teilen. Immediate-Mode-Buttons auf dem Canvas.
import { PAL } from './sprites.js';
import { W, H, WORLD_H, towerStatsCached } from './render.js';
import { drawText, drawTextShadow, drawTextCentered, textWidth, wrapText, normalize } from './font.js';
import {
  createGame, applyAction, towerStats, towerCost, upgradeCost, sellValue, seedInfo, getResult, replay, waveReached,
} from './game.js';
import { TOWERS } from './data/towers.js';
import { ENEMIES } from './data/enemies.js';
import { RELICS } from './data/relics.js';
import { MUTATORS } from './data/mutators.js';
import { CARD_KIND_LABEL, TOWER_CARD_DUP_GOLD } from './data/cards.js';
import { ICON_FOR } from './sprites.js';
import { TPS, MAP_THEMES } from './data/balance.js';
import { utcDateString, dailyNumber } from './rng.js';
import * as store from './storage.js';

const KIND_COLOR = { tower: 11, upgrade: 12, relic: 9, risk: 8 };

function fmtDate(d) { return `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`; }
function fmtTime(ticks) {
  const s = Math.floor(ticks / TPS);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Text für den Teilen-Button. */
export function buildShareText(result, practice = false) {
  const no = result.date ? dailyNumber(result.date) : null;
  const head = result.mode === 'free' ? `Pixel Bastion Freeplay "${result.seed}"` : `Pixel Bastion Daily #${no}`;
  const mut = MUTATORS[result.mutator].name;
  const wave = result.won ? `Welle ${result.waves}/${result.waves} 🏆` : `Welle ${result.wave}`;
  let emo = '';
  for (const w of result.waveLog) {
    if (w.died) emo += '💀';
    else if (w.boss) emo += w.livesLost === 0 ? '👑' : '🟧';
    else if (w.livesLost === 0) emo += '🟩';
    else if (w.livesLost <= 2) emo += '🟨';
    else emo += '🟥';
  }
  return `${head} -> ${wave} | ${result.lives} Leben | Mutator: ${mut}${practice ? ' (Übungsrun)' : ''}\n${emo}\nScore: ${result.score}`;
}

export class App {
  constructor(renderer, audio) {
    this.r = renderer;
    this.ctx = renderer.ctx;
    this.audio = audio;
    this.screen = 'menu';
    this.buttons = [];
    this.mouse = { x: -1, y: -1 };
    this.pointerType = 'mouse';
    this.speed = 1;
    this.paused = false;
    this.sel = null;
    this.armed = null;
    this.toast = null;
    this.frame = 0;
    this.game = null;
    this.run = null;
    this.result = null;
    const data = store.load();
    this.audio.setMuted(!!data.muted);
    this.refreshDay();
  }

  // ======================================================================= Setup
  refreshDay() {
    this.today = utcDateString();
    this.dailyNo = dailyNumber(this.today);
    this.todayInfo = seedInfo(this.today);
    if (this.screen === 'menu') {
      this.preview = createGame({ seed: this.today, mode: 'daily', date: this.today });
      this.r.prepareMap(this.preview);
    }
  }

  startRun(mode) {
    let seed = this.today, date = this.today;
    let resume = null;
    if (mode === 'daily') {
      const st = store.todayStatus(this.today);
      if (st === 'none') store.startDaily(this.today);
      else if (st === 'running') resume = store.todayEntry(this.today);
      else mode = 'practice';
    }
    if (mode === 'free-again') {
      mode = 'free';
      seed = this.run.cfg.seed;
      date = null;
    } else if (mode === 'free') {
      let s = null;
      try { s = window.prompt('Seed für Freeplay eingeben:', 'FREE-' + Date.now().toString(36).slice(-5).toUpperCase()); } catch (e) { s = null; }
      if (s === null) return;
      seed = s.trim() || 'FREE';
      date = null;
    }
    const cfg = { seed, mode, date };
    this.game = resume ? replay(cfg, resume.inputs, resume.tick) : createGame(cfg);
    this.game.events.length = 0;
    this.run = { mode, cfg, counted: mode === 'daily', finished: false, isBest: false };
    this.r.prepareMap(this.game);
    this.screen = 'game';
    this.speed = 1;
    this.paused = !!resume;
    this.tutorial = !resume && !store.load().hideTutorial;
    this.sel = null;
    this.armed = null;
    this.result = null;
    if (resume) this.showToast('FORTGESETZT - PAUSIERT');
    else if (mode === 'practice') this.showToast('ÜBUNGSRUN - OHNE WERTUNG');
    this.audio.startMusic();
  }

  toMenu() {
    if (this.run && this.run.counted && !this.run.finished) this.saveProgress();
    this.screen = 'menu';
    this.game = null;
    this.sel = null;
    this.refreshDay();
  }

  saveProgress() {
    if (!this.game || !this.run || !this.run.counted || this.run.finished) return;
    store.saveProgress(this.game.date, this.game.inputs, this.game.tick);
  }

  showToast(text, frames = 120) { this.toast = { text, t: frames }; }

  act(action) {
    if (!this.game) return false;
    const ok = applyAction(this.game, action);
    if (ok) this.saveProgress();
    else this.audio.sfx('error');
    return ok;
  }

  // ======================================================================= Schleife
  /** Wird nach den Sim-Schritten aufgerufen. */
  afterSteps() {
    const g = this.game;
    if (!g || !this.run) return;
    if (g.events.some((e) => e.type === 'waveEnd')) this.saveProgress();
    if (g.over && !this.run.finished) {
      this.run.finished = true;
      this.result = getResult(g);
      if (this.run.counted) this.run.isBest = store.finishDaily(g.date, this.result, dailyNumber(g.date));
      this.sel = null;
    }
  }

  // ======================================================================= Eingaben
  onMove(x, y, type) {
    this.pointerType = type;
    this.mouse = { x, y };
  }

  onDown(x, y, type) {
    this.pointerType = type;
    this.mouse = { x, y };
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i];
      if (x < b.x || y < b.y || x >= b.x + b.w || y >= b.y + b.h) continue;
      if (!b.onClick) { if (b.block) return; continue; }
      if (b.disabled) { this.audio.sfx('error'); this.armed = b.id; return; }
      if (b.confirm && type === 'touch' && this.armed !== b.id) {
        this.armed = b.id;
        this.audio.sfx('click');
        return;
      }
      this.armed = null;
      this.audio.sfx('click');
      b.onClick();
      return;
    }
    this.armed = null;
    if (this.screen === 'game' && this.game && y < WORLD_H && this.game.phase !== 'pick' && !this.game.over) this.worldClick(x, y);
  }

  worldClick(x, y) {
    const tx = Math.floor(x / 16), ty = Math.floor(y / 16);
    const p = this.game.map.plots.find((q) => q.tx === tx && q.ty === ty && !q.hidden);
    if (!p) { this.sel = null; return; }
    if (p.tower !== null) this.sel = { kind: 'tower', id: p.tower };
    else this.sel = { kind: 'plot', id: p.id };
    this.audio.sfx('click');
  }

  onKey(key) {
    const k = key.length === 1 ? key.toLowerCase() : key;
    if (k === 'm') { this.toggleMute(); return true; }
    if (this.screen === 'menu') {
      if (k === 'Enter' || k === ' ') { this.startRun('daily'); return true; }
      if (k === 'f') { this.startRun('free'); return true; }
      if (k === 'v') { this.screen = 'history'; return true; }
      if (k === 'h') { this.screen = 'help'; return true; }
      return false;
    }
    if (this.screen === 'history' || this.screen === 'help') {
      if (k === 'Escape' || k === 'Enter' || k === ' ') { this.screen = 'menu'; return true; }
      return false;
    }
    const g = this.game;
    if (!g) return false;
    if (this.tutorial) {
      if (k === 'Enter' || k === ' ' || k === 'Escape') { this.tutorial = false; return true; }
      return false;
    }
    if (g.over) {
      if (k === 'Enter' || k === 'Escape') { this.toMenu(); return true; }
      if (k === 's') { this.share(); return true; }
      return false;
    }
    if (g.phase === 'pick') {
      if (k >= '1' && k <= '3') { if (this.act({ a: 'pick', card: +k - 1 })) this.audio.sfx('pick'); return true; }
      if (k === 'p' || k === 'Escape') { this.paused = !this.paused; return true; }
      return false;
    }
    if (k === ' ') {
      if (g.phase === 'build') this.act({ a: 'start' });
      else this.paused = !this.paused;
      return true;
    }
    if (k === 'p') { this.paused = !this.paused; return true; }
    if (k === 'f' || k === 'Tab') { this.cycleSpeed(); return true; }
    if (k === 'Escape') { if (this.sel) this.sel = null; else this.paused = !this.paused; return true; }
    if (k >= '1' && k <= '6') {
      const plot = this.selPlot() ?? this.hoverPlot();
      const type = g.unlocked[+k - 1];
      if (plot != null && type) { if (this.act({ a: 'build', plot, type })) { this.sel = { kind: 'tower', id: g.map.plots[plot].tower }; } }
      return true;
    }
    const tw = this.selTower();
    if (tw) {
      if (k === 'q' || k === 'e') {
        const path = tw.path || (k === 'q' ? 'A' : 'B');
        this.act({ a: 'upgrade', tower: tw.id, path });
        return true;
      }
      if (k === 'x' || k === 'Delete' || k === 'Backspace') { if (this.act({ a: 'sell', tower: tw.id })) this.sel = null; return true; }
    }
    return false;
  }

  toggleMute() {
    const m = !this.audio.muted;
    this.audio.setMuted(m);
    store.setMuted(m);
  }

  cycleSpeed() { this.speed = this.speed >= 3 ? 1 : this.speed + 1; }

  selPlot() { return this.sel && this.sel.kind === 'plot' ? this.sel.id : null; }
  selTower() {
    if (!this.sel || this.sel.kind !== 'tower' || !this.game) return null;
    return this.game.towers.find((t) => t.id === this.sel.id) || null;
  }
  hoverPlot() {
    if (!this.game || this.mouse.y < 0 || this.mouse.y >= WORLD_H) return null;
    const tx = Math.floor(this.mouse.x / 16), ty = Math.floor(this.mouse.y / 16);
    const p = this.game.map.plots.find((q) => q.tx === tx && q.ty === ty && !q.hidden && q.tower === null);
    return p ? p.id : null;
  }

  async share() {
    const res = this.result || (store.todayEntry(this.today) || {}).result;
    if (!res) return;
    const text = buildShareText(res, this.run ? this.run.mode === 'practice' : false);
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) { ok = false; }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        ok = document.execCommand('copy');
        ta.remove();
      } catch (e) { ok = false; }
    }
    this.showToast(ok ? 'IN ZWISCHENABLAGE KOPIERT!' : 'KOPIEREN FEHLGESCHLAGEN');
    if (!ok) console.log(text);
  }

  // ======================================================================= Zeichen-Helfer
  box(x, y, w, h, c) { this.ctx.fillStyle = PAL[c]; this.ctx.fillRect(x, y, w, h); }
  frameBox(x, y, w, h, bg, border) {
    this.box(x, y, w, h, border);
    this.box(x + 1, y + 1, w - 2, h - 2, bg);
  }
  dim(x = 0, y = 0, w = W, h = H, steps = 2) {
    this.r.darken(x, y, w, h, steps);
  }

  hovered(x, y, w, h) { const m = this.mouse; return m.x >= x && m.y >= y && m.x < x + w && m.y < y + h; }

  /**
   * Button registrieren + zeichnen.
   * opts: onClick, disabled, info, confirm, color, text, icon, scale, id, hidden
   */
  button(x, y, w, h, label, opts = {}) {
    const id = opts.id || label + '@' + x + ',' + y;
    const hov = this.hovered(x, y, w, h);
    const armed = this.armed === id;
    if (!opts.hidden) {
      const base = opts.disabled ? 5 : (opts.color ?? 1);
      const border = opts.disabled ? 5 : armed ? 10 : hov ? 7 : (opts.border ?? 13);
      this.frameBox(x, y, w, h, opts.disabled ? 0 : hov ? (opts.hoverColor ?? 2) : base, border);
      let tx = x + Math.floor(w / 2);
      const scale = opts.scale || 1;
      if (opts.icon) {
        const img = this.r.spr[opts.icon];
        if (label) {
          const tw = textWidth(label, scale) + 10;
          this.ctx.drawImage(img, Math.round(tx - tw / 2), y + Math.floor((h - 8) / 2));
          drawText(this.ctx, label, Math.round(tx - tw / 2) + 10, y + Math.floor((h - 5 * scale) / 2), PAL[opts.disabled ? 5 : (opts.text ?? 7)], scale);
        } else this.ctx.drawImage(img, x + Math.floor((w - 8) / 2), y + Math.floor((h - 8) / 2));
      } else if (label) {
        drawTextCentered(this.ctx, armed && !opts.disabled ? 'OK?' : label, tx, y + Math.floor((h - 5 * scale) / 2) + (scale > 1 ? 1 : 0), PAL[opts.disabled ? 6 : (opts.text ?? 7)], scale);
      }
    }
    this.buttons.push({ x, y, w, h, id, onClick: opts.onClick, disabled: opts.disabled, info: opts.info, confirm: opts.confirm });
    return hov || armed;
  }

  /** Nur Tooltip-Fläche. */
  tip(x, y, w, h, info) {
    this.buttons.push({ x, y, w, h, id: 'tip' + x + ',' + y, info });
  }

  currentInfo() {
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i];
      if (this.armed && b.id === this.armed && b.info) return b.info;
    }
    if (this.pointerType !== 'touch') {
      for (let i = this.buttons.length - 1; i >= 0; i--) {
        const b = this.buttons[i];
        if (b.info && this.hovered(b.x, b.y, b.w, b.h)) return b.info;
      }
    }
    return null;
  }

  // ======================================================================= Hauptzeichnen
  draw() {
    this.frame++;
    if (this.screen === 'menu' && utcDateString() !== this.today) this.refreshDay();
    this.buttons = [];
    this.ctx.fillStyle = PAL[0];
    this.ctx.fillRect(0, 0, W, H);
    if (this.screen === 'menu') this.drawMenu();
    else if (this.screen === 'history') this.drawHistory();
    else if (this.screen === 'help') this.drawHelp();
    else if (this.screen === 'game') this.drawGame();
    if (this.toast) {
      const tw = textWidth(this.toast.text) + 10;
      const ty = this.screen === 'game' ? 22 : 146;
      this.frameBox(Math.round(W / 2 - tw / 2), ty, tw, 11, 0, 10);
      drawTextCentered(this.ctx, this.toast.text, W / 2, ty + 3, PAL[10]);
      if (--this.toast.t <= 0) this.toast = null;
    }
  }

  // ----------------------------------------------------------------------- Menü
  drawMenu() {
    const ctx = this.ctx;
    this.r.drawWorld(this.preview, {});
    this.dim();
    const status = store.todayStatus(this.today);
    const info = this.todayInfo;
    const mut = MUTATORS[info.mutator];
    // Titel
    const bob = Math.round(Math.sin(this.frame / 30));
    drawTextCentered(ctx, 'PIXEL BASTION', W / 2 + 2, 9 + bob + 2, PAL[2], 3);
    drawTextCentered(ctx, 'PIXEL BASTION', W / 2, 9 + bob, PAL[10], 3);
    drawTextCentered(ctx, `DAILY #${this.dailyNo}  -  ${fmtDate(this.today)} (UTC)`, W / 2, 30, PAL[7], 1, PAL[0]);
    // Mutator
    this.frameBox(46, 39, 228, 23, 0, 9);
    drawTextCentered(ctx, 'MUTATOR DES TAGES: ' + mut.name, W / 2, 42, PAL[9]);
    const ml = wrapText(mut.desc, 55);
    ml.forEach((l, i) => drawTextCentered(ctx, l, W / 2, 49 + i * 6, PAL[6]));
    this.tip(46, 39, 228, 23, `${info.waveCount} WELLEN, THEMA: ${info.theme.name}`);
    // Hauptbutton
    const label = status === 'done' ? 'ÜBUNGSRUN' : status === 'running' ? 'FORTSETZEN' : 'DAILY SPIELEN';
    const pulse = (this.frame >> 4) % 2 ? 10 : 9;
    this.box(78, 64, 164, 26, pulse);
    this.button(80, 66, 160, 22, label, {
      scale: 2, color: status === 'done' ? 1 : 3, hoverColor: status === 'done' ? 13 : 11, border: 7, text: 7,
      onClick: () => this.startRun('daily'),
      info: status === 'done' ? 'HEUTIGER VERSUCH ZÄHLT SCHON - WEITERE RUNS OHNE WERTUNG' : status === 'running' ? 'DEIN HEUTIGER DAILY-RUN WIRD FORTGESETZT' : 'EIN ZÄHLENDER VERSUCH PRO TAG (ENTER)',
    });
    // Status
    const streak = store.currentStreak(this.today);
    const data = store.load();
    let line = `STREAK: ${streak}   BESTER SCORE: ${data.best}`;
    drawTextCentered(ctx, line, W / 2, 95, PAL[7], 1, PAL[0]);
    if (status === 'done') {
      const r = store.todayEntry(this.today).result;
      if (r) drawTextCentered(ctx, `HEUTE: ${r.score} PUNKTE - WELLE ${r.wave}/${r.waves}${r.won ? ' - SIEG' : ''}`, W / 2, 103, PAL[11], 1, PAL[0]);
    } else if (status === 'running') {
      drawTextCentered(ctx, 'HEUTIGER VERSUCH LÄUFT NOCH', W / 2, 103, PAL[9], 1, PAL[0]);
    }
    // Weitere Buttons
    const bw = 64, gap = 6;
    const btns = [
      ['FREEPLAY', () => this.startRun('free'), 'BELIEBIGER SEED, OHNE WERTUNG (F)'],
      ['VERLAUF', () => { this.screen = 'history'; }, 'DEINE LETZTEN DAILY-RUNS (V)'],
      ['HILFE', () => { this.screen = 'help'; }, 'STEUERUNG UND REGELN (H)'],
    ];
    if (status === 'done') btns.push(['TEILEN', () => { this.result = null; this.run = null; this.share(); }, 'ERGEBNIS IN DIE ZWISCHENABLAGE']);
    const tot = btns.length * bw + (btns.length - 1) * gap;
    btns.forEach(([l, fn, inf], i) => this.button(Math.round(W / 2 - tot / 2) + i * (bw + gap), 112, bw, 14, l, { onClick: fn, info: inf, color: l === 'TEILEN' ? 3 : 1 }));
    this.button(W - 18, 2, 16, 14, '', { icon: this.audio.muted ? 'muted' : 'speaker', onClick: () => this.toggleMute(), info: 'TON AN/AUS (M)' });
    // Info-Zeile
    const inf = this.currentInfo() || `${info.waveCount} WELLEN  -  THEMA: ${info.theme.name}  -  TÜRME: ${info.allowed.length}`;
    drawTextCentered(ctx, inf, W / 2, 134, PAL[6], 1, PAL[0]);
    drawTextCentered(ctx, 'SEED = HASH(UTC-DATUM) - GLEICHE KARTE FÜR ALLE', W / 2, 170, PAL[5]);
  }

  drawHistory() {
    const ctx = this.ctx;
    this.frameBox(10, 6, 300, 168, 0, 13);
    drawTextCentered(ctx, 'VERLAUF', W / 2, 11, PAL[10], 2);
    const h = store.load().history;
    if (!h.length) drawTextCentered(ctx, 'NOCH KEINE DAILY-RUNS', W / 2, 60, PAL[6]);
    const cols = [18, 66, 96, 130, 158, 200];
    ['DATUM', 'NR.', 'WELLE', 'LEBEN', 'SCORE', 'MUTATOR'].forEach((t, i) => drawText(ctx, t, cols[i], 28, PAL[13]));
    h.slice(0, 16).forEach((r, i) => {
      const y = 37 + i * 7;
      const c = r.won ? 11 : 7;
      drawText(ctx, fmtDate(r.date), cols[0], y, PAL[c]);
      drawText(ctx, '#' + r.no, cols[1], y, PAL[c]);
      drawText(ctx, `${r.wave}/${r.waves}`, cols[2], y, PAL[c]);
      drawText(ctx, String(r.lives), cols[3], y, PAL[c]);
      drawText(ctx, String(r.score), cols[4], y, PAL[c]);
      drawText(ctx, MUTATORS[r.mutator] ? MUTATORS[r.mutator].name : '?', cols[5], y, PAL[c]);
    });
    this.button(W / 2 - 30, 156, 60, 13, 'ZURÜCK', { onClick: () => { this.screen = 'menu'; } });
  }

  drawHelp() {
    const ctx = this.ctx;
    this.frameBox(6, 4, 308, 172, 0, 13);
    drawTextCentered(ctx, 'HILFE', W / 2, 8, PAL[10], 2);
    const lines = [
      ['ZIEL', 'HALTE ALLE WELLEN AUF. BOSSE IN DER MITTE UND AM ENDE.', 9],
      ['BAUEN', 'BAUPLATZ ANTIPPEN -> TURM WÄHLEN. TOUCH: 2X TIPPEN.', 7],
      ['UPGRADE', 'TURM ANTIPPEN -> PFAD A ODER B (JE 2 STUFEN).', 7],
      ['KARTEN', 'NACH JEDER WELLE 1 VON 3: TURM, UPGRADE, RELIKT, RISIKO.', 7],
      ['DAILY', 'EIN ZÄHLENDER VERSUCH PRO TAG, DANACH ÜBUNGSRUNS.', 7],
      ['SCORE', 'WELLEN + LEBEN + ZEITBONUS + KILL-COMBO + KILLS.', 7],
      ['', '', 0],
      ['TASTEN', '1-6 TURM BAUEN   Q/E UPGRADE A/B   X VERKAUFEN', 12],
      ['', 'LEERTASTE WELLE STARTEN / PAUSE   P PAUSE', 12],
      ['', 'F TEMPO 1X/2X/3X   M TON   ESC ABWÄHLEN', 12],
      ['', '1-3 KARTE WÄHLEN   S TEILEN (ENDSCREEN)', 12],
      ['', '', 0],
      ['FLIEGER', 'NUR PFEIL, FROST, BLITZ UND GIFT TREFFEN FLIEGER.', 14],
      ['RÜSTUNG', 'MINDERT SCHADEN PRO TREFFER. GIFT IGNORIERT SIE.', 14],
    ];
    lines.forEach(([a, b, c], i) => {
      drawText(ctx, a, 14, 28 + i * 9, PAL[10]);
      drawText(ctx, b, 54, 28 + i * 9, PAL[c]);
    });
    this.button(W / 2 - 30, 160, 60, 13, 'ZURÜCK', { onClick: () => { this.screen = 'menu'; } });
  }

  // ----------------------------------------------------------------------- Spiel
  drawGame() {
    const g = this.game;
    const ctx = this.ctx;
    // Auswahl validieren
    if (this.sel && this.sel.kind === 'tower' && !this.selTower()) this.sel = null;
    if (this.sel && this.sel.kind === 'plot' && g.map.plots[this.sel.id].tower !== null) this.sel = { kind: 'tower', id: g.map.plots[this.sel.id].tower };

    const view = { hoverPlot: null, rangeOf: null };
    if (this.pointerType !== 'touch') view.hoverPlot = this.hoverPlot();
    if (this.selPlot() !== null) view.hoverPlot = this.selPlot();
    const tw = this.selTower();
    if (tw) view.rangeOf = { x: tw.x, y: tw.y, r: towerStatsCached(g, tw).range };
    this.pendingRange = null;

    // Popups zuerst registrieren? -> Welt wird zuerst gezeichnet, Popups danach.
    this.r.drawWorld(g, view);

    if (g.phase !== 'pick' && !g.over) {
      if (this.selPlot() !== null) this.drawBuildPopup(g, g.map.plots[this.selPlot()]);
      else if (tw) this.drawTowerPopup(g, tw);
    }
    if (this.pendingRange) this.r.circle(Math.round(this.pendingRange.x), Math.round(this.pendingRange.y), Math.round(this.pendingRange.r), 10, true);

    this.drawTopBar(g);
    this.drawHud(g);

    if (g.phase === 'pick' && !g.over) this.drawPick(g);
    if (g.over) this.drawGameOver(g);
    else if (this.tutorial) this.drawTutorial(g);
    else if (this.paused) {
      this.dim(0, 0, W, WORLD_H);
      drawTextCentered(ctx, 'PAUSE', W / 2, 60, PAL[7], 3, PAL[0]);
      drawTextCentered(ctx, 'P / LEERTASTE ZUM FORTSETZEN', W / 2, 82, PAL[6], 1, PAL[0]);
      this.button(W / 2 - 40, 94, 80, 14, 'WEITER', { onClick: () => { this.paused = false; } });
      this.button(W / 2 - 40, 112, 80, 14, 'ANLEITUNG', { onClick: () => { this.tutorial = true; } });
      this.button(W / 2 - 40, 130, 80, 14, 'ZUM MENÜ', { onClick: () => this.toMenu(), info: this.run.counted ? 'FORTSCHRITT WIRD GESPEICHERT' : 'RUN WIRD ABGEBROCHEN' });
    }
  }

  drawTutorial(g) {
    const ctx = this.ctx;
    this.dim(0, 0, W, H, 3);
    const w = 290, h = 162, x = (W - w) / 2, y = 9;
    this.frameBox(x, y, w, h, 0, 10);
    this.buttons.push({ x: 0, y: 0, w: W, h: H, id: 'tut-block', block: true });
    drawTextCentered(ctx, "SO GEHT'S", W / 2, y + 5, PAL[10], 2);
    const steps = [
      ['portal', 'GEGNER LAUFEN VOM PORTAL ZUR BURG. JEDER DURCHBRUCH KOSTET LEBEN.'],
      ['plot', 'BAUPLATZ (ECKEN-MARKIERUNG) ANTIPPEN -> TURM WÄHLEN.'],
      ['arrow', 'TURM ANTIPPEN -> UPGRADE A ODER B (JE 2 STUFEN) ODER VERKAUFEN.'],
      ['card', 'NACH JEDER WELLE: 1 VON 3 KARTEN (TURM, UPGRADE, RELIKT, RISIKO).'],
      ['play', '"LOS" STARTET DIE WELLE FRÜHER = MEHR ZEITBONUS IM SCORE.'],
      ['flyer', 'FLIEGER TREFFEN NUR PFEIL, FROST, BLITZ UND GIFT.'],
    ];
    steps.forEach(([icon, text], i) => {
      const yy = y + 22 + i * 17;
      const img = this.r.spr[icon];
      if (icon === 'arrow') ctx.drawImage(this.r.spr.base, x + 6, yy - 4);
      if (img.width === 16) { ctx.drawImage(img, x + 6, yy - (icon === 'arrow' ? 4 : 2)); }
      else ctx.drawImage(img, x + 10, yy + 2);
      wrapText(text, 62).forEach((l, j) => drawText(ctx, l, x + 28, yy + j * 7, PAL[7]));
    });
    const m = MUTATORS[g.mutator];
    drawText(ctx, 'MUTATOR: ' + m.name, x + 6, y + 122, PAL[9]);
    wrapText(m.desc, 70).slice(0, 1).forEach((l) => drawText(ctx, l, x + 6, y + 129, PAL[6]));
    drawText(ctx, this.pointerType === 'touch' ? 'TOUCH: ZWEIMAL TIPPEN BESTÄTIGT.' : 'TASTEN: 1-6 BAUEN, Q/E UPGRADE, LEERTASTE START, F TEMPO.', x + 6, y + 137, PAL[13]);
    this.button(x + 6, y + h - 17, 136, 13, "LOS GEHT'S", { color: 3, hoverColor: 11, onClick: () => { this.tutorial = false; } });
    this.button(x + w - 142, y + h - 17, 136, 13, 'NICHT MEHR ZEIGEN', {
      onClick: () => { this.tutorial = false; store.load().hideTutorial = true; store.save(); },
    });
  }

  drawTopBar(g) {
    const ctx = this.ctx;
    // Relikte
    g.relics.forEach((id, i) => {
      const x = 2 + i * 10;
      this.box(x - 1, 1, 10, 10, 0);
      ctx.drawImage(this.r.spr[ICON_FOR[RELICS[id].icon] || 'star'], x, 2);
      this.tip(x - 1, 1, 10, 10, `${RELICS[id].name}: ${RELICS[id].desc}`);
    });
    // Mutator
    const m = MUTATORS[g.mutator];
    const mw = textWidth(m.name) + 6;
    this.frameBox(W - mw - 1, 1, mw, 9, 0, 9);
    drawText(ctx, m.name, W - mw + 2, 3, PAL[9]);
    this.tip(W - mw - 1, 1, mw, 9, 'MUTATOR: ' + m.desc);
    // Welle / Countdown
    const wave = g.waves[Math.min(g.waveIdx, g.waves.length - 1)];
    let txt = null, col = 7;
    if (g.phase === 'build') {
      txt = `WELLE ${wave.n}/${g.waves.length} IN ${Math.ceil(g.buildTimer / TPS)}S`;
      if (wave.boss) { txt = 'BOSS! ' + txt; col = (this.frame >> 4) % 2 ? 8 : 9; }
    } else if (g.phase === 'wave') {
      txt = `WELLE ${wave.n}/${g.waves.length}`;
      if (wave.boss) { txt += ' - BOSS'; col = 8; }
    }
    if (txt) {
      const w = textWidth(txt) + 6;
      this.frameBox(Math.round(W / 2 - w / 2), 1, w, 9, 0, 5);
      drawTextCentered(ctx, txt, W / 2, 3, PAL[col]);
    }
    if (g.phase === 'wave' && g.combo >= 3 && g.tick - g.lastKillTick < 90) {
      drawTextCentered(ctx, `COMBO X${g.combo}`, W / 2, 13, PAL[(this.frame >> 2) % 2 ? 10 : 9], 1, PAL[0]);
    }
  }

  drawHud(g) {
    const ctx = this.ctx;
    this.box(0, WORLD_H, W, H - WORLD_H, 0);
    this.box(0, WORLD_H, W, 1, 5);
    ctx.drawImage(this.r.spr.heart, 2, 162);
    drawText(ctx, String(g.lives), 12, 164, PAL[g.lives <= 5 ? 8 : 7]);
    this.tip(0, 161, 30, 10, 'LEBEN - BEI 0 FÄLLT DIE BASTION');
    ctx.drawImage(this.r.spr.coin, 32, 162);
    drawText(ctx, String(g.gold), 42, 164, PAL[10]);
    this.tip(30, 161, 34, 10, 'GOLD - FÜR TÜRME UND UPGRADES');
    ctx.drawImage(this.r.spr.sword, 68, 162);
    drawText(ctx, `${Math.min(g.waveIdx + 1, g.waves.length)}/${g.waves.length}`, 78, 164, PAL[7]);
    drawText(ctx, fmtTime(g.tick), 102, 164, PAL[6]);
    drawText(ctx, `K${g.kills}`, 128, 164, PAL[6]);
    this.tip(126, 161, 30, 10, `KILLS ${g.kills} - MAX COMBO ${g.maxCombo}`);
    const mode = this.run.mode === 'daily' ? `#${dailyNumber(g.date)}` : this.run.mode === 'practice' ? 'ÜBUNG' : 'FREE';
    drawText(ctx, mode, 160, 164, PAL[this.run.mode === 'daily' ? 11 : 13]);

    // Buttons rechts
    const inBuild = g.phase === 'build';
    this.button(198, 162, 44, 16, inBuild ? `LOS ${Math.ceil(g.buildTimer / TPS)}` : 'LÄUFT', {
      disabled: !inBuild, color: 3, hoverColor: 11, onClick: () => this.act({ a: 'start' }),
      info: 'NÄCHSTE WELLE JETZT STARTEN (LEERTASTE) - SPART ZEIT = MEHR SCORE',
    });
    this.button(244, 162, 20, 16, `${this.speed}X`, { onClick: () => this.cycleSpeed(), info: 'TEMPO 1X/2X/3X (F)' });
    this.button(266, 162, 16, 16, '', { icon: this.paused ? 'play' : 'pause', onClick: () => { this.paused = !this.paused; }, info: 'PAUSE (P)' });
    this.button(284, 162, 16, 16, '', { icon: this.audio.muted ? 'muted' : 'speaker', onClick: () => this.toggleMute(), info: 'TON (M)' });
    this.button(302, 162, 16, 16, '', { icon: 'menu', onClick: () => { this.paused = true; }, info: 'MENÜ / PAUSE' });

    // Info-Zeile
    let info = this.currentInfo();
    if (!info) {
      if (g.phase === 'build' || g.phase === 'pick') {
        const w = g.waves[Math.min(g.waveIdx, g.waves.length - 1)];
        const counts = {};
        for (const s of w.spawns) counts[s.type] = (counts[s.type] || 0) + 1;
        info = 'NÄCHSTE: ' + Object.entries(counts).map(([t, n]) => `${n}X ${ENEMIES[t].name}`).join(', ');
      } else info = this.sel ? '' : 'BAUPLATZ ANTIPPEN ZUM BAUEN';
    }
    const maxc = 48;
    const s = normalize(info);
    if (s.length > maxc) {
      // Lange Hinweise als Tooltip-Leiste über dem HUD
      const lines = wrapText(s, 78);
      const th = lines.length * 7 + 3;
      this.frameBox(0, WORLD_H - th - 1, W, th + 1, 0, 5);
      lines.forEach((l, i) => drawText(ctx, l, 3, WORLD_H - th + 1 + i * 7, PAL[7]));
    } else {
      drawText(ctx, s, 2, 173, PAL[6]);
    }
  }

  drawBuildPopup(g, plot) {
    const ctx = this.ctx;
    const types = g.unlocked;
    const cw = 20;
    const w = types.length * cw + 4, h = 29;
    let x = Math.round(plot.x - w / 2), y = plot.y - 8 - h - 1;
    if (y < 12) y = plot.y + 9;
    x = Math.max(1, Math.min(W - w - 1, x));
    this.frameBox(x, y, w, h, 0, 7);
    this.buttons.push({ x, y, w, h, id: 'popup-block', block: true });
    types.forEach((t, i) => {
      const cx = x + 2 + i * cw;
      const cost = towerCost(g, t);
      const can = g.gold >= cost;
      const id = 'build-' + t;
      const hov = this.button(cx, y + 2, cw, h - 4, '', {
        id, hidden: true, confirm: true, disabled: !can,
        info: `${i + 1}: ${TOWERS[t].name} ${cost}G - ${TOWERS[t].role}`,
        onClick: () => { if (this.act({ a: 'build', plot: plot.id, type: t })) { this.sel = { kind: 'tower', id: g.map.plots[plot.id].tower }; } },
      });
      if (hov) {
        this.box(cx, y + 2, cw, h - 4, 1);
        const st = towerStats(g, { type: t, x: plot.x, y: plot.y, path: null, level: 0 });
        if (st.range) this.pendingRange = { x: plot.x, y: plot.y, r: st.range };
      }
      ctx.drawImage(this.r.spr.base, cx + 2, y + 1);
      ctx.drawImage(this.r.spr[t], cx + 2, y + 1);
      drawTextCentered(ctx, String(cost), cx + cw / 2, y + 20, PAL[can ? 10 : 8]);
      if (this.armed === id) this.box(cx, y + 26, cw, 1, 10);
    });
  }

  drawTowerPopup(g, t) {
    const ctx = this.ctx;
    const def = TOWERS[t.type];
    const st = towerStatsCached(g, t);
    const w = 126, h = 47;
    let x = Math.round(t.x - w / 2), y = t.y - 8 - h - 1;
    if (y < 12) y = t.y + 9;
    x = Math.max(1, Math.min(W - w - 1, x));
    this.frameBox(x, y, w, h, 0, 7);
    this.buttons.push({ x, y, w, h, id: 'popup-block', block: true });
    const title = t.path ? `${def.name} - ${def.paths[t.path].name} ${t.level}/2` : `${def.name} - STUFE 0`;
    drawText(ctx, title, x + 3, y + 3, PAL[10]);
    const stats = t.type === 'support'
      ? `BUFF +${Math.round(st.buffDmg * 100)}%DMG +${Math.round(st.buffRate * 100)}%RATE`
      : `DMG ${st.dmg.toFixed(st.dmg < 10 ? 1 : 0)} RW ${Math.round(st.range)} RATE ${st.rate.toFixed(1)}`;
    drawText(ctx, stats, x + 3, y + 10, PAL[6]);
    drawText(ctx, `KILLS ${t.kills}  SCHADEN ${Math.round(t.dmg)}`, x + 3, y + 17, PAL[5]);
    const bw = 59;
    if (t.level < 2) {
      const paths = t.path ? [t.path] : ['A', 'B'];
      paths.forEach((p, i) => {
        const cost = upgradeCost(g, t, p);
        const lvl = def.paths[p].levels[t.level];
        const can = g.gold >= cost;
        this.button(x + 3 + i * (bw + 2), y + 24, t.path ? w - 6 : bw, 10, `${t.path ? 'UPGRADE' : p} ${cost}G`, {
          id: 'up-' + t.id + p, confirm: true, disabled: !can, color: p === 'A' ? 4 : 1, hoverColor: p === 'A' ? 9 : 12,
          info: `[${p === 'A' ? 'Q' : 'E'}] ${def.paths[p].name}: ${lvl.desc}`,
          onClick: () => this.act({ a: 'upgrade', tower: t.id, path: p }),
        });
      });
    } else {
      drawTextCentered(ctx, 'MAXIMALE STUFE', x + w / 2, y + 26, PAL[11]);
    }
    this.button(x + 3, y + 35, w - 6, 10, `VERKAUFEN +${sellValue(g, t)}G`, {
      id: 'sell-' + t.id, confirm: true, color: 2, hoverColor: 8, info: '[X] TURM VERKAUFEN',
      onClick: () => { if (this.act({ a: 'sell', tower: t.id })) { this.sel = null; } },
    });
  }

  drawPick(g) {
    const ctx = this.ctx;
    this.dim(0, 0, W, WORLD_H);
    const offer = g.offers[g.waveIdx - 1];
    const prev = g.waves[g.waveIdx - 1];
    drawTextCentered(ctx, `WELLE ${prev.n} GESCHAFFT!`, W / 2, 14, PAL[10], 1, PAL[0]);
    drawTextCentered(ctx, 'WÄHLE EINE KARTE (1-3)', W / 2, 22, PAL[7], 1, PAL[0]);
    const cw = 96, ch = 124, gap = 8;
    const x0 = Math.round((W - (cw * 3 + gap * 2)) / 2);
    offer.forEach((c, i) => {
      const x = x0 + i * (cw + gap);
      const hov = this.hovered(x, 30, cw, ch);
      const y = 30 - (hov ? 2 : 0);
      const col = KIND_COLOR[c.kind];
      this.box(x, y, cw, ch, col);
      this.box(x + 2, y + 2, cw - 4, ch - 4, hov ? 1 : 0);
      drawTextCentered(ctx, CARD_KIND_LABEL[c.kind], x + cw / 2, y + 5, PAL[col]);
      // Icon
      const ix = x + cw / 2 - 8, iy = y + 13;
      if (c.kind === 'tower' || (c.kind === 'upgrade' && c.tower)) {
        ctx.drawImage(this.r.spr.base, ix, iy);
        ctx.drawImage(this.r.spr[c.tower], ix, iy);
        if (c.kind === 'upgrade') { this.box(ix + 14, iy, 5, 5, 0); drawText(ctx, '+', ix + 15, iy, PAL[11]); }
      } else {
        const icon = c.kind === 'relic' ? (ICON_FOR[c.icon] || 'star') : c.kind === 'risk' ? 'skull' : c.id === 'gold' ? 'coin' : c.id === 'repair' ? 'heart' : 'sword';
        ctx.save(); ctx.translate(ix, iy); ctx.scale(2, 2); ctx.drawImage(this.r.spr[icon], 0, 0); ctx.restore();
      }
      let ly = y + 34;
      for (const l of wrapText(c.name, 22)) { drawTextCentered(ctx, l, x + cw / 2, ly, PAL[7]); ly += 7; }
      ly += 3;
      if (c.kind === 'risk') {
        for (const l of wrapText('+ ' + c.pro, 22)) { drawTextCentered(ctx, l, x + cw / 2, ly, PAL[11]); ly += 7; }
        ly += 2;
        for (const l of wrapText('- ' + c.con, 22)) { drawTextCentered(ctx, l, x + cw / 2, ly, PAL[8]); ly += 7; }
      } else {
        for (const l of wrapText(c.desc, 22)) { drawTextCentered(ctx, l, x + cw / 2, ly, PAL[6]); ly += 7; }
      }
      ly += 3;
      if (c.kind === 'tower') {
        if (g.unlocked.includes(c.tower)) drawTextCentered(ctx, `(SCHON FREI: +${TOWER_CARD_DUP_GOLD}G)`, x + cw / 2, ly, PAL[10]);
        else drawTextCentered(ctx, `KOSTET ${towerCost(g, c.tower)}G`, x + cw / 2, ly, PAL[10]);
      } else if (c.kind === 'upgrade' && c.tower && !g.unlocked.includes(c.tower)) {
        drawTextCentered(ctx, '(TURM NOCH GESPERRT)', x + cw / 2, ly, PAL[5]);
      }
      drawTextCentered(ctx, `[${i + 1}]`, x + cw / 2, y + ch - 9, PAL[hov ? 10 : 5]);
      this.button(x, 28, cw, ch + 2, '', {
        id: 'card' + i, hidden: true, confirm: true,
        onClick: () => { if (this.act({ a: 'pick', card: i })) this.audio.sfx('pick'); },
      });
      if (this.armed === 'card' + i) drawTextCentered(ctx, 'NOCHMAL TIPPEN', x + cw / 2, y + ch - 17, PAL[10]);
    });
  }

  drawGameOver(g) {
    const ctx = this.ctx;
    const res = this.result || getResult(g);
    this.dim(0, 0, W, WORLD_H);
    const w = 210, h = 146, x = (W - w) / 2, y = 7;
    this.frameBox(x, y, w, h, 0, res.won ? 11 : 8);
    drawTextCentered(ctx, res.won ? 'SIEG!' : 'BASTION GEFALLEN', W / 2, y + 5, PAL[res.won ? 11 : 8], 2);
    const mode = this.run.mode === 'daily' ? `DAILY #${dailyNumber(g.date)} - GEWERTET` : this.run.mode === 'practice' ? `ÜBUNGSRUN #${dailyNumber(g.date)} - OHNE WERTUNG` : `FREEPLAY "${g.seed}"`;
    drawTextCentered(ctx, mode, W / 2, y + 20, PAL[13]);
    const rows = [
      ['WELLE', `${res.wave}/${res.waves}`, res.breakdown.wellen],
      ['LEBEN', String(res.lives), res.breakdown.leben],
      ['KILLS', String(res.kills), res.breakdown.kills],
      ['MAX COMBO', 'X' + res.maxCombo, res.breakdown.combo],
      ['ZEIT', fmtTime(res.ticks), res.breakdown.zeit],
    ];
    if (res.won) rows.push(['SIEGBONUS', '', res.breakdown.sieg]);
    rows.forEach(([a, b, c], i) => {
      const yy = y + 30 + i * 8;
      drawText(ctx, a, x + 12, yy, PAL[6]);
      drawText(ctx, b, x + 90, yy, PAL[7]);
      const cs = '+' + c;
      drawText(ctx, cs, x + w - 12 - textWidth(cs), yy, PAL[10]);
    });
    let yy = y + 30 + rows.length * 8 + 2;
    if (res.mult !== 1) { drawText(ctx, `RISIKO-MULTIPLIKATOR X${res.mult.toFixed(2)}`, x + 12, yy, PAL[8]); yy += 8; }
    this.box(x + 10, yy, w - 20, 1, 5);
    drawText(ctx, 'SCORE', x + 12, yy + 4, PAL[7]);
    const sc = String(res.score);
    drawText(ctx, sc, x + w - 12 - textWidth(sc, 2), yy + 3, PAL[10], 2);
    if (this.run.isBest) drawTextCentered(ctx, 'NEUER BESTWERT!', W / 2, yy + 16, PAL[(this.frame >> 3) % 2 ? 10 : 9]);
    // Emoji-Zeile als Pixel-Quadrate
    const cell = 6;
    const lx = Math.round(W / 2 - (res.waveLog.length * cell) / 2);
    res.waveLog.forEach((wl, i) => {
      const c = wl.died ? 0 : wl.boss ? (wl.livesLost === 0 ? 10 : 9) : wl.livesLost === 0 ? 11 : wl.livesLost <= 2 ? 10 : 8;
      this.box(lx + i * cell, yy + 24, cell - 1, cell - 1, wl.died ? 8 : c);
      if (wl.died) this.box(lx + i * cell + 1, yy + 25, cell - 3, cell - 3, 0);
    });
    const by = y + h - 17;
    const btns = [];
    if (this.run.mode !== 'free') btns.push(['TEILEN', () => this.share(), 3]);
    btns.push(['NOCHMAL', () => this.startRun(this.run.mode === 'free' ? 'free-again' : 'daily'), 1]);
    btns.push(['MENÜ', () => this.toMenu(), 1]);
    const bw = 60;
    const tot = btns.length * bw + (btns.length - 1) * 6;
    btns.forEach(([l, fn, c], i) => this.button(Math.round(W / 2 - tot / 2) + i * (bw + 6), by, bw, 13, l, { onClick: fn, color: c, hoverColor: c === 3 ? 11 : 2 }));
  }
}
