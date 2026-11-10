// Deterministische Zufallszahlen. Math.random() wird im ganzen Projekt NIE verwendet.

/** FNV-1a 32-Bit-Hash eines Strings, mit finalem Avalanche-Mix. */
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** mulberry32 PRNG -> liefert Funktion mit Werten in [0, 1). */
export function mulberry32(a) {
  a >>>= 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Komfort-Wrapper um einen Stream. */
export class Rng {
  constructor(seedNum) {
    this.next = mulberry32(seedNum);
  }
  float() { return this.next(); }
  range(min, max) { return min + this.next() * (max - min); }
  /** Ganzzahl in [min, max] (inklusive). */
  int(min, max) { return min + Math.floor(this.next() * (max - min + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  /** Gewichtete Auswahl: items = [{w, ...}] oder Gewichtsfunktion. */
  weighted(items, wf = (x) => x.w) {
    let sum = 0;
    for (const it of items) sum += wf(it);
    let r = this.next() * sum;
    for (const it of items) {
      r -= wf(it);
      if (r < 0) return it;
    }
    return items[items.length - 1];
  }
}

/**
 * Getrennte Streams pro Zweck. Jeder Stream hat seinen eigenen Seed,
 * dadurch verschiebt z. B. ein Kampf-Zufallswurf nie die Kartenangebote.
 */
export function makeStream(seedStr, purpose) {
  return new Rng(hash32(seedStr + '|' + purpose));
}

/** UTC-Datum als YYYY-MM-DD. */
export function utcDateString(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Fortlaufende Daily-Nummer (#1 = 2026-01-01). */
export function dailyNumber(dateStr) {
  const t = Date.UTC(+dateStr.slice(0, 4), +dateStr.slice(5, 7) - 1, +dateStr.slice(8, 10));
  return Math.floor((t - Date.UTC(2026, 0, 1)) / 86400000) + 1;
}

export function shiftDate(dateStr, days) {
  const t = Date.UTC(+dateStr.slice(0, 4), +dateStr.slice(5, 7) - 1, +dateStr.slice(8, 10));
  return utcDateString(new Date(t + days * 86400000));
}
