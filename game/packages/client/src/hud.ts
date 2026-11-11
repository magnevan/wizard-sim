/**
 * The rune HUD of the Pixel Battlefield (pass 4): two rows laid out like the keys under the
 * left hand, staggered like a keyboard (Q W E R over A S D F G, shifted a third of a key),
 * each cap with its element icon, its key and one pip per rune; the regenerating rune fills
 * from the bottom. Above it, a chip with the queue while you build a spell, and the spell's
 * name while you cast it. Drawn in art pixels into a small canvas, so it is crisp at the
 * integer scale like everything else.
 */
import { pedestalNear } from '@wizard-sim/sim';
import { Sprite, Texture } from 'pixi.js';
import { rules, type Element } from '@wizard-sim/rules';
import { BSTEP, ARCHETYPES, ARMS, GUARD_NAME, KIND, guardSize, MAX_PORTALS, MAX_SEATS, N_ALTARS, N_EL, PERKS, PHASE, PHASE_ENC, PICK_LOG, QUEUE_MAX, RHYTHM, SURVIVE_TIMES, T, TUT_ORDER, TUT_RUNES_FROM, TUT_STATE, elementId, tutPool, elementName, fullMask, regenOf, runeRate, runeMax, specOf, type World } from '@wizard-sim/sim';
import { badge, perkOf } from './art/perks';
import { DRIVING, STEP_UP } from './battery-text';
import * as X from './art/px';
import { mod } from './art/util';

const TOP: Element[] = ['water', 'life', 'shield', 'cold'];
const BOT: Element[] = ['lightning', 'arcane', 'sigil', 'fire', 'earth'];
const SLOT = 24, RH = 21, STAG = Math.round(SLOT / 3);
/** A refilling pool's colour by its share of the shared regen budget: dim when it gets a trickle, bright when most of R flows into it. */
const flowCol = (ramp: readonly string[], share: number): string => (share >= 0.35 ? ramp[1] : share >= 0.15 ? ramp[2] : ramp[3]);
const PW = Math.max(TOP.length * SLOT, STAG + BOT.length * SLOT) + 6, PH = RH * 2 + 7;
const CW = 240, CH = PH + 22;

const TW = 320, TH = 26;
/** Survive: the power-ups panel (top left) and the run-over card. */
const PKW = 150, PKH = 4 * 13 + 2, OVW = 220, OVH = 132;

