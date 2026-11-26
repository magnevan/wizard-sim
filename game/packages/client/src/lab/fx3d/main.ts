/**
 * The 3D effects lab (fx3d.html, dev only): the effects kit (view3d/fx/) driven by the real sim, on a flat paved floor
 * lit like the kit, seen through the game camera. Wizard 0 stands in the Sanctum and casts through demo.ts's inputs, as
 * the VFX Lab's panels do; the effects read only the sim's state (the spray's channel, the floor grid).
 *
 *   ?look=a|b      A: code-driven mediums (noise and ramps); B: painted Codex sheets (content/generated/fx/)
 *   ?n=1..5        Fire runes (default 3)
 *   ?cast=spray    the Fire spray (force, held ?hold= seconds, default 2.5); floor: a Fire Place patch (the floor the
 *                  sim leaves: sprays leave the floor alone); both: the patch first, then the spray beside it
 *   ?t=0.5         freeze 0.5 s after the cast (t = 0 is the cast event)
 *   ?times=0.1,0.3,0.6,1,2   a film strip: one tile per time, ?tile=640x480 each
 *   ?sweep=1       the aim swings (as the VFX Lab's sweep); ?hit=1 the sim's hit shapes dotted on the floor (the spray's
 *                  cone and where it stops, every burning cell's middle)
 *   ?view=26       ground in view, u (the game camera's 26 by default); ?x=&y= the middle of the frame (sim u)
 *   ?wiz=0         no wizard
 * window.__fx holds the counts (particles drawn, draw calls, lights); window.__ready is set once a frozen frame or strip
 * is drawn (live: after the first frames).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  AIM_UNIT, BTN, EL, KEYED_EL, QUEUE_MAX, atan2Turns, createWorld, devRefillRunes, devStage, quantize,
  restore, snapshot, step, PHASE, specOf, type PlayerInput, type World,
} from '@wizard-sim/sim';
import wizMeta from '../../../../../content/assets/models/wizard.json';
import { demoInput, type Demo } from '../../demo';
import { setupStage } from '../kit-render';
import { FxStage } from '../../view3d/fx/stage';
import { SpellLights } from '../../view3d/fx/lights';
import { FireFloor, FireSpray, type FireSheets, type FxLook } from '../../view3d/fx/fire';
import { SurfGrid, sprays } from '../../view3d/fx/from-sim';
import { flatFloor } from '../../view3d/fx/decal';import { dropOutline } from '../../spray-drop';


const q = new URLSearchParams(location.search);
const LOOK: FxLook = q.get('look') === 'b' ? 'b' : 'a';
const N = Math.max(1, Math.min(5, Math.round(Number(q.get('n') ?? 3)) || 3));
const CAST = q.get('cast') === 'floor' ? 'floor' : q.get('cast') === 'both' ? 'both' : 'spray';
const HOLD = Number(q.get('hold') ?? 2.5);
const SWEEP = q.get('sweep') === '1', HIT = q.get('hit') === '1', WIZ = q.get('wiz') !== '0';
const FREEZE = q.get('t') !== null ? Number(q.get('t')) : null;
const TIMES = (q.get('times') ?? '').split(',').filter(Boolean).map(Number).filter(Number.isFinite);
const [TW, TH] = (q.get('tile') ?? '640x480').split('x').map(Number);
const VIEW_H = Number(q.get('view') ?? 26);

/** Where wizard 0 stands and aims (sim u), where the patch lands. The Sanctum is 24 × 16 u round the origin. */
const AT: [number, number] = [-4, 0], TARGET: [number, number] = [3, 0];
const PATCH: [number, number] = CAST === 'both' ? [0.5, 2.6] : [0.5, 0];
/** ?sweep=1: the aim swings this far either way (rad) at this rate (rad/s of the sine), as the VFX Lab's does. */
const SWEEP_AMP = 0.75, SWEEP_RATE = 2.1;

// ---- the sim ---------------------------------------------------------------------------------------------------
const w: World = createWorld(7, 1, { room: 'sanctum', dummies: false });
w.bodies.x[0] = AT[0]; w.bodies.y[0] = AT[1]; w.bodies.face[0] = atan2Turns(TARGET[1] - AT[1], TARGET[0] - AT[0]);
const own = w.mode;
w.mode = { ...own, runeMax: (_w, _i, id) => (id > KEYED_EL ? 0 : QUEUE_MAX) };
devStage(w, { hold: true, puppet: -1, goal: null, aim: 0 });
devRefillRunes(w, 0);
const start = snapshot(w);

