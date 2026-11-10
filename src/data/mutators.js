// Daily-Mutatoren. Einer pro Seed. Logik in game.js (per id), Werte hier.

export const MUTATORS = {
  fog: { name: 'Nebel', desc: 'Gegner nur in Turmreichweite sichtbar, -10% Reichweite', v: { range: -0.1 } },
  erosion: { name: 'Erosion', desc: 'Türme verlieren 4% Reichweite pro Welle', v: { perWave: 0.04, min: 0.6 } },
  arsenal: { name: 'Arsenal-Limit', desc: 'Nur 3 Turmtypen verfügbar', v: { types: 3 } },
  mitosis: { name: 'Zellteilung', desc: 'Gegner splitten beim Tod in einen Splitterling', v: { count: 1 } },
  rush: { name: 'Eile', desc: 'Gegner +25% Tempo, aber +25% Gold', v: { speed: 0.25, gold: 0.25 } },
  plating: { name: 'Panzerung', desc: 'Alle Gegner +2 Rüstung', v: { armor: 2 } },
  airRaid: { name: 'Luftangriff', desc: 'Flieger ab Welle 2, viel häufiger', v: { weight: 3, from: 2 } },
  glass: { name: 'Glaskanone', desc: 'Türme +40% Schaden, aber nur 10 Leben', v: { dmg: 0.4, lives: 10 } },
  regen: { name: 'Regeneration', desc: 'Gegner heilen 2% HP pro Sekunde', v: { pct: 0.02 } },
  scarcity: { name: 'Knappheit', desc: 'Kill-Gold -30%, Wellenbonus +50%', v: { gold: -0.3, waveBonus: 0.5 } },
};

export const MUTATOR_IDS = Object.keys(MUTATORS);
