/**
 * Online co-op: a lobby on the bus, then a rollback session over it.
 *
 * Lobby (topic "lobby"):
 *   host   {t: "host", match, name, version, tuning, room, players: [peer...], rejoin?}  every 1.5 s
 *          while open, and during a match with an empty seat (rejoin: true)
 *   join   {t: "join", match, version, tuning}   a page asks to join; the host adds it (up to 4)
 *   start  {t: "start", match, seed, room, delay, players}   sent a few times; seats follow the players order
 * In a match (topic "ls"): {m: match, f: seat, d: base64 packet} from LockstepSession's broadcast mode.
 *
 * Drop-out and rejoin (topic "nc", every message carries m: match):
 *   bye     {f}                          a page leaving on purpose (Leave, closing the tab)
 *   lost    {f, seat, have, tail}        seat went quiet for 2.5 s (or said bye): we stopped listening,
 *                                        we hold its inputs up to `have`, and here are the last ones
 *   drop    {seat, end, tail}            the coordinator's call, once every live seat reported (or
 *                                        after a second): seat is gone from `end`, the highest tick
 *                                        anyone held, so nobody needs to forget an input
 *   rejoin  {peer, version, tuning}      a page asks for an empty seat
 *   resume  {seat, at, since, peer}      the coordinator gives it: that seat plays again from `at`
 *   welcome {to, seat, at, players, room, delay, tick, snap, inputs, gone}   the world for the newcomer
 * The coordinator is the lowest seat still playing, so it changes by itself when the host leaves.
 *
 * Everyone must run the same build and the same tuning (tuningHash), or the worlds drift apart, so
 * a join is refused on a mismatch.
 */
import { RollbackSession, type Gone, type Handover, type Transport } from '@wizard-sim/net';
import { createWorld, hex, replaceWorld, tuningHash, type Room, type Snapshot, type World } from '@wizard-sim/sim';

const roomOf = (r: string): Room => (r === 'arena' || r === 'survive' ? r : 'sanctum');
import { fromB64, toB64, type Bus } from './bus';
import { LinkSim, PRESETS } from './linksim';
import type { RtcBus } from './webrtc';

/** Bump when the sim or the protocol changes in a way that breaks lockstep between builds. */
export const NET_VERSION = 2;
/** Input delay in ticks with rollback: tiny (your own actions are instant); the rest is predicted and corrected. */
export const NET_DELAY = 2;
/** How far rollback may rewind (1 s): past that, a peer waits for the slowest. */
const ROLLBACK_WINDOW = 60;
/** How often each peer sends (the room allows about 40 messages a second per sender; pings share it). */
const FLUSH_MS = 33;
const PING_MS = 1000;
/** A seat we hear nothing from for this long is dropped. */
const SILENT_MS = 2500;
/** The coordinator decides a drop once every live seat has reported, or this long after the first report. */
const DECIDE_MS = 1000;
/** A newcomer's seat starts this many ticks after the coordinator's present, so the news reaches everyone first. */
const RESUME_AHEAD = 45;

interface HostMsg { t: 'host'; match: string; name: string; version: number; tuning: number; room: string; players: string[]; rejoin?: boolean }
interface JoinMsg { t: 'join'; match: string; version: number; tuning: number }
interface StartMsg { t: 'start'; match: string; seed: number; room: string; delay: number; players: string[] }
type LobbyMsg = HostMsg | JoinMsg | StartMsg;

interface Welcome { t: 'welcome'; m: string; to: string; seat: number; at: number; players: string[]; room: string; delay: number; tick: number; snap: string; inputs: string; gone: (Gone | null)[] }
type Control =
  | { t: 'bye'; m: string; f: number }
  | { t: 'lost'; m: string; f: number; seat: number; have: number; tail: string }
  | { t: 'drop'; m: string; seat: number; end: number; tail: string }
  | { t: 'rejoin'; m: string; peer: string; version: number; tuning: number }
  | { t: 'resume'; m: string; seat: number; at: number; since: number; peer: string }
  | Welcome;

/** A transport whose seat is set once it's known (a rejoining page learns it from the welcome). */
type SeatTransport = Omit<Transport, 'self'> & { self: number };

