/**
 * A WebRTC bus: browsers connected directly, every player to every other (a mesh, up to 4).
 * Signalling (finding each other) goes through PeerJS's free public server; after that the game's
 * packets travel peer to peer, usually 20–80 ms instead of the artifact room's few hundred.
 *
 * Rooms are short codes. The host's peer id is PREFIX + code; a joiner connects to it, and the host
 * tells every newcomer who else is in, so the newcomer connects to them too.
 *
 * claude.ai artifact pages block WebRTC, so this is for builds served elsewhere: the dev server
 * (`npm run dev:lan`, then the printed address on any device on the network) or a hosted page.
 * Players behind very strict routers may need a TURN relay one day; most home networks don't.
 */
import Peer, { type DataConnection } from 'peerjs';
import type { Bus } from './bus';

const PREFIX = 'wizard-sim-v1-';
const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I, L, O, 0, 1: easy to read out
const newCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');

export interface RtcBus extends Bus {
  readonly kind: 'webrtc';
  /** "idle", "connecting", "hosting ABCD", "joined ABCD", or an error to show. */
  status: string;
  code: string;
  createRoom(): Promise<string>;
  joinRoom(code: string): Promise<void>;
  peerCount(): number;
}

export function webrtcBus(): RtcBus {
  let peer: Peer | null = null;
  const conns = new Map<string, DataConnection>();
  const handlers = new Map<string, ((data: unknown, from: string) => void)[]>();

  const deliver = (raw: unknown, from: string) => {
    const m = raw as { t?: string; d?: unknown; sys?: string; ids?: string[] };
    if (m?.sys === 'mesh' && Array.isArray(m.ids)) { for (const id of m.ids) if (id !== peer?.id && !conns.has(id)) open(id); return; }
    if (typeof m?.t !== 'string') return;
    for (const fn of handlers.get(m.t) ?? []) fn(m.d, from);
  };

  const attach = (conn: DataConnection) => {
    conn.on('open', () => {
      conns.set(conn.peer, conn);
      // The host introduces each newcomer to everyone already here.
      if (bus.status.startsWith('hosting')) conn.send({ sys: 'mesh', ids: [...conns.keys()].filter((id) => id !== conn.peer) });
    });
    conn.on('data', (d) => deliver(d, conn.peer));
    conn.on('close', () => conns.delete(conn.peer));
    conn.on('error', () => conns.delete(conn.peer));
  };
  const open = (id: string) => { if (peer) attach(peer.connect(id, { reliable: false, serialization: 'json' })); };

  const start = (id?: string) => new Promise<Peer>((resolve, reject) => {
    const p = id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 });
    p.on('open', () => resolve(p));
    p.on('connection', attach);
    p.on('error', (e: { type?: string; message?: string }) => reject(e));
  });

  const bus: RtcBus = {
    kind: 'webrtc',
    get self() { return peer?.id ?? 'pending'; },
    status: 'idle',
    code: '',
    emit: (topic, data) => { for (const c of conns.values()) if (c.open) { try { c.send({ t: topic, d: data }); } catch { /* dropped: rollback resends */ } } },
    on: (topic, fn) => { handlers.set(topic, [...(handlers.get(topic) ?? []), fn]); },
    peerCount: () => conns.size,
    async createRoom() {
      bus.status = 'connecting';
      for (let tries = 0; tries < 5; tries++) {
        const code = newCode();
        try {
          peer = await start(PREFIX + code);
          bus.code = code; bus.status = `hosting ${code}`;
          return code;
        } catch (e) {
          if ((e as { type?: string }).type !== 'unavailable-id') { bus.status = `Couldn't reach the signalling server (${(e as Error).message ?? e}).`; throw e; }
        }
      }
      bus.status = 'No free room code; try again.';
      throw new Error('no free code');
    },
    async joinRoom(code) {
      const c = code.trim().toUpperCase();
      bus.status = 'connecting';
      try { peer = await start(); } catch (e) { bus.status = `Couldn't reach the signalling server (${(e as Error).message ?? e}).`; throw e; }
      peer.on('error', (e: { type?: string }) => { if (e.type === 'peer-unavailable') bus.status = `No room ${c}. Check the code.`; });
      bus.code = c; bus.status = `joined ${c}`;
      open(PREFIX + c);
    },
  };
  return bus;
}
