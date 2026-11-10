# Pixel Bastion

Roguelike-Tower-Defense im 8-Bit-Look für den Browser. Hauptmodus ist ein **Daily-Seed**: Alle spielen am selben UTC-Tag dieselbe Karte, dieselben Wellen, denselben Mutator und dieselben Kartenangebote.

Vanilla JS + HTML5 Canvas, ES-Module, kein Framework, kein Build-Schritt, keine externen Assets.

## Starten

```bash
npx serve .
```

Danach die angezeigte Adresse öffnen (meist `http://localhost:3000`). Jeder andere statische Server geht auch, z. B. `python3 -m http.server`.

Hinweis: Viele Browser (z. B. Chrome) blockieren ES-Module bei `file://`. Wenn ein Doppelklick auf `index.html` nur einen schwarzen Bildschirm zeigt, erscheint ein Hinweis; dann bitte einen lokalen Server wie oben nutzen.

## Tests

```bash
npm test
```

Läuft ohne Abhängigkeiten mit Node ≥ 18 (`node test/sim.test.js`). Geprüft wird unter anderem:

- gleicher Seed + gleiche Eingaben -> exakt gleiches Ergebnis (Replay, Zustands-Hash)
- Fortsetzen (Replay bis Tick X + Weiterspielen) == durchgehender Run
- Ergebnis hängt nicht von der Framerate ab (1 vs. 1-5 Ticks pro Frame)
- Kartenangebote hängen nicht vom Spielverhalten ab
- Pfad ist für 1000 Seeds zusammenhängend und unverzweigt, 12-15 Wellen, 2 Bosse
- kein `Math.random()` im Quellcode

## Spielablauf

- Karte mit generiertem Pfad und festen Bauplätzen. 12-15 Wellen, Boss in der Mitte und am Ende.
- Gegner: Läufer, Tank (Rüstung), Heiler, Splitter (zerfällt in Splitterlinge), Flieger (fliegt geradeaus zur Burg), Boss.
- 6 Türme mit Upgrade-Pfad A/B (je 2 Stufen): Pfeil, Kanone (Splash), Frost (Slow), Blitz (Kette), Gift (DoT, ignoriert Rüstung), Banner (Support-Buff).
- Nach jeder Welle 1 aus 3 Karten: neuer Turm, Upgrade, Relikt (16 Stück) oder Risiko-Deal.
- Täglicher Mutator (10 Stück), z. B. Nebel, Erosion, Arsenal-Limit, Zellteilung.
- Score = Wellen + übrige Leben + Zeitbonus + Kill-Combo + Kills (x Risiko-Multiplikator).

### Steuerung

| Aktion | Maus / Touch | Taste |
| --- | --- | --- |
| Bauen | Bauplatz anklicken -> Turm wählen (Touch: zweimal tippen = bestätigen) | `1`-`6` |
| Upgrade A/B | Turm anklicken -> A / B | `Q` / `E` |
| Verkaufen | Turm anklicken -> Verkaufen | `X` |
| Welle starten | `LOS` | Leertaste |
| Pause | Pause-Button | `P` / Leertaste |
| Tempo 1x/2x/3x | `1X`-Button | `F` |
| Ton an/aus | Lautsprecher | `M` |
| Karte wählen | Karte anklicken | `1`-`3` |
| Teilen (Endscreen) | `TEILEN` | `S` |

## Das Seed-System

