/**
 * Which of the kit's art a compiled scene draws with, worked out from its instances and floors by the same choices
 * lab/kit-render.ts makes: the models and tiling textures loadKitArt loads up front (by name), and the pictures it
 * fetches when a piece asks (a decal, a banner's emblem, a vine), by path under content/generated/. No globs here, so
 * the build (vite.config.ts kitGameArt) can run it too and ship only these files.
 *
 * It may name a little more than is drawn (harmless: a few more kB); a name it misses would draw as a placeholder,
 * which ?kitall=1 (every original) shows up by comparison (scripts/perf3d.mjs counts both).
 */
import type { KitData, KitPiece } from '../lab/kit-render';

export interface KitArt { models: string[]; textures: string[]; files: string[] }

/** `has(path)`: whether that file exists under content/generated/ (e.g. 'textures/ashlar.png'). */
export function kitArtFor(data: KitData, pieces: Record<string, KitPiece>, has: (path: string) => boolean): KitArt {
  const models = new Set<string>(), textures = new Set<string>(), files = new Set<string>();
  const tex = (n: string) => has(`textures/${n}.png`);
  // textures kit-render dresses walls, kerbs, treads, floors' rock sides, quays and soil with
  for (const t of ['ashlar', 'smooth-stone', 'tread', 'kerb', 'rock', 'deck', 'dirt']) textures.add(t);
  for (const f of data.floors) textures.add(f.mat);
  if (data.floors.some((f) => f.mat === 'weathered')) textures.add('lawn');   // weathered paving frays out into the lawn's texture (kit-stones.ts)
  for (const it of data.instances) {
    const [cls, kind] = it.p.split('.');
    const k = pieces[it.p] as (KitPiece & { texture?: string; sheet?: string; channels?: { texture?: string } }) | undefined;
    if (k?.class === 'inlay') { textures.add(k.channels?.texture ?? 'magic-flow'); textures.add('plaza'); }
    if (k?.texture) files.add(has(k.texture) ? k.texture : k.texture.replace(/^textures\/([^/]+)$/, 'textures/src/tex-$1'));   // a decal (or its stand-in picture) or a vine strip
    if (k?.sheet) files.add(k.sheet);                                                                                         // a grown vine's stamps
    if (kind) models.add(kind);
    for (const part of Object.values(it.parts ?? {})) models.add(String(part));
    if (kind === 'banner') { models.add(String(it.parts?.cloth ?? 'banner-cloth')); files.add(`textures/banner-${it.parts?.emblem ?? ''}.png`); }
    if (cls === 'joint') models.add(kind === 'newel' ? 'pier' : kind);
    if (cls === 'cliff') models.add('cliff-run');
    if (cls === 'glyph') { textures.add('glyph-runes'); textures.add('glyph-medallion'); }   // kit-glyph.ts
    if (cls === 'pipe') for (const t of ['brass', 'pipe-band', 'pipe-collar', 'smooth-stone']) textures.add(t);   // kit-pipe.ts
    if (cls === 'edge' || cls === 'sweep' || cls === 'connector') {
      if (kind === 'parapet' || cls === 'connector') { models.add('balustrade'); models.add('pier'); }
      if (it.v === 'niche') models.add('niche');
      // a made piece stands in only where its texture is missing (kit-render: retain courses under ashlar, treads, kerbs)
      if (!tex('ashlar')) { models.add('retain-top'); models.add('retain-course'); }
      if (!tex('tread') && !tex('smooth-stone')) { models.add('tread'); models.add('kerb'); }
    }
  }
  return {
    models: [...models].filter((n) => has(`meshy/kit/${n}.glb`)).sort(),
    textures: [...textures].filter(tex).sort(),
    files: [...files].filter(has).sort(),
  };
}

/** Every path under content/generated/ the scene's art comes from (what a build ships). */
export const kitArtPaths = (a: KitArt): string[] => [...a.models.map((n) => `meshy/kit/${n}.glb`), ...a.textures.map((n) => `textures/${n}.png`), ...a.files];
