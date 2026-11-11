/**
 * The Missile Lab (dev server only: /missile-lab.html). The Earth form's missiles flying across the page, one row each,
 * drawn by the game's own art code (art/rock-flight.ts), at the game's speed (SHAPES.missileSpeed).
 *
 *   ?t=0.4      freeze the clock there (headless screenshots); each row's missile is thrown every 1.2 s
 *   ?tiers=1,3,5  one column per tier (the spell's runes)
 *   ?scale=3    screen px per art px
 */
import * as X from '../art/px';
import * as K from '../art/kit';
import * as RF from '../art/rock-flight';
import { SHAPES } from '@wizard-sim/sim';

const q = new URLSearchParams(location.search);
const frozen = q.has('t') ? Number(q.get('t')) : null;
const S = Number(q.get('scale') ?? 3);
const ROWS = ['earth + fire', 'earth + cold', 'earth + water + cold', 'earth + arcane', 'life + earth', 'earth'];
const TIERS = (q.get('tiers') ?? '1,3,5').split(',').map(Number), CW = 300, W = CW * TIERS.length, RH = 46, H = ROWS.length * RH + 6, PERIOD = 1.2, V = SHAPES.missileSpeed * 16; // px a second, flying across
const cv = document.getElementById('c') as HTMLCanvasElement;
cv.width = W * S; cv.height = H * S;
const out = cv.getContext('2d')!; out.imageSmoothingEnabled = false;
const art = X.canvas(W, H);

const t00 = performance.now();
function frame(): void {
  const t = frozen ?? (performance.now() - t00) / 1000, c = art.x;
  X.rect(c, 0, 0, W, H, '#262a31');
  for (let y = 0; y < H; y += 8) for (let x = (y / 8) % 2 ? 8 : 0; x < W; x += 16) X.rect(c, x, y, 8, 8, '#2b2f37');
  TIERS.forEach((n, ci) => ROWS.forEach((name, k) => {
    const yg = 6 + k * RH + 34, y = yg - 10, born = Math.floor(t / PERIOD) * PERIOD, x0 = ci * CW + 20;
    // the ice flies faster, as three staggered shards
    const ice = k === 2, v = ice ? SHAPES.iceShardSpeed * 16 : V, x = x0 + 10 + ((t - born) * v) % (CW - 30);
    X.text(c, `${name} (${n})`, ci * CW + 4, 6 + k * RH, '#7d8494');
    X.ellipse(c, x, yg, 5, 2, 'rgba(8,6,16,0.45)');
    const f: RF.Flight = { x, y, yg, ux: 1, uy: 0, v, r: 3 + n, born, seed: 17 + k, n };
    if (k === 0) RF.meteor(c, f, t);
    else if (k === 1) RF.snowball(c, f, t);
    else if (ice) for (let s2 = 0; s2 < 3; s2++) RF.iceShard(c, { ...f, x: x - s2 * 11, y: y + (s2 === 0 ? 0 : s2 === 1 ? -2.4 : 2.4), r: 2 + n * 0.6, seed: 17 + s2 }, t);
    else if (k === 3) RF.arcaneOrb(c, f, t, (t - born) * SHAPES.missileSpeed * 0.9);
    else if (k === 4) RF.lifeSeed(c, { ...f, r: 4 }, t, (ts) => (ts < born ? null : [x - (t - ts) * V, y]));
    else K.rock(c, x, y, 3 + n, 17, K.ROCK_MAT.earth, (t - born) * SHAPES.missileSpeed * 0.9);
  }));
  out.drawImage(art.c, 0, 0, W * S, H * S);
  if (frozen === null) requestAnimationFrame(frame);
}
frame();
