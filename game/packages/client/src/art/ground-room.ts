/**
 * A room's painted ground as a texture: fetches its materials (content/assets/ground/*.png, once)
 * and runs art/ground.ts over them. A room with no Ground cells is flagstone, with grass past its edge.
 */
import { Texture } from 'pixi.js';
import { GROUNDS } from './grounds.gen';
import { calmed, groundAt, isoCamera, matchColour, paintGround, type GroundCamera, type GroundMap, type Material } from './ground';
import { loadTexture, propImage } from './assets';
import { rand, vnoise } from './util';
import { PPU } from '../camera';
import type { FloorLayout } from './floor';
import * as X from './px';

/** Ground character -> its image and whether it can be mirrored at random (not if it has joints to line up). Alternates are <file>-2.png and on. */
const MATERIALS: Readonly<Record<string, { file: string; flip: boolean; calm?: number }>> = {
  g: { file: 'grass', flip: true, calm: 0.45 }, d: { file: 'dirt', flip: true }, s: { file: 'sand', flip: true },
  f: { file: 'flagstone', flip: false }, c: { file: 'cobble', flip: false }, m: { file: 'mud', flip: true },
  l: { file: 'leaves', flip: true }, r: { file: 'gravel', flip: true }, a: { file: 'ash', flip: true },
  p: { file: 'planks', flip: false }, h: { file: 'slabs', flip: false }, w: { file: 'water', flip: true },
};
const urls = import.meta.glob<string>('../../../../content/assets/ground/*.png', { eager: true, query: '?url', import: 'default' });
const urlOf = new Map(Object.entries(urls).map(([path, url]) => [path.split('/').pop()!.replace('.png', ''), url]));

/**
 * The small things lying about on each material: registry props, chosen by region so a meadow has
 * drifts of one flower rather than an even confetti. `every`: roughly one spot in this many gets something.
 */
const SCATTER: Readonly<Record<string, { every: number; items: readonly string[] }>> = {
  g: { every: 26, items: ['white-daisy-clump', 'yellow-buttercup-clump', 'red-poppy-clump', 'clover-patch', 'short-grass-tuft', 'tall-grass-tuft', 'dry-yellow-grass-tuft', 'yellow-dandelion', 'small-violet-cluster', 'pink-clover-blossom', 'three-pebbles'] },
  d: { every: 14, items: ['single-small-pebble', 'three-pebbles', 'cracked-small-rock', 'small-pile-of-twigs'] },
  m: { every: 16, items: ['small-muddy-puddle', 'three-pebbles', 'single-small-pebble'] },
  l: { every: 6, items: ['green-fallen-leaves', 'orange-fallen-leaves', 'brown-mushroom-cluster', 'red-toadstool', 'tiny-white-mushrooms', 'twig-with-bracket-fungus', 'young-fern', 'small-pile-of-twigs', 'pine-cone', 'fallen-acorns'] },
  s: { every: 30, items: ['three-pebbles', 'single-small-pebble', 'white-bird-feather'] },
  r: { every: 12, items: ['cracked-small-rock', 'round-river-stone', 'three-pebbles'] },
  a: { every: 18, items: ['cracked-small-rock', 'small-pile-of-twigs'] },
  f: { every: 40, items: ['short-grass-tuft'] },
  c: { every: 40, items: ['short-grass-tuft'] },
};
const SPOT = 14; // art px between scatter spots

/** Stamps the scatter over a finished ground. Placement is a pure function of position. */
async function scatter(x: CanvasRenderingContext2D, g: GroundMap, W: number, H: number, OX: number, OY: number, cam: GroundCamera): Promise<void> {
  const wanted: { img: CanvasImageSource; foot: readonly [number, number]; x: number; y: number }[] = [];
  const pending: Promise<void>[] = [];
  for (let sy = 0; sy * SPOT < H; sy++) for (let sx = 0; sx * SPOT < W; sx++) {
    const px = sx * SPOT + Math.floor(rand(sx, sy, 91) * SPOT), py = sy * SPOT + Math.floor(rand(sx, sy, 92) * SPOT);
    const wx = cam.x(px - OX, py - OY), wy = cam.y(px - OX, py - OY);
    const ch = groundAt(g, wx, wy), rule = SCATTER[ch];
    if (!rule || rand(sx, sy, 93) * rule.every > 1) continue;
    // stay off the edges, where the transition is doing the work
    if (groundAt(g, wx + 0.8, wy) !== ch || groundAt(g, wx - 0.8, wy) !== ch || groundAt(g, wx, wy + 0.8) !== ch || groundAt(g, wx, wy - 0.8) !== ch) continue;
    // drifts: one region, one or two kinds, with the odd stray
    const region = vnoise(px * 0.02, py * 0.02, 94), pick = rand(sx, sy, 95) < 0.8 ? region : rand(sx, sy, 96);
    const id = rule.items[Math.min(rule.items.length - 1, Math.floor(pick * rule.items.length))];
    const im = propImage(id, 'lean');
    if (!im) continue;
    pending.push(loadTexture(im.url).then((t) => { wanted.push({ img: t.source.resource as CanvasImageSource, foot: im.foot, x: px, y: py }); }));
  }
  await Promise.all(pending);
  wanted.sort((a, b) => a.y - b.y || a.x - b.x);
  x.globalAlpha = 0.92;
  for (const s of wanted) x.drawImage(s.img, s.x - s.foot[0], s.y - s.foot[1]);
  x.globalAlpha = 1;
}

