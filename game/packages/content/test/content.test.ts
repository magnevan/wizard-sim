// The map pipeline: the real maps pass content:check (so `npm run check` covers it), broken maps
// fail it, the rock tracer and the grid CLI round-trip, and the check's copies of sim numbers and
// the room hash agree with the sim.
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BODY, CELL, CONTENT_HASH, NO_INPUT, N_ALTARS, ROOM_HASH, ROOMS, STRUCT, createTerrain, createWorld, isPropWall, roomHash as simRoomHash, snapshot, step } from '@wizard-sim/sim';
import * as C from '../src/index.mjs';

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

  it('a footprint becomes one wall when shallow, two side by side when deep, along its long side', () => {
    expect(C.footprintWalls(0, 0, [2.4, 0.6])).toEqual([[-0.95, 0, 0.95, 0]]);
    expect(C.footprintWalls(1, 1, [2, 1])).toEqual([[0.25, 0.75, 1.75, 0.75], [0.25, 1.25, 1.75, 1.25]]);
    expect(C.footprintWalls(0, 0, [0.6, 2])).toEqual([[0, -0.75, 0, 0.75]]);
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
