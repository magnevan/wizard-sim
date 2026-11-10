/**
 * Sim -> sound. The director reads sim events and state and asks a Sink (the engine, or a fake in the
 * tests) to play recipes. It never writes to the sim. No Web Audio here, so all of it runs in node.
 *
 * Rollback, the same deal the effects have (art/vfx.ts, "late remote spells"):
 * - One-shots come from shown steps only: the replay skips afterStep, so nothing plays twice.
 * - A replay can bring out events we never showed (a remote cast that arrived late). replayStep sees
 *   every replayed event and keeps the ones nothing has played yet, and postRewind plays them. A
 *   replayed event counts as played if one of the same kind, by the same body, sounded within a few
 *   ticks: a corrected step moves things by a tick or two, and that must not sound twice.
 * - Sustained sounds aren't started or stopped by events at all. Each frame lists what the state says
 *   should be sounding and LoopTable diffs it, so a corrected prediction is a fade, never a click or a
 *   stuck loop, and a late remote channel simply starts sounding.
 * - State-change sounds (enemy attack beats, missiles landing, walls breaking) compare against what
 *   the last shown step saw, so a change made inside a replay is heard at the next shown step.
 */
import {
  AI, ARCH, DEVICE, KIND, MAX_DEVICES, MAX_MISSILES, MAX_SEATS, MAX_ZONES, N_EL, PHASE, QUEUE_MAX, SURF, ZONE, compile, elementName, queueFromCounts, specOf, terrainAlong,
  type SimEvent, type SpellSpec, type Terrain, type World,
} from '@wizard-sim/sim';
import {
  composeAuraLoop, composeBlink, composeBlocked, composeBurning, composeCharge, composeDeath, composeDismiss, composeDowned, composeDry, composeFlight, composeFloorFire,
  composeFootstep, composeHeal, composeHit, composeImpact, composeInteraction, composeMove, composeQueue, composeRain, composeRockBreak,
  composeSparkField, composeSpell, composeSpring, composeSteamCloud, composeStinger, composeStrike, composeStop, composeSustain, composeTelegraph, composeUi,
  shapeOf, type ElementName, type EnemyKind, type Plan, type ShapeName, type SpellSound, type UiSound, type WeaponMove,
} from './recipes';
import { LoopTable, Limiter, crosses, envOfRoom, jitter, placeOf, type EnvName, type GroupRule, type Listener, type Place, type Rand } from './variation';

/** How many of the room's own rock walls lie on the line from the ears to a source. */
function terrainBetween(t: Terrain, ax: number, ay: number, bx: number, by: number): number {
  let n = 0;
  for (let q = 0, m = terrainAlong(t, ax, ay, bx, by, 0); q < m; q++) {
    const k = t.out[q];
    if (crosses(ax, ay, bx, by, t.x1[k], t.y1[k], t.x2[k], t.y2[k])) n++;
  }
  return n;
}

/** What the director needs from the engine. */
export interface SoundSink {
  /** False until audio can actually play (before the first input, or with no Web Audio): the director then does nothing. */
  readonly ready: boolean;
  play(plan: Plan, place: Place, gain: number): void;
  loop(key: string, plan: Plan, place: Place, gain: number): void;
  place(key: string, place: Place, gain: number): void;
  stop(key: string): void;
  setEnv(env: EnvName): void;
}

/** Roughly how long each group's sounds ring, s, for the limiter's count of what's still sounding. */
const RULES: Readonly<Record<string, GroupRule & { len: number; prio: number }>> = {
  cast: { gap: 0, max: 8, len: 0.7, prio: 10 },
  ui: { gap: 0.02, max: 4, len: 0.1, prio: 10 },
  stinger: { gap: 0.4, max: 2, len: 1.2, prio: 9 },
  move: { gap: 0.03, max: 4, len: 0.3, prio: 7 },
  death: { gap: 0.05, max: 5, len: 0.8, prio: 7 },
  burst: { gap: 0.04, max: 5, len: 0.6, prio: 6 },
  interaction: { gap: 0.08, max: 3, len: 0.6, prio: 6 },
  impact: { gap: 0.04, max: 5, len: 0.4, prio: 5 },
  attack: { gap: 0.06, max: 5, len: 0.4, prio: 5 },
  zap: { gap: 0.07, max: 3, len: 0.2, prio: 4 },
  hit: { gap: 0.05, max: 5, len: 0.2, prio: 4 },
  heal: { gap: 0.12, max: 2, len: 0.5, prio: 3 },
  foot: { gap: 0.09, max: 3, len: 0.15, prio: 1 },
};

