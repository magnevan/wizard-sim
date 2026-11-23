/**
 * Curves for the map editor: a terrace bulging past one straight run of its edge along a circle (the scene's `curve`
 * object; tools/kit/compile.py draws it). All in corners. A straight edge lies on a half line between two rows (or
 * columns) of corners; a run of it belongs to a terrace when, cell by cell, both corners on one side are that terrace
 * and both on the other rank lower (by height, then glyph, as the compiler ranks them).
 */
export type Pt = [number, number];
export type Out = 'N' | 'S' | 'E' | 'W';
/** A straight edge line: horizontal at y = line (half coordinate) or vertical at x = line. */
export type EdgeLine = { horiz: boolean; line: number; glyph: string; out: Out };
export type CurveShape = { ends: [Pt, Pt]; centre: Pt; r: number; out: Out };

export const OUT: Record<Out, Pt> = { S: [0, 1], N: [0, -1], E: [1, 0], W: [-1, 0] };

type Heights = (glyph: string) => number | undefined;
const rankLess = (h: Heights, a: string, b: string) => { const ha = h(a) ?? 0, hb = h(b) ?? 0; return ha < hb || (ha === hb && a < b); };

/** Whether cell `s` along the line (its corners s and s+1) is a straight run of `e.glyph`'s edge. */
function straightAt(rows: string[], h: Heights, e: EdgeLine, s: number): boolean {
  const lo = Math.floor(e.line), up = e.out === 'S' || e.out === 'E' ? lo : lo + 1, down = up === lo ? lo + 1 : lo;
  const at = (across: number, along: number) => (e.horiz ? rows[across]?.[along] : rows[along]?.[across]);
  const a = [at(up, s), at(up, s + 1)], b = [at(down, s), at(down, s + 1)];
  if (a.some((g) => g !== e.glyph) || b.some((g) => g === undefined)) return false;
  return b.every((g) => rankLess(h, g!, e.glyph));
}

/** The straight edge under point p (corners): the nearer of the half lines through its cell that is an edge there. */
export function edgeAt(rows: string[], h: Heights, p: Pt): EdgeLine | null {
  const cands: [number, EdgeLine][] = [];
  for (const horiz of [true, false]) {
    const across = horiz ? p[1] : p[0], along = Math.floor(horiz ? p[0] : p[1]);
    const line = Math.floor(across) + 0.5, lo = line - 0.5;
    const g1 = horiz ? rows[lo]?.[along] : rows[along]?.[lo], g2 = horiz ? rows[lo + 1]?.[along] : rows[along]?.[lo + 1];
    if (g1 === undefined || g2 === undefined || g1 === g2) continue;
    const top = rankLess(h, g2, g1) ? g1 : g2;
    const out: Out = horiz ? (top === g1 ? 'S' : 'N') : (top === g1 ? 'E' : 'W');
    const e: EdgeLine = { horiz, line, glyph: top, out };
    if (straightAt(rows, h, e, along)) cands.push([Math.abs(across - line), e]);
  }
  cands.sort((a, b) => a[0] - b[0]);
  return cands[0]?.[1] ?? null;
}

/** The ends on the line for a drag from along-coordinate a to b (snapped to whole corners), and whether every cell between is the terrace's straight edge. */
export function runOn(rows: string[], h: Heights, e: EdgeLine, a: number, b: number): { ends: [Pt, Pt]; ok: boolean; len: number } {
  let s0 = Math.round(Math.min(a, b)), s1 = Math.round(Math.max(a, b));
  if (s1 === s0) { s0 = Math.floor(Math.min(a, b)); s1 = s0 + 1; }
  let ok = true;
  for (let s = s0; s < s1; s++) if (!straightAt(rows, h, e, s)) ok = false;
  const P = (v: number): Pt => (e.horiz ? [v, e.line] : [e.line, v]);
  return { ends: [P(s0), P(s1)], ok, len: s1 - s0 };
}

/** The circle through both ends that bulges `sag` past the line on the out side. */
export function fromSag(ends: [Pt, Pt], out: Out, sag: number): CurveShape {
  const [[ax, ay], [bx, by]] = ends, half = Math.hypot(bx - ax, by - ay) / 2, [dx, dy] = OUT[out];
  const r = (half * half + sag * sag) / (2 * sag), mx = (ax + bx) / 2, my = (ay + by) / 2, k = sag - r;
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return { ends, out, r: round(r), centre: [round(mx + dx * k), round(my + dy * k)] };
}

/** How far a curve bulges past its line. */
export function sagOf(c: { ends: Pt[]; centre: Pt; r: number; out: string }): number {
  const [[ax, ay], [bx, by]] = c.ends, [dx, dy] = OUT[c.out as Out] ?? [0, 1];
  const along = (c.centre[0] - (ax + bx) / 2) * dx + (c.centre[1] - (ay + by) / 2) * dy;
  return c.r + along;
}

/** The sag for a point the pointer is at: how far past the line on the out side, snapped (to the semicircle near it, else to quarters). */
export function sagFor(ends: [Pt, Pt], out: Out, p: Pt): number {
  const [[ax, ay], [bx, by]] = ends, [dx, dy] = OUT[out], half = Math.hypot(bx - ax, by - ay) / 2;
  const d = (p[0] - (ax + bx) / 2) * dx + (p[1] - (ay + by) / 2) * dy;
  const s = Math.max(0.25, Math.min(half * 2, d));
  return Math.abs(s - half) < Math.max(0.2, half * 0.12) ? half : Math.round(s * 4) / 4;
}

/** Points along the arc, from end a to end b through the out side (as the compiler walks it). */
export function arcPoints(c: { ends: Pt[]; centre: Pt; r: number; out: string }, n = 32): Pt[] {
  const [cx, cy] = c.centre, [[ax, ay], [bx, by]] = c.ends, [dx, dy] = OUT[c.out as Out] ?? [0, 1];
  const a0 = Math.atan2(ay - cy, ax - cx), a1 = Math.atan2(by - cy, bx - cx), mid = Math.atan2(dy, dx);
  let da = (((a1 - a0) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const off = ((((a0 + da / 2 - mid + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
  if (Math.abs(off) > Math.PI / 2) da -= 2 * Math.PI;
  return Array.from({ length: n + 1 }, (_, t) => [cx + c.r * Math.cos(a0 + (da * t) / n), cy + c.r * Math.sin(a0 + (da * t) / n)] as Pt);
}

/** The point of the arc furthest out: where its bulge handle sits. */
export function apexOf(c: { ends: Pt[]; centre: Pt; r: number; out: string }): Pt {
  const [[ax, ay], [bx, by]] = c.ends, [dx, dy] = OUT[c.out as Out] ?? [0, 1], s = sagOf(c);
  return [(ax + bx) / 2 + dx * s, (ay + by) / 2 + dy * s];
}

/** The edge line a curve sits on (from its ends and out side). */
export function lineOf(c: { ends: Pt[]; out: string }, glyph: string): EdgeLine {
  const horiz = c.out === 'N' || c.out === 'S';
  return { horiz, line: horiz ? c.ends[0][1] : c.ends[0][0], glyph, out: c.out as Out };
}
