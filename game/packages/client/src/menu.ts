/**
 * The Esc menu: Resume, Scenarios, Multiplayer, Controls and Settings, drawn like the rune HUD
 * (art pixels in a small canvas, the 3x5 font, shown at the HUD's integer scale).
 *
 * Esc clears the queue if it holds runes, and otherwise opens the menu; Esc in the menu closes it
 * (menu-nav.ts escAction). Start (Options) on any gamepad opens and closes it too. In the menu:
 * arrows or WASD, Enter or Space, Backspace back; the mouse hovers and clicks; a pad moves with the
 * D-pad or left stick, A selects, B goes back.
 *
 * Offline the menu pauses the sim (main.ts asks `pausing`). Online the match keeps running and the
 * menu says so; your wizard stands still while it's open (the keyboard is let go on open).
 *
 * The Multiplayer section drives the same lobby as the Co-op panel (net/netplay.ts), through its
 * lobbyView() and its host / join / start / leave calls; nothing about the netcode lives here.
 */
import { SCENARIOS, isPlayable, type Scenario } from './scenarios';
import { escAction, keyToNav, menuScenarioKey, navigate, padMenuKeys, type NavItem, type NavKey, type NavState } from './menu-nav';
import { readPad, type PadState } from './gamepad';
import type { LobbyView, NetPlay } from './net/netplay';
import * as X from './art/px';

/** What the menu needs from the game (main.ts fills it in). */
export interface MenuHost {
  /** Runes in the local player's queue (Esc clears those first). */
  queued(): number;
  net: NetPlay | null;
  scenario(): Scenario;
  switchScenario(s: Scenario): void;
  settings: Setting[];
  /** The menu opened or closed (let go of the keyboard; pads forget the presses made in it). */
  onToggle(open: boolean): void;
}

export interface Setting { label: string; blurb: string; value(): string; adjust(by: -1 | 1): void }

const SECTIONS = ['Resume', 'Scenarios', 'Multiplayer', 'Controls', 'Settings'] as const;
type Section = typeof SECTIONS[number];

/** Glyphs the menu's text needs that the HUD's font lacks (added only if missing). */
const EXTRA: Record<string, string> = {
  '?': '110001010000010', "'": '010010000000000', '`': '100010000000000', '>': '100010001010100', '<': '001010100010001',
  ';': '000010000010100', '=': '000111000111000', '#': '101111101111101', '"': '101101000000000', '·': '000000010000000',
};
for (const [k, g] of Object.entries(EXTRA)) X.FONT[k] ??= g;
const clean = (s: string): string => [...s.toUpperCase()].map((ch) => (X.FONT[ch] ? ch : ch === '…' ? '...' : ' ')).join('');

const COL = {
  edge: '#0a0810', fill: '#1a1726', line: '#3c3552', sel: '#2a2440', text: '#cfc9e6', bright: '#ffffff', sub: '#8a8498',
  dim: '#6a6484', off: '#4a4560', gold: '#ffd860', warn: '#e6c36a', bad: '#ff6a6a', good: '#8ee070',
} as const;

/** The key reference (docs/current-state.md, Controls; gamepad.ts). Header rows have no key. */
const CONTROLS: [string, string][] = [
  ['', 'Runes'],
  ['Q W E R', 'Water Life Shield Cold'],
  ['A S D F G', 'Lightning Arcane Sigil Fire Earth'],
  ['Esc', 'Clear the queue (empty: this menu)'],
  ['', 'Casting (runes queued)'],
  ['Hold LMB', 'Walk toward the cursor'],
  ['RMB', 'Force (hold to channel or charge)'],
  ['Shift+RMB', 'Area; hold for Place, drag to draw'],
  ['Space', 'Self'],
  ['Shift+LMB', 'Weapon'],
  ['', 'Your hands (nothing queued)'],
  ['RMB', 'Strike; hold for the Heavy'],
  ['Shift+RMB', 'Special (some are held)'],
  ['Shift+LMB', 'Retreat (or a hop)'],
  ['Space', 'Defend: hold to block, tap to parry'],
  ['', 'Gamepad'],
  ['Sticks', 'Left walk, right aim'],
  ['A B X Y', 'Water Life Shield Cold'],
  ['LB + A B X Y', 'Lightning Arcane Sigil Fire'],
  ['LB+RB, D-down', 'Earth'],
  ['RT / LT / RB', 'Force / Area, Place / Self'],
  ['LB + RT', 'Weapon'],
  ['Back / Start', 'Clear / this menu'],
  ['D-up', 'Help panel'],
  ['', 'Other'],
  ['1 2 3 4', 'Sanctum, Arena, Survive, Tutorial'],
  ['F1 / F2', 'Tuning panel / help'],
  ['Hold Alt', 'Inspect what is under the cursor'],
  ['`', 'Debug line'],
];