/** Fewer than this much left after distance and walls: not worth a voice. */
const INAUDIBLE = 0.025;
/** How many ticks apart a replayed event and a shown one can be and still be the same event. */
const SAME_EVENT_TICKS = 6;
/** How long a late event stays worth hearing (a rollback's 1 s window, and a little). */
const LATE_MAX_TICKS = 75;
/** World units walked per footfall. */
const STRIDE = 1.7;
/** At most this many sustained sounds at once, nearest first. */
const MAX_LOOPS = 10;
/** The sim has stood still this long (s): a pause or a stalled link. Sustained sounds fade until it moves. */
const STILL_S = 0.2;

interface Req { group: string; key: string; x: number; y: number; make: () => Plan; centred: boolean; gain: number; }
interface Want { plan: () => Plan; x: number; y: number; gain: number; centred?: boolean; /** What it sounds like as it ends, if not just a fade. */ tail?: () => Plan | null }

const elOf = (id: number | undefined): ElementName | null => (id !== undefined && id >= 1 && id <= 9 ? elementName(id) as ElementName : null);

const ENEMY_NAME: Readonly<Record<number, EnemyKind>> = {
  [ARCH.swarmer]: 'swarmer', [ARCH.brute]: 'brute', [ARCH.shieldbearer]: 'shieldbearer', [ARCH.caster]: 'caster', [ARCH.grabber]: 'grabber', [ARCH.imp]: 'imp',
};

/** The sim's move names, as the moves the ear knows. */
const MOVES: Readonly<Record<string, WeaponMove>> = {
  strike: 'strike', staff: 'strike', lash: 'strike', javelin: 'strike', chargedbolt: 'heavy', sweep: 'sweep', tideslash: 'heavy', firewave: 'heavy', fissure: 'heavy', lance: 'heavy', imbue: 'strike',
  block: 'block', glance: 'block', guardbreak: 'block', parry: 'parry',
  backstep: 'retreat', shovestep: 'retreat', iceslide: 'retreat', flamestep: 'retreat', seedstep: 'retreat', phase: 'retreat', surge: 'retreat', tidewave: 'retreat', flameburst: 'retreat', spark: 'retreat',
  dash: 'dash',
};

export function spellSoundOf(spec: SpellSpec): SpellSound {
  const els: SpellSound['els'] = {};
  for (let i = 0; i < 9; i++) if (spec.counts[i]) els[elementName(i + 1) as ElementName] = spec.counts[i];
  return { els, shape: shapeOf(spec.shape), lead: elOf(spec.look) ?? undefined, form: spec.shape };
}

export class SoundDirector {
  readonly limiter = new Limiter();
  private loops = new LoopTable<Want>();
  private pending: Req[] = [];
  /** Recently heard events, for telling a replayed event from a late one: a ring of tick, kind, who. */
  private heard: { tick: number; key: string }[] = [];
  private heardAt = 0;
  private late: { e: SimEvent; spell: SpellSound | null }[] = [];
  private lastTick = -1;
  private lastNowTick = -1;
  private stillSince = 0;
  private env: EnvName | null = null;
  private mAlive = new Uint8Array(MAX_MISSILES);
  private mLook = new Uint8Array(MAX_MISSILES);
  private mX = new Float64Array(MAX_MISSILES); private mY = new Float64Array(MAX_MISSILES);
  private mR = new Float64Array(MAX_MISSILES); private mType = new Uint8Array(MAX_MISSILES);
  private prevAi: Uint8Array | null = null;
  private prevWall: Uint8Array | null = null;
  private walked: Float64Array | null = null;
  private lastX: Float64Array | null = null; private lastY: Float64Array | null = null;
  private lastCastTick = new Int32Array(MAX_SEATS).fill(-999);
  private floorFire = { n: 0, x: 0, y: 0, at: -1 };
  private held: ({ key: number; snd: SpellSound; sig: string } | null)[] = new Array(MAX_SEATS).fill(null);
  private frames = 0;
  /** Sustained sounds with an ending of their own, and where they last were. */
  private tails = new Map<string, { plan: () => Plan | null; x: number; y: number }>();
  /** The Sound Lab's ears: which kinds of sound may play (by group, or a loop's first word), whether blows have their punch, and a tap on what's played. */
  hear: ((kind: string) => boolean) | null = null;
  punches = true;
  onPlan: ((name: string, looped: boolean, id?: string) => void) | null = null;

