/**
 * The Arcane shockwave (the user, 2026-11-28, on the plasma wave: "its not bad, but i want to try out a less organic and
 * more discrete magical shockwave"; on Codex's six ideas, docs/reference/spell-concepts/arcane/arcane-shockwave-1.jpg:
 * "something like 1 or 5 on the floor. maybe 3 on top"). Drawn for the Arcane nova (the Area on yourself), the burst
 * (cut to the aimed fan), the delayed blast going off (a whole ring where it was placed) and Attune (a small one).
 *
 * - **On the floor** (ideas 1 and 5): a magic circle: a bright outer ring, an inner ring of glyphs (small diamonds)
 *   turning, a third ring inside, and spokes; it steps out in discrete jumps (four, each eased quickly), leaving faint
 *   afterimage rings where it stood, and flashes as it reaches its edge, then fades.
 * - **On top** (idea 3): a translucent shell wall rising from the circle's edge: thin, magenta, a crisp bright rim at its
 *   top and bands of light running up it; it stands while the circle runs and fades after.
 *
 * Sizes and timing are the sim's (the ring's radius from its burst event; the front's ease from ring-shape.ts). A pure
 * function of the records and the clock, kept per tick and cut back on a rewind, as cold.ts and fire-wave.ts.
 */
import * as THREE from 'three';
import { EL, MAX_SEATS, specOf, type World } from '@wizard-sim/sim';
import { GroundDecal } from './decal';
import type { SpellLights } from './lights';
import { NovaRing } from './nova-ring';
import { RING, RingTracker, centerAt, frontR, runesOf, stretchOf, type RingRec } from './ring-shape';
import { isArcaneBurst, isArcaneNova, isZoneBlast } from './fire-wave';

/** Seconds the front takes to reach a three-unit ring (in four steps), and the fade after. */
const ARC = { reach: 0.34, steps: 4, hold: 0.12, fade: 0.55, shellH: 0.75, shellPerRune: 0.12 };
const lifeOf = (): number => ARC.reach * 3 + ARC.hold + ARC.fade + 0.2;

/** The fan mask (cold.ts's): uHalf over 3.1 is a whole ring. */
const FAN = /* glsl */ `
uniform float uFace, uHalf;
float fanK(float th) {
  if (uHalf > 3.1) return 1.0;
  float d = abs(atan(sin(th - uFace), cos(th - uFace)));
  return 1.0 - smoothstep(uHalf * 0.85, uHalf * 1.08, d);
}
`;

/** The magic circle on the floor. */
const CIRCLE = /* glsl */ `
uniform vec2 uC; uniform float uR, uPrev, uPrev2, uFlash, uFade, uClock, uSpin;
${FAN}
float band(float x, float c, float w) { return 1.0 - smoothstep(w * 0.5, w * 0.5 + 0.04, abs(x - c)); }
vec4 decal(vec3 wp) {
  vec2 d = wp.xz - uC; float rr = length(d), th = atan(d.y, d.x);
  float R = max(uR, 0.05);
  if (rr > R + 0.4 || uFade <= 0.0) return vec4(0.0);
  float fan = fanK(th);
  if (fan <= 0.0) return vec4(0.0);
  // the outer ring, crisp, with a soft glow round it
  float outer = band(rr, R, 0.14), glowO = exp(-pow((rr - R) / 0.18, 2.0));
  // the glyph ring: small diamonds turning round it
  float n = max(8.0, floor(R * 4.0)), cell = fract((th + uSpin) * n / 6.2831853) - 0.5;
  vec2 q = vec2((rr - R * 0.84) / 0.16, cell * 6.2831853 * R * 0.84 / n / 0.16);
  float glyph = 1.0 - smoothstep(0.85, 1.0, abs(q.x) + abs(q.y));
  float ring2 = band(rr, R * 0.84, 0.05) * 0.7, ring3 = band(rr, R * 0.52, 0.07);
  // spokes (eight, turning slowly the other way), between the inner ring and the outer
  float sp = abs(sin((th - uSpin * 0.5) * 4.0)) * rr;
  float spokes = (1.0 - smoothstep(0.03, 0.07, sp)) * step(R * 0.2, rr) * step(rr, R * 0.84);
  // the afterimages: faint rings where it stood a step ago, and two
  float ghost = band(rr, uPrev, 0.09) * 0.5 + band(rr, uPrev2, 0.07) * 0.25;
  float lines = outer + glyph * 0.9 + ring2 + ring3 * 0.8 + spokes * 0.7 + ghost;
  // covering, saturated magenta (light added over the pale stone washed it to pale pink), white-pink at the flash
  lines = min(lines, 1.0);
  vec3 c = mix(vec3(0.95, 0.06, 0.85), vec3(1.9, 1.2, 2.0), uFlash * 0.7) * (1.0 + 0.6 * uFlash);
  float a = min(0.95, lines * 0.9 + glowO * (0.12 + 0.3 * uFlash)) * uFade * fan;
  return vec4(c * a, a);
}`;

