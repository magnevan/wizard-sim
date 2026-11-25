/**
 * What the Earth family's effects share: its painted sheet (Codex, 2026-11-25; prompt and original beside it in
 * content/generated/fx/, made into the game sheet by its prep.py), how big a rock is drawn and which rocks are plain.
 *
 * - `cracks`: 2 × 2 white crack stars on black (the impact's decal draws the white dark).
 *
 * The dust is not a sheet: a painted puff sheet (raw/earth-dust-1.png) was tried and read as a pile of sprites, so the
 * dust is eroded meshes (dust-mesh.ts). The sheet loads as this module loads (a top-level await, as fire-sheets.ts), so
 * a frozen shot never draws the cracks without it. Outside a browser (tests) it stays null and the cracks are drawn in code.
 */
import * as THREE from 'three';
import { COMBAT, EL, MAX_MISSILES, N_EL, PF, type World } from '@wizard-sim/sim';

const urls = import.meta.glob<string>('../../../../../content/generated/fx/earth-cracks.png', { eager: true, query: '?url', import: 'default' });

export interface EarthTex { cracks: THREE.Texture | null }

/** The sheets, once loaded (null if missing). */
export const EARTH_TEX: EarthTex = { cracks: null };

async function load(name: keyof EarthTex, srgb: boolean): Promise<void> {
  const url = Object.entries(urls).find(([p]) => p.endsWith(`/earth-${name}.png`))?.[1];
  if (!url) return;
  try {
    const t = await new THREE.TextureLoader().loadAsync(url);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    EARTH_TEX[name] = t;
  } catch { /* drawn without it */ }
}

if (typeof document !== 'undefined') await load('cracks', false);

/**
 * How big a rock is drawn (radius, u). The sim's rock is a 0.3 u circle at any size; its damage grows with its runes
 * as n^rockExp (config.ts COMBAT.rockExp), times its charge (effects.ts: half for a quick throw). The drawing takes that
 * damage as the rock's mass: radius ∝ cube root, so one rune is about the sim's circle (0.34) and five about twice it.
 */
export function rockRadius(n: number, scale = 1): number {
  const k = Math.max(0.3, Math.min(3, scale));
  return 0.34 * Math.cbrt(Math.pow(Math.max(1, Math.min(5, n)), COMBAT.rockExp) * k);
}

/** A missile's runes, 1..5 (art/vfx.ts tierOf: everything it carries). */
export function missileRunes(w: World, j: number): number {
  let s = 0;
  for (let k = 0; k < N_EL; k++) s += w.missiles.els[j * N_EL + k];
  return Math.max(1, Math.min(5, s));
}

/**
 * Whether missile j is a plain Earth rock (Earth alone: no carried element, no coat, not a heal-stone or an ice
 * shard), which earth.ts draws. A rock carrying something (a meteor, a frost comet, a charged stone) is still a stand-in.
 */
export function plainRock(w: World, j: number): boolean {
  const m = w.missiles;
  if (j < 0 || j >= MAX_MISSILES || !m.alive[j] || m.type[j] !== 1 || m.flags[j] & (PF.heal | PF.freeze | PF.coated)) return false;
  if (m.look[j] && m.look[j] !== EL.earth) return false;
  for (let e = 1; e <= N_EL; e++) if (e !== EL.earth && m.els[j * N_EL + e - 1]) return false;
  return true;
}
