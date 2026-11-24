/**
 * The map editor's scene ops (tools/map-editor/README.md#ops): pure functions on a scene (tools/kit/scenes/*.scene.json).
 * applyOps runs a batch on a copy and returns it; changedKeys says what differs between two scenes (for conflicts,
 * highlights and undo); revert undoes one group's changes on a later scene, key by key, so an older group can be
 * undone without rewinding the edits made after it.
 */

export type Terrace = { id: string; glyph: string; name?: string; h: number; mat: string; edge?: string; walk?: boolean };
export type Obj = { id: string; kind: string; [k: string]: unknown };
export type Scene = { schema: number; name: string; G: number; notes?: string; terraces: Terrace[]; corners: string[]; objects: Obj[] };
export type Op = { op: string; [k: string]: unknown };
/** A row or column insert or removal, so pins can move with the scene. */
export type Shift = { axis: 'x' | 'y'; at: number; n: number };

export class OpError extends Error {}

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const KINDS: Record<string, string> = { flight: 'f', curve: 'c', round: 'r', line: 'l', edge: 'e', vignette: 'v', setpiece: 's', scatter: 'w' };
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const slug = (s: string) => s.toLowerCase().replace(/^the /, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
const num = (v: unknown, what: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new OpError(`${what} must be a number`);
  return v;
};
const pt = (v: unknown, what: string): [number, number] => {
  if (!Array.isArray(v) || v.length !== 2) throw new OpError(`${what} must be [x, y]`);
  return [num(v[0], what), num(v[1], what)];
};

export function terraceOf(sc: Scene, ref: unknown): Terrace {
  const t = sc.terraces.find((t) => t.id === ref) ?? sc.terraces.find((t) => t.glyph === ref);
  if (!t) throw new OpError(`no terrace ${JSON.stringify(ref)} (give its id or glyph)`);
  return t;
}

function mintId(sc: Scene, prefix: string): string {
  const used = new Set(sc.objects.map((o) => o.id));
  for (let n = 1; ; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`;
}

/** Every point-like field of an object, to move or shift it. */
export function eachPoint(o: Obj, f: (p: [number, number]) => [number, number]) {
  for (const k of ['at', 'centre', 'a', 'b']) if (Array.isArray(o[k])) o[k] = f(o[k] as [number, number]);   // a, b: a line's ends
  for (const k of ['head', 'ends']) if (Array.isArray(o[k])) o[k] = (o[k] as [number, number][]).map(f);
}

/** Apply a batch of ops to a copy of the scene. Throws OpError on a bad op (nothing is applied). */
export function applyOps(scene: Scene, ops: Op[]): { scene: Scene; minted: string[]; shifts: Shift[] } {
  const sc = clone(scene), minted: string[] = [], shifts: Shift[] = [];
  let rows = sc.corners.map((r) => r.split(''));
  const H = () => rows.length, W = () => rows[0]?.length ?? 0;
  for (const [i, o] of ops.entries()) {
    const where = `op ${i} (${o.op})`;
    try {
      switch (o.op) {
        case 'paint': {
          const g = terraceOf(sc, o.terrace).glyph;
          const pts: [number, number][] = [];
          if (o.rect) {
            const [x0, y0, x1, y1] = (o.rect as number[]).map((v) => Math.round(num(v, 'rect')));
            for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) pts.push([x, y]);
          } else if (Array.isArray(o.at)) for (const p of o.at) pts.push(pt(p, 'at').map(Math.round) as [number, number]);
          else throw new OpError('paint needs at: [[x, y], ...] or rect: [x0, y0, x1, y1]');
          for (const [x, y] of pts) if (y >= 0 && y < H() && x >= 0 && x < W()) rows[y][x] = g;
          break;
        }
        case 'add_terrace': {
          const name = String(o.name ?? 'a terrace');
          let glyph = typeof o.glyph === 'string' ? o.glyph : [...GLYPHS].find((c) => !sc.terraces.some((t) => t.glyph === c));
          if (!glyph || glyph.length !== 1 || sc.terraces.some((t) => t.glyph === glyph)) throw new OpError(`glyph ${JSON.stringify(glyph)} is taken or not one character`);
          let id = typeof o.id === 'string' ? o.id : `t-${slug(name)}`;
          while (sc.terraces.some((t) => t.id === id)) id += `-${glyph.toLowerCase()}`;
          const t: Terrace = { id, glyph, name, h: num(o.h ?? 0, 'h'), mat: String(o.mat ?? 'paving'), edge: String(o.edge ?? 'parapet') };
          if (o.walk === false) t.walk = false;
          sc.terraces.push(t); minted.push(id);
          break;
        }
        case 'set_terrace': {
          const t = terraceOf(sc, o.id);
          for (const k of ['name', 'h', 'mat', 'edge', 'walk', 'glyph'] as const) {
            if (!(k in o)) continue;
            const v = o[k];
            if (k === 'glyph') {
              if (typeof v !== 'string' || v.length !== 1 || sc.terraces.some((x) => x !== t && x.glyph === v)) throw new OpError(`glyph ${JSON.stringify(v)} is taken or not one character`);
              rows = rows.map((r) => r.map((c) => (c === t.glyph ? v : c)));
              t.glyph = v;
            } else if (k === 'h') t.h = num(v, 'h');
            else if (k === 'walk') { if (v === false) t.walk = false; else delete t.walk; }
            else if (v === null) delete (t as Record<string, unknown>)[k];
            else (t as Record<string, unknown>)[k] = String(v);
          }
          break;
        }
        case 'remove_terrace': {
          const t = terraceOf(sc, o.id);
          if (rows.some((r) => r.includes(t.glyph))) throw new OpError(`${t.id} still covers corners: paint them first`);
          if (sc.objects.some((x) => x.terrace === t.id)) throw new OpError(`${t.id} still has a curve`);
          sc.terraces = sc.terraces.filter((x) => x !== t);
          break;
        }
        case 'add': {
          const kind = String(o.kind), prefix = KINDS[kind];
          if (!prefix) throw new OpError(`kind must be one of ${Object.keys(KINDS).join(', ')}`);
          const id = typeof o.id === 'string' ? o.id : mintId(sc, prefix);
          if (sc.objects.some((x) => x.id === id)) throw new OpError(`id ${id} is taken`);
          const { op: _op, ...fields } = o;
          const obj: Obj = { ...fields, id, kind };
          if (kind === 'flight') { const h = obj.head as unknown[]; if (!Array.isArray(h) || h.length !== 2) throw new OpError('a flight needs head: [[x, y], [x, y]]'); h.forEach((p) => pt(p, 'head')); }
          if (kind === 'edge') { pt(obj.at, 'at'); obj.v ??= 'window'; }
          if (kind === 'vignette') { pt(obj.at, 'at'); obj.piece ??= 'vignette.lamp'; obj.front ??= 'S'; }
          if (kind === 'line') {   // a true straight line, at any angle, the edges near it snap onto (compile.py): a, b, tol?, terrace?
            pt(obj.a, 'a'); pt(obj.b, 'b');
            if (typeof obj.terrace === 'string') obj.terrace = terraceOf(sc, obj.terrace).id;
          }
          if (kind === 'scatter') {   // fills a level with set pieces on a seeded, jittered grid (compile.py): terrace, pieces, spacing?, margin?, seed?
            obj.terrace = terraceOf(sc, String(obj.terrace ?? '')).id;
            if (!Array.isArray(obj.pieces) || !obj.pieces.length || !obj.pieces.every((p) => typeof p === 'string')) throw new OpError('a scatter needs pieces: ["setpiece.<name>", ...]');
            obj.seed ??= 1;
          }
          if (kind === 'setpiece') {   // a unique made piece on its footprint (kit.json class setpiece): placed like a vignette
            pt(obj.at, 'at'); obj.front ??= 'S';
            if (typeof obj.piece !== 'string' || !obj.piece.startsWith('setpiece.')) throw new OpError('a set piece needs piece: "setpiece.<name>" (see tools/kit/kit.json)');
            obj.name ??= obj.piece.slice('setpiece.'.length);
          }
          if (kind === 'curve') { if (typeof obj.terrace === 'string') obj.terrace = terraceOf(sc, obj.terrace).id; pt(obj.centre, 'centre'); obj.out ??= 'S'; }
          if (kind === 'round') {   // a true circle the edges near it snap onto (tools/kit/compile.py): centre, r, tol?, terrace?, from?/to?
            pt(obj.centre, 'centre');
            if (num(obj.r, 'r') <= 0) throw new OpError('r must be more than 0');
            if (typeof obj.terrace === 'string') obj.terrace = terraceOf(sc, obj.terrace).id;
            if ((obj.from == null) !== (obj.to == null)) throw new OpError('give both from and to (degrees: 0 east, 90 south), or neither');
          }
          sc.objects.push(obj); minted.push(id);
          break;
        }
        case 'set': {
          const obj = sc.objects.find((x) => x.id === o.id);
          if (!obj) throw new OpError(`no object ${JSON.stringify(o.id)}`);
          for (const [k, v] of Object.entries(o)) {
            if (k === 'op' || k === 'id' || k === 'kind') continue;
            if (v === null) delete obj[k]; else obj[k] = k === 'terrace' ? terraceOf(sc, v).id : v;
          }
          break;
        }
        case 'move': {
          const obj = sc.objects.find((x) => x.id === o.id);
          if (!obj) throw new OpError(`no object ${JSON.stringify(o.id)}`);
          const [dx, dy] = pt(o.by, 'by');
          eachPoint(obj, ([x, y]) => [x + dx, y + dy]);
          break;
        }
        case 'remove': {
          const n = sc.objects.length;
          sc.objects = sc.objects.filter((x) => x.id !== o.id);
          if (sc.objects.length === n) throw new OpError(`no object ${JSON.stringify(o.id)}`);
          break;
        }
        case 'insert_rows': case 'insert_cols': case 'remove_rows': case 'remove_cols': {
          const axis = o.op.endsWith('rows') ? 'y' : 'x', ins = o.op.startsWith('insert');
          const at = Math.round(num(o.at, 'at')), n = Math.round(num(o.n ?? 1, 'n'));
          const len = axis === 'y' ? H() : W();
          if (n < 1 || at < 0 || at > len || (!ins && at + n > len)) throw new OpError(`${o.op}: at ${at}, n ${n} is outside 0..${len}`);
          if (!ins && len - n < 2) throw new OpError('a scene needs at least two corner rows and columns');
          const fill = o.fill != null ? terraceOf(sc, o.fill).glyph : null;
          if (axis === 'y') {
            if (ins) { const src = rows[Math.max(0, at - 1)]; rows.splice(at, 0, ...Array.from({ length: n }, () => (fill ? src.map(() => fill) : [...src]))); }
            else rows.splice(at, n);
          } else rows = rows.map((r) => {
            const c = [...r];
            if (ins) c.splice(at, 0, ...Array.from({ length: n }, () => fill ?? r[Math.max(0, at - 1)])); else c.splice(at, n);
            return c;
          });
          const d = ins ? n : -n, k = axis === 'y' ? 1 : 0;
          for (const obj of sc.objects) eachPoint(obj, (p) => { const q: [number, number] = [p[0], p[1]]; if (q[k] >= at - 1e-9) q[k] += d; return q; });
          shifts.push({ axis, at, n: d });
          break;
        }
        case 'set_meta': {
          if (typeof o.name === 'string') sc.name = o.name;
          if (typeof o.notes === 'string') sc.notes = o.notes;
          break;
        }
        default: throw new OpError(`unknown op ${JSON.stringify(o.op)}`);
      }
    } catch (e) {
      if (e instanceof OpError) throw new OpError(`${where}: ${e.message}`);
      throw e;
    }
  }
  sc.corners = rows.map((r) => r.join(''));
  return { scene: sc, minted, shifts };
}

/** Shift a point the way a row or column insert or removal moved the scene. */
export function shiftPoint(p: [number, number], shifts: Shift[]): [number, number] {
  const q: [number, number] = [p[0], p[1]];
  for (const s of shifts) { const k = s.axis === 'y' ? 1 : 0; if (q[k] >= s.at - 1e-9) q[k] += s.n; }
  return q;
}

/** What differs between two scenes: c:x,y (a corner), t:id (a terrace), o:id (an object), m (name or notes), size. */
export function changedKeys(a: Scene, b: Scene): string[] {
  const keys: string[] = [];
  if (a.corners.length !== b.corners.length || a.corners[0]?.length !== b.corners[0]?.length) keys.push('size');
  else for (let y = 0; y < a.corners.length; y++) for (let x = 0; x < a.corners[y].length; x++) if (a.corners[y][x] !== b.corners[y][x]) keys.push(`c:${x},${y}`);
  const byId = <T extends { id: string }>(xs: T[]) => new Map(xs.map((v) => [v.id, JSON.stringify(v)]));
  for (const [pre, A, B] of [['t', byId(a.terraces), byId(b.terraces)], ['o', byId(a.objects), byId(b.objects)]] as const) {
    for (const id of new Set([...A.keys(), ...B.keys()])) if (A.get(id) !== B.get(id)) keys.push(`${pre}:${id}`);
  }
  if (a.name !== b.name || a.notes !== b.notes) keys.push('m');
  return keys;
}

/**
 * Undo a group (before -> after) on the current scene: each key it changed goes back to its value in `before`.
 * Later edits to other keys stay. A resize can only be undone while nothing has been edited after it.
 */
export function revert(current: Scene, before: Scene, after: Scene): Scene {
  const keys = changedKeys(before, after);
  if (keys.includes('size')) {
    if (changedKeys(after, current).length) throw new OpError('a resize can only be undone before anything else is edited');
    return clone(before);
  }
  const sc = clone(current), rows = sc.corners.map((r) => r.split(''));
  for (const k of keys) {
    if (k.startsWith('c:')) {
      const [x, y] = k.slice(2).split(',').map(Number);
      if (rows[y]?.[x] !== undefined) rows[y][x] = before.corners[y][x];
    } else if (k === 'm') { sc.name = before.name; sc.notes = before.notes; }
    else {
      const list = (k[0] === 't' ? 'terraces' : 'objects') as 'terraces' | 'objects', id = k.slice(2);
      const old = (before[list] as { id: string }[]).find((v) => v.id === id);
      const items = sc[list] as { id: string }[];
      const i = items.findIndex((v) => v.id === id);
      if (old && i >= 0) items[i] = clone(old);
      else if (old) items.push(clone(old));
      else if (i >= 0) items.splice(i, 1);
    }
  }
  sc.corners = rows.map((r) => r.join(''));
  return sc;
}

/** The scene file's layout: one terrace, corner row or object per line (the same as tools/kit/scene.py dump()). */
export function dumpScene(sc: Scene): string {
  // Python's json.dumps(separators=(', ', ': '))
  const line = (v: unknown): string => {
    if (Array.isArray(v)) return `[${v.map(line).join(', ')}]`;
    if (v && typeof v === 'object') return `{${Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => `${JSON.stringify(k)}: ${line(x)}`).join(', ')}}`;
    return JSON.stringify(v);
  };
  const out = ['{'];
  for (const [k, v] of Object.entries(sc)) if (!['terraces', 'corners', 'objects'].includes(k)) out.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  for (const k of ['terraces', 'corners', 'objects'] as const) {
    const items = sc[k] as unknown[];
    out.push(`  "${k}": [`);
    items.forEach((v, i) => out.push(`    ${line(v)}${i < items.length - 1 ? ',' : ''}`));
    out.push(`  ]${k !== 'objects' ? ',' : ''}`);
  }
  out.push('}');
  return `${out.join('\n')}\n`;
}
