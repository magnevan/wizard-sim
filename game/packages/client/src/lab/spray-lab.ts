/**
 * The Spray Lab (dev server only: /spray-lab.html). Every spray at one to five runes, side by side, drawn by the
 * game's own art code at the game's scale, so a redesign can be judged and screenshotted without a fight.
 *
 *   ?t=1.2        freeze the clock there (headless screenshots)
 *   ?sweep=1      the aim swings back and forth, as a player sweeping a crowd
 *   ?old=1        the old cone (kit.ts) beside each, for comparing
 *   ?hit=1        the sim's hit sector, dotted
 *   ?kinds=water,fire,cold,scald   which columns (also arcane-beam, life-beam, fire-beam: the beams' rune tiers)
 *   ?scale=3      screen px per art px
 */
import * as X from '../art/px';
import * as K from '../art/kit';
import { AimTrail, sprayJet, type Aim, type JetKind } from '../art/spray-jet';
import { FY, TAU } from '../art/util';
import { SHAPES } from '@wizard-sim/sim';

const q = new URLSearchParams(location.search);
const frozen = q.has('t') ? Number(q.get('t')) : null;
const kinds = (q.get('kinds') ?? 'water,fire,cold').split(',') as JetKind[];
const S = Number(q.get('scale') ?? 2);
const PPU = 16, CW = 230, CH = 128, TIP = 22;
const ROWS = (q.get('rows') ?? '1,2,3,4,5').split(',').map(Number);
let sweep = q.get('sweep') === '1', old = q.get('old') === '1', hit = q.get('hit') === '1';

const cols = kinds.flatMap((k) => (old ? [{ k, old: true }, { k, old: false }] : [{ k, old: false }]));
const W = cols.length * CW, H = ROWS.length * CH + 14;
const cv = document.getElementById('c') as HTMLCanvasElement;
cv.width = W * S; cv.height = H * S;
const out = cv.getContext('2d')!; out.imageSmoothingEnabled = false;
const art = X.canvas(W, H);
const trails = new Map<string, AimTrail>();

const bar = document.getElementById('bar')!;
for (const [name, get, set] of [['sweep', () => sweep, (v: boolean) => { sweep = v; }], ['hit sector', () => hit, (v: boolean) => { hit = v; }]] as const) {
  const l = document.createElement('label'), b = document.createElement('input');
  b.type = 'checkbox'; b.checked = get(); b.onchange = () => set(b.checked);
  l.append(b, ' ' + name); bar.append(l);
}
const note = document.createElement('span');
note.textContent = 'rows: 1 to 5 runes of the form element' + (old ? ' · left of each pair: the old cone' : '');
bar.append(note);

function aimOf(cx: number, cy: number, n: number, ts: number): Aim {
  const x = cx + 30, ground = cy + 78, y = ground - TIP;
  const R = (SHAPES.sprayRange + 0.5 * (n - 1)) * PPU, th = sweep ? 0.2 + 0.75 * Math.sin(ts * 2.1) : 0.2;
  return { x, y, ground, ex: x + Math.cos(th) * R, ey: ground + Math.sin(th) * R * FY };
}

const t00 = performance.now();
function frame(): void {
  const t = frozen ?? (performance.now() - t00) / 1000 + 0.001, c = art.x;
  X.rect(c, 0, 0, W, H, '#262a31');
  for (let y = 0; y < H; y += 8) for (let x = (y / 8) % 2 ? 8 : 0; x < W; x += 16) X.rect(c, x, y, 8, 8, '#2b2f37');
  cols.forEach((col, ci) => {
    X.text(c, (col.old ? 'old ' : '') + col.k, ci * CW + 6, 4, '#c8ccd6');
    for (let r = 0; r < ROWS.length; r++) {
      const n = ROWS[r], cx = ci * CW, cy = 14 + r * CH, half = SHAPES.sprayHalfAngle * (1 + 0.25 * (n - 1)) * TAU;
      const key = `${ci}:${n}`, tr = trails.get(key) ?? new AimTrail(); trails.set(key, tr);
      // a steady frame rate's worth of history, so a frozen frame shows the same bend as a live one
      for (let k = 90; k >= 0; k--) tr.record(t - k / 60, 0, aimOf(cx, cy, n, t - k / 60));
      const A = aimOf(cx, cy, n, t);
      X.text(c, String(n), cx + 4, cy + 60, '#7d8494');
      // the caster: a shadow and a staff
      X.ellipse(c, A.x - 6, A.ground, 6, 3, '#1a1c22');
      X.rect(c, A.x - 9, A.ground - 20, 6, 18, '#5a4a7a'); X.rect(c, A.x - 8, A.ground - 25, 4, 5, '#d8b88a');
      X.line(c, A.x - 4, A.ground - 6, A.x, A.y, '#8a6a48');
      if (hit) {
        const dx = A.ex - A.x, dy = (A.ey - A.ground) / FY, L = Math.hypot(dx, dy), a0 = Math.atan2(dy, dx);
        for (let k = 0; k <= 40; k++) { const a = a0 - half + (2 * half * k) / 40; X.px(c, A.x + Math.cos(a) * L, A.ground + Math.sin(a) * L * FY, '#5a6070'); }
        for (const s of [-1, 1]) for (let d = 0; d < L; d += 4) X.px(c, A.x + Math.cos(a0 + s * half) * d, A.ground + Math.sin(a0 + s * half) * d * FY, '#5a6070');
      }
      if ((col.k as string).endsWith('beam')) {
        const el = (col.k as string).split('-')[0], R = el === 'life' ? X.LIFE_L : X.EL[el], z: [number, number] = [A.ex + 70, A.ey - 9];
        if (el === 'fire') K.fireBeam(c, [A.x, A.y], z, t, true); else K.beam(c, [A.x, A.y], z, t, R, { w: K.beamW(n), hit: true, seed: 977 });
        K.beamSurge(c, [A.x, A.y], z, t, el === 'fire' ? X.EL.fire : R, n, 977, true);
      } else if (col.old) {
        const kind: K.ConeKind = col.k === 'cold' ? 'cold' : col.k;
        K.cone(c, [A.x, A.y], [A.ex, A.ey - 6], t, kind, 0, { spread: 0.28, seed: 977 });
      } else sprayJet(c, { kind: col.k, n, half, endH: 6, t0: 0, seed: 977, aim: tr.at }, t);
    }
  });
  out.drawImage(art.c, 0, 0, W * S, H * S);
  if (frozen === null) requestAnimationFrame(frame);
  else document.documentElement.dataset.ready = '1';
}
frame();
