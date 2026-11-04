/**
 * The tuning panel's meters: what one seat's play adds up to, as numbers you can compare after
 * nudging a knob. Pure (no DOM, no clock): it reads each tick's events and a few probes, and all
 * times are sim ticks, so a slowed or paused loop measures the same fight the same way.
 *
 * Approximations, on purpose (a balance hint, not an audit):
 * - Damage is every 'hit' with src === seat on a body other than the seat itself (friendly fire
 *   counts; self-damage doesn't). Burning and surfaces report src -1, so damage over time a
 *   spell leaves behind is not credited to anyone.
 * - Each hit is credited to the seat's most recently cast spell. A turret, a glyph or a beam
 *   still burning when you cast the next spell is credited to the new one.
 * - Runes spent are the cast's queue length when its 'cast' event fires. Channel upkeep past the
 *   natural duration, and Sigil runes paid per turret shot, are not counted.
 * - Time to kill runs from an enemy's first damaging hit (by anyone) to its 'dies' event.
 */
import { MAX_BODIES, PHASE_ENC, SIM_HZ, type SimEvent } from '@wizard-sim/sim';

export interface SpellRow { title: string; casts: number; damage: number; heal: number; runes: number }
export interface KillRow { arch: number; kills: number; seconds: number }
export interface WaveRow { wave: number; seconds: number }

/** What the meters need to know about the world beyond its events. */
export interface MeterProbe {
  /** Runes in the cast that seat `seat` just released (the sim's castLen). */
  castRunes(seat: number): number;
  /** Is body i an enemy right now? (stale time-to-kill clocks are dropped when not) */
  isEnemy(i: number): boolean;
  /** The wave director: PHASE_ENC and the wave number. */
  encPhase(): number;
  waveNo(): number;
}

const DPS_WIN = 3 * SIM_HZ;
const RUNE_WIN = 60;

export class Meters {
  totalDamage = 0;
  totalHeal = 0;
  totalRunes = 0;
  totalCasts = 0;
  readonly spells = new Map<string, SpellRow>();
  readonly kills = new Map<number, KillRow>();
  readonly waves: WaveRow[] = [];
  private startTick = -1;
  private tick = 0;
  private current: SpellRow | null = null;
  // per-tick damage for the rolling DPS, and per-second runes for the rolling rate (ring buffers)
  private dmgRing = new Float64Array(DPS_WIN);
  private dmgStamp = new Int32Array(DPS_WIN).fill(-1);
  private runeRing = new Float64Array(RUNE_WIN);
  private runeStamp = new Int32Array(RUNE_WIN).fill(-1);
  private firstHit = new Int32Array(MAX_BODIES).fill(-1);
  private lastPhase = -1;
  private waveStart = -1;

  constructor(readonly seat = 0) {}

  reset(): void {
    this.totalDamage = this.totalHeal = this.totalRunes = this.totalCasts = 0;
    this.spells.clear(); this.kills.clear(); this.waves.length = 0;
    this.startTick = -1; this.current = null;
    this.dmgStamp.fill(-1); this.runeStamp.fill(-1); this.firstHit.fill(-1);
    this.waveStart = -1; this.lastPhase = -1;
  }