  constructor(private sink: SoundSink, private rand: Rand = Math.random) {}

  private ok(): boolean { return this.sink.ready; }

  private seen(e: SimEvent): void {
    this.heard[this.heardAt++ & 255] = { tick: e.tick, key: `${e.kind}/${e.who}` };
  }
  private wasHeard(e: SimEvent): boolean {
    const k = `${e.kind}/${e.who}`;
    for (const h of this.heard) if (h && h.key === k && Math.abs(h.tick - e.tick) <= SAME_EVENT_TICKS) return true;
    return false;
  }

  /** The world started over (a room switch, a new match): forget the old one, quietly. */
  private reset(): void {
    for (const id of this.loops.clear()) this.sink.stop(id);
    this.pending = []; this.late = []; this.heard = []; this.heardAt = 0; this.tails.clear();
    this.prevAi = this.prevWall = this.walked = this.lastX = this.lastY = null;
    this.mAlive.fill(0); this.lastCastTick.fill(-999); this.floorFire.at = -1;
    this.limiter.reset();
  }

  /** After each shown sim step. `isLocal`: seats played on this screen hear their own queue. */
  afterStep(w: World, isLocal: (seat: number) => boolean): void {
    const tick = w.clock[0];
    if (tick < this.lastTick) this.reset();
    this.lastTick = tick;
    if (!this.ok()) return;
    for (const e of w.events) { this.seen(e); this.onEvent(w, e, isLocal, e.kind === 'cast' && e.who >= 0 && e.who < MAX_SEATS ? spellSoundOf(specOf(w, e.who)) : null); }
    this.watchMissiles(w);
    this.watchEnemies(w);
    this.watchWalls(w);
    this.watchFeet(w);
  }

  /** After each step a rollback replays: keep what was never heard, with the spell as it stood at that tick. */
  replayStep(w: World, localSeat: number): void {
    if (!this.ok()) return;
    for (const e of w.events) {
      if (e.who === localSeat || e.kind === 'queue' || e.kind === 'dry' || e.kind === 'cancel' || this.wasHeard(e)) continue;
      this.seen(e);
      this.late.push({ e, spell: e.kind === 'cast' && e.who >= 0 && e.who < MAX_SEATS ? spellSoundOf(specOf(w, e.who)) : null });
    }
  }

  /** The replay is done: late events sound now. Their missiles and channels are already in the state. */
  postRewind(w: World): void {
    const late = this.late, tick = w.clock[0];
    this.late = [];
    if (!this.ok()) return;
    for (const { e, spell } of late) if (tick - e.tick <= LATE_MAX_TICKS) this.onEvent(w, e, () => false, spell);
  }

  /** `sub` gives a kind of sound its own gap and ceiling within the group: a douse mustn't swallow a shatter. */
  private ask(group: string, x: number, y: number, make: () => Plan, gain = 1, centred = false, sub = ''): void {
    if (this.hear && !this.hear(group)) return;
    this.pending.push({ group, key: group + sub, x, y, make, gain, centred });
  }

