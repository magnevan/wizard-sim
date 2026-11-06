/**
 * The help panel (F2, the "?" button, or D-pad up on a gamepad): it slides out on the right edge and
 * says what your queued runes will do, one row per cast gesture (RMB, Shift+RMB tap, Shift+RMB hold,
 * Space, Shift+LMB), each with its key, the spell's name, a line or two from the rules and a live
 * preview: the spell cast by a real wizard in a tiny world, drawn by the game's own view
 * (help-preview.ts). With nothing queued it shows your hands' moves for the weapon and guard you hold.
 * Numbers (cost, damage, reach, duration, hold) are behind a toggle, off by default.
 *
 * New-player touches: the element keys with their letters, an "opposites cancel" note when a cancel
 * happens (in the panel, and as a toast above the rune bar the first few times), and a one-line
 * "F2: what will my runes do?" hint the first time a browser plays.
 *
 * Client only. It reads the game's world and never writes it; its previews step worlds of their own.
 * Drawn like the HUD: 3x5 pixel text in a small canvas at an integer scale (one step under the HUD's
 * on big screens, so a long line fits), kept clear of the rune bar.
 *
 * URL params, for screenshots: ?help=1 opens it at boot; ?helpq=water,cold shows a queue
 * (?helpq=hands:water shows the hands with a Tide trident, ?helpq=hands:water:tide with a Tide shield too);
 * ?helphint=1 shows the first-session hint even when headless.
 */
import { Container, Sprite, Texture } from 'pixi.js';
import { rules, type Element } from '@wizard-sim/rules';
import {
  CAST_ID, GUARD_NAME, N_EL, PHASE, STRUCT, elementId, queueOf, type World,
} from '@wizard-sim/sim';
import * as X from './art/px';
import { clip, helpModel, wrap, type HandsState, type HelpModel, type HelpRow, type KeyGlyph } from './help-model';
import { Preview, type Setup } from './help-preview';
import { helpPadPresses } from './menu-nav';
import type { PadSeats } from './gamepad';
import type { WorldView } from './view';

const clean = X.fontText;

/** Panel width in its art px, and the preview box's width. */
const PW = 184, BOX_W = 64;
/** Rows start here; the footer is this tall. */
const HEAD = 40, FOOT = 13;
const COL = { edge: '#0a0810', fill: '#141220', rowA: '#1a1726', rowOn: '#262038', hi: '#3a3450', text: '#cfc9e6', dim: '#8a8498', faint: '#4a4560', gold: '#ffd860', warn: '#ff9a50', white: '#e8e4f0' };
/** The element keys in the HUD's order (Q W E R over A S D F G). */
const LEGEND: Element[] = ['water', 'life', 'shield', 'cold', 'lightning', 'arcane', 'sigil', 'fire', 'earth'];
const SLIDE_S = 0.18;
const HINT_KEY = 'wizardSim.helpHint', STATS_KEY = 'wizardSim.helpStats', TOASTS_KEY = 'wizardSim.cancelToasts';
/** The cancel toast shows this many times per browser; the panel's note always shows. */
const TOASTS = 5;

const store = {
  get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string): void { try { localStorage.setItem(k, v); } catch { /* private mode: fine */ } },
};

export interface HelpOptions {
  /** A scripted or demo run: no first-session hint (unless ?helphint=1). */
  headless: boolean;
  /** Open at boot (?help=1). */
  open?: boolean;
  /** ?helpq=...: show this queue or these hands instead of the seat's own (screenshots). */
  force?: string | null;
  /** ?helphint=1. */
  hint?: boolean;
}

interface Forced { queue: Element[]; hands: HandsState | null }

function parseForce(s: string | null | undefined): Forced | null {
  if (s == null) return null;
  const t = s.trim();
  if (t.startsWith('hands')) {
    const [, w = '', g = ''] = t.split(':');
    const weapon = (rules.BASE as string[]).includes(w) ? elementId(w as Element) : 0;
    const guard = Math.max(0, GUARD_NAME.indexOf(g));
    return { queue: [], hands: { weapon, uses: STRUCT.weaponUses, guard, wand: w === 'wand' } };
  }
  const queue = t.split(/[+ ,]/).filter((e) => (rules.BASE as string[]).includes(e)) as Element[];
  return { queue, hands: null };
}

