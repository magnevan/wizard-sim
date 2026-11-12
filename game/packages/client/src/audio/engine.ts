/**
 * The Web Audio side: clips in, sound out. It plays Plans (recipes.ts) at Places (variation.ts) and
 * knows nothing about the sim. It takes any BaseAudioContext, so the Sound Gallery's checks can
 * render the very same graph through an OfflineAudioContext.
 *
 *   layer source -> layer gain (its envelope) [-> layer lowpass] -> voice lowpass (occlusion)
 *     -> voice pan -> voice gain -> effects bus -> master -> limiter -> speakers
 *                                \-> reverb send -> convolver (the room) -> master
 *
 * A clip that isn't loaded yet (or won't decode: Safari before 18.4 can't read Ogg Vorbis) is simply
 * skipped, unless it's a code-made clip, which is rendered the first time it's asked for.
 */
import type { Layer, Plan } from './recipes';
import { SYNTH_LOOPS, SYNTH_RATE, renderSynth } from './synth';
import { CENTRE, ENVS, OPEN_HZ, clamp, impulse, type EnvName, type Place } from './variation';

/** Seconds a sustained sound takes to fade when it's stopped or a prediction is corrected: long enough never to click. */
export const FADE_S = 0.09;
/** Voices ringing at once. Past this the quietest, oldest one is faded to make room. */
export const MAX_VOICES = 28;

/** Code-made stand-ins for samples, by the clip id's first word: a browser that can't decode the bank still gets a rough game. */
const STAND_INS: Readonly<Record<string, string>> = {
  earth: 'y-sub', debris: 'y-sub', fire: 'y-hiss', water: 'y-flow', life: 'y-life', shield: 'y-shield', arcane: 'y-arcane-hit', sigil: 'y-sigil',
  thunder: 'y-zap-2', ice: 'y-shimmer', boom: 'y-sub', punch: 'y-sub', draw: 'y-whoosh-short', slice: 'y-whoosh-short', chop: 'y-whoosh-short', cloth: 'y-whoosh-short', ui: 'y-tick',
};

export interface Volumes { master: number; effects: number; music: number }

interface Voice {
  out: GainNode; pan: StereoPannerNode | null; lp: BiquadFilterNode; send: GainNode;
  sources: AudioScheduledSourceNode[]; ends: number; gain: number; loop: boolean; wet: number;
  /** A sustained sound's fade when stopped: its layers' longest release, at least FADE_S. */
  tail?: number;
}

const ramp = (p: AudioParam, ctx: BaseAudioContext, to: number, secs: number) => {
  const t = ctx.currentTime;
  p.cancelScheduledValues(t);
  p.setValueAtTime(p.value, t);
  p.linearRampToValueAtTime(to, t + secs);
};

export class AudioEngine {
  readonly master: GainNode;
  private effects: GainNode;
  private music: GainNode;
  private sendBus: GainNode;
  private reverb: ConvolverNode;
  private buffers = new Map<string, AudioBuffer>();
  private loopClips = new Set<string>(SYNTH_LOOPS);
  private voices = new Set<Voice>();
  private loops = new Map<string, Voice>();
  private irs = new Map<EnvName, AudioBuffer>();
  env: EnvName = 'hall';
  /** Voices started since boot, and clips asked for that weren't there: for the debug line and the checks. */
  readonly stats = { voices: 0, stolen: 0, missing: 0 };

  constructor(readonly ctx: BaseAudioContext) {
    this.master = ctx.createGain();
    // a gentle safety limiter: a pile of big spells should squash, not clip
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -9; limiter.knee.value = 8; limiter.ratio.value = 10; limiter.attack.value = 0.003; limiter.release.value = 0.16;
    this.master.connect(limiter).connect(ctx.destination);
    this.effects = ctx.createGain(); this.effects.connect(this.master);
    this.music = ctx.createGain(); this.music.connect(this.master); // reserved: nothing plays through it yet
    this.sendBus = ctx.createGain();
    this.reverb = ctx.createConvolver();
    this.sendBus.connect(this.reverb).connect(this.effects);
    this.setEnv(this.env);
  }

  setVolumes(v: Volumes): void {
    // squared: a slider's middle should sound like the middle
    this.master.gain.value = v.master * v.master;
    this.effects.gain.value = v.effects * v.effects;
    this.music.gain.value = v.music * v.music;
  }

