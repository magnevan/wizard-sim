/**
 * What the effects read from the sim, in three's space. The sim's ground point (x, y) is three's (x, z), height is y
 * (lab/kit-render.ts's convention, which the kit scene and the sim share once the scene feeds the sim).
 *
 * - `sprays()`: every channelling spray, with the sim's own shape (effects.ts channelTick: range and half-angle both grow
 *   per extra rune of its size; the channel's far end, cut short by a wall).
 * - `SurfGrid`: the sim's floor grid (w.surf) as textures: the whole grid for decals, and a list of the burning cells
 *   for the flames standing on them.
 */
import * as THREE from 'three';
import { CELL, EL, MAX_SEATS, PHASE, SURF, specOf, type World } from '@wizard-sim/sim';
import type { HeightAt } from './decal';import { sprayDrop } from '../../spray-drop';


/** Ticks a floor takes to fade at the end of its life (art/vfx.ts FLOOR_FADE: the last second). */
export const FLOOR_FADE = 60;

export type SprayKind = 'fire' | 'water' | 'cold' | 'scald';

export interface SprayIn {
  seat: number; kind: SprayKind;
  /** Seconds the channel has run. */
  age: number;
  /** Runes setting its size, 1..5. */
  n: number;
  /** The sim's raindrop (spray-drop.ts): its edges' half-angle (rad), range and bulb radius (u); reach: to where it
   * stops (a wall cuts it short). */
  half: number; range: number; rb: number; reach: number;
  /** The caster's middle (three's x, z) and the aim's angle (rad, from +x toward +z). */
  x: number; z: number; ang: number;
}

/** Every seat's spray in its channel phase this tick. */
export function sprays(w: World): SprayIn[] {
  const s = w.seats, b = w.bodies, out: SprayIn[] = [];
  for (let i = 0; i < MAX_SEATS; i++) {
    if (!s.active[i] || s.phase[i] !== PHASE.channel) continue;
    const spec = specOf(w, i);
    if (spec.shape !== 'spray' || spec.heal) continue;
    const look = spec.look || spec.form;
    const kind: SprayKind = spec.scald ? 'scald' : look === EL.fire ? 'fire' : look === EL.cold || look === EL.ice ? 'cold' : 'water';
    const n = Math.max(1, Math.min(5, spec.sizeN || 1));
    const x = b.x[i], y = b.y[i], ex = s.chanEndX[i], ey = s.chanEndY[i];
    out.push({
      seat: i, kind, age: s.chanTicks[i] / 60, n,
      ...sprayDrop(n),
      reach: Math.hypot(ex - x, ey - y), x, z: y, ang: Math.atan2(s.aimY[i], s.aimX[i]),
    });
  }
  return out;
}

/** Cells the burning-cell list holds at most (a 64 × 64 texture): about four five-rune Fire patches. */
export const MAX_BURNING = 4096;

export class SurfGrid {
  /** The whole grid, one texel a cell, linear filtered: r fire, g its life left (0..1 over its last second), b its heat (Fire runes / 5). */
  grid: THREE.DataTexture | null = null;
  /** The burning cells, packed from texel 0: (cell index, life 0..1, heat 0..1, floor height). */
  readonly burning = new THREE.DataTexture(new Float32Array(MAX_BURNING * 4), 64, 64, THREE.RGBAFormat, THREE.FloatType);
  /** How many burning cells, and the box round them (three's x, z) or null. */
  count = 0;
  box: { x0: number; z0: number; x1: number; z1: number } | null = null;
  /** The grid's shape: x, z of its corner, cell size, cells across and down. */
  readonly dims = new THREE.Vector4();
  readonly gridSize = new THREE.Vector2();
  private last = new Uint8Array(0);

  constructor(public heightAt: HeightAt) {}

  /** Reads w.surf; uploads only what changed. */
  update(w: World): void {
    const s = w.surf, d = w.dims, n = s.kind.length;
    if (!this.grid || this.grid.image.width !== d.gw || this.grid.image.height !== d.gh) {
      this.grid?.dispose();
      this.grid = new THREE.DataTexture(new Uint8Array(d.gw * d.gh * 4), d.gw, d.gh, THREE.RGBAFormat);
      this.grid.magFilter = this.grid.minFilter = THREE.LinearFilter;
      this.last = new Uint8Array(n * 3).fill(255);
    }
    this.dims.set(-d.w / 2, -d.h / 2, CELL, 0); this.gridSize.set(d.gw, d.gh);
    const px = this.grid.image.data as Uint8Array, L = this.burning.image.data as Float32Array;
    let changed = false, m = 0, x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let c = 0; c < n; c++) {
      const fire = s.kind[c] === SURF.fire, life = fire ? Math.min(1, s.life[c] / FLOOR_FADE) : 0, heat = fire ? Math.min(1, s.heat[c] / 5) : 0;
      const r = fire ? 255 : 0, g = Math.round(life * 255), b = Math.round(heat * 255);
      if (this.last[c * 3] !== r || this.last[c * 3 + 1] !== g || this.last[c * 3 + 2] !== b) {
        this.last[c * 3] = r; this.last[c * 3 + 1] = g; this.last[c * 3 + 2] = b;
        px[c * 4] = r; px[c * 4 + 1] = g; px[c * 4 + 2] = b; px[c * 4 + 3] = 255;
        changed = true;
      }
      if (!fire || m >= MAX_BURNING) continue;
      const x = -d.w / 2 + ((c % d.gw) + 0.5) * CELL, z = -d.h / 2 + (Math.floor(c / d.gw) + 0.5) * CELL;
      L[m * 4] = c; L[m * 4 + 1] = life; L[m * 4 + 2] = heat; L[m * 4 + 3] = this.heightAt(x, z);
      m++;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    if (changed) this.grid.needsUpdate = true;
    if (m || this.count) this.burning.needsUpdate = true;
    this.count = m;
    this.box = m ? { x0: x0 - 1.5, z0: z0 - 1.5, x1: x1 + 1.5, z1: z1 + 1.5 } : null;
  }
}

/** GLSL for a burning cell's middle, from its index: `vec3 cellAt(float c, float groundY)` (needs uSurfDims, uSurfSize). */
export const CELL_GLSL = /* glsl */ `
uniform vec4 uSurfDims; uniform vec2 uSurfSize;
vec3 cellAt(float c, float gy) {
  float cx = mod(c, uSurfSize.x), cz = floor(c / uSurfSize.x);
  return vec3(uSurfDims.x + (cx + 0.5) * uSurfDims.z, gy, uSurfDims.y + (cz + 0.5) * uSurfDims.z);
}
// the grid at a ground point, linear filtered: (fire, life, heat, 1)
uniform sampler2D uSurf;
vec4 surfAt(vec2 xz) { return texture(uSurf, (xz - uSurfDims.xy) / (uSurfDims.z * uSurfSize)); }
`;
