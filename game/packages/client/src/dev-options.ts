/**
 * Every URL option the game reads (?room=arena, ?autoplay=1, ...), in one list. This list is their
 * documentation: the Tune panel (F2) shows each one as a control under "URL options", and tests,
 * scripts and agents set the same thing in the URL.
 *
 * The URL holds the state. A control in the panel rewrites the URL in place (no reload), so a reload
 * keeps it and the address bar is a link to what you see. Options marked `live` apply at once
 * (whoever owns one subscribes with onOption); the rest are read at boot and the panel offers a reload.
 *
 * To add an option: add it here, read it with opt() / optOn() / optNum(). Never construct
 * URLSearchParams yourself (test/dev-options.test.ts fails if anything in src/ does); that's how
 * options went undocumented before. Separate pages (the labs in lab/) keep their own params.
 */
import { BATTERY_CHECKPOINTS, YARD_CHECKPOINTS } from '@wizard-sim/sim';
import { MOODS } from './art/lighting';
import { PATH_STYLES } from './art/glyph-path';
import { PROP_SETS } from './art/assets';
import { SCENARIOS } from './scenarios';

export type OptionGroup = 'Start' | 'Panels' | 'View' | 'Sound' | 'Network' | 'Test runs';

export interface DevOption {
  key: string;
  group: OptionGroup;
  label: string;
  help: string;
  /**
   * flag: on with =1 (or, with `defaultOn`, on unless =0). choice: one of `choices` (absent = the
   * default). number / text: anything.
   */
  kind: 'flag' | 'choice' | 'number' | 'text';
  defaultOn?: boolean;
  /** Lazy, so the tables they come from needn't be loaded when this module is. */
  choices?: () => readonly string[];
  /** Takes effect without a reload (its owner listens with onOption). */
  live?: boolean;
  /** Only does anything on the dev server (npm run dev). */
  devOnly?: boolean;
}

/** The Esc menu's sections, for ?menu=. */
export const MENU_SECTIONS = ['Resume', 'Scenarios', 'Multiplayer', 'Controls', 'Settings'] as const;

