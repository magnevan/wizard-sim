/**
 * The rune HUD of the Pixel Battlefield (pass 4): two rows laid out like the keys under the
 * left hand, staggered like a keyboard (Q W E R over A S D F G, shifted a third of a key),
 * each cap with its element icon, its key and one pip per rune; the regenerating rune fills
 * from the bottom. Above it, a chip with the queue while you build a spell, and the spell's
 * name while you cast it. Drawn in art pixels into a small canvas, so it is crisp at the
 * integer scale like everything else.
 */
import { Sprite, Texture } from 'pixi.js';
import { rules, type Element } from '@wizard-sim/rules';
import { ARCHETYPES, KIND, MAX_PORTALS, N_EL, PHASE, PHASE_ENC, QUEUE_MAX, RHYTHM, RUNES, T, elementId, elementName, specOf, type World } from '@wizard-sim/sim';
import * as X from './art/px';
import { mod } from './art/util';

const TOP: Element[] = ['water', 'life', 'shield', 'cold'];
const BOT: Element[] = ['lightning', 'arcane', 'sigil', 'fire', 'earth'];
const SLOT = 24, RH = 21, STAG = Math.round(SLOT / 3);
const PW = Math.max(TOP.length * SLOT, STAG + BOT.length * SLOT) + 6, PH = RH * 2 + 7;
const CW = 240, CH = PH + 22;

const TW = 320, TH = 22;

export class Hud {
  readonly sprite: Sprite;
  /** The wave strip at the top of the view (the Arena only). */
  readonly top: Sprite;
  private tc = X.canvas(TW, TH);
  private ttex: Texture;
  private c = X.canvas(CW, CH);
  private tex: Texture;
  /** Seconds (sim time) when each element last ran dry or was spent, for seat 0. */
  private dryAt = new Float64Array(N_EL + 1).fill(-9);
  private spentAt = new Float64Array(N_EL + 1).fill(-9);
  private lastTitle = '';
  private lastCastAt = -9;

  /** Whose runes and queue the HUD shows: the local player's seat (online it isn't always 0). */
  constructor(public seat = 0) {
    this.tex = Texture.from(this.c.c);
    this.tex.source.scaleMode = 'nearest';
    this.sprite = new Sprite(this.tex);
    this.ttex = Texture.from(this.tc.c);
    this.ttex.source.scaleMode = 'nearest';
    this.top = new Sprite(this.ttex);
  }

  /** The wave director's state: the lull's countdown and the incoming mix, the wave's foes left. */
  private drawWave(w: World, t: number, viewW: number): void {
    const c = this.tc.x, st = w.enc.state, e = w.enc;
    c.clearRect(0, 0, TW, TH); c._fs = null;
    this.top.visible = st[0] !== PHASE_ENC.off;
    if (!this.top.visible) return;
    const secs = Math.ceil(st[2] / 60);
    let line = '', sub = '';
    if (st[0] === PHASE_ENC.lull) {
      line = `WAVE ${st[1]} IN ${secs}S - PREPARE`;
      const mix: string[] = [];
      for (let p = 0; p < MAX_PORTALS; p++) if (e.total[p] && e.arch[p]) mix.push(`${ARCHETYPES[e.arch[p]].name} ×${e.total[p]}`);
      sub = mix.join('  ');
    } else if (st[0] === PHASE_ENC.wave) {
      let foes = 0, left = 0;
      for (let i = 0; i < w.bodies.kind.length; i++) if (w.bodies.kind[i] === KIND.enemy) foes++;
      for (let p = 0; p < MAX_PORTALS; p++) left += e.left[p];
      line = `WAVE ${st[1]}`; sub = `${foes + left} LEFT`;
    } else { line = `BREATHER ${secs}S`; sub = `${st[3]} CLEARED`; }
    const clean = (str: string) => str.toUpperCase().replace(/[^A-Z0-9 +\-/.!×]/g, ' ');
    line = clean(line); sub = clean(sub);
    const wd = Math.max(line.length, sub.length) * 4 + 10, x = Math.round(TW / 2 - wd / 2);
    X.rect(c, x - 1, 0, wd + 2, sub ? 17 : 10, '#0a0810'); X.rect(c, x, 1, wd, sub ? 15 : 8, '#1a1726');
    const pulse = st[0] === PHASE_ENC.lull && secs <= 3 && Math.floor(t * 4) % 2 === 0;
    X.text(c, line, Math.round(TW / 2 - line.length * 2), 3, pulse ? '#ffffff' : '#ffd860');
    if (sub) X.text(c, sub, Math.round(TW / 2 - sub.length * 2), 10, '#8a8498');
    this.ttex.source.update();
    this.top.position.set(Math.round(viewW / 2 - TW / 2), 3);
  }