/** The shell: a translucent wall on the circle's edge, a crisp bright rim on top, bands of light running up it. */
const SHELL = /* glsl */ `
uniform float uFade, uClock, uGrow;
${FAN}
vec4 look(vec2 p) {
  float H = max(uHeight * uGrow, 1e-3), y = p.y / H;
  if (y > 1.0 || uFade <= 0.0) return vec4(0.0);
  float fan = fanK(p.x);
  float rim = smoothstep(0.86, 0.97, y) * (1.0 - smoothstep(0.985, 1.0, y));
  float bands = smoothstep(0.82, 1.0, fract(y * 3.0 - uClock * 2.5)) * 0.5;
  float body = 0.22 + 0.25 * (1.0 - y);
  float a = (body + bands * 0.35 + rim * 0.9) * uFade * fan * smoothstep(0.0, 0.05, y);
  vec3 c = mix(vec3(0.85, 0.08, 0.8), vec3(1.8, 1.0, 1.9), rim);
  return vec4(c * a, min(a, 0.95));
}`;

interface Wave { rec: RingRec; face: number; half: number; ring: boolean }

class Slot {
  readonly group = new THREE.Group();
  readonly circle: GroundDecal;
  readonly shell: NovaRing;
  readonly F = { uFace: { value: 0 }, uHalf: { value: Math.PI } };
  readonly D = { uC: { value: new THREE.Vector2() }, uR: { value: 0 }, uPrev: { value: 0 }, uPrev2: { value: 0 }, uFlash: { value: 0 }, uFade: { value: 0 }, uClock: { value: 0 }, uSpin: { value: 0 }, ...this.F };
  readonly S = { uFade: { value: 0 }, uClock: { value: 0 }, uGrow: { value: 0 }, ...this.F };
  private covered = '';

  constructor() {
    this.circle = new GroundDecal({ look: CIRCLE, uniforms: this.D, order: -1, step: 0.2 });
    this.shell = new NovaRing({ look: SHELL, uniforms: this.S, columns: 256, soft: 0.1, order: 2 });
    this.circle.mesh.name = 'arcnova.circle'; this.shell.mesh.name = 'arcnova.shell';   // ?fxoff= (view3d/fx-off.ts)
    this.group.add(this.circle.mesh, this.shell.mesh);
  }

  /** Draw wave `w` at age `age` s. Returns the light's strength. */
  draw(w: Wave, age: number, heightAt: (x: number, y: number) => number): number {
    const r = w.rec, n = runesOf(r.r), Tr = ARC.reach * stretchOf(r.r), q = Math.max(0, age / Tr);
    // four discrete steps, each eased in quickly
    const st = (k: number) => frontR(r.r, Math.min(1, k / ARC.steps));
    const k = Math.min(ARC.steps, Math.floor(q * ARC.steps)), f = q * ARC.steps - k;
    const R = k >= ARC.steps ? r.r : st(k) + (st(k + 1) - st(k)) * Math.min(1, f / 0.35);
    const done = Math.max(0, age - Tr), fade = 1 - Math.min(1, Math.max(0, (done - ARC.hold) / ARC.fade));
    const [cx, cy] = w.ring ? centerAt(r, age) : [r.x, r.y];
    this.F.uFace.value = w.face; this.F.uHalf.value = w.half;
    this.D.uC.value.set(cx, cy); this.D.uR.value = R; this.D.uFade.value = fade; this.D.uClock.value = age; this.D.uSpin.value = age * 0.9;
    this.D.uPrev.value = k >= 1 ? st(Math.min(k, ARC.steps - 1)) : 0; this.D.uPrev2.value = k >= 2 ? st(Math.min(k - 1, ARC.steps - 2)) : 0;
    this.D.uFlash.value = done > 0 ? Math.max(0, 1 - done / 0.15) : 0;
    this.S.uFade.value = fade * (done > 0 ? Math.max(0.3, 1 - done / (ARC.hold + ARC.fade)) : 1); this.S.uClock.value = age; this.S.uGrow.value = Math.min(1, q * 3);
    const H = ARC.shellH + ARC.shellPerRune * (n - 1);
    this.shell.mesh.visible = fade > 0 && R > RING.r0;
    if (this.shell.mesh.visible) this.shell.place(cx, cy, R, H, 0, heightAt);
    const key = `${r.tick}:${r.who}:${r.x}`;
    if (this.covered !== key) { this.covered = key; this.circle.heightAt = heightAt; const p = r.r + 1; this.circle.cover({ x0: r.x - p, z0: r.y - p, x1: r.x + p, z1: r.y + p }); }
    this.group.visible = fade > 0;
    return fade * (done > 0 ? 1 : 0.6);
  }

