/**
 * The kit art the 3D game loads: the originals, and of those only what the room's compiled scene uses
 * (kit-art-for.ts), handed to lab/kit-render.ts (useKitArt) in place of its own globs of everything. In the build,
 * vite.config.ts kitGameArt narrows the globs below to the files the shipped scenes use and drops kit-render's own, so
 * dist/ carries no file the 3D page never loads.
 */
import type { KitData, KitPiece } from '../lab/kit-render';
import { kitArtFor, type KitArt } from './kit-art-for';

const models = import.meta.glob<string>('../../../../content/generated/meshy/kit/*.glb', { eager: true, query: '?url', import: 'default' });
const textures = import.meta.glob<string>('../../../../content/generated/textures/**/*.png', { eager: true, query: '?url', import: 'default' });

/** The art's URLs, by path under content/generated/ ('meshy/kit/pier.glb', 'textures/ashlar.png'). */
export const KIT_URLS: Record<string, string> = {};
for (const [p, url] of Object.entries({ ...models, ...textures })) KIT_URLS[p.replace(/^(\.\.\/)+content\/generated\//, '')] = url;

/** What a scene loads, of the art this page has. */
export const kitArt = (data: KitData, pieces: Record<string, KitPiece>): KitArt => kitArtFor(data, pieces, (p) => !!KIT_URLS[p]);