  /** Feed it each tick's events (dry runes, casts). */
  onEvent(kind: string, who: number, look: number | undefined, text: string | undefined, t: number): void {
    if (who !== this.seat) return;
    if (kind === 'dry' && look) this.dryAt[look] = t;
    if (kind === 'cast') { this.lastCastAt = t; if (text) this.lastTitle = text; }
  }

  /** Redraws the HUD for time t (sim seconds) and places it at the bottom of a view w x h art px. */
  draw(w: World, t: number, viewW: number, viewH: number): void {
    this.drawWave(w, t, viewW);
    const c = this.c.x, s = w.seats, i = this.seat;
    c.clearRect(0, 0, CW, CH); c._fs = null;
    const x0 = Math.round(CW / 2 - PW / 2 + 7), y0 = CH - PH - 1;
    // the backing plate follows the stagger: the top row is narrower than the bottom
    X.rect(c, x0 - 1, y0 - 1, TOP.length * SLOT + 8, RH + 5, '#0a0810'); X.rect(c, x0 - 1, y0 + RH + 2, PW + 2, RH + 6, '#0a0810');
    X.rect(c, x0, y0, TOP.length * SLOT + 6, RH + 5, '#141220'); X.rect(c, x0, y0 + RH + 3, PW, RH + 4, '#141220');
    X.rect(c, x0, y0, TOP.length * SLOT + 6, 1, '#3a3450');
    // the player's colour tab
    const team = X.TEAMS[i % 4];
    X.rect(c, x0 - 14, y0 + RH - 4, 13, 15, '#0a0810'); X.rect(c, x0 - 13, y0 + RH - 3, 12, 13, team.dark); X.text(c, 'P' + (i + 1), x0 - 11, y0 + RH + 1, team.light);
    // what's in your hands: the conjured weapon (its element and uses left) and a guard, under the badge
    if (s.weapon[i]) {
      const el = elementName(s.weapon[i]);
      X.rect(c, x0 - 14, y0 + RH + 12, 13, 16, '#0a0810');
      X.icon(c, el as Element, x0 - 12, y0 + RH + 13, X.EL[el][2]);
      X.text(c, String(s.weaponUses[i]), x0 - 13, y0 + RH + 22, s.weaponUses[i] <= 5 ? '#ff6a6a' : '#cfc9e6');
    }
    if (s.guard[i]) X.rect(c, x0 - 3, y0 + RH + 12, 2, 16, X.EL.shield[2]);

    const channel = s.phase[i] === PHASE.channel, spec = s.phase[i] !== PHASE.idle ? specOf(w, i) : null;
    const upkeep = channel && spec && s.chanTicks[i] >= T(RHYTHM.naturalChannel) ? spec.form : 0;
    // queued runes are reserved: they show as spent pips until cast or refunded
    [...TOP, ...BOT].forEach((el, k) => {
      const row = k < TOP.length ? 0 : 1, col = row ? k - TOP.length : k, id = elementId(el), ramp = X.EL[el];
      const sx = x0 + 3 + col * SLOT + (row ? STAG : 0), sy = y0 + 3 + row * (RH + 3);
      const dryK = t - this.dryAt[id] < 0.5, dry = dryK && Math.floor(t * 8) % 2 === 0;
      X.rect(c, sx, sy, SLOT - 2, RH - 1, dry ? '#3a1418' : '#1f1c2e'); X.rect(c, sx, sy, SLOT - 2, 1, dry ? '#a03040' : '#3e3854'); X.rect(c, sx, sy + RH - 2, SLOT - 2, 1, '#0c0a14');
      X.rect(c, sx, sy, 1, RH - 1, '#2c2840'); X.rect(c, sx + SLOT - 3, sy, 1, RH - 1, '#110e1a');
      const pulse = t - this.spentAt[id] < 0.25 ? 1 : 0;
      const drain = upkeep === id;
      X.icon(c, el, sx + 2, sy + 2 - pulse, ramp[drain ? 1 : 2]);
      X.text(c, rules.ELEMENTS[el].key, sx + 13, sy + 3, dryK ? '#ff6a6a' : '#6a6484');
      if (drain) { X.rect(c, sx + 13, sy + 9, 3, 1, '#ff6a6a'); X.px(c, sx + 18, sy + 9 + mod(t * 2.2, 1) * 4, ramp[2]); }
      const v = s.runes[i * N_EL + id - 1], max = Math.round(RUNES.max[el]);
      this.pips(c, sx, sy + 11, v, max, ramp, t);
    });

    // the chip above: the queue while building, the spell while casting
    const cy = y0 - 14;
    const q: number[] = [];
    for (let k = 0; k < s.queueLen[i]; k++) q.push(s.queue[i * QUEUE_MAX + k]);
    if (spec || t - this.lastCastAt < 1.0) {
      const title = (spec ? spec.title : this.lastTitle).toUpperCase().replace(/[^A-Z0-9 +\-/.!]/g, ' ');
      const els: number[] = [];
      if (spec) for (let k = 0; k < s.castLen[i]; k++) els.push(s.castQueue[i * QUEUE_MAX + k]);
      const iw = els.length * 9, cw = Math.min(CW - 4, iw + title.length * 4 + 8 + (channel ? 18 : 0)), cx = Math.round(CW / 2 - cw / 2);
      X.rect(c, cx - 1, cy - 1, cw + 2, 12, '#0a0810'); X.rect(c, cx, cy, cw, 10, '#1a1726');
      els.forEach((id, k) => X.icon(c, elementName(id), cx + 2 + k * 9, cy + 2, X.EL[elementName(id)][2]));
      X.text(c, title, cx + 4 + iw, cy + 3, spec ? '#e8e4f0' : '#8a8498');
      if (channel && spec) {
        // the natural duration runs down; past it the upkeep comes out of regen
        const left = Math.max(0, 1 - s.chanTicks[i] / T(RHYTHM.naturalChannel)), bx = cx + cw - 16;
        X.rect(c, bx, cy + 4, 13, 3, '#0e0c16'); X.rect(c, bx, cy + 4, Math.round(13 * left), 3, X.EL[elementName(spec.look || spec.form || 6)][2]);
      }
    } else if (q.length) {
      const cw = 26 + q.length * 14, cx = Math.round(CW / 2 - cw / 2);
      X.rect(c, cx - 1, cy - 1, cw + 2, 12, '#0a0810'); X.rect(c, cx, cy, cw, 10, '#1a1726');
      q.forEach((id, k) => { if (k) X.text(c, '+', cx + 2 + k * 14 - 5, cy + 3, '#ffffff'); X.icon(c, elementName(id), cx + 2 + k * 14, cy + 2, X.EL[elementName(id)][2]); });
      if (Math.floor(t * 6) % 2 && q.length < QUEUE_MAX) X.rect(c, cx + 4 + q.length * 14, cy + 7, 3, 1, '#e8e4f0');
      X.text(c, 'QUEUE', cx + cw - 21, cy + 3, '#8a8498');
    }
    this.tex.source.update();
    this.sprite.position.set(Math.round(viewW / 2 - CW / 2), Math.max(0, viewH - CH - 3));
  }