1. **Seed:** Im Daily-Modus ist der Seed das UTC-Datum als String `YYYY-MM-DD`. Freeplay nutzt einen beliebigen Text.
2. **Hash:** `hash32()` (FNV-1a mit Avalanche-Mix) macht daraus eine 32-Bit-Zahl.
3. **PRNG:** `mulberry32` erzeugt daraus die Zufallszahlen.
4. **Getrennte Streams:** Für jeden Zweck gibt es einen eigenen Stream, `mulberry32(hash32(seed + '|' + zweck))`:
   - `meta`: Mutator, Farbthema, erlaubte Türme
   - `map`: Pfad, Bauplätze, Deko
   - `waves`: Wellenanzahl, Gegnermischung, Spawn-Zeitplan
   - `loot`: alle Kartenangebote, schon beim Start für den ganzen Run erzeugt
   - `combat`: Krit, Einfrieren, Glücksmünze im Kampf

   Ein zusätzlicher Krit-Wurf verschiebt also nie die späteren Kartenangebote. Weil die Angebote vorab feststehen, sehen alle Spieler nach Welle N dieselben drei Karten, egal was sie vorher gewählt haben.
5. **Determinismus:** Die Simulation läuft im festen Takt (60 Ticks/s) und unabhängig von der Framerate (1x/2x/3x = mehr Ticks pro Frame). Sie nutzt nur `+ - * /` und `Math.sqrt` (laut IEEE exakt gerundet), keine Trigonometrie. Rendering, Partikel und Sound haben eigene Optik-Zufallszahlen und lesen den Zustand nur.
6. **Replay:** Jede gültige Eingabe wird als `{ t: tick, a: aktion, ... }` gespeichert (`build`, `upgrade`, `sell`, `pick`, `start`). `replay(config, inputs)` spielt einen Run aus Seed + Eingaben exakt nach. Das Ergebnis eines Runs (`getResult`) enthält die Eingabeliste, damit es später geprüft werden kann. Tempo und Pause sind keine Eingaben, weil sie die Simulation nicht ändern.

### Daily-Regeln

- Ein **zählender Versuch pro Tag**. Er gilt beim Start als verbraucht. Nach einem Neuladen wird er per Replay fortgesetzt (pausiert).
- Danach sind beliebig viele **Übungsruns** ohne Wertung möglich.
- `localStorage` (alle Zugriffe in try/catch) speichert Streak, besten Score, Verlauf (inkl. Eingaben) und den heutigen Versuch.
- **Teilen** kopiert z. B.:

  ```
  Pixel Bastion Daily #314 -> Welle 11 | 3 Leben | Mutator: Nebel
  🟩🟩🟨🟩🟩👑🟩🟥🟩🟨💀
  Score: 12345
  ```

  Ein Emoji pro Welle: 🟩 kein Leben verloren, 🟨 1-2 verloren, 🟥 3+ verloren, 👑/🟧 Boss-Welle ohne/mit Verlust, 💀 gefallen, 🏆 Sieg.

## Dateistruktur

```
index.html, style.css
src/
  main.js        Boot, Canvas-Skalierung (ganzzahlig), Fixed-Timestep-Loop
  rng.js         hash32, mulberry32, Streams, UTC-Datum, Daily-Nummer
  mapgen.js      Pfad + Bauplätze + Deko, Pfad-Validierung (BFS)
  game.js        Simulation ohne DOM: Aktionen, Wellen, Kampf, Karten, Score, Replay
  render.js      Welt-Rendering, Effekte, Nebel
  sprites.js     PICO-8-Palette, alle Sprites als Pixel-Arrays (8x8 / 16x16)
  font.js        3x5-Bitmapfont inkl. Umlaute
  input.js       Pointer-Events (Maus + Touch) und Tastatur
  ui.js          Menü, HUD, Popups, Kartenwahl, Endscreen, Teilen
  audio.js       WebAudio-Chiptune (Rechteck/Dreieck/Noise) + Loop-Melodie
  storage.js     localStorage-Wrapper
  data/          balance, towers, enemies, relics, mutators, cards (alle Balancing-Werte)
test/
  sim.test.js    Determinismus-Tests
  bot.js         einfacher Bot für Tests/Balancing
```

Optik: interne Auflösung 320x180, per CSS ganzzahlig hochskaliert (`image-rendering: pixelated`), nur Farben der PICO-8-Palette.
