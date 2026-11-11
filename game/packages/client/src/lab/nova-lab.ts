/**
 * The Nova Lab (dev server only: /nova-lab.html). The single elements' Area casts as filmstrips, one row each, drawn
 * by the game's art code (art/novas.ts) with a caster standing in the middle between the far and near passes, as the
 * view does it.
 *
 *   ?times=0.04,0.12,0.25,0.45,0.8,1.3   the moments shown, s since the cast (one column each)
 *   ?t=1.0     the clock for the noise (headless screenshots)
 *   ?move=1    the caster walks right while the nova plays (the wave drags along after them)
 *   ?scale=2   screen px per art px
 */
import * as X from '../art/px';
import { drawNova } from '../art/novas';

const q = new URLSearchParams(location.search);
const S = Number(q.get('scale') ?? 2), T0 = Number(q.get('t') ?? 1), move = q.get('move') === '1';
const TIMES = (q.get('times') ?? '0.04,0.12,0.25,0.45,0.8,1.3').split(',').map(Number);
const ROWS: [string, number][] = [['water', 1], ['life', 2], ['cold', 4], ['arcane', 6], ['fire', 8]];
const R = 3.2 * 16, CW = 2 * R + 40, RH = R + 70, W = CW * TIMES.length, H = RH * ROWS.length;
const cv = document.getElementById('c') as HTMLCanvasElement;
cv.width = W * S; cv.height = H * S;
const out = cv.getContext('2d')!; out.imageSmoothingEnabled = false;
const g = X.canvas(W, H), o = X.canvas(W, H);
const light = () => {};

g.x.fillStyle = '#262a31'; g.x.fillRect(0, 0, W, H);
for (let y = 0; y < H; y += 8) for (let x = (y / 8) % 2 ? 8 : 0; x < W; x += 16) X.rect(g.x, x, y, 8, 8, '#2b2f37');
ROWS.forEach(([name, look], ri) => TIMES.forEach((e, ci) => {
  const mx = ci * CW + CW / 2, my = ri * RH + RH * 0.62, walk = move ? e * 3.5 * 16 : 0, x = mx + walk * 0.8, y = my;
  if (ci === 0) X.text(o.x, name, 4, ri * RH + 4, '#7d8494');
  X.text(o.x, `${e}s`, ci * CW + 4, ri * RH + 14, '#5a6070');
  drawNova(o.x, g.x, look, x, y, R, e, T0 + e, 31 + ri, light, 'far', mx, my);
  // the caster, where they stand now
  const bx = mx + walk;
  X.ellipse(o.x, bx, y, 6, 3, '#1a1c22');
  X.rect(o.x, bx - 3, y - 20, 6, 18, '#5a4a7a'); X.rect(o.x, bx - 2, y - 25, 4, 5, '#d8b88a');
  drawNova(o.x, g.x, look, x, y, R, e, T0 + e, 31 + ri, light, 'near', mx, my);
}));
out.drawImage(g.c, 0, 0, W * S, H * S);
out.drawImage(o.c, 0, 0, W * S, H * S);
