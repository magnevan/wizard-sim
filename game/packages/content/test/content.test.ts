// The map pipeline: the real maps pass content:check (so `npm run check` covers it), broken maps
// fail it, the rock tracer and the grid CLI round-trip, and the check's copies of sim numbers and
// the room hash agree with the sim.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BODY, CELL, CONTENT_HASH, NO_INPUT, N_ALTARS, ROOM_HASH, ROOMS, STRUCT, createTerrain, createWorld, firstCliff, isPropWall, roomHash as simRoomHash, snapshot, step } from '@wizard-sim/sim';
import * as C from '../src/index.mjs';
import { agreement } from '../src/scene.mjs';

/** A scratch copy of the maps and of the generated module, to break. */
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'wizard-maps-'));
  cpSync(join(C.CONTENT, 'maps'), join(dir, 'maps'), { recursive: true });
  const gen = join(dir, 'rooms.gen.ts');
  writeFileSync(gen, readFileSync(C.GEN_OUT, 'utf8'));
  const project = join(dir, 'maps/world.ldtk');
  const edit = (rel: string, f: (j: any) => void) => {
    const p = join(dir, 'maps', rel), j = JSON.parse(readFileSync(p, 'utf8'));
    f(j);
    writeFileSync(p, JSON.stringify(j));
  };
  return { project, gen, edit, check: () => C.runCheck({ project, genOut: gen }).errors as string[] };
}
const entitiesOf = (level: any) => level.layerInstances.find((l: any) => l.__identifier === 'Entities').entityInstances;
const terrainOf = (level: any) => level.layerInstances.find((l: any) => l.__identifier === 'Terrain');

describe('content:check', () => {
  it('passes on the maps as committed (and rooms.gen.ts is up to date)', () => {
    expect(C.runCheck().errors).toEqual([]);
  });

  it('validates against the LDtk schema', () => {
    const s = scratch();
    s.edit('world.ldtk', (p) => { delete p.bgColor; });
    s.edit('world/Sanctum.ldtkl', (l) => { l.surprise = 1; });
    const errs = s.check();
    expect(errs.some((e) => e.startsWith('world.ldtk: schema:') && e.includes('bgColor'))).toBe(true);
    expect(errs.some((e) => e.startsWith('Sanctum.ldtkl: schema:') && e.includes('surprise'))).toBe(true);
  });

  it('catches dangling references', () => {
    const s = scratch();
    s.edit('world/Arena.ldtkl', (l) => { entitiesOf(l)[0].defUid = 999; });
    s.edit('world/Sanctum.ldtkl', (l) => { terrainOf(l).intGridCsv[5] = 7; });
    const errs = s.check();
    expect(errs.some((e) => e.includes('entity definition 999'))).toBe(true);
    expect(errs.some((e) => e.includes('IntGrid values 7'))).toBe(true);
  });

  it('catches a spawn inside rock, an unreachable portal and a missing start', () => {
    const s = scratch();
    s.edit('world/Survive.ldtkl', (l) => {
      // seat 1 onto the west pillar (-5.2, 0); then wall in the first gate (-23, 0) with painted rock
      const start = entitiesOf(l).find((e: any) => e.__identifier === 'PlayerStart' && e.fieldInstances[0].__value === 1);
      start.px = [C.toPx(-5.2, l.pxWid), C.toPx(0, l.pxHei)];
      const t = terrainOf(l);
      for (let cy = 28; cy <= 40; cy++) for (let cx = 0; cx <= 6; cx++) if (cx === 6 || cy === 28 || cy === 40) t.intGridCsv[cy * t.__cWid + cx] = 1;
    });
    s.edit('world/Arena.ldtkl', (l) => {
      const ents = entitiesOf(l);
      ents.splice(ents.findIndex((e: any) => e.__identifier === 'PlayerStart' && e.fieldInstances[0].__value === 3), 1);
    });
    const errs = s.check();
    expect(errs.some((e) => e.startsWith('survive: start 1') && e.includes('from the rock wall'))).toBe(true);
    expect(errs.some((e) => e.startsWith('survive: portal 0') && e.includes("can't be reached"))).toBe(true);
    expect(errs).toContain('Arena: no PlayerStart for seat 3');
  });

  it('catches a portal moved away from its exact coordinates', () => {
    const s = scratch();
    s.edit('world/Arena.ldtkl', (l) => {
      const p = entitiesOf(l).find((e: any) => e.__identifier === 'Portal' && e.fieldInstances[0].__value !== null);
      p.px[0] += 40;
    });
    expect(s.check().some((e) => e.includes('clear them after moving it'))).toBe(true);
  });

  it('catches a stale generated module', () => {
    const s = scratch();
    s.edit('world/Sanctum.ldtkl', (l) => { entitiesOf(l).find((e: any) => e.__identifier === 'Dummy').px[0] += 20; });
    expect(s.check().some((e) => e.includes('is stale'))).toBe(true);
  });

  it("keeps the sim's numbers it copies", () => {
    expect(C.CELL).toBe(CELL);
    expect(C.SIM.wallThickness).toBe(STRUCT.wallThickness);
    expect(C.SIM.wizardRadius).toBe(BODY.wizardRadius);
    expect(C.SIM.altars).toBe(N_ALTARS);
    expect(Object.keys(ROOMS).sort()).toEqual([...C.SIM.rooms].sort());
  });
});