const fire = Array.from({ length: N }, () => EL.fire);
const sprayDemo: Demo = { els: fire, cast: 'force', at: TARGET }, placeDemo: Demo = { els: fire, cast: 'place', at: PATCH };
/** demoInput's timing: elements pressed from tick 6, one every 6; the button from `go`. Place's button is held 24 ticks. */
const GO = 10 + N * 6;
/** The spray's part of the script starts here (after the patch, when there is one). */
const S0 = CAST === 'both' ? GO + 24 + 50 : 0;

function aimAt(tick: number): [number, number] {
  const ox = w.bodies.x[0], oy = w.bodies.y[0];
  let [tx, ty] = TARGET;
  if (SWEEP) {
    const a = SWEEP_AMP * Math.sin((tick / 60) * SWEEP_RATE), c = Math.cos(a), s = Math.sin(a), dx = tx - ox, dy = ty - oy;
    tx = ox + dx * c - dy * s; ty = oy + dx * s + dy * c;
  }
  return [tx, ty];
}
const aimOnly = (at: readonly [number, number], buttons = 0): PlayerInput =>
  quantize({ buttons, press0: 0, press1: 0, moveX: 0, moveY: 0, aimX: (at[0] - w.bodies.x[0]) / AIM_UNIT, aimY: (at[1] - w.bodies.y[0]) / AIM_UNIT });
function input(tick: number): PlayerInput {
  // the patch: Place goes off a little after the release, where the aim is then, so the aim stays on the spot
  if (CAST === 'floor' || (CAST === 'both' && tick < S0)) return tick < GO + 30 ? demoInput(w, tick, 0, placeDemo) : aimOnly(PATCH);
  const k = tick - S0;
  if (k < GO) return demoInput(w, k, 0, sprayDemo);
  return aimOnly(aimAt(tick), k < GO + HOLD * 60 ? BTN.force : 0);
}

/** One sim step of the script; the runes are topped up before the spray when the patch came first. */
function stepAt(k: number): void {
  if (k === S0 && S0 > 0) devRefillRunes(w, 0);
  step(w, [input(k)]);
}

/** The tick whose step casts the spell t = 0 counts from (the spray's, or the patch's with ?cast=floor). */
function findCast(): number {
  let at = -1;
  const after = CAST === 'floor' ? 0 : S0 + GO - 1;
  for (let k = 0; k < 900 && at < 0; k++) {
    stepAt(k);
    if (k + 1 >= after && w.events.some((e) => e.who === 0 && e.kind === 'cast')) at = k + 1;
  }
  restore(w, start);
  return at >= 0 ? at : S0 + GO;
}
const T0 = findCast();
let tick = 0;
function stepOnce(): void { stepAt(tick); tick++; }

// ---- the page -----------------------------------------------------------------------------------------------------
const STRIP = TIMES.length > 0;
const W = STRIP ? TW * TIMES.length : innerWidth, H = STRIP ? TH : innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(STRIP ? 1 : Math.min(devicePixelRatio, 2));
renderer.setSize(W, H);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const sun = setupStage(renderer, scene);

// the floor: the kit's paving, 4 u a tile
const texUrls = import.meta.glob<string>('../../../../../content/generated/textures/paving.png', { eager: true, query: '?url', import: 'default' });
const fxUrls = import.meta.glob<string>('../../../../../content/generated/fx/*.png', { eager: true, query: '?url', import: 'default' });
const loader = new THREE.TextureLoader();
const floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), floorMat);
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
scene.add(floor);
const pending: Promise<unknown>[] = [];
const paving = Object.values(texUrls)[0];
if (paving) pending.push(loader.loadAsync(paving).then((t) => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.repeat.set(20, 20);
  floorMat.map = t; floorMat.needsUpdate = true;
}));
const sheets: FireSheets = { wisps: null, tongues: null };
const sheet = (name: string): Promise<THREE.Texture | null> => {
  const url = Object.entries(fxUrls).find(([p]) => p.endsWith(`/${name}.png`))?.[1];
  return url ? loader.loadAsync(url).then((t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }) : Promise.resolve(null);
};
const [wisps, tongues] = await Promise.all([sheet('fire-wisps'), sheet('fire-tongues')]);
sheets.wisps = wisps; sheets.tongues = tongues;

