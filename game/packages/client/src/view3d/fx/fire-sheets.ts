/**
 * Fire's painted sheets (Codex, the toon-volume round of 2026-11-25; prompts and originals beside them in
 * content/generated/fx/, made into game sheets by its prep.py):
 *
 * - `smoke`: 4 × 4 pale smoke puffs (a shape and its shading; the shader tints them dark).
 * - `cracks`: a tileable charred bed with glowing cracks, under the floor's flames.
 * - `licks`: 4 × 4 long flame tongues, base down: the spray's fast tongues (the study's "many small, fast elements").
 * - `rolls`: 4 × 4 painted rolling flame masses: the spray's puffs since round 8 (the user: "flames have no texture").
 * - `flow`: a tileable texture of flame tongues streaming upward, scrolled through the body mesh (fire-body.ts).
 *
 * The spray's body and the floor's flames are meshes now (fire-body.ts, fire-floor.ts), so of the flame sheets the sprite
 * builds drew from, fire-rolls, fire-wisps and fire-carpet stay on disk unused.
 *
 * They load as this module loads (a top-level await), so anything that imports the fire has them before its first
 * frame: a frozen shot never catches a flame without its picture. Outside a browser (tests) they stay null.
 */
import * as THREE from 'three';

const urls = import.meta.glob<string>('../../../../../content/generated/fx/fire-{smoke,cracks,licks,flow,rolls}.png', { eager: true, query: '?url', import: 'default' });

export interface FireTex { smoke: THREE.Texture | null; cracks: THREE.Texture | null; licks: THREE.Texture | null; flow: THREE.Texture | null; rolls: THREE.Texture | null }

/** The sheets, once loaded (null if missing). */
export const FIRE_TEX: FireTex = { smoke: null, cracks: null, licks: null, flow: null, rolls: null };

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

if (typeof document !== 'undefined') await Promise.all([load('smoke'), load('cracks', true), load('licks'), load('flow', true), load('rolls')]);

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
