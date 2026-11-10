// Kartengenerierung aus dem Map-Stream: Pfad (zusammenhängend, nicht verzweigt),
// Bauplätze und Dekoration.
import { BALANCE } from './data/balance.js';

const key = (x, y) => y * 1000 + x;

/** Prüft per BFS, dass der Pfad zusammenhängend vom Start zum Ziel führt und unverzweigt ist. */
export function validatePath(tiles, cols, rows) {
  if (tiles.length < 2) return false;
  const set = new Set(tiles.map((t) => key(t.x, t.y)));
  if (set.size !== tiles.length) return false;
  for (const t of tiles) {
    if (t.x < 0 || t.y < 0 || t.x >= cols || t.y >= rows) return false;
    let n = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (set.has(key(t.x + dx, t.y + dy))) n++;
    if (n > 2) return false; // Abkürzung/Verzweigung
  }
  const start = tiles[0], end = tiles[tiles.length - 1];
  const seen = new Set([key(start.x, start.y)]);
  const q = [start];
  while (q.length) {
    const c = q.shift();
    if (c.x === end.x && c.y === end.y) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = key(c.x + dx, c.y + dy);
      if (set.has(k) && !seen.has(k)) { seen.add(k); q.push({ x: c.x + dx, y: c.y + dy }); }
    }
  }
  return false;
}

function genPathTiles(rng, cols, rows) {
  let y = rng.int(1, rows - 2);
  let x = 0;
  const tiles = [{ x, y }];
  let first = true;
  while (x < cols - 1) {
    const run = first ? rng.int(1, 3) : rng.int(2, 4);
    first = false;
    for (let i = 0; i < run && x < cols - 1; i++) { x++; tiles.push({ x, y }); }
    if (x >= cols - 2) {
      while (x < cols - 1) { x++; tiles.push({ x, y }); }
      break;
    }
    let ny;
    let guard = 0;
    do { ny = rng.int(0, rows - 1); guard++; } while ((Math.abs(ny - y) < 2) && guard < 50);
    if (Math.abs(ny - y) < 2) continue;
    const dir = ny > y ? 1 : -1;
    while (y !== ny) { y += dir; tiles.push({ x, y }); }
  }
  return tiles;
}

export function generateMap(rng) {
  const { cols, rows, tile } = BALANCE;
  let tiles;
  for (let attempt = 0; attempt < 100; attempt++) {
    tiles = genPathTiles(rng, cols, rows);
    if (tiles.length >= 30 && validatePath(tiles, cols, rows)) break;
  }
  // Spiegeln (Start rechts) für mehr Abwechslung
  if (rng.chance(0.5)) tiles = tiles.map((t) => ({ x: cols - 1 - t.x, y: t.y }));

  const pathSet = new Set(tiles.map((t) => key(t.x, t.y)));

  // Wegpunkte (Ecken) in Pixeln, Start außerhalb des Bildschirms
  const center = (t) => ({ x: t.x * tile + tile / 2, y: t.y * tile + tile / 2 });
  const s0 = tiles[0], s1 = tiles[1];
  const pts = [{ x: center(s0).x - (s1.x - s0.x) * tile, y: center(s0).y }];
  for (let i = 0; i < tiles.length; i++) {
    const prev = tiles[i - 1], cur = tiles[i], next = tiles[i + 1];
    if (!prev || !next) { pts.push(center(cur)); continue; }
    const straight = (prev.x === cur.x && cur.x === next.x) || (prev.y === cur.y && cur.y === next.y);
    if (!straight) pts.push(center(cur));
  }
  const segLens = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.abs(pts[i + 1].x - pts[i].x) + Math.abs(pts[i + 1].y - pts[i].y);
    segLens.push(l);
    total += l;
  }

  // Bauplätze: Felder direkt neben dem Pfad (inkl. diagonal)
  const near = (x, y, r) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (pathSet.has(key(x + dx, y + dy))) return true;
    return false;
  };
  const candidates = [];
  const candidates2 = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (pathSet.has(key(x, y))) continue;
      if (near(x, y, 1)) candidates.push({ x, y });
      else if (near(x, y, 2)) candidates2.push({ x, y });
    }
  }
  const plotCount = rng.int(BALANCE.plots.min, BALANCE.plots.max);
  const plotSet = new Set();
  const plots = [];
  const adjacentPlot = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => plotSet.has(key(x + dx, y + dy)));
  for (const c of rng.shuffle(candidates)) {
    if (plots.length >= plotCount) break;
    if (adjacentPlot(c.x, c.y)) continue;
    plotSet.add(key(c.x, c.y));
    plots.push({ id: plots.length, tx: c.x, ty: c.y, x: c.x * tile + 8, y: c.y * tile + 8, tower: null, hidden: false });
  }
  // Versteckte Extra-Plätze (Relikt "Bauplan")
  const extraPool = rng.shuffle(candidates.concat(candidates2).filter((c) => !plotSet.has(key(c.x, c.y)) && !adjacentPlot(c.x, c.y)));
  for (let i = 0; i < BALANCE.plots.extra && i < extraPool.length; i++) {
    const c = extraPool[i];
    plotSet.add(key(c.x, c.y));
    plots.push({ id: plots.length, tx: c.x, ty: c.y, x: c.x * tile + 8, y: c.y * tile + 8, tower: null, hidden: true });
  }

  // Deko + Bodenvariation (nur Optik, aber ebenfalls aus dem Seed)
  const deco = [];
  const groundVar = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      groundVar.push(rng.int(0, 1000));
      if (pathSet.has(key(x, y)) || plotSet.has(key(x, y))) continue;
      if (rng.chance(0.28)) {
        deco.push({ x: x * tile + rng.int(0, 8), y: y * tile + rng.int(0, 8), kind: rng.pick(['tree', 'tree', 'rock', 'flower', 'tuft', 'tuft']) });
      }
    }
  }

  const start = tiles[0], end = tiles[tiles.length - 1];
  return {
    cols, rows, tile,
    tiles, pathSet: [...pathSet],
    points: pts, segLens, length: total,
    plots, deco, groundVar,
    spawn: pts[0], base: center(end), startTile: start, endTile: end,
  };
}

/** Position auf dem Pfad bei Distanz d. */
export function pathPos(map, d) {
  const pts = map.points;
  if (d <= 0) return { x: pts[0].x, y: pts[0].y };
  for (let i = 0; i < map.segLens.length; i++) {
    const l = map.segLens[i];
    if (d <= l) {
      const a = pts[i], b = pts[i + 1];
      const f = d / l;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    d -= l;
  }
  const last = pts[pts.length - 1];
  return { x: last.x, y: last.y };
}