describe('props', () => {
  const academy = (l: any) => entitiesOf(l).find((e: any) => e.__identifier === 'Prop');

  it('a prop must name an asset that exists', () => {
    const s = scratch();
    s.edit('world/Academy.ldtkl', (l) => { academy(l).fieldInstances[0].__value = 'no-such-thing'; });
    expect(s.check().some((e) => e.includes('no prop asset "no-such-thing"'))).toBe(true);
  });

  it("a blocking prop counts as rock: a start can't stand in it", () => {
    const s = scratch();
    s.edit('world/Academy.ldtkl', (l) => {
      const p = entitiesOf(l).find((e: any) => e.__identifier === 'PlayerStart');
      const desk = entitiesOf(l).find((e: any) => e.fieldInstances[0]?.__value === 'desk');
      p.px = [...desk.px];
    });
    expect(s.check().some((e) => e.includes('start 0') && e.includes('from the rock wall'))).toBe(true);
  });

  it('a footprint becomes one wall when shallow, two side by side up to 1 deep, along its long side', () => {
    expect(C.footprintWalls(0, 0, [2.4, 0.6])).toEqual([[-0.95, 0, 0.95, 0]]);
    expect(C.footprintWalls(1, 1, [2, 1])).toEqual([[0.25, 0.75, 1.75, 0.75], [0.25, 1.25, 1.75, 1.25]]);
    expect(C.footprintWalls(0, 0, [0.6, 2])).toEqual([[0, -0.75, 0, 0.75]]);
  });

  it.each([['a box', [5, 3.5], false, 4], ['a round footprint', [5, 5], true, 12]] as const)('%s deeper than that is closed, with no room left inside', (_n, fp, round, sides) => {
    const walls = C.footprintWalls(0, 0, [...fp], round), ring = walls.slice(0, sides);
    ring.forEach((s: number[], i: number) => {
      const next = ring[(i + 1) % sides];
      expect([s[2], s[3]]).toEqual([next[0], next[1]]);
    });
    const dist = (x: number, y: number, [a, b, c, d]: number[]) => {
      const dx = c - a, dy = d - b, k = Math.max(0, Math.min(1, ((x - a) * dx + (y - b) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(x - a - k * dx, y - b - k * dy);
    };
    // every point inside is closer to a wall than a wizard can stand (0.25 + 0.45)
    for (let x = -2.2; x <= 2.2; x += 0.1) for (let y = -1.4; y <= 1.4; y += 0.1) expect(Math.min(...walls.map((s: number[]) => dist(x, y, s)))).toBeLessThan(0.7);
  });

  it("every asset's meta.json is whole, and a generated image names its raw file", () => {
    const assets = C.loadProps(), errors: string[] = [];
    C.checkAssets(assets, errors);
    expect(errors).toEqual([]);
    const m = structuredClone(assets.get('banner-red'));
    delete m.sets.lean.raw;
    const bad: string[] = [];
    C.checkAssets(new Map([...assets, ['banner-red', m]]), bad);
    expect(bad.some((e) => e.includes('must name its raw file'))).toBe(true);
  });

  it('blocking props stop a body, are terrain after the rock, and other rooms have none', () => {
    const w = createWorld(7, 1, { room: 'academy' });
    const n = ROOMS.academy.rock.length, m = ROOMS.academy.propRock.length;
    expect(m).toBeGreaterThan(0);
    expect(isPropWall(w, n - 1)).toBe(false);
    expect(isPropWall(w, n)).toBe(true);
    expect(isPropWall(w, n + m)).toBe(false);
    expect(w.terrain.n).toBe(n + m);
    expect(ROOMS.sanctum.props.length + ROOMS.arena.propRock.length + ROOMS.survive.propRock.length).toBe(0);
    const k = n, b = w.bodies;
    b.x[0] = (w.terrain.x1[k] + w.terrain.x2[k]) / 2; b.y[0] = w.terrain.y1[k] + 0.1;
    const before = b.y[0];
    step(w, [NO_INPUT, NO_INPUT, NO_INPUT, NO_INPUT]);
    expect(b.y[0] - before).toBeGreaterThan(0.3);
  });
});

describe('the compiled rooms', () => {
  it('hash the same in the build and the sim', () => {
    const { rooms } = C.compileProject(C.loadProject());
    for (const r of rooms) {
      expect(C.roomHash(r)).toBe(ROOM_HASH[r.id as keyof typeof ROOMS]);
      expect(simRoomHash(ROOMS[r.id as keyof typeof ROOMS])).toBe(C.roomHash(r));
    }
    expect(CONTENT_HASH).toBeGreaterThan(0);
  });

  it('round-trip pixel coordinates exactly', () => {
    for (const v of [-24, -23, -15.8, -2.6, -0.4, 0, 2.1, 10.5, 23.95]) expect(C.toWorldX(C.toPx(v, 960), 960)).toBe(v);
  });

  it('turn painted rock into merged outline walls the sim builds', () => {
    // a 3 x 2 block of rock in an 8 x 6 cell room (4 x 3 u)
    const rows = ['........', '..###...', '..###...', '........', '........', '........'];
    const segs = C.traceRock(rows, 4, 3);
    expect(segs).toEqual([
      [-1, -1, 0.5, -1], [-1, 0, 0.5, 0], // top and bottom
      [-1, -1, -1, 0], [0.5, -1, 0.5, 0], // left and right
    ]);
    // rock against the room's edge has no wall on the edge
    expect(C.traceRock(['##..', '##..'], 2, 1)).toEqual([[0, -0.5, 0, 0.5]]);
  });

  it("build the walls into the world (Survive's static rock is terrain, not wall slots)", () => {
    const w = createWorld(1, 1, { room: 'survive' });
    expect(w.def).toBe(ROOMS.survive);
    expect(Array.from(w.terrain.x1.slice(0, 3))).toEqual(ROOMS.survive.rock.slice(0, 3).map((s) => s[0]));
    expect(w.terrain.n).toBe(ROOMS.survive.rock.length);
    expect(Array.from(w.walls.type).every((t) => t === 0)).toBe(true);
  });
});

describe('terrain has no budget', () => {
  it('a room with several hundred rock walls compiles, passes the check, loads and collides, and its snapshot is no bigger', () => {
    const s = scratch();
    const N = 300;
    // Free Rock segments, in rows along the room's top: nowhere near the starts or the dummies.
    s.edit('world/Sanctum.ldtkl', (l) => {
      const survive = JSON.parse(readFileSync(s.project.replace('world.ldtk', 'world/Survive.ldtkl'), 'utf8'));
      const rock = entitiesOf(survive).find((e: any) => e.__identifier === 'Rock');
      const es = entitiesOf(l);
      for (let i = 0; i < N; i++) {
        const x = -11.5 + (i % 100) * 0.23, y = -7.2 - Math.floor(i / 100) * 0.2;
        es.push({ ...rock, iid: 'rock-' + i, fieldInstances: rock.fieldInstances.map((f: any) => ({ ...f, __value: { x1: x, y1: y, x2: x + 0.1, y2: y }[f.__identifier as 'x1'] })) });
      }
    });
    expect(s.check().filter((e) => !e.includes('stale'))).toEqual([]);
    const room = C.compileProject(C.loadProject(s.project)).rooms.find((r: any) => r.id === 'sanctum');
    expect(room.rock.length).toBeGreaterThanOrEqual(N);

    const plain = createWorld(1, 1), big = createWorld(1, 1);
    big.def = room; big.terrain = createTerrain(room);
    const bytes = (w: typeof plain) => snapshot(w).reduce((a, b) => a + b.byteLength, 0);
    expect(bytes(big)).toBe(bytes(plain));

    const [x1, y1, x2] = room.rock[50], b = big.bodies;
    b.x[0] = (x1 + x2) / 2; b.y[0] = y1 + 0.05;
    step(big, [NO_INPUT, NO_INPUT, NO_INPUT, NO_INPUT]);
    expect(Math.abs(b.y[0] - y1)).toBeGreaterThan(b.r[0] + STRUCT.wallThickness - 0.1); // pushed clear of the wall it stood on
  });
});

describe('height tiers', () => {
  const heightOf = (level: any) => level.layerInstances.find((l: any) => l.__identifier === 'Height');
  const stairValue = (project: any) => project.defs.layers.find((l: any) => l.identifier === 'Height').intGridValues.find((v: any) => v.identifier === 'stair').value;

  it('trace tier edges into cliffs, with gaps at stairs, none at equal heights or along rock', () => {
    // 8 x 4 cells (4 x 2 u): tier 1 on the top two rows, tier 0 below, a two-cell stair in the middle
    const terrain = ['........', '........', '........', '........'];
    const height = ['11111111', '111//111', '000//000', '00000000'];
    const { segs, tiers } = C.traceCliffs(terrain, height, [0, 3], 4, 2);
    expect(segs).toEqual([[-2, 0, -0.5, 0], [0.5, 0, 2, 0]]);
    expect(tiers).toEqual([[1, 0], [1, 0]]);
    expect(C.traceCliffs(terrain, height, [0, 0], 4, 2).segs).toEqual([]); // two tiers at the same height are one floor
    expect(C.traceCliffs(['........', '........', '####....', '........'], height, [0, 3], 4, 2).segs).toEqual([[0.5, 0, 2, 0]]); // rock has its own outline
    // a run splits where the two tiers it parts change
    // a step of up to STEP_M (0.5 m) is walked, not a cliff; tiers past 9 are letters
    expect(C.traceCliffs(['....', '....'], ['0123', '0000'], [0, 0.3, 0.8, 1.2], 2, 1).segs).toEqual([[0, 0, 0.5, 0], [0.5, 0, 1, 0]]);
    expect(C.tierOf('a')).toBe(10); expect(C.tierOf('Z')).toBe(61);
    expect(C.traceCliffs(['....', '....'], ['1122', '0000'], [0, 3, 6], 2, 1).tiers).toEqual([[1, 0], [2, 0], [2, 1]]); // and the 1|2 edge between them
  });

  it('the Terraces room: its cliffs end the rock list and stop a body; flat rooms have no height', () => {
    const def = ROOMS.terraces, hd = def.height!;
    expect(hd.metres).toEqual([0, 3, 6]);
    expect(firstCliff(def)).toBe(def.rock.length - hd.cliffs.length);
    for (const id of Object.keys(ROOMS) as (keyof typeof ROOMS)[]) expect('height' in ROOMS[id]).toBe(id === 'terraces' || id === 'court' || id === 'infirmary' || id === 'yard'); // court, infirmary, yard: written from their plans (tools/place-plans/to_ldtk.py)
    // the terrace's edge (y = -1), west of the stair: a body standing on it is pushed off, and the wall is terrain
    const k = def.rock.findIndex((s, i) => i >= firstCliff(def) && s[1] === -1 && s[3] === -1 && s[0] < 0);
    expect(hd.cliffs[k - firstCliff(def)]).toEqual([1, 0]);
    const w = createWorld(3, 1, { room: 'terraces' }), b = w.bodies;
    expect(w.terrain.n).toBe(def.rock.length);
    b.x[0] = -8; b.y[0] = -1 + 0.05;
    step(w, [NO_INPUT, NO_INPUT, NO_INPUT, NO_INPUT]);
    expect(b.y[0] + 1).toBeGreaterThan(b.r[0] + STRUCT.wallThickness - 0.1);
  });

  it("without its stair, the terrace can't be reached; a start in the void is caught", () => {
    const s = scratch();
    s.edit('world/Terraces.ldtkl', (l) => {
      const h = heightOf(l), stair = 100;
      // the wide stair's cells become tiers: the terrace (and the balcony above it) is cut off from the floor
      h.intGridCsv = h.intGridCsv.map((v: number, i: number) => (v === stair && Math.floor(i / h.__cWid) > 12 ? (Math.floor(i / h.__cWid) <= 21 ? 1 : 0) : v));
      const start = entitiesOf(l).find((e: any) => e.__identifier === 'PlayerStart' && e.fieldInstances[0].__value === 2);
      start.px = [C.toPx(-15.5, l.pxWid), C.toPx(11.5, l.pxHei)];
    });
    const errs = s.check();
    expect(errs.some((e) => e.includes('portal 0') && e.includes("can't be reached"))).toBe(true);
    expect(errs.some((e) => e.includes('portal 2') && e.includes("can't be reached"))).toBe(true);
    expect(errs.some((e) => e.includes('portal 3') && e.includes("can't be reached"))).toBe(false); // on the floor
    expect(errs.some((e) => e.includes('start 2') && e.includes('inside painted rock or void'))).toBe(true);
  });

  it('refuses a painted tier with no height, and a stair that joins nothing', () => {
    const s = scratch();
    s.edit('world/Sanctum.ldtkl', (l) => {
      const h = heightOf(l);
      h.intGridCsv[0] = 1; // a tier-1 cell in the corner, and no tierMetres
      h.intGridCsv[h.__cWid * 20 + 20] = 100; // a lone stair on tier 0
    });
    const errs = s.check();
    expect(errs.some((e) => e.includes('tier 1 is painted') && e.includes('tierMetres'))).toBe(true);
    s.edit('world/Sanctum.ldtkl', (l) => {
      heightOf(l).intGridCsv[0] = 0;
      const tm = l.fieldInstances.find((f: any) => f.__identifier === 'tierMetres');
      tm.__value = [0]; tm.realEditorValues = [{ id: 'V_Float', params: [0] }];
    });
    expect(s.check().some((e) => e.includes('the stair at cell 20,20 touches only one height'))).toBe(true);
  });

  it('the height CLI prints rows and writes them back', () => {
    const s = scratch();
    const loaded = C.loadProject(s.project), entry = C.findLevel(loaded, 'terraces');
    const lines: string[] = C.printLayer(loaded.project, entry.level, 'Height').trim().split('\n').filter((l: string) => !l.startsWith('//'));
    expect(lines.length).toBe(48);
    expect(lines[20].slice(26, 38)).toBe('11////////11');
    lines[0] = '0' + lines[0].slice(1);
    expect(C.writeLayer(loaded, entry, lines.join('\n'), 'Height')).toBe(1);
    expect(heightOf(C.findLevel(C.loadProject(s.project), 'terraces').level).intGridCsv[0]).toBe(0);
    expect(stairValue(loaded.project)).toBe(100);
    expect(() => C.writeLayer(loaded, entry, lines.join('\n').replace('0', '!'), 'Height')).toThrow(/not a height character/);
  });
});

describe('the sense lint', () => {
  // an 8 x 6 u room (16 x 12 cells), all floor at tier 0 unless a test paints it
  const room = (over: Record<string, unknown> = {}) => ({
    id: 'test', w: 8, h: 6, terrain: Array.from({ length: 12 }, () => '.'.repeat(16)), rock: [], propRock: [], markers: [], ...over,
  });
  const fill = (rows: string[], x0: number, y0: number, x1: number, y1: number, ch: string) =>
    rows.map((r, y) => (y < y0 || y > y1 ? r : r.slice(0, x0) + ch.repeat(x1 - x0 + 1) + r.slice(x1 + 1)));

  it('a door needs a clear, walkable approach with a path to it', () => {
    const door = [{ id: 'door-1', x: 0, y: 0 }];
    expect(C.senseLint(room({ markers: door }), Array(12).fill('d'.repeat(16)))).toEqual([]);
    // boxed in by rock 1 u round it: nothing clear in any direction
    const boxed = fill(fill(Array(12).fill('.'.repeat(16)), 4, 2, 11, 9, '#'), 7, 5, 8, 6, '.');
    expect(C.senseLint(room({ terrain: boxed, markers: door }), null)[0]).toMatch(/door-1 .* no clear approach/);
    // open, but all grass: no path leads to it
    expect(C.senseLint(room({ markers: door }), Array(12).fill('g'.repeat(16)))[0]).toMatch(/door-1 .*no path leads to it/);
    // a blocking prop counts as something tall in the way, all round
    const ring = [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]];
    expect(C.senseLint(room({ markers: door, propRock: ring }), null)[0]).toMatch(/no clear approach/);
  });

  it('water may meet a drop, never grass or paving at its own height', () => {
    const ground = fill(Array(12).fill('g'.repeat(16)), 0, 0, 15, 5, 'w');
    expect(C.senseLint(room(), ground)[0]).toMatch(/water meets grass directly along 16 cell edge/);
    // the same edge with the grass 3 m above the water: a cliff, which is a proper edge
    const height = { metres: [0, 3], rows: fill(Array(12).fill('0'.repeat(16)), 0, 6, 15, 11, '1'), cliffs: [] };
    expect(C.senseLint(room({ height }), ground)).toEqual([]);
  });

  it('a door opening straight onto a road wants a forecourt', () => {
    expect(C.senseLint(room({ markers: [{ id: 'door-1', x: 0, y: 0 }] }), Array(12).fill('c'.repeat(16)))[0]).toMatch(/door-1 .*opens straight onto a road/);
  });

  it('the void may not come within a screen of walkable ground', () => {
    // a 30 x 6 u room: void at the west end; ground 5 u from it warns, ground 15 u away doesn't count
    const wide = (over: Record<string, unknown>) => ({ id: 'test', w: 30, h: 6, rock: [], propRock: [], markers: [], ...over });
    const terrain = Array.from({ length: 12 }, () => '_'.repeat(4) + '.'.repeat(56));
    expect(C.senseLint(wide({ terrain }), null)[0]).toMatch(/the void is within 12 u .* of \d+ u2 of walkable ground/);
    const walled = Array.from({ length: 12 }, () => '_'.repeat(4) + '#'.repeat(26) + '.'.repeat(30)); // 13 u of rock first
    expect(C.senseLint(wide({ terrain: walled }), null)).toEqual([]);
  });

  it('a roof standing over walkable ground is never painted a floor material', () => {
    const terrain = fill(Array(12).fill('.'.repeat(16)), 0, 0, 15, 5, '#'); // a block over the north half
    const height = { metres: [0, 3], rows: fill(Array(12).fill('0'.repeat(16)), 0, 0, 15, 5, '1'), cliffs: [] };
    expect(C.senseLint(room({ terrain, height }), Array(12).fill('h'.repeat(16)))[0]).toMatch(/painted slabs, a floor material/);
    expect(C.senseLint(room({ terrain, height }), fill(Array(12).fill('h'.repeat(16)), 0, 0, 15, 5, 'a'))).toEqual([]); // ash: a roof
  });

  it('the committed maps pass it (warnings are printed by content:check, never errors)', () => {
    const { errors, warnings } = C.runCheck();
    expect(errors).toEqual([]);
    expect(Array.isArray(warnings)).toBe(true);
  });
});

describe('the grid CLI', () => {
  it('prints rows and writes them back', () => {
    const s = scratch();
    const loaded = C.loadProject(s.project), entry = C.findLevel(loaded, 'sanctum');
    const text: string = C.printGrid(loaded.project, entry.level);
    const lines = text.trim().split('\n').filter((l) => !l.startsWith('//'));
    expect(lines.length).toBe(32);
    expect(lines[0]).toBe('.'.repeat(48));
    lines[3] = '##' + lines[3].slice(2);
    expect(C.writeGrid(loaded, entry, lines.join('\n'))).toBe(2);
    const again = C.loadProject(s.project);
    expect(terrainOf(C.findLevel(again, 'sanctum').level).intGridCsv.slice(144, 147)).toEqual([1, 1, 0]);
    expect(() => C.writeGrid(again, C.findLevel(again, 'sanctum'), 'xx')).toThrow(/rows tall/);
    const view: string[] = C.printGrid(again.project, C.findLevel(again, 'survive').level, { entities: true }).split('\n').filter((l: string) => !l.startsWith('//'));
    expect(view.join('').split('').filter((c) => c === 'A').length).toBe(3);
    expect(view.join('')).toContain('+');
  });
});

describe('tags', () => {
  it('every tag the sim asks for is in content/tags.json, and the maps use only listed ones', () => {
    const tags = C.loadTags();
    const src = join(C.GAME, 'packages/sim/src');
    const asked: string[] = [], missing: string[] = [];
    for (const f of ['battery.ts', 'battery-waves.ts', 'encounter.ts', 'modes.ts']) {
      const text = readFileSync(join(src, f), 'utf8');
      for (const m of text.matchAll(/propsTagged\(w\.def, '([a-z-]+)'\)|const TOWER = '([a-z-]+)', PEDESTAL = '([a-z-]+)'|^const TOWER = '([a-z-]+)'/gm)) {
        for (const t of m.slice(1)) if (t) { asked.push(t); if (!(t in tags.props)) missing.push(`${f}: prop tag ${t}`); }
      }
      for (const m of text.matchAll(/openAtMarkers\('([a-z-]+)'\)|markersTagged\(w\.def, '([a-z-]+)'\)/g)) {
        for (const t of m.slice(1)) if (t) { asked.push(t); if (!(t in tags.markers)) missing.push(`${f}: marker tag ${t}`); }
      }
    }
    expect(asked).toEqual(expect.arrayContaining(['tower', 'circle', 'stakes', 'well']));
    expect(missing).toEqual([]);
    for (const r of Object.values(ROOMS)) for (const p of r.props) if (p.tag) expect(tags.props, `${r.id}: ${p.asset}`).toHaveProperty(p.tag);
  });

  it('a tag that isn\'t listed fails the build (a typo can\'t silently find nothing)', () => {
    const loaded = C.loadProject(), { level } = C.findLevel(loaded, 'battery');
    const { errors } = C.compileLevel(loaded.project, level, C.loadProps(), { props: { tower: '' }, markers: {} });
    expect(errors.some((e: string) => e.includes('no prop tag "circle"'))).toBe(true);
  });
});

describe('the agreement check (scene against sim)', () => {
  // a 4 x 4 u room (8 x 8 cells), all floor at 0 m, with a 1 x 1 u rock block in the middle
  const terrain = Array.from({ length: 8 }, (_, y) => Array.from({ length: 8 }, (_, x) => (x >= 3 && x <= 4 && y >= 3 && y <= 4 ? '#' : '.')).join(''));
  const room = { id: 't', w: 4, h: 4, terrain, height: null };
  const square = (x0: number, y0: number, x1: number, y1: number) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]];
  it('agrees when the scene draws the block as solid', () => {
    const scene = { regions: [{ mat: 'paving', h: 0, kind: 'flat', polys: [square(-2, -2, 2, 2)] }, { mat: 'roof', h: 3, kind: 'building', polys: [square(-0.5, -0.5, 0.5, 0.5)] }] };
    // the block's cells lie inside the paving too; the building is drawn after it, so it wins
    expect(agreement(room, scene).counts).toEqual({ invisibleWall: 0, hiddenHole: 0, height: 0 });
  });
  it('flags an invisible wall where the scene draws walkable ground over rock', () => {
    const scene = { regions: [{ mat: 'paving', h: 0, kind: 'flat', polys: [square(-2, -2, 2, 2)] }] };
    expect(agreement(room, scene).counts.invisibleWall).toBeGreaterThan(0);
  });
});

