/**
 * The VFX Lab (dev server only: /vfx-lab.html). Any spell, cast by a real wizard in a real World and drawn by the
 * game's own WorldView, in a scene from scenes.ts, at the game's scale: what you see is what the game draws, and every
 * spell is covered with no wiring of its own. It is meant to replace the single-effect labs and, in time, the
 * hand-ported Spell VFX gallery (tools/spell-vfx).
 *
 * The side panel (panel.ts) changes everything below in the page, and the address bar follows (state.ts), so a setup
 * stays linkable. Drag on the stage to aim.
 *
 *   ?spell=fire,fire,fire   the rune keys pressed, joined by , or + ('ice' is pressed as Water then Cold); the game's
 *                           queue rules apply (cancels, Ice). `fire,fire/area` carries its form too
 *   &form=force             how it's cast (demo.ts): force, area, place, self, weapon, drag, hold, holddrag, guard;
 *                           the hands (nothing queued): strike, heavy, special, channel, retreat, block
 *   &runes=3                that many presses: the spell's, then more of the first (or cut short)
 *   &aim=deg,dist           wizard 1's aim from where they stand, on the ground: 0 deg to the right of the screen,
 *                           90 toward the camera; dist in world units. Without it, the scene's target
 *   &scene=empty            empty, crowd, dark, coop, ally (scenes.ts)
 *   &others=a/force;b/area  the other wizards' spells in a scene that has them (coop)
 *   &mood=night             a lighting mood instead of the scene's
 *   &seed=7                 the world's seed
 *   &t=0.5                  paused, seconds from the spell going off (wizard 1's cast event; negative: the wind-up).
 *                           On load the sim steps there from the start, the view drawing every tick as the game would
 *                           at 60 fps, and the frame is shown; then <html data-ready="1">. The same URL gives the same
 *                           pixels. Without it the cast plays and loops.
 *   &loop=3 &speed=0.5      the loop: recast this long after the cast; play at this speed (0.25, 0.5 or 1)
 *   &grid=runes             the spell at 1..5 runes side by side, one world and view each (&ns=1,3,5 picks them);
 *                           each panel's t counts from its own cast, so the wind-ups line up at t = 0
 *   &scale=2                screen px per art px (the game picks 2 to 4 by window height)
 *   &size=480x270           each panel's size in art px (the game shows about 270 art px of height)
 *   &zoom=x,y,w,h           show only that part of each panel (art px from its top left)
 *   &bar=0                  no side panel (a clean page for captures)
 * The game's own view options work here too: ?lights=0, ?lighting=0, ?live3d=0, ?sprites=0, ?wizscale=...
 *
 * For tools: window.vfxLab = { ready, setTime(t), metrics(), info() } (see VfxLab below). setTime is exact: its frame
 * is the one a fresh page with that ?t= shows. Moving the clock from the panel reuses the views (no fresh GPU resources
 * each time), so a panel frame can differ from the fresh one in cosmetic details.
 */
import { Application, TextureSource } from 'pixi.js';
import { hashWorld, hex } from '@wizard-sim/sim';
import { parseDemo, type Demo } from '../../demo';
import { emitCount } from '../../art/util';
import { stats } from '../../art/px';
import { liveModel, liveSlugs, liveWorks, setLiveClock } from '../../art/live3d';
import { resetSheetFrames, sheetsReady } from '../../art/sprites';
import { FY } from '../../camera';
import { toU, toV } from '../../iso-world';
import type { WorldView } from '../../view';
import { Cell, worldX, worldY, type CellSpec } from './cell';
import { SCENES, type V } from './scenes';
import { atRunes, isHands, readState, writeState } from './state';
import { mountPanel } from './panel';
import { mountKnobPanel } from './knob-panel';

const S = readState(location.search);
const startT = S.t;

