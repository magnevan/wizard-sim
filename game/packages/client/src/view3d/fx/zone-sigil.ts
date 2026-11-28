/**
 * The Arcane blast's fuse (Arcane, Place: the sim's ZONE.blast, SHAPES.delayedBlast): a magenta sigil drawn on the
 * ground where it will go off, charging for the fuse: an outer ring of glyph ticks turning one way, an inner ring
 * turning the other, and the disc between them filling with light from the rim inward to the moment it goes off (then
 * the Arcane wave, fire-wave.ts in Arcane's colours, is the blast itself). The Arcane pass, 2026-11-28.
 *
 * One decal over every charging Arcane blast; its inputs are the sim's zones (the fuse's ticks left), so frozen frames
 * and rewinds draw the same.
 */
import * as THREE from 'three';
import { EL, MAX_ZONES, SHAPES, T, ZONE, type World } from '@wizard-sim/sim';
import { GroundDecal, type HeightAt } from './decal';
import type { SpellLights } from './lights';

const MAX = 8;

const SIGIL = /* glsl */ `
uniform vec4 uB[${MAX}];   // x, z (sim y), radius, charge 0..1
uniform float uN, uClock;
vec4 decal(vec3 wp) {
  vec4 o = vec4(0.0);
  for (int i = 0; i < ${MAX}; i++) {
    if (float(i) >= uN) break;
    vec4 B = uB[i];
    vec2 d = wp.xz - B.xy; float r = length(d) / B.z, th = atan(d.y, d.x), k = B.w;
    if (r > 1.15) continue;
    float aa = 0.02;
    // the outer ring and its glyph ticks, turning; the inner ring turning back
    float ring1 = smoothstep(aa, 0.0, abs(r - 0.96) - 0.015);
    float ticks = step(0.5, fract((th + uClock * 1.2) * 24.0 / 6.2831853)) * smoothstep(aa, 0.0, abs(r - 0.88) - 0.035);
    float ring2 = smoothstep(aa, 0.0, abs(r - 0.62) - 0.012);
    float glyph = step(0.72, fract((th - uClock * 1.8) * 8.0 / 6.2831853)) * smoothstep(aa, 0.0, abs(r - 0.7) - 0.05);
    // the fill: light from the rim inward as it charges
    float fill = smoothstep(1.0 - k * 1.05, 1.0 - k * 1.05 + 0.12, r) * (1.0 - smoothstep(0.98, 1.02, r));
    float lines = (ring1 + ticks * 0.8 + ring2 + glyph * 0.8) * smoothstep(0.0, 0.15, k);
    // covering magenta, as the shockwave's circle (arcane-nova.ts): light added over the pale stone washed to pink
    float cov = min(0.95, min(lines, 1.0) * 0.85 + fill * 0.25 * k);
    o.rgb += vec3(0.95, 0.06, 0.85) * (1.0 + 0.5 * k) * cov;
    o.a += cov;
  }
  return vec4(o.rgb, min(o.a, 0.9));
}`;

export class ZoneSigils {
  readonly group = new THREE.Group();
  private readonly B = Array.from({ length: MAX }, () => new THREE.Vector4());
  private readonly U = { uB: { value: this.B }, uN: { value: 0 }, uClock: { value: 0 } };
  private readonly decal: GroundDecal;

  constructor(heightAt: HeightAt) {
    this.decal = new GroundDecal({ look: SIGIL, uniforms: this.U, order: -1 }, heightAt);
    this.decal.mesh.name = 'sigil.blast';   // ?fxoff= (view3d/fx-off.ts)
    this.group.add(this.decal.mesh);
    this.group.name = 'sigil';
  }

  /** Is zone k an Arcane blast on its fuse? */
  static isArcaneBlast(w: World, k: number): boolean { return w.zones.type[k] === ZONE.blast && w.zones.look[k] === EL.arcane; }

  update(w: World, t: number, heightAt: HeightAt, lights: SpellLights | null): void {
    const z = w.zones, fuse = Math.max(1, T(SHAPES.delayedBlast));
    let n = 0, x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let k = 0; k < MAX_ZONES && n < MAX; k++) {
      if (!ZoneSigils.isArcaneBlast(w, k)) continue;
      const x = z.x[k], y = z.y[k], r = z.r[k], charge = 1 - z.timer[k] / fuse;
      this.B[n].set(x, y, r, charge);
      x0 = Math.min(x0, x - r - 0.5); x1 = Math.max(x1, x + r + 0.5); z0 = Math.min(z0, y - r - 0.5); z1 = Math.max(z1, y + r + 0.5);
      if (lights) lights.add(x, heightAt(x, y) + 0.5, y, 0xe070ff, 1.5 * charge, r + 1.5);
      n++;
    }
    this.U.uN.value = n; this.U.uClock.value = t;
    this.group.visible = n > 0;
    if (n) { this.decal.heightAt = heightAt; this.decal.cover({ x0, z0, x1, z1 }); }
  }

  dispose(): void { this.decal.dispose(); }
}
