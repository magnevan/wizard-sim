/**
 * Snapshot, restore and hash. Rollback needs the first two to be cheap; lockstep desync checks
 * need the third. All three walk `buffers(world)`, so any new state array must be added there.
 */
import { buffers, type World } from './world';

export type Snapshot = Uint8Array[];

const bytesOf = (v: ArrayBufferView) => new Uint8Array(v.buffer, v.byteOffset, v.byteLength);

export function snapshot(w: World): Snapshot {
  return buffers(w).map((v) => bytesOf(v).slice());
}

export function restore(w: World, s: Snapshot): void {
  const bufs = buffers(w);
  if (bufs.length !== s.length) throw new Error('snapshot does not match this world layout');
  for (let i = 0; i < bufs.length; i++) bytesOf(bufs[i]).set(s[i]);
  w.events.length = 0;
}

/** FNV-1a (32-bit) over every state byte. Equal hashes on two peers mean equal worlds. */
export function hashWorld(w: World): number {
  let h = 0x811c9dc5;
  for (const v of buffers(w)) {
    const b = bytesOf(v);
    for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i], 0x01000193);
  }
  return h >>> 0;
}

/**
 * Makes `w` the world `fresh` is, keeping the object (everything holds it). Same layout: a copy
 * of its state. A different layout (a survive world and another room): its pools are swapped in.
 */
export function replaceWorld(w: World, fresh: World): void {
  if ((w.run === null) === (fresh.run === null) && w.dims.gw === fresh.dims.gw && w.dims.gh === fresh.dims.gh) { restore(w, snapshot(fresh)); w.dims = fresh.dims; return; }
  Object.assign(w, fresh);
}

export const hex = (h: number): string => h.toString(16).padStart(8, '0');

/** Snapshot into existing buffers (no garbage): rollback takes one every tick. */
export function snapshotInto(w: World, into: Snapshot | null): Snapshot {
  const bufs = buffers(w);
  if (!into || into.length !== bufs.length) return snapshot(w);
  for (let i = 0; i < bufs.length; i++) into[i].set(bytesOf(bufs[i]));
  return into;
}

/** The same hash as hashWorld, of a snapshot. */
export function hashSnapshot(s: Snapshot): number {
  let h = 0x811c9dc5;
  for (const b of s) for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i], 0x01000193);
  return h >>> 0;
}