describe('rooms from kit scenes (tools/kit/room.py)', () => {
  const entry = () => C.loadSceneRooms().find((e: any) => e.doc.scene === 'court');
  it('the court is the room its scene exported, in place of its LDtk level', () => {
    const e = entry();
    expect(e, 'game/content/generated/rooms/court.room.json').toBeDefined();
    const { room, errors } = C.sceneRoom(e);
    expect(errors).toEqual([]);
    expect(ROOMS.court).toEqual(room);
    expect([ROOMS.court.w, ROOMS.court.h]).toEqual([e.doc.toScene[0] * 2, e.doc.toScene[1] * 2]);
    expect(C.emitGrounds(C.loadProject())).not.toContain('  court: [');
  });
  it('a room file whose scene has moved on is stale, and one without its four starts is refused', () => {
    const e = entry();
    expect(C.sceneRoom({ ...e, doc: { ...e.doc, sceneHash: '0000000000000000' } }).errors.join()).toMatch(/is stale/);
    expect(C.sceneRoom({ ...e, doc: { ...e.doc, room: { ...e.doc.room, starts: e.doc.room.starts.slice(1) } } }).errors.join()).toMatch(/four starts/);
  });
  // The exporter must write the same bytes on every run and machine. CI has no shapely, so this runs where Python does.
  const py = ['python', 'python3'].find((p) => spawnSync(p, ['-c', 'import shapely, numpy'], { stdio: 'ignore' }).status === 0);
  it.skipIf(!py)('the exporter writes the committed file, byte for byte, twice over', () => {
    const r = spawnSync(py!, [join(C.GAME, '..', 'tools/kit/room.py'), 'court', '--check'], { encoding: 'utf8' });
    expect(r.stderr + r.stdout).toContain('byte-identical');
    expect(r.status).toBe(0);
  }, 120_000);
});
