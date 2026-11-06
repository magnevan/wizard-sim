/**
 * The variation layer: what makes one recipe sound different each time and in each place. All of it
 * is pure maths on plain numbers (no Web Audio, no sim), so it runs in node for the tests and is
 * shared with the Sound Gallery.
 *
 * - runeMod: 1 to 5 runes change a spell's size, pitch and weight.
 * - ENVS: a reverb profile per kind of place (hall, cave, outdoor), with generated impulse responses.
 * - placeOf: pan and distance from the camera, plus occlusion from walls between the source and your ears.
 * - jitter: random pitch and gain so repeats don't sound mechanical.
 * - Limiter: a voice cap and a per-group gap, so a hundred hits stay pleasant.
 */

export type Rand = () => number;

/** A small seeded generator: the gallery and the tests want the same sound every time. */
export function seeded(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

// ---- runes -----------------------------------------------------------------------------------

export interface RuneMod {
  /** Overall loudness. */
  gain: number;
  /** Playback rate: more runes play lower, so a big spell sounds heavy. */
  rate: number;
  /** How much longer the body rings. */
  length: number;
  /** How much of the sub-bass thump is mixed in (0 for one rune). */
  weight: number;
  /** Extra reverb send: a big spell fills the room. */
  wet: number;
}

/** What n runes do to a spell. One rune is the reference; five is about half an octave lower... and twice as long. */
export function runeMod(n: number): RuneMod {
  const k = clamp(Math.round(n), 1, 5) - 1;
  return { gain: 0.74 + 0.0625 * k, rate: 1.1 * Math.pow(0.9, k), length: 1 + 0.24 * k, weight: k / 4, wet: 0.035 * k };
}

// ---- rooms -----------------------------------------------------------------------------------

export type EnvName = 'hall' | 'cave' | 'outdoor';

export interface EnvProfile {
  /** Seconds until the tail has died by 60 dB. */
  decay: number;
  /** Tail darkening: the one-pole lowpass the tail starts from and falls to, Hz. */
  brightHz: number;
  darkHz: number;
  /** Reflections before the tail, as [seconds, gain]. */
  early: readonly (readonly [number, number])[];
  /** Seconds of quiet before the tail starts. */
  predelay: number;
  /** How much of a sound goes to the reverb, by default. */
  send: number;
}

export const ENVS: Readonly<Record<EnvName, EnvProfile>> = {
  // stone hall: clear, a second and a half of tail, a few early walls
  hall: { decay: 1.6, brightHz: 6500, darkHz: 2200, early: [[0.017, 0.5], [0.029, 0.42], [0.043, 0.34], [0.061, 0.26]], predelay: 0.02, send: 0.24 },
  // cave: long, dark and close, with strong flutter off near rock
  cave: { decay: 3.2, brightHz: 2600, darkHz: 700, early: [[0.011, 0.7], [0.023, 0.62], [0.037, 0.56], [0.052, 0.5], [0.083, 0.42], [0.124, 0.32]], predelay: 0.012, send: 0.42 },
  // outdoor: almost nothing but one soft slap off something far away
  outdoor: { decay: 0.5, brightHz: 5000, darkHz: 2500, early: [[0.19, 0.2], [0.31, 0.09]], predelay: 0.14, send: 0.07 },
};

/** Which profile each room uses. A room that isn't listed gets DEFAULT_ENV. */
export const ROOM_ENV: Readonly<Record<string, EnvName>> = { sanctum: 'hall', arena: 'outdoor', survive: 'outdoor', tutorial: 'cave' };
export const DEFAULT_ENV: EnvName = 'hall';
export const envOfRoom = (id: string): EnvName => ROOM_ENV[id.toLowerCase()] ?? DEFAULT_ENV;

/** A stereo impulse response for a profile: early reflections, then decaying noise that darkens as it dies. */
export function impulse(env: EnvName, sampleRate: number, rand: Rand = seeded(11)): [Float32Array, Float32Array] {
  const p = ENVS[env], n = Math.ceil((p.predelay + p.decay) * sampleRate);
  const out: [Float32Array, Float32Array] = [new Float32Array(n), new Float32Array(n)];
  const start = Math.floor(p.predelay * sampleRate);
  for (let c = 0; c < 2; c++) {
    const o = out[c];
    let lp = 0;
    for (let i = start; i < n; i++) {
      const t = (i - start) / sampleRate, life = t / p.decay;
      const hz = p.darkHz + (p.brightHz - p.darkHz) * Math.exp(-life * 4);
      lp += (rand() * 2 - 1 - lp) * Math.min(1, (2 * Math.PI * hz) / sampleRate);
      o[i] = lp * Math.pow(10, (-3 * t) / p.decay) * 0.9; // -60 dB at `decay`
    }
    // the two channels differ a little, so the room is wide
    for (const [at, g] of p.early) {
      const i = Math.floor((at * (c ? 1.07 : 0.96)) * sampleRate);
      if (i < n) o[i] += g * (rand() > 0.5 ? 1 : -1);
    }
  }
  return out;
}

// ---- where a sound is ------------------------------------------------------------------------

/** What the sim's walls look like to the occlusion test (a slice of World.walls). */
export interface WallSet { type: ArrayLike<number>; x1: ArrayLike<number>; y1: ArrayLike<number>; x2: ArrayLike<number>; y2: ArrayLike<number> }

/** WALL ids in the sim: rock blocks sound; a barrier or a curtain only dulls it. */
const WALL_BLOCK = [0, 1, 0.4, 0.4];

function crosses(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax), d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  if ((d1 > 0 && d2 > 0) || (d1 < 0 && d2 < 0)) return false;
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx), d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return !((d3 > 0 && d4 > 0) || (d3 < 0 && d4 < 0)) && (d1 !== d2);
}

