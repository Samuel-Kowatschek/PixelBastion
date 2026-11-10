// Simulation: deterministisch, ohne DOM. Alle Zufallswerte stammen aus Seed-Streams.
// Eingaben werden als {t, a, ...} protokolliert, damit ein Run per Replay prüfbar ist.
import { makeStream, hash32 } from './rng.js';
import { generateMap, pathPos } from './mapgen.js';
import { BALANCE, TPS, MAP_THEMES } from './data/balance.js';
import { TOWERS, TOWER_ORDER, START_TOWERS } from './data/towers.js';
import { ENEMIES, WAVE_ENEMIES } from './data/enemies.js';
import { RELICS, RELIC_IDS } from './data/relics.js';
import { MUTATORS, MUTATOR_IDS } from './data/mutators.js';
import { CARD_WEIGHTS, RISK_DEALS, TOWER_CARD_DUP_GOLD, buildUpgradeCards } from './data/cards.js';

export const SIM_VERSION = 1;

// ---------------------------------------------------------------------------
// Seed-abgeleitete Metadaten (auch fürs Menü, ohne ganzes Spiel zu bauen)
// ---------------------------------------------------------------------------
export function seedInfo(seed) {
  const meta = makeStream(seed, 'meta');
  const mutator = meta.pick(MUTATOR_IDS);
  const themeIdx = meta.int(0, MAP_THEMES.length - 1);
  let allowed = TOWER_ORDER.slice();
  if (mutator === 'arsenal') {
    allowed = meta.shuffle(TOWER_ORDER).slice(0, MUTATORS.arsenal.v.types);
    if (!allowed.some((t) => BALANCE.airTargetTypes.includes(t))) allowed[allowed.length - 1] = 'arrow';
    if (allowed.filter((t) => t !== 'support').length < 2) allowed[allowed.indexOf('support')] = 'cannon';
    allowed = TOWER_ORDER.filter((t) => allowed.includes(t));
  }
  const waveCount = makeStream(seed, 'waves').int(BALANCE.minWaves, BALANCE.maxWaves);
  return { mutator, themeIdx, theme: MAP_THEMES[themeIdx], allowed, waveCount };
}

// ---------------------------------------------------------------------------
// Wellen
// ---------------------------------------------------------------------------
function generateWaves(rng, count, mutator) {
  const B = BALANCE;
  rng.int(B.minWaves, B.maxWaves); // gleiche Ziehung wie seedInfo (count)
  const weights = {};
  for (const t of WAVE_ENEMIES) weights[t] = ENEMIES[t].weight * rng.range(0.4, 1.8);
  const featured = rng.pick(WAVE_ENEMIES);
  weights[featured] *= 2;
  const from = {};
  for (const t of WAVE_ENEMIES) from[t] = ENEMIES[t].from;
  if (mutator === 'airRaid') { weights.flyer *= MUTATORS.airRaid.v.weight; from.flyer = MUTATORS.airRaid.v.from; }

  const mid = Math.ceil(count / 2);
  const waves = [];
  for (let w = 0; w < count; w++) {
    const n = w + 1;
    const boss = n === mid || n === count;
    let budget = B.waveBudget.base + B.waveBudget.perWave * w + B.waveBudget.quad * w * w;
    if (boss) budget *= 0.55;
    const avail = WAVE_ENEMIES.filter((t) => from[t] <= n);
    const groups = rng.int(B.groupsPerWave[0], B.groupsPerWave[1]);
    const spawns = [];
    let t0 = 0;
    for (let g = 0; g < groups; g++) {
      const type = rng.weighted(avail, (x) => weights[x]);
      const def = ENEMIES[type];
      const cnt = Math.max(1, Math.round(budget / groups / def.cost));
      const gap = Math.round(B.spawnGap * (0.6 + 0.25 * def.cost) * TPS * rng.range(0.8, 1.2));
      for (let i = 0; i < cnt; i++) spawns.push({ at: t0 + i * gap, type });
      const groupLen = cnt * gap;
      t0 += rng.chance(0.3) ? Math.round(groupLen * 0.5) : groupLen + Math.round(B.groupGap * TPS);
    }
    if (boss) spawns.push({ at: Math.round(t0 * 0.5) + TPS, type: 'boss' });
    spawns.sort((a, b) => a.at - b.at);
    const hpMult = 1 + B.hpScale.perWave * w + B.hpScale.quad * w * w;
    waves.push({ n, boss, finalBoss: n === count, spawns, hpMult, featured });
  }
  return waves;
}

