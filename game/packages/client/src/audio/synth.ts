/**
 * Code-made sounds: small pure DSP that fills a Float32Array. No Web Audio here, so the same bytes
 * come out in the game, the gallery and the node tests. It covers what recordings don't suit (UI
 * blips, shimmer, electric buzz, whooshes, the sub thump) and stands in for any sample that hasn't
 * loaded (engine.ts). Every sound is seeded: a clip id always renders the same.
 */
import { clamp, seeded, type Rand } from './variation';

export const SYNTH_RATE = 44100;
const SR = SYNTH_RATE, TAU = Math.PI * 2;

const buf = (s: number) => new Float32Array(Math.ceil(s * SR));

/** One-pole lowpass over white noise. */
function noise(n: number, r: Rand, hz = 20000): Float32Array {
  const o = new Float32Array(n), k = Math.min(1, (TAU * hz) / SR);
  let lp = 0;
  for (let i = 0; i < n; i++) { lp += (r() * 2 - 1 - lp) * k; o[i] = lp; }
  return o;
}

/** A state-variable bandpass whose centre follows hz(t in 0..1). */
function sweep(x: Float32Array, hz: (t: number) => number, q = 1.2): Float32Array {
  const o = new Float32Array(x.length);
  let lo = 0, bp = 0;
  for (let i = 0; i < x.length; i++) {
    const f = 2 * Math.sin(Math.PI * Math.min(0.24, hz(i / x.length) / SR));
    lo += f * bp;
    const hi = x[i] - lo - bp / q;
    bp += f * hi;
    o[i] = bp;
  }
  return o;
}

const normal = (x: Float32Array, peak = 0.9): Float32Array => {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  if (m > 0) for (let i = 0; i < x.length; i++) x[i] *= peak / m;
  return x;
};

/** Attack / decay, and a short fade at the very end so nothing clicks. */
function shape(x: Float32Array, attack: number, curve = 3): Float32Array {
  const a = Math.max(1, Math.floor(attack * SR)), n = x.length;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    x[i] *= (i < a ? i / a : 1) * Math.pow(1 - t, curve);
  }
  return x;
}

/**
 * A seamless loop: the tail is crossfaded into the head, equal power, and the result is `fade` shorter.
 * Exported for the sample bank's build too.
 */
export function makeLoop(x: Float32Array, fadeSamples: number): Float32Array {
  const f = Math.min(fadeSamples, Math.floor(x.length / 2)), n = x.length - f, o = x.slice(0, n);
  for (let i = 0; i < f; i++) {
    const t = (i + 0.5) / f;
    o[i] = x[i] * Math.sin((t * Math.PI) / 2) + x[n + i] * Math.cos((t * Math.PI) / 2);
  }
  return o;
}

const tone = (s: number, f: (t: number) => number, env: (t: number) => number, wave: (p: number) => number = Math.sin): Float32Array => {
  const o = buf(s);
  let p = 0;
  for (let i = 0; i < o.length; i++) {
    const t = i / o.length;
    p += (TAU * f(t)) / SR;
    o[i] = wave(p) * env(t);
  }
  return o;
};

const mix = (...xs: Float32Array[]): Float32Array => {
  const o = new Float32Array(Math.max(...xs.map((x) => x.length)));
  for (const x of xs) for (let i = 0; i < x.length; i++) o[i] += x[i];
  return o;
};

const hit = (t: number) => Math.min(1, t * 200);

/** A bell-like tone: inharmonic partials, each dying at its own speed. */
function bell(s: number, f0: number, partials: readonly (readonly [number, number, number])[]): Float32Array {
  return normal(mix(...partials.map(([ratio, g, k]) => tone(s, () => f0 * ratio, (t) => g * hit(t) * Math.exp(-t * k)))));
}