// the wizard, posed still at its sim spot (the characters workstream poses it for real)
const WIZ_H = 2.9;
const wizard = new THREE.Group();
scene.add(wizard);
if (WIZ) {
  const url = Object.values(import.meta.glob<string>('../../../../../content/assets/models/wizard.glb', { eager: true, query: '?url', import: 'default' }))[0];
  pending.push(new GLTFLoader().loadAsync(url).then((g) => {
    const o = g.scene;
    o.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
    const show = new Set<string>(wizMeta.show ?? []), norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const hide = new Set((wizMeta.props ?? []).filter((pr) => !show.has(pr.name ?? '')).map((pr) => norm(pr.node)));
    o.traverse((c) => { if (hide.has(norm(c.name))) c.visible = false; });
    const b = new THREE.Box3().setFromObject(o), s = b.getSize(new THREE.Vector3());
    o.scale.setScalar(WIZ_H / s.y); o.position.y = -b.min.y * (WIZ_H / s.y);
    wizard.add(o);
  }));
}

// ---- the effects ----------------------------------------------------------------------------------------------------
const fx = new FxStage();
const lights = new SpellLights();
scene.add(lights.group);
const spray = new FireSpray(LOOK, sheets, 11);
const grid = new SurfGrid(flatFloor);
const floorFx = new FireFloor(LOOK, sheets, grid, 23);
fx.scene.add(spray.group, floorFx.group);

// ?hit=1: the sim's own shapes, as dots on the floor
const hitGeo = new THREE.BufferGeometry();
const hit = new THREE.Points(hitGeo, new THREE.PointsMaterial({ color: new THREE.Color(3, 3, 3), size: 4, sizeAttenuation: false, depthTest: false, transparent: true }));
hit.renderOrder = 10; hit.frustumCulled = false; hit.visible = HIT;
fx.scene.add(hit);
const hitEnd = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: new THREE.Color(3, 2.4, 0.6), size: 5, sizeAttenuation: false, depthTest: false, transparent: true }));
hitEnd.renderOrder = 11; hitEnd.frustumCulled = false; hitEnd.visible = HIT;
fx.scene.add(hitEnd);
function drawHits(): void {
  const pts: number[] = [], end: number[] = [];
  const dots = (a: [number, number], b: [number, number], gap: number, out: number[]) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let d = 0; d <= L; d += gap) out.push(a[0] + ((b[0] - a[0]) * d) / L, 0.04, a[1] + ((b[1] - a[1]) * d) / L);
  };
  const s = w.seats;
  if (s.phase[0] === PHASE.channel) {
    const spec = specOf(w, 0), x = w.bodies.x[0], y = w.bodies.y[0], face = Math.atan2(s.aimY[0], s.aimX[0]);
    const outline = dropOutline(x, y, face, spec.sizeN || 1);
    for (let k = 1; k < outline.length; k++) dots(outline[k - 1], outline[k], 0.2, pts);
    dots([x, y], [s.chanEndX[0], s.chanEndY[0]], 0.3, end);
  }
  const L = grid.burning.image.data as Float32Array;
  for (let i = 0; i < grid.count; i++) {
    const c = L[i * 4], gw = grid.gridSize.x;
    end.push(grid.dims.x + ((c % gw) + 0.5) * grid.dims.z, 0.04, grid.dims.y + (Math.floor(c / gw) + 0.5) * grid.dims.z);
  }
  hitGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  hitEnd.geometry.setAttribute('position', new THREE.Float32BufferAttribute(end, 3));
}

/** The effects' clock: sim time. */
const clock = (k: number): number => k / 60;
/** Feeds the spray its channel each step, so its aim trail holds every tick (as the game view's afterStep would). */
function afterStep(): void { spray.update(clock(tick), sprays(w).find((p) => p.seat === 0 && p.kind === 'fire') ?? null, 0, null); }

