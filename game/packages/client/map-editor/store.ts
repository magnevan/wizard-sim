/**
 * One scene as the map editor's server holds it: the scene, its revision, the undo history and the pins, with the
 * files beside it in tools/kit/scenes/ (<name>.scene.json, .draft.json, .history.jsonl, .pins.json). Every change goes
 * through here, one at a time: it is applied, checked for conflicts, written, compiled and broadcast to the open pages.
 * Edits (the user's and Claude's) go to the draft (<name>.draft.json, not in git); the scene file changes only on
 * save(). discard() puts the saved scene back as one undoable edit.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyOps, changedKeys, dumpScene, OpError, revert, shiftPoint, type Op, type Scene } from './ops';
import type { CompileWorker, Compiled, Finding } from './compile-worker';

export type Group = { group: number; author: string; label: string; rev: number; time: string; before: Scene; after: Scene; keys: string[] };
/** A pin is on the map (x, y in corners) or on a concept image (ref: which, and u, v from its top left, 0 to 1). */
export type Pin = {
  id: string; note: string; author: string; rev: number; status: 'open' | 'resolved'; seen: boolean; outcome?: string; time: string;
  anchor: { x?: number; y?: number; h?: number; obj?: string; inst?: { p: string; e?: [number, number] }; cam?: number[]; ref?: { id: string; u: number; v: number } };
  thread: { author: string; text: string; time: string }[];
};
/** A concept image pinned to the scene: its file is tools/kit/scenes/refs/<scene>/<file>. */
export type Ref = { id: string; title: string; file: string; time: string };
const IMAGE: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
export const imageType = (file: string) => IMAGE[file.split('.').pop()!.toLowerCase()];
export type Broadcast = (event: string, data: unknown) => void;
/** One edit made since the last save, for the page's list of unsaved changes. */
export type Edit = { author: string; label: string; time: string };
/** How the live scene differs from the saved file: the changed keys (c:x,y corners, o:id objects, t:id terraces, size, meta) and the edits made since. */
export type Draft = { dirty: boolean; keys: string[]; changed: { corners: number; ids: string[]; resized: boolean }; edits: Edit[]; savedAt: string };

export class HttpError extends Error { constructor(public status: number, msg: string, public extra: Record<string, unknown> = {}) { super(msg); } }

const HISTORY_MAX = 300;
const hash = (s: string) => createHash('sha1').update(s).digest('hex');
const fkey = (f: Finding) => `${f.code}|${f.msg}`;
const changedSummary = (keys: string[]) => ({ corners: keys.filter((k) => k.startsWith('c:')).length, ids: keys.filter((k) => k[1] === ':' && k[0] !== 'c').map((k) => k.slice(2)), resized: keys.includes('size') });

