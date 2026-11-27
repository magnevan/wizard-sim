/**
 * The 3D VFX Lab (cast3d.html, dev only): any spell cast through the real sim by a real wizard on a flat paved floor,
 * drawn by the 3D game's own effects (view3d/spells3d.ts: Fire in look B, everything else as its stand-in,
 * view3d/fx/standins.ts) and bodies (view3d/bodies.ts), at the game camera (28° lens, 46° down, from the south). The
 * pixel VFX Lab's way of naming a spell carries over, so each family can be built and judged here.
 *
 *   ?spell=fire,fire/force   the runes pressed (joined by , or +; 'ice' is pressed as Water then Cold), then the cast
 *                            (demo.ts: force, area, place, self, weapon, drag, hold, holddrag, burstheld, ringheld,
 *                            guard; with nothing queued strike, heavy, special, channel, retreat, block)
 *   &form=place              the cast, when ?spell= doesn't say it
 *   &n=3                     that many presses: the spell's, then more of the first (or cut short)
 *   &t=0.4                   seconds after the spell went off (its cast event; t = 0), frozen there (default 0.4)
 *   &aim=x,y                 where the wizard aims (sim u; the caster stands at -4, 0 and the goblins round 1.5, 0)
 *   &scene=crowd             crowd (the pixel VFX Lab's: a brute and ten goblins held round the target, the default),
 *                            sparse (the old four goblins), empty, attack (a warband winding up
 *                            its attacks at the caster: the telegraphs)
 *   &hit=1                   the sim's hit shapes dotted over it in white (spray cones, beam lines, missiles and their
 *                            flight, zones, area rings), to check the stand-ins against
 *   &view=16                 ground in view top to bottom, u (the game shows 26)
 *   &standins=all            Fire's spray and floor, the Arcane beam and the Frost ring as stand-ins too (else fire.ts, arcane.ts, cold.ts)
 *   &impact=b                the Arcane beam's impact variant: a (restrained, the default) or b (the fuller burst)
 *   &undying=1               the goblins take hits but never die (a held beam stays on its target)
 *   &sweep=1                 the aim swings either way of its target after the cast (a beam following a turning caster)
 *   &move=1                  the caster walks east from 0.2 s before the spell goes off (a nova follows its caster)
 *   &clip=1                  for film: the world is run to t (default -0.1) and drawn; window.__seek(t) then steps it on
 *                            to any later t and draws that (window.__ready is set after each)
 *   &sheet=channels          a contact sheet instead: one tile per spell of a group (channels, missiles, areas, places,
 *                            walls, self, sigil, weapons, previews, all), or &spells=a;b;c (a recipe each, `|t` after it
 *                            for its own moment); &cols=4, &tile=480x300
 *   &fxoff=floor.gas         named parts of the effects not drawn (dev-options.ts, view3d/fx-off.ts)
 * Live (no ?t= and no sheet): the cast loops every 4 s. With ?t= (or ?clip=1) the page is frozen: it draws that moment
 * once and nothing moves until a script calls window.__seek(t), the same cast drawn at t (stepping on from the frame
 * shown, or again from the start for an earlier t); window.__fxoff('a,b') switches parts off and draws it again.
 * window.__ready is set once a frozen frame or sheet is drawn (cleared while __seek works); window.__lab holds the
 * stand-ins' triangle counts. Every step is shown to the fire floor (Spells3D.watchFloor), so a frozen frame or a tile
 * draws each cell at its true age, and each tile starts from its own world (Spells3D.reset). scripts/fx-sheet.mjs
 * drives all of this: frame sheets and clips, one server and one browser for a batch.
 */
import * as THREE from 'three';
import {
  AIM_UNIT, ARCH, KIND, KEYED_EL, MAX_SEATS, NO_INPUT, PHASE, QUEUE_MAX, atan2Turns, createWorld, devRefillRunes, devSpawnEnemy, devStage, restore, quantize, snapshot, specOf, step,
  type World,
} from '@wizard-sim/sim';
import { rules, type Element } from '@wizard-sim/rules';
import { demoInput, parseDemo, type Demo } from '../../demo';
import { setupStage } from '../kit-render';
import { Spells3D } from '../../view3d/spells3d';
import { Bodies3D } from '../../view3d/bodies';
import { setSceneOrigin } from '../../view3d/scene-map';
import { dropOutline } from '../../spray-drop';
import { SCENES as PIXEL_SCENES } from '../vfx-lab/scenes';
import { FOV, PITCH } from '../../view3d/camera3d';
import { liveModel, liveSlugs } from '../../art/model-pose';
import { setOpt } from '../../dev-options';

