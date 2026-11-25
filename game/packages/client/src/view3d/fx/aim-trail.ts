/**
 * A channel's recent aim, so each particle flies along the aim it was born with: sweeping a spray bends it like a hose
 * (art/spray-jet.ts's AimTrail, for the GPU). The view records the aim from the sim every step or frame; `fill()`
 * resamples it on a fixed grid of AIM_N moments back from now (AIM_DT apart) into a uniform array the shader reads with
 * `aimAt(ago)` (AIM_GLSL). Angles are unwrapped as they're recorded, so a swing through ±180° doesn't spin.
 */
import * as THREE from 'three';

/** Samples, and seconds between them: 64 at 1/60 s reach back 1.05 s, longer than any spray particle lives. */
export const AIM_N = 64, AIM_DT = 1 / 60;

/** One aim: where the channel starts on the ground (x, z: the caster's middle), its angle (rad, from +x toward +z) and its reach (u). */
export interface AimSample { x: number; z: number; ang: number; reach: number }

/** `vec4 aimAt(float ago)`: the aim `ago` seconds before now, as (x, z, angle, reach). */
export const AIM_GLSL = /* glsl */ `
uniform vec4 uAim[${AIM_N}];
vec4 aimAt(float ago) {
  float f = clamp(ago / ${AIM_DT.toFixed(8)}, 0.0, ${(AIM_N - 1.001).toFixed(3)});
  int i = int(f);
  return mix(uAim[i], uAim[i + 1], fract(f));
}
`;

export class AimTrail {
  private ts: number[] = [];
  private a: AimSample[] = [];
  /** The uniform the shader reads (pass `{ uAim: trail.uniform }`). */
  readonly uniform = { value: Array.from({ length: AIM_N }, () => new THREE.Vector4()) };

  /** The aim at time t (seconds, the effect's clock). Time going backwards (a rewind, a restart) starts the trail over. */
  record(t: number, s: AimSample): void {
    const n = this.ts.length, last = n ? this.ts[n - 1] : -Infinity;
    if (t < last) { this.ts.length = 0; this.a.length = 0; }
    const prev = this.a[this.a.length - 1];
    let ang = s.ang;
    if (prev) while (ang - prev.ang > Math.PI) ang -= Math.PI * 2;
    if (prev) while (ang - prev.ang < -Math.PI) ang += Math.PI * 2;
    const v = { ...s, ang };
    if (t === last && this.ts.length) { this.a[this.a.length - 1] = v; return; }
    this.ts.push(t); this.a.push(v);
    let cut = 0;
    while (cut < this.ts.length - 2 && this.ts[cut + 1] < t - AIM_N * AIM_DT - 0.1) cut++;
    if (cut > 32) { this.ts.splice(0, cut); this.a.splice(0, cut); }
  }

  clear(): void { this.ts.length = 0; this.a.length = 0; }

  /** The aim at ts, between the two nearest records (held at either end). */
  at(ts: number): AimSample {
    const T = this.ts, n = T.length;
    if (!n) return { x: 0, z: 0, ang: 0, reach: 0 };
    if (ts <= T[0]) return this.a[0];
    if (ts >= T[n - 1]) return this.a[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (T[mid] <= ts) lo = mid; else hi = mid; }
    const k = (ts - T[lo]) / (T[hi] - T[lo] || 1), A = this.a[lo], B = this.a[hi];
    return { x: A.x + (B.x - A.x) * k, z: A.z + (B.z - A.z) * k, ang: A.ang + (B.ang - A.ang) * k, reach: A.reach + (B.reach - A.reach) * k };
  }

  /** Writes the grid of samples back from t into the uniform. */
  fill(t: number): void {
    const out = this.uniform.value;
    for (let j = 0; j < AIM_N; j++) { const s = this.at(t - j * AIM_DT); out[j].set(s.x, s.z, s.ang, s.reach); }
  }
}