interface Item extends NavItem {
  label: string;
  /** Right-aligned tag (HERE, COMING SOON, a setting's value). */
  tag?: string;
  tagCol?: string;
  blurb?: string;
  act?: () => void;
  adjust?: (by: -1 | 1) => void;
  /** The room-code field: letters typed go into it. */
  field?: boolean;
}
/** A section's content: lines of text and items, top to bottom. */
type Block = { text: string; col: string; k?: number } | { item: Item };

const LETTERS = /^[A-Z2-9]$/;

export class EscMenu {
  open = false;
  private nav: NavState = { section: 0, focus: 'tabs', item: 0 };
  private cvs: HTMLCanvasElement;
  private cx: X.Ctx;
  private k = 2;
  private W = 0;
  private H = 0;
  private dirty = true;
  private lastDraw = 0;
  private code = '';
  private pads: (PadState | null)[] = [null, null, null, null];
  /** Hit boxes from the last draw, in art pixels. */
  private hits: { x: number; y: number; w: number; h: number; tab?: number; item?: number }[] = [];
  private panel = { x: 0, y: 0, w: 0, h: 0 };
  private items: Item[] = [];

  constructor(private host: MenuHost, private readPads: (i: number) => PadState | null = readPad) {
    const c = document.createElement('canvas');
    c.id = 'esc-menu';
    c.style.cssText = 'position:fixed;left:0;top:0;z-index:30;display:none;image-rendering:pixelated;cursor:default;';
    document.body.appendChild(c);
    this.cvs = c;
    this.cx = c.getContext('2d') as X.Ctx;
    // Capture phase on window: the menu sees keys before the game (input.ts) and the panels do.
    addEventListener('keydown', (e) => this.onKey(e), true);
    c.addEventListener('pointermove', (e) => this.onPointer(e, false));
    c.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.onPointer(e, true); });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('resize', () => { this.dirty = true; });
  }

  /** Offline the sim stands still while the menu is open; online it can't. */
  get pausing(): boolean { return this.open && !this.online; }
  private get online(): boolean { return this.host.net?.state === 'playing'; }

  show(section?: Section): void {
    if (section) { this.nav.section = SECTIONS.indexOf(section); this.nav.focus = 'tabs'; }
    if (this.open) { this.dirty = true; return; }
    this.open = true;
    if (!section) { this.nav = { section: 0, focus: 'tabs', item: 0 }; }
    this.cvs.style.display = 'block';
    this.dirty = true;
    this.host.onToggle(true);
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.cvs.style.display = 'none';
    this.host.onToggle(false);
  }

  toggle(): void { if (this.open) this.hide(); else this.show(); }

  /** Every frame: gamepads, and a redraw when something changed (and a few times a second for the lobby). */
  frame(now: number): void {
    for (let i = 0; i < 4; i++) {
      const cur = this.readPads(i);
      if (!cur) { this.pads[i] = null; continue; }
      const keys = padMenuKeys(this.pads[i], cur);
      this.pads[i] = cur;
      for (const key of keys) {
        if (key === 'menu') this.toggle();
        else if (this.open) this.press(key);
      }
    }
    if (!this.open) return;
    if (this.dirty || now - this.lastDraw > 250) { this.draw(now); this.lastDraw = now; this.dirty = false; }
  }

  // ---- input ----

  private onKey(e: KeyboardEvent): void {
    const stop = () => { e.stopImmediatePropagation(); e.preventDefault(); };
    if (e.code === 'Escape') {
      if (e.repeat) { if (this.open) stop(); return; }
      const a = escAction(this.open, this.host.queued());
      if (a === 'clear') return; // the game's own Esc (input.ts): refund the queue
      stop();
      if (a === 'open') this.show(); else this.hide();
      return;
    }
    if (!this.open) return;
    // The browser keeps its own keys (reload, full screen, dev tools); the game gets none while the menu is open.
    if (/^F(5|11|12)$/.test(e.code) || e.ctrlKey || e.metaKey) { e.stopImmediatePropagation(); return; }
    stop();
    const it = this.focused();
    if (it?.field) {
      const ch = e.key.length === 1 ? e.key.toUpperCase() : '';
      if (LETTERS.test(ch) && this.code.length < 4) { this.code += ch; this.dirty = true; return; }
      if (e.code === 'Backspace' && this.code) { this.code = this.code.slice(0, -1); this.dirty = true; return; }
      if (e.code === 'Enter' || e.code === 'NumpadEnter') { it.act?.(); this.dirty = true; return; }
      if (/^Key[A-Z]$/.test(e.code) || /^Digit/.test(e.code) || e.code === 'Space') return; // typing, not moving
    }
    // the number keys go where they say in the Scenarios list, as they do in the game
    const sc = menuScenarioKey(e.code, !!it?.field, this.online);
    if (sc && !e.repeat) { this.host.switchScenario(sc); this.hide(); return; }
    const key = keyToNav(e.code);
    if (key) this.press(key);
  }

  private focused(): Item | undefined { return this.nav.focus === 'items' ? this.items[this.nav.item] : undefined; }

  private press(key: NavKey): void {
    this.items = this.itemsOf(SECTIONS[this.nav.section]);
    const r = navigate(this.nav, key, SECTIONS.length, this.items);
    if (r.kind === 'close') this.hide();
    else if (r.kind === 'tab') { if (SECTIONS[this.nav.section] === 'Resume') this.hide(); }
    else if (r.kind === 'activate') this.items[r.item]?.act?.();
    else if (r.kind === 'adjust') this.items[r.item]?.adjust?.(r.by);
    this.dirty = true;
  }

  private onPointer(e: PointerEvent, click: boolean): void {
    const x = e.clientX / this.k, y = e.clientY / this.k;
    const hit = this.hits.find((h) => x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h);
    const p = this.panel;
    if (click && !hit && (x < p.x || x >= p.x + p.w || y < p.y || y >= p.y + p.h)) { this.hide(); return; } // a click beside the panel
    if (!hit) return;
    if (hit.tab !== undefined) {
      if (click) {
        this.nav.section = hit.tab; this.nav.focus = 'tabs'; this.dirty = true;
        if (SECTIONS[hit.tab] === 'Resume') this.hide();
      }
      return;
    }
    if (hit.item !== undefined) {
      const it = this.items[hit.item];
      if (!it?.enabled) return;
      if (this.nav.focus !== 'items' || this.nav.item !== hit.item) { this.nav.focus = 'items'; this.nav.item = hit.item; this.dirty = true; }
      if (click) { if (it.adjust) it.adjust(e.button === 2 ? -1 : 1); else it.act?.(); this.dirty = true; }
    }
  }

  // ---- content ----

  private itemsOf(section: Section): Item[] {
    return this.blocks(section).flatMap((b) => ('item' in b ? [b.item] : []));
  }

  private blocks(section: Section): Block[] {
    const net = this.host.net;
    if (section === 'Resume') {
      return [
        { text: this.online ? 'The game keeps running online.' : 'Paused.', col: this.online ? COL.warn : COL.gold, k: 2 },
        { text: this.online ? 'Your wizard stands still while this menu is open.' : 'Nothing moves until you come back.', col: COL.sub },
        { text: '', col: COL.sub },
        { text: 'Esc, Start or Enter on Resume to go back.', col: COL.dim },
      ];
    }
    if (section === 'Scenarios') {
      const v = net?.lobbyView();
      const here = this.host.scenario();
      const out: Block[] = [];
      if (v?.state === 'playing') out.push({ text: v.isHost ? 'Online: everyone follows you to the scenario you pick.' : 'Online: only the host picks the scenario.', col: COL.warn });
      if (v?.state === 'joining') out.push({ text: 'The host picks the scenario.', col: COL.warn });
      for (const s of SCENARIOS) {
        const ready = isPlayable(s), current = ready && s.id === here.id;
        const blocked = v?.state === 'joining' || (v?.state === 'playing' && !v.isHost);
        out.push({
          item: {
            label: s.name + (s.key && ready ? `  (${s.key})` : ''), blurb: s.blurb, enabled: ready && !blocked,
            tag: !ready ? 'COMING SOON' : current ? 'HERE - RESTART' : blocked ? 'HOST ONLY' : '',
            tagCol: !ready ? COL.off : current ? COL.good : COL.dim,
            act: () => { this.host.switchScenario(s); this.hide(); },
          },
        });
      }
      return out;
    }
    if (section === 'Multiplayer') return net ? this.lobbyBlocks(net, net.lobbyView()) : [{ text: 'Online play is not available on this page.', col: COL.sub }];
    if (section === 'Controls') return [];
    // Settings
    return this.host.settings.map((s) => ({ item: { label: s.label, blurb: s.blurb, tag: `< ${s.value()} >`, tagCol: COL.gold, enabled: true, adjustable: true, adjust: (by) => s.adjust(by), act: () => s.adjust(1) } }));
  }

  private lobbyBlocks(net: NetPlay, v: LobbyView): Block[] {
    const out: Block[] = [];
    const say = (text: string, col: string = COL.sub, k?: number) => out.push({ text, col, k });
    const item = (it: Omit<Item, 'enabled'> & { enabled?: boolean }) => out.push({ item: { enabled: true, ...it } });
    const seats = () => { if (v.seats.length) say(v.seats.map((s) => `P${s.seat + 1} ${s.status === 'you' ? 'YOU' : s.status === 'here' ? 'HERE' : s.status === 'quiet' ? 'NOT RESPONDING' : 'GONE'}`).join('   '), COL.text); };
    const code = () => { if (v.code) { say('Room code', COL.dim); say(v.code, COL.gold, 3); } };
    const matches = () => {
      for (const m of v.matches) item({ label: `${m.rejoin ? 'Rejoin' : 'Join'} ${m.name}`, tag: `${m.players}/4 ${m.room}`, tagCol: COL.dim, act: () => net.join(m.match) });
    };
    if (v.state === 'off' && v.kind === 'webrtc') {
      const busy = /^(hosting|joined|connecting)/.test(v.rtcStatus);
      if (!busy) {
        say('Play over a direct connection (WebRTC).');
        item({ label: 'Host a room', blurb: 'Opens a room with a four-letter code to tell your friends.', act: () => void net.createRoom() });
        item({ label: `Join by code: ${(this.code + '____').slice(0, 4)}`, blurb: 'Type the code, then Enter.', field: true, act: () => { if (this.code.length === 4) void net.joinCode(this.code); } });
        if (v.rtcStatus !== 'idle') say(v.rtcStatus, COL.bad);
      } else {
        say(v.rtcStatus === 'connecting' ? 'Connecting...' : `Room ${v.code} - connected to ${v.connected}${v.matches.length ? '' : ' - waiting for the host'}`, COL.text);
        matches();
      }
    } else if (v.state === 'off') {
      say(v.kind === 'room' ? 'Play with everyone who has this page open.' : 'Play with other tabs on this machine.');
      item({ label: 'Host a match', blurb: 'Others see it in their list and join.', act: () => net.host() });
      matches();
      if (!v.matches.length) say('No open matches yet.', COL.dim);
    } else if (v.state === 'hosting') {
      code();
      say(`Hosting - ${v.seats.length}/4 joined`, COL.text);
      seats();
      item({ label: 'Start the match', blurb: 'Everyone who joined starts in the scenario you picked.', act: () => net.start() });
      item({ label: 'Cancel', act: () => net.leave() });
    } else if (v.state === 'joining') {
      say(v.rejoining ? 'Rejoining - waiting for the match.' : `Joined - waiting for the host to start (${v.seats.length} in).`, COL.text);
      item({ label: v.rejoining ? 'Cancel' : 'Leave', act: () => net.leave() });
    } else {
      code();
      say(`Online - seat ${v.seat + 1}${v.isHost ? ' (host)' : ''} - round trip ${v.rtt ? v.rtt + ' ms' : '...'}`, COL.text);
      seats();
      item({ label: 'Leave the match', blurb: 'Back to playing alone. You can rejoin your seat from the lobby.', act: () => net.leave() });
    }
    if (v.message) say(v.message, COL.warn);
    return out;
  }

  // ---- drawing ----

  private draw(now: number): void {
    // The HUD's automatic scale (about 270 art px of height), whatever the scene is forced to, and narrow enough to fit.
    const sw = innerWidth, sh = innerHeight;
    let k = Math.max(1, Math.floor(sh / 270));
    while (k > 1 && sw / k < 330) k--;
    const W = Math.ceil(sw / k), H = Math.ceil(sh / k);
    if (W !== this.W || H !== this.H || k !== this.k) {
      this.W = W; this.H = H; this.k = k;
      this.cvs.width = W; this.cvs.height = H;
      this.cvs.style.width = `${W * k}px`; this.cvs.style.height = `${H * k}px`;
      this.cx.imageSmoothingEnabled = false;
    }
    const c = this.cx;
    c._fs = null;
    c.clearRect(0, 0, W, H);
    X.rect(c, 0, 0, W, H, 'rgba(8,6,14,0.62)');
    this.hits = [];
    const section = SECTIONS[this.nav.section];
    const blocks = this.blocks(section);
    this.items = blocks.flatMap((b) => ('item' in b ? [b.item] : []));
    if (this.nav.focus === 'items' && !this.items[this.nav.item]?.enabled) this.nav.focus = 'tabs';

    const pw = Math.min(W - 8, 420), ph = Math.min(H - 8, 268);
    const px0 = Math.floor((W - pw) / 2), py0 = Math.floor((H - ph) / 2);
    this.panel = { x: px0, y: py0, w: pw, h: ph };
    X.rect(c, px0 - 1, py0 - 1, pw + 2, ph + 2, COL.edge);
    X.rect(c, px0, py0, pw, ph, COL.fill);
    X.rect(c, px0, py0 + 19, pw, 1, COL.line);
    // header: the name, and whether the world stands still
    X.text(c, 'WIZARD SIM', px0 + 6, py0 + 5, COL.gold, COL.edge, 2);
    const status = this.online ? 'ONLINE - THE GAME KEEPS RUNNING' : 'PAUSED';
    const sw2 = clean(status).length * 4 - 1;
    X.text(c, clean(status), px0 + pw - 6 - sw2, py0 + 8, this.online ? COL.warn : COL.sub);

    // the tabs
    const tw = 76, tx = px0 + 4, ty0 = py0 + 25;
    SECTIONS.forEach((name, i) => {
      const y = ty0 + i * 15, on = i === this.nav.section;
      if (on) X.rect(c, tx, y, tw, 13, this.nav.focus === 'tabs' ? COL.sel : '#221d33');
      if (on && this.nav.focus === 'tabs') X.rect(c, tx, y, 2, 13, COL.gold);
      X.text(c, clean(name), tx + 6, y + 4, on ? COL.bright : COL.text);
      this.hits.push({ x: tx, y, w: tw, h: 13, tab: i });
    });
    X.rect(c, tx + tw + 4, py0 + 23, 1, ph - 23 - 14, COL.line);

    // the open section
    const cx0 = tx + tw + 10, cw = px0 + pw - 6 - cx0, cy0 = py0 + 25, cyMax = py0 + ph - 15;
    c.save();
    c.beginPath(); c.rect(cx0 - 2, cy0 - 2, cw + 4, cyMax - cy0 + 2); c.clip();
    if (section === 'Controls') this.drawControls(c, cx0, cy0, cw, cyMax);
    else {
      let y = cy0, n = 0;
      const chars = Math.max(8, Math.floor(cw / 4));
      for (const b of blocks) {
        if ('text' in b) {
          const kk = b.k ?? 1;
          for (const line of wrap(b.text, Math.floor(chars / kk))) { X.text(c, line, cx0, y, b.col, kk > 1 ? COL.edge : undefined, kk); y += 6 * kk + 2; }
          if (!b.text) y += 6;
          continue;
        }
        const it = b.item, idx = n++;
        const focus = this.nav.focus === 'items' && this.nav.item === idx;
        const blurb = it.blurb ? wrap(it.blurb, chars - 2) : [];
        const h = 11 + blurb.length * 7 + (blurb.length ? 2 : 0);
        if (focus) { X.rect(c, cx0 - 2, y, cw + 4, h, COL.sel); X.rect(c, cx0 - 2, y, 2, h, COL.gold); }
        const caret = it.field && focus && Math.floor(now / 400) % 2 === 0;
        let label = clean(it.label);
        if (it.field && caret) label = label.replace(/_/, '#');
        X.text(c, label, cx0 + 3, y + 3, !it.enabled ? COL.off : focus ? COL.bright : COL.text);
        if (it.tag) { const tg = clean(it.tag); X.text(c, tg, cx0 + cw - (tg.length * 4 - 1) - 1, y + 3, it.tagCol ?? COL.dim); }
        blurb.forEach((line, j) => X.text(c, line, cx0 + 7, y + 11 + j * 7, it.enabled ? COL.sub : COL.off));
        this.hits.push({ x: cx0 - 2, y, w: cw + 4, h, item: idx });
        y += h + 3;
      }
    }
    c.restore();

    // the footer: how to move
    X.rect(c, px0, py0 + ph - 12, pw, 1, COL.line);
    const hint = W < 330 ? 'ARROWS MOVE - ENTER SELECT - ESC CLOSE' : 'ARROWS / WASD MOVE - ENTER SELECT - BACKSPACE BACK - ESC CLOSE - PAD: D-PAD, A, B, START';
    X.text(c, clean(hint), px0 + 6, py0 + ph - 8, COL.dim);
  }

  private drawControls(c: X.Ctx, x0: number, y0: number, cw: number, yMax: number): void {
    // two columns of groups when there's room, else one
    const twoCols = cw >= 300;
    const colW = twoCols ? Math.floor((cw - 8) / 2) : cw;
    const keyW = 56;
    let x = x0, y = y0;
    const groups: [string, string][][] = [];
    for (const row of CONTROLS) { if (!row[0]) groups.push([row]); else groups[groups.length - 1].push(row); }
    const half = twoCols ? 3 : groups.length;
    groups.forEach((g, gi) => {
      if (twoCols && gi === half) { x = x0 + colW + 8; y = y0; }
      for (const [key, what] of g) {
        if (y > yMax - 6) return;
        if (!key) { X.text(c, clean(what), x, y, COL.gold); y += 9; continue; }
        X.text(c, clean(key), x, y, COL.text);
        const lines = wrap(what, Math.floor((colW - keyW) / 4));
        lines.forEach((l, j) => X.text(c, l, x + keyW, y + j * 7, COL.sub));
        y += 7 * lines.length + 1;
      }
      y += 4;
    });
  }
}

/** Word-wraps upper-cased text to lines of at most `n` characters. */
export function wrap(text: string, n: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of clean(text).split(' ')) {
    if (!word) continue;
    if (line && line.length + 1 + word.length > n) { out.push(line); line = ''; }
    line = line ? line + ' ' + word : word.length > n ? word.slice(0, n) : word;
  }
  if (line) out.push(line);
  return out.length || !text ? out : [''];
}