// ---------------------------------------------------------------------------
// Kartenangebote: komplett vorab aus dem Loot-Stream -> unabhängig vom Spielverhalten
// ---------------------------------------------------------------------------
function generateOffers(rng, waveCount, allowed, startUnlocked) {
  const upgrades = buildUpgradeCards().filter((c) => !c.tower || allowed.includes(c.tower));
  let relicPool = rng.shuffle(RELIC_IDS);
  const lockable = allowed.filter((t) => !startUnlocked.includes(t));
  const towerOffered = {};
  const riskIds = Object.keys(RISK_DEALS);
  const kinds = Object.keys(CARD_WEIGHTS).map((k) => ({ k, w: CARD_WEIGHTS[k] }));
  const offers = [];
  for (let w = 0; w < waveCount - 1; w++) {
    const offer = [];
    const used = new Set();
    let guard = 0;
    while (offer.length < 3 && guard++ < 100) {
      let kind = rng.weighted(kinds).k;
      if (w === 0 && offer.length === 0 && lockable.length) kind = 'tower';
      let card = null;
      if (kind === 'tower') {
        const opts = lockable.filter((t) => (towerOffered[t] || 0) < 2 && !used.has('tower_' + t));
        if (opts.length) {
          const t = rng.pick(opts);
          towerOffered[t] = (towerOffered[t] || 0) + 1;
          card = { kind, id: 'tower_' + t, tower: t, name: TOWERS[t].name, desc: TOWERS[t].role };
        }
      } else if (kind === 'upgrade') {
        const c = rng.pick(upgrades);
        if (!used.has(c.id)) card = { ...c };
      } else if (kind === 'relic') {
        if (relicPool.length) {
          const id = relicPool[0];
          relicPool = relicPool.slice(1);
          card = { kind, id, name: RELICS[id].name, desc: RELICS[id].desc, icon: RELICS[id].icon };
        }
      } else if (kind === 'risk') {
        if (!offer.some((c) => c.kind === 'risk')) {
          const id = rng.pick(riskIds);
          const d = RISK_DEALS[id];
          card = { kind, id, name: d.name, desc: `${d.pro}, aber ${d.con}`, pro: d.pro, con: d.con };
        }
      }
      if (card && !used.has(card.id)) { used.add(card.id); offer.push(card); }
    }
    offers.push(offer);
  }
  return offers;
}

// ---------------------------------------------------------------------------
// Spiel erzeugen
// ---------------------------------------------------------------------------
export function createGame({ seed, mode = 'free', date = null }) {
  seed = String(seed);
  const info = seedInfo(seed);
  const map = generateMap(makeStream(seed, 'map'));
  const waves = generateWaves(makeStream(seed, 'waves'), info.waveCount, info.mutator);
  const startUnlocked = info.mutator === 'arsenal' ? info.allowed.slice() : START_TOWERS.slice();
  const offers = generateOffers(makeStream(seed, 'loot'), info.waveCount, info.allowed, startUnlocked);

  const typeMods = {};
  for (const t of TOWER_ORDER) typeMods[t] = { dmg: 0, rate: 0, range: 0, cost: 0 };

  const startLives = info.mutator === 'glass' ? MUTATORS.glass.v.lives : BALANCE.startLives;
  const state = {
    version: SIM_VERSION,
    seed, mode, date,
    mutator: info.mutator, themeIdx: info.themeIdx,
    allowed: info.allowed, unlocked: startUnlocked,
    map, waves, offers,
    combat: makeStream(seed, 'combat'),
    tick: 0,
    phase: 'build',
    buildTimer: BALANCE.firstBuildTime * TPS,
    waveIdx: 0, waveTick: 0, spawnIdx: 0, spawns: [],
    wavesCleared: 0,
    gold: BALANCE.startGold,
    lives: startLives, startLives,
    kills: 0, combo: 0, maxCombo: 0, lastKillTick: -9999,
    towers: [], enemies: [], projectiles: [],
    relics: [], deals: [], picks: [],
    typeMods,
    mods: { allDmg: 0, dmg: 0, rate: 0, costUp: 0, hp: 0, speed: 0, gold: 0, score: 0, buildTime: 1, doubleNext: 0 },
    waveLivesLost: 0,
    waveLog: [],
    inputs: [],
    events: [],
    nextId: 1,
    won: false,
    over: false,
  };
  return state;
}

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------
const has = (s, relic) => s.relics.includes(relic);
const ev = (s, e) => { s.events.push(e); };

