// localStorage-Wrapper (alles in try/catch, Spiel läuft auch ohne Speicher).
import { shiftDate } from './rng.js';

const KEY = 'pixelbastion.v1';

function defaults() {
  return { streak: 0, lastDaily: null, best: 0, history: [], today: null, muted: false, practiceRuns: 0 };
}

let cache = null;

export function load() {
  if (cache) return cache;
  let data = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = { ...data, ...JSON.parse(raw) };
  } catch (e) { /* kein Speicher verfügbar */ }
  cache = data;
  return data;
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(cache || defaults())); } catch (e) { /* ignorieren */ }
}

/** Aktueller Streak (0, wenn gestern nicht gespielt wurde). */
export function currentStreak(today) {
  const d = load();
  if (d.lastDaily === today || d.lastDaily === shiftDate(today, -1)) return d.streak;
  return 0;
}

/** Status des heutigen Daily-Versuchs: 'none' | 'running' | 'done'. */
export function todayStatus(today) {
  const d = load();
  if (!d.today || d.today.date !== today) return 'none';
  return d.today.status;
}

export function todayEntry(today) {
  const d = load();
  return d.today && d.today.date === today ? d.today : null;
}

export function startDaily(today) {
  const d = load();
  d.today = { date: today, status: 'running', inputs: [], tick: 0 };
  save();
}

export function saveProgress(today, inputs, tick) {
  const d = load();
  if (!d.today || d.today.date !== today || d.today.status !== 'running') return;
  d.today.inputs = inputs.map((i) => ({ ...i }));
  d.today.tick = tick;
  save();
}

export function finishDaily(today, result, dailyNo) {
  const d = load();
  if (d.lastDaily === shiftDate(today, -1)) d.streak += 1;
  else if (d.lastDaily !== today) d.streak = 1;
  d.lastDaily = today;
  d.today = { date: today, status: 'done', result, inputs: result.inputs, tick: result.ticks };
  const isBest = result.score > d.best;
  if (isBest) d.best = result.score;
  d.history.unshift({
    date: today, no: dailyNo, score: result.score, wave: result.wave, waves: result.waves,
    lives: result.lives, won: result.won, mutator: result.mutator, inputs: result.inputs,
  });
  d.history = d.history.slice(0, 30);
  save();
  return isBest;
}

export function setMuted(m) {
  const d = load();
  d.muted = m;
  save();
}