/** How much wall lies on the line from ears to source: 1 per rock wall, less for energy walls. */
export function wallsBetween(walls: WallSet | null, ax: number, ay: number, bx: number, by: number): number {
  if (!walls) return 0;
  let n = 0;
  for (let k = 0; k < walls.type.length; k++) {
    const t = walls.type[k];
    if (t && crosses(ax, ay, bx, by, walls.x1[k], walls.y1[k], walls.x2[k], walls.y2[k])) n += WALL_BLOCK[t] ?? 1;
  }
  return n;
}

/** No lowpass: above what anyone hears in a game mix. */
export const OPEN_HZ = 20000;

/** What `n` walls do: quieter and duller, more so through more of them. */
export function occlusion(n: number): { gain: number; lowpass: number; wet: number } {
  if (n <= 0) return { gain: 1, lowpass: OPEN_HZ, wet: 1 };
  const k = Math.min(n, 3);
  // the room's reverb still reaches you round the wall, so the wet part drops less than the dry
  return { gain: Math.pow(0.5, k), lowpass: 1500 * Math.pow(0.45, k - 0.4), wet: 0.75 };
}

/** The listener: what the camera shows, and where the local wizard's ears are. */
export interface Listener { cx: number; cy: number; halfW: number; earX: number; earY: number }

/** Where a sound lands in the mix. */
export interface Place { pan: number; gain: number; lowpass: number; wet: number }

export const CENTRE: Place = { pan: 0, gain: 1, lowpass: OPEN_HZ, wet: 1 };

/** Full volume inside this many world units of the camera's centre (most of a screen), then falling. */
const NEAR = 11;

export function placeOf(x: number, y: number, l: Listener, walls: WallSet | null): Place {
  const dx = x - l.cx, dy = y - l.cy, d = Math.hypot(dx, dy);
  const fall = d <= NEAR ? 1 : NEAR / (NEAR + (d - NEAR) * 1.6);
  const o = occlusion(wallsBetween(walls, l.earX, l.earY, x, y));
  return { pan: clamp(dx / (Math.max(1, l.halfW) * 1.2), -1, 1) * 0.75, gain: fall * o.gain, lowpass: o.lowpass, wet: o.wet };
}

// ---- repeats and crowds ----------------------------------------------------------------------