export class HelpPanel {
  /** Add to the stage over the game view. */
  readonly root = new Container();
  private panel: Sprite;
  private tex: Texture;
  private cv = X.canvas(PW, 200);
  private hint: Sprite;
  private hintTex: Texture;
  private hintCv = X.canvas(124, 13);
  private toast: Sprite;
  private toastTex: Texture;
  private toastCv = X.canvas(200, 13);
  private previews: Preview[] = [];
  private btn: HTMLButtonElement;
  private statsBtn: HTMLButtonElement;
  private isOpen = false;
  private openK = 0;
  private lastNow = 0;
  private frameNo = 0;
  private acc = 0;
  private drawnKey = '';
  private playingKey = '';
  /** The seat the panel follows (the keyboard's, or the gamepad's that opened it); -1: the view's local seat. */
  private seat = -1;
  private padGlyphs = false;
  private padPrev: boolean[] = [false, false, false, false];
  private stats = store.get(STATS_KEY) === '1';
  private forced: Forced | null;
  private cancelText = '';
  private cancelAt = -99;
  private toastUntil = -99;
  private hintUntil = -99;
  private boxes: { x: number; y: number; w: number; h: number }[] = [];
  private ps = 2;
  private ph = 0;

  constructor(private world: World, private view: WorldView, private pads: PadSeats | null, o: HelpOptions) {
    this.tex = Texture.from(this.cv.c); this.tex.source.scaleMode = 'nearest';
    this.panel = new Sprite(this.tex);
    this.hintTex = Texture.from(this.hintCv.c); this.hintTex.source.scaleMode = 'nearest';
    this.hint = new Sprite(this.hintTex);
    this.toastTex = Texture.from(this.toastCv.c); this.toastTex.source.scaleMode = 'nearest';
    this.toast = new Sprite(this.toastTex);
    this.panel.visible = this.hint.visible = this.toast.visible = false;
    this.root.addChild(this.panel, this.hint, this.toast);
    this.forced = parseForce(o.force);

    injectStyle();
    this.btn = document.createElement('button');
    this.btn.className = 'help-btn';
    this.btn.textContent = '?';
    this.btn.title = 'What will my runes do? (F2)';
    this.btn.addEventListener('click', () => { this.btn.blur(); this.padGlyphs = false; this.seat = -1; this.toggle(); });
    document.body.appendChild(this.btn);
    this.statsBtn = document.createElement('button');
    this.statsBtn.className = 'help-stats';
    this.statsBtn.title = 'Show or hide the numbers (Shift+F2)';
    this.statsBtn.addEventListener('click', () => { this.statsBtn.blur(); this.toggleStats(); });
    this.statsBtn.addEventListener('contextmenu', (e) => e.preventDefault());
    document.body.appendChild(this.statsBtn);
    // capture, so it works while a field of the tuning panel has focus
    addEventListener('keydown', (e) => {
      if (e.code !== 'F2') return;
      e.preventDefault();
      if (e.repeat) return;
      if (e.shiftKey) { if (!this.isOpen) this.toggle(); this.toggleStats(); return; }
      this.padGlyphs = false; this.seat = -1;
      this.toggle();
    }, true);

    if (o.open) this.toggle();
    if ((!o.headless && store.get(HINT_KEY) !== '1') || o.hint) {
      store.set(HINT_KEY, '1');
      this.hintUntil = Infinity; // set on the first frame (real time)
    }
  }

  get open(): boolean { return this.isOpen; }

  toggle(): void {
    this.isOpen = !this.isOpen;
    this.hintUntil = -99; // they found it
    this.btn.classList.toggle('on', this.isOpen);
  }

  private toggleStats(): void {
    this.stats = !this.stats;
    store.set(STATS_KEY, this.stats ? '1' : '0');
    this.drawnKey = '';
  }

  /** After each sim step of the game's world: a cancel in the shown seat's queue. */
  afterStep(w: World): void {
    const seat = this.shownSeat();
    for (const e of w.events) {
      if (e.kind !== 'cancel' || e.who !== seat || !e.text) continue;
      this.cancelText = e.text;
      this.cancelAt = this.lastNow / 1000;
      const n = Number(store.get(TOASTS_KEY) ?? 0) || 0;
      if (n < TOASTS && !this.isOpen) { store.set(TOASTS_KEY, String(n + 1)); this.toastUntil = this.cancelAt + 2.4; }
      this.drawnKey = '';
    }
  }

  private shownSeat(): number { return this.seat >= 0 ? this.seat : this.view.hud.seat; }