/** Text from other pages goes into HTML: escape it. */
const esc = (v: unknown): string => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** A snapshot as one gzipped blob (88 KB of mostly zeros becomes a few KB), and back. */
async function packSnap(s: Snapshot): Promise<string> {
  const head = new Uint32Array(1 + s.length);
  head[0] = s.length; s.forEach((b, i) => { head[1 + i] = b.byteLength; });
  const blob = new Blob([head, ...s] as BlobPart[]).stream().pipeThrough(new CompressionStream('gzip'));
  return toB64(new Uint8Array(await new Response(blob).arrayBuffer()));
}
async function unpackSnap(b64: string): Promise<Snapshot> {
  const stream = new Blob([fromB64(b64)] as BlobPart[]).stream().pipeThrough(new DecompressionStream('gzip'));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer());
  const n = new DataView(raw.buffer).getUint32(0, true);
  const out: Snapshot = [];
  let o = 4 + n * 4;
  for (let i = 0; i < n; i++) { const len = new DataView(raw.buffer).getUint32(4 + i * 4, true); out.push(raw.slice(o, o + len)); o += len; }
  return out;
}

/** The transport the session sees: seats instead of peers, base64 over the bus, through the link simulator. */
function busTransport(bus: Bus, match: string, link: LinkSim, heard: (seat: number) => void): SeatTransport {
  const inbox: { from: number; data: Uint8Array }[] = [];
  const t = {
    self: -1,
    send: (_to: number, data: Uint8Array) => out(data),
    broadcast: (data: Uint8Array) => out(data),
    receive: () => inbox.splice(0),
  };
  bus.on('ls', (raw) => {
    const m = raw as { m?: string; f?: number; d?: string };
    if (m?.m !== match || typeof m.f !== 'number' || m.f === t.self || typeof m.d !== 'string') return;
    const f = m.f, d = m.d;
    link.pass(() => { try { inbox.push({ from: f, data: fromB64(d) }); heard(f); } catch { /* malformed: ignore */ } });
  });
  const out = (data: Uint8Array) => { const d = toB64(data); link.pass(() => bus.emit('ls', { m: match, f: t.self, d })); };
  return t;
}

export type NetState = 'off' | 'hosting' | 'joining' | 'playing';

export class NetPlay {
  state: NetState = 'off';
  session: RollbackSession | null = null;
  seat = 0;
  players = 1;
  match = '';
  /** Matches others are hosting, by match id, with when we last heard of them. */
  private open = new Map<string, HostMsg & { seen: number }>();
  private hostTimer = 0;
  private lastFlush = 0;
  private joinedPlayers: string[] = [];
  message = '';
  private el: HTMLElement;
  /** Round trip to the slowest peer, smoothed, in ms (0 until measured). */
  rtt = 0;
  private lastPing = 0;
  /** WebRTC: after joining a room by code, join its host's match as soon as we hear it. */
  private autoJoin = false;
  /** The host repeats its start message for the first seconds of a match, in case one was lost. */
  private startMsg: StartMsg | null = null;
  private startSent = 0;
  /** The pretend slow link (tuning panel, Network test). */
  readonly link = new LinkSim();
  /** The input delay this page asks for, in ticks (the panel can change it mid-match). */
  inputDelay = NET_DELAY;
  /** The clock pump() was last called with (ms). Everything timed in a match uses it. */
  private now = 0;
  /** When we last heard each seat, on that clock (unset until the first pump of a match). */
  private heard: number[] = [];
  /** Drops being agreed: seat -> reports by reporting seat, and when the first came in. */
  private reports = new Map<number, { first: number; by: Map<number, { have: number; tail: string }> }>();
  private lastReport = 0;
  /** Rejoining a match: its transport (created early, so no packet is missed), and when we last asked. */
  private rejoin: { match: string; transport: SeatTransport; asked: number } | null = null;
  private transport: (SeatTransport) | null = null;
  private lastAnnounce = 0;
  /** Stats for the Network test section. */
  private stat = { at: 0, replayed: 0, rewindsPerS: 0 };

