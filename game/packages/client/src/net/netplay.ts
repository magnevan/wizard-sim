/**
 * Online co-op: a lobby on the bus, then a lockstep session over it.
 *
 * Lobby (topic "lobby"):
 *   host   {t: "host", match, name, version, tuning, room, players: [peer...]}  every 1.5 s while open
 *   join   {t: "join", match, version, tuning}   a page asks to join; the host adds it (up to 4)
 *   start  {t: "start", match, seed, room, delay, players}   sent a few times; seats follow the players order
 * In a match (topic "ls"): {m: match, f: seat, d: base64 packet} from LockstepSession's broadcast mode.
 *
 * Everyone must run the same build and the same tuning (tuningHash), or the worlds drift apart, so
 * a join is refused on a mismatch. The panel shows ping-free numbers that matter: input delay,
 * stalls, desyncs.
 */
import { RollbackSession, type Transport } from '@wizard-sim/net';
import { createWorld, hex, restore, snapshot, tuningHash, type World } from '@wizard-sim/sim';
import { fromB64, toB64, type Bus } from './bus';
import type { RtcBus } from './webrtc';

/** Bump when the sim or the protocol changes in a way that breaks lockstep between builds. */
export const NET_VERSION = 1;
/** Input delay in ticks with rollback: tiny (your own actions are instant); the rest is predicted and corrected. */
export const NET_DELAY = 2;
/** How far rollback may rewind (1 s): past that, a peer waits for the slowest. */
const ROLLBACK_WINDOW = 60;
/** How often each peer sends (the room allows about 40 messages a second per sender; pings share it). */
const FLUSH_MS = 33;
const PING_MS = 1000;

interface HostMsg { t: 'host'; match: string; name: string; version: number; tuning: number; room: string; players: string[] }
interface JoinMsg { t: 'join'; match: string; version: number; tuning: number }
interface StartMsg { t: 'start'; match: string; seed: number; room: string; delay: number; players: string[] }
type LobbyMsg = HostMsg | JoinMsg | StartMsg;