  /** What the panel shows now: the forced queue, or the seat's queue (the cast's while casting), or its hands. */
  private currentModel(): { model: HelpModel; active: number } {
    const w = this.world, s = w.seats, i = this.shownSeat();
    if (this.forced) return { model: helpModel(this.forced.queue, this.forced.hands ?? { weapon: 0, uses: 0, guard: 0, wand: false }), active: -1 };
    let q = queueOf(w, i), active = -1;
    if (!q.length && s.phase[i] !== PHASE.idle && s.castLen[i] > 0) {
      q = queueOf(w, i, true);
      active = s.castId[i] - CAST_ID.force; // force 1 .. conjure 5 -> row 0..4
    }
    const hands: HandsState = { weapon: s.weaponUses[i] > 0 ? s.weapon[i] : 0, uses: s.weaponUses[i], guard: s.guard[i], wand: !!s.wand[i] };
    return { model: helpModel(q, hands), active };
  }

  /** The preview setup for the hands: the player's weapon and guard, copied into the preview's wizard. */
  private handsSetup(): Setup {
    const src = this.world, i = this.shownSeat(), f = this.forced?.hands;
    return (w) => {
      const s = w.seats, from = src.seats;
      if (f) {
        s.weapon[0] = f.weapon; s.weaponEls.fill(0, 0, N_EL); if (f.weapon) s.weaponEls[f.weapon - 1] = 1;
        s.wand[0] = f.wand ? 1 : 0; s.guard[0] = f.guard; s.guardEls.fill(0, 0, N_EL);
        if (f.guard) { s.guardEls[elementId('shield') - 1] = 1; s.guardHp[0] = 200; }
      } else {
        s.weapon[0] = from.weaponUses[i] > 0 ? from.weapon[i] : 0; s.wand[0] = from.wand[i];
        s.weaponEls.set(from.weaponEls.subarray(i * N_EL, i * N_EL + N_EL), 0);
        s.guard[0] = from.guard[i]; s.guardHp[0] = Math.max(from.guardHp[i], 1); s.guardCharge[0] = from.guardCharge[i];
        s.guardEls.set(from.guardEls.subarray(i * N_EL, i * N_EL + N_EL), 0);
      }
      s.weaponUses[0] = STRUCT.weaponUses;
    };
  }

  /** Once a frame, before the view draws. */
  frame(now: number): void {
    const t = now / 1000, dt = this.lastNow ? Math.min(0.1, (now - this.lastNow) / 1000) : 0;
    this.lastNow = now;
    if (this.hintUntil === Infinity) this.hintUntil = t + 14;
    this.pollPads();
    const target = this.isOpen ? 1 : 0;
    if (target > this.openK) this.openK = Math.min(1, this.openK + dt / SLIDE_S);
    else if (target < this.openK) this.openK = Math.max(0, this.openK - dt / SLIDE_S);
    if (dt === 0) this.openK = target;
    this.layout();
    this.drawHint(t);
    this.drawToast(t);
    const shown = this.openK > 0;
    this.panel.visible = shown;
    this.statsBtn.style.display = this.isOpen ? '' : 'none';
    if (!shown) { for (const p of this.previews) p.root.visible = false; return; }

    const { model, active } = this.currentModel();

    const key = `${model.key}|${model.header}|${this.stats ? 1 : 0}|${active}|${this.ph}|${this.ps}|${this.padGlyphs ? 1 : 0}|${this.cancelNote(t)}`;
    if (key !== this.drawnKey) { this.drawnKey = key; this.drawPanel(model, active, t); }

    // the previews: made one a frame on first open, restarted when the rows change
    if (this.previews.length < model.rows.length) {
      const b = this.boxes[this.previews.length] ?? { w: BOX_W, h: 40 };
      const p = new Preview(b.w, b.h, this.ps, (this.view as unknown as { frames: unknown }).frames);
      this.previews.push(p); this.root.addChild(p.root);
      this.playingKey = '';
    }
    if (this.playingKey !== model.key + (this.previews.length === model.rows.length ? '' : '~' + this.previews.length)) {
      this.playingKey = model.key + (this.previews.length === model.rows.length ? '' : '~' + this.previews.length);
      const setup = model.mode === 'hands' ? this.handsSetup() : null;
      this.previews.forEach((p, k) => { const r = model.rows[k]; if (r) p.play(r.demo, setup, r.slot === 'retreat' ? 'retreat' : null); });
    }
    const ease = 1 - (1 - this.openK) * (1 - this.openK);
    const px = Math.round(innerWidth - (PW * this.ps + 4) * ease), py = this.panel.y;
    this.panel.x = px;
    this.acc += dt;
    this.frameNo++;
    const n = Math.min(4, Math.floor(this.acc * 60));
    this.acc -= n / 60;
    if (this.acc > 0.1) this.acc = 0;
    this.previews.forEach((p, k) => {
      const b = this.boxes[k];
      p.root.visible = !!b && b.h > 8;
      if (!p.root.visible) return;
      p.resize(b.w, b.h, this.ps);
      p.root.position.set(px + b.x * this.ps, py + b.y * this.ps);
      p.steps(n);
      // half of them redraw each frame (30 fps each): the previews cost half as much
      if ((this.frameNo + k) % 2 === 0) p.draw(this.acc * 60, now);
    });
    // the stats toggle: a DOM button over the footer's switch, so a click never walks the wizard
    const sb = this.statsBtn.style;
    sb.left = `${px + 3 * this.ps}px`; sb.top = `${py + (this.ph - FOOT + 2) * this.ps}px`;
    sb.width = `${60 * this.ps}px`; sb.height = `${9 * this.ps}px`;
  }