  /** Feed it once per sim step, after the step, with that step's tick and events. */
  step(tick: number, events: readonly SimEvent[], probe: MeterProbe): void {
    if (this.startTick < 0) this.startTick = tick;
    this.tick = tick;
    let wiped = false;
    for (const e of events) {
      const amt = e.amount ?? 0;
      if (e.kind === 'cast' && e.who === this.seat) {
        const n = probe.castRunes(this.seat), title = e.text ?? '?';
        let row = this.spells.get(title);
        if (!row) { row = { title, casts: 0, damage: 0, heal: 0, runes: 0 }; this.spells.set(title, row); }
        row.casts++; row.runes += n; this.current = row;
        this.totalCasts++; this.totalRunes += n;
        this.bump(this.runeRing, this.runeStamp, Math.floor(tick / SIM_HZ), n);
      } else if (e.kind === 'cast' && e.who === -1 && e.text === 'Wiped') wiped = true;
      else if (e.kind === 'hit' && amt > 0) {
        if (e.who >= 0 && e.who < MAX_BODIES && this.firstHit[e.who] < 0 && probe.isEnemy(e.who)) this.firstHit[e.who] = tick;
        if (e.src === this.seat && e.who !== this.seat) {
          this.totalDamage += amt;
          this.bump(this.dmgRing, this.dmgStamp, tick, amt);
          this.spellRow().damage += amt;
        }
      } else if (e.kind === 'heal' && amt > 0 && e.src === this.seat) {
        this.totalHeal += amt;
        this.spellRow().heal += amt;
      } else if (e.kind === 'fizzle' && e.text === 'dies' && e.who >= 0 && e.who < MAX_BODIES) {
        const t0 = this.firstHit[e.who];
        this.firstHit[e.who] = -1;
        if (t0 < 0) continue;
        const arch = e.look ?? 0;
        let k = this.kills.get(arch);
        if (!k) { k = { arch, kills: 0, seconds: 0 }; this.kills.set(arch, k); }
        k.kills++; k.seconds += (tick - t0) / SIM_HZ;
      }
    }
    // a wave's clear time: from the wave starting to the breather, unless the party was wiped
    const ph = probe.encPhase();
    if (ph !== this.lastPhase) {
      if (ph === PHASE_ENC.wave) this.waveStart = tick;
      else if (this.lastPhase === PHASE_ENC.wave && ph === PHASE_ENC.breather && !wiped && this.waveStart >= 0) {
        this.waves.push({ wave: probe.waveNo(), seconds: (tick - this.waveStart) / SIM_HZ });
        if (this.waves.length > 20) this.waves.shift();
      }
      if (ph !== PHASE_ENC.wave) this.waveStart = -1;
      this.lastPhase = ph;
    }
    // bodies removed without dying (cleared, wiped) must not leave a clock running into the next one
    if (tick % SIM_HZ === 0) for (let i = 0; i < MAX_BODIES; i++) if (this.firstHit[i] >= 0 && !probe.isEnemy(i)) this.firstHit[i] = -1;
  }

  /** Sim seconds since the meters started (or were reset). */
  elapsed(): number { return this.startTick < 0 ? 0 : (this.tick - this.startTick + 1) / SIM_HZ; }

  /** Seat damage per second over the last 3 s (or the whole session, if shorter). */
  dps(): number {
    let sum = 0;
    for (let k = 0; k < DPS_WIN; k++) if (this.dmgStamp[k] >= 0 && this.dmgStamp[k] > this.tick - DPS_WIN) sum += this.dmgRing[k];
    const secs = Math.min(DPS_WIN / SIM_HZ, this.elapsed());
    return secs > 0 ? sum / secs : 0;
  }

  /** Runes spent per minute over the last 60 s (or the whole session, if shorter). */
  runesPerMinute(): number {
    const now = Math.floor(this.tick / SIM_HZ);
    let sum = 0;
    for (let k = 0; k < RUNE_WIN; k++) if (this.runeStamp[k] >= 0 && this.runeStamp[k] > now - RUNE_WIN) sum += this.runeRing[k];
    const secs = Math.min(RUNE_WIN, this.elapsed());
    return secs > 0 ? (sum / secs) * 60 : 0;
  }

  /** Spells by damage + healing, most first. */
  spellRows(): SpellRow[] { return [...this.spells.values()].sort((a, b) => b.damage + b.heal - (a.damage + a.heal) || b.casts - a.casts); }

  private spellRow(): SpellRow {
    if (!this.current) { this.current = { title: '(before any cast)', casts: 0, damage: 0, heal: 0, runes: 0 }; this.spells.set(this.current.title, this.current); }
    return this.current;
  }

  private bump(ring: Float64Array, stamp: Int32Array, key: number, v: number): void {
    const k = key % ring.length;
    if (stamp[k] !== key) { stamp[k] = key; ring[k] = 0; }
    ring[k] += v;
  }
}