/** Electric crackle: a run of tiny spikes at random intervals through a bright filter. */
function crackle(s: number, r: Rand, density: number, hz: number): Float32Array {
  const o = buf(s);
  let i = 0;
  while (i < o.length) {
    const len = 30 + Math.floor(r() * 260), g = 0.4 + r() * 0.6;
    for (let k = 0; k < len && i + k < o.length; k++) o[i + k] += (r() * 2 - 1) * g * (1 - k / len);
    i += Math.floor(SR / density * (0.2 + r() * 1.6));
  }
  return sweep(o, () => hz, 0.8);
}

const saw = (p: number) => ((p / TAU) % 1) * 2 - 1;

/** The recipes. Each returns samples at SYNTH_RATE, peak at most 1. */
const MAKERS: Record<string, (r: Rand) => Float32Array> = {
  // ---- the shape layers: the structure of a cast -----------------------------------------------
  /** A long whoosh: a noise band rising and falling, the flight of a missile. */
  'y-whoosh': (r) => normal(shape(sweep(noise(buf(0.6).length, r), (t) => 280 + 2100 * Math.sin(Math.PI * Math.pow(t, 0.7)), 1.1), 0.1, 1.2)),
  /** A short whoosh: a Force cast, a swing. */
  'y-whoosh-short': (r) => normal(shape(sweep(noise(buf(0.26).length, r), (t) => 500 + 2600 * (1 - t), 1.3), 0.012, 1.6)),
  /** A rising swell before something lands. */
  'y-rise': (r) => {
    const n = sweep(noise(buf(0.5).length, r), (t) => 240 + 2800 * t * t, 2);
    for (let i = 0; i < n.length; i++) n[i] *= Math.pow(i / n.length, 1.6);
    return normal(n, 0.85);
  },
  /** The sub thump under anything heavy. */
  'y-sub': () => normal(tone(0.5, (t) => 38 + 74 * Math.exp(-t * 9), (t) => hit(t) * Math.exp(-t * 6))),
  /** An inward suck for spells on yourself. */
  'y-suck': (r) => {
    const n = sweep(noise(buf(0.45).length, r), (t) => 3400 - 2900 * t, 2.4);
    for (let i = 0; i < n.length; i++) { const t = i / n.length; n[i] *= Math.pow(t, 1.3) * Math.min(1, (1 - t) * 18); }
    return normal(n, 0.85);
  },
  /** A rushing stream of air under a spray (loop). */
  'y-flow': (r) => normal(makeLoop(sweep(noise(buf(1.7).length, r, 9000), (t) => 900 + 300 * Math.sin(t * TAU * 3), 0.7), Math.floor(SR * 0.3)), 0.8),
  /** A stone grinding up out of the floor: a wall rising. */
  'y-grind': (r) => {
    const n = noise(buf(0.55).length, r, 900), x = new Float32Array(n.length);
    for (let i = 0; i < x.length; i++) { const t = i / x.length; x[i] = n[i] * (0.6 + 0.4 * Math.sin(i * 0.012 + Math.sin(i * 0.0021) * 3)) * Math.min(1, t * 8) * Math.pow(1 - t, 0.5); }
    return normal(x);
  },
  /** Blink: a pop and a flutter. */
  'y-blink': (r) => normal(mix(
    tone(0.22, (t) => 1400 * Math.exp(-t * 3.4), (t) => 0.8 * hit(t) * Math.exp(-t * 7)),
    shape(sweep(noise(buf(0.22).length, r), () => 3400, 2), 0.004, 2),
  )),

  // ---- element layers the recordings don't cover ----------------------------------------------
  /** Lightning's buzz: a hard mains-hum with crackle on it (loop). */
  'y-buzz': (r) => {
    const s = 1.5, h = tone(s, () => 118, () => 0.42, (p) => Math.sign(Math.sin(p)) * 0.5 + Math.sin(p * 3) * 0.3);
    return normal(makeLoop(mix(sweep(h, () => 1500, 0.7), crackle(s, r, 120, 3600)), Math.floor(SR * 0.2)), 0.85);
  },
  'y-zap-1': (r) => normal(shape(mix(crackle(0.2, r, 700, 3800), tone(0.2, (t) => 1800 * Math.exp(-t * 4), (t) => 0.5 * Math.exp(-t * 5), saw)), 0.001, 2.2)),
  'y-zap-2': (r) => normal(shape(mix(crackle(0.28, r, 460, 2800), tone(0.28, (t) => 1100 + 900 * Math.sin(t * 40), (t) => 0.4 * Math.exp(-t * 4), saw)), 0.001, 2.4)),
  'y-zap-3': (r) => normal(shape(crackle(0.15, r, 1100, 5200), 0.001, 1.8)),
  /** Arcane's voice: detuned saws through a slowly turning filter (loop). */
  'y-arcane': () => {
    const s = 2;
    const a = tone(s, () => 147, () => 0.34, saw), b = tone(s, () => 148.5, () => 0.34, saw), c = tone(s, () => 221, () => 0.2, saw);
    return normal(makeLoop(sweep(mix(a, b, c), (t) => 800 + 500 * Math.sin(t * TAU * 2), 3), Math.floor(SR * 0.35)), 0.8);
  },
  /** Arcane's strike: a falling, ringing "pew" with a phasey edge. */
  'y-arcane-hit': () => normal(mix(
    tone(0.38, (t) => 880 * Math.exp(-t * 2.2), (t) => hit(t) * Math.exp(-t * 7), saw),
    tone(0.38, (t) => 890 * Math.exp(-t * 2.3), (t) => 0.8 * hit(t) * Math.exp(-t * 7)),
    tone(0.38, () => 1320, (t) => 0.3 * hit(t) * Math.exp(-t * 11)),
  )),
  /** Shimmer: high, close partials that beat against each other (loop). Cold's frost and the Life glow. */
  'y-shimmer': (r) => {
    const s = 2, parts = [2093, 2637, 3136, 3951, 4699].map((f) => tone(s, () => f * (1 + (r() - 0.5) * 0.004), (t) => 0.2 * (0.6 + 0.4 * Math.sin(t * TAU * (2 + Math.floor(r() * 3))))));
    return normal(makeLoop(mix(...parts), Math.floor(SR * 0.4)), 0.7);
  },
  /** Life's warm chord, soft and open (loop). */
  'y-life': () => {
    const s = 2.4, notes = [261.6, 329.6, 392, 523.3];
    const parts = notes.map((f, i) => tone(s, () => f, (t) => 0.22 * (0.8 + 0.2 * Math.sin(t * TAU * (i + 2)))));
    return normal(makeLoop(mix(...parts), Math.floor(SR * 0.5)), 0.7);
  },
  /** Sigil's rune tone: a glassy bell with a slow beat. */
  'y-sigil': () => bell(1.3, 660, [[1, 1, 3.5], [2.01, 0.6, 5], [3.02, 0.35, 8], [4.2, 0.2, 12]]),
  /** Shield's hum under a held barrier (loop). */
  'y-shield': () => {
    const s = 1.6, a = tone(s, () => 196, (t) => 0.5 * (0.85 + 0.15 * Math.sin(t * TAU * 4))), b = tone(s, () => 197.5, () => 0.5), c = tone(s, () => 392, () => 0.16);
    return normal(makeLoop(mix(a, b, c), Math.floor(SR * 0.3)), 0.75);
  },

  // ---- interactions ----------------------------------------------------------------------------
  /** A hiss: steam, a douse, water on fire. */
  'y-hiss': (r) => {
    const n = sweep(noise(buf(0.9).length, r), (t) => 5200 - 1800 * t, 0.8);
    for (let i = 0; i < n.length; i++) { const t = i / n.length; n[i] *= Math.min(1, t * 40) * Math.pow(1 - t, 2.2); }
    return normal(n, 0.85);
  },
  /** Steam's breath (loop). */
  'y-steam': (r) => normal(makeLoop(sweep(noise(buf(1.8).length, r), (t) => 4600 + 800 * Math.sin(t * TAU * 2), 0.7), Math.floor(SR * 0.3)), 0.7),
  /** Opposites cancelling: two tones collapsing into each other. */
  'y-cancel': () => normal(mix(
    tone(0.24, (t) => 500 + 320 * t, (t) => hit(t) * Math.pow(1 - t, 2)),
    tone(0.24, (t) => 1100 - 320 * t, (t) => hit(t) * Math.pow(1 - t, 2)),
  )),

  // ---- UI --------------------------------------------------------------------------------------
  /** The rune queue's blip: pitched per element at play time. */
  'y-blip': () => normal(tone(0.09, () => 880, (t) => hit(t) * Math.exp(-t * 6)), 0.8),
  /** Out of runes: a dull, dry knock. */
  'y-dry': () => normal(tone(0.12, (t) => 210 - 90 * t, (t) => hit(t) * Math.exp(-t * 8))),
  'y-tick': () => normal(tone(0.03, () => 1800, (t) => Math.exp(-t * 5)), 0.6),

  // ---- stingers --------------------------------------------------------------------------------
  /** A wave begins: a low horn-like swell. */
  'y-wave': () => normal(mix(
    tone(1.1, () => 110, (t) => Math.min(1, t * 6) * Math.pow(1 - t, 1.4), saw),
    tone(1.1, () => 165, (t) => 0.7 * Math.min(1, t * 6) * Math.pow(1 - t, 1.4), saw),
    tone(1.1, () => 220, (t) => 0.4 * Math.min(1, t * 4) * Math.pow(1 - t, 1.6)),
  )),
  /** Cleared: a rising little fanfare of bells. */
  'y-clear': () => {
    const o = buf(1.1);
    [523.3, 659.3, 784, 1046.5].forEach((f, k) => {
      const b = bell(0.7, f, [[1, 1, 5], [2, 0.4, 8], [3.01, 0.2, 12]]), at = Math.floor(k * 0.11 * SR);
      for (let i = 0; i < b.length && at + i < o.length; i++) o[at + i] += b[i] * 0.5;
    });
    return normal(o);
  },
  /** Everyone down: a falling, tired slide. */
  'y-lose': () => normal(mix(
    tone(1.2, (t) => 330 * Math.pow(0.42, t), (t) => Math.min(1, t * 30) * Math.pow(1 - t, 1.6), saw),
    tone(1.2, (t) => 247 * Math.pow(0.42, t), (t) => 0.7 * Math.min(1, t * 30) * Math.pow(1 - t, 1.6)),
  )),
  /** A bowstring: a quick pluck and a thrum. */
  'y-string': () => normal(mix(
    tone(0.2, (t) => 300 - 90 * t, (t) => hit(t) * Math.exp(-t * 9), saw),
    tone(0.2, () => 620, (t) => 0.3 * hit(t) * Math.exp(-t * 16)),
  )),
};

export const SYNTH_IDS: readonly string[] = Object.keys(MAKERS);

/** Renders one synth clip (the same every time), or null if there's no such clip. */
export function renderSynth(id: string): Float32Array | null {
  const f = MAKERS[id];
  if (!f) return null;
  let seed = 7;
  for (let i = 0; i < id.length; i++) seed = Math.imul(seed ^ id.charCodeAt(i), 0x01000193);
  const out = f(seeded(seed));
  for (let i = 0; i < out.length; i++) out[i] = clamp(out[i], -1, 1);
  return out;
}

/** Which clips are seamless loops (their ends join). */
export const SYNTH_LOOPS: ReadonlySet<string> = new Set(['y-flow', 'y-buzz', 'y-arcane', 'y-shimmer', 'y-life', 'y-shield', 'y-steam']);