/** What a device's bar shows. Each new kind of defence is one more of these. */
interface DeviceBar { el: Element; name: string; plate: string; rim: string }
const FLAME_TURRET: DeviceBar = { el: 'fire', name: 'FLAME TURRET', plate: '#3a1c0a', rim: '#6a3414' };

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
  /** Which elements had a pool last frame, and when each was last given (the tutorial fills its sockets one by one). */
  private unlocked = new Uint8Array(N_EL + 1);
  private unlockAt = new Float64Array(N_EL + 1).fill(-9);
  private lastTitle = '';
  private lastCastAt = -9;
  /** Survive: each player's power-ups (top left), and the run-over card (centre). */
  readonly perks: Sprite;
  readonly over: Sprite;
  private pk = X.canvas(PKW, PKH);
  private pkTex: Texture;
  private ov = X.canvas(OVW, OVH);
  private ovTex: Texture;
  private pkKey = '';

  /** Whose runes and queue the HUD shows: the local player's seat (online it isn't always 0). */
  constructor(public seat = 0) {
    this.tex = Texture.from(this.c.c);
    this.tex.source.scaleMode = 'nearest';
    this.sprite = new Sprite(this.tex);
    this.ttex = Texture.from(this.tc.c);
    this.ttex.source.scaleMode = 'nearest';
    this.top = new Sprite(this.ttex);
    this.pkTex = Texture.from(this.pk.c); this.pkTex.source.scaleMode = 'nearest'; this.perks = new Sprite(this.pkTex);
    this.ovTex = Texture.from(this.ov.c); this.ovTex.source.scaleMode = 'nearest'; this.over = new Sprite(this.ovTex);
    this.perks.visible = false; this.over.visible = false;
  }

  /** One player's picks, stacked: [power-up, element, count] in the order first taken. */
  private picksOf(w: World, s: number): [number, number, number][] {
    const r = w.run!, out: [number, number, number][] = [];
    for (let k = 0; k < r.logN[s]; k++) {
      const pu = r.log[s * PICK_LOG + k], el = r.logEl[s * PICK_LOG + k];
      const same = out.find((q) => q[0] === pu && q[1] === el);
      if (same) same[2]++; else out.push([pu, el, 1]);
    }
    return out;
  }

  /** Survive: who holds which power-ups, as badges in a row per player (top left). */
  private drawPerks(w: World): void {
    const r = w.run;
    this.perks.visible = !!r;
    if (!r) return;
    const seats: number[] = [];
    for (let s = 0; s < MAX_SEATS; s++) if (w.seats.active[s]) seats.push(s);
    const key = seats.map((s) => `${s}:${Array.from(r.log.subarray(s * PICK_LOG, s * PICK_LOG + r.logN[s])).join(',')}/${Array.from(r.logEl.subarray(s * PICK_LOG, s * PICK_LOG + r.logN[s])).join(',')}`).join(';');
    if (key === this.pkKey) return;
    this.pkKey = key;
    const c = this.pk.x;
    c.clearRect(0, 0, PKW, PKH); c._fs = null;
    seats.forEach((s, row) => {
      const y = 1 + row * 13, team = X.TEAMS[s % 4], picks = this.picksOf(w, s);
      X.rect(c, 0, y, 13, 11, '#0a0810'); X.rect(c, 1, y + 1, 11, 9, team.dark); X.text(c, 'P' + (s + 1), 2, y + 3, team.light);
      if (!picks.length) { X.text(c, '-', 16, y + 3, '#4a4560'); return; }
      let x = 15;
      for (const [pu, el, n] of picks) {
        if (x > PKW - 12) break;
        badge(c, perkOf(pu, el), x, y + 1);
        x += 10;
        if (n > 1) { X.rect(c, x - 1, y + 3, 9, 7, '#0a0810'); X.text(c, '×' + n, x, y + 4, '#cfc9e6'); x += 9; }
        x += 1;
      }
    });
    this.pkTex.source.update();
  }

  /** Survive: the run is over. Waves survived, everyone's power-ups, and how to go again. */
  private drawOver(w: World, t: number, viewW: number, viewH: number): void {
    const r = w.run, on = !!r && w.enc.state[0] === PHASE_ENC.over;
    this.over.visible = on;
    if (!on) return;
    const c = this.ov.x;
    c.clearRect(0, 0, OVW, OVH); c._fs = null;
    X.rect(c, 0, 0, OVW, OVH, '#0a0810'); X.rect(c, 1, 1, OVW - 2, OVH - 2, '#141220'); X.rect(c, 1, 1, OVW - 2, 1, '#3a3450');
    const mid = (str: string, y: number, col: string, k = 1) => X.text(c, str, Math.round(OVW / 2 - (str.length * 4 - 1) * k / 2), y, col, '#0a0810', k);
    mid('THE ARENA FELL', 7, '#ff6a6a', 2);
    const n = r!.state[1];
    mid(`WAVES SURVIVED: ${n}`, 23, '#ffd860');
    mid(`FELL ON WAVE ${r!.state[4]}`, 31, '#8a8498');
    // everyone's picks, badge and name, wrapping under the player's tab
    let y = 43;
    for (let s = 0; s < MAX_SEATS; s++) {
      if (!w.seats.active[s]) continue;
      const team = X.TEAMS[s % 4], picks = this.picksOf(w, s);
      X.rect(c, 8, y, 13, 11, team.dark); X.text(c, 'P' + (s + 1), 10, y + 3, team.light);
      if (!picks.length) X.text(c, 'NO POWER-UPS', 26, y + 3, '#4a4560');
      let x = 26;
      for (const [pu, el, k] of picks) {
        const p = perkOf(pu, el), label = p.name.toUpperCase() + (k > 1 ? ' ×' + k : ''), wd = 12 + label.length * 4 + 6;
        if (x + wd > OVW - 6 && x > 26) { x = 26; y += 12; }
        if (y > OVH - 30) break;
        badge(c, p, x, y + 1);
        X.text(c, label, x + 12, y + 3, p.ramp[1]);
        x += wd;
      }
      y += 14;
    }
    const h = Math.min(OVH, y + 14);
    const ready = r!.state[3] >= T(SURVIVE_TIMES.restartAfter);
    if (ready && Math.floor(t * 2.5) % 2 === 0) mid('SPACE: NEW RUN', h - 11, '#e8e4f0');
    else if (!ready) mid('...', h - 11, '#4a4560');
    // the card ends under its last line (the canvas is the tallest it can be)
    c.clearRect(0, h, OVW, OVH - h); X.rect(c, 0, h - 1, OVW, 1, '#0a0810');
    this.ovTex.source.update();
    this.over.position.set(Math.round(viewW / 2 - OVW / 2), Math.round(viewH / 2 - h / 2 - 20));
  }

  /**
   * The battery's lesson (battery-text.ts): what to do now and the keys for it, in place of any wave count or timer
   * (the user: the waves felt too arcade-like). Away from the defences it asks you to step up to one; driving, it
   * teaches the step's cast; after the lesson it shows nothing.
   */
  private drawLesson(w: World, viewW: number): void {
    const c = this.tc.x, step = w.enc.state[1], driving = w.battery!.drive[this.seat] >= 0;
    c.clearRect(0, 0, TW, TH); c._fs = null;
    const p = driving ? DRIVING[step] : step <= BSTEP.brute ? STEP_UP : undefined;
    this.top.visible = !!p && w.enc.state[0] !== 0;
    if (!p || !this.top.visible) return;
    const head = X.fontText(p.head.toUpperCase()), line = X.fontText(p.line.toUpperCase()), keys = X.fontText(p.keys.toUpperCase());
    const wd = Math.min(TW - 2, Math.max(head.length, line.length, keys.length) * 4 + 12), x = Math.round(TW / 2 - wd / 2);
    X.rect(c, x - 1, 0, wd + 2, 25, '#0a0810'); X.rect(c, x, 1, wd, 23, '#1a1726'); X.rect(c, x, 1, wd, 1, '#3a3450');
    X.text(c, head, Math.round(TW / 2 - head.length * 2), 3, '#ffd860');
    X.text(c, line, Math.round(TW / 2 - line.length * 2), 10, '#e8e4f0');
    X.text(c, keys, Math.round(TW / 2 - keys.length * 2), 17, '#ff9a5a');
    this.ttex.source.update();
    this.top.position.set(Math.round(viewW / 2 - TW / 2), 3);
  }

  /** The wave director's state: the lull's countdown and the incoming mix, the wave's foes left. */
  private drawWave(w: World, t: number, viewW: number): void {
    const c = this.tc.x, st = w.enc.state, e = w.enc;
    c.clearRect(0, 0, TW, TH); c._fs = null;
    if (w.battery) { this.drawLesson(w, viewW); return; }
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
    } else if (w.run && w.run.choose[this.seat]) {
      // +1 to three: the element keys pick, and the blanks fill in as you tap
      const r = w.run, at = this.seat * 3;
      line = '+1 TO: ' + [0, 1, 2].map((k) => (r.chosen[at + k] ? elementName(r.chosen[at + k]) : '_')).join(' ');
      sub = 'TAP THREE ELEMENT KEYS (NOT SHIELD OR SIGIL)';
    } else if (st[0] === PHASE_ENC.pick && w.run) {
      // which altar am I on (or nearest), and who still has to choose
      const r = w.run, b = w.bodies, me = this.seat;
      let near = -1, nd = 1e9;
      for (let a = 0; a < N_ALTARS; a++) { const d = Math.hypot(b.x[me] - r.ax[a], b.y[me] - r.ay[a]); if (r.offer[a] && d < nd) { nd = d; near = a; } }
      const left = [];
      for (let s = 0; s < MAX_SEATS; s++) if (w.seats.active[s] && !w.bodies.downed[s] && (r.picked[s] < 0 || r.choose[s])) left.push('P' + (s + 1));
      if (r.picked[me] >= 0) { line = 'PICKED: ' + perkOf(r.offer[r.picked[me]], r.offerEl[r.picked[me]]).name; sub = left.length ? `WAITING FOR ${left.join(' ')}` : ''; }
      else {
        line = 'PICK A POWER-UP: STAND ON AN ALTAR';
        sub = near >= 0 && nd < 2.2 ? perkOf(r.offer[near], r.offerEl[near]).rule : 'NO RUSH: THE WAVE WAITS FOR EVERYONE';
      }
    } else if (st[0] === PHASE_ENC.over) { line = 'RUN OVER'; sub = `WAVES SURVIVED: ${w.run ? w.run.state[1] : st[3]}`; }
    else { line = `BREATHER ${secs}S`; sub = `${st[3]} CLEARED`; }
    // Rally in progress: who is bringing whom back, and how far along
    if (w.run && st[0] !== PHASE_ENC.over) {
      for (let d = 0; d < MAX_SEATS; d++) {
        const by = w.run.rallyBy[d];
        if (by >= 0 && w.run.rally[d] > 0) sub += `${sub ? '  ' : ''}P${by + 1} RALLYING P${d + 1} ${Math.floor((100 * w.run.rally[d]) / T(PERKS.rallyTime))}%`;
      }
    }
    // Echo is a one-wave power: say so while it lasts
    if (w.run && w.run.echoOn[this.seat] && (st[0] === PHASE_ENC.lull || st[0] === PHASE_ENC.wave)) sub += `${sub ? '  ' : ''}ECHO: YOUR SPELLS GO OFF TWICE`;
    line = X.fontText(line); sub = X.fontText(sub);
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
    this.drawPerks(w);
    this.perks.position.set(3, 3);
    this.drawOver(w, t, viewW, viewH);
    const c = this.c.x, s = w.seats, i = this.seat;
    c.clearRect(0, 0, CW, CH); c._fs = null;
    const x0 = Math.round(CW / 2 - PW / 2 + 7), y0 = CH - PH - 1;
    // Locked elements (the tutorial's gating: max 0) show as empty sockets in the whole bar, filling in as
    // they're given; the bar shows once any rune is (in the tutorial, from the rune chapter on, even empty).
    let unlocked = 0;
    for (let e = 1; e <= N_EL; e++) {
      const open = runeMax(w, i, e) > 0;
      if (open) unlocked++;
      // an element this beat gives (the last one didn't): its socket fills with a flash
      if (open && !this.unlocked[e] && w.tut) { const k = TUT_ORDER.indexOf(w.tut.state[TUT_STATE.beat]); if (k <= 0 || tutPool(TUT_ORDER[k - 1], e) <= 0) this.unlockAt[e] = t; }
      this.unlocked[e] = open ? 1 : 0;
    }
    const driven = !!w.battery && w.battery.drive[i] >= 0;
    const bar = !driven && (unlocked > 0 || (!!w.tut && w.tut.state[TUT_STATE.beat] >= TUT_RUNES_FROM)); // a defence has its own bar, below
    // the backing plate follows the stagger: the top row is narrower than the bottom
    if (bar) {
      const plate = '#141220';
      X.rect(c, x0 - 1, y0 - 1, TOP.length * SLOT + 8, RH + 5, '#0a0810'); X.rect(c, x0 - 1, y0 + RH + 2, PW + 2, RH + 6, '#0a0810');
      X.rect(c, x0, y0, TOP.length * SLOT + 6, RH + 5, plate); X.rect(c, x0, y0 + RH + 3, PW, RH + 4, plate);
      X.rect(c, x0, y0, TOP.length * SLOT + 6, 1, '#3a3450');
    }
    if (w.battery) {
      if (!driven && pedestalNear(w, i) >= 0) X.text(c, 'X: TAKE CONTROL', Math.round(CW / 2 - 30), Math.max(0, y0 - 9), '#ffd860', '#0a0810');
    }
    // the player's colour tab
    const team = X.TEAMS[i % 4];
    if (bar || s.guard[i] || s.weapon[i]) { X.rect(c, x0 - 14, y0 + RH - 4, 13, 15, '#0a0810'); X.rect(c, x0 - 13, y0 + RH - 3, 12, 13, team.dark); X.text(c, 'P' + (i + 1), x0 - 11, y0 + RH + 1, team.light); }
    // what's in your hands: the conjured weapon (its element and uses left) and a guard, under the badge
    if (s.weapon[i]) {
      const el = elementName(s.weapon[i]);
      X.rect(c, x0 - 14, y0 + RH + 12, 13, 16, '#0a0810');
      X.icon(c, el as Element, x0 - 12, y0 + RH + 13, X.EL[el][2]);
      X.text(c, String(s.weaponUses[i]), x0 - 13, y0 + RH + 22, s.weaponUses[i] <= 5 ? '#ff6a6a' : '#cfc9e6');
    }
    // the guard: a bar in its colour (Shield gold for the Mirror buckler), as tall as the HP it has left
    if (s.guard[i]) {
      const GE = ['shield', 'earth', 'shield', 'fire', 'cold', 'lightning', 'water', 'arcane', 'life'][s.guard[i]] ?? 'shield';
      const name = GUARD_NAME[s.guard[i]] ?? 'mirror', k = Math.max(0, Math.min(1, s.guardHp[i] / (((ARMS.hp as Record<string, number>)[name] || 70) * guardSize(w, i))));
      X.rect(c, x0 - 4, y0 + RH + 12, 4, 16, '#0a0810');
      X.rect(c, x0 - 3, y0 + RH + 12 + Math.round(16 * (1 - k)), 2, Math.max(1, Math.round(16 * k)), X.EL[GE][2]);
    }

    const channel = s.phase[i] === PHASE.channel, spec = s.phase[i] !== PHASE.idle ? specOf(w, i) : null;
    const upkeep = channel && spec && s.chanTicks[i] >= T(RHYTHM.naturalChannel) ? spec.form : 0;
    // the shared regen budget: each refilling pool's share of R (0..1) sets how bright its flow shows
    const full = fullMask(w, i), R = regenOf(w, i);
    if (driven) this.deviceBar(c, w, i, FLAME_TURRET, x0, y0, t, runeRate(w, i, elementId(FLAME_TURRET.el), full) / Math.max(R, 1e-6), upkeep === elementId(FLAME_TURRET.el));
    // queued runes are reserved: they show as spent pips until cast or refunded
    [...TOP, ...BOT].forEach((el, k) => {
      const row = k < TOP.length ? 0 : 1, col = row ? k - TOP.length : k, id = elementId(el), ramp = X.EL[el];
      if (!bar) return;
      const sx = x0 + 3 + col * SLOT + (row ? STAG : 0), sy = y0 + 3 + row * (RH + 3);
      if (runeMax(w, i, id) <= 0) {
        // locked: an empty socket, sunk into the plate
        X.rect(c, sx, sy, SLOT - 2, RH - 1, '#0c0a14'); X.rect(c, sx, sy + RH - 2, SLOT - 2, 1, '#221e30');
        X.rect(c, sx + SLOT - 3, sy, 1, RH - 1, '#1c1828');
        X.ring(c, sx + 5, sy + 6, 3, 3, '#1f1c2e');
        return;
      }
      const dryK = t - this.dryAt[id] < 0.5, dry = dryK && Math.floor(t * 8) % 2 === 0;
      X.rect(c, sx, sy, SLOT - 2, RH - 1, dry ? '#3a1418' : '#1f1c2e'); X.rect(c, sx, sy, SLOT - 2, 1, dry ? '#a03040' : '#3e3854'); X.rect(c, sx, sy + RH - 2, SLOT - 2, 1, '#0c0a14');
      X.rect(c, sx, sy, 1, RH - 1, '#2c2840'); X.rect(c, sx + SLOT - 3, sy, 1, RH - 1, '#110e1a');
      const pulse = t - this.spentAt[id] < 0.25 ? 1 : 0;
      const drain = upkeep === id;
      X.icon(c, el, sx + 2, sy + 2 - pulse, ramp[drain ? 1 : 2]);
      X.text(c, rules.ELEMENTS[el].key, sx + 13, sy + 3, dryK ? '#ff6a6a' : '#6a6484');
      if (drain) { X.rect(c, sx + 13, sy + 9, 3, 1, '#ff6a6a'); X.px(c, sx + 18, sy + 9 + mod(t * 2.2, 1) * 4, ramp[2]); }
      const v = s.runes[i * N_EL + id - 1], max = Math.round(runeMax(w, i, id));
      const share = R > 0 ? runeRate(w, i, id, full) / R : 0; // ghosts and debt take all of it while owed
      this.pips(c, sx, sy + 11, v, max, ramp, t, share);
      // the tutorial just gave you this element: its socket flashes in its colour
      const fresh = w.tut ? t - this.unlockAt[id] : 9;
      if (fresh >= 0 && fresh < 1.2 && Math.floor(fresh * 8) % 2 === 0) {
        X.rect(c, sx - 1, sy - 1, SLOT, 1, ramp[1]); X.rect(c, sx - 1, sy + RH - 1, SLOT, 1, ramp[1]);
        X.rect(c, sx - 1, sy - 1, 1, RH, ramp[1]); X.rect(c, sx + SLOT - 2, sy - 1, 1, RH, ramp[1]);
      }
      // the flow line under the pips: as long and as bright as this pool's share of the regen
      if (share > 0.005) {
        const fw = Math.max(1, Math.round((SLOT - 6) * Math.min(1, share * 1.6)));
        X.rect(c, sx + 2, sy + RH - 3, fw, 1, flowCol(ramp, share));
        X.px(c, sx + 2 + Math.floor(mod(t * (2 + 10 * share), 1) * fw), sy + RH - 3, ramp[0]);
      }
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
      // a ghost rune (queued without a whole rune: regen is filling it) shows dim and blinking until it's paid
      q.forEach((id, k) => { if (k) X.text(c, '+', cx + 2 + k * 14 - 5, cy + 3, '#ffffff'); const ghost = s.owe[i * QUEUE_MAX + k] > 0; X.icon(c, elementName(id), cx + 2 + k * 14, cy + 2, X.EL[elementName(id)][ghost ? (Math.floor(t * 4) % 2 ? 3 : 1) : 2]); });
      if (Math.floor(t * 6) % 2 && q.length < QUEUE_MAX) X.rect(c, cx + 4 + q.length * 14, cy + 7, 3, 1, '#e8e4f0');
      X.text(c, 'QUEUE', cx + cw - 21, cy + 3, '#8a8498');
    }
    this.tex.source.update();
    this.sprite.position.set(Math.round(viewW / 2 - CW / 2), Math.max(0, viewH - CH - 3));
  }

  /** The rune bar's plate with the player tab and the queue chip above it, in HUD px (overlays such as the help panel keep clear of it). */
  barRect(): { x: number; y: number; w: number; h: number } {
    const x0 = Math.round(CW / 2 - PW / 2 + 7), y0 = CH - PH - 1;
    return { x: this.sprite.x + x0 - 14, y: this.sprite.y + y0 - 15, w: PW + 16, h: PH + 16 };
  }

  /**
   * The bar while you operate a device: the same footprint as the rune bar, all of it given to the device's one element. Each
   * rune is a large cell that fills from the bottom, with the regen flowing along underneath.
   */
  private deviceBar(c: X.Ctx, w: World, i: number, dev: DeviceBar, x0: number, y0: number, t: number, share: number, drain: boolean): void {
    const id = elementId(dev.el), ramp = X.EL[dev.el], v = w.seats.runes[i * N_EL + id - 1], max = Math.round(runeMax(w, i, id));
    const dryK = t - this.dryAt[id] < 0.5, dry = dryK && Math.floor(t * 8) % 2 === 0;
    X.rect(c, x0 - 1, y0 - 1, PW + 2, PH + 2, '#0a0810'); X.rect(c, x0, y0, PW, PH, dev.plate); X.rect(c, x0, y0, PW, 1, ramp[2]); X.rect(c, x0, y0 + PH - 1, PW, 1, dev.rim);
    const pulse = t - this.spentAt[id] < 0.25 ? 1 : 0;
    X.icon(c, dev.el, x0 + 4, y0 + 3 - pulse, ramp[1]);
    X.text(c, dev.name, x0 + 16, y0 + 5, ramp[0]);
    X.text(c, 'X: STEP AWAY', x0 + PW - 50, y0 + 5, '#c09070');
    const gap = 3, cx0 = x0 + 4, cw = Math.floor((PW - 8 - gap * (max - 1)) / Math.max(1, max)), cy = y0 + 14, ch = 24;
    for (let p = 0; p < max; p++) {
      const x = cx0 + p * (cw + gap), fill = Math.max(0, Math.min(1, v - p));
      X.rect(c, x - 1, cy - 1, cw + 2, ch + 2, dry ? '#a03040' : '#0a0810'); X.rect(c, x, cy, cw, ch, '#1a0e08');
      if (fill <= 0.01) continue;
      const h = Math.max(1, Math.round(fill * ch)), top = cy + ch - h, whole = fill >= 0.999;
      X.rect(c, x, top, cw, h, whole ? ramp[2] : flowCol(ramp, share));
      X.rect(c, x, top, 2, h, ramp[1]);
      X.rect(c, x + cw - 2, top, 2, h, ramp[3]);
      X.rect(c, x, top, cw, 1, whole ? ramp[0] : Math.floor(t * (4 + 14 * share)) % 2 ? ramp[0] : ramp[1]);
    }
    // the flow line: how fast the pool is refilling, and red while a long channel eats into it
    const lw = PW - 8, fw = Math.round(lw * Math.min(1, share));
    X.rect(c, x0 + 4, y0 + 41, lw, 3, '#1a0e08');
    if (fw > 0) { X.rect(c, x0 + 4, y0 + 41, fw, 3, drain ? '#ff6a6a' : ramp[2]); X.px(c, x0 + 4 + Math.floor(mod(t * (2 + 10 * share), 1) * fw), y0 + 42, ramp[0]); }
  }

  /** A rune was spent from the pool (a cast): its icon hops. */
  spent(id: number, t: number): void { this.spentAt[id] = t; }

  /**
   * One cap's runes. Up to 5: a row of pips (the regenerating one fills from the bottom). 6 to 10:
   * two rows of shorter pips, the first five on top. More: a bar with a tick every 5 runes, and the count.
   */
  private pips(c: X.Ctx, sx: number, py: number, v: number, max: number, ramp: readonly string[], t: number, share = 0): void {
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
        // the filling pip glows brighter, and its rim shimmers faster, the bigger its share of the regen
        const fh = Math.max(1, Math.round(frac * h)); X.rect(c, px, y + h - fh, 3, fh, flowCol(ramp, share));
        X.rect(c, px, y + h - fh, 3, 1, Math.floor(t * (4 + 14 * share)) % 2 ? ramp[0] : ramp[1]);
        if (rows === 1) X.rect(c, px, y - 1, 3, 1, '#2a2638');
      } else if (rows === 1) X.rect(c, px + 1, y + 2, 1, 2, '#2a2638');
    }
  }
}
