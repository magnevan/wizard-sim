/**
 * The game's sound, end to end. Browsers won't play before the first input, but they will let a
 * suspended context be made and clips decoded into it. So the expensive start-up happens early, in
 * idle time after boot, and the first input only resumes. That matters: making an AudioContext
 * blocks the main thread for hundreds of ms (it opens the device), and a first click in an online
 * match that froze the page for over a second came close to the 2.5 s drop-out. Headless runs prepare
 * on input instead, so they don't pay for sound they never play. With no Web Audio at all, everything
 * here does nothing.
 *
 * Volumes persist in localStorage (and a URL param, as the other settings do), behind try / catch.
 */
import { BANK } from './bank.gen';
import { AudioEngine, loadBank, type Volumes } from './engine';
import { SoundDirector, type SoundSink } from './director';
import { SYNTH_IDS } from './synth';
import type { Plan } from './recipes';
import type { EnvName, Place } from './variation';

const KEY = 'wizard-sim-volumes';
export const VOLUME_STEP = 0.1;
/** How long after boot to start preparing: the page's first frames come first. */
const PREPARE_DELAY_MS = 250;
export const DEFAULT_VOLUMES: Volumes = { master: 0.8, effects: 0.9, music: 0.7 };

export function loadVolumes(params: URLSearchParams): Volumes {
  const v = { ...DEFAULT_VOLUMES };
  try { Object.assign(v, JSON.parse(localStorage.getItem(KEY) ?? '{}')); } catch { /* blocked, or nothing saved */ }
  for (const k of ['master', 'effects', 'music'] as const) {
    const p = params.get(`vol-${k}`);
    if (p !== null && Number.isFinite(Number(p))) v[k] = Number(p);
    v[k] = Math.max(0, Math.min(1, Number(v[k]) || 0));
  }
  return v;
}

/** The volume rows of the Esc menu's Settings. A row reads OFF with no sound at all on this page. */
export function volumeSettings(audio: GameAudio | null, setParam: (k: string, v: string | null) => void): { label: string; blurb: string; value(): string; adjust(by: -1 | 1): void }[] {
  const row = (label: string, blurb: string, k: keyof Volumes) => ({
    label, blurb,
    value: () => (audio ? `${Math.round(audio.volumes[k] * 100)}%` : 'OFF'),
    adjust: (by: -1 | 1) => {
      if (!audio) return;
      // a click past the top comes round to silence, as the other settings cycle
      const next = audio.volumes[k] + by * VOLUME_STEP;
      audio.setVolume(k, next > 1.05 ? 0 : next < -0.05 ? 1 : next);
      setParam(`vol-${k}`, audio.volumes[k] === DEFAULT_VOLUMES[k] ? null : String(audio.volumes[k]));
    },
  });
  return [
    row('Master volume', 'Everything you hear.', 'master'),
    row('Effects volume', 'Spells, hits, footsteps and the menu.', 'effects'),
    row('Music volume', 'There is no music yet: this is saved for when there is.', 'music'),
  ];
}

export class GameAudio implements SoundSink {
  readonly director: SoundDirector;
  engine: AudioEngine | null = null;
  /** How many of the bank's clips loaded, once it has. */
  loaded = 0;
  private ctx: AudioContext | null = null;

  /** `early`: get ready in idle time after boot, not on the first input. */
  constructor(public volumes: Volumes, early = true, private baseUrl = './audio/') {
    this.director = new SoundDirector(this);
    // every input, not just the first: a browser can suspend the context again later
    for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => this.unlock(), { capture: true });
    if (early) setTimeout(() => this.prepare(), PREPARE_DELAY_MS);
  }

  get ready(): boolean { return !!this.engine && this.ctx?.state === 'running'; }

  /** An input: wake the context. This is all the first click should have to do. */
  unlock(): void {
    this.prepare();
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  /** Makes the context (suspended, until an input) and the engine, and loads the clips. */
  private prepare(): void {
    if (this.ctx) return;
    const Ctx = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
    if (!Ctx) return;
    try {
      this.ctx = new Ctx({ latencyHint: 'interactive' });
      const e = new AudioEngine(this.ctx);
      e.setVolumes(this.volumes);
      this.engine = e;
      // the code-made clips render one at a time, with room for frames between them
      const ids = [...SYNTH_IDS];
      const step = () => { e.warm(ids.splice(0, 1)); if (ids.length) setTimeout(step, 12); };
      setTimeout(step, 12);
      void loadBank(e, BANK, async (id) => {
        const r = await fetch(`${this.baseUrl}${id}.ogg`);
        if (!r.ok) throw new Error(String(r.status));
        return r.arrayBuffer();
      }).then((n) => { this.loaded = n; });
    } catch { this.ctx = null; this.engine = null; }
  }

  setVolume(k: keyof Volumes, v: number): void {
    this.volumes[k] = Math.max(0, Math.min(1, Math.round(v * 10) / 10));
    this.engine?.setVolumes(this.volumes);
    try { localStorage.setItem(KEY, JSON.stringify(this.volumes)); } catch { /* a sandboxed page: it lasts until a reload */ }
  }

  play(plan: Plan, place: Place, gain: number): void { this.engine?.play(plan, place, gain); }
  loop(key: string, plan: Plan, place: Place, gain: number): void { this.engine?.loop(key, plan, place, gain); }
  place(key: string, place: Place, gain: number): void { this.engine?.place(key, place, gain); }
  stop(key: string): void { this.engine?.stop(key); }
  setEnv(env: EnvName): void { this.engine?.setEnv(env); }
}