  private onEvent(w: World, e: SimEvent, isLocal: (seat: number) => boolean, spell: SpellSound | null): void {
    const r = this.rand, el = elOf(e.look), x = e.x, y = e.y;
    switch (e.kind) {
      case 'queue':
        if (isLocal(e.who) && el) { const n = w.seats.queueLen[e.who]; this.ask('ui', x, y, () => composeQueue(el, n), 1, true); }
        return;
      case 'dry': if (isLocal(e.who)) this.ask('ui', x, y, composeDry, 1, true); return;
      case 'cancel':
        this.ask('interaction', x, y, () => composeInteraction('cancel', r), isLocal(e.who) ? 1 : 0.6, false, 'cancel');
        return;
      case 'cast':
        if (e.who < 0) { this.onBanner(e.text ?? ''); return; }
        if (spell) {
          this.lastCastTick[e.who] = e.tick;
          // what's placed sounds from where it lands, not from the hand
          const out = spell.shape === 'place';
          this.ask('cast', out ? x + w.seats.aimX[e.who] : x, out ? y + w.seats.aimY[e.who] : y, () => composeSpell(spell, r));
        }
        return;
      case 'hit': {
        if (e.text === 'Doused') { this.ask('interaction', x, y, () => composeInteraction('douse', r), 1, false, 'douse'); return; }
        if (e.text === 'Parry!') { this.ask('move', x, y, () => composeMove('parry', null, r)); return; }
        if (e.text === 'Grabbed!') { this.ask('attack', x, y, () => composeHit(null, 20, r)); return; }
        const amount = e.amount ?? 0;
        if (amount > 0) this.ask(`hit`, x, y, () => composeHit(el, amount, r, this.punches));
        return;
      }
      case 'heal': this.ask('heal', x, y, () => composeHeal(r)); return;
      case 'burst': {
        // a nova's own burst: the cast this same tick already is that sound
        if (e.who >= 0 && e.who < MAX_SEATS && e.tick - this.lastCastTick[e.who] <= 2) return;
        const gone = e.text === 'dismissed' && el ? composeDismiss(el, r) : null;
        if (gone) { this.ask('burst', x, y, () => gone); return; }
        const size = Math.max(0.4, (e.amount ?? 1) / 2);
        this.ask('burst', x, y, () => composeImpact(el ?? 'arcane', size * 1.4, r));
        return;
      }
      case 'zap': this.ask('zap', x, y, () => composeImpact('lightning', 0.4, r), 0.7); return;
      case 'surge': this.ask('zap', x, y, () => composeImpact('lightning', 0.6, r)); return;
      case 'blink': this.ask('move', x, y, composeBlink); return;
      case 'shatter': this.ask('interaction', x, y, () => composeInteraction('shatter', r), 1, false, 'shatter'); return;
      case 'freeze': this.ask('interaction', x, y, () => composeInteraction('freeze', r), 1, false, 'freeze'); return;
      case 'fizzle':
        if (e.text === 'dies') {
          const kind = e.look === ARCH.brute ? 'big' : 'small', killer = elOf(e.el);
          this.ask('death', x, y, () => composeDeath(kind, killer, r));
        } else if (e.text === 'downed') this.ask('death', x, y, composeDowned);
        else if (e.text === 'Blocked') this.ask('impact', x, y, () => composeBlocked(r));
        else if (e.text === 'rally broken') this.ask('ui', x, y, () => composeUi('error'));
        return;
      case 'move': {
        const m = MOVES[e.text ?? ''];
        if (m) this.ask('move', x, y, () => composeMove(m, el, r));
        return;
      }
      case 'todo': return;
    }
  }

  private onBanner(text: string): void {
    const k = /^Wave|^New run/.test(text) ? 'wave' : /Cleared/.test(text) ? 'clear' : /over|Wiped/.test(text) ? 'lose' : null;
    if (k) this.ask('stinger', 0, 0, () => composeStinger(k), 1, true);
  }

  /** Missiles that ended since the last shown step land with their element. */
  private watchMissiles(w: World): void {
    const m = w.missiles;
    for (let j = 0; j < MAX_MISSILES; j++) {
      if (!m.alive[j] && this.mAlive[j]) {
        const el = elOf(this.mLook[j]) ?? 'arcane', size = this.mType[j] === 1 ? 1.6 : 0.5 + Math.min(0.8, this.mR[j]), x = this.mX[j], y = this.mY[j];
        this.ask('impact', x, y, () => composeImpact(el, size, this.rand));
      }
      this.mAlive[j] = m.alive[j];
      if (m.alive[j]) { this.mLook[j] = m.look[j]; this.mX[j] = m.x[j]; this.mY[j] = m.y[j]; this.mR[j] = m.r[j]; this.mType[j] = m.type[j]; }
    }
  }

