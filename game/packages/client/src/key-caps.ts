/**
 * Keys drawn as pictures, for prompts you take in at a glance in the middle of a fight (the user, 2026-11-12: "it's
 * unintuitive to read text as you're entering a battle"): a Fire rune's key is a cap with the Fire symbol and a big F
 * on it, Shift a wide cap, the mouse a mouse with the button to press lit. Between them an arrow (then) or a plus
 * (together). The presses play in order, over and over: each cap dips and lights as it's pressed; one to hold stays
 * down while a bar under it fills.
 */
import * as X from './art/px';
import type { Ctx } from './art/px';

export type Key = 'fire' | 'shift' | 'rmb' | 'x' | 'circle';
export type Token = { key: Key; hold?: boolean } | 'then' | 'plus';

const CAP_H = 16, GAP = 3;
const CAP_W: Record<Key, number> = { fire: 17, shift: 30, rmb: 14, x: 15, circle: 22 };
const SEP_W = 9;
/** Seconds each press is shown for: a tap, and a hold. And a rest before it starts over. */
const TAP = 0.42, HOLD = 1.1, REST = 0.7;

const widthOf = (t: Token): number => (t === 'then' || t === 'plus' ? SEP_W : CAP_W[t.key]);
/** How wide a row of tokens is, art px. */
export const rowWidth = (row: readonly Token[]): number => row.reduce((s, t) => s + widthOf(t) + GAP, -GAP);

/** Each key's press: keys joined by a plus are one press (together); every other key is a press of its own, in order. */
function groupsOf(row: readonly Token[]): number[] {
  const g: number[] = [];
  let n = -1, joined = false;
  for (const tok of row) {
    if (tok === 'plus') { joined = true; continue; }
    if (tok === 'then') { joined = false; continue; }
    if (!joined || n < 0) n++;
    g.push(n); joined = false;
  }
  return g;
}

/** Which press is showing at time t, and how far into it (0..1); a press with a key to hold lasts longer. */
function pressAt(row: readonly Token[], t: number): { group: number; k: number } {
  const keys = row.filter((tok): tok is { key: Key; hold?: boolean } => typeof tok === 'object'), gs = groupsOf(row);
  const len: number[] = [];
  keys.forEach((k, i) => { len[gs[i]] = Math.max(len[gs[i]] ?? 0, k.hold ? HOLD : TAP); });
  const total = len.reduce((a, b) => a + b, 0) + REST;
  let u = ((t % total) + total) % total;
  for (let i = 0; i < len.length; i++) { if (u < len[i]) return { group: i, k: u / len[i] }; u -= len[i]; }
  return { group: -1, k: 0 };
}

/** Draws a row of tokens with its left edge at x, its caps' tops at y. Returns its width. */
export function drawKeys(c: Ctx, row: readonly Token[], x: number, y: number, t: number): number {
  const at = pressAt(row, t), gs = groupsOf(row);
  let n = 0, px = x;
  for (const tok of row) {
    if (tok === 'then') { arrow(c, px, y + CAP_H / 2); px += SEP_W + GAP; continue; }
    if (tok === 'plus') { plus(c, px, y + CAP_H / 2); px += SEP_W + GAP; continue; }
    const down = at.group === gs[n++];
    cap(c, tok, px, y, down, down && tok.hold ? at.k : down ? 1 : 0, t);
    px += CAP_W[tok.key] + GAP;
  }
  return px - x - GAP;
}

const OUT = '#0a0810', FACE = '#2a2638', FACE_DOWN = '#4a3020', TOP = '#4a4460', SIDE = '#16131f', LIT = '#ffb040', INK = '#e8e4f0';