export function towerCost(s, type) {
  const base = TOWERS[type].cost;
  return Math.round(base * Math.max(0.3, 1 + s.typeMods[type].cost) * (1 + s.mods.costUp));
}

export function upgradeCost(s, tower, path) {
  const p = TOWERS[tower.type].paths[path];
  const lvl = p.levels[tower.level];
  if (!lvl) return null;
  const disc = has(s, 'hammer') ? RELICS.hammer.v.discount : 0;
  return Math.round(lvl.cost * (1 - disc));
}

export function sellValue(s, tower) {
  const r = has(s, 'clearance') ? RELICS.clearance.v.refund : BALANCE.sellRefund;
  return Math.floor(tower.invested * r);
}

/** Effektive Werte eines Turms inkl. Upgrades, Karten, Relikte, Mutator, Banner-Buffs. */
export function towerStats(s, tower) {
  const def = TOWERS[tower.type];
  const st = { ...def.stats };
  if (tower.path) {
    const lv = def.paths[tower.path].levels;
    for (let i = 0; i < tower.level; i++) {
      for (const k in lv[i].add) st[k] = (st[k] || 0) + lv[i].add[k];
    }
  }
  const tm = s.typeMods[tower.type];
  let dmgMul = 1 + tm.dmg + s.mods.allDmg + s.mods.dmg;
  let rateMul = 1 + tm.rate + s.mods.rate;
  let rangeMul = 1 + tm.range;
  if (has(s, 'eagleEye')) rangeMul += RELICS.eagleEye.v.range;
  if (s.mutator === 'fog') rangeMul += MUTATORS.fog.v.range;
  if (s.mutator === 'glass') dmgMul += MUTATORS.glass.v.dmg;
  if (tower.type !== 'support') {
    for (const o of s.towers) {
      if (o.type !== 'support' || o === tower) continue;
      const os = supportStats(s, o);
      const dx = o.x - tower.x, dy = o.y - tower.y;
      if (dx * dx + dy * dy <= os.range * os.range) {
        dmgMul += os.buffDmg; rateMul += os.buffRate; rangeMul += os.buffRange;
      }
    }
  }
  if (s.mutator === 'erosion') {
    rangeMul *= Math.max(MUTATORS.erosion.v.min, 1 - MUTATORS.erosion.v.perWave * s.wavesCleared);
  }
  if (tower.type === 'arrow' && has(s, 'sharpshooter')) st.targets += RELICS.sharpshooter.v.targets;
  if (tower.type === 'tesla' && has(s, 'conductor')) st.chain += RELICS.conductor.v.chain;
  st.dmg *= dmgMul;
  st.rate *= rateMul;
  st.range *= rangeMul;
  return st;
}

function supportStats(s, tower) {
  const def = TOWERS.support;
  const st = { ...def.stats };
  if (tower.path) {
    const lv = def.paths[tower.path].levels;
    for (let i = 0; i < tower.level; i++) for (const k in lv[i].add) st[k] = (st[k] || 0) + lv[i].add[k];
  }
  st.range *= 1 + s.typeMods.support.range;
  return st;
}

// ---------------------------------------------------------------------------
// Aktionen (einziger Weg, den Zustand von außen zu ändern)
// ---------------------------------------------------------------------------
export function applyAction(s, action) {
  if (s.over) return false;
  let ok = false;
  switch (action.a) {
    case 'build': ok = doBuild(s, action.plot, action.type); break;
    case 'upgrade': ok = doUpgrade(s, action.tower, action.path); break;
    case 'sell': ok = doSell(s, action.tower); break;
    case 'pick': ok = doPick(s, action.card); break;
    case 'start': ok = doStart(s); break;
    default: ok = false;
  }
  if (ok) {
    const rec = { t: s.tick, a: action.a };
    for (const k of ['plot', 'type', 'tower', 'path', 'card']) if (action[k] !== undefined) rec[k] = action[k];
    s.inputs.push(rec);
  }
  return ok;
}

function doBuild(s, plotId, type) {
  if (s.phase === 'pick') return false;
  const plot = s.map.plots[plotId];
  if (!plot || plot.hidden || plot.tower !== null) return false;
  if (!s.unlocked.includes(type)) return false;
  const cost = towerCost(s, type);
  if (s.gold < cost) return false;
  s.gold -= cost;
  const t = { id: s.nextId++, type, plot: plotId, x: plot.x, y: plot.y, path: null, level: 0, cd: 0, invested: cost, kills: 0, dmg: 0 };
  s.towers.push(t);
  plot.tower = t.id;
  ev(s, { type: 'build', x: t.x, y: t.y, tower: type });
  return true;
}