  /** An enemy's attack beats, from its ai state: the wind-up's telegraph, then the blow as it leaves. */
  private watchEnemies(w: World): void {
    const b = w.bodies, r = this.rand;
    if (!this.prevAi) this.prevAi = new Uint8Array(b.ai.length);
    const prev = this.prevAi;
    for (let i = MAX_SEATS; i < b.kind.length; i++) {
      const ai = b.ai[i], was = prev[i];
      prev[i] = ai;
      if (b.kind[i] !== KIND.enemy || ai === was) continue;
      const kind = ENEMY_NAME[b.arch[i]];
      if (!kind) continue;
      const x = b.x[i], y = b.y[i];
      if (ai === AI.windup) this.ask('attack', x, y, () => composeTelegraph(kind, r));
      else if ((ai === AI.cooldown && was === AI.windup) || ai === AI.dash) this.ask('attack', x, y, () => composeStrike(kind, r));
    }
  }

  /** A rock wall that was standing and isn't any more has broken, or run out. */
  private watchWalls(w: World): void {
    const wl = w.walls;
    if (!this.prevWall) { this.prevWall = Uint8Array.from(wl.type); return; }
    for (let k = 0; k < wl.type.length; k++) {
      if (this.prevWall[k] === 1 && !wl.type[k]) {
        const x = (wl.x1[k] + wl.x2[k]) / 2, y = (wl.y1[k] + wl.y2[k]) / 2;
        this.ask('burst', x, y, () => composeRockBreak(this.rand));
      }
      this.prevWall[k] = wl.type[k];
    }
  }

  /** Footfalls by distance walked: wizards and brutes (a whole wave's feet would be noise). */
  private watchFeet(w: World): void {
    const b = w.bodies, n = b.kind.length;
    if (!this.walked) { this.walked = new Float64Array(n); this.lastX = Float64Array.from(b.x); this.lastY = Float64Array.from(b.y); return; }
    for (let i = 0; i < n; i++) {
      const k = b.kind[i], heavy = k === KIND.enemy && b.arch[i] === ARCH.brute;
      if (k !== KIND.wizard && !heavy) continue;
      const d = Math.hypot(b.x[i] - this.lastX![i], b.y[i] - this.lastY![i]);
      this.lastX![i] = b.x[i]; this.lastY![i] = b.y[i];
      if (d > 1) continue; // a blink, a rollback snap
      this.walked[i] += d;
      if (this.walked[i] >= (heavy ? STRIDE * 1.6 : STRIDE)) {
        this.walked[i] = 0;
        const x = b.x[i], y = b.y[i];
        this.ask('foot', x, y, () => composeFootstep(this.rand, heavy));
      }
    }
  }

  /** Everything sustained stops, and whatever should still be sounding starts over as it now is. */
  restartLoops(): void {
    for (const id of this.loops.clear()) { this.sink.stop(id); this.onPlan?.('', true, id); }
    this.tails.clear();
  }

  /** The sim stands still while a menu is open offline; the UI still clicks. */
  ui(kind: UiSound): void {
    if (!this.ok()) return;
    this.ask('ui', 0, 0, () => composeUi(kind), 1, true);
  }

  /** The spell a seat is holding. Compiling one is costly and this runs every frame, so it's kept until the seat's spell changes. */
  private heldSpell(w: World, i: number): { key: number; snd: SpellSound; sig: string } {
    const s = w.seats;
    let key = s.castId[i] * 2 + s.dragged[i];
    for (let k = 0; k < s.castLen[i]; k++) key = key * 11 + s.castQueue[i * QUEUE_MAX + k];
    const c = this.held[i];
    if (c && c.key === key) return c;
    const spec = specOf(w, i), snd = spellSoundOf(spec);
    return (this.held[i] = { key, snd, sig: spec.title + '/' + snd.shape });
  }

