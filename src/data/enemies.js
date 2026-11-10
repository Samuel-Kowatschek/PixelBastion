// Gegnertypen. hp = Basis (Welle 1), wird pro Welle skaliert. speed in px/s.
// cost = Budget-Einheiten bei der Wellengenerierung, from = erste Welle (1-basiert).

export const ENEMIES = {
  runner: { name: 'Läufer', hp: 16, speed: 32, armor: 0, gold: 3, lives: 1, cost: 1, from: 1, weight: 1.0 },
  tank: { name: 'Tank', hp: 64, speed: 15, armor: 3, gold: 8, lives: 2, cost: 4, from: 3, weight: 0.6 },
  healer: { name: 'Heiler', hp: 28, speed: 21, armor: 0, gold: 6, lives: 1, cost: 3, from: 4, weight: 0.45,
    healEvery: 1.5, healPct: 0.08, healRadius: 26 },
  splitter: { name: 'Splitter', hp: 34, speed: 20, armor: 1, gold: 5, lives: 1, cost: 3, from: 3, weight: 0.55,
    splitInto: 'mite', splitCount: 2 },
  flyer: { name: 'Flieger', hp: 20, speed: 25, armor: 0, gold: 5, lives: 1, cost: 2, from: 5, weight: 0.5, air: true },
  mite: { name: 'Splitterling', hp: 9, speed: 36, armor: 0, gold: 1, lives: 1, cost: 0, from: 99, weight: 0 },
  boss: { name: 'Boss', hp: 340, speed: 11, armor: 4, gold: 80, lives: 6, cost: 0, from: 99, weight: 0, boss: true },
};

// Gegner, die in normalen Wellen auftauchen dürfen (Boss/Mite nur speziell).
export const WAVE_ENEMIES = ['runner', 'tank', 'healer', 'splitter', 'flyer'];