  /** The room's reverb. Its impulse response is made the first time the room is entered. */
  setEnv(env: EnvName): void {
    this.env = env;
    let ir = this.irs.get(env);
    if (!ir) {
      const [l, r] = impulse(env, this.ctx.sampleRate);
      ir = this.ctx.createBuffer(2, l.length, this.ctx.sampleRate);
      ir.copyToChannel(l as Float32Array<ArrayBuffer>, 0); ir.copyToChannel(r as Float32Array<ArrayBuffer>, 1);
      this.irs.set(env, ir);
    }
    this.reverb.buffer = ir;
  }

  has(clip: string): boolean { return this.buffers.has(clip); }
  addClip(id: string, b: AudioBuffer, loop = false): void { this.buffers.set(id, b); if (loop) this.loopClips.add(id); }

  /** The clip's buffer, rendering a code-made one on first use. A sample that isn't here yet borrows its stand-in. */
  private clip(id: string): AudioBuffer | null {
    let b = this.buffers.get(id);
    if (b) return b;
    if (!id.startsWith('y-')) {
      this.stats.missing++;
      const stand = STAND_INS[id.split('-')[0]];
      return stand ? this.clip(stand) : null;
    }
    const x = renderSynth(id);
    if (!x) { this.stats.missing++; return null; }
    b = this.ctx.createBuffer(1, x.length, SYNTH_RATE);
    b.copyToChannel(x as Float32Array<ArrayBuffer>, 0);
    this.buffers.set(id, b);
    return b;
  }

  /** Code-made clips, rendered ahead of use a few at a time, so the first cast of the session doesn't hitch. */
  warm(ids: readonly string[]): void { for (const id of ids) this.clip(id); }

  private voice(place: Place, gain: number, wet: number, loop: boolean): Voice {
    const c = this.ctx, lp = c.createBiquadFilter(), out = c.createGain(), send = c.createGain();
    lp.type = 'lowpass'; lp.frequency.value = place.lowpass; lp.Q.value = 0.5;
    out.gain.value = gain * place.gain;
    send.gain.value = (ENVS[this.env].send + wet) * place.wet;
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    if (pan) { pan.pan.value = place.pan; lp.connect(pan).connect(out); } else lp.connect(out);
    out.connect(this.effects);
    out.connect(send).connect(this.sendBus);
    return { out, pan, lp, send, sources: [], ends: 0, gain, loop, wet };
  }