const q = new URLSearchParams(location.search);
const T_AT = q.has('t') ? Number(q.get('t')) : null;
const HIT = q.get('hit') === '1';
const VIEW_H = Number(q.get('view') ?? 16);
const SCENE = q.get('scene') ?? 'crowd';
const ALL_FIRE = q.get('standins') === 'all';
const IMPACT = q.get('impact') === 'b' ? 'b' : 'a';
const SWEEP = q.get('sweep') === '1', UNDYING = q.get('undying') === '1';
/** ?sweep=1: the aim swings this far either way (rad), this fast (rad/s of the sine), from the cast on. */
const SWEEP_AMP = 0.55, SWEEP_RATE = 2.4;
const MOVE = q.get('move') === '1';
/** ?once=1: after the cast goes off, seat 0 does nothing more (the demo would cast again), so a floor can burn out. */
const ONCE = q.get('once') === '1';
const CLIP = q.get('clip') === '1';
const COLS = Math.max(1, Number(q.get('cols') ?? 4) | 0);
const [TW, TH] = (q.get('tile') ?? '480x300').split('x').map(Number);

/** The groups a contact sheet can show: every form × lead element, a representative each (`recipe|t`). */
const GROUPS: Record<string, string[]> = {
  channels: ['water,water,water/force|0.8', 'cold,cold,cold/force|0.8', 'water,fire,fire/force|0.8', 'fire,fire,fire/force|0.8', 'life,water/force|0.8', 'arcane,arcane/force|0.8', 'life,life/force|0.8', 'arcane,fire/force|0.8', 'lightning,lightning/force|0.6', 'lightning,arcane/force|0.6'],
  missiles: ['earth/force|0.12', 'earth,fire/force|0.12', 'earth,lightning/force|0.12', 'earth,earth,cold/force|0.12', 'ice,ice/force|0.08', 'earth,life/force|0.12'],
  areas: ['fire,fire/area|0.15', 'water,water/area|0.15', 'cold,cold/area|0.15', 'lightning,lightning/area|0.1', 'earth,earth/area|0.15', 'arcane,arcane/area|0.15', 'life,life/area|0.15', 'ice/area|0.15'],
  places: ['water,water/place|0.5', 'fire,fire/place|0.5', 'cold,cold/place|0.5', 'ice,ice/place|0.5', 'water,fire/place|0.5', 'earth,earth/place|0.3', 'arcane,arcane/place|0.3', 'lightning,lightning/place|0.05', 'life,life/place|0.5'],
  walls: ['shield,earth/drag@1,-2.5|0.5', 'shield/drag@1,-2.5|0.5', 'shield,fire/drag@1,-2.5|0.5', 'shield,ice/drag@1,-2.5|0.5', 'shield,earth/place@-1,0|0.5', 'shield,water/force|0.3', 'shield,earth/force|0.3', 'shield/force|0.1'],
  self: ['shield/self|0.5', 'shield,fire/self|0.5', 'shield,earth/self|0.5', 'life/self|0.3', 'sigil/self|0.5', 'sigil,fire/self|0.5', 'shield/area|0.5', 'sigil/area|0.5'],
  sigil: ['sigil,fire/force|1.2', 'sigil,lightning/force|1.2', 'sigil,lightning/place|1.0', 'sigil,cold/drag@1,-1|1.0', 'sigil,fire/area|1.0', 'sigil/place|1.0', 'sigil,arcane/weapon|0.5', 'sigil/force|0.5'],
  weapons: ['fire,fire/weapon|0.1', 'water,water/weapon|0.1', 'earth,earth/weapon|0.1', 'lightning/weapon|0.1', 'cold,cold/weapon|0.1', 'life,earth/weapon|0.1'],
  previews: ['fire,fire/hold|0.6', 'shield,earth/hold|0.6', 'shield,earth/holddrag@1,-2.5|0.6', 'sigil,fire/hold|0.6', 'fire,fire/burstheld@1,0|0.6', 'earth,earth/burstheld@1,0|0.6', 'arcane/ringheld|0.6', 'sigil,lightning/hold|0.6'],
};
GROUPS.all = Object.values(GROUPS).flat();

