/**
 * The VFX Lab (dev server only: /vfx-lab.html). Any spell, cast by a real wizard in a real World and drawn by the
 * game's own WorldView, in a scene from scenes.ts, at the game's scale: what you see is what the game draws, and every
 * spell is covered with no wiring of its own. It is meant to replace the single-effect labs and, in time, the
 * hand-ported Spell VFX gallery (tools/spell-vfx).
 *
 *   ?spell=fire,fire,fire   the elements pressed, joined by , or + ('ice' is pressed as Water then Cold);
 *                           `fire,fire/area` carries its form too
 *   &form=force             how it's cast (demo.ts): force, area, place, self, weapon, drag, hold, holddrag, guard;
 *                           with nothing queued, the hands: strike, heavy, special, channel, retreat, block
 *   &runes=3                that many runes: the spell's elements, then more of the first (or cut short)
 *   &scene=empty            empty, crowd, dark, coop, ally (scenes.ts)
 *   &others=a/force;b/area  the other wizards' spells in a scene that has them (coop)
 *   &mood=night             a lighting mood instead of the scene's
 *   &seed=7                 the world's seed
 *   &t=0.5                  seconds from the spell going off (wizard 0's cast event; negative: the wind-up). The sim
 *                           steps there from the start, the view drawing every tick as the game would at 60 fps, and
 *                           the frame is shown; then <html data-ready="1">. The same URL gives the same pixels.
 *                           Without it the scene loops live, recast every `loop` seconds after the spell went off.
 *   &loop=3                 see t
 *   &grid=runes             the spell at 1..5 runes side by side, one world and view each (&ns=1,3,5 picks them);
 *                           each panel's t counts from its own cast, so the wind-ups line up at t = 0
 *   &scale=2                screen px per art px (the game picks 2 to 4 by window height)
 *   &size=480x270           each panel's size in art px (the game shows about 270 art px of height)
 *   &zoom=x,y,w,h           show only that part of each panel (art px from its top left)
 *   &bar=0                  no control bar (a clean page for captures)
 * The game's own view options work here too: ?lights=0, ?lighting=0, ?live3d=0, ?sprites=0, ?wizscale=...
 *
 * For tools: window.vfxLab = { ready, setTime(t), metrics(), info() } (see VfxLab below).
 */
import { Application, TextureSource } from 'pixi.js';
import { DT, MAX_SEATS, hashWorld, hex } from '@wizard-sim/sim';
import { parseDemo, type Demo } from '../../demo';
import { emitCount } from '../../art/util';
import { stats } from '../../art/px';
import { liveModel, liveSlugs, liveWorks, setLiveClock } from '../../art/live3d';
import { sheetsReady } from '../../art/sprites';
import { Cell, type CellSpec } from './cell';
import { SCENES } from './scenes';

const q = new URLSearchParams(location.search);
const FORMS = ['force', 'area', 'place', 'self', 'weapon', 'drag', 'hold', 'holddrag', 'guard', 'strike', 'heavy', 'special', 'channel', 'retreat', 'block'];

const spellQ = q.get('spell') ?? 'fire,fire,fire';
const [elsQ, formInSpell] = spellQ.split('/');
const form = q.get('form') ?? formInSpell ?? 'force';
const sceneName = q.get('scene') ?? 'empty';
const scene = SCENES[sceneName] ?? SCENES.empty;
const seed = Number(q.get('seed') ?? 7) | 0;
const tQ = q.has('t') ? Number(q.get('t')) : null;
const loopS = Number(q.get('loop') ?? 3);
const grid = q.get('grid') === 'runes';
const runesQ = q.has('runes') ? Number(q.get('runes')) : null;
const scale = Math.max(1, Math.floor(Number(q.get('scale') ?? 2)));
const [sizeW, sizeH] = (q.get('size') ?? (grid ? '200x200' : '480x270')).split('x').map(Number);
const zoomQ = q.get('zoom')?.split(',').map(Number);
const zoom = zoomQ && zoomQ.length === 4 && zoomQ.every(Number.isFinite) ? zoomQ as unknown as [number, number, number, number] : null;
const othersQ = q.get('others');
const moodQ = q.get('mood');
const showBar = q.get('bar') !== '0';
const ns = grid ? (q.get('ns') ?? '1,2,3,4,5').split(',').map(Number).filter((n) => n >= 1 && n <= 5) : [];

