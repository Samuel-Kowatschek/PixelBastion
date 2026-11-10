// Einfacher deterministischer Bot für Tests und Balancing-Checks.
import { applyAction, step, towerCost, upgradeCost } from '../src/game.js';

/** Ein Bot-Zug pro Aufruf; gibt true zurück, wenn eine Aktion ausgeführt wurde. */
export function botAct(s, style = 0) {
  if (s.phase === 'pick') {
    const offer = s.offers[s.waveIdx - 1];
    let idx = offer.findIndex((c) => c.kind === 'tower' && !s.unlocked.includes(c.tower));
    if (idx < 0) idx = offer.findIndex((c) => c.kind === 'relic');
    if (idx < 0) idx = (s.waveIdx + style) % offer.length;
    return applyAction(s, { a: 'pick', card: idx });
  }
  if (s.tick % 30 !== 0) return false;
  // Bauen: Turmtyp rotierend, Platz mit meisten Pfadkacheln in Reichweite
  const free = s.map.plots.filter((p) => !p.hidden && p.tower === null);
  const types = s.unlocked.filter((t) => t !== 'support');
  const type = types[(s.towers.length + style) % types.length];
  if (free.length && s.gold >= towerCost(s, type)) {
    let best = null, bv = -1;
    for (const p of free) {
      let v = 0;
      for (const t of s.map.tiles) {
        const dx = t.x * 16 + 8 - p.x, dy = t.y * 16 + 8 - p.y;
        if (dx * dx + dy * dy <= 40 * 40) v++;
      }
      if (v > bv) { bv = v; best = p; }
    }
    return applyAction(s, { a: 'build', plot: best.id, type });
  }
  // Upgraden
  for (const t of s.towers) {
    const path = t.path || ((t.id + style) % 2 ? 'A' : 'B');
    const c = upgradeCost(s, t, path);
    if (c !== null && s.gold >= c + 40) return applyAction(s, { a: 'upgrade', tower: t.id, path });
  }
  if (s.phase === 'build' && s.waveIdx > 0 && s.buildTimer < 600) return applyAction(s, { a: 'start' });
  return false;
}

export function runBot(s, style = 0, maxTicks = 60 * 60 * 90) {
  while (!s.over && s.tick < maxTicks) {
    botAct(s, style);
    if (s.phase !== 'pick') step(s);
    s.events.length = 0;
  }
  return s;
}
