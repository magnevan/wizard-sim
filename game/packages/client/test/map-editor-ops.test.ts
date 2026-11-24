import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyOps, changedKeys, dumpScene, OpError, revert, type Scene } from '../map-editor/ops';

const base = (): Scene => ({
  schema: 1, name: 't', G: 2,
  terraces: [{ id: 't-plaza', glyph: 'P', name: 'the plaza', h: 0, mat: 'plaza', edge: 'parapet' }, { id: 't-up', glyph: 'U', name: 'up', h: 2, mat: 'paving', edge: 'parapet' }],
  corners: ['UUUU', 'PPPP', 'PPPP'],
  objects: [{ id: 'f1', kind: 'flight', name: 'stair', head: [[1, 0.5], [3, 0.5]] }],
});

describe('map editor ops', () => {
  it('paints points and rectangles by glyph or id, and ignores corners off the map', () => {
    const { scene } = applyOps(base(), [{ op: 'paint', terrace: 't-up', at: [[0, 2], [9, 9]] }, { op: 'paint', terrace: 'U', rect: [2, 1, 3, 2] }]);
    expect(scene.corners).toEqual(['UUUU', 'PPUU', 'UPUU']);
  });

  it('refuses a bad op without changing anything', () => {
    const b = base();
    expect(() => applyOps(b, [{ op: 'paint', terrace: 'P', at: [[0, 0]] }, { op: 'remove', id: 'nope' }])).toThrow(OpError);
    expect(b.corners[0]).toBe('UUUU');
  });

  it('mints ids and glyphs that are free', () => {
    const r = applyOps(base(), [{ op: 'add', kind: 'flight', head: [[0, 0.5], [1, 0.5]] }, { op: 'add_terrace', name: 'the road', h: -0.6 }]);
    expect(r.minted).toEqual(['f2', 't-road']);
    expect(r.scene.terraces[2].glyph).toBe('A');
  });

  it('moves objects with inserted rows', () => {
    const r = applyOps(base(), [{ op: 'insert_rows', at: 0, n: 2 }]);
    expect(r.scene.corners.length).toBe(5);
    expect(r.scene.objects[0].head).toEqual([[1, 2.5], [3, 2.5]]);
    expect(r.shifts).toEqual([{ axis: 'y', at: 0, n: 2 }]);
  });

  it('undoes an older group without losing later edits elsewhere', () => {
    const s0 = base();
    const s1 = applyOps(s0, [{ op: 'paint', terrace: 'U', at: [[0, 1]] }]).scene;          // group A
    const s2 = applyOps(s1, [{ op: 'move', id: 'f1', by: [0, 1] }, { op: 'paint', terrace: 'U', at: [[3, 2]] }]).scene;   // group B
    const undoneA = revert(s2, s0, s1);
    expect(undoneA.corners).toEqual(['UUUU', 'PPPP', 'PPPU']);
    expect(undoneA.objects[0].head).toEqual([[1, 1.5], [3, 1.5]]);
    expect(changedKeys(s0, s1)).toEqual(['c:0,1']);
  });

  it('refuses to undo a resize under later edits', () => {
    const s0 = base(), s1 = applyOps(s0, [{ op: 'insert_cols', at: 4, n: 1 }]).scene;
    const s2 = applyOps(s1, [{ op: 'paint', terrace: 'U', at: [[0, 2]] }]).scene;
    expect(revert(s1, s0, s1)).toEqual(s0);
    expect(() => revert(s2, s0, s1)).toThrow(OpError);
  });

  it('takes rounds, lines and set pieces, and shifts a line with the map', () => {
    const r = applyOps(base(), [
      { op: 'add', kind: 'line', a: [0, 1.5], b: [3, 0.5] }, { op: 'add', kind: 'round', centre: [2, 2], r: 3 },
      { op: 'add', kind: 'setpiece', piece: 'setpiece.post', at: [1, 1] }, { op: 'insert_rows', at: 0, n: 1 },
    ]);
    expect(r.minted).toEqual(['l1', 'r1', 's1']);
    expect(r.scene.objects.find((o) => o.id === 'l1')).toMatchObject({ a: [0, 2.5], b: [3, 1.5] });
    expect(r.scene.objects.find((o) => o.id === 's1')).toMatchObject({ name: 'post', front: 'S' });
    expect(() => applyOps(base(), [{ op: 'add', kind: 'round', centre: [0, 0], r: 2, from: 10 }])).toThrow(OpError);
  });

  it('writes the same file layout as tools/kit/scene.py', () => {
    const file = new URL('../../../../tools/kit/scenes/patch-b.scene.json', import.meta.url);
    const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');   // git may check it out with CRLF
    expect(dumpScene(JSON.parse(text) as Scene)).toBe(text);
  });
});
