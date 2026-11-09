/**
 * A room's painted ground as a texture: fetches its materials (content/assets/ground/*.png, once)
 * and runs art/ground.ts over them. A room with no Ground cells keeps the old code-drawn floor.
 */
import { Texture } from 'pixi.js';
import { GROUNDS } from './grounds.gen';
import { isoCamera, paintGround, todayCamera, type GroundMap, type Material } from './ground';
import { PPU } from '../camera';
import { FLOOR } from './floor';
import * as X from './px';

/** Ground character -> its image and whether it can be mirrored at random (not if it has joints to line up). */
const MATERIALS: Readonly<Record<string, { file: string; flip: boolean }>> = {
  g: { file: 'grass', flip: true }, d: { file: 'dirt', flip: true }, s: { file: 'sand', flip: true },
  f: { file: 'flagstone', flip: false }, c: { file: 'cobble', flip: false }, m: { file: 'mud', flip: true },
  l: { file: 'leaves', flip: true }, r: { file: 'gravel', flip: true }, a: { file: 'ash', flip: true },
  p: { file: 'planks', flip: false }, h: { file: 'slabs', flip: false }, w: { file: 'water', flip: true },
};
const urls = import.meta.glob<string>('../../../../content/assets/ground/*.png', { eager: true, query: '?url', import: 'default' });
const urlOf = new Map(Object.entries(urls).map(([path, url]) => [path.split('/').pop()!.replace('.png', ''), url]));

export const hasGround = (room: string): boolean => room in GROUNDS;

const loaded = new Map<string, Promise<Material>>();
function material(ch: string): Promise<Material> {
  let p = loaded.get(ch);
  if (!p) {
    const def = MATERIALS[ch], url = def && urlOf.get(def.file);
    if (!url) return Promise.reject(new Error(`no ground image for '${ch}'`));
    p = new Promise((done, fail) => {
      const img = new Image();
      img.onload = () => {
        const { c, x } = X.canvas(img.width, img.height);
        x.drawImage(img, 0, 0);
        done({ w: c.width, h: c.height, data: x.getImageData(0, 0, c.width, c.height).data, flip: def.flip });
      };
      img.onerror = () => fail(new Error('could not load ' + url));
      img.src = url;
    });
    loaded.set(ch, p);
  }
  return p;
}

/** Paints `room`'s ground at the floor's current size (floorTexture has set FLOOR). The most common material fills unpainted cells. */
export async function groundTexture(room: string, w: number, h: number, iso = false, extent = w): Promise<Texture> {
  // under the isometric camera an unpainted room still needs a ground: the old floor is drawn for the straight-on view
  const rows = GROUNDS[room] ?? Array.from({ length: Math.round(h * 2) }, () => 'f'.repeat(Math.round(w * 2)));
  const g: GroundMap = { w, h, rows, outside: iso ? 'g' : undefined };
  const count = new Map<string, number>();
  for (const r of g.rows) for (const ch of r) if (ch !== '.') count.set(ch, (count.get(ch) ?? 0) + 1);
  const base = [...count].sort((a, b) => b[1] - a[1])[0][0];
  const chars = [...new Set([...count.keys(), ...(g.outside ? [g.outside] : [])])];
  const mats: Record<string, Material> = {};
  await Promise.all(chars.map(async (ch) => { mats[ch] = await material(ch); }));
  const { W, H, OX, OY } = FLOOR;
  const { c, x } = X.canvas(W, H);
  const img = x.createImageData(W, H);
  paintGround(img.data, W, H, OX, OY, g, mats, base, iso ? isoCamera(PPU * Math.SQRT1_2) : todayCamera, extent);
  x.putImageData(img, 0, 0);
  const t = Texture.from(c);
  t.source.scaleMode = 'nearest';
  return t;
}
