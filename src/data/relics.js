// Relikte verändern Regeln. Die Logik liegt in game.js (per id), die Zahlen hier.

export const RELICS = {
  interest: { name: 'Zinseszins', desc: 'Wellenende: +10% Zinsen auf Gold (max 40)', icon: 'coin', v: { pct: 0.1, max: 40 } },
  vampire: { name: 'Vampirzahn', desc: 'Jeder 30. Kill gibt +1 Leben', icon: 'heart', v: { every: 30 } },
  chainReaction: { name: 'Kettenreaktion', desc: 'Getötete Gegner explodieren (8 Schaden)', icon: 'bomb', v: { dmg: 8, radius: 14 } },
  frostCore: { name: 'Frostkern', desc: 'Verlangsamte Gegner nehmen +25% Schaden', icon: 'snow', v: { mult: 0.25 } },
  conductor: { name: 'Leitdraht', desc: 'Blitze springen 2x weiter', icon: 'bolt', v: { chain: 2 } },
  clearance: { name: 'Ausverkauf', desc: 'Verkaufen erstattet 100%', icon: 'coin', v: { refund: 1.0 } },
  hammer: { name: 'Schmiedehammer', desc: 'Upgrades kosten 25% weniger', icon: 'hammer', v: { discount: 0.25 } },
  eagleEye: { name: 'Adlerauge', desc: 'Alle Türme +15% Reichweite', icon: 'eye', v: { range: 0.15 } },
  bounty: { name: 'Kopfgeld', desc: 'Bosse geben 3x Gold und +2 Leben', icon: 'skull', v: { mult: 3, lives: 2 } },
  plague: { name: 'Seuchenbrunnen', desc: 'Alle Treffer vergiften leicht (2/s)', icon: 'drop', v: { dps: 2, dur: 3 } },
  comboMaster: { name: 'Kombo-Meister', desc: 'Combo-Fenster x2, ab Combo 10: +1 Gold/Kill', icon: 'star', v: { window: 2, from: 10 } },
  firstAid: { name: 'Erste Hilfe', desc: 'Welle ohne Lebensverlust: +1 Leben', icon: 'heart', v: { lives: 1 } },
  timeCrystal: { name: 'Zeitkristall', desc: 'Erste 4s jeder Welle: Gegner -50% Tempo', icon: 'hourglass', v: { secs: 4, slow: 0.5 } },
  blueprint: { name: 'Bauplan', desc: '+2 neue Bauplätze erscheinen', icon: 'hammer', v: { plots: 2 } },
  luckyCoin: { name: 'Glücksmünze', desc: '15% Chance auf doppeltes Kill-Gold', icon: 'coin', v: { chance: 0.15 } },
  sharpshooter: { name: 'Goldene Spitze', desc: 'Pfeiltürme treffen +1 Ziel', icon: 'arrow', v: { targets: 1 } },
};

export const RELIC_IDS = Object.keys(RELICS);