/** Where the caster stands, where it aims by default, and the goblins (sim u). The Sanctum is 24 × 16 u round the origin. */
const AT: [number, number] = [-4, 0], TARGET: [number, number] = [1.5, 0];
const SCENES: Record<string, { gob: [number, number, number][]; hold: boolean }> = {
  empty: { gob: [], hold: true },
  // the pixel VFX Lab's crowd (vfx-lab/scenes.ts), moved so its caster stands where this one does: the same goblins in
  // the same places, in the spells' reach, so the two labs compare like for like
  crowd: { gob: PIXEL_SCENES.crowd.enemies!.map((e) => [e.at[0] + AT[0] - PIXEL_SCENES.crowd.wizards[0].at[0], e.at[1], ARCH[e.arch]] as [number, number, number]), hold: true },
  sparse: { gob: [[1.5, 0, ARCH.swarmer], [2.2, 1.6, ARCH.swarmer], [2.0, -1.7, ARCH.swarmer], [3.6, 0.6, ARCH.swarmer]], hold: true },
  attack: { gob: [[-2.4, 1.3, ARCH.swarmer], [-4.6, -3.4, ARCH.brute], [0.6, -1.8, ARCH.grabber]], hold: false },
};

/** One recipe parsed: the demo, and its moment. */
interface Recipe { label: string; demo: Demo; t: number }
function recipe(src: string, fallbackT: number): Recipe | null {
  const [body, tq] = src.split('|');
  let [els, cast] = body.split('/');
  if (!cast) cast = q.get('form') ?? 'force';
  const n = q.has('n') ? Number(q.get('n')) : NaN;
  if (n >= 1 && n <= 5 && !src.includes('|')) {
    const presses = els.split(/[+ ,]/).filter((e) => (rules.ALL as readonly string[]).includes(e)) as Element[];
    const out = presses.slice(0, n);
    while (out.length < n && presses.length) out.push(presses[0]);
    els = out.join(',');
  }
  const [c, at] = cast.split('@');
  const aim = at ?? q.get('aim') ?? `${TARGET[0]},${TARGET[1]}`;
  const demo = parseDemo(`${els}/${c}@${aim}`);
  return demo ? { label: `${els}/${cast}`, demo, t: tq !== undefined ? Number(tq) : fallbackT } : null;
}

// ---- the page --------------------------------------------------------------------------------------------------------
const sheetName = q.get('sheet'), list = q.get('spells')?.split(';').filter(Boolean) ?? (sheetName ? GROUPS[sheetName] ?? GROUPS.all : null);
const recipes: Recipe[] = list ? list.map((s) => recipe(s, T_AT ?? 0.4)).filter((r): r is Recipe => !!r) : [recipe(q.get('spell') ?? 'water,water,water/force', T_AT ?? 0.4)!];
const SHEET = !!list;
/** One cast held at a moment (?t= or ?clip=1) until __seek: no loop, the bodies posed on the sim's clock. */
const FROZEN = !SHEET && (CLIP || T_AT !== null);
const rows = SHEET ? Math.ceil(recipes.length / COLS) : 1;
const W = SHEET ? TW * Math.min(COLS, recipes.length) : innerWidth, H = SHEET ? TH * rows : innerHeight;

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(SHEET ? 1 : Math.min(devicePixelRatio, 2));
renderer.setSize(W, H);
renderer.info.autoReset = false;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const sun = setupStage(renderer, scene);