  private layer(v: Voice, l: Layer, t0: number): void {
    const b = this.clip(l.clip);
    if (!b) return;
    const c = this.ctx, src = c.createBufferSource(), g = c.createGain(), start = t0 + l.at;
    src.buffer = b;
    src.playbackRate.value = l.rate;
    const natural = b.duration / Math.max(0.1, Math.min(l.rate, l.rateTo ?? l.rate));
    // a looped layer with a hold has its length set by the shape; a one-shot plays its clip out
    const sustained = !!l.loop && this.loopClips.has(l.clip);
    src.loop = sustained;
    const body = l.hold > 0 ? l.hold : sustained ? 1e6 : natural - l.attack;
    const stop = start + l.attack + body + l.release;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(l.gain, start + l.attack);
    if (body < 1e5) {
      g.gain.setValueAtTime(l.gain, start + l.attack + body);
      g.gain.linearRampToValueAtTime(0, stop);
      if (l.rateTo && l.rateTo !== l.rate) { src.playbackRate.setValueAtTime(l.rate, start); src.playbackRate.linearRampToValueAtTime(l.rateTo, stop); }
    } else if (l.rateTo && l.rateTo !== l.rate) {
      src.playbackRate.setValueAtTime(l.rate, start); src.playbackRate.linearRampToValueAtTime(l.rateTo, start + 2.5);
    }
    src.connect(g);
    if (l.lowpass) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.setValueAtTime(l.lowpass, start);
      if (l.lowpassTo && body < 1e5) f.frequency.exponentialRampToValueAtTime(l.lowpassTo, stop);
      g.connect(f).connect(v.lp);
    } else g.connect(v.lp);
    src.start(start, sustained && l.offset ? l.offset * b.duration : 0);
    if (body < 1e5) { src.stop(stop + 0.01); v.ends = Math.max(v.ends, stop + 0.01); }
    v.sources.push(src);
  }

  private close(v: Voice): void {
    this.voices.delete(v);
    for (const s of v.sources) { s.onended = null; try { s.stop(); } catch { /* it never started, or already stopped */ } s.disconnect(); }
    v.out.disconnect(); v.send.disconnect(); v.lp.disconnect(); v.pan?.disconnect();
  }

  /** Makes room: the quietest one-shot goes (with a short fade), or the oldest if they tie. */
  private makeRoom(): void {
    if (this.voices.size < MAX_VOICES) return;
    let worst: Voice | null = null;
    for (const v of this.voices) if (!v.loop && (!worst || v.gain < worst.gain)) worst = v;
    if (!worst) return;
    this.stats.stolen++;
    this.fadeOut(worst, 0.03);
  }

  private fadeOut(v: Voice, secs: number): void {
    ramp(v.out.gain, this.ctx, 0, secs);
    v.loop = false;
    v.ends = this.ctx.currentTime + secs + 0.02;
    const end = () => this.close(v);
    // stop the sources after the fade; the last one's end cleans up
    for (const s of v.sources) { try { s.stop(v.ends); } catch { /* stopped */ } }
    if (v.sources.length) v.sources[0].onended = end; else end();
  }

  private trim(): void {
    const t = this.ctx.currentTime;
    for (const v of this.voices) if (!v.loop && v.ends && v.ends + 0.05 < t) this.close(v);
  }

  /** Plays a one-shot plan. `when` delays it, in seconds. */
  play(plan: Plan, place: Place = CENTRE, gain = 1, when = 0): void {
    this.trim();
    this.makeRoom();
    const v = this.voice(place, gain, plan.wet, false), t0 = this.ctx.currentTime + when;
    for (const l of plan.layers) this.layer(v, l, t0);
    if (!v.sources.length) { this.close(v); return; }
    this.voices.add(v);
    this.stats.voices++;
  }

  /** Starts a sustained plan under a key. A key already sounding is left alone: use place() to move it. */
  loop(key: string, plan: Plan, place: Place = CENTRE, gain = 1): void {
    if (this.loops.has(key)) return;
    this.trim();
    const v = this.voice(place, gain, plan.wet, true), t0 = this.ctx.currentTime;
    for (const l of plan.layers) this.layer(v, l, t0);
    if (!v.sources.length) { this.close(v); return; }
    v.tail = Math.min(1, Math.max(FADE_S, ...plan.layers.filter((l) => l.loop).map((l) => l.release)));
    this.loops.set(key, v);
    this.voices.add(v);
    this.stats.voices++;
  }

  /** Moves a sustained sound, smoothly. */
  place(key: string, place: Place, gain = 1): void {
    const v = this.loops.get(key);
    if (!v) return;
    const t = this.ctx.currentTime, tc = 0.05;
    v.gain = gain;
    v.out.gain.setTargetAtTime(gain * place.gain, t, tc);
    v.pan?.pan.setTargetAtTime(place.pan, t, tc);
    v.lp.frequency.setTargetAtTime(clamp(place.lowpass, 60, OPEN_HZ), t, tc);
    v.send.gain.setTargetAtTime((ENVS[this.env].send + v.wet) * place.wet, t, tc);
  }

  /** Fades a sustained sound out. Never instant: a corrected prediction must not click. */
  stop(key: string, secs?: number): void {
    const v = this.loops.get(key);
    if (!v) return;
    this.loops.delete(key);
    // a loop's own release (a flamethrower dying away over half a second), unless the caller sets the fade
    this.fadeOut(v, Math.max(0.02, secs ?? v.tail ?? FADE_S));
  }

  stopAll(secs = FADE_S): void { for (const k of [...this.loops.keys()]) this.stop(k, secs); }

  get active(): number { return this.voices.size; }
  get looping(): number { return this.loops.size; }
}

/** Decodes the bank's files. `get` returns a clip's bytes; a clip that fails is skipped (the game plays on without it). */
export async function loadBank(engine: AudioEngine, ids: readonly { id: string; loop?: boolean }[], get: (id: string) => Promise<ArrayBuffer>): Promise<number> {
  let n = 0;
  await Promise.all(ids.map(async ({ id, loop }) => {
    try {
      const b = await engine.ctx.decodeAudioData(await get(id));
      engine.addClip(id, b, loop);
      n++;
    } catch { /* no such file, or a browser that can't read Ogg Vorbis */ }
  }));
  return n;
}