function doUpgrade(s, towerId, path) {
  if (s.phase === 'pick') return false;
  const t = s.towers.find((x) => x.id === towerId);
  if (!t || (path !== 'A' && path !== 'B')) return false;
  if (t.path && t.path !== path) return false;
  const cost = upgradeCost(s, t, path);
  if (cost === null || s.gold < cost) return false;
  s.gold -= cost;
  t.path = path;
  t.level++;
  t.invested += cost;
  ev(s, { type: 'upgrade', x: t.x, y: t.y });
  return true;
}

function doSell(s, towerId) {
  if (s.phase === 'pick') return false;
  const idx = s.towers.findIndex((x) => x.id === towerId);
  if (idx < 0) return false;
  const t = s.towers[idx];
  s.gold += sellValue(s, t);
  s.towers.splice(idx, 1);
  s.map.plots[t.plot].tower = null;
  ev(s, { type: 'sell', x: t.x, y: t.y });
  return true;
}

function doStart(s) {
  if (s.phase !== 'build') return false;
  startWave(s);
  return true;
}

function doPick(s, idx) {
  if (s.phase !== 'pick') return false;
  const offer = s.offers[s.waveIdx - 1];
  const card = offer && offer[idx];
  if (!card) return false;
  s.picks.push(card.id);
  if (card.kind === 'tower') {
    if (s.unlocked.includes(card.tower)) s.gold += TOWER_CARD_DUP_GOLD;
    else s.unlocked = TOWER_ORDER.filter((t) => t === card.tower || s.unlocked.includes(t));
  } else if (card.kind === 'upgrade') {
    if (card.tower) s.typeMods[card.tower][card.stat] += card.mul;
    if (card.gold) s.gold += card.gold;
    if (card.lives) s.lives += card.lives;
    if (card.allDmg) s.mods.allDmg += card.allDmg;
  } else if (card.kind === 'relic') {
    s.relics.push(card.id);
    if (card.id === 'blueprint') for (const p of s.map.plots) p.hidden = false;
  } else if (card.kind === 'risk') {
    s.deals.push(card.id);
    const v = RISK_DEALS[card.id].v;
    if (v.gold && card.id === 'bloodMoney') s.gold += v.gold;
    if (v.lives) s.lives = Math.max(1, s.lives + v.lives);
    if (v.score) s.mods.score += v.score;
    if (v.hp) s.mods.hp += v.hp;
    if (v.dmg) s.mods.dmg += v.dmg;
    if (v.speed) s.mods.speed += v.speed;
    if (card.id === 'greed') { s.mods.gold += v.gold; s.mods.buildTime *= v.buildTime; }
    if (v.rate) s.mods.rate += v.rate;
    if (v.cost) s.mods.costUp += v.cost;
    if (v.doubleNext) s.mods.doubleNext = 1;
  }
  ev(s, { type: 'pick', kind: card.kind });
  s.phase = 'build';
  s.buildTimer = Math.round(BALANCE.buildTime * TPS * s.mods.buildTime);
  return true;
}

// ---------------------------------------------------------------------------
// Wellen-Ablauf
// ---------------------------------------------------------------------------
function startWave(s) {
  const wave = s.waves[s.waveIdx];
  let spawns = wave.spawns.slice();
  if (s.mods.doubleNext) {
    const extra = wave.spawns.filter((x) => x.type !== 'boss').map((x) => ({ at: x.at + 20, type: x.type }));
    spawns = spawns.concat(extra).sort((a, b) => a.at - b.at);
    s.mods.doubleNext = 0;
  }
  s.spawns = spawns;
  s.spawnIdx = 0;
  s.waveTick = 0;
  s.waveLivesLost = 0;
  s.waveKills = 0;
  s.phase = 'wave';
  ev(s, { type: 'waveStart', n: wave.n, boss: wave.boss });
}