/** Random pitch and gain for one play: `cents` either way, and a dB or so. */
export function jitter(rand: Rand, cents = 90): { rate: number; gain: number } {
  return { rate: Math.pow(2, ((rand() * 2 - 1) * cents) / 1200), gain: 0.88 + rand() * 0.24 };
}

/** Picks a clip, avoiding the one this group played last. */
export function pick<T>(list: readonly T[], rand: Rand, last?: T): T {
  if (list.length < 2) return list[0];
  const i = Math.floor(rand() * list.length) % list.length;
  return list[i] === last ? list[(i + 1) % list.length] : list[i];
}

export interface GroupRule {
  /** Seconds that must pass between two sounds of a group. */
  gap: number;
  /** Sounds of this group that may ring at once. */
  max: number;
}

interface Group { last: number; ring: number[]; crowd: number }

/**
 * Who gets to sound. The director asks admit() for each request: a group needs its gap to have
 * passed and a free slot; in a crowd each new one is also turned down, so a mob of hits turns into
 * one busy texture rather than a wall of noise. Pure: time is passed in.
 */
export class Limiter {
  private groups = new Map<string, Group>();
  /** Requests turned away so far, for the debug line and the tests. */
  dropped = 0;

  constructor(readonly maxPerFrame = 8) {}
  private used = 0;

  /** A new frame: the per-frame budget is full again. */
  frame(): void { this.used = 0; }

  /** May this sound play at `now` (s)? Returns the gain to play it at, or 0 for no. `urgent` sounds skip the per-frame budget. */
  admit(group: string, rule: GroupRule, now: number, length: number, urgent = false): number {
    let g = this.groups.get(group);
    if (!g) { g = { last: -1e9, ring: [], crowd: 0 }; this.groups.set(group, g); }
    while (g.ring.length && g.ring[0] <= now) g.ring.shift();
    // how busy the group has been: decays by half each 0.25 s
    g.crowd *= Math.pow(0.5, (now - g.last) / 0.25);
    if (now - g.last < rule.gap || g.ring.length >= rule.max || (!urgent && this.used >= this.maxPerFrame)) {
      this.dropped++;
      g.crowd = Math.min(g.crowd + 0.3, 12);
      return 0;
    }
    this.used++;
    g.last = now;
    g.crowd = Math.min(g.crowd + 1, 12);
    let at = 0;
    while (at < g.ring.length && g.ring[at] < now + length) at++;
    g.ring.splice(at, 0, now + length);
    return 1 / Math.sqrt(Math.max(1, g.crowd));
  }

  reset(): void { this.groups.clear(); this.used = 0; }
}

// ---- sustained sounds ------------------------------------------------------------------------

/** A wanted loop's key may vanish for a frame or two when a prediction wobbles: this many frames are forgiven. */
export const LOOP_GRACE = 3;

export interface LoopChange<T> { start: { id: string; want: T }[]; update: { id: string; want: T }[]; stop: string[] }

/**
 * Which sustained sounds should be sounding. Loops are never told to start or stop by events: every
 * frame the director lists what the sim state says should be sounding, and this table works out the
 * difference. A rollback that rewrites the past therefore can't leave a stuck loop or restart one;
 * a corrected prediction just shows up as a loop to fade. The id holds what the sound is made of, so
 * a spell that turns out to be another spell crossfades instead of keeping the wrong sound.
 */
export class LoopTable<T> {
  private live = new Map<string, number>();

  sync(want: ReadonlyMap<string, T>): LoopChange<T> {
    const out: LoopChange<T> = { start: [], update: [], stop: [] };
    for (const [id, w] of want) {
      if (this.live.has(id)) out.update.push({ id, want: w }); else out.start.push({ id, want: w });
      this.live.set(id, 0);
    }
    for (const [id, missed] of this.live) {
      if (want.has(id)) continue;
      if (missed + 1 >= LOOP_GRACE) { this.live.delete(id); out.stop.push(id); } else this.live.set(id, missed + 1);
    }
    return out;
  }

  /** Everything off at once (a new room): returns what to fade. */
  clear(): string[] {
    const ids = [...this.live.keys()];
    this.live.clear();
    return ids;
  }

  get size(): number { return this.live.size; }
}