// ---- the setup ------------------------------------------------------------------------------------------------------
const sceneOf = () => SCENES[S.scene] ?? SCENES.empty;
/** Wizard 1's aim point (view space), from S.aim; null: the scene's target. */
function aim0(): V | null {
  if (!S.aim) return null;
  const c = sceneOf().wizards[0].at, a = (S.aim[0] * Math.PI) / 180;
  return [c[0] + S.aim[1] * Math.cos(a), c[1] + S.aim[1] * Math.sin(a)];
}
/** A cast aimed at a view-space point. */
function demoAt(recipe: string | null, at: V): Demo | null {
  const d = parseDemo(recipe);
  if (d) { d.at = [worldX(at), worldY(at)]; for (const s of d.seq ?? []) s.at = d.at; }
  return d;
}
const panelSize = (): [number, number] => S.size ?? (S.grid ? [200, 200] : [480, 270]);
function specs(): CellSpec[] {
  const sc = sceneOf(), a0 = aim0(), [w, h] = panelSize(), others = (S.others ?? '').split(';').filter(Boolean);
  const counts = S.grid ? S.ns : [S.presses.length];
  return counts.map((n, k) => ({
    scene: sc, seed: S.seed, w, h, scale: S.scale, zoom: S.zoom, mood: S.mood, scope: `lab${k}:`, aim0: a0,
    demos: sc.wizards.map((wz, i) => i === 0
      ? demoAt(`${isHands(S.form) ? '' : atRunes(S.presses, n).join(',')}/${S.form}`, a0 ?? sc.target)
      : demoAt(others[i - 1] ?? wz.spell ?? null, wz.aim ?? sc.target)),
  }));
}

// ---- the page ------------------------------------------------------------------------------------------------------
TextureSource.defaultOptions.scaleMode = 'nearest';
const host = document.getElementById('app')!;
const app = new Application();
let cells: Cell[] = [];
/** Views of panels gone, for the next ones (main's panel rebuilds reuse them; setTime makes fresh ones). */
const pool: WorldView[] = [];
const labels: HTMLDivElement[] = [];
/** The clock: s from the cast; playing or paused there. */
let cur = S.t ?? 0, playing = S.t === null;
/** Whether a frame was shown since the panels were built, whether any was between ticks, and whether the views were reused. */
let drawn = false, between = false, reused = false;
let lastMetrics = { particles: 0, fills: 0, fxLive: 0, vfxMs: 0, drawMs: 0, renderMs: 0 };
/** The pointer is over the stage (or dragging an aim): the aim line shows. */
let hover = false, dragging = false;

function layout(): void {
  const W = cells.reduce((s, c) => s + c.pxW, 0), H = Math.max(...cells.map((c) => c.pxH));
  app.renderer.resize(W, H);
  overlay.width = W; overlay.height = H;
  let x = 0;
  cells.forEach((c, k) => {
    c.root.position.set(x, 0);
    const l = labels[k] ?? document.createElement('div');
    if (!labels[k]) { l.className = 'label'; host.appendChild(l); labels[k] = l; }
    l.style.left = `${x + 4}px`;
    l.textContent = S.grid ? `${S.ns[k]} rune${S.ns[k] > 1 ? 's' : ''}` : '';
    l.style.display = S.grid ? '' : 'none';
    x += c.pxW;
  });
  for (let k = cells.length; k < labels.length; k++) labels[k].style.display = 'none';
}

/** New panels for the setup. `fresh`: new views too (what a fresh page has: setTime's exact frames). */
function build(fresh: boolean): void {
  for (const c of cells) { app.stage.removeChild(c.root); if (fresh) c.destroy(); else pool.push(c.release()); }
  // a fresh page's sheet frames: the cache's anchors depend on what was drawn before (art/sprites.ts resetSheetFrames)
  if (fresh) resetSheetFrames();
  cells = specs().map((s) => new Cell(s, app.renderer, fresh ? undefined : pool.shift()));
  for (const c of cells) app.stage.addChild(c.root);
  layout();
  drawn = false; between = false; reused = !fresh;
}

/**
 * Draws each panel and renders it on its own, in turn (live3d's atlas slots are reused by every view's draw, so one
 * render of the whole stage would show the last panel's bodies in all of them), counting what the effects drew.
 */