function spawnEnemy(s, type, from = null) {
  const def = ENEMIES[type];
  const wave = s.waves[Math.min(s.waveIdx, s.waves.length - 1)];
  let hp = def.hp * wave.hpMult * (1 + s.mods.hp);
  if (type === 'boss' && wave.finalBoss) hp *= 1.7;
  let armor = def.armor + (s.mutator === 'plating' ? MUTATORS.plating.v.armor : 0);
  const air = from ? from.air : !!def.air;
  const e = {
    id: s.nextId++, type, hp, maxHp: hp, armor, air,
    speed: def.speed / TPS, d: 0, x: 0, y: 0,
    slowT: 0, slowF: 0, stunT: 0, poison: [], vuln: 0,
    healCd: def.healEvery ? Math.round(def.healEvery * TPS) : 0,
    lives: def.lives, gold: def.gold, boss: !!def.boss, dead: false,
    flyLen: 0, fx: 0, fy: 0, hitFlash: 0,
  };
  if (air) {
    const sx = from ? from.x : s.map.spawn.x, sy = from ? from.y : s.map.spawn.y;
    e.fx = sx; e.fy = sy;
    const dx = s.map.base.x - sx, dy = s.map.base.y - sy;
    e.flyLen = Math.sqrt(dx * dx + dy * dy) || 1;
    e.x = sx; e.y = sy;
  } else {
    e.d = from ? from.d : 0;
    const p = pathPos(s.map, e.d);
    e.x = p.x; e.y = p.y;
  }
  s.enemies.push(e);
  if (type === 'boss') ev(s, { type: 'boss' });
  return e;
}

function enemyProgress(s, e) {
  return e.air ? (e.d / e.flyLen) * s.map.length : e.d;
}

function waveComplete(s) {
  const w = s.waves[s.waveIdx];
  let bonus = BALANCE.waveGoldBonus.base + BALANCE.waveGoldBonus.perWave * s.waveIdx;
  if (s.mutator === 'scarcity') bonus *= 1 + MUTATORS.scarcity.v.waveBonus;
  s.gold += Math.round(bonus);
  if (has(s, 'interest')) s.gold += Math.min(RELICS.interest.v.max, Math.floor(s.gold * RELICS.interest.v.pct));
  if (has(s, 'firstAid') && s.waveLivesLost === 0) s.lives += RELICS.firstAid.v.lives;
  s.waveLog.push({ n: w.n, livesLost: s.waveLivesLost, boss: w.boss, kills: s.waveKills, ticks: s.waveTick });
  s.wavesCleared++;
  s.waveIdx++;
  ev(s, { type: 'waveEnd', n: w.n, boss: w.boss });
  if (s.waveIdx >= s.waves.length) {
    endGame(s, true);
  } else {
    s.phase = 'pick';
  }
}

function endGame(s, won) {
  s.over = true;
  s.won = won;
  s.phase = 'over';
  if (!won) s.waveLog.push({ n: s.waves[s.waveIdx].n, livesLost: s.waveLivesLost, boss: s.waves[s.waveIdx].boss, kills: s.waveKills || 0, died: true });
  ev(s, { type: won ? 'victory' : 'defeat' });
}

// ---------------------------------------------------------------------------
// Schaden & Kills
// ---------------------------------------------------------------------------
function damage(s, e, amount, tower, ignoreArmor) {
  if (e.dead) return;
  let d = ignoreArmor ? amount : Math.max(amount * 0.25, amount - e.armor);
  let mult = 1 + e.vuln;
  if (e.slowT > 0 && has(s, 'frostCore')) mult += RELICS.frostCore.v.mult;
  d *= mult;
  e.hp -= d;
  e.hitFlash = 4;
  if (tower) tower.dmg += d;
  if (e.hp <= 0) kill(s, e, tower);
}