// the floor: the kit's paving, 4 u a tile
const loader = new THREE.TextureLoader();
const paveUrl = Object.values(import.meta.glob<string>('../../../../../content/generated/textures/paving.png', { eager: true, query: '?url', import: 'default' }))[0];
const floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), floorMat);
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
scene.add(floor);
const pending: Promise<unknown>[] = [];
if (paveUrl) pending.push(loader.loadAsync(paveUrl).then((t) => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.repeat.set(20, 20);
  floorMat.map = t; floorMat.needsUpdate = true;
}));
// every character model, so no body stands as a placeholder capsule in a frozen frame
pending.push(...liveSlugs().map((s) => liveModel(s).catch(() => null)));

// the effects: the game's own, on a flat floor whose sim origin is the scene's
setSceneOrigin({ w: 0, h: 0 });
const spells = new Spells3D(scene, () => 0);
spells.standins.drawFire = ALL_FIRE;
spells.standins.drawArcane = ALL_FIRE;
spells.arcane.impact = IMPACT;
spells.standins.drawCold = ALL_FIRE;
pending.push(spells.load());

// ?hit=1: the sim's own shapes, as white dots on the floor
const hitPts = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: new THREE.Color(3, 3, 3), size: 3, sizeAttenuation: false, depthTest: false, transparent: true }));
hitPts.renderOrder = 20; hitPts.frustumCulled = false; hitPts.visible = HIT;
spells.stage.scene.add(hitPts);

// ---- a world, stepped to its moment ------------------------------------------------------------------------------------
interface Run { w: World; bodies: Bodies3D; bursts: { x: number; y: number; r: number; tick: number }[]; t0: number; next: number }

function makeWorld(): World {
  const w = createWorld(7, 1, { room: 'sanctum', dummies: false });
  w.bodies.x[0] = AT[0]; w.bodies.y[0] = AT[1]; w.bodies.face[0] = atan2Turns(TARGET[1] - AT[1], TARGET[0] - AT[0]);
  const sc = SCENES[SCENE] ?? SCENES.crowd;
  for (const [x, y, arch] of sc.gob) { const i = devSpawnEnemy(w, arch, x, y); if (i >= 0) w.bodies.face[i] = atan2Turns(AT[1] - y, AT[0] - x); }
  const own = w.mode;
  w.mode = { ...own, runeMax: (_w, _i, id) => (id > KEYED_EL ? 0 : QUEUE_MAX) };
  if (sc.hold) devStage(w, { hold: true, puppet: -1, goal: null, aim: 0 });
  devRefillRunes(w, 0);
  return w;
}

/** Tick of the cast in the run being stepped (for ?sweep), set by runTo before it steps. */
let sweepFrom = 0;
/** One sim step of the lab's run (?undying: the goblins healed whole after it; ?move: seat 0 walks from `walkFrom`). */
function stepLab(w: World, k: number, d: Demo, walkFrom = Infinity): void {
  step(w, inputs(w, k, d, walkFrom));
  if (UNDYING) for (let i = MAX_SEATS; i < w.bodies.kind.length; i++) if (w.bodies.kind[i] === KIND.enemy) w.bodies.hp[i] = w.bodies.maxHp[i];
}
/** Every seat's input at tick k: seat 0's demo, swung by ?sweep after the cast, walking east by ?move from `walkFrom`. */
const inputs = (w: World, k: number, d: Demo, walkFrom = Infinity) => Array.from({ length: MAX_SEATS }, (_, p) => {
  if (p !== 0) return NO_INPUT;
  if (ONCE && k > sweepFrom + 2) return NO_INPUT;
  let i = demoInput(w, k, 0, d);
  if (MOVE && k >= walkFrom) i = { ...i, moveX: 127 };
  if (!SWEEP || k < sweepFrom) return i;
  const a = SWEEP_AMP * Math.sin(((k - sweepFrom) / 60) * SWEEP_RATE), c = Math.cos(a), s = Math.sin(a), ax = i.aimX * AIM_UNIT, ay = i.aimY * AIM_UNIT;
  return quantize({ ...i, aimX: (ax * c - ay * s) / AIM_UNIT, aimY: (ax * s + ay * c) / AIM_UNIT });
});