/** Text from other pages goes into HTML: escape it. */
const esc = (v: unknown): string => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** The transport the session sees: seats instead of peers, base64 over the bus. */
function busTransport(bus: Bus, match: string, self: number): Transport {
  const inbox: { from: number; data: Uint8Array }[] = [];
  bus.on('ls', (raw) => {
    const m = raw as { m?: string; f?: number; d?: string };
    if (m?.m !== match || typeof m.f !== 'number' || m.f === self || typeof m.d !== 'string') return;
    try { inbox.push({ from: m.f, data: fromB64(m.d) }); } catch { /* malformed: ignore */ }
  });
  const out = (data: Uint8Array) => bus.emit('ls', { m: match, f: self, d: toB64(data) });
  return { self, send: (_to, data) => out(data), broadcast: out, receive: () => inbox.splice(0) };
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

  constructor(private bus: Bus, private world: World, private room: string, private onStart: () => void) {
    bus.on('lobby', (raw, from) => this.lobby(raw as LobbyMsg, from));
    // Ping / pong between seats in a match: the round trip sets the input delay.
    bus.on('np', (raw) => {
      const m = raw as { m?: string; t?: string; f?: number; to?: number; at?: number };
      if (!this.session || m?.m !== this.match || typeof m.at !== 'number') return;
      if (m.t === 'ping' && m.f !== this.seat) this.bus.emit('np', { m: this.match, t: 'pong', to: m.f, at: m.at });
      else if (m.t === 'pong' && m.to === this.seat) this.onRtt(performance.now() - m.at);
    });
    this.el = this.buildPanel();
    setInterval(() => this.render(), 500);
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
    clearInterval(this.hostTimer);
    this.state = 'off'; this.session = null; this.match = ''; this.startMsg = null; this.message = 'Left the match.';
    this.render();
  }

  private lobby(m: LobbyMsg, from: string): void {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'host' && typeof m.match === 'string') {
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

  private begin(m: StartMsg): void {
    this.seat = m.players.indexOf(this.bus.self);
    this.players = m.players.length;
    // A fresh world, copied into the one everything already holds (same layout, so restore works).
    restore(this.world, snapshot(createWorld(m.seed, this.players, { room: m.room === 'arena' ? 'arena' : 'sanctum' })));
    const seats = m.players.map((_, i) => i);
    this.session = new RollbackSession(this.world, busTransport(this.bus, m.match, this.seat), seats, m.delay, false, ROLLBACK_WINDOW);
    this.state = 'playing';
    this.message = `Playing as seat ${this.seat + 1} of ${this.players}. Cheats and tuning changes would desync the match.`;
    // Hand the keyboard back to the game: focus left in the room-code box would swallow every key.
    if (document.activeElement && this.el.contains?.(document.activeElement)) (document.activeElement as HTMLElement).blur();
    this.onStart();
    this.render();
  }

  /** Call every frame while playing: read packets, send ours ~30 times a second, ping once a second. */
  pump(now: number): void {
    if (!this.session) return;
    this.session.poll();
    if (now - this.lastFlush >= FLUSH_MS) { this.session.flush(); this.lastFlush = now; }
    // The host repeats the start for ~10 s, in case a joiner missed it (it starts a joiner still waiting, nobody else).
    if (this.startMsg && now - this.startSent >= 1000 && this.session.tick < 600) { this.bus.emit('lobby', this.startMsg); this.startSent = now; }
    if (now - this.lastPing >= PING_MS) { this.bus.emit('np', { m: this.match, t: 'ping', f: this.seat, at: now }); this.lastPing = now; }
  }

  /** A measured round trip, smoothed. */
  private onRtt(ms: number): void {
    // With rollback the delay stays small; the round trip is shown, and decides how often we rewind.
    this.rtt = this.rtt ? this.rtt * 0.8 + ms * 0.2 : ms;
  }

  /** The debug line's network part. */
  flags(): string {
    if (!this.session) return this.state === 'off' ? '' : `  net ${this.state}`;
    const s = this.session;
    return `  net seat ${this.seat + 1}/${this.players} rtt ${Math.round(this.rtt)}ms rollback replays ${s.replayed}t waited ${s.waitedTicks}t${s.desyncs.length ? `  DESYNC at tick ${s.desyncs[0].tick}` : ''}`;
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
    if (this.state === 'off' && this.bus.kind === 'webrtc') {
      const rtc = this.bus as RtcBus;
      const idle = rtc.status === 'idle' || !/^(hosting|joined|connecting)/.test(rtc.status);
      body = idle
        ? `<div style="color:#a8a3bb">Play over a direct connection (WebRTC).</div>${btn('rtc-create', 'Create room')}<div><input id="rtc-code" maxlength="4" placeholder="CODE" style="font:inherit;width:5em;text-transform:uppercase;background:#0d0b14;color:inherit;border:1px solid #3c3552;border-radius:4px;padding:2px 5px" /> ${btn('rtc-join', 'Join')}</div>${idle && rtc.status !== 'idle' ? `<div style="color:#e69191">${esc(rtc.status)}</div>` : ''}`
        : `<div>${esc(rtc.status)}${rtc.code ? ` · room <b style="color:#f2c44a;letter-spacing:.1em">${esc(rtc.code)}</b>` : ''}</div><div style="color:#a8a3bb">Connected to ${rtc.peerCount()} · waiting for the host</div>`;
    } else if (this.state === 'off') {
      const list = [...this.open.values()].map((h) => `<div>${esc(h.name)} · ${Array.isArray(h.players) ? h.players.length : '?'}/4 · ${esc(h.room)} ${btn('join', 'Join', `data-match="${esc(h.match)}"`)}</div>`).join('');
      body = `<div style="color:#a8a3bb">Play with ${via}.</div>${btn('host', 'Host a match')}${list || '<div style="color:#6f6a85">No open matches yet.</div>'}`;
    } else if (this.state === 'hosting') {
      const code = this.bus.kind === 'webrtc' ? (this.bus as RtcBus).code : '';
      body = `${code ? `<div>Room <b style="color:#f2c44a;font-size:15px;letter-spacing:.15em">${esc(code)}</b> · tell your friend the code</div>` : ''}<div>Hosting · ${this.joinedPlayers.length}/4 joined</div>${btn('start', 'Start')}${btn('leave', 'Cancel')}`;
    } else if (this.state === 'joining') {
      body = `<div>Joined · waiting for the host to start (${this.joinedPlayers.length} in)</div>${btn('leave', 'Leave')}`;
    } else {
      const s = this.session!;
      body = `<div>Seat ${this.seat + 1} of ${this.players} · round trip ${this.rtt ? Math.round(this.rtt) + ' ms' : '…'} · waited ${(s.waitedTicks / 60).toFixed(1)} s · rewound ${s.replayed} ticks</div>${s.desyncs.length ? `<div style="color:#e69191">Desync at tick ${s.desyncs[0].tick}</div>` : ''}${btn('leave', 'Leave')}`;
    }
    this.el.innerHTML = `${btn('toggle', 'Co-op ▾')}${body}${this.message ? `<div style="color:#e6c36a">${esc(this.message)}</div>` : ''}`;
  }
}
