/**
 * The ring's shape, shared by every element's ring (the Area cast on yourself): the shape half of a ring, apart from
 * its look (docs/threads/spell-effects-3d.md, "Split the shape from the look"). Taken out of the Frost ring (cold.ts),
 * the first ring built; each element's ring supplies only its parts and its timing.
 *
 * - **Where and how big**: the sim's burst event (its radius, SHAPES.novaRadius + novaPerRune a rune; the sim hits the
 *   whole disc at once), and the runes read back from the radius.
 * - **The front**: it starts at `RING.r0` and eases out to the radius (`frontR`); a bigger ring takes longer in
 *   proportion (`stretchOf`), so a front always travels at about the same speed.
 * - **Following the caster**: the front follows a caster who walks, most of the way (`RING.follow`, as the pixel
 *   game's vfx.ts novaDepth), so the caster's spot is kept per sim tick (`RingTracker`), cut back on a rewind, and
 *   handed to the shaders as `uPath` (`PATH_GLSL`'s `centerAt`, `frontR`).
 *
 * Stateless in the kit's sense: every frame is a function of the clock, the event and the kept path, so rollback and
 * the lab's frozen moments draw the same thing.
 */
import * as THREE from 'three';
import { MAX_SEATS, SHAPES, specOf, type SpellSpec, type World } from '@wizard-sim/sim';

export const RING = {
  /** Where the front starts (u from the centre). */
  r0: 0.35,
  /** How much of the caster's walk the front follows (vfx.ts novaDepth's drag). */
  follow: 0.8,
  /** The ease of the front out to the radius: 1 - (1 - q)^ease. */
  ease: 1.3,
};

/** How much slower than the tuned timing a ring of radius r plays (art/novas.ts novaStretch, without its knob). */
export const stretchOf = (r: number): number => Math.min(3, Math.max(0.7, r / SHAPES.novaRadius));
/** The runes behind a ring of radius r (the sim's radius ladder, read back). */
export const runesOf = (r: number): number => Math.max(1, Math.min(5, Math.round((r - SHAPES.novaRadius) / SHAPES.novaPerRune) + 1));
/** The front's radius at q reach times (0 at the cast, 1 at the full radius r). */
export const frontR = (r: number, q: number): number => RING.r0 + (r - RING.r0) * (1 - Math.pow(1 - Math.min(1, Math.max(0, q)), RING.ease));

/** Ticks of the caster's path kept a ring, and the spacing of its samples on the GPU. */
export const PATH_TICKS = 120, PATH_N = 32, PATH_STEP = 4;

/** The caster's path and the front's radius, for particles: `centerAt(age)`, `frontR(age)`. */
export const PATH_GLSL = /* glsl */ `
uniform vec2 uPath[${PATH_N}];
uniform float uAge, uR, uTr, uR0, uH, uGy;
vec2 centerAt(float a) {
  float f = clamp(a * 60.0 / ${PATH_STEP}.0, 0.0, ${PATH_N - 1}.0); int i = int(floor(f)), j = min(i + 1, ${PATH_N - 1});
  return mix(uPath[i], uPath[j], fract(f));
}
float frontR(float a) { float q = clamp(a / uTr, 0.0, 1.0); return mix(uR0, uR, 1.0 - pow(1.0 - q, ${RING.ease.toFixed(2)})); }
`;

/** A fresh `uPath` uniform's value. */
export const pathUniform = (): THREE.Vector2[] => Array.from({ length: PATH_N }, () => new THREE.Vector2());

/** A ring as the sim cast it, and the caster's path since (sim x, y per tick). */
export interface RingRec { tick: number; who: number; x: number; y: number; r: number; seed: number; path: number[] }

/** The front's centre at `age` s: the cast point dragged most of the way toward where the caster was then. */
export function centerAt(r: RingRec, age: number): [number, number] {
  const p = r.path, n = p.length / 2;
  if (!n) return [r.x, r.y];
  const f = Math.min(n - 1, Math.max(0, age * 60)), i = Math.floor(f), j = Math.min(n - 1, i + 1), k = f - i;
  const bx = p[i * 2] + (p[j * 2] - p[i * 2]) * k, by = p[i * 2 + 1] + (p[j * 2 + 1] - p[i * 2 + 1]) * k;
  return [r.x + (bx - r.x) * RING.follow, r.y + (by - r.y) * RING.follow];
}

/** Fill a `uPath` uniform from ring `r`, sampled every PATH_STEP ticks from the cast. */
export function fillPath(out: THREE.Vector2[], r: RingRec): void {
  out.forEach((v, i) => v.set(...centerAt(r, (i * PATH_STEP) / 60)));
}

/**
 * Keeps the rings one element draws: new ones from the sim's burst events whose spell `match`es, each caster's spot
 * per tick, cut back on a rewind, and forgotten `lifeOf(r)` seconds after the cast.
 */
export class RingTracker {
  recs: RingRec[] = [];

  constructor(
    private readonly match: (s: SpellSpec | null | undefined) => boolean,
    private readonly lifeOf: (r: number) => number,
  ) {}

  /** After each sim step (shown or replayed): new rings, and every live ring's caster's spot this tick. */
  afterStep(w: World): void {
    const tick = w.clock[0];
    for (const e of w.events) {
      if (e.kind !== 'burst' || e.who < 0 || e.who >= MAX_SEATS || !w.seats.active[e.who]) continue;
      if (!this.match(specOf(w, e.who))) continue;
      if (this.recs.some((r) => r.tick === tick && r.who === e.who)) continue;
      this.recs.push({ tick, who: e.who, x: e.x, y: e.y, r: e.amount ?? SHAPES.novaRadius, seed: (tick * 31 + e.who * 7) % 9973, path: [] });
    }
    for (const r of this.recs) {
      const k = tick - r.tick;
      if (k < 0 || k >= PATH_TICKS) continue;
      const b = w.bodies, on = b.hp[r.who] > 0, last = r.path.length >= 2 ? [r.path[r.path.length - 2], r.path[r.path.length - 1]] : [r.x, r.y];
      // the path holds tick k at index k (a gap after a skipped step repeats the last spot)
      while (r.path.length / 2 < k) r.path.push(last[0], last[1]);
      r.path.length = k * 2;
      r.path.push(on ? b.x[r.who] : last[0], on ? b.y[r.who] : last[1]);
    }
    this.recs = this.recs.filter((r) => (tick - r.tick) / 60 < this.lifeOf(r.r) + 0.1);
  }

  /** A rewind put the world back to `tick`: rings cast after it go, and every path is cut back to it. */
  rewind(tick: number): void {
    this.recs = this.recs.filter((r) => r.tick <= tick);
    for (const r of this.recs) r.path.length = Math.min(r.path.length, (tick - r.tick + 1) * 2);
  }

  /** The rings drawn at time t (s, the sim clock). */
  live(t: number): RingRec[] {
    return this.recs.filter((r) => { const a = t - r.tick / 60; return a >= 0 && a <= this.lifeOf(r.r); });
  }

  reset(): void { this.recs = []; }
}