export const OPTIONS = [
  // ---- Start: where and how a session begins ----
  { key: 'room', group: 'Start', label: 'Room', kind: 'choice', choices: () => SCENARIOS.map((s) => s.id), help: 'The scenario to start in (scenarios.ts). The #anchor form works too and wins: #arena, #survive-ally, #tutorial-7.' },
  { key: 'ally', group: 'Start', label: 'Bot ally', kind: 'flag', help: 'A bot wizard on seat 1, for trying co-op alone. #…-ally sets it too.' },
  { key: 'beat', group: 'Start', label: 'Tutorial beat', kind: 'number', help: 'Start the tutorial at beat N (also #tutorial-N).' },
  { key: 'at', group: 'Start', label: 'Checkpoint', kind: 'choice', choices: () => [...new Set([...BATTERY_CHECKPOINTS, ...YARD_CHECKPOINTS].map((c) => c.id))], help: 'Start a chapter at a checkpoint (the battery: well-failing, repair).' },
  { key: 'fail', group: 'Start', label: 'Checkpoint (old name)', kind: 'choice', choices: () => ['1', '2'], help: 'Old names for ?at: 1 is well-failing, 2 is repair.' },
  { key: 'local', group: 'Start', label: 'Only seat N on screen', kind: 'number', help: 'The camera follows seat N only, as a networked player\'s screen would (the others get edge arrows).' },

  // ---- Panels: what is open at boot ----
  { key: 'tune', group: 'Panels', label: 'Open Tune', kind: 'flag', help: 'Open this panel at boot (F2).' },
  { key: 'tools', group: 'Panels', label: 'Open Tools', kind: 'flag', help: 'Open the tools panel at boot (F3: cheats, time, spawning).' },
  { key: 'stage', group: 'Panels', label: 'Stage tools', kind: 'flag', help: 'The Model Viewer\'s play area: opens the Tools panel with its Stage on (enemies held still, God mode). Puppet and weapon controls are in the Stage section.' },
  { key: 'stats', group: 'Panels', label: 'Open Stats', kind: 'flag', help: 'Open the stats panel at boot (F4: tick, hash, fps, meters).' },
  { key: 'help', group: 'Panels', label: 'Open Help', kind: 'flag', help: 'Open the help panel at boot (F1).' },
  { key: 'helpq', group: 'Panels', label: 'Help shows queue', kind: 'text', help: 'Show that queue (water,cold) or those hands (hands:water) in the help panel.' },
  { key: 'helphint', group: 'Panels', label: 'Help first-session hint', kind: 'flag', help: 'Show the first-session hint.' },
  { key: 'helpstats', group: 'Panels', label: 'Help numbers', kind: 'flag', help: 'Show the help panel\'s numbers.' },
  { key: 'menu', group: 'Panels', label: 'Open Esc menu on', kind: 'choice', choices: () => MENU_SECTIONS, help: 'Open the Esc menu at boot on that section.' },
  { key: 'menuAt', group: 'Panels', label: 'Esc menu at tick', kind: 'number', help: 'With ?menu: open it at tick N instead (screenshots of the menu over a fight).' },

  // ---- View ----
  { key: 'scale', group: 'View', label: 'Pixel scale', kind: 'choice', choices: () => ['1', '2', '3', '4'], live: true, help: 'Force the integer pixel scale (the Esc menu\'s Pixel scale). Absent: auto.' },
  { key: 'lights', group: 'View', label: 'Lights', kind: 'flag', defaultOn: true, live: true, help: 'The glow of spells and fire (the Esc menu\'s Lights).' },
  { key: 'lighting', group: 'View', label: 'Scene lighting', kind: 'flag', defaultOn: true, help: 'The scene lighting as a whole; off to compare.' },
  { key: 'mood', group: 'View', label: 'Mood', kind: 'choice', choices: () => Object.keys(MOODS), live: true, help: 'A lighting mood instead of the room\'s own.' },
  { key: 'props', group: 'View', label: 'Prop set', kind: 'choice', choices: () => PROP_SETS, live: true, help: 'The Academy art test\'s prop set (O cycles it there).' },
  { key: 'wizard', group: 'View', label: 'Wizard', kind: 'choice', choices: () => ['hd'], live: true, help: 'hd: the detailed wizard, in any room (I toggles it in the Academy).' },
  { key: 'paths', group: 'View', label: 'Feed path style', kind: 'choice', choices: () => Object.keys(PATH_STYLES), live: true, help: 'The rune paths\' style (glyph-path.ts PATH_STYLES; default e).' },
  { key: 'live3d', group: 'View', label: 'Live 3D characters', kind: 'choice', choices: () => ['0', '1'], help: 'The warband and the wizard are drawn live from their 3D models (art/live3d.ts). 0: the baked 8-direction sheets instead; 1: live 3D even on a software renderer, which otherwise gets the sheets.' },
  { key: 'sprites', group: 'View', label: 'Character sprites', kind: 'flag', defaultOn: true, help: 'Off: the goblin warband and the wizard as code rigs instead of 3D models (art/rigs.ts SPRITES_ON).' },
  { key: 'wizsprite', group: 'View', label: 'Wizard sprite', kind: 'flag', defaultOn: true, help: 'Off: the wizard keeps its code rig while the warband is drawn from 3D.' },
  { key: 'wizscale', group: 'View', label: 'Wizard scale', kind: 'number', help: 'The wizard\'s drawing scale, 1 to 2 (default 1.4 with sprites on, else 1): geometry, not pixels (art/rigs.ts WIZ_Z).' },
  { key: 'massing', group: 'View', label: 'Massing concept', kind: 'choice', choices: () => ['academy'], help: 'Show a concept\'s buildings round the room as grey boxes (art/massing.ts).' },
  { key: 'structoff', group: 'View', label: 'Hide structure parts', kind: 'text', help: 'Comma list of parts not to draw: walls, waves, devices, wizards, preview, fx (for isolating a slow or broken part).' },
  { key: 'renderer', group: 'View', label: 'Renderer', kind: 'choice', choices: () => ['webgpu'], help: 'Try WebGPU instead of WebGL.' },

  // ---- Sound ----
  { key: 'sound', group: 'Sound', label: 'Sound', kind: 'flag', defaultOn: true, help: 'Off: no sound at all.' },
  { key: 'vol-master', group: 'Sound', label: 'Master volume', kind: 'number', help: '0 to 1 (the Esc menu\'s volumes write these).' },
  { key: 'vol-effects', group: 'Sound', label: 'Effects volume', kind: 'number', help: '0 to 1.' },
  { key: 'vol-music', group: 'Sound', label: 'Music volume', kind: 'number', help: '0 to 1.' },
  { key: 'lab', group: 'Sound', label: 'Sound Lab', kind: 'text', devOnly: true, help: 'The Sound Lab: a tab name (fire, ...) opens that tab, atmos the music and ambience; ?lab alone (type it in the address) the first lab with takes still to review (audio/lab.ts).' },
  { key: 'baseline', group: 'Sound', label: 'Baseline sounds', kind: 'flag', defaultOn: true, devOnly: true, help: 'Load the baseline sound kit (audio/baseline.ts).' },

  // ---- Network ----
  { key: 'net', group: 'Network', label: 'Co-op bus', kind: 'choice', choices: () => ['bc'], help: 'bc: online co-op between tabs on one machine (BroadcastChannel), for testing alone.' },

  // ---- Test runs: headless screenshots and checks (scripts/*.mjs) ----
  { key: 'script', group: 'Test runs', label: 'Scripted run', kind: 'flag', help: 'Both wizards play the scripted run (the loop uses timers, for headless Chrome).' },
  { key: 'autoplay', group: 'Test runs', label: 'Autoplay', kind: 'flag', help: 'Bots pilot seats 0 and 1 in the Arena, or play the tutorial through.' },
  { key: 'spell', group: 'Test runs', label: 'Demo spell', kind: 'text', help: 'Both seats cast this at the dummies: runes, then /cast (force, area, place, self, weapon, drag, hold, holddrag, guard, wait; with nothing queued strike, heavy, special, retreat, block); @x,y sets the target, ; chains spells. E.g. arcane+fire/force, sigil+cold/weapon;/heavy (demo.ts).' },
  { key: 'spell2', group: 'Test runs', label: 'Demo spell, seat 1', kind: 'text', help: 'Seat 1\'s spell, when it differs.' },
  { key: 'scene', group: 'Test runs', label: 'Scene', kind: 'choice', choices: () => ['rally', 'three', 'enemyattacks'], help: 'Headless: rally / three (Survive), or enemyattacks (every enemy frozen at one beat of its attack).' },
  { key: 'phase', group: 'Test runs', label: 'Attack phase', kind: 'choice', choices: () => ['wind', 'strike', 'impact', 'recover', 'loop'], help: 'With scene=enemyattacks.' },
  { key: 'face', group: 'Test runs', label: 'Attack facing', kind: 'number', help: 'With scene=enemyattacks: facing in turns (default 0.06).' },
  { key: 'pauseAt', group: 'Test runs', label: 'Pause at tick', kind: 'number', help: 'Pause the sim at tick N, as P does in the tools panel.' },
  { key: 'selftest', group: 'Test runs', label: 'Selftest', kind: 'flag', help: 'No rendering: run the golden replay and publish its hash on <html data-hash>.' },
  { key: 'ticks', group: 'Test runs', label: 'Selftest ticks', kind: 'number', help: 'How long the selftest replay runs (default 1800).' },
  { key: 'perf', group: 'Test runs', label: 'Record frame times', kind: 'flag', help: 'Record each frame\'s sim, draw and render time on wizardSim.perf (scripts/perf.mjs).' },
  { key: 'timerloop', group: 'Test runs', label: 'Timer loop', kind: 'flag', help: 'Timers instead of animation frames, so a background tab keeps running.' },
  { key: 'rafloop', group: 'Test runs', label: 'Frame loop', kind: 'flag', help: 'Animation frames even in a headless run.' },
] as const satisfies readonly DevOption[];