  constructor(private bus: Bus, private world: World, private room: string, private onStart: () => void) {
    bus.on('lobby', (raw, from) => this.lobby(raw as LobbyMsg, from));
    // Ping / pong between seats in a match: the round trip shown in the panel.
    bus.on('np', (raw) => {
      const m = raw as { m?: string; t?: string; f?: number; to?: number; at?: number };
      if (!this.session || m?.m !== this.match || typeof m.at !== 'number') return;
      this.link.pass(() => {
        if (m.t === 'ping' && m.f !== this.seat) this.link.pass(() => this.bus.emit('np', { m: this.match, t: 'pong', to: m.f, at: m.at }));
        else if (m.t === 'pong' && m.to === this.seat) this.onRtt(this.now - m.at!);
      });
    });
    bus.on('nc', (raw) => { const m = raw as Control; if (m && typeof m === 'object' && typeof m.t === 'string') this.link.pass(() => void this.control(m), false); });
    // Closing the tab: tell the others at once, rather than leaving them to notice the silence.
    window.addEventListener('pagehide', () => this.sayBye());
    this.el = this.buildPanel();
    setInterval(() => {
      // A rejoin request repeats until the coordinator answers (the match loop isn't running yet).
      if (this.rejoin && this.state === 'joining' && performance.now() - this.rejoin.asked > 2000) this.sendRejoin();
      this.render();
    }, 500);
  }

  // ---- lobby ----

  host(): void {
    if (this.state !== 'off') return;
    this.match = `${this.bus.self.slice(0, 6)}${Date.now().toString(36).slice(-4)}`;
    this.state = 'hosting';
    this.joinedPlayers = [this.bus.self];
    const announce = () => {
      if (this.state !== 'hosting') return;
      this.bus.emit('lobby', { t: 'host', match: this.match, name: `Wizard ${this.bus.self.slice(0, 4)}`, version: NET_VERSION, tuning: tuningHash(), room: this.room, players: this.joinedPlayers } satisfies HostMsg);
    };
    announce();
    this.hostTimer = window.setInterval(announce, 1500);
    this.render();
  }

  join(match: string): void {
    const h = this.open.get(match);
    if (!h || this.state !== 'off') return;
    if (h.version !== NET_VERSION) { this.message = 'That host runs a different build.'; this.render(); return; }
    if (h.tuning !== tuningHash()) { this.message = `Tunings differ (host ${hex(h.tuning)}, you ${hex(tuningHash())}). Import the host's tuning or both reset.`; this.render(); return; }
    if (h.rejoin) { this.askRejoin(match); return; }
    this.match = match; this.state = 'joining';
    this.bus.emit('lobby', { t: 'join', match, version: NET_VERSION, tuning: tuningHash() } satisfies JoinMsg);
    this.render();
  }

  /** The host starts the match for everyone who joined. */
  start(): void {
    if (this.state !== 'hosting') return;
    clearInterval(this.hostTimer);
    const msg: StartMsg = { t: 'start', match: this.match, seed: (Date.now() & 0x7fffffff) >>> 0, room: this.room, delay: NET_DELAY, players: this.joinedPlayers };
    // The room can drop a moment; say it a few times.
    for (const ms of [0, 250, 600, 1200]) setTimeout(() => this.bus.emit('lobby', msg), ms);
    this.startMsg = msg;
    this.begin(msg);
  }

  leave(): void {
    this.sayBye();
    clearInterval(this.hostTimer);
    this.state = 'off'; this.session = null; this.match = ''; this.startMsg = null; this.rejoin = null; this.transport = null; this.reports.clear();
    this.message = 'Left the match.';
    this.render();
  }

  private sayBye(): void {
    if (this.session) this.bus.emit('nc', { t: 'bye', m: this.match, f: this.seat } satisfies Control);
  }