// ---- the camera: the kit's game camera (28° lens, 46° down, from the south) -------------------------------------------
const cam = new THREE.PerspectiveCamera(28, W / H, 0.5, 500);
const PITCH = THREE.MathUtils.degToRad(46);
const look = new THREE.Vector3(Number(q.get('x') ?? (CAST === 'floor' ? PATCH[0] : -0.5)), 0.8, Number(q.get('y') ?? (CAST === 'both' ? 1 : 0)));
function frame(aspect: number): void {
  cam.aspect = aspect; cam.updateProjectionMatrix();
  const dist = (VIEW_H * Math.sin(PITCH)) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
  cam.position.set(look.x, look.y + Math.sin(PITCH) * dist, look.z + Math.cos(PITCH) * dist); cam.lookAt(look);
  sun.position.copy(look).add(new THREE.Vector3(-30, 40, 22)); sun.target.position.copy(look);
}

const info = document.getElementById('info')!;
const stats = { particles: 0, calls: 0, lights: 0, cap: spray.cap };
(window as unknown as { __fx: typeof stats; __w: World }).__fx = stats;
(window as unknown as { __w: World }).__w = w;

/** Draws the world as it is now, at effect time t, into `box` (the whole canvas when absent). */
function draw(t: number, box?: { x: number; y: number; w: number; h: number }): void {
  wizard.position.set(w.bodies.x[0], 0, w.bodies.y[0]);
  wizard.rotation.y = Math.PI / 2 - Math.atan2(w.seats.aimY[0] || 0, w.seats.aimX[0] || 1);
  lights.begin();
  spray.update(t, sprays(w).find((p) => p.seat === 0 && p.kind === 'fire') ?? null, 0, lights);
  grid.update(w);
  floorFx.update(t, lights);
  lights.end();
  if (HIT) drawHits();
  frame(box ? box.w / box.h : W / H);
  fx.render(renderer, scene, cam, box);
  stats.particles = floorFx.drawn + (spray.group.visible ? spray.cap : 0); stats.calls = fx.stats.calls; stats.lights = lights.stats.lit;
}

function label(x: number, text: string): void {
  const d = document.createElement('div');
  d.className = 'tag'; d.style.left = `${x + 10}px`; d.style.top = '8px'; d.textContent = text;
  document.body.appendChild(d);
}
const caption = `look ${LOOK.toUpperCase()} · Fire × ${N} · ${CAST}${SWEEP ? ' · sweep' : ''}`;

await Promise.all(pending);
if (STRIP) {
  // a film strip: the sim stepped forward once, a tile drawn at each time
  const order = TIMES.map((t, i) => ({ t, i })).sort((a, b) => a.t - b.t);
  for (const { t, i } of order) {
    const target = Math.max(0, T0 + Math.round(t * 60));
    while (tick < target) { stepOnce(); afterStep(); }
    draw(clock(tick), { x: i * TW, y: 0, w: TW, h: TH });
    label(i * TW, `t = ${t} s`);
  }
  label(0, ''); info.textContent = caption;
  (window as unknown as { __ready: boolean }).__ready = true;
} else if (FREEZE !== null) {
  const target = Math.max(0, T0 + Math.round(FREEZE * 60));
  while (tick < target) { stepOnce(); afterStep(); }
  draw(clock(tick));
  info.textContent = `${caption} · t = ${FREEZE} s · particles ≤ ${stats.particles} · fx draw calls ${stats.calls} · lights ${stats.lights}`;
  (window as unknown as { __ready: boolean }).__ready = true;
} else {
  // live: the cast loops; the effects' clock is the sim's, so each loop rewinds them exactly
  const END = T0 + Math.round((HOLD + 2.5) * 60) + (CAST === 'floor' ? 600 : 0);
  let last = performance.now(), acc = 0, frames = 0;
  const loop = (): void => {
    const now = performance.now();
    acc += Math.min(0.25, (now - last) / 1000); last = now;
    while (acc >= 1 / 60) {
      acc -= 1 / 60;
      if (tick >= END) { restore(w, start); tick = 0; }
      stepOnce(); afterStep();
    }
    draw(clock(tick));
    info.textContent = `${caption} · t = ${((tick - T0) / 60).toFixed(2)} s · particles ≤ ${stats.particles} · fx draw calls ${stats.calls} · lights ${stats.lights}`;
    if (++frames === 3) (window as unknown as { __ready: boolean }).__ready = true;
    requestAnimationFrame(loop);
  };
  loop();
}