function drawAll(alphas: number[]): void {
  emitCount.on = true; emitCount.n = 0;
  let fills = 0, vfxMs = 0, fxLive = 0, drawMs = 0, renderMs = 0;
  cells.forEach((c, k) => {
    const t0 = performance.now(), ms = simMs(c, alphas[k]);
    setLiveClock(() => ms / 1000);
    c.draw(alphas[k], ms);
    fills += stats.fills; vfxMs += c.view.fxLastMs; fxLive += c.view.fxLive;
    const t1 = performance.now();
    app.renderer.render({ container: c.root, clear: k === 0 });
    drawMs += t1 - t0; renderMs += performance.now() - t1;
  });
  emitCount.on = false;
  lastMetrics = { particles: emitCount.n, fills, fxLive, vfxMs, drawMs, renderMs };
}

/** The lab's clock for a panel at its tick plus alpha, ms: the view's cosmetic animation and live3d's blends run on it, so a frame is a function of sim time. */
const simMs = (c: Cell, alpha: number): number => 1000 + ((c.tick + alpha) * 1000) / 60;

/** Each panel's step and alpha at t s from its own cast. */
const targetsAt = (t: number) => cells.map((c) => {
  const at = Math.max(0, c.t0 + t * 60), whole = Math.abs(at - Math.round(at)) < 1e-6 ? Math.round(at) : Math.floor(at);
  return { steps: whole, alpha: Math.max(0, at - whole) };
});

/**
 * Steps every panel to t (from the top if it's past it) and draws it. `drawBetween`: the ticks on the way are drawn too,
 * as the game does at 60 fps. The panel's way of moving the clock: setTime's frames need fresh views after it.
 */
function advance(t: number, drawBetween: boolean): void {
  const targets = targetsAt(t);
  cells.forEach((c, k) => {
    if (c.tick > targets[k].steps) c.restart();
    while (c.tick < targets[k].steps) {
      c.stepOnce();
      if (drawBetween && c.tick < targets[k].steps) { const ms = simMs(c, 0); setLiveClock(() => ms / 1000); c.draw(0, ms); }
    }
  });
  drawAll(targets.map((x) => x.alpha));
  drawn = true; between = targets.some((x) => x.alpha !== 0); reused = true;
}

/** Resolves once every panel's painted floor is in (it arrives on a promise after a view's first draw). */
async function grounds(): Promise<void> {
  for (let k = 0; k < 400 && !cells.every((c) => c.view.groundReady); k++) await new Promise((r) => setTimeout(r, 5));
}

/** Exactly the frame a fresh page with ?t=t shows. */
async function setTime(t: number): Promise<void> {
  await readyP;
  playing = false; cur = t; S.t = t;
  const targets = targetsAt(t);
  if (reused || (drawn && (between || cells.some((c, k) => c.tick >= targets[k].steps)))) build(true);
  cells.forEach((c, k) => {
    while (c.tick < targets[k].steps) {
      c.stepOnce();
      if (c.tick < targets[k].steps) { const ms = simMs(c, 0); setLiveClock(() => ms / 1000); c.draw(0, ms); }
    }
  });
  await grounds();
  drawAll(targets.map((x) => x.alpha));
  if (!cells.every((c) => c.view.groundReady)) {
    // that was the panels' first draw (t at the very start): render them again once the floor is in
    await grounds();
    cells.forEach((c, k) => app.renderer.render({ container: c.root, clear: k === 0 }));
  }
  drawn = true; between = targets.some((x) => x.alpha !== 0);
  panel?.sync();
  document.documentElement.dataset.ready = '1';
}

/** Where the loop starts: every panel at its first tick. */
const loopStart = (): number => -Math.max(0, ...cells.map((c) => c.t0)) / 60;

/** The clock in the page (panel and keys): reused views, the URL kept up to date. */
function showAt(t: number): void {
  playing = false; cur = t; S.t = Math.round(t * 1000) / 1000;
  advance(cur, true);
  writeState(S);
  panel?.sync();
  redrawOnGround();
}
function setupChanged(): void {
  build(false);
  if (playing) { cur = loopStart(); advance(cur, false); } else advance(cur, true);
  writeState(S);
  redrawOnGround();
}
/** Paused, a new panel's floor arrives after the frame was drawn: draw the frame again then. */
function redrawOnGround(): void {
  if (playing || cells.every((c) => c.view.groundReady)) return;
  void grounds().then(() => { if (!playing) drawAll(targetsAt(cur).map((x) => x.alpha)); });
}