  /** Scale, height and position: under the Tune button, down to the screen's bottom or the rune bar's top. */
  private layout(): void {
    const base = this.view.camera.base, ps = base >= 3 ? base - 1 : base, sh = innerHeight, sw = innerWidth;
    const top = 34;
    let bottom = sh - 4;
    const bar = this.view.hud.barRect(), barX1 = (bar.x + bar.w) * base, barY0 = bar.y * base;
    if (sw - (PW * ps + 4) < barX1 + 2) bottom = Math.min(bottom, barY0 - 4);
    const ph = Math.max(HEAD + FOOT + 5 * 22, Math.floor((bottom - top) / ps));
    if (ps !== this.ps || ph !== this.ph) {
      this.ps = ps; this.ph = ph;
      // a new canvas: Texture.from caches by canvas, so a resized one would keep its old size
      this.cv = X.canvas(PW, ph);
      const old = this.tex;
      this.tex = Texture.from(this.cv.c); this.tex.source.scaleMode = 'nearest';
      this.panel.texture = this.tex;
      old.destroy(true);
      this.drawnKey = '';
    }
    this.panel.scale.set(ps);
    this.panel.y = top;
    if (this.openK === 0) this.panel.x = sw;
  }

  /** The panel's note on a cancel, for a few seconds after it. */
  private cancelNote(t: number): string {
    if (t - this.cancelAt > 4 || !this.cancelText) return '';
    const txt = this.cancelText, [a, , b] = txt.split(' ');
    return a && a === b ? `${txt}: a double tap dismisses` : `${txt}: opposites cancel, runes back`;
  }

  private drawPanel(m: HelpModel, active: number, t: number): void {
    const c = this.cv.x, H = this.ph;
    c.clearRect(0, 0, PW, H); c._fs = null;
    X.rect(c, 0, 0, PW, H, COL.edge); X.rect(c, 1, 1, PW - 2, H - 2, COL.fill); X.rect(c, 1, 1, PW - 2, 1, COL.hi);
    // title and the key that closes it
    X.text(c, 'WHAT YOUR RUNES DO', 4, 4, COL.gold);
    this.cap(c, PW - 16, 3, 'F2');
    // the queue (with its keys), or what your hands hold
    let y = 12;
    if (m.mode === 'spell') {
      let x = 4;
      x += X.text(c, 'QUEUED', x, y + 1, COL.dim) + 4;
      m.queue.forEach((el, k) => {
        if (k) { X.text(c, '+', x, y + 1, COL.faint); x += 5; }
        X.icon(c, el, x, y, X.EL[el][2]); x += 8;
        X.text(c, rules.ELEMENTS[el].key, x, y + 1, COL.white); x += 6;
      });
    } else {
      X.text(c, 'NOTHING QUEUED: YOUR HANDS', 4, y + 1, COL.dim);
      y += 7;
      X.text(c, clean(m.header).slice(0, 44), 4, y + 1, COL.white);
      y -= 7;
    }
    // every element key, with its letter (the rune bar's order)
    const ly = 29;
    LEGEND.forEach((el, k) => {
      const lx = 4 + k * 20;
      X.icon(c, el, lx, ly, X.EL[el][2]);
      X.text(c, rules.ELEMENTS[el].key, lx + 9, ly + 1, COL.dim);
    });
    X.rect(c, 3, HEAD - 3, PW - 6, 1, COL.hi);

    // the rows
    const rowH = Math.floor((H - HEAD - FOOT) / m.rows.length);
    this.boxes = [];
    m.rows.forEach((r, k) => this.drawRow(c, r, 3, HEAD + k * rowH, PW - 6, rowH - 2, k === active));

    // footer: the cancel note, or the stats switch
    const fy = H - FOOT + 2, note = this.cancelNote(t);
    X.rect(c, 3, fy - 2, PW - 6, 1, COL.hi);
    X.rect(c, 4, fy, 58, 9, this.stats ? '#2c2614' : '#1f1c2e');
    X.text(c, `NUMBERS: ${this.stats ? 'ON' : 'OFF'}`, 7, fy + 2, this.stats ? COL.gold : COL.dim);
    if (note) X.text(c, clean(note).slice(0, 29), 66, fy + 2, COL.warn);
    else X.text(c, 'SHIFT+F2', 66, fy + 2, COL.faint);
    this.tex.source.update();
  }

