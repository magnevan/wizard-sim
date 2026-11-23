import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { apexOf, arcPoints, edgeAt, fromSag, runOn, sagFor, sagOf } from '../src/lab/editor/curve';
import type { Scene } from '../map-editor/ops';

const H: Record<string, number> = { U: 2, P: 0, V: 4 };
const h = (g: string) => H[g];
// U (2 m) on rows 0-1, P (0 m) below: a straight edge along y = 1.5 facing south; a notch of V at x = 4..5 on row 1
const rows = ['UUUUUUU', 'UUUUVVU', 'PPPPPPP', 'PPPPPPP'];

describe('map editor curves', () => {
  it('finds the straight edge under the pointer, and its out side', () => {
    expect(edgeAt(rows, h, [1.4, 1.6])).toEqual({ horiz: true, line: 1.5, glyph: 'U', out: 'S' });
    expect(edgeAt(rows, h, [1.4, 0.4])).toBeNull();
    // flipped: the high ground below the line faces north
    expect(edgeAt(['PPPP', 'UUUU'], h, [1.5, 0.5])?.out).toBe('N');
    expect(edgeAt(['PU', 'PU'], h, [0.5, 0.5])).toEqual({ horiz: false, line: 0.5, glyph: 'U', out: 'W' });
  });

  it('checks a run cell by cell, snapping its ends to whole corners', () => {
    const e = edgeAt(rows, h, [1, 1.5])!;
    expect(runOn(rows, h, e, 0.2, 3.1)).toEqual({ ends: [[0, 1.5], [3, 1.5]], ok: true, len: 3 });
    expect(runOn(rows, h, e, 1, 5).ok).toBe(false);   // crosses V's corners
    expect(runOn(rows, h, e, 2.2, 2.4).len).toBe(1);   // never shorter than one cell
  });

  it('round-trips the bulge, and reads the scene files the same way', () => {
    const c = fromSag([[0, 1.5], [4, 1.5]], 'S', 2);
    expect(c).toMatchObject({ r: 2, centre: [2, 1.5] });
    expect(sagOf(c)).toBeCloseTo(2);
    const shallow = fromSag([[0, 1.5], [4, 1.5]], 'S', 1);
    expect(sagOf(shallow)).toBeCloseTo(1);
    expect(apexOf(shallow)).toEqual([2, 2.5]);
    const pts = arcPoints(shallow, 8);
    expect(pts[0]).toEqual([0, 1.5]);
    expect(pts[4][1]).toBeCloseTo(2.5);   // the middle of the arc bulges south
    const sc = JSON.parse(readFileSync(new URL('../../../../tools/kit/scenes/patch-b.scene.json', import.meta.url), 'utf8')) as Scene;
    const bastion = sc.objects.find((o) => o.kind === 'curve')! as unknown as Parameters<typeof sagOf>[0];
    expect(sagOf(bastion)).toBeCloseTo(2);
  });

  it('snaps the pointer to the semicircle near it, and to quarters elsewhere', () => {
    const ends: [[number, number], [number, number]] = [[0, 1.5], [4, 1.5]];
    expect(sagFor(ends, 'S', [2, 3.6])).toBe(2);
    expect(sagFor(ends, 'S', [2, 2.4])).toBe(1);
    expect(sagFor(ends, 'S', [2, 0])).toBe(0.25);
    expect(sagFor(ends, 'S', [2, 20])).toBe(4);
  });
});
