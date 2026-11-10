// Kartenpool für die Auswahl nach jeder Welle.
import { TOWERS, TOWER_ORDER } from './towers.js';

// Gewichtung der Kategorien beim Erzeugen der Angebote.
export const CARD_WEIGHTS = { tower: 0.9, upgrade: 1.4, relic: 1.1, risk: 0.6 };

export const CARD_KIND_LABEL = { tower: 'TURM', upgrade: 'UPGRADE', relic: 'RELIKT', risk: 'RISIKO' };

// Bonus-Gold, wenn eine Turmkarte für einen bereits freien Turm gewählt wird.
export const TOWER_CARD_DUP_GOLD = 60;

const STAT_UPS = [
  { stat: 'dmg', mul: 0.25, label: 'Drill', text: '+25% Schaden' },
  { stat: 'rate', mul: 0.2, label: 'Mechanik', text: '+20% Feuerrate' },
  { stat: 'range', mul: 0.15, label: 'Optik', text: '+15% Reichweite' },
  { stat: 'cost', mul: -0.3, label: 'Rabatt', text: 'kosten 30% weniger' },
];

/** Erzeugt alle Upgrade-Karten (pro Turmtyp x Stat). */
export function buildUpgradeCards() {
  const cards = [];
  for (const t of TOWER_ORDER) {
    for (const s of STAT_UPS) {
      if (t === 'support' && (s.stat === 'dmg' || s.stat === 'rate')) continue;
      cards.push({
        kind: 'upgrade', id: `${t}_${s.stat}`, tower: t, stat: s.stat, mul: s.mul,
        name: `${TOWERS[t].name}-${s.label}`,
        desc: `${TOWERS[t].name}-Türme ${s.text}`,
      });
    }
  }
  cards.push({ kind: 'upgrade', id: 'gold', name: 'Kriegskasse', desc: '+120 Gold sofort', gold: 120 });
  cards.push({ kind: 'upgrade', id: 'repair', name: 'Mauer flicken', desc: '+4 Leben', lives: 4 });
  cards.push({ kind: 'upgrade', id: 'allDmg', name: 'Schleifstein', desc: 'Alle Türme +10% Schaden', allDmg: 0.1 });
  return cards;
}

export const RISK_DEALS = {
  bloodMoney: { name: 'Blutgeld', pro: '+200 Gold', con: '-4 Leben', v: { gold: 200, lives: -4 } },
  hubris: { name: 'Hochmut', pro: 'Score x1.3', con: 'Gegner +20% HP', v: { score: 0.3, hp: 0.2 } },
  devilPact: { name: 'Teufelspakt', pro: 'Türme +25% Schaden', con: 'Gegner +15% Tempo', v: { dmg: 0.25, speed: 0.15 } },
  greed: { name: 'Gier', pro: 'Kill-Gold +40%', con: 'Bauzeit halbiert', v: { gold: 0.4, buildTime: 0.5 } },
  mercs: { name: 'Söldner', pro: 'Türme +20% Feuerrate', con: 'Neue Türme +25% Kosten', v: { rate: 0.2, cost: 0.25 } },
  gamble: { name: 'Wagnis', pro: '+3 Leben jetzt', con: 'Nächste Welle doppelt', v: { lives: 3, doubleNext: 1 } },
};