function kill(s, e, tower) {
  e.dead = true;
  s.kills++;
  s.waveKills = (s.waveKills || 0) + 1;
  if (tower) tower.kills++;
  let win = BALANCE.comboWindow * TPS;
  if (has(s, 'comboMaster')) win *= RELICS.comboMaster.v.window;
  s.combo = s.tick - s.lastKillTick <= win ? s.combo + 1 : 1;
  s.lastKillTick = s.tick;
  if (s.combo > s.maxCombo) s.maxCombo = s.combo;

  let goldMul = 1 + s.mods.gold;
  if (s.mutator === 'rush') goldMul += MUTATORS.rush.v.gold;
  if (s.mutator === 'scarcity') goldMul += MUTATORS.scarcity.v.gold;
  let g = e.gold * goldMul;
  if (e.boss && has(s, 'bounty')) { g *= RELICS.bounty.v.mult; s.lives += RELICS.bounty.v.lives; }
  if (has(s, 'luckyCoin') && s.combat.chance(RELICS.luckyCoin.v.chance)) g *= 2;
  if (has(s, 'comboMaster') && s.combo >= RELICS.comboMaster.v.from) g += 1;
  for (const o of s.towers) {
    if (o.type !== 'support') continue;
    const st = supportStats(s, o);
    if (!st.buffGold) continue;
    const dx = o.x - e.x, dy = o.y - e.y;
    if (dx * dx + dy * dy <= st.range * st.range) { g += st.buffGold; break; }
  }
  g = Math.round(g);
  s.gold += g;
  if (has(s, 'vampire') && s.kills % RELICS.vampire.v.every === 0) s.lives++;
  ev(s, { type: 'kill', x: e.x, y: e.y, enemy: e.type, gold: g, combo: s.combo });

  // Splitten
  const def = ENEMIES[e.type];
  let splits = 0, splitType = null;
  if (def.splitInto) { splits = def.splitCount; splitType = def.splitInto; }
  else if (s.mutator === 'mitosis' && !e.boss && e.type !== 'mite') { splits = MUTATORS.mitosis.v.count; splitType = 'mite'; }
  for (let i = 0; i < splits; i++) {
    const c = spawnEnemy(s, splitType, e);
    if (!c.air) { c.d = Math.max(0, e.d - i * 4); const p = pathPos(s.map, c.d); c.x = p.x; c.y = p.y; }
  }
  // Gift überspringen
  const spreading = e.poison.filter((p) => p.spread);
  if (spreading.length) {
    let n = 0;
    for (const o of s.enemies) {
      if (o.dead || o === e || n >= 2) continue;
      const dx = o.x - e.x, dy = o.y - e.y;
      if (dx * dx + dy * dy <= 24 * 24) { addPoison(o, { ...spreading[0] }, 3); n++; }
    }
  }
  // Explosion
  if (has(s, 'chainReaction')) {
    const r = RELICS.chainReaction.v.radius;
    ev(s, { type: 'boom', x: e.x, y: e.y, r });
    for (const o of s.enemies) {
      if (o.dead || o === e) continue;
      const dx = o.x - e.x, dy = o.y - e.y;
      if (dx * dx + dy * dy <= r * r) damage(s, o, RELICS.chainReaction.v.dmg, null, false);
    }
  }
}

function addPoison(e, stack, maxStacks) {
  if (e.poison.length >= maxStacks) {
    let wi = 0;
    for (let i = 1; i < e.poison.length; i++) if (e.poison[i].t < e.poison[wi].t) wi = i;
    e.poison[wi] = stack;
  } else e.poison.push(stack);
}

function applyHit(s, e, st, tower) {
  if (e.dead) return;
  let dmg = st.dmg;
  if (st.crit && s.combat.chance(st.crit)) dmg *= 3;
  if (st.slow) {
    e.slowF = Math.max(e.slowF, Math.min(0.85, st.slow));
    e.slowT = Math.max(e.slowT, Math.round(st.slowDur * TPS));
  }
  if (st.freeze && s.combat.chance(st.freeze)) e.stunT = Math.max(e.stunT, Math.round(0.8 * TPS));
  if (st.stun) e.stunT = Math.max(e.stunT, Math.round(st.stun * TPS));
  if (st.poison) addPoison(e, { dps: st.poison, t: Math.round(st.poisonDur * TPS), tower, spread: !!st.spread }, st.maxStacks);
  if (st.shred) e.armor = Math.max(0, e.armor - st.shred);
  if (st.vuln) e.vuln = Math.max(e.vuln, st.vuln);
  if (has(s, 'plague')) addPoison(e, { dps: RELICS.plague.v.dps, t: RELICS.plague.v.dur * TPS, tower: null, spread: false }, 4);
  damage(s, e, dmg, tower, tower && tower.type === 'poison');
}

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------
export function step(s) {
  if (s.over || s.phase === 'pick') return;
  s.tick++;
  if (s.phase === 'build') {
    s.buildTimer--;
    if (s.buildTimer <= 0) startWave(s);
    updateTowersIdle(s);
    return;
  }
  // phase === 'wave'
  s.waveTick++;
  while (s.spawnIdx < s.spawns.length && s.spawns[s.spawnIdx].at <= s.waveTick) {
    spawnEnemy(s, s.spawns[s.spawnIdx].type);
    s.spawnIdx++;
  }
  updateEnemies(s);
  if (s.over) return;
  updateTowers(s);
  updateProjectiles(s);
  s.enemies = s.enemies.filter((e) => !e.dead);
  if (s.spawnIdx >= s.spawns.length && s.enemies.length === 0) waveComplete(s);
}

function updateTowersIdle(s) {
  for (const t of s.towers) if (t.cd > 0) t.cd--;
}

