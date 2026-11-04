/**
 * The thin transport the lockstep session runs on: unreliable, unordered datagrams between
 * peers (seats). WebRTC data channels ({ordered: false, maxRetransmits: 0}) for browser links,
 * Steam Networking Messages for the Steam build, and the loopback below for local play and tests
 * all fit it. Reliability is the session's job (it resends inputs until they're acknowledged).
 */
export interface Transport {
  /** This peer's seat. */
  readonly self: number;
  send(to: number, data: Uint8Array): void;
  /**
   * One message to every other peer, if the transport can (the artifact room only broadcasts).
   * The session then sends one packet for everyone instead of one per peer.
   */
  broadcast?(data: Uint8Array): void;
  /** Messages that arrived since the last call, oldest first. */
  receive(): { from: number; data: Uint8Array }[];
}

interface InFlight { at: number; from: number; to: number; data: Uint8Array }

/**
 * An in-memory network between N peers with simulated latency, jitter and loss, driven by a
 * clock the test (or the local game) advances. Its randomness is seeded, so a test is repeatable.
 */
export class LoopbackHub {
  private now = 0;
  private flight: InFlight[] = [];
  private inbox: { from: number; data: Uint8Array }[][] = [];
  private seed: number;

  constructor(readonly peers: number, readonly opts: { latency?: number; jitter?: number; loss?: number; seed?: number } = {}) {
    for (let i = 0; i < peers; i++) this.inbox.push([]);
    this.seed = opts.seed ?? 1;
  }

  private rand(): number {
    // mulberry32: test-side randomness only
    let t = (this.seed = (this.seed + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** The transport for one peer. */
  endpoint(self: number): Transport {
    return {
      self,
      send: (to, data) => {
        if (this.rand() < (this.opts.loss ?? 0)) return;
        const delay = (this.opts.latency ?? 0) + Math.floor(this.rand() * ((this.opts.jitter ?? 0) + 1));
        this.flight.push({ at: this.now + delay, from: self, to, data: data.slice() });
      },
      receive: () => this.inbox[self].splice(0),
      broadcast: (data) => { for (let to = 0; to < this.peers; to++) if (to !== self) this.endpoint(self).send(to, data); },
    };
  }

  /** Advance the network clock by one unit (one sim tick in the tests); deliver what has arrived. */
  tick(): void {
    this.now++;
    const keep: InFlight[] = [];
    for (const m of this.flight) (m.at <= this.now ? this.inbox[m.to].push({ from: m.from, data: m.data }) : keep.push(m));
    this.flight = keep;
  }
}