/** The recipe's elements at n runes: as written, then more of the first, or cut short. */
function atRunes(els: string[], n: number): string[] {
  const out = els.slice(0, n);
  while (out.length < n && els.length) out.push(els[0]);
  return out;
}
const baseEls = elsQ.split(/[+ ,]/).filter(Boolean);
const demoOf = (els: string[], f: string): Demo | null => parseDemo(`${els.join(',')}/${f}`);
const others = (othersQ ?? '').split(';').filter(Boolean);

function specs(): CellSpec[] {
  const counts = grid ? ns : [runesQ ?? baseEls.length];
  return counts.map((n, k) => ({
    scene, seed, w: sizeW, h: sizeH, scale, zoom, mood: moodQ, scope: `lab${k}:`,
    demos: scene.wizards.map((wz, i) => (i === 0 ? demoOf(atRunes(baseEls, n), form) : parseDemo(others[i - 1] ?? wz.spell ?? null))),
  }));
}

// ---- the page ------------------------------------------------------------------------------------------------------
TextureSource.defaultOptions.scaleMode = 'nearest';
const host = document.getElementById('app')!;
const bar = document.getElementById('bar')!;
const app = new Application();
let cells: Cell[] = [];
const labels: HTMLDivElement[] = [];
/** A frozen run: whether a frame was shown since the panels were built, and whether any panel's was between ticks. */
let drawn = false, between = false;
let frozen = tQ !== null;
let lastMetrics = { particles: 0, fills: 0, fxLive: 0, vfxMs: 0, drawMs: 0, renderMs: 0 };

function layout(): void {
  const W = cells.reduce((s, c) => s + c.pxW, 0), H = Math.max(...cells.map((c) => c.pxH));
  app.renderer.resize(W, H);
  let x = 0;
  cells.forEach((c, k) => {
    c.root.position.set(x, 0);
    const l = labels[k] ?? document.createElement('div');
    if (!labels[k]) { l.className = 'label'; host.appendChild(l); labels[k] = l; }
    l.style.left = `${x + 4}px`;
    l.textContent = grid ? `${ns[k]} rune${ns[k] > 1 ? 's' : ''}` : '';
    l.style.display = grid ? '' : 'none';
    x += c.pxW;
  });
}

function build(): void {
  for (const c of cells) { app.stage.removeChild(c.root); c.destroy(); }
  cells = specs().map((s) => new Cell(s, app.renderer));
  for (const c of cells) app.stage.addChild(c.root);
  layout();
  drawn = false; between = false;
}

/**
 * Draws each panel and renders it on its own, in turn (live3d's atlas slots are reused by every view's draw, so one
 * render of the whole stage would show the last panel's bodies in all of them), counting what the effects drew.
 * `now`: each panel's clock in ms, or null for real time.
 */
function drawAll(alphas: number[], now: ((c: Cell, alpha: number) => number) | null): void {
  emitCount.on = true; emitCount.n = 0;
  let fills = 0, vfxMs = 0, fxLive = 0, drawMs = 0, renderMs = 0;
  cells.forEach((c, k) => {
    const t0 = performance.now(), ms = now ? now(c, alphas[k]) : t0;
    if (now) setLiveClock(() => ms / 1000);
    c.draw(alphas[k], ms);
    fills += stats.fills; vfxMs += c.view.fxLastMs; fxLive += c.view.fxLive;
    const t1 = performance.now();
    app.renderer.render({ container: c.root, clear: k === 0 });
    drawMs += t1 - t0; renderMs += performance.now() - t1;
  });
  emitCount.on = false;
  lastMetrics = { particles: emitCount.n, fills, fxLive, vfxMs, drawMs, renderMs };
}

/** Resolves once every panel's painted floor is in. */
async function grounds(): Promise<void> {
  for (let k = 0; k < 400 && !cells.every((c) => c.view.groundReady); k++) await new Promise((r) => setTimeout(r, 5));
}