  /** What the state says should be sounding, nearest first. */
  private wanted(w: World, l: Listener): Map<string, Want> {
    const out: [number, string, Want][] = [];
    const add = (id: string, want: Want) => { if (!this.hear || this.hear(id.split(/[:|]/)[0])) out.push([Math.hypot(want.x - l.cx, want.y - l.cy), id, want]); };
    const s = w.seats, b = w.bodies, z = w.zones, m = w.missiles;
    for (let i = 0; i < MAX_SEATS; i++) {
      if (!s.active[i]) continue;
      const ph = s.phase[i];
      if (ph === PHASE.channel) {
        const { snd, sig } = this.heldSpell(w, i);
        add(`chan:${i}|${sig}`, { plan: () => composeSustain(sustainOf(snd), this.rand), tail: () => composeStop(sustainOf(snd), this.rand), x: b.x[i], y: b.y[i], gain: 1 });
      } else if (ph === PHASE.charge) {
        const lead = this.heldSpell(w, i).snd.lead ?? 'earth';
        add(`charge:${i}|${lead}`, { plan: () => composeCharge(lead), x: b.x[i], y: b.y[i], gain: 1 });
      }
    }
    // an aura sounds for as long as it lasts, each element in it its own
    for (let i = 0; i < MAX_SEATS; i++) {
      if (!s.active[i] || s.aura[i] <= 0) continue;
      for (let e = 0; e < N_EL; e++) {
        if (!s.auraEls[i * N_EL + e]) continue;
        const el = elOf(e + 1), plan = el ? composeAuraLoop(el, this.rand) : null;
        if (plan) add(`aura:${i}|${el}`, { plan: () => plan, x: b.x[i], y: b.y[i], gain: 1 });
      }
    }
    // a turret's spray or beam is held, as a wizard's is (structures.ts)
    const dv = w.devices;
    for (let k = 0; k < MAX_DEVICES; k++) {
      if (dv.type[k] !== DEVICE.turret || dv.chan[k] <= 0) continue;
      const snd = spellSoundOf(compile(queueFromCounts(dv.els, k), 'force'));
      add(`chan:device${k}|${snd.shape}`, { plan: () => composeSustain(sustainOf(snd), this.rand), tail: () => composeStop(sustainOf(snd), this.rand), x: dv.x[k], y: dv.y[k], gain: 0.8 });
    }
    for (let k = 0; k < MAX_ZONES; k++) {
      const t = z.type[k];
      const plan = t === ZONE.rain ? composeRain : t === ZONE.steam ? composeSteamCloud : t === ZONE.spring ? composeSpring : t === ZONE.spark ? composeSparkField : null;
      if (plan) add(`zone:${k}|${t}`, { plan, x: z.x[k], y: z.y[k], gain: 1 });
    }
    // missiles in flight, a thin trail of their element; a few are enough
    let flying = 0;
    for (let j = 0; j < MAX_MISSILES && flying < 3; j++) {
      if (!m.alive[j]) continue;
      const el = elOf(m.look[j]);
      if (el) { flying++; add(`flight:${j}|${el}`, { plan: () => composeFlight(el), x: m.x[j], y: m.y[j], gain: 1 }); }
    }
    // burning bodies share one crackle, at the nearest of them
    let burnX = 0, burnY = 0, burnD = Infinity, burns = 0;
    for (let i = 0; i < b.kind.length; i++) {
      if (!b.kind[i] || !b.burn[i]) continue;
      const d = Math.hypot(b.x[i] - l.cx, b.y[i] - l.cy);
      burns++;
      if (d < burnD) { burnD = d; burnX = b.x[i]; burnY = b.y[i]; }
    }
    if (burns) add('burn|fire', { plan: composeBurning, x: burnX, y: burnY, gain: Math.min(1, 0.6 + burns * 0.08) });
    // burning floor: scanned a few times a second, it can't change faster than that matters
    const ff = this.floorFire;
    if (this.frames - ff.at >= 15 || ff.at < 0) {
      ff.at = this.frames; ff.n = 0; ff.x = 0; ff.y = 0;
      const { gw, gh, w: ww, h: wh } = w.dims, kinds = w.surf.kind;
      for (let c = 0; c < kinds.length; c++) if (kinds[c] === SURF.fire) { ff.n++; ff.x += ((c % gw) + 0.5) / gw * ww - ww / 2; ff.y += (Math.floor(c / gw) + 0.5) / gh * wh - wh / 2; }
      if (ff.n) { ff.x /= ff.n; ff.y /= ff.n; }
    }
    if (ff.n) add('floorfire|fire', { plan: composeFloorFire, x: ff.x, y: ff.y, gain: Math.min(1, 0.4 + ff.n / 80) });
    out.sort((p, q) => p[0] - q[0]);
    const map = new Map<string, Want>();
    for (const [, id, want] of out.slice(0, MAX_LOOPS)) map.set(id, want);
    return map;
  }

