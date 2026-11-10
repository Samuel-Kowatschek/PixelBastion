// Turmtypen. Upgrade-Pfade A/B mit je 2 Stufen; Werte in `add` werden additiv
// auf die Basiswerte gerechnet. Feuerrate in Schuss/s, Reichweite in px.

export const TOWER_ORDER = ['arrow', 'cannon', 'frost', 'tesla', 'poison', 'support'];
export const START_TOWERS = ['arrow', 'cannon', 'frost'];

export const TOWERS = {
  arrow: {
    name: 'Pfeil', short: 'PFEIL', role: 'Schnell, Einzelziel, trifft Flieger',
    cost: 45, color: 11,
    stats: { dmg: 5, rate: 2.2, range: 42, projSpeed: 220, air: true, targets: 1 },
    paths: {
      A: { name: 'Scharfschütze', levels: [
        { cost: 60, add: { dmg: 5, range: 10 }, desc: '+5 Schaden, +10 Reichweite' },
        { cost: 110, add: { dmg: 10, range: 10, crit: 0.2 }, desc: '+10 Schaden, 20% Krit (x3)' },
      ] },
      B: { name: 'Salve', levels: [
        { cost: 65, add: { targets: 1, rate: 0.4 }, desc: '2 Ziele, +0.4 Feuerrate' },
        { cost: 115, add: { targets: 1, rate: 0.8, dmg: 2 }, desc: '3 Ziele, +0.8 Feuerrate' },
      ] },
    },
  },
  cannon: {
    name: 'Kanone', short: 'KANONE', role: 'Langsam, Flächenschaden, nur Boden',
    cost: 75, color: 5,
    stats: { dmg: 13, rate: 0.7, range: 38, projSpeed: 130, splash: 15, air: false, targets: 1 },
    paths: {
      A: { name: 'Großkaliber', levels: [
        { cost: 80, add: { dmg: 12, splash: 4 }, desc: '+12 Schaden, +4 Radius' },
        { cost: 150, add: { dmg: 26, splash: 6 }, desc: '+26 Schaden, +6 Radius' },
      ] },
      B: { name: 'Schnellfeuer', levels: [
        { cost: 75, add: { rate: 0.45 }, desc: '+0.45 Feuerrate' },
        { cost: 140, add: { rate: 0.6, dmg: 6, stun: 0.25 }, desc: '+0.6 Rate, Treffer betäuben' },
      ] },
    },
  },
  frost: {
    name: 'Frost', short: 'FROST', role: 'Verlangsamt Gegner im Bereich',
    cost: 55, color: 12,
    stats: { dmg: 2, rate: 1.1, range: 34, projSpeed: 160, splash: 10, slow: 0.4, slowDur: 1.6, air: true, targets: 1 },
    paths: {
      A: { name: 'Tiefkühlung', levels: [
        { cost: 60, add: { slow: 0.12, slowDur: 0.6 }, desc: 'Stärkere, längere Verlangsamung' },
        { cost: 120, add: { slow: 0.1, freeze: 0.15, dmg: 3 }, desc: '15% Chance einzufrieren' },
      ] },
      B: { name: 'Eissturm', levels: [
        { cost: 65, add: { splash: 8, range: 6 }, desc: '+8 Radius, +6 Reichweite' },
        { cost: 120, add: { splash: 8, dmg: 6, rate: 0.4 }, desc: '+6 Schaden, +0.4 Rate' },
      ] },
    },
  },
  tesla: {
    name: 'Blitz', short: 'BLITZ', role: 'Kettenblitz springt zwischen Gegnern',
    cost: 90, color: 10,
    stats: { dmg: 8, rate: 0.9, range: 38, chain: 3, chainRange: 26, falloff: 0.8, air: true, targets: 1 },
    paths: {
      A: { name: 'Hochspannung', levels: [
        { cost: 85, add: { chain: 2, chainRange: 6 }, desc: '+2 Sprünge, +6 Sprungweite' },
        { cost: 160, add: { chain: 3, falloff: 0.1, dmg: 4 }, desc: '+3 Sprünge, weniger Abfall' },
      ] },
      B: { name: 'Überladung', levels: [
        { cost: 90, add: { dmg: 9, stun: 0.2 }, desc: '+9 Schaden, kurze Betäubung' },
        { cost: 170, add: { dmg: 18, rate: 0.3 }, desc: '+18 Schaden, +0.3 Rate' },
      ] },
    },
  },
  poison: {
    name: 'Gift', short: 'GIFT', role: 'Schaden über Zeit, ignoriert Rüstung',
    cost: 65, color: 3,
    stats: { dmg: 1, rate: 1.0, range: 36, projSpeed: 150, poison: 6, poisonDur: 4, maxStacks: 3, air: true, targets: 1 },
    paths: {
      A: { name: 'Seuche', levels: [
        { cost: 70, add: { poison: 4, splash: 12 }, desc: 'Giftwolke trifft Bereich' },
        { cost: 130, add: { poison: 6, spread: 1 }, desc: 'Gift springt beim Tod über' },
      ] },
      B: { name: 'Säure', levels: [
        { cost: 70, add: { poison: 4, shred: 2 }, desc: '-2 Rüstung pro Treffer' },
        { cost: 135, add: { poison: 8, maxStacks: 2, vuln: 0.2 }, desc: '+20% erlittener Schaden' },
      ] },
    },
  },
  support: {
    name: 'Banner', short: 'BANNER', role: 'Verstärkt Türme in Reichweite',
    cost: 80, color: 14,
    stats: { range: 30, buffDmg: 0.2, buffRate: 0.1, buffRange: 0, air: false, targets: 0, rate: 0, dmg: 0 },
    paths: {
      A: { name: 'Kriegstrommel', levels: [
        { cost: 80, add: { buffRate: 0.15, range: 6 }, desc: '+15% Feuerrate-Buff' },
        { cost: 150, add: { buffRate: 0.15, buffDmg: 0.15 }, desc: '+15% Rate, +15% Schaden' },
      ] },
      B: { name: 'Späher', levels: [
        { cost: 75, add: { buffRange: 0.12, range: 8 }, desc: '+12% Reichweite-Buff' },
        { cost: 140, add: { buffRange: 0.1, buffGold: 1 }, desc: '+1 Gold pro Kill nahe Banner' },
      ] },
    },
  },
};