// ---- the loop --------------------------------------------------------------------------------------------------------
let lastNow = 0;
function frame(now: number): void {
  const dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0;
  lastNow = now;
  if (playing && cells.length) {
    cur += dt * S.speed;
    if (cur > S.loop) { cur = loopStart(); for (const c of cells) c.restart(); }
    advance(cur, false);
  }
  drawOverlay();
  if (panel) panel.metrics(metricsText());
  requestAnimationFrame(frame);
}

function metricsText(): string {
  const m = lab.metrics(), k = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v));
  return `ticks ${m.ticks.join(' ')}   cast at ${m.t0.join(' ')}\n`
    + `particles ${k(m.particles)}  fx ${m.fxLive}  fills ${k(m.fills)}\n`
    + `vfx ${m.vfxMs.toFixed(1)}  draw ${m.drawMs.toFixed(1)}  gpu ${m.renderMs.toFixed(1)} ms\n`
    + `missiles ${m.missiles}  zones ${m.zones}`;
}

// ---- the aim: a line on the stage, and dragging it ------------------------------------------------------------------
const overlay = document.createElement('canvas');
overlay.className = 'overlay';
const og = overlay.getContext('2d')!;
function drawOverlay(): void {
  og.clearRect(0, 0, overlay.width, overlay.height);
  if (!(hover || dragging) || !cells.length) return;
  const sc = sceneOf(), at = sc.wizards[0].at, tgt = aim0() ?? sc.target;
  let x0 = 0;
  for (const c of cells) {
    const cam = c.view.camera, a = cam.worldToScreen(worldX(at), worldY(at)), b = cam.worldToScreen(worldX(tgt), worldY(tgt));
    og.save();
    og.beginPath(); og.rect(x0, 0, c.pxW, c.pxH); og.clip();
    og.translate(x0, 0);
    og.strokeStyle = 'rgba(255,240,160,0.85)'; og.lineWidth = 1.5; og.setLineDash([6, 4]);
    og.beginPath(); og.moveTo(a.x, a.y); og.lineTo(b.x, b.y); og.stroke();
    og.setLineDash([]);
    const r = 7 * cam.scale;
    og.beginPath(); og.ellipse(b.x, b.y, r, r * FY, 0, 0, Math.PI * 2); og.stroke();
    og.beginPath(); og.moveTo(b.x - r - 4, b.y); og.lineTo(b.x + r + 4, b.y); og.moveTo(b.x, b.y - r * FY - 4); og.lineTo(b.x, b.y + r * FY + 4); og.stroke();
    if (c === cells[0]) {
      const du = tgt[0] - at[0], dv = tgt[1] - at[1];
      og.font = '12px ui-monospace, Consolas, monospace'; og.fillStyle = 'rgba(255,240,160,0.95)';
      og.fillText(`${((Math.atan2(dv, du) * 180) / Math.PI).toFixed(0)} deg  ${Math.hypot(du, dv).toFixed(2)} u`, b.x + r + 6, b.y - 6);
    }
    og.restore();
    x0 += c.pxW;
  }
}
/** The ground point under the pointer, in view space, from the panel it's over. */
function groundAt(e: PointerEvent): V | null {
  const r = overlay.getBoundingClientRect();
  let x = e.clientX - r.left;
  const y = e.clientY - r.top;
  for (const c of cells) {
    if (x < c.pxW) { const p = c.view.camera.screenToWorld(x, y); return [toU(p.x, p.y), toV(p.x, p.y)]; }
    x -= c.pxW;
  }
  return null;
}
let aimQueued = false;
function aimTo(e: PointerEvent): void {
  const g = groundAt(e);
  if (!g) return;
  const c = sceneOf().wizards[0].at, du = g[0] - c[0], dv = g[1] - c[1];
  S.aim = [Math.round(((Math.atan2(dv, du) * 180) / Math.PI) * 10) / 10, Math.round(Math.hypot(du, dv) * 100) / 100];
  if (aimQueued) return;
  aimQueued = true;
  requestAnimationFrame(() => { aimQueued = false; setupChanged(); panel?.sync(); });
}
overlay.onpointerenter = () => { hover = true; };
overlay.onpointerleave = () => { hover = false; };
overlay.onpointerdown = (e) => { if (e.button !== 0) return; dragging = true; overlay.setPointerCapture(e.pointerId); aimTo(e); };
overlay.onpointermove = (e) => { if (dragging) aimTo(e); };
overlay.onpointerup = () => { dragging = false; };

