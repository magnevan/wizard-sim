/**
 * Fire's painted sheets (Codex, the toon-volume round of 2026-11-25; prompts and originals beside them in
 * content/generated/fx/, made into game sheets by its prep.py):
 *
 * - `rolls`: 4 × 4 rolling flame masses, the spray's body.
 * - `wisps`: 4 × 4 flame tongues (look B's, from the spike), the spray's edge licks.
 * - `smoke`: 4 × 4 pale smoke puffs (a shape and its shading; the shader tints them dark).
 * - `carpet`: 4 × 4 low clusters of short flames, each on the bottom of a 2:1 cell, the burning floor.
 * - `cracks`: a tileable charred bed with glowing cracks, under the floor's flames.
 *
 * They load as this module loads (a top-level await), so anything that imports the fire has them before its first
 * frame: a frozen shot never catches a flame without its picture. Outside a browser (tests) they stay null.
 */
import * as THREE from 'three';

const urls = import.meta.glob<string>('../../../../../content/generated/fx/fire-{rolls,smoke,carpet,cracks,wisps}.png', { eager: true, query: '?url', import: 'default' });

export interface FireTex { rolls: THREE.Texture | null; wisps: THREE.Texture | null; smoke: THREE.Texture | null; carpet: THREE.Texture | null; cracks: THREE.Texture | null }

/** The sheets, once loaded (null if missing). */
export const FIRE_TEX: FireTex = { rolls: null, wisps: null, smoke: null, carpet: null, cracks: null };

async function load(name: keyof FireTex, tile = false): Promise<void> {
  const url = Object.entries(urls).find(([p]) => p.endsWith(`/fire-${name}.png`))?.[1];
  if (!url) return;
  try {
    const t = await new THREE.TextureLoader().loadAsync(url);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (tile) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    FIRE_TEX[name] = t;
  } catch { /* drawn without it */ }
}

if (typeof document !== 'undefined') await Promise.all([load('rolls'), load('wisps'), load('smoke'), load('carpet'), load('cracks', true)]);

/**
 * GLSL: one cell of a sheet of `cols` × `rows` cells, `q` 0..1 across it (y up), picked by `pick` (0..1) and mirrored
 * when `flip` > 0.5.
 */
export const SHEET_GLSL = /* glsl */ `
vec3 sheetCell(sampler2D s, vec2 q, float pick, float flip, float cols, float rows) {
  float f = floor(pick * cols * rows), fx = mod(f, cols), fy = floor(f / cols);
  if (flip > 0.5) q.x = 1.0 - q.x;
  q = clamp(q, 0.004, 0.996);
  return texture(s, vec2((fx + q.x) / cols, 1.0 - (fy + 1.0 - q.y) / rows)).rgb;
}
`;