/**
 * An open area has no wall round it: the land carries on past where you can walk, so a screen near the edge shows
 * woods, not a border. It's painted into the ground, since nobody can reach it. `clear`: world-unit boxes (x0, y0,
 * x1, y1) left open, where a road or a gap in the trees runs off the map.
 */
const WOODS: Readonly<Record<string, { items: readonly string[]; clear: readonly (readonly [number, number, number, number])[] }>> = {
  battery: { items: ['pine', 'pine', 'oak', 'oak', 'oak-autumn', 'bush-round'], clear: [[-23, -99, -17, -32], [-3, -99, 3, -32], [19, -99, 25, -32], [-3, 32, 3, 99]] },
};
const WOOD_SPOT = 30; // art px between trees

async function woods(x: CanvasRenderingContext2D, room: string, w: number, h: number, W: number, H: number, OX: number, OY: number, cam: GroundCamera): Promise<void> {
  const def = WOODS[room];
  if (!def) return;
  const wanted: { img: CanvasImageSource; foot: readonly [number, number]; x: number; y: number }[] = [];
  const pending: Promise<void>[] = [];
  for (let sy = 0; sy * WOOD_SPOT < H + WOOD_SPOT * 3; sy++) for (let sx = 0; sx * WOOD_SPOT < W; sx++) {
    const px = sx * WOOD_SPOT + Math.floor(rand(sx, sy, 101) * WOOD_SPOT), py = sy * WOOD_SPOT + Math.floor(rand(sx, sy, 102) * WOOD_SPOT);
    const wx = cam.x(px - OX, py - OY), wy = cam.y(px - OX, py - OY);
    if ((Math.abs(wx) < w / 2 && Math.abs(wy) < h / 2) || def.clear.some(([a, b, c, d]) => wx > a && wx < c && wy > b && wy < d)) continue;
    const im = propImage(def.items[Math.floor(rand(sx, sy, 103) * def.items.length)], 'lean');
    if (!im) continue;
    pending.push(loadTexture(im.url).then((t) => { wanted.push({ img: t.source.resource as CanvasImageSource, foot: im.foot, x: px, y: py }); }));
  }
  await Promise.all(pending);
  wanted.sort((a, b) => a.y - b.y || a.x - b.x);
  for (const s of wanted) {
    X.shadow(x, s.x, s.y, 10, 4, 12);
    x.drawImage(s.img, s.x - s.foot[0], s.y - s.foot[1]);
  }
}

const loaded = new Map<string, Promise<Material>>();
function material(ch: string): Promise<Material> {
  let p = loaded.get(ch);
  if (!p) {
    const def = MATERIALS[ch], url = def && urlOf.get(def.file);
    if (!url) return Promise.reject(new Error(`no ground image for '${ch}'`));
    const read = (u: string): Promise<Material> => new Promise((done, fail) => {
      const img = new Image();
      img.onload = () => {
        const { c, x } = X.canvas(img.width, img.height);
        x.drawImage(img, 0, 0);
        done({ w: c.width, h: c.height, data: x.getImageData(0, 0, c.width, c.height).data, flip: def.flip });
      };
      img.onerror = () => fail(new Error('could not load ' + u));
      img.src = u;
    });
    const altUrls = [...urlOf].filter(([n]) => n.startsWith(def.file + '-')).map(([, u]) => u);
    p = Promise.all([read(url), ...altUrls.map(read)]).then(([first, ...alts]) => {
      // a surface this common has to sit quietly behind the action (the user, on the grass: too busy)
      const quiet = (m: Material) => (def.calm ? calmed(m, def.calm) : m);
      return { ...quiet(first), alts: alts.map((m) => quiet(matchColour(m, first))) };
    });
    loaded.set(ch, p);
  }
  return p;
}

const painted = new Map<string, Promise<Texture>>();
/** A room's ground at `l`'s size, painted once and shared by every view that shows it. */
export function groundTexture(room: string, w: number, h: number, l: FloorLayout): Promise<Texture> {
  const key = `${room}|${l.W}x${l.H}`;
  let t = painted.get(key);
  if (!t) { t = paint(room, w, h, l); painted.set(key, t); }
  return t;
}

/** The most common material fills unpainted cells. */
async function paint(room: string, w: number, h: number, l: FloorLayout): Promise<Texture> {
  const rows = GROUNDS[room] ?? Array.from({ length: Math.round(h * 2) }, () => 'f'.repeat(Math.round(w * 2)));
  const g: GroundMap = { w, h, rows, outside: WOODS[room] ? undefined : 'g' }; // an open area's roads and woods run on past its edge
  const count = new Map<string, number>();
  for (const r of g.rows) for (const ch of r) if (ch !== '.') count.set(ch, (count.get(ch) ?? 0) + 1);
  const base = [...count].sort((a, b) => b[1] - a[1])[0][0];
  const chars = [...new Set([...count.keys(), ...(g.outside ? [g.outside] : [])])];
  const mats: Record<string, Material> = {};
  await Promise.all(chars.map(async (ch) => { mats[ch] = await material(ch); }));
  const { W, H, OX, OY } = l;
  const { c, x } = X.canvas(W, H);
  const img = x.createImageData(W, H);
  const cam = isoCamera(PPU * Math.SQRT1_2);
  paintGround(img.data, W, H, OX, OY, g, mats, base, cam);
  x.putImageData(img, 0, 0);
  await scatter(x, g, W, H, OX, OY, cam);
  await woods(x, room, w, h, W, H, OX, OY, cam);
  const t = Texture.from(c);
  t.source.scaleMode = 'nearest';
  return t;
}
