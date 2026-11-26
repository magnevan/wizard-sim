/**
 * A cast's windup, drawn (the user, 2026-11-26: "I still see a delay when casting... a 20 frame delay before a spell
 * effect comes"; asked for a shorter windup and a tell both). From the moment a cast is released until it goes off (the
 * sim's PHASE.windup: RHYTHM.windup plus windupPerRune a rune), motes of the spell's element are drawn in to the
 * caster's hand, curling, and a glow gathers there, brightest just as the spell goes off: the press is answered at once,
 * and a bigger spell visibly gathers longer. Every element and cast; colours from the stand-ins' palettes.
 *
 * Stateless: each frame is a function of the seat's windup timer (and the sub-tick alpha), so rollback draws it the same.
 */
import * as THREE from 'three';
import { EL, MAX_SEATS, PHASE, RHYTHM, T, hasteOf, specOf, type World } from '@wizard-sim/sim';
import { ParticleBatch } from './particles';
import { palOf } from './standins';

/** Where the hand is: ahead of the body and up (the spray's nozzle, fire.ts NOZZLE). */
const HAND = { forward: 0.5, height: 1.3 };
/** Motes drawn in a windup. */
const MOTES = 40;

const MOTION = /* glsl */ `
uniform vec3 uHand;
uniform float uP;
Particle emitParticle(float k, float back) {
  float p = clamp(uP, 0.0, 1.0);
  Particle o = P0();
  // the glow gathering at the hand
  if (k < 0.5) {
    o.alive = true; o.pos = uHand; o.size = 0.22 + 0.6 * p * p;
    o.col = vec4(p, 1.0, 0.0, 1.0);
    return o;
  }
  // a mote: setting off at its own moment from a shell round the hand, drawn in on a curl, gone as it arrives
  float s = rnd(k, 1.0) * 0.45, q = clamp((p - s) / (1.0 - s), 0.0, 1.0);
  if (q <= 0.0 || q >= 0.98) return o;
  vec3 dir = normalize(vec3(rnd(k, 2.0) - 0.5, (rnd(k, 3.0) - 0.35) * 0.9, rnd(k, 4.0) - 0.5));
  float ease = q * q * (3.0 - 2.0 * q), R = (0.6 + 0.55 * rnd(k, 5.0)) * (1.0 - ease);
  float a = (rnd(k, 6.0) - 0.5) * 2.4 * ease, ca = cos(a), sa = sin(a);
  dir.xz = vec2(ca * dir.x - sa * dir.z, sa * dir.x + ca * dir.z);
  o.alive = true;
  o.pos = uHand + dir * R;
  o.size = (0.08 + 0.06 * rnd(k, 7.0)) * (0.7 + 0.5 * q);
  o.stretch = 0.04;
  o.col = vec4(p, 0.0, q, smoothstep(0.0, 0.15, q));
  return o;
}`;

const LOOK = /* glsl */ `
uniform vec3 uLight, uMid;
vec4 look(vec2 uv, vec4 col, vec4 data) {
  float r2 = dot(uv, uv);
  if (col.y > 0.5) {
    // the glow: a soft halo in the element's mid colour round a hot core in its light one
    // a covering core in the element's own colour (light added over pale stone only washes to cream), a soft halo round it
    float g = exp(-r2 * 2.5), c = exp(-r2 * 9.0), k = 0.4 + 0.9 * col.x;
    return vec4((uMid * 1.6 * c + uLight * 0.9 * c * c + uMid * g * 0.45) * k, c * 0.85 * k);
  }
  float core = exp(-r2 * 7.0), glow = exp(-r2 * 2.0);
  return vec4(uMid * 1.7 * core + uLight * core * core + uMid * glow * 0.35, core * 0.85) * col.w;
}`;

/** Every seat's windup tell. Add `.group` to the effects scene; call `update` each frame. */
export class WindupTells {
  readonly group = new THREE.Group();
  private batches: ParticleBatch[] = [];

  constructor() {
    for (let i = 0; i < MAX_SEATS; i++) {
      const b = new ParticleBatch({
        motion: MOTION, look: LOOK, cap: MOTES + 1, order: 5, soft: 0.2,
        uniforms: { uHand: { value: new THREE.Vector3() }, uP: { value: 0 }, uLight: { value: new THREE.Vector3(1, 1, 1) }, uMid: { value: new THREE.Vector3(1, 1, 1) } },
      });
      b.u.uSeed.value = 31 + i * 7;
      b.count = MOTES + 1;
      b.mesh.visible = false;
      this.batches.push(b); this.group.add(b.mesh);
    }
  }

  /**
   * Draw each seat winding up: `alpha` is how far into the next tick this frame is (0..1), `bodyAt` a body's drawn spot
   * (sim x, y), `heightAt` the floor's height there.
   */
  update(w: World, alpha: number, bodyAt: (i: number) => [number, number], heightAt: (x: number, y: number) => number): void {
    const s = w.seats;
    for (let i = 0; i < MAX_SEATS; i++) {
      const b = this.batches[i];
      if (!s.active[i] || s.phase[i] !== PHASE.windup) { b.mesh.visible = false; continue; }
      let spec;
      try { spec = specOf(w, i); } catch { b.mesh.visible = false; continue; }
      if (spec.shape === 'blink') { b.mesh.visible = false; continue; }
      // the windup's length as the sim set it (cast.ts startCast), and how far through it this frame is
      const total = Math.max(1, Math.round(T(RHYTHM.windup + RHYTHM.windupPerRune * s.castLen[i]) / hasteOf(w, i)));
      const p = Math.min(1, (total - s.timer[i] + alpha) / (total + 1));
      const [x, y] = bodyAt(i), f = w.bodies.face[i] * Math.PI * 2;
      (b.u.uHand.value as THREE.Vector3).set(x + Math.cos(f) * HAND.forward, heightAt(x, y) + HAND.height, y + Math.sin(f) * HAND.forward);
      b.u.uP.value = p;
      const pal = palOf(spec.heal ? EL.life : spec.look || spec.form);
      (b.u.uLight.value as THREE.Vector3).set(...pal.light);
      (b.u.uMid.value as THREE.Vector3).set(...pal.mid);
      b.mesh.visible = true;
    }
  }

  dispose(): void { for (const b of this.batches) b.dispose(); }
}