export type OptionKey = (typeof OPTIONS)[number]['key'];

export const optionOf = (key: string): DevOption | undefined => (OPTIONS as readonly DevOption[]).find((o) => o.key === key);

/** The options in force: the URL at boot, plus what the panel (or the #anchor) has set since. */
const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
const listeners = new Map<string, (() => void)[]>();

/** The raw value, or null when absent. */
export const opt = (key: OptionKey): string | null => params.get(key);

/** A flag: =1 (or, for a `defaultOn` flag, anything but =0). */
export function optOn(key: OptionKey): boolean {
  const v = params.get(key);
  return optionOf(key)?.defaultOn ? v !== '0' : v === '1';
}

/** A number, or `fallback` when absent or not a number. */
export function optNum(key: OptionKey, fallback = 0): number {
  const v = params.get(key);
  const n = v === null || v.trim() === '' ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Set an option (null removes it): in the URL too unless `url` is false, then tells its listeners.
 * The URL is rewritten in place, so a reload keeps it; a sandboxed page may refuse, and then it
 * still applies until a reload.
 */
export function setOpt(key: OptionKey, value: string | null, url = true): void {
  if (value === null || value === '') params.delete(key); else params.set(key, value);
  if (url && typeof location !== 'undefined') {
    try {
      const q = new URLSearchParams(location.search);
      if (value === null || value === '') q.delete(key); else q.set(key, value);
      const qs = q.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    } catch { /* sandboxed */ }
  }
  for (const f of listeners.get(key) ?? []) f();
}

/** Call `f` whenever `key` is set (for `live` options). */
export function onOption(key: OptionKey, f: () => void): void {
  listeners.set(key, [...(listeners.get(key) ?? []), f]);
}

const atBoot = new URLSearchParams(params);
/** At boot only: an option that came some other way (the #anchor), counted as what the page booted with. */
export function seedOpt(key: OptionKey, value: string): void { params.set(key, value); atBoot.set(key, value); }
/** Whether `key` differs from what the page booted with (a boot-time option then needs a reload). */
export const changedSinceBoot = (key: OptionKey): boolean => (params.get(key) ?? '') !== (atBoot.get(key) ?? '');