/** A frozen run's clock for a panel at its tick plus alpha, ms: the view's cosmetic animation and live3d's blends run on it. */
const simMs = (c: Cell, alpha: number): number => 1000 + ((c.tick + alpha) * 1000) / 60;

/** Steps (and draws every tick, as the game does at 60 fps) until each panel stands at `t` s from its own cast. */
async function setTime(t: number): Promise<void> {
  await readyP;
  frozen = true;
  const targets = cells.map((c) => {
    const at = Math.max(0, c.t0 + t * 60), whole = Math.abs(at - Math.round(at)) < 1e-6 ? Math.round(at) : Math.floor(at);
    return { steps: whole, alpha: Math.max(0, at - whole) };
  });
  // Going on from the frame shown gives what a fresh page would only if that frame was on a tick and the target is later.
  if (drawn && (between || cells.some((c, k) => c.tick >= targets[k].steps))) build();
  for (const [k, c] of cells.entries()) {
    while (c.tick < targets[k].steps) {
      c.stepOnce();
      if (c.tick < targets[k].steps) { const ms = simMs(c, 0); setLiveClock(() => ms / 1000); c.draw(0, ms); } // drawn, not rendered
    }
  }
  const alphas = targets.map((x) => x.alpha);
  // a view's painted floor arrives a moment after its first draw (on a promise): wait for it before the frame that's kept
  await grounds();
  drawAll(alphas, simMs);
  if (!cells.every((c) => c.view.groundReady)) {
    // that was the panels' first draw (t at the very start): render them again once the floor is in
    await grounds();
    cells.forEach((c, k) => app.renderer.render({ container: c.root, clear: k === 0 }));
  }
  drawn = true; between = alphas.some((a) => a !== 0);
  shownT = t;
  document.documentElement.dataset.ready = '1';
}
let shownT: number | null = null;

/** Live: real time feeds the sim at 60 Hz; each panel recasts `loop` s after its spell went off. */
let acc = 0, lastNow = 0;
function loopFrame(now: number): void {
  if (frozen) return;
  acc = Math.min(acc + (lastNow ? (now - lastNow) / 1000 : 0), 8 * DT);
  lastNow = now;
  const loopTicks = Math.max(...cells.map((c) => c.t0)) + Math.round(loopS * 60);
  while (acc >= DT) {
    for (const c of cells) { if (c.tick >= loopTicks) c.restart(); c.stepOnce(); }
    acc -= DT;
  }
  drawAll(cells.map(() => acc / DT), null);
  requestAnimationFrame(loopFrame);
}

/** Waits for what a frame needs from outside: the room's painted ground, the baked sheets, the live 3D models. */
async function assets(): Promise<void> {
  // one throwaway draw starts every load (its live 3D bodies under a scope of their own)
  const warm = new Cell({ ...specs()[0], scope: 'warm:' }, app.renderer);
  setLiveClock(() => 1);
  warm.draw(0, 1000);
  setLiveClock(null);
  const until = performance.now() + 20000;
  const wait = () => new Promise((r) => setTimeout(r, 50));
  while (performance.now() < until && !(warm.view.groundReady && warm.view.props.ready && sheetsReady())) await wait();
  if (liveWorks()) await Promise.race([Promise.all(liveSlugs().map((s) => liveModel(s))), new Promise((r) => setTimeout(r, Math.max(0, until - performance.now())))]);
  warm.destroy();
}

const readyP = (async () => {
  await app.init({ width: 64, height: 64, antialias: false, autoStart: false, resolution: 1, roundPixels: true, background: '#0e1712', preserveDrawingBuffer: true, preference: 'webgl' });
  app.ticker.stop();
  host.appendChild(app.canvas);
  await assets();
  build();
})();