  hide(): void { this.group.visible = false; }
  dispose(): void { this.circle.dispose(); this.shell.dispose(); }
}

/** Every Arcane nova, burst, delayed blast going off and Attune. */
export class ArcaneNovas {
  readonly group = new THREE.Group();
  private readonly rings = new RingTracker(isArcaneNova, lifeOf);
  private bursts: Wave[] = [];
  private slots: Slot[] = [];
  heightAt: (x: number, y: number) => number = () => 0;

  constructor() { const s = this.slot(); s.hide(); }
  private slot(): Slot { const s = new Slot(); this.slots.push(s); this.group.add(s.group); return s; }

  afterStep(w: World): void {
    this.rings.afterStep(w);
    const tick = w.clock[0], has = (x: number, y: number, who: number) => this.bursts.some((b) => b.rec.tick === tick && b.rec.who === who && b.rec.x === x && b.rec.y === y);
    for (const e of w.events) {
      // the burst (Shift+LMB): cut to the aimed fan
      if (e.kind === 'move' && isArcaneBurst(e) && e.who >= 0 && e.who < MAX_SEATS) {
        if (has(e.x, e.y, e.who)) continue;
        const face = Math.atan2((e.y2 ?? e.y) - e.y, (e.x2 ?? e.x) - e.x);
        this.bursts.push({ rec: { tick, who: e.who, x: e.x, y: e.y, r: e.amount ?? 2.5, seed: tick % 9973, path: [] }, face, half: (e.half ?? 0.17) * Math.PI * 2, ring: false });
      }
      // a delayed blast going off: a whole one where it was placed
      if (e.kind === 'burst' && e.look === EL.arcane && isZoneBlast(w, e) && !has(e.x, e.y, e.who)) {
        this.bursts.push({ rec: { tick, who: e.who, x: e.x, y: e.y, r: e.amount ?? 2, seed: tick % 9973, path: [] }, face: 0, half: Math.PI, ring: false });
      }
      // Attune: a small one round the caster
      if (e.kind === 'cast' && e.who >= 0 && e.who < MAX_SEATS && w.seats.active[e.who]) {
        const sp = specOf(w, e.who);
        if (sp.shape !== 'self' || !(sp.counts[EL.arcane - 1] > 0) || sp.counts[EL.fire - 1] > 0 || sp.counts[EL.cold - 1] > 0) continue;
        const bx = w.bodies.x[e.who], by = w.bodies.y[e.who];
        if (!has(bx, by, e.who)) this.bursts.push({ rec: { tick, who: e.who, x: bx, y: by, r: 1.4, seed: tick % 9973, path: [] }, face: 0, half: Math.PI, ring: false });
      }
    }
    this.bursts = this.bursts.filter((b) => (tick - b.rec.tick) / 60 < lifeOf() + 0.1);
  }

  rewind(tick: number): void { this.rings.rewind(tick); this.bursts = this.bursts.filter((b) => b.rec.tick <= tick); }

  update(t: number, lights: SpellLights | null): void {
    const live: Wave[] = this.rings.live(t).map((rec) => ({ rec, face: 0, half: Math.PI, ring: true }));
    for (const b of this.bursts) { const a = t - b.rec.tick / 60; if (a >= 0 && a <= lifeOf()) live.push(b); }
    while (this.slots.length < live.length && this.slots.length < 8) this.slot();
    this.slots.forEach((s, i) => {
      const wv = live[i];
      if (!wv) { s.hide(); return; }
      const age = t - wv.rec.tick / 60, k = s.draw(wv, age, this.heightAt);
      if (lights && k > 0) { const [cx, cy] = wv.ring ? centerAt(wv.rec, age) : [wv.rec.x, wv.rec.y]; lights.add(cx, this.heightAt(cx, cy) + 0.6, cy, 0xe070ff, 2.5 * k, wv.rec.r + 2); }
    });
  }

  reset(): void { this.rings.reset(); this.bursts = []; for (const s of this.slots) s.hide(); }
  dispose(): void { for (const s of this.slots) s.dispose(); }
}