function updateEnemies(s) {
  const tc = has(s, 'timeCrystal') && s.waveTick < RELICS.timeCrystal.v.secs * TPS;
  const spdMul = 1 + s.mods.speed + (s.mutator === 'rush' ? MUTATORS.rush.v.speed : 0);
  for (let i = 0; i < s.enemies.length; i++) {
    const e = s.enemies[i];
    if (e.dead) continue;
    if (e.hitFlash > 0) e.hitFlash--;
    // Gift
    for (let p = e.poison.length - 1; p >= 0; p--) {
      const st = e.poison[p];
      damage(s, e, st.dps / TPS, st.tower, true);
      if (--st.t <= 0) e.poison.splice(p, 1);
    }
    if (e.dead) continue;
    if (s.mutator === 'regen') e.hp = Math.min(e.maxHp, e.hp + (e.maxHp * MUTATORS.regen.v.pct) / TPS);
    // Heiler
    const def = ENEMIES[e.type];
    if (def.healEvery && --e.healCd <= 0) {
      e.healCd = Math.round(def.healEvery * TPS);
      const r2 = def.healRadius * def.healRadius;
      let healed = false;
      for (const o of s.enemies) {
        if (o.dead || o === e || o.hp >= o.maxHp) continue;
        const dx = o.x - e.x, dy = o.y - e.y;
        if (dx * dx + dy * dy <= r2) { o.hp = Math.min(o.maxHp, o.hp + o.maxHp * def.healPct); healed = true; }
      }
      if (healed) ev(s, { type: 'heal', x: e.x, y: e.y, r: def.healRadius });
    }
    // Bewegung
    let sp = e.speed * spdMul;
    if (e.slowT > 0) { e.slowT--; sp *= 1 - e.slowF; if (e.slowT === 0) e.slowF = 0; }
    if (e.stunT > 0) { e.stunT--; sp = 0; }
    if (tc) sp *= 1 - RELICS.timeCrystal.v.slow;
    e.d += sp;
    if (e.air) {
      const f = Math.min(1, e.d / e.flyLen);
      e.x = e.fx + (s.map.base.x - e.fx) * f;
      e.y = e.fy + (s.map.base.y - e.fy) * f;
      if (f >= 1) leak(s, e);
    } else {
      if (e.d >= s.map.length) leak(s, e);
      else { const p = pathPos(s.map, e.d); e.x = p.x; e.y = p.y; }
    }
    if (s.over) return;
  }
}

function leak(s, e) {
  e.dead = true;
  s.lives -= e.lives;
  s.waveLivesLost += e.lives;
  ev(s, { type: 'leak', x: e.x, y: e.y, lives: e.lives });
  if (s.lives <= 0) { s.lives = 0; endGame(s, false); }
}

function findTargets(s, t, st, n) {
  const r2 = st.range * st.range;
  const list = [];
  for (const e of s.enemies) {
    if (e.dead || (e.air && !st.air)) continue;
    const dx = e.x - t.x, dy = e.y - t.y;
    if (dx * dx + dy * dy <= r2) list.push(e);
  }
  list.sort((a, b) => enemyProgress(s, b) - enemyProgress(s, a) || a.id - b.id);
  return list.slice(0, n);
}

function updateTowers(s) {
  for (const t of s.towers) {
    if (t.type === 'support') continue;
    if (t.cd > 0) { t.cd--; continue; }
    const st = towerStats(s, t);
    const targets = findTargets(s, t, st, Math.max(1, st.targets));
    if (!targets.length) continue;
    t.cd = Math.max(4, Math.round(TPS / st.rate));
    t.aimX = targets[0].x; t.aimY = targets[0].y;
    if (t.type === 'tesla') {
      fireChain(s, t, st, targets[0]);
    } else {
      for (const e of targets) {
        s.projectiles.push({ kind: t.type, x: t.x, y: t.y - 4, target: e, tx: e.x, ty: e.y, sp: st.projSpeed / TPS, st, tower: t });
      }
      ev(s, { type: 'shoot', tower: t.type, x: t.x, y: t.y });
    }
  }
}

function fireChain(s, t, st, first) {
  const hit = new Set();
  const pts = [{ x: t.x, y: t.y - 5 }];
  let cur = first;
  let dmg = st.dmg;
  const jumps = Math.max(1, Math.round(st.chain));
  for (let i = 0; i < jumps && cur; i++) {
    hit.add(cur);
    pts.push({ x: cur.x, y: cur.y });
    applyHit(s, cur, { ...st, dmg }, t);
    dmg *= Math.min(1, st.falloff);
    let best = null, bd = st.chainRange * st.chainRange;
    for (const e of s.enemies) {
      if (e.dead || hit.has(e)) continue;
      const dx = e.x - cur.x, dy = e.y - cur.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= bd) { bd = d2; best = e; }
    }
    cur = best;
  }
  ev(s, { type: 'zap', pts });
}