// ---- boot -------------------------------------------------------------------------------------------------------------
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
  // the stage's canvas comes first in the page (capture tools take the first canvas), the aim overlay over it
  host.prepend(app.canvas);
  if (S.bar) host.append(overlay);
  await assets();
  build(true);
  if (startT === null) cur = loopStart();
})();

// ---- the API --------------------------------------------------------------------------------------------------------
export interface VfxLab {
  /** Resolves once the page can draw (assets in, panels built); with ?t=, after that frame is on screen. */
  ready: Promise<void>;
  /** Shows the frame `t` s from the cast (exactly as a fresh page with ?t= does) and resolves once it is rendered. Pauses. */
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
  info(): {
    spell: string; form: string; scene: string; seed: number; runes: number[]; grid: boolean; scale: number; size: [number, number];
    zoom: number[] | null; aim: [number, number] | null; mood: string | null; playing: boolean; speed: number;
  };
}

const lab: VfxLab = {
  ready: readyP.then(async () => { if (startT !== null) await setTime(startT); }),
  setTime,
  metrics: () => {
    let missiles = 0, zones = 0;
    for (const c of cells) {
      const w = c.world;
      for (let j = 0; j < w.missiles.alive.length; j++) missiles += w.missiles.alive[j];
      for (let j = 0; j < w.zones.type.length; j++) if (w.zones.type[j]) zones++;
    }
    return { t: playing ? null : cur, ticks: cells.map((c) => c.tick), t0: cells.map((c) => c.t0), missiles, zones, ...lastMetrics, hashes: cells.map((c) => hex(hashWorld(c.world))) };
  },
  info: () => ({
    spell: S.presses.join(','), form: S.form, scene: SCENES[S.scene] ? S.scene : 'empty', seed: S.seed,
    runes: S.grid ? S.ns : [S.presses.length], grid: S.grid, scale: S.scale, size: panelSize(), zoom: S.zoom,
    aim: S.aim, mood: S.mood, playing, speed: S.speed,
  }),
};
(window as unknown as { vfxLab: VfxLab }).vfxLab = lab;

// ---- the panel --------------------------------------------------------------------------------------------------------
const panelHost = document.getElementById('panel')!;
const panel = S.bar ? mountPanel(panelHost, S, {
  setup: () => { if (cells.length) setupChanged(); },
  play: (on) => {
    if (on) { playing = true; S.t = null; if (cur >= S.loop) cur = loopStart(); writeState(S); panel?.sync(); }
    else showAt(Math.round(cur * 60) / 60);
  },
  step: (n) => showAt(Math.round(cur * 60) / 60 + n / 60),
  recast: () => { cur = loopStart(); for (const c of cells) c.restart(); playing = true; S.t = null; writeState(S); panel?.sync(); },
  scrub: (t) => showAt(t),
  speed: (v) => { S.speed = v; writeState(S); },
  clock: () => ({ t: cur, playing, min: Math.floor(loopStart() * 60) / 60, max: S.loop }),
}) : null;
if (!S.bar) panelHost.style.display = 'none';

// The fx-knobs sliders (knob-panel.ts) in the panel's Knobs section; a change redraws the frame shown while paused
// (playing, the next frame picks it up). Mounting it applies this browser's unsaved knob edits (localStorage), so a page
// driven by a tool (navigator.webdriver: puppeteer, vfx-sheet) or with ?bar=0 goes without: it draws with the saved
// knobs only (art/fx-knobs.json), and a ?t= capture stays the same everywhere.
if (panel && !navigator.webdriver) mountKnobPanel(panel.knobs, () => { if (!playing && cells.length) { drawAll(targetsAt(cur).map((x) => x.alpha)); reused = true; } });
else if (panel) panel.knobs.append(Object.assign(document.createElement('div'), { className: 'hint', textContent: 'Knobs are off in a page driven by a tool: it draws with the saved knobs only.' }));

void lab.ready.then(() => { panel?.sync(); requestAnimationFrame(frame); });