// ---- the API --------------------------------------------------------------------------------------------------------
export interface VfxLab {
  /** Resolves once the page can draw (assets in, panels built); with ?t=, after that frame is on screen. */
  ready: Promise<void>;
  /** Shows the frame `t` s from the cast (as ?t= does) and resolves once it is rendered. Stops a live loop. */
  setTime(t: number): Promise<void>;
  /** What the last frame cost and held. */
  metrics(): {
    t: number | null; ticks: number[]; t0: number[];
    /** Particles emit() returned (art/util.ts), event-born effects alive (art/vfx.ts), and 1x1 fills, over every panel. */
    particles: number; fxLive: number; fills: number;
    /** Sim state: missiles in flight and zones on the ground, over every panel. */
    missiles: number; zones: number;
    /** ms: the effects pass (the view's own timer), every panel's whole draw, and the GPU render. */
    vfxMs: number; drawMs: number; renderMs: number;
    hashes: string[];
  };
  info(): { spell: string; form: string; scene: string; seed: number; runes: number[]; grid: boolean; scale: number; size: [number, number]; zoom: number[] | null };
}

const lab: VfxLab = {
  ready: readyP.then(async () => { if (tQ !== null) await setTime(tQ); }),
  setTime,
  metrics: () => {
    let missiles = 0, zones = 0;
    for (const c of cells) {
      const w = c.world;
      for (let j = 0; j < w.missiles.alive.length; j++) missiles += w.missiles.alive[j];
      for (let j = 0; j < w.zones.type.length; j++) if (w.zones.type[j]) zones++;
    }
    return { t: frozen ? shownT : null, ticks: cells.map((c) => c.tick), t0: cells.map((c) => c.t0), missiles, zones, ...lastMetrics, hashes: cells.map((c) => hex(hashWorld(c.world))) };
  },
  info: () => ({
    spell: baseEls.join(','), form, scene: SCENES[sceneName] ? sceneName : 'empty', seed,
    runes: grid ? ns : [runesQ ?? baseEls.length], grid, scale, size: [sizeW, sizeH], zoom,
  }),
};
(window as unknown as { vfxLab: VfxLab }).vfxLab = lab;
void lab.ready.then(() => { if (!frozen) requestAnimationFrame(loopFrame); });

// ---- the bar --------------------------------------------------------------------------------------------------------
if (!showBar) bar.style.display = 'none';
else {
  const field = (label: string, el: HTMLElement) => { const l = document.createElement('label'); l.append(label + ' ', el); bar.append(l); return el; };
  const input = (label: string, value: string, width = 9) => { const i = document.createElement('input'); i.value = value; i.size = width; return field(label, i) as HTMLInputElement; };
  const select = (label: string, options: string[], value: string) => {
    const s = document.createElement('select');
    for (const o of options) { const op = document.createElement('option'); op.value = o; op.textContent = o || '-'; s.append(op); }
    s.value = value; return field(label, s) as HTMLSelectElement;
  };
  const inSpell = input('spell', baseEls.join(','), 22);
  const inForm = select('form', FORMS, form);
  const inScene = select('scene', Object.keys(SCENES), SCENES[sceneName] ? sceneName : 'empty');
  const inGrid = select('grid', ['', 'runes'], grid ? 'runes' : '');
  const inT = input('t', tQ === null ? '' : String(tQ), 5);
  const inSeed = input('seed', String(seed), 4);
  const inScale = input('scale', String(scale), 2);
  const go = document.createElement('button');
  go.textContent = 'Go';
  go.onclick = () => {
    const p = new URLSearchParams(location.search);
    const set = (k: string, v: string) => { if (v) p.set(k, v); else p.delete(k); };
    set('spell', inSpell.value.trim()); set('form', inForm.value); set('scene', inScene.value); set('grid', inGrid.value);
    set('t', inT.value.trim()); set('seed', inSeed.value.trim()); set('scale', inScale.value.trim());
    location.search = p.toString();
  };
  bar.append(go);
  for (const i of [inSpell, inT, inSeed, inScale]) i.onkeydown = (e) => { if (e.key === 'Enter') go.click(); };
  const note = document.createElement('div');
  note.className = 'note';
  note.textContent = `${scene.blurb}  Also: &runes= &others=a/force;b/area &mood= &loop= &ns=1,3,5 &size=WxH &zoom=x,y,w,h &bar=0. Seats: ${Math.min(MAX_SEATS, scene.wizards.length)}.`;
  bar.append(note);
}
