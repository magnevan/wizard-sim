/**
 * The asset registry on the client: game/content/assets/<kind>/<id>/ (meta.json and its images), so
 * far props only. The metas are bundled; the images are separate files, fetched the first time a
 * room needs them, so a player who never enters such a room never downloads them.
 *
 * A prop can have several sets (art treatments of the same thing). The sim knows none of this: it has
 * the footprint, compiled into the room, and every set shares it.
 */
import { Texture } from 'pixi.js';

export const PROP_SETS = ['lean', 'simple', 'code'] as const;
export type PropSet = (typeof PROP_SETS)[number];

export interface PropImage { file: string; /** The image pixel that stands on the prop's spot. */ foot: readonly [number, number] }
export interface PropMeta {
  id: string; name: string;
  /** A variant: the asset it was made from. A set it lacks comes from here. */
  base?: string;
  /** World units, w x h: what blocks, when the room says it blocks. */
  footprint: readonly [number, number];
  /** Lies on the floor (under everything), not stood in the depth sort. */
  flat?: boolean;
  /** Hangs this many art px above its spot (a banner on a wall). */
  lift?: number;
  sets: Record<string, PropImage>;
}

const metas = import.meta.glob<PropMeta>('../../../../content/assets/props/*/meta.json', { eager: true, import: 'default' });
const urls = import.meta.glob<string>('../../../../content/assets/props/*/*.png', { eager: true, query: '?url', import: 'default' });

const byId = new Map(Object.values(metas).map((m) => [m.id, m]));
const urlOf = new Map(Object.entries(urls).map(([path, url]) => [path.split('/').slice(-2).join('/'), url]));

export const propMeta = (id: string): PropMeta | undefined => byId.get(id);

/** What to draw for a prop in a set: its own image, its base's, or failing that any it has. */
export function propImage(id: string, set: PropSet): { url: string; foot: readonly [number, number] } | null {
  for (let m = byId.get(id); m; m = m.base && m.base !== m.id ? byId.get(m.base) : undefined) {
    const s = m.sets[set];
    if (s) return { url: urlOf.get(`${m.id}/${s.file}`)!, foot: s.foot };
  }
  const m = byId.get(id), s = m && Object.values(m.sets)[0];
  return m && s ? { url: urlOf.get(`${m.id}/${s.file}`)!, foot: s.foot } : null;
}

const textures = new Map<string, Promise<Texture>>();
/** A prop image as a texture (nearest filtered by the app's default). Fetched once. */
export function loadTexture(url: string): Promise<Texture> {
  let t = textures.get(url);
  if (!t) {
    t = new Promise((done, fail) => {
      const img = new Image();
      img.onload = () => done(Texture.from(img));
      img.onerror = () => fail(new Error('could not load ' + url));
      img.src = url;
    });
    textures.set(url, t);
  }
  return t;
}
