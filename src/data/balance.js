// Zentrale Balancing-Werte. Zeiten in Sekunden / Distanzen in Pixeln (interne Auflösung).

export const TPS = 60; // Simulations-Ticks pro Sekunde

export const BALANCE = {
  tile: 16,
  cols: 20,
  rows: 10,

  startGold: 160,
  startLives: 20,
  sellRefund: 0.6,

  minWaves: 12,
  maxWaves: 15,
  buildTime: 20, // Sekunden bis die nächste Welle automatisch startet
  firstBuildTime: 30,

  // Wellenbudget: base + perWave * w + quad * w^2 (Einheiten = enemy.cost)
  waveBudget: { base: 8, perWave: 5.5, quad: 0.55 },
  // HP-Multiplikator pro Welle (w = 0-basiert)
  hpScale: { perWave: 0.16, quad: 0.018 },
  waveGoldBonus: { base: 20, perWave: 4 },
  groupsPerWave: [2, 4],
  spawnGap: 0.55, // Sekunden zwischen zwei Gegnern einer Gruppe (Basis)
  groupGap: 2.2,

  plots: { min: 15, max: 19, extra: 2 },

  comboWindow: 1.6, // Sekunden zwischen Kills für Combo
  maxStatLevel: 3,

  score: {
    perWave: 1000,
    perLife: 150,
    perCombo: 25,
    perKill: 5,
    // Zeitbonus: (parSekunden - gebrauchteSekunden) * timeFactor, min 0
    parSecondsPerWave: 55,
    timeFactor: 4,
    victoryBonus: 3000,
  },

  airTargetTypes: ['arrow', 'frost', 'tesla', 'poison'],
};

// Paletten-Themen für die Karte (Indizes in die PICO-8-Palette).
export const MAP_THEMES = [
  { name: 'Wiese', ground: 3, ground2: 11, path: 15, pathEdge: 4, deco: [11, 3, 8, 10], tree: 3 },
  { name: 'Wüste', ground: 9, ground2: 15, path: 4, pathEdge: 2, deco: [4, 15, 11], tree: 11 },
  { name: 'Frost', ground: 6, ground2: 7, path: 13, pathEdge: 5, deco: [12, 7, 13], tree: 1 },
  { name: 'Moor', ground: 1, ground2: 5, path: 4, pathEdge: 0, deco: [3, 13, 2], tree: 3 },
  { name: 'Lava', ground: 5, ground2: 2, path: 0, pathEdge: 8, deco: [8, 9, 2], tree: 0 },
  { name: 'Herbst', ground: 4, ground2: 9, path: 15, pathEdge: 2, deco: [8, 9, 10], tree: 8 },
];