/** The tick whose step casts the spell (its cast event, or a hands move), found on a scratch run. */
function findCast(d: Demo): number {
  const w = makeWorld(), start = snapshot(w);
  const hands = d.els.length === 0, keep = sweepFrom;
  sweepFrom = Infinity;   // the search runs the demo's own inputs (no ?once cut-off, no ?sweep)
  for (let k = 0; k < 600; k++) {
    step(w, inputs(w, k, d));
    if (w.events.some((e) => e.who === 0 && (e.kind === 'cast' || (hands && e.kind === 'move')))) { restore(w, start); sweepFrom = keep; return k + 1; }
  }
  sweepFrom = keep;
  // nothing went off (a held preview): t counts from the button press
  return 10 + d.els.length * 6;
}

/** A fresh world run to `t` s after its spell went off, the view told round every step as the game's loop does. */
function runTo(r: Recipe): Run {
  const w = makeWorld(), bodies = new Bodies3D(scene), bursts: Run['bursts'] = [];
  const t0 = findCast(r.demo), end = Math.max(0, t0 + Math.round(r.t * 60));
  sweepFrom = t0;
  spells.reset();
  const run: Run = { w, bodies, bursts, t0, next: 0 };
  stepTo(run, r.demo, end);
  return run;
}

/** Step a run on to tick `end`, the view told round every step. */
function stepTo(run: Run, d: Demo, end: number): void {
  const { w, bodies, bursts } = run;
  for (; run.next < end; run.next++) {
    bodies.beforeStep(w);
    stepLab(w, run.next, d, run.t0 - 12);
    bodies.afterStep(w);
    spells.afterStep(w);
    // every step, not only the frame drawn: each floor cell then shows its true age (Spells3D.watchFloor)
    spells.watchFloor(w);
    for (const e of w.events) if (e.kind === 'burst' && e.who >= 0) bursts.push({ x: e.x, y: e.y, r: e.amount ?? 0, tick: w.clock[0] });
  }
}

function drawHits(run: Run): void {
  const w = run.w, pts: number[] = [];
  const dots = (a: [number, number], b: [number, number], gap = 0.2) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let d = 0; d <= L; d += gap) pts.push(a[0] + ((b[0] - a[0]) * d) / (L || 1), 0.06, a[1] + ((b[1] - a[1]) * d) / (L || 1));
  };
  const circle = (x: number, y: number, r: number) => { for (let k = 0; k < 64; k++) { const a = (k / 64) * Math.PI * 2; pts.push(x + Math.cos(a) * r, 0.06, y + Math.sin(a) * r); } };
  const s = w.seats;
  for (let i = 0; i < MAX_SEATS; i++) {
    if (!s.active[i] || s.phase[i] !== PHASE.channel) continue;
    const spec = specOf(w, i), x = w.bodies.x[i], y = w.bodies.y[i];
    if (spec.shape === 'beam') { dots([x, y], [s.chanEndX[i], s.chanEndY[i]]); continue; }
    if (spec.shape !== 'spray') continue;
    const face = Math.atan2(s.aimY[i], s.aimX[i]), outline = dropOutline(x, y, face, spec.sizeN || 1);
    for (let k = 1; k < outline.length; k++) dots(outline[k - 1], outline[k]);
  }
  const m = w.missiles;
  for (let j = 0; j < m.alive.length; j++) if (m.alive[j]) { circle(m.x[j], m.y[j], m.r[j]); dots([m.x[j], m.y[j]], [m.x[j] + m.vx[j] * m.life[j] / 60, m.y[j] + m.vy[j] * m.life[j] / 60], 0.4); }
  const z = w.zones;
  for (let k = 0; k < z.type.length; k++) if (z.type[k]) circle(z.x[k], z.y[k], z.r[k]);
  for (const b of run.bursts) if (w.clock[0] - b.tick <= 30) circle(b.x, b.y, b.r);
  hitPts.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
}

// ---- the camera: the game camera ---------------------------------------------------------------------------------------
const cam = new THREE.PerspectiveCamera(FOV, W / H, 0.5, 500);
const look = new THREE.Vector3(-0.5, 0.8, 0.3);
function place(aspect: number): void {
  cam.aspect = aspect; cam.updateProjectionMatrix();
  const dist = (VIEW_H * Math.sin(PITCH)) / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
  cam.position.set(look.x, look.y + Math.sin(PITCH) * dist, look.z + Math.cos(PITCH) * dist); cam.lookAt(look);
  cam.updateMatrixWorld();
  sun.position.copy(look).add(new THREE.Vector3(-30, 40, 22)); sun.target.position.copy(look);
}

