import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { dumpScene, type Scene } from '../map-editor/ops';
import type { CompileWorker, Compiled } from '../map-editor/compile-worker';
import { SceneStore } from '../map-editor/store';

const base = (): Scene => ({
  schema: 1, name: 't', G: 2,
  terraces: [{ id: 't-plaza', glyph: 'P', name: 'the plaza', h: 0, mat: 'plaza', edge: 'parapet' }, { id: 't-up', glyph: 'U', name: 'up', h: 2, mat: 'paving', edge: 'parapet' }],
  corners: ['UUUU', 'PPPP', 'PPPP'],
  objects: [],
});
const worker = { compile: async (s: Scene): Promise<Compiled> => ({ G: s.G, size: [0, 0], floors: [], instances: [], pieces: {}, errors: [], warnings: [], findings: [] }) } as unknown as CompileWorker;

let dir = '';
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });
async function open() {
  dir = mkdtempSync(join(tmpdir(), 'map-store-'));
  writeFileSync(join(dir, 't.scene.json'), dumpScene(base()));
  const events: [string, unknown][] = [];
  const s = new SceneStore('t', dir, worker, (e, d) => events.push([e, d]));
  await s.load();
  const file = () => readFileSync(join(dir, 't.scene.json'), 'utf8'), draftFile = join(dir, 't.draft.json');
  return { s, events, file, draftFile };
}
const paint = { op: 'paint', terrace: 'U', at: [[0, 2]] } as const;

describe('map editor store: draft and save', () => {
  it('edits go to the draft; the scene file changes only on save', async () => {
    const { s, file, draftFile } = await open();
    const before = file();
    await s.apply({ ops: [paint], author: 'user', label: 'paint' });
    expect(file()).toBe(before);
    expect(existsSync(draftFile)).toBe(true);
    expect(s.draft()).toMatchObject({ dirty: true, changed: { corners: 1 }, edits: [{ author: 'user', label: 'paint' }] });
    const r = await s.save();
    expect(r).toMatchObject({ saved: true, edits: 1 });
    expect(JSON.parse(file()).corners[2]).toBe('UPPP');
    expect(existsSync(draftFile)).toBe(false);
    expect(s.draft().dirty).toBe(false);
  });

  it('a restarted server picks the draft up again', async () => {
    const { s } = await open();
    await s.apply({ ops: [paint], author: 'claude', label: 'paint' });
    const again = new SceneStore('t', dir, worker, () => undefined);
    await again.load();
    expect(again.scene.corners[2]).toBe('UPPP');
    expect(again.draft()).toMatchObject({ dirty: true, edits: [{ author: 'claude' }] });
  });

  it('undoing back to the saved scene leaves nothing unsaved', async () => {
    const { s, draftFile } = await open();
    await s.apply({ ops: [paint], author: 'user' });
    await s.undo();
    expect(s.draft().dirty).toBe(false);
    expect(existsSync(draftFile)).toBe(false);
  });

  it('discard puts the saved scene back, and undo brings the draft back', async () => {
    const { s, file } = await open();
    const before = file();
    await s.apply({ ops: [paint], author: 'user' });
    expect(await s.discard()).toMatchObject({ discarded: true });
    expect(s.scene.corners[2]).toBe('PPPP');
    expect(s.draft().dirty).toBe(false);
    await s.undo();
    expect(s.scene.corners[2]).toBe('UPPP');
    expect(s.draft().dirty).toBe(true);
    expect(file()).toBe(before);
  });

  it('a scene file changed on disk is taken when clean, and kept apart from unsaved changes', async () => {
    const { s, events } = await open();
    const other = { ...base(), corners: ['UUUU', 'UPPP', 'PPPP'] };
    await s.external(dumpScene(other));
    expect(s.scene.corners[1]).toBe('UPPP');
    expect(s.draft().dirty).toBe(false);
    await s.apply({ ops: [paint], author: 'user' });
    await s.external(dumpScene({ ...other, corners: ['UUUU', 'UUPP', 'PPPP'] }));
    expect(s.scene.corners).toEqual(['UUUU', 'UPPP', 'UPPP']);   // the draft stands
    expect(s.saved.corners[1]).toBe('UUPP');
    expect(events.some(([e, d]) => e === 'map:draft' && !!(d as { notice?: string }).notice)).toBe(true);
  });
});