  private lobby(m: LobbyMsg, from: string): void {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'host' && typeof m.match === 'string') {
      if (m.match === this.match && this.state === 'playing') return; // our own match's rejoin call
      this.open.set(m.match, { ...m, seen: Date.now() });
      // A joiner waiting on this host sees itself in the list once accepted.
      if (this.state === 'joining' && m.match === this.match && Array.isArray(m.players)) this.joinedPlayers = m.players.slice(0, 4);
      if (this.autoJoin && this.state === 'off') { this.autoJoin = false; this.join(m.match); }
      this.render();
    } else if (m.t === 'join' && this.state === 'hosting' && m.match === this.match) {
      if (m.version !== NET_VERSION || m.tuning !== tuningHash() || this.joinedPlayers.length >= 4 || this.joinedPlayers.includes(from)) return;
      this.joinedPlayers.push(from);
      this.render();
    } else if (m.t === 'start' && this.state === 'joining' && m.match === this.match && Array.isArray(m.players) && m.players.includes(this.bus.self)) {
      this.begin(m);
    }
  }

  private newTransport(match: string): SeatTransport {
    return busTransport(this.bus, match, this.link, (f) => { if (this.heard[f] !== undefined) this.heard[f] = Math.max(this.heard[f], this.now); });
  }

  private begin(m: StartMsg): void {
    this.seat = m.players.indexOf(this.bus.self);
    this.players = m.players.length;
    this.joinedPlayers = m.players.slice();
    // A fresh world, put into the one everything already holds (a copy; or, from or to Survive, its pools swapped in).
    replaceWorld(this.world, createWorld(m.seed, this.players, { room: roomOf(m.room) }));
    const seats = m.players.map((_, i) => i);
    this.transport = this.newTransport(m.match);
    this.transport.self = this.seat;
    this.session = new RollbackSession(this.world, this.transport, seats, m.delay, false, ROLLBACK_WINDOW);
    this.session.delay = this.inputDelay;
    this.playing(`Playing as seat ${this.seat + 1} of ${this.players}. Cheats and tuning changes would desync the match.`);
  }

  private playing(message: string): void {
    this.state = 'playing';
    this.heard = [];
    this.message = message;
    // Hand the keyboard back to the game: focus left in the room-code box would swallow every key.
    if (document.activeElement && this.el.contains?.(document.activeElement)) (document.activeElement as HTMLElement).blur();
    this.onStart();
    this.render();
  }

  // ---- drop-out and rejoin ----

  /** The lowest seat still playing (from this page's view) speaks for everyone. */
  private coordinator(): number {
    const s = this.session!;
    for (let p = 0; p < this.players; p++) if (!s.isOut(p)) return p;
    return this.seat;
  }

  /** Stop listening to a quiet seat and report what we hold of it. */
  private lose(p: number): void {
    const s = this.session!;
    if (!this.reports.has(p)) this.reports.set(p, { first: this.now, by: new Map() });
    s.mute(p);
    this.report(p);
  }

  private report(p: number): void {
    const s = this.session!;
    const have = s.heldFrom(p);
    const tail = toB64(s.inputsOf(p, Math.max(0, have - 64), have));
    this.reports.get(p)!.by.set(this.seat, { have, tail });
    this.bus.emit('nc', { t: 'lost', m: this.match, f: this.seat, seat: p, have, tail } satisfies Control);
  }

  private async control(m: Control): Promise<void> {
    if (m.m !== this.match && !(m.t === 'welcome' && this.rejoin?.match === m.m)) return;
    const s = this.session;
    if (m.t === 'welcome') { if (m.to === this.bus.self && this.rejoin) await this.welcomed(m); return; }
    if (!s || this.state !== 'playing') return;
    if (m.t === 'bye' && m.f !== this.seat && !s.isOut(m.f)) this.lose(m.f);
    else if (m.t === 'lost' && m.seat !== this.seat) {
      if (!s.isOut(m.seat)) this.lose(m.seat); // someone else noticed first: agree
      this.reports.get(m.seat)?.by.set(m.f, { have: m.have, tail: m.tail });
    } else if (m.t === 'drop') {
      if (m.seat === this.seat) { this.dropped(); return; }
      if (s.isOut(m.seat) && s.goneSeats()[m.seat]?.until === Infinity) return; // already applied
      s.dropSeat(m.seat, m.end, fromB64(m.tail));
      this.reports.delete(m.seat);
      this.message = `Player ${m.seat + 1} disconnected. They can rejoin from the Co-op panel.`;
    } else if (m.t === 'resume') {
      if (m.seat === this.seat) return;
      s.resumeSeat(m.seat, m.at, m.since);
      this.joinedPlayers[m.seat] = m.peer;
      this.heard[m.seat] = this.now + 3000; // the newcomer needs a moment to load
      this.message = `Player ${m.seat + 1} rejoined.`;
    } else if (m.t === 'rejoin') {
      if (this.coordinator() !== this.seat || m.version !== NET_VERSION || m.tuning !== tuningHash()) return;
      await this.admit(m.peer);
    }
  }

  /** Coordinator: decide a drop once everyone still playing has reported, or after DECIDE_MS. */
  private decide(now: number): void {
    const s = this.session!;
    if (this.coordinator() !== this.seat) return;
    for (const [p, r] of this.reports) {
      const live = Array.from({ length: this.players }, (_, q) => q).filter((q) => q !== p && !s.isOut(q));
      if (!live.every((q) => r.by.has(q)) && now - r.first < DECIDE_MS) continue;
      let best = { have: -1, tail: '' };
      for (const x of r.by.values()) if (x.have > best.have) best = x;
      const msg = { t: 'drop', m: this.match, seat: p, end: best.have, tail: best.tail } satisfies Control;
      for (const ms of [0, 300, 800]) setTimeout(() => this.bus.emit('nc', msg), ms);
      s.dropSeat(p, best.have, fromB64(best.tail));
      this.reports.delete(p);
      this.message = `Player ${p + 1} disconnected. They can rejoin from the Co-op panel.`;
    }
  }

  /** We were dropped (our link went quiet too long): back to the lobby, where Rejoin waits. */
  private dropped(): void {
    clearInterval(this.hostTimer);
    this.state = 'off'; this.session = null; this.transport = null; this.reports.clear();
    this.message = 'Your connection dropped and the match went on without you. Rejoin it below.';
    this.match = '';
    this.render();
  }

  /** Ask the match's coordinator for an empty seat (repeated until it answers). */
  private askRejoin(match: string): void {
    this.rejoin = { match, transport: this.newTransport(match), asked: 0 };
    this.state = 'joining';
    this.message = 'Rejoining…';
    this.sendRejoin();
    this.render();
  }

  private sendRejoin(): void {
    if (!this.rejoin) return;
    this.rejoin.asked = performance.now();
    this.bus.emit('nc', { t: 'rejoin', m: this.rejoin.match, peer: this.bus.self, version: NET_VERSION, tuning: tuningHash() } satisfies Control);
  }

  /** Coordinator: give a newcomer the first empty seat, from a little ahead of now. */
  private async admit(peer: string): Promise<void> {
    const s = this.session!;
    const gone = s.goneSeats();
    let seat = this.joinedPlayers.indexOf(peer);
    if (seat < 0 || !gone[seat]) seat = gone.findIndex((g) => g?.until === Infinity);
    if (seat < 0) return;
    const at = s.tick + RESUME_AHEAD;
    s.resumeSeat(seat, at, s.tick);
    const h: Handover = s.handover();
    s.resumeSeat(seat, at, h.tick);
    this.joinedPlayers[seat] = peer;
    this.heard[seat] = this.now + 3000;
    const resume = { t: 'resume', m: this.match, seat, at, since: h.tick, peer } satisfies Control;
    for (const ms of [0, 300, 800]) setTimeout(() => this.bus.emit('nc', resume), ms);
    const welcome: Welcome = {
      t: 'welcome', m: this.match, to: peer, seat, at, players: this.joinedPlayers.slice(), room: this.room, delay: NET_DELAY,
      tick: h.tick, snap: await packSnap(h.snap), inputs: toB64(h.inputs), gone: h.gone,
    };
    this.bus.emit('nc', welcome);
    this.message = `Player ${seat + 1} is rejoining.`;
  }

  /** Newcomer: the coordinator's handover arrived; start inside the match. */
  private async welcomed(m: Welcome): Promise<void> {
    const r = this.rejoin!;
    this.rejoin = null;
    this.match = m.m; this.seat = m.seat; this.players = m.players.length; this.joinedPlayers = m.players.slice();
    this.room = m.room;
    const seats = m.players.map((_, i) => i);
    r.transport.self = m.seat;
    this.transport = r.transport;
    const snap = await unpackSnap(m.snap);
    replaceWorld(this.world, createWorld(0, this.players, { room: roomOf(m.room) })); // the snapshot's layout
    this.session = new RollbackSession(this.world, r.transport, seats, m.delay, false, ROLLBACK_WINDOW);
    this.session.startMidway({ tick: m.tick, snap, inputs: fromB64(m.inputs), gone: m.gone }, m.at);
    this.session.delay = this.inputDelay;
    this.playing(`Rejoined as seat ${this.seat + 1} of ${this.players}.`);
  }

  /** Call every frame while playing: read packets, send ours ~30 times a second, ping once a second. */
  pump(now: number): void {
    this.now = now;
    const s = this.session;
    if (!s) return;
    for (let p = 0; p < this.players; p++) this.heard[p] ??= now;
    s.poll();
    if (now - this.lastFlush >= FLUSH_MS) { s.flush(); this.lastFlush = now; }
    // The host repeats the start for ~10 s, in case a joiner missed it (it starts a joiner still waiting, nobody else).
    if (this.startMsg && now - this.startSent >= 1000 && s.tick < 600) { this.bus.emit('lobby', this.startMsg); this.startSent = now; }
    if (now - this.lastPing >= PING_MS) { this.link.pass(() => this.bus.emit('np', { m: this.match, t: 'ping', f: this.seat, at: now })); this.lastPing = now; }
    // Quiet seats: stop listening, report, and (coordinator) decide.
    for (let p = 0; p < this.players; p++) if (p !== this.seat && !s.isOut(p) && now - this.heard[p] > SILENT_MS) this.lose(p);
    if (this.reports.size && now - this.lastReport > 500) { this.lastReport = now; for (const p of this.reports.keys()) this.report(p); }
    this.decide(now);
    // An empty seat: say so in the lobby, so a dropped player (or anyone) can take it.
    if (this.coordinator() === this.seat && s.goneSeats().some((g) => g?.until === Infinity) && now - this.lastAnnounce > 1500) {
      this.lastAnnounce = now;
      this.bus.emit('lobby', { t: 'host', match: this.match, name: `Wizard ${this.bus.self.slice(0, 4)}`, version: NET_VERSION, tuning: tuningHash(), room: this.room, players: this.joinedPlayers, rejoin: true } satisfies HostMsg);
    }
    if (now - this.stat.at >= 1000) {
      this.stat.rewindsPerS = (s.replayed - this.stat.replayed) / ((now - this.stat.at) / 1000 || 1);
      this.stat.replayed = s.replayed; this.stat.at = now;
    }
  }

  /** A measured round trip, smoothed. */
  private onRtt(ms: number): void {
    this.rtt = this.rtt ? this.rtt * 0.8 + ms * 0.2 : ms;
  }

  /** The debug line's network part. */
  flags(): string {
    if (!this.session) return this.state === 'off' ? '' : `  net ${this.state}`;
    const s = this.session;
    return `  net seat ${this.seat + 1}/${this.players} rtt ${Math.round(this.rtt)}ms rollback replays ${s.replayed}t waited ${s.waitedTicks}t${this.link.active ? ` sim +${this.link.lag}ms` : ''}${s.desyncs.length ? `  DESYNC at tick ${s.desyncs[0].tick}` : ''}`;
  }

  // ---- Network test (a section of the tuning panel) ----

  /** Fills the tuning panel's Network test section: the pretend slow link, input delay and live numbers. */
  attachDebug(body: HTMLElement): void {
    body.innerHTML = `
      <div class="tune-hint">Pretend this page is far away: lag, jitter and loss on its match traffic, both ways. Only this page changes, so set it on one window.</div>
      <div class="tune-line" data-presets></div>
      <div class="tune-row"><span class="tune-k" style="min-width:7em">Added lag</span><input type="range" min="0" max="500" step="10" data-k="lag"><span data-v="lag"></span></div>
      <div class="tune-row"><span class="tune-k" style="min-width:7em">Jitter</span><input type="range" min="0" max="200" step="5" data-k="jitter"><span data-v="jitter"></span></div>
      <div class="tune-row"><span class="tune-k" style="min-width:7em">Loss</span><input type="range" min="0" max="30" step="1" data-k="loss"><span data-v="loss"></span></div>
      <div class="tune-row" title="How far ahead your inputs are scheduled. Higher: fewer corrections of remote players, but your own actions start later."><span class="tune-k" style="min-width:7em">Input delay</span><input type="range" min="0" max="8" step="1" data-k="delay"><span data-v="delay"></span></div>
      <div class="tune-hint" data-stats></div>`;
    const presets = body.querySelector('[data-presets]')!;
    for (const p of PRESETS) {
      const b = document.createElement('button');
      b.className = 'seg'; b.textContent = p.name;
      b.addEventListener('click', () => { this.link.lag = p.lag; this.link.jitter = p.jitter; this.link.loss = p.loss; sync(); });
      presets.appendChild(b);
    }
    const inputs = [...body.querySelectorAll<HTMLInputElement>('input[data-k]')];
    const sync = () => {
      for (const i of inputs) {
        const k = i.dataset.k!;
        const v = k === 'delay' ? this.inputDelay : this.link[k as 'lag' | 'jitter' | 'loss'];
        i.value = String(v);
        body.querySelector(`[data-v="${k}"]`)!.textContent = k === 'loss' ? `${v} %` : k === 'delay' ? `${v} ticks (${Math.round((v * 1000) / 60)} ms)` : `${v} ms`;
      }
      presets.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', PRESETS[i].lag === this.link.lag && PRESETS[i].jitter === this.link.jitter && PRESETS[i].loss === this.link.loss));
    };
    for (const i of inputs) i.addEventListener('input', () => {
      const k = i.dataset.k!, v = Number(i.value);
      if (k === 'delay') { this.inputDelay = v; if (this.session) this.session.delay = v; }
      else this.link[k as 'lag' | 'jitter' | 'loss'] = v;
      sync();
    });
    sync();
    const stats = body.querySelector<HTMLElement>('[data-stats]')!;
    setInterval(() => {
      const s = this.session;
      stats.textContent = !s ? 'Not in a match: start one from the Co-op panel to see the numbers.'
        : `Round trip ${Math.round(this.rtt)} ms · rewinds ${this.stat.rewindsPerS.toFixed(0)} ticks/s · waited ${(s.waitedTicks / 60).toFixed(1)} s · behind ${Math.max(0, s.lag)} ticks`;
    }, 500);
  }

  // ---- panel ----

  private buildPanel(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'netplay';
    el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:20;font:12px/1.4 ui-monospace,Consolas,monospace;color:#ecebf2;background:rgba(13,11,20,.88);border:1px solid #3c3552;border-radius:6px;padding:6px 8px;max-width:300px;';
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    // Typing a room code must not queue elements or cast; Enter joins.
    el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') (el.querySelector('[data-act="rtc-join"]') as HTMLElement | null)?.click(); });
    el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const a = t.dataset.act;
      if (a === 'host') this.host();
      else if (a === 'start') this.start();
      else if (a === 'leave') this.leave();
      else if (a === 'join' && t.dataset.match) this.join(t.dataset.match);
      else if (a === 'rtc-create') void (this.bus as RtcBus).createRoom().then(() => this.host()).catch(() => {}).finally(() => this.render());
      else if (a === 'rtc-join') {
        const code = (el.querySelector('#rtc-code') as HTMLInputElement | null)?.value ?? '';
        if (code.trim()) {
          this.autoJoin = true;
          (document.activeElement as HTMLElement | null)?.blur(); // give the keyboard back to the game
          void (this.bus as RtcBus).joinRoom(code).catch(() => {}).finally(() => this.render());
        }
      }
      else if (a === 'toggle') { el.dataset.open = el.dataset.open === '1' ? '' : '1'; this.render(); }
    });
    document.body.appendChild(el);
    return el;
  }

  private render(): void {
    if ((document.activeElement as HTMLElement | null)?.id === 'rtc-code') return; // don't wipe what's being typed
    const now = Date.now();
    for (const [k, v] of this.open) if (now - v.seen > 5000 || k === this.match && this.state === 'hosting') this.open.delete(k);
    const btn = (act: string, label: string, extra = '') => `<button data-act="${act}" ${extra} style="font:inherit;color:inherit;background:#1f1b2e;border:1px solid #3c3552;border-radius:4px;padding:2px 7px;margin:2px 4px 2px 0;cursor:pointer">${label}</button>`;
    const via = this.bus.kind === 'room' ? 'everyone with this page open' : 'other tabs on this machine';
    let body = '';
    if (this.el.dataset.open !== '1') { this.el.innerHTML = btn('toggle', this.state === 'playing' ? `Online: seat ${this.seat + 1}/${this.players}` : 'Co-op online'); return; }
    const list = () => [...this.open.values()].map((h) => `<div>${esc(h.name)} · ${Array.isArray(h.players) ? h.players.length : '?'}/4 · ${esc(h.room)} ${btn('join', h.rejoin ? 'Rejoin' : 'Join', `data-match="${esc(h.match)}"`)}</div>`).join('');
    if (this.state === 'off' && this.bus.kind === 'webrtc') {
      const rtc = this.bus as RtcBus;
      const idle = rtc.status === 'idle' || !/^(hosting|joined|connecting)/.test(rtc.status);
      body = idle
        ? `<div style="color:#a8a3bb">Play over a direct connection (WebRTC).</div>${btn('rtc-create', 'Create room')}<div><input id="rtc-code" maxlength="4" placeholder="CODE" style="font:inherit;width:5em;text-transform:uppercase;background:#0d0b14;color:inherit;border:1px solid #3c3552;border-radius:4px;padding:2px 5px" /> ${btn('rtc-join', 'Join')}</div>${idle && rtc.status !== 'idle' ? `<div style="color:#e69191">${esc(rtc.status)}</div>` : ''}`
        : `<div>${esc(rtc.status)}${rtc.code ? ` · room <b style="color:#f2c44a;letter-spacing:.1em">${esc(rtc.code)}</b>` : ''}</div>${list() || `<div style="color:#a8a3bb">Connected to ${rtc.peerCount()} · waiting for the host</div>`}`;
    } else if (this.state === 'off') {
      body = `<div style="color:#a8a3bb">Play with ${via}.</div>${btn('host', 'Host a match')}${list() || '<div style="color:#6f6a85">No open matches yet.</div>'}`;
    } else if (this.state === 'hosting') {
      const code = this.bus.kind === 'webrtc' ? (this.bus as RtcBus).code : '';
      body = `${code ? `<div>Room <b style="color:#f2c44a;font-size:15px;letter-spacing:.15em">${esc(code)}</b> · tell your friend the code</div>` : ''}<div>Hosting · ${this.joinedPlayers.length}/4 joined</div>${btn('start', 'Start')}${btn('leave', 'Cancel')}`;
    } else if (this.state === 'joining') {
      body = this.rejoin ? `<div>Rejoining · waiting for the match</div>${btn('leave', 'Cancel')}` : `<div>Joined · waiting for the host to start (${this.joinedPlayers.length} in)</div>${btn('leave', 'Leave')}`;
    } else {
      const s = this.session!;
      const seats = Array.from({ length: this.players }, (_, p) => {
        const st = p === this.seat ? 'you' : s.isGone(s.tick, p) ? '<span style="color:#e69191">disconnected</span>' : s.isOut(p) ? '<span style="color:#e6c36a">not responding</span>' : 'here';
        return `P${p + 1} ${st}`;
      }).join(' · ');
      body = `<div>${seats}</div><div>Round trip ${this.rtt ? Math.round(this.rtt) + ' ms' : '…'}${this.link.active ? ` <span style="color:#e6c36a">(+${this.link.lag} ms simulated)</span>` : ''} · waited ${(s.waitedTicks / 60).toFixed(1)} s · rewound ${s.replayed} ticks</div>${s.desyncs.length ? `<div style="color:#e69191">Desync at tick ${s.desyncs[0].tick}</div>` : ''}<div style="color:#6f6a85">Simulate a slow link: F1 → Network test</div>${btn('leave', 'Leave')}`;
    }
    this.el.innerHTML = `${btn('toggle', 'Co-op ▾')}${body}${this.message ? `<div style="color:#e6c36a">${esc(this.message)}</div>` : ''}`;
  }
}