  private drawRow(c: X.Ctx, r: HelpRow, x: number, y: number, w: number, h: number, on: boolean): void {
    X.rect(c, x, y, w, h, on ? COL.rowOn : COL.rowA);
    if (on) X.rect(c, x, y, 1, h, COL.gold);
    const ramp = r.look ? X.EL[r.look] : null;
    // key glyph, then the name
    const gx = this.glyph(c, r.keys, x + 2, y + 2);
    X.text(c, clean(r.title).slice(0, Math.floor((w - gx + x - 4) / 4)), gx + 3, y + 4, ramp ? ramp[1] : COL.white);
    // the numbers: a line or two under the box, full width
    const cols = Math.floor((w - 4) / 4);
    const stats = this.stats ? clip(wrap(r.stats.join(' - '), cols), 2, cols) : [];
    const statsH = stats.length * 6;
    const bh = Math.max(0, Math.min(46, h - 13 - statsH - 1));
    const bx = x + 2, by = y + 12;
    X.rect(c, bx - 1, by - 1, BOX_W + 2, bh + 2, COL.edge);
    this.boxes.push({ x: bx, y: by, w: BOX_W, h: bh });
    // the description and the extra elements' traits, beside the box
    const tx = bx + BOX_W + 4, tcols = Math.floor((x + w - tx - 1) / 4), maxLines = Math.max(1, Math.floor((bh + 2) / 6));
    const tags = r.tags.length ? r.tags : [];
    const lines = clip(wrap(clean(r.text), tcols), tags.length ? Math.max(1, maxLines - 1) : maxLines, tcols);
    lines.forEach((ln, k) => X.text(c, ln, tx, by + k * 6, r.idle ? COL.dim : COL.text));
    if (tags.length && lines.length < maxLines + 1) {
      let ttx = tx;
      const ty = by + lines.length * 6;
      for (const tg of tags) {
        const s = '+' + clean(tg.text);
        if (ttx + s.length * 4 > x + w) break;
        ttx += X.text(c, s, ttx, ty, tg.el ? X.EL[tg.el][1] : COL.dim) + 4;
      }
    }
    stats.forEach((ln, k) => X.text(c, ln, x + 2, by + bh + 2 + k * 6, COL.gold));
  }

  /** A key cap with a label. */
  private cap(c: X.Ctx, x: number, y: number, label: string): number {
    const w = label.length * 4 + 3;
    X.rect(c, x, y, w, 8, COL.edge); X.rect(c, x, y, w, 7, '#2a2638'); X.rect(c, x, y, w, 1, '#4a4560');
    X.text(c, label, x + 2, y + 1, COL.white);
    return w;
  }

