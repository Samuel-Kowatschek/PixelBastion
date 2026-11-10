// 3x5-Bitmapfont (nur Großbuchstaben). Jede Zeile = 3 Bit (links = 4).
const G = {
  A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6], E: [7, 4, 6, 4, 7],
  F: [7, 4, 6, 4, 4], G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5], I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2],
  K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7], M: [5, 7, 7, 5, 5], N: [6, 5, 5, 5, 5], O: [2, 5, 5, 5, 2],
  P: [6, 5, 6, 4, 4], Q: [2, 5, 5, 6, 3], R: [6, 5, 6, 5, 5], S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2],
  U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5], Y: [5, 5, 2, 2, 2],
  Z: [7, 1, 2, 4, 7],
  0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [6, 1, 2, 4, 7], 3: [6, 1, 2, 1, 6], 4: [5, 5, 7, 1, 1],
  5: [7, 4, 6, 1, 6], 6: [3, 4, 7, 5, 7], 7: [7, 1, 1, 2, 2], 8: [7, 5, 7, 5, 7], 9: [7, 5, 7, 1, 6],
  ' ': [0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 2], ',': [0, 0, 0, 2, 4], ':': [0, 2, 0, 2, 0], ';': [0, 2, 0, 2, 4],
  '!': [2, 2, 2, 0, 2], '?': [6, 1, 2, 0, 2], '-': [0, 0, 7, 0, 0], '+': [0, 2, 7, 2, 0], '/': [1, 1, 2, 4, 4],
  '(': [1, 2, 2, 2, 1], ')': [4, 2, 2, 2, 4], '%': [5, 1, 2, 4, 5], "'": [2, 2, 0, 0, 0],
  '"': [5, 5, 0, 0, 0], '<': [1, 2, 4, 2, 1], '>': [4, 2, 1, 2, 4], '=': [0, 7, 0, 7, 0], '_': [0, 0, 0, 0, 7],
  '*': [0, 5, 2, 5, 0], '[': [3, 2, 2, 2, 3], ']': [6, 2, 2, 2, 6], '|': [2, 2, 2, 2, 2], '&': [2, 5, 2, 5, 3],
  '$': [3, 6, 2, 3, 6],
  // Umlaute kompakt innerhalb der 5 Zeilen (Punkte oben, Buchstabe gestaucht)
  'Ä': [5, 0, 2, 7, 5], 'Ö': [5, 0, 7, 5, 7], 'Ü': [5, 0, 5, 5, 7],
};
// Breite Sonderzeichen (5 Spalten)
const WIDE = { '#': [10, 31, 10, 31, 10] };

export const CHAR_W = 4;
export const LINE_H = 7;

export function normalize(str) {
  return String(str).toUpperCase().replace(/ß/g, 'SS');
}

export function textWidth(str, scale = 1) {
  const s = normalize(str);
  let w = 0;
  for (const ch of s) w += WIDE[ch] ? 6 : CHAR_W;
  return s.length ? (w - 1) * scale : 0;
}

/** Zeichnet Text in Pixeln (fillRect, keine Glättung). */
export function drawText(ctx, str, x, y, color, scale = 1) {
  const s = normalize(str);
  ctx.fillStyle = color;
  x = Math.round(x); y = Math.round(y);
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (WIDE[ch]) {
      const g = WIDE[ch];
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (g[r] & (16 >> c)) ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
      x += 6 * scale;
      continue;
    }
    const g = G[ch] || G['?'];
    for (let r = 0; r < 5; r++) {
      const row = g[r];
      if (!row) continue;
      for (let c = 0; c < 3; c++) {
        if (row & (4 >> c)) ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
      }
    }
    x += CHAR_W * scale;
  }
}

/** Text mit 1px-Schatten/Umriss. */
export function drawTextShadow(ctx, str, x, y, color, shadow, scale = 1) {
  drawText(ctx, str, x + scale, y + scale, shadow, scale);
  drawText(ctx, str, x, y, color, scale);
}

export function drawTextCentered(ctx, str, cx, y, color, scale = 1, shadow = null) {
  const x = Math.round(cx - textWidth(str, scale) / 2);
  if (shadow) drawTextShadow(ctx, str, x, y, color, shadow, scale);
  else drawText(ctx, str, x, y, color, scale);
}

/** Bricht Text in Zeilen mit max. Zeichen pro Zeile um. */
export function wrapText(str, maxChars) {
  const words = normalize(str).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur.length) cur = w;
    else if (cur.length + 1 + w.length <= maxChars) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur.length) lines.push(cur);
  return lines;
}
