// The room's static terrain: read-only data with a spatial lookup, outside the rollback state.
import { describe, expect, it } from 'vitest';
import { NO_INPUT, ROOMS, STRUCT, WALL, createTerrain, createWorld, hashWorld, isPropWall, replaceWorld, snapshot, step, terrainAlong, terrainNear, type RoomDef, type World } from '../src';
import { collideWalls, segLen } from '../src/walls';

type Seg = readonly [number, number, number, number];
const NO_INPUTS = [NO_INPUT, NO_INPUT, NO_INPUT, NO_INPUT];
/** A reproducible scatter of short and long segments, some diagonal, across a 40 x 30 room. */
function scatter(n: number, seed = 1): Seg[] {
  let s = seed >>> 0;
  const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const out: Seg[] = [];
  for (let i = 0; i < n; i++) {
    const x = (r() - 0.5) * 40, y = (r() - 0.5) * 30, l = 0.5 + r() * 2, a = r() * 6.28;
    const dx = Math.round(Math.cos(a) * l * 1000) / 1000, dy = Math.round(Math.sin(a) * l * 1000) / 1000;
    out.push([x, y, x + dx, y + dy]);
  }
  return out;
}
/** A brute-force reference: every segment within r of the point, ascending. */
const near = (segs: readonly Seg[], x: number, y: number, r: number) => segs.flatMap((s, k) => (segLen(x, y, s[0], s[1], s[2], s[3]) <= r ? [k] : []));

describe('the terrain lookup', () => {
  const segs = scatter(500), t = createTerrain({ rock: segs.slice(0, 460), propRock: segs.slice(460) });

  it('lists every segment within reach, ascending and once each, for points and lines', () => {
    let s = 77;
    const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    // Problems are collected and checked once: an expect() per segment made this test take 15-30 s.
    const bad: string[] = [];
    for (let q = 0; q < 5000; q++) {
      const x = (r() - 0.5) * 44, y = (r() - 0.5) * 34, rad = r() * 3;
      const n = terrainNear(t, x, y, rad), got = Array.from(t.out.subarray(0, n)), listed = new Set(got);
      for (let i = 1; i < n; i++) if (!(got[i - 1] < got[i])) bad.push(`near #${q}: not ascending at ${i}`); // ascending, so no repeats
      for (const k of near(segs, x, y, rad)) if (!listed.has(k)) bad.push(`near #${q}: missed segment ${k}`);
      // a line, sampled densely: every segment near a sample must be listed
      const bx = x + (r() - 0.5) * 30, by = y + (r() - 0.5) * 30, pad = 0.5, m = terrainAlong(t, x, y, bx, by, pad);
      const along = new Set(Array.from(t.out.subarray(0, m)));
      for (let i = 0; i <= 40; i++) {
        const px = x + ((bx - x) * i) / 40, py = y + ((by - y) * i) / 40;
        for (const k of near(segs, px, py, pad)) if (!along.has(k)) bad.push(`along #${q}: missed segment ${k}`);
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('answers the same however it was built', () => {
    const again = createTerrain({ rock: segs.slice(0, 460), propRock: segs.slice(460) });
    expect(Array.from(again.items)).toEqual(Array.from(t.items));
    const n = terrainNear(t, 3, 4, 2), m = terrainNear(again, 3, 4, 2);
    expect(m).toBe(n);
    expect(Array.from(again.out.subarray(0, m))).toEqual(Array.from(t.out.subarray(0, n)));
  });

  it('copes with an empty room and with queries off the grid', () => {
    const e = createTerrain({ rock: [], propRock: [] });
    expect(terrainNear(e, 0, 0, 5)).toBe(0);
    expect(terrainAlong(e, 0, 0, 9, 9, 1)).toBe(0);
    expect(terrainNear(t, 1000, 1000, 2)).toBeGreaterThanOrEqual(0);
    expect(terrainAlong(t, 1000, 1000, 1100, 1100, 1)).toBeGreaterThanOrEqual(0);
  });
});

/** A sanctum world standing on this terrain instead (same dims and buffers). */
function worldOn(rock: readonly Seg[]): World {
  const w = createWorld(1, 1), def: RoomDef = { ...w.def, rock, propRock: [] };
  w.def = def; w.terrain = createTerrain(def);
  return w;
}

describe('collision and rollback with several hundred segments', () => {
  it('pushes bodies out, and sends them round in the same order as a full scan', () => {
    const segs = scatter(600, 2).map(([a, b, c, d]) => [a * 0.3, b * 0.2, c * 0.3, d * 0.2] as const); // packed into the middle of a 24 x 16 room
    const w = worldOn(segs), b = w.bodies;
    b.x[0] = segs[7][0]; b.y[0] = segs[7][1] + 0.01;
    // Full scan, the way the walls were checked before there was a grid: terrain in order, each from the body's position then.
    const ref = { x: b.x[0], y: b.y[0] }, min = b.r[0] + STRUCT.wallThickness;
    for (const [x1, y1, x2, y2] of segs) {
      const ux = x2 - x1, uy = y2 - y1, l2 = ux * ux + uy * uy;
      const t = l2 > 1e-12 ? Math.max(0, Math.min(1, ((ref.x - x1) * ux + (ref.y - y1) * uy) / l2)) : 0;
      const cx = x1 + ux * t, cy = y1 + uy * t, d = Math.sqrt((ref.x - cx) ** 2 + (ref.y - cy) ** 2);
      if (d >= min) continue;
      let nx = ref.x - cx, ny = ref.y - cy;
      const nl = Math.sqrt(nx * nx + ny * ny);
      if (nl < 1e-9) { nx = -uy; ny = ux; }
      const l = Math.sqrt(nx * nx + ny * ny) || 1;
      ref.x += (nx / l) * (min - d); ref.y += (ny / l) * (min - d);
    }
    collideWalls(w);
    expect(b.x[0]).toBe(ref.x);
    expect(b.y[0]).toBe(ref.y);
  });

  it('keeps a snapshot, and the hash, independent of how much terrain the room has', () => {
    const none = worldOn([]), heaps = worldOn(scatter(600, 3).map(([a, b, c, d]) => [a, b - 100, c, d - 100] as const)); // well off the map, so it plays the same
    const bytes = (w: World) => snapshot(w).reduce((a, s) => a + s.byteLength, 0);
    expect(bytes(heaps)).toBe(bytes(none));
    for (let t = 0; t < 30; t++) { step(none, NO_INPUTS); step(heaps, NO_INPUTS); }
    expect(hashWorld(heaps)).toBe(hashWorld(none));
    expect(heaps.terrain.n).toBe(600);
  });

  it('switches rooms in place with the room\'s terrain, not the last one', () => {
    const w = createWorld(1, 1, { room: 'academy' }), fresh = createWorld(1, 1, { room: 'sanctum' });
    expect(w.terrain.n).toBeGreaterThan(0);
    replaceWorld(w, fresh);
    expect(w.def).toBe(fresh.def);
    expect(w.terrain).toBe(fresh.terrain);
    expect(w.terrain.n).toBe(0);
  });

  it('gives the players all their wall slots however much rock the room has', () => {
    const w = createWorld(1, 4, { room: 'survive' });
    expect(w.terrain.n).toBe(ROOMS.survive.rock.length);
    for (let k = 0; k < w.walls.type.length; k++) { w.walls.type[k] = WALL.barrier; w.walls.owner[k] = 0; }
    expect(w.walls.type.length).toBeGreaterThanOrEqual(160);
    expect(isPropWall(w, 0)).toBe(false);
  });
});