function atomicWrite(file: string, text: string) {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

export class SceneStore {
  scene!: Scene;
  /** The scene file as last saved (or read): the draft is compared with it. */
  saved!: Scene;
  savedAt = '';
  private sinceSave: Edit[] = [];
  rev = 0;
  compiled: Compiled | null = null;
  history: Group[] = [];
  redoStack: Group[] = [];
  pins: Pin[] = [];
  refs: Ref[] = [];
  lastWritten = '';
  private nextGroup = 1;
  private nextPin = 1;
  private nextRef = 1;
  private queue: Promise<unknown> = Promise.resolve();

  /** afterCompile: told of each good compile (the stone layer lays the scene's road and paving from it) */
  constructor(public name: string, private dir: string, private worker: CompileWorker, private broadcast: Broadcast, private afterCompile?: (name: string, c: Compiled) => void) {}

  get file() { return join(this.dir, `${this.name}.scene.json`); }
  private get draftFile() { return join(this.dir, `${this.name}.draft.json`); }
  private get historyFile() { return join(this.dir, `${this.name}.history.jsonl`); }
  private get pinsFile() { return join(this.dir, `${this.name}.pins.json`); }
  private get refsFile() { return join(this.dir, `${this.name}.refs.json`); }
  get refsDir() { return join(this.dir, 'refs', this.name); }

  /** Run changes one at a time, in order. */
  private serial<T>(f: () => Promise<T>): Promise<T> {
    const p = this.queue.then(f, f);
    this.queue = p.catch(() => undefined);
    return p;
  }

  async load() {
    const text = readFileSync(this.file, 'utf8');
    this.saved = this.scene = JSON.parse(text) as Scene;
    this.lastWritten = hash(text);
    this.savedAt = statSync(this.file).mtime.toISOString();
    if (existsSync(this.draftFile)) {   // unsaved changes from before the server stopped
      try { const d = JSON.parse(readFileSync(this.draftFile, 'utf8')) as { edits?: Edit[]; scene: Scene }; this.scene = d.scene; this.sinceSave = d.edits ?? []; }
      catch { /* a broken draft is ignored: the saved file stands */ }
    }
    if (existsSync(this.historyFile)) {
      this.history = readFileSync(this.historyFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Group).slice(-HISTORY_MAX);
      const last = this.history[this.history.length - 1];
      if (last) { this.rev = last.rev; this.nextGroup = last.group + 1; }
    }
    if (existsSync(this.pinsFile)) {
      const p = JSON.parse(readFileSync(this.pinsFile, 'utf8')) as { next: number; pins: Pin[] };
      this.pins = p.pins; this.nextPin = p.next;
    }
    if (existsSync(this.refsFile)) {
      const r = JSON.parse(readFileSync(this.refsFile, 'utf8')) as { next: number; refs: Ref[] };
      this.refs = r.refs; this.nextRef = r.next;
    }
    // edited while the server was down: one external revision
    const last = this.history[this.history.length - 1];
    if (last && changedKeys(last.after, this.scene).length) this.record(last.after, this.scene, 'external', 'edited outside the editor');
    await this.recompile();
  }

  private record(before: Scene, after: Scene, author: string, label: string): Group {
    const g: Group = { group: this.nextGroup++, author, label, rev: ++this.rev, time: new Date().toISOString(), before, after, keys: changedKeys(before, after) };
    this.history.push(g);
    if (this.history.length > HISTORY_MAX) { this.history = this.history.slice(-HISTORY_MAX); this.saveHistory(); }
    else writeFileSync(this.historyFile, `${JSON.stringify(g)}\n`, { flag: 'a' });
    return g;
  }

  private saveHistory() { writeFileSync(this.historyFile, this.history.map((g) => JSON.stringify(g)).join('\n') + (this.history.length ? '\n' : '')); }
  private savePins() { atomicWrite(this.pinsFile, `${JSON.stringify({ next: this.nextPin, pins: this.pins }, null, 1)}\n`); this.broadcast('map:pins', { name: this.name, pins: this.pins }); }

  /** Note an edit and write the draft; with the scene back as saved (undone, discarded), the draft goes. */
  private writeDraft(edit?: { author: string; label: string }) {
    if (!changedKeys(this.saved, this.scene).length) { this.sinceSave = []; if (existsSync(this.draftFile)) rmSync(this.draftFile); return; }
    if (edit) this.sinceSave.push({ ...edit, time: new Date().toISOString() });
    atomicWrite(this.draftFile, `${JSON.stringify({ edits: this.sinceSave, scene: this.scene })}\n`);
  }

  draft(): Draft {
    const keys = changedKeys(this.saved, this.scene);
    return { dirty: keys.length > 0, keys, changed: changedSummary(keys), edits: keys.length ? this.sinceSave : [], savedAt: this.savedAt };
  }

  /** Write the draft to the scene file (the one in git). */
  save() {
    return this.serial(async () => {
      const d = this.draft();
      if (!d.dirty) return { saved: false, draft: d };
      const text = dumpScene(this.scene);
      this.lastWritten = hash(text);
      atomicWrite(this.file, text);
      this.saved = this.scene; this.savedAt = new Date().toISOString();
      this.writeDraft();
      const now = this.draft();
      this.broadcast('map:draft', { name: this.name, draft: now });
      return { saved: true, edits: d.edits.length, changed: d.changed, draft: now };
    });
  }

  /** Put the saved scene back, as one edit (so Ctrl+Z brings the draft back). */
  discard(author = 'user') {
    return this.serial(async () => {
      const d = this.draft();
      if (!d.dirty) return { discarded: false, draft: d };
      const prev = this.scene, label = `discard ${d.edits.length || 'the'} unsaved edit${d.edits.length === 1 ? '' : 's'}`;
      this.scene = this.saved;
      this.record(prev, this.scene, author, label);
      this.redoStack = [];
      this.writeDraft();
      await this.recompile();
      this.publish({ author, label, keys: d.keys });
      return { discarded: true, rev: this.rev, draft: this.draft() };
    });
  }

  private async recompile(): Promise<Compiled> {
    try { this.compiled = await this.worker.compile(this.scene); this.afterCompile?.(this.name, this.compiled); }
    catch (e) {
      const msg = (e as Error).message;
      this.compiled = { G: this.scene.G, size: [0, 0], floors: [], instances: [], pieces: {}, errors: [msg], warnings: [], findings: [{ code: 'crash', severity: 'error', msg, at: null, refs: [] }] };
    }
    return this.compiled;
  }

  summary() {
    const c = this.compiled;
    return { errors: c?.errors.length ?? 0, warnings: c?.warnings.length ?? 0, pieces: c ? Object.values(c.pieces).reduce((a, b) => a + b, 0) : 0, ms: c?.ms };
  }

  private publish(change: { author: string; label: string; keys: string[] }) {
    this.broadcast('map:update', { name: this.name, rev: this.rev, scene: this.scene, compiled: this.compiled, change, draft: this.draft() });
  }

  private diff(before: Compiled | null, after: Compiled) {
    const was = new Map((before?.findings ?? []).map((f) => [fkey(f), f])), now = new Map(after.findings.map((f) => [fkey(f), f]));
    const pieces: Record<string, number> = {};
    for (const p of new Set([...Object.keys(before?.pieces ?? {}), ...Object.keys(after.pieces)])) {
      const d = (after.pieces[p] ?? 0) - (before?.pieces[p] ?? 0);
      if (d) pieces[p] = d;
    }
    return { added: [...now].filter(([k]) => !was.has(k)).map(([, f]) => f), resolved: [...was].filter(([k]) => !now.has(k)).map(([, f]) => f), pieces };
  }

  /** Apply a batch of ops as one undo group (or only compile it, with dry). */
  apply(req: { ops: Op[]; author?: string; label?: string; base?: number; dry?: boolean }) {
    return this.serial(async () => {
      if (!Array.isArray(req.ops) || !req.ops.length) throw new HttpError(400, 'ops must be a non-empty array');
      const author = req.author ?? 'claude';
      let res;
      try { res = applyOps(this.scene, req.ops); } catch (e) { if (e instanceof OpError) throw new HttpError(400, e.message); throw e; }
      const keys = changedKeys(this.scene, res.scene);
      if (typeof req.base === 'number' && req.base < this.rev) {
        const later = new Set(this.history.filter((g) => g.rev > req.base! && g.author !== author).flatMap((g) => g.keys));
        const conflicts = later.has('size') && keys.length ? ['size'] : keys.filter((k) => later.has(k) || (k === 'size' && later.size));
        if (conflicts.length) throw new HttpError(409, `changed since rev ${req.base}: read the scene again`, { conflicts, rev: this.rev });
      }
      const before = this.compiled;
      if (req.dry) {
        const c = await this.worker.compile(res.scene);
        return { dry: true, rev: this.rev, minted: res.minted, changed: changedSummary(keys), diff: this.diff(before, c) };
      }
      if (!keys.length) return { rev: this.rev, minted: res.minted, changed: changedSummary(keys), diff: { added: [], resolved: [], pieces: {} }, summary: this.summary() };
      const prev = this.scene;
      this.scene = res.scene;
      const label = req.label ?? req.ops.map((o) => o.op).join(', ');
      this.record(prev, this.scene, author, label);
      this.redoStack = [];
      if (res.shifts.length) { for (const p of this.pins) if (p.anchor.x != null && p.anchor.y != null) [p.anchor.x, p.anchor.y] = shiftPoint([p.anchor.x, p.anchor.y], res.shifts); this.savePins(); }
      this.writeDraft({ author, label });
      const c = await this.recompile();
      this.publish({ author, label, keys });
      return { rev: this.rev, minted: res.minted, changed: changedSummary(keys), diff: this.diff(before, c), summary: this.summary() };
    });
  }

  /** Undo the latest group (the latest by `author`, if given), even if later groups were made after it. */
  undo(author?: string) {
    return this.serial(async () => {
      let i = this.history.length - 1;
      while (i >= 0 && (this.history[i].author === 'external' || (author && this.history[i].author !== author))) i--;
      if (i < 0) throw new HttpError(404, author ? `nothing of ${author}'s to undo` : 'nothing to undo');
      const g = this.history[i];
      let next: Scene;
      try { next = revert(this.scene, g.before, g.after); } catch (e) { throw new HttpError(409, (e as Error).message); }
      const keys = changedKeys(this.scene, next);
      this.history.splice(i, 1); this.saveHistory();
      this.redoStack.push(g);
      this.scene = next; this.rev++;
      this.writeDraft({ author: g.author, label: `undo: ${g.label}` });
      const before = this.compiled, c = await this.recompile();
      this.publish({ author: g.author, label: `undo: ${g.label}`, keys });
      return { rev: this.rev, undone: { label: g.label, author: g.author }, diff: this.diff(before, c), summary: this.summary() };
    });
  }

  redo() {
    return this.serial(async () => {
      const g = this.redoStack.pop();
      if (!g) throw new HttpError(404, 'nothing to redo');
      let next: Scene;
      try { next = revert(this.scene, g.after, g.before); } catch (e) { throw new HttpError(409, (e as Error).message); }
      const prev = this.scene;
      this.scene = next;
      this.record(prev, next, g.author, g.label);
      this.writeDraft({ author: g.author, label: `redo: ${g.label}` });
      const before = this.compiled, c = await this.recompile();
      this.publish({ author: g.author, label: `redo: ${g.label}`, keys: changedKeys(prev, next) });
      return { rev: this.rev, redone: { label: g.label, author: g.author }, diff: this.diff(before, c), summary: this.summary() };
    });
  }

  /**
   * The scene file changed on disk, not through us (Claude's Edit, a git checkout). With no unsaved changes the editor
   * takes it; with some, the draft is kept (Save writes it over the file, Discard takes the file) and the pages are told.
   */
  external(text: string) {
    return this.serial(async () => {
      if (hash(text) === this.lastWritten) return;
      let next: Scene;
      try { next = JSON.parse(text) as Scene; } catch { return; }   // half-written: the next change event brings the rest
      this.lastWritten = hash(text);
      const dirty = changedKeys(this.saved, this.scene).length > 0;
      this.saved = next; this.savedAt = new Date().toISOString();
      if (dirty) {
        this.writeDraft();
        this.broadcast('map:draft', { name: this.name, draft: this.draft(), notice: 'The scene file changed on disk. Your unsaved changes are kept: Save writes them over it, Discard takes the file' });
        return;
      }
      const keys = changedKeys(this.scene, next);
      if (!keys.length) return;
      const prev = this.scene;
      this.scene = next;
      this.record(prev, next, 'external', 'edited outside the editor');
      await this.recompile();
      this.publish({ author: 'external', label: 'edited outside the editor', keys });
    });
  }

  historyList(n = 20) {
    return this.history.slice(-n).reverse().map(({ group, author, label, rev, time, keys }) => ({ group, author, label, rev, time, changed: keys.length }));
  }

  /** Facts near a point (within r corners) or in a rectangle. */
  query(q: { x?: number; y?: number; r?: number; x0?: number; y0?: number; x1?: number; y1?: number }) {
    const G = this.scene.G, rect = q.x0 != null;
    const [x0, y0, x1, y1] = rect ? [q.x0!, q.y0!, q.x1!, q.y1!] : [q.x! - (q.r ?? 1.5), q.y! - (q.r ?? 1.5), q.x! + (q.r ?? 1.5), q.y! + (q.r ?? 1.5)];
    const inside = (x: number, y: number) => (rect ? x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && y >= Math.min(y0, y1) && y <= Math.max(y0, y1) : Math.hypot(x - q.x!, y - q.y!) <= (q.r ?? 1.5) + 1e-9);
    const byGlyph = new Map(this.scene.terraces.map((t) => [t.glyph, t]));
    const corners = [];
    for (let y = Math.max(0, Math.ceil(Math.min(y0, y1))); y <= Math.min(this.scene.corners.length - 1, Math.floor(Math.max(y0, y1))); y++)
      for (let x = Math.max(0, Math.ceil(Math.min(x0, x1))); x <= Math.min(this.scene.corners[0].length - 1, Math.floor(Math.max(x0, x1))); x++)
        if (inside(x, y)) { const g = this.scene.corners[y][x]; corners.push({ x, y, glyph: g, terrace: byGlyph.get(g)?.id }); }
    const pointsOf = (o: Record<string, unknown>): [number, number][] =>
      [o.at, o.centre, ...((o.head ?? o.ends ?? []) as unknown[])].filter((p): p is [number, number] => Array.isArray(p));
    const objects = this.scene.objects.filter((o) => pointsOf(o).some(([x, y]) => inside(x, y)));
    const instances = (this.compiled?.instances ?? []).map((it) => {
      const [x, y] = it.e ?? (it.x2 != null ? [(it.x + it.x2) / 2 / G, (it.y + it.y2!) / 2 / G] : [it.x / G, it.y / G]);
      return { p: it.p, src: it.src, e: it.e, o: it.o, v: it.v, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, h: it.h };
    }).filter((it) => inside(it.x, it.y));
    const findings = (this.compiled?.findings ?? []).filter((f) => f.at && inside(f.at[0], f.at[1]));
    return { rev: this.rev, corners, objects, instances, findings };
  }

  // ---- pins ----
  pinOp(b: Record<string, unknown>) {
    const now = new Date().toISOString();
    const find = () => { const p = this.pins.find((p) => p.id === b.id); if (!p) throw new HttpError(404, `no pin ${JSON.stringify(b.id)}`); return p; };
    switch (b.op) {
      case 'add': {
        const a = b.anchor as Pin['anchor'];
        const onMap = !!a && typeof a.x === 'number' && typeof a.y === 'number';
        const onRef = !!a?.ref && this.refs.some((r) => r.id === a.ref!.id) && [a.ref.u, a.ref.v].every((t) => typeof t === 'number' && t >= 0 && t <= 1);
        if (!onMap && !onRef) throw new HttpError(400, `a pin needs anchor: {x, y} on the map, or {ref: {id, u, v}} on a concept image (have: ${this.refs.map((r) => r.id).join(', ') || 'none'}; u, v from 0 to 1)`);
        const p: Pin = { id: `p${this.nextPin++}`, note: String(b.note ?? ''), author: String(b.author ?? 'user'), rev: this.rev, status: 'open', seen: false, time: now, anchor: a, thread: [] };
        this.pins.push(p); this.savePins(); return { pin: p };
      }
      case 'reply': { const p = find(); p.thread.push({ author: String(b.author ?? 'claude'), text: String(b.text ?? ''), time: now }); this.savePins(); return { pin: p }; }
      case 'resolve': {
        const p = find();
        if (!['scene', 'rule', 'piece'].includes(String(b.outcome))) throw new HttpError(400, 'outcome must be scene, rule or piece');
        p.status = 'resolved'; p.outcome = String(b.outcome);
        if (b.text) p.thread.push({ author: String(b.author ?? 'claude'), text: String(b.text), time: now });
        this.savePins(); return { pin: p };
      }
      case 'reopen': { const p = find(); p.status = 'open'; p.seen = false; this.savePins(); return { pin: p }; }
      case 'seen': { const ids = new Set((b.ids as string[]) ?? []); for (const p of this.pins) if (ids.has(p.id)) p.seen = true; this.savePins(); return { ok: true }; }
      case 'delete': { find(); this.pins = this.pins.filter((p) => p.id !== b.id); this.savePins(); return { ok: true }; }
      default: throw new HttpError(400, 'op must be add, reply, resolve, reopen, seen or delete');
    }
  }

  // ---- concept images ----
  private saveRefs() { atomicWrite(this.refsFile, `${JSON.stringify({ next: this.nextRef, refs: this.refs }, null, 1)}\n`); this.broadcast('map:refs', { name: this.name, refs: this.refs }); }
  refPath(id: string) {
    const r = this.refs.find((x) => x.id === id);
    if (!r) throw new HttpError(404, `no concept image ${JSON.stringify(id)} (have: ${this.refs.map((x) => x.id).join(', ') || 'none'})`);
    return { ref: r, path: join(this.refsDir, r.file) };
  }
  /** add {title, data: a data: URL or base64 with a file name}, rename {id, title}, remove {id} (its file goes; its pins stay, marked gone). */
  refOp(b: Record<string, unknown>) {
    switch (b.op) {
      case 'add': {
        const m = /^data:image\/(png|jpeg|webp|gif);base64,(.*)$/s.exec(String(b.data ?? ''));
        const ext = m ? (m[1] === 'jpeg' ? 'jpg' : m[1]) : String(b.filename ?? '').split('.').pop()!.toLowerCase();
        if (!imageType(`x.${ext}`)) throw new HttpError(400, 'data must be a PNG, JPEG, WebP or GIF (a data: URL, or base64 with filename)');
        const bytes = Buffer.from(m ? m[2] : String(b.data ?? ''), 'base64');
        if (!bytes.length) throw new HttpError(400, 'no image data');
        const id = `r${this.nextRef++}`, title = String(b.title ?? '').trim() || `concept ${id}`;
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'concept';
        const r: Ref = { id, title, file: `${id}-${slug}.${ext}`, time: new Date().toISOString() };
        mkdirSync(this.refsDir, { recursive: true });
        writeFileSync(join(this.refsDir, r.file), bytes);
        this.refs.push(r); this.saveRefs(); return { ref: r };
      }
      case 'rename': { const { ref } = this.refPath(String(b.id)); ref.title = String(b.title ?? ref.title); this.saveRefs(); return { ref }; }
      case 'remove': {
        const { ref, path } = this.refPath(String(b.id));
        if (existsSync(path)) rmSync(path);
        this.refs = this.refs.filter((r) => r !== ref); this.saveRefs(); return { ok: true };
      }
      default: throw new HttpError(400, 'op must be add, rename or remove');
    }
  }

  pinList(status = 'open') {
    if (status === 'all') return this.pins;
    if (status === 'new') return this.pins.filter((p) => p.status === 'open' && !p.seen);
    return this.pins.filter((p) => p.status === status);
  }
}