  /** A rune was spent from the pool (a cast): its icon hops. */
  spent(id: number, t: number): void { this.spentAt[id] = t; }

  /**
   * One cap's runes. Up to 5: a row of pips (the regenerating one fills from the bottom). 6 to 10:
   * two rows of shorter pips, the first five on top. More: a bar with a tick every 5 runes, and the count.
   */
  private pips(c: X.Ctx, sx: number, py: number, v: number, max: number, ramp: readonly string[], t: number): void {
    const full = Math.floor(v + 1e-6), frac = v - full;
    if (max > 10) {
      const bw = 11, fill = Math.round((Math.min(v, max) / max) * bw);
      X.rect(c, sx + 2, py + 1, bw, 4, '#0e0c16');
      if (fill > 0) { X.rect(c, sx + 2, py + 1, fill, 4, ramp[2]); X.rect(c, sx + 2, py + 1, fill, 1, ramp[1]); }
      for (let k = 5; k < max; k += 5) X.rect(c, sx + 2 + Math.round((k / max) * bw), py + 1, 1, 4, '#0e0c16');
      X.text(c, String(full), sx + 14, py, '#cfc9e6');
      return;
    }
    const rows = max > 5 ? 2 : 1, h = rows === 1 ? 6 : 2, per = rows === 1 ? max : 5;
    for (let p = 0; p < max; p++) {
      const col = p % per, row = Math.floor(p / per);
      const px = sx + 2 + col * 4 - (per > 4 ? 1 : 0), y = py + row * (h + 2);
      X.rect(c, px, y, 3, h, '#0e0c16');
      if (p < full) { X.rect(c, px, y, 3, h, ramp[2]); X.rect(c, px, y, 1, h, ramp[1]); X.px(c, px + 1, y, ramp[0]); }
      else if (p === full && frac > 0.01) {
        const fh = Math.max(1, Math.round(frac * h)); X.rect(c, px, y + h - fh, 3, fh, ramp[3]);
        X.rect(c, px, y + h - fh, 3, 1, Math.floor(t * 6) % 2 ? ramp[1] : ramp[2]);
        if (rows === 1) X.rect(c, px, y - 1, 3, 1, '#2a2638');
      } else if (rows === 1) X.rect(c, px + 1, y + 2, 1, 2, '#2a2638');
    }
  }
}
