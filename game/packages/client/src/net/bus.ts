/**
 * A tiny message bus the lobby and the lockstep transport run on: broadcast a JSON message on a
 * topic, hear everyone else's. Two backings:
 *   room       the claude.ai artifact's room capability: everyone with the page open, relayed by
 *              the platform (no server of ours). About 40 messages a second per sender, 4 KiB each,
 *              and messages can drop: the lockstep session resends, so that's fine.
 *   broadcast  a BroadcastChannel: tabs of the same page on one machine (the dev server), for
 *              trying online play alone.
 *   webrtc     browsers connected directly (webrtc.ts): for builds served outside claude.ai.
 */
export interface Bus {
  readonly kind: 'room' | 'broadcast' | 'webrtc';
  /** This page's id on the bus (the room's peer label, or a random one for BroadcastChannel). */
  readonly self: string;
  emit(topic: string, data: unknown): void;
  on(topic: string, fn: (data: unknown, from: string) => void): void;
}

interface RoomApi {
  emit(topic: string, data?: unknown): Promise<void>;
  on(topic: string, fn: (m: { topic: string; data?: unknown; peer: string; sameTab: boolean }) => void, onError?: (e: { code: string; message: string }) => void): () => void;
  peers(): readonly { peer: string; sameTab: boolean }[];
  onPeers(fn: (c: { peers: readonly { peer: string; sameTab: boolean }[] }) => void): () => void;
}

/** The artifact room, or null outside claude.ai (or when this viewer can't connect). */
export async function roomBus(): Promise<Bus | null> {
  const claude = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
  if (!claude?.use) return null;
  let room: RoomApi | null = null;
  try { room = (await claude.use('room')) as RoomApi | null; } catch { room = null; }
  if (!room) return null;
  // Our own peer label: the sameTab entry, once the platform has answered.
  const self = await new Promise<string>((resolve) => {
    const mine = room!.peers().find((p) => p.sameTab);
    if (mine) { resolve(mine.peer); return; }
    const off = room!.onPeers((c) => { const m = c.peers.find((p) => p.sameTab); if (m) { off(); resolve(m.peer); } });
  });
  const r = room;
  return {
    kind: 'room',
    self,
    emit: (topic, data) => { void r.emit(topic, data).catch(() => { /* dropped: the session resends */ }); },
    on: (topic, fn) => { r.on(topic, (m) => { if (!m.sameTab) fn(m.data, m.peer); }); },
  };
}

/** Tabs of the same page on one machine. */
export function broadcastBus(name = 'wizard-sim-net'): Bus {
  const ch = new BroadcastChannel(name);
  const self = Math.random().toString(36).slice(2, 10); // a label for this tab, not game state
  const handlers = new Map<string, ((data: unknown, from: string) => void)[]>();
  ch.onmessage = (e: MessageEvent<{ topic: string; from: string; data: unknown }>) => {
    for (const fn of handlers.get(e.data.topic) ?? []) fn(e.data.data, e.data.from);
  };
  return {
    kind: 'broadcast',
    self,
    emit: (topic, data) => ch.postMessage({ topic, from: self, data }),
    on: (topic, fn) => { handlers.set(topic, [...(handlers.get(topic) ?? []), fn]); },
  };
}

export const toB64 = (b: Uint8Array): string => { let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); };
export const fromB64 = (s: string): Uint8Array => { const t = atob(s), b = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) b[i] = t.charCodeAt(i); return b; };