function updateProjectiles(s) {
  const keep = [];
  for (const p of s.projectiles) {
    if (!p.target.dead) { p.tx = p.target.x; p.ty = p.target.y; }
    const dx = p.tx - p.x, dy = p.ty - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= p.sp) {
      impact(s, p);
      continue;
    }
    p.x += (dx / dist) * p.sp;
    p.y += (dy / dist) * p.sp;
    keep.push(p);
  }
  s.projectiles = keep;
}

function impact(s, p) {
  const st = p.st;
  if (st.splash) {
    const r2 = st.splash * st.splash;
    ev(s, { type: 'splash', kind: p.kind, x: p.tx, y: p.ty, r: st.splash });
    for (const e of s.enemies) {
      if (e.dead || (e.air && !st.air)) continue;
      const dx = e.x - p.tx, dy = e.y - p.ty;
      if (dx * dx + dy * dy <= r2) applyHit(s, e, st, p.tower);
    }
  } else if (!p.target.dead) {
    applyHit(s, p.target, st, p.tower);
    ev(s, { type: 'hit', kind: p.kind, x: p.tx, y: p.ty });
  }
}

// ---------------------------------------------------------------------------
// Score, Ergebnis, Replay
// ---------------------------------------------------------------------------
export function computeScore(s) {
  const S = BALANCE.score;
  const secs = s.tick / TPS;
  const time = s.wavesCleared > 0 ? Math.max(0, Math.round((S.parSecondsPerWave * s.wavesCleared - secs) * S.timeFactor)) : 0;
  const parts = {
    wellen: s.wavesCleared * S.perWave,
    leben: s.lives * S.perLife,
    combo: s.maxCombo * S.perCombo,
    kills: s.kills * S.perKill,
    zeit: time,
    sieg: s.won ? S.victoryBonus : 0,
  };
  let sum = 0;
  for (const k in parts) sum += parts[k];
  const mult = 1 + s.mods.score;
  return { total: Math.round(sum * mult), parts, mult };
}

/** Erreichte Welle (für Anzeige/Teilen). */
export function waveReached(s) {
  return s.won ? s.waves.length : Math.min(s.waveIdx + 1, s.waves.length);
}

export function getResult(s) {
  const sc = computeScore(s);
  return {
    version: s.version,
    seed: s.seed, mode: s.mode, date: s.date,
    mutator: s.mutator,
    won: s.won,
    wave: waveReached(s), waves: s.waves.length,
    wavesCleared: s.wavesCleared,
    lives: s.lives,
    kills: s.kills, maxCombo: s.maxCombo,
    ticks: s.tick,
    score: sc.total, breakdown: sc.parts, mult: sc.mult,
    waveLog: s.waveLog.map((w) => ({ ...w })),
    relics: s.relics.slice(),
    inputs: s.inputs.map((i) => ({ ...i })),
  };
}

/** Kompakter Hash des Zustands - zum Vergleichen zweier Runs. */
export function stateHash(s) {
  const snap = {
    t: s.tick, g: s.gold, l: s.lives, k: s.kills, c: s.maxCombo, w: s.wavesCleared, p: s.phase,
    tw: s.towers.map((t) => [t.id, t.type, t.path, t.level, t.kills, t.dmg]),
    en: s.enemies.map((e) => [e.id, e.type, e.hp, e.d]),
    r: s.relics,
  };
  return hash32(JSON.stringify(snap)).toString(16);
}

/**
 * Spielt einen Run aus Seed + Eingaben nach. Ohne untilTick läuft er bis zum Ende
 * (oder bis zur nächsten Kartenwahl ohne passende Eingabe).
 */
export function replay(config, inputs, untilTick = Infinity, maxTicks = 60 * 60 * 120) {
  const s = createGame(config);
  let i = 0;
  while (!s.over && s.tick < maxTicks) {
    while (i < inputs.length && inputs[i].t === s.tick) {
      applyAction(s, inputs[i]);
      i++;
    }
    if (s.over || s.tick >= untilTick) break;
    if (s.phase === 'pick') {
      if (i >= inputs.length) break;
      // Eingabe mit falschem Tick (beschädigt) -> überspringen statt hängen
      if (inputs[i].t !== s.tick) { i++; continue; }
    }
    step(s);
    s.events.length = 0;
  }
  return s;
}