const stats = { glow: 0, tint: 0, solid: 0 };
(window as unknown as { __lab: typeof stats }).__lab = stats;

function draw(run: Run, box?: { x: number; y: number; w: number; h: number }): void {
  place(box ? box.w / box.h : W / H);
  renderer.info.reset();
  // a film's frames pose the bodies on the sim's clock, so every frame is the same however long it took to draw
  run.bodies.update(run.w, 0, FROZEN || SHEET ? (run.w.clock[0] * 1000) / 60 : performance.now(), (x, y) => new THREE.Vector3(x, 0, y));
  spells.frame(run.w, run.w.clock[0] / 60, { alpha: 0, localSeat: 0, cam });
  if (HIT) drawHits(run);
  spells.render(renderer, scene, cam, box);
  Object.assign(stats, spells.standins.batch.counts);
}

function label(x: number, y: number, text: string): void {
  const d = document.createElement('div');
  d.className = 'tag'; d.style.left = `${x + 8}px`; d.style.top = `${y + 6}px`; d.textContent = text;
  document.body.appendChild(d);
}

await Promise.all(pending);
const info = document.getElementById('info')!;
if (SHEET) {
  for (let i = 0; i < recipes.length; i++) {
    const r = recipes[i], col = i % COLS, row = Math.floor(i / COLS);
    const run = runTo(r);
    // FxStage's box is from the canvas's bottom left
    draw(run, { x: col * TW, y: (rows - 1 - row) * TH, w: TW, h: TH });
    scene.remove(run.bodies.group);
    label(col * TW, row * TH, `${r.label}  t=${r.t}`);
  }
  info.textContent = `${sheetName ?? 'spells'} · scene ${SCENE} · view ${VIEW_H} u${HIT ? ' · hit shapes' : ''}`;
  (window as unknown as { __ready: boolean }).__ready = true;
} else if (FROZEN) {
  // frozen (?t= or ?clip=1): nothing moves until a script calls __seek(t), which steps the cast on (or runs it again
  // from the start, for an earlier t) and draws that moment
  const r = recipes[0];
  const lab = window as unknown as { __ready: boolean; __seek: (t: number) => void; __fxoff: (list: string) => void };
  let run = runTo({ ...r, t: T_AT ?? -0.1 }), shownT = T_AT ?? -0.1;
  lab.__seek = (t: number) => {
    lab.__ready = false;
    const end = run.t0 + Math.round(t * 60);
    if (end < run.next) { scene.remove(run.bodies.group); run = runTo({ ...r, t }); }
    stepTo(run, r.demo, end);
    draw(run);
    shownT = t;
    info.textContent = `${r.label} · t = ${t.toFixed(2)} s · stand-ins: ${stats.glow + stats.tint + stats.solid} tris`;
    lab.__ready = true;
  };
  // ?fxoff= changed live (view3d/fx-off.ts), the moment drawn again
  lab.__fxoff = (list: string) => { setOpt('fxoff', list || null, false); lab.__seek(shownT); };
  label(0, 0, r.label);
  lab.__seek(shownT);
} else {
  // live: the cast loops; the effects' clock is the sim's
  const r = recipes[0], LOOP = 240;
  let run = runTo({ ...r, t: -99 }), tick = 0, last = performance.now(), acc = 0, frames = 0;
  const loop = (): void => {
    const now = performance.now();
    acc += Math.min(0.25, (now - last) / 1000); last = now;
    while (acc >= 1 / 60) {
      acc -= 1 / 60;
      if (tick >= run.t0 + LOOP) { scene.remove(run.bodies.group); run = runTo({ ...r, t: -99 }); tick = 0; }
      stepTo(run, r.demo, tick + 1);
      tick++;
    }
    draw(run);
    info.textContent = `${r.label} · t = ${((tick - run.t0) / 60).toFixed(2)} s · stand-ins: ${stats.glow + stats.tint + stats.solid} tris`;
    if (++frames === 3) (window as unknown as { __ready: boolean }).__ready = true;
    requestAnimationFrame(loop);
  };
  loop();
}