  /** The gesture's glyph: Shift, the mouse with the button lit, TAP / HOLD; Space; or the gamepad's buttons. Returns the x after it. */
  private glyph(c: X.Ctx, k: KeyGlyph, x: number, y: number): number {
    if (this.padGlyphs) return x + this.cap(c, x, y, k.pad);
    if (k.space) return x + this.cap(c, x, y, 'SPACE') + (k.note ? 2 + X.text(c, k.note, x + 25, y + 1, COL.dim) + 1 : 0);
    let cx = x;
    if (k.shift) {
      // a small up arrow: Shift
      const A = ['..#..', '.###.', '#####', '.###.', '.###.'];
      A.forEach((row, j) => { for (let i = 0; i < 5; i++) if (row[i] === '#') X.px(c, cx + i, y + 1 + j, COL.white); });
      cx += 7;
    }
    // the mouse: two buttons over a body, the used one lit
    X.rect(c, cx, y, 7, 9, COL.dim); X.rect(c, cx + 1, y + 1, 5, 7, '#1f1c2e');
    X.rect(c, cx + 3, y + 1, 1, 3, COL.dim); X.rect(c, cx + 1, y + 4, 5, 1, COL.dim);
    if (k.mouse === 'L') X.rect(c, cx + 1, y + 1, 2, 3, COL.gold);
    if (k.mouse === 'R') X.rect(c, cx + 4, y + 1, 2, 3, COL.gold);
    cx += 9;
    if (k.note) cx += X.text(c, k.note, cx, y + 2, COL.dim) + 1;
    return cx;
  }

  /** The first-session hint: under the "?" button, for a few seconds. */
  private drawHint(t: number): void {
    const on = t < this.hintUntil && !this.isOpen;
    this.hint.visible = on;
    if (!on) return;
    const c = this.hintCv.x, s = 'F2: WHAT WILL MY RUNES DO?', w = s.length * 4 + 5;
    c.clearRect(0, 0, 124, 13); c._fs = null;
    X.rect(c, 0, 0, w, 11, COL.edge); X.rect(c, 1, 1, w - 2, 9, COL.fill); X.rect(c, 1, 1, w - 2, 1, COL.hi);
    X.text(c, s, 3, 3, Math.floor(t * 2) % 2 ? COL.gold : COL.white);
    this.hintTex.source.update();
    this.hint.scale.set(this.ps);
    this.hint.position.set(Math.round(innerWidth - 8 - w * this.ps), 34);
  }

  /** The cancel toast, centred over the rune bar (the first few cancels a browser sees). */
  private drawToast(t: number): void {
    const note = this.cancelNote(t), on = t < this.toastUntil && !!note;
    this.toast.visible = on;
    if (!on) return;
    const c = this.toastCv.x, s = clean(note).slice(0, 48), w = s.length * 4 + 5;
    c.clearRect(0, 0, 200, 13); c._fs = null;
    X.rect(c, 0, 0, w, 11, COL.edge); X.rect(c, 1, 1, w - 2, 9, '#2a1a14');
    X.text(c, s, 3, 3, COL.warn);
    this.toastTex.source.update();
    const base = this.view.camera.base, bar = this.view.hud.barRect();
    this.toast.scale.set(base);
    this.toast.position.set(Math.round((bar.x + bar.w / 2) * base - (w * base) / 2), Math.round((bar.y - 13) * base));
  }

  /** D-pad up on a seated gamepad opens the panel for that pad's seat, with the pad's buttons. */
  /** While this is true (the Esc menu is open, main.ts) D-pad up moves the menu and leaves the panel alone. */
  padsBlocked: () => boolean = () => false;

  private pollPads(): void {
    if (!this.pads) return;
    const list = navigator.getGamepads?.() ?? [];
    const down = [0, 1, 2, 3].map((p) => { const g = list[p]; return !!g && g.connected && !!g.buttons[12]?.pressed; });
    for (const p of helpPadPresses(this.padPrev, down, this.padsBlocked())) {
      const seat = this.pads.seatOfPad(p);
      if (seat < 0) continue;
      if (this.isOpen && this.seat !== seat) { this.seat = seat; this.padGlyphs = true; this.drawnKey = ''; }
      else { this.seat = seat; this.padGlyphs = true; this.toggle(); }
    }
    this.padPrev = down;
  }
}

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const st = document.createElement('style');
  st.textContent = `
.help-btn { position: fixed; right: 62px; top: 8px; z-index: 20; font: 700 11px/1 ui-monospace, Consolas, monospace; color: #ffd860; background: rgba(20, 18, 32, 0.85); border: 1px solid #3a3450; border-radius: 4px; padding: 5px 8px; cursor: pointer; }
.help-btn:hover, .help-btn.on { border-color: #ffd860; }
.help-stats { position: fixed; z-index: 19; background: transparent; border: 0; padding: 0; cursor: pointer; }
`;
  document.head.appendChild(st);
}