  /**
   * Once a frame: send out what the steps asked for, within the limits, and bring the sustained
   * sounds in line with the state. `now` is real time in seconds.
   */
  frame(w: World, l: Listener, now: number): void {
    if (!this.ok()) { this.pending = []; return; }
    this.frames++;
    const env = envOfRoom(w.def.id);
    if (env !== this.env) { this.env = env; this.sink.setEnv(env); }
    this.limiter.frame();
    // the room's own rock, as near the line as it is, counts as well as the walls that come and go
    const placeAt = (x: number, y: number): Place => placeOf(x, y, l, w.walls, terrainBetween(w.terrain, l.earX, l.earY, x, y));
    if (this.pending.length) {
      const reqs = this.pending;
      this.pending = [];
      if (reqs.length > 1) reqs.sort((a, b) => RULES[b.group].prio - RULES[a.group].prio);
      for (const q of reqs) {
        const place = q.centred ? { pan: 0, gain: 1, lowpass: 20000, wet: 0.4 } : placeAt(q.x, q.y);
        if (place.gain * q.gain < INAUDIBLE) continue;
        const rule = RULES[q.group], g = this.limiter.admit(q.key, rule, now, rule.len, rule.prio >= 9);
        if (!g) continue;
        const j = q.group === 'ui' ? { rate: 1, gain: 1 } : jitter(this.rand);
        const plan = q.make();
        for (const layer of plan.layers) { layer.rate *= j.rate; if (layer.rateTo) layer.rateTo *= j.rate; }
        this.sink.play(plan, place, q.gain * g * j.gain);
        this.onPlan?.(plan.name, false);
      }
    }
    // the sim standing still (a pause, a stalled link): sustained sounds fade until it moves again
    if (w.clock[0] !== this.lastNowTick) { this.lastNowTick = w.clock[0]; this.stillSince = now; }
    const still = now - this.stillSince > STILL_S;
    const want = still ? new Map<string, Want>() : this.wanted(w, l);
    const d = this.loops.sync(want);
    for (const id of d.stop) {
      this.sink.stop(id);
      const t = this.tails.get(id), plan = t && !still ? t.plan() : null;
      this.tails.delete(id);
      if (t && plan) { this.sink.play(plan, placeAt(t.x, t.y), 1); this.onPlan?.(plan.name, false); }
      this.onPlan?.('', true, id);
    }
    for (const { id, want: q } of d.start) {
      const plan = q.plan();
      this.sink.loop(id, plan, placeAt(q.x, q.y), q.gain);
      this.onPlan?.(plan.name, true, id);
      if (q.tail) this.tails.set(id, { plan: q.tail, x: q.x, y: q.y });
    }
    for (const { id, want: q } of d.update) { const t = this.tails.get(id); if (t) { t.x = q.x; t.y = q.y; } }
    if (this.frames % 4 === 0) for (const { id, want: q } of d.update) this.sink.place(id, placeAt(q.x, q.y), q.gain);
  }

  get loopCount(): number { return this.loops.size; }
}

const sustainOf = (s: SpellSound): SpellSound => ({ ...s, shape: s.shape === 'spray' ? 'spray' : 'beam' as ShapeName });
