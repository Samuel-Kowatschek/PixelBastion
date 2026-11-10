// Determinismus-Tests für die Simulation. Start: `node test/sim.test.js` (oder `npm test`).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame, replay, getResult, stateHash, seedInfo, step, applyAction } from '../src/game.js';
import { validatePath } from '../src/mapgen.js';
import { hash32, mulberry32, shiftDate } from '../src/rng.js';
import { BALANCE } from '../src/data/balance.js';
import { runBot, botAct } from './bot.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.error('  FAIL ' + name); console.error(e); process.exitCode = 1; }
}

const statics = (s) => JSON.stringify({ map: s.map, waves: s.waves, offers: s.offers, mutator: s.mutator, theme: s.themeIdx });

console.log('Pixel Bastion - Simulationstests');

test('mulberry32 + hash32 sind deterministisch', () => {
  assert.equal(hash32('2026-11-10'), hash32('2026-11-10'));
  assert.notEqual(hash32('2026-11-10'), hash32('2026-11-11'));
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 1000; i++) assert.equal(a(), b());
});

test('Gleicher Seed -> identische Karte, Wellen, Angebote, Mutator', () => {
  for (const seed of ['2026-11-10', '2027-02-28', 'hallo welt']) {
    assert.equal(statics(createGame({ seed })), statics(createGame({ seed })));
  }
  assert.notEqual(statics(createGame({ seed: 'a' })), statics(createGame({ seed: 'b' })));
});

test('seedInfo (Menü) stimmt mit dem erzeugten Spiel überein', () => {
  for (let i = 0; i < 50; i++) {
    const seed = shiftDate('2026-11-10', i);
    const info = seedInfo(seed), g = createGame({ seed });
    assert.equal(info.mutator, g.mutator);
    assert.equal(info.waveCount, g.waves.length);
  }
});

test('Pfad ist für 1000 Seeds zusammenhängend, unverzweigt; Wellen 12-15 mit 2 Bossen', () => {
  for (let i = 0; i < 1000; i++) {
    const g = createGame({ seed: 'seed-' + i });
    assert.ok(validatePath(g.map.tiles, BALANCE.cols, BALANCE.rows), 'Pfad ungültig bei seed-' + i);
    assert.ok(g.map.plots.filter((p) => !p.hidden).length >= 10, 'zu wenige Bauplätze bei seed-' + i);
    assert.ok(g.waves.length >= 12 && g.waves.length <= 15);
    const bosses = g.waves.filter((w) => w.boss);
    assert.equal(bosses.length, 2);
    assert.ok(g.waves[g.waves.length - 1].boss);
    for (const o of g.offers) assert.equal(o.length, 3);
  }
});

test('Gleicher Seed + gleiche Eingaben -> exakt dasselbe Ergebnis (Replay)', () => {
  for (const [seed, style] of [['2026-11-10', 0], ['2026-11-17', 1], ['replay-test', 2]]) {
    const live = runBot(createGame({ seed, mode: 'daily', date: seed }), style);
    const res = getResult(live);
    assert.ok(res.inputs.length > 5, 'Bot sollte Eingaben erzeugen');
    const rep = replay({ seed, mode: 'daily', date: seed }, res.inputs);
    assert.equal(stateHash(rep), stateHash(live));
    assert.deepEqual(getResult(rep), res);
    // und ein zweites Mal
    assert.deepEqual(getResult(replay({ seed, mode: 'daily', date: seed }, res.inputs)), res);
  }
});

test('Fortsetzen: Replay bis Tick X + Weiterspielen == durchgehender Run', () => {
  const seed = '2026-12-01';
  const full = runBot(createGame({ seed }), 0);
  const inputs = getResult(full).inputs;
  for (const cut of [1, Math.floor(full.tick / 3), Math.floor(full.tick / 2)]) {
    const s = replay({ seed }, inputs, cut);
    assert.equal(s.tick, cut);
    const rest = inputs.filter((i) => i.t > cut);
    let i = 0;
    while (!s.over) {
      while (i < rest.length && rest[i].t === s.tick) applyAction(s, rest[i++]);
      if (s.phase === 'pick' && !(i < rest.length && rest[i].t === s.tick)) break;
      step(s);
      s.events.length = 0;
    }
    assert.equal(stateHash(s), stateHash(full));
  }
});

test('Kartenangebote hängen nicht vom Spielverhalten ab', () => {
  const seed = '2026-11-20';
  const before = JSON.stringify(createGame({ seed }).offers);
  const a = runBot(createGame({ seed }), 0);
  const b = runBot(createGame({ seed }), 1);
  assert.equal(JSON.stringify(a.offers), before);
  assert.equal(JSON.stringify(b.offers), before);
});

test('Simulation ist unabhängig von der "Framerate" (Schritte gebündelt vs. einzeln)', () => {
  const seed = 'framerate';
  const a = createGame({ seed }), b = createGame({ seed });
  // a: ein Schritt pro "Frame"; b: unregelmäßig 1-5 Schritte pro "Frame"
  const r = mulberry32(7);
  while (!a.over && a.tick < 60 * 60 * 30) { botAct(a); if (a.phase !== 'pick') step(a); a.events.length = 0; }
  const inputs = a.inputs;
  let i = 0;
  while (!b.over && b.tick < 60 * 60 * 30) {
    const n = 1 + Math.floor(r() * 5);
    for (let k = 0; k < n; k++) {
      while (i < inputs.length && inputs[i].t === b.tick) { applyAction(b, inputs[i]); i++; }
      if (b.phase === 'pick' || b.over) break;
      step(b);
    }
    b.events.length = 0;
    if (b.phase === 'pick' && !(i < inputs.length && inputs[i].t === b.tick)) break;
  }
  assert.equal(stateHash(b), stateHash(a));
});

test('Kein Math.random() im Quellcode', () => {
  const walk = (d) => readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  for (const f of walk(join(root, 'src')).filter((f) => f.endsWith('.js'))) {
    const src = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!/Math\.random\s*\(/.test(src), 'Math.random in ' + f);
  }
});

console.log(`${passed} Tests bestanden${process.exitCode ? ', es gab Fehler' : ''}.`);