function cap(c: Ctx, tok: { key: Key; hold?: boolean }, x: number, y: number, down: boolean, fill: number, t: number): void {
  const w = CAP_W[tok.key], dy = down ? 1 : 0;
  if (tok.key === 'rmb') { mouse(c, x, y, down, fill, !!tok.hold); return; }
  if (tok.key === 'circle') { circle(c, x, y, t); return; }
  // the cap: an outline, its side showing under it (less when pressed), a bevelled face
  X.rect(c, x, y + dy, w, CAP_H - dy, OUT);
  X.rect(c, x + 1, y + CAP_H - 3, w - 2, 2, SIDE);
  X.rect(c, x + 1, y + 1 + dy, w - 2, CAP_H - 5, down ? FACE_DOWN : FACE);
  X.rect(c, x + 1, y + 1 + dy, w - 2, 1, down ? LIT : TOP);
  const fy = y + 1 + dy;
  if (tok.key === 'fire') {
    X.icon(c, 'fire', x + Math.round(w / 2) - 5, fy + 1, down ? X.EL.fire[1] : X.EL.fire[2]);
    X.text(c, 'F', x + Math.round(w / 2) - 3, fy + 2, '#ffffff', OUT, 2); // a big F over the symbol
  } else if (tok.key === 'shift') {
    // an outlined up arrow and SHIFT
    const ax = x + 5, ay = fy + 2;
    X.px(c, ax + 2, ay, INK); X.rect(c, ax + 1, ay + 1, 3, 1, INK); X.rect(c, ax, ay + 2, 5, 1, INK); X.rect(c, ax + 1, ay + 3, 3, 3, INK);
    X.text(c, 'SHIFT', x + 11, fy + 4, down ? LIT : INK);
  } else if (tok.key === 'x') {
    X.text(c, 'X', x + Math.round(w / 2) - 3, fy + 2, down ? LIT : '#ffffff', OUT, 2);
  }
  if (tok.hold) holdBar(c, x, y + CAP_H + 1, w, fill);
}

/** A mouse seen from above: a rounded body, its cord, the left button dull and the right one lit (brighter while pressed). */
function mouse(c: Ctx, x: number, y: number, down: boolean, fill: number, hold: boolean): void {
  const w = CAP_W.rmb, mid = x + Math.floor(w / 2), body = '#cfc9e6', shade = '#9a94b2';
  X.rect(c, mid, y - 2, 1, 3, '#8a8498'); // the cord
  // a rounded body, wider at the bottom
  X.rect(c, x + 2, y + 1, w - 4, 1, OUT); X.rect(c, x + 1, y + 2, w - 2, 1, OUT); X.rect(c, x, y + 3, w, CAP_H - 5, OUT);
  X.rect(c, x + 1, y + CAP_H - 2, w - 2, 1, OUT); X.rect(c, x + 2, y + CAP_H - 1, w - 4, 1, OUT);
  X.rect(c, x + 2, y + 2, w - 4, 1, body); X.rect(c, x + 1, y + 3, w - 2, CAP_H - 5, body); X.rect(c, x + 2, y + CAP_H - 2, w - 4, 1, shade);
  X.rect(c, x + 1, y + 9, w - 2, CAP_H - 11, shade);
  X.rect(c, mid, y + 2, 1, 7, OUT); X.rect(c, x + 1, y + 9, w - 2, 1, OUT); // the buttons' seams
  // the right button: always orange, so it reads as the one to press; brighter and dipped while pressed
  X.rect(c, mid + 1, y + 3 + (down ? 1 : 0), Math.ceil(w / 2) - 2, 5 - (down ? 1 : 0), down ? LIT : '#c06a24');
  X.px(c, mid + 1, y + 2, down ? '#fff2c0' : '#e0903a');
  if (hold) holdBar(c, x, y + CAP_H + 1, w, fill);
}

/** A glyph circle on the ground, softly pulsing: where you stand to possess a defence. */
function circle(c: Ctx, x: number, y: number, t: number): void {
  const cx = x + 11, cy = y + 9, k = 0.6 + 0.4 * Math.sin(t * 4);
  X.ring(c, cx, cy, 10, 5, OUT); X.ring(c, cx, cy, 9, 4.5, k > 0.8 ? LIT : '#e0701c'); X.ring(c, cx, cy, 6, 3, '#8a3c14');
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + t * 0.8; X.px(c, cx + Math.cos(a) * 7.5, cy + Math.sin(a) * 3.8, '#ffd860'); }
}

function holdBar(c: Ctx, x: number, y: number, w: number, k: number): void {
  X.rect(c, x, y, w, 3, OUT);
  if (k > 0) X.rect(c, x + 1, y + 1, Math.max(1, Math.round((w - 2) * Math.min(1, k))), 1, LIT);
}

function arrow(c: Ctx, x: number, y: number): void {
  X.rect(c, x + 1, y - 1, 5, 2, '#8a8498'); X.rect(c, x + 5, y - 3, 1, 6, '#8a8498'); X.rect(c, x + 6, y - 2, 1, 4, '#8a8498'); X.rect(c, x + 7, y - 1, 1, 2, '#8a8498');
}

function plus(c: Ctx, x: number, y: number): void {
  X.rect(c, x + 2, y - 1, 5, 2, '#8a8498'); X.rect(c, x + 3.5, y - 2.5, 2, 5, '#8a8498');
}
