/**
 * The characters in 3D, for step 0 of the port (docs/explorations/2026-11-25-port-3d-plan.md, decision 2): the wizard
 * and the warband drawn by view3d/bodies.ts (Bodies3D, the 3D view's own code) from a real sim world, unpixelated, lit
 * by the kit's stage (lab/kit-render.ts setupStage: sun, sky light, shadows, ACES) on a flat paved floor, at the game
 * camera (28 degree lens, 46 degrees down, from the south). Under them, today's pixel version of each body (art/live3d.ts
 * liveFrame and flushLive, the calls the pixel game makes) drawn from the same state, scaled up. Its own page
 * (bodies3d.html, dev server only); scripts/bodies-shots.mjs takes the step 0 shots of it.
 *
 * ?scene= idle (the lineup standing), walk, attack (each one's attack at its hit, the wizard's staff jab), or wizard
 * (four seats: casting Force, holding the flame sword, a guard carried, a guard raised). ?view=26 is the ground (u) the
 * view spans top to bottom (the game's distance; 10 for a close-up). ?pixels=0 leaves the pixel row out (it needs
 * ?live3d=1 on a software renderer). Sets window.__ready once drawn.
 */
import * as THREE from 'three';
import { AI, ARCH, CAST_ID, EL, GUARD, KIND, MAX_BODIES, PHASE, createWorld, type SimEvent, type World } from '@wizard-sim/sim';
import { setupStage } from './kit-render';
import { Bodies3D } from '../view3d/bodies';
import { BodyTrack, modelOf } from '../view3d/bodies-track';
import { liveModel, liveSlugs, setLiveClock } from '../art/model-pose';
import { livePose } from '../art/live-pose';
import { flushLive, liveFrame } from '../art/live3d';
import { CELL_H, CELL_W, FEET_X, type Anchors } from '../art/rigs';
import type { Frame } from '../art/actors';

const q = new URLSearchParams(location.search);
const SCENE = q.get('scene') ?? 'idle', VIEW_H = Number(q.get('view') ?? 26), PIXELS = q.get('pixels') !== '0';
const W = innerWidth, H = innerHeight;

// ---- the stage: the kit's lights on a paved floor ----
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const sun = setupStage(renderer, scene);
const paveUrl = Object.values(import.meta.glob<string>('../../../../content/generated/textures/paving.png', { eager: true, query: '?url', import: 'default' }))[0];
const pave = await new THREE.TextureLoader().loadAsync(paveUrl);
pave.wrapS = pave.wrapT = THREE.RepeatWrapping; pave.colorSpace = THREE.SRGBColorSpace; pave.anisotropy = 8; pave.repeat.set(20, 20);   // 4 u a tile
const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ map: pave, roughness: 0.92 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

// ---- the bodies, in a sim world: the lineup along x at y = 0 ----
const world: World = createWorld(1, 4);
for (let i = 0; i < MAX_BODIES; i++) world.bodies.kind[i] = 0;
const b = world.bodies, s = world.seats;
/** A body: kind, archetype (enemies), x, facing (turns: 0 east, 0.25 south, toward the camera). */
function put(i: number, kind: number, arch: number, x: number, face: number, r = 0.5): void {
  b.kind[i] = kind; b.arch[i] = arch; b.x[i] = x; b.y[i] = 0; b.face[i] = face; b.r[i] = r; b.hp[i] = b.maxHp[i] = 100;
  b.team[i] = kind === KIND.wizard ? 1 : 2; b.ai[i] = AI.approach; b.aiT[i] = 0;
}
const FACE = 0.19;   // a three-quarter view, turned a little to the east of the camera
const LINEUP: [number, number, string][] = [[0, ARCH.none, 'wizard'], [9, ARCH.swarmer, 'raider-hooded'], [10, ARCH.swarmer, 'raider-goggles'], [11, ARCH.grabber, 'hooker'], [12, ARCH.shieldbearer, 'shieldbearer'], [13, ARCH.caster, 'archer'], [14, ARCH.brute, 'chieftain']];
const labels: { i: number; text: string }[] = [];
const GAP = VIEW_H < 15 ? 1.65 : 2.2;
if (SCENE === 'wizard') {
  const names = ['casting Force', 'flame sword', 'guard carried (Mirror)', 'guard raised (Ember)'];
  // each turned so what it holds shows: the push and the sword side-on, the raised guard toward the camera
  const faces = [0.08, 0.02, FACE, 0.3];
  for (let k = 0; k < 4; k++) { put(k, KIND.wizard, ARCH.none, (k - 1.5) * GAP * 1.2, faces[k]); labels.push({ i: k, text: names[k] }); }
  s.weapon[1] = EL.fire; s.guard[2] = GUARD.mirror; s.guard[3] = GUARD.ember;
} else {
  LINEUP.forEach(([i, arch, name], k) => { put(i, i === 0 ? KIND.wizard : KIND.enemy, arch, (k - 3) * GAP + (arch === ARCH.brute ? 0.4 : 0), FACE, arch === ARCH.brute ? 0.9 : 0.5); labels.push({ i, text: name }); });
  if (SCENE === 'idle') { put(15, KIND.enemy, ARCH.imp, 4 * GAP + 0.6, FACE, 0.4); labels.push({ i: 15, text: 'imp (no model)' }); }
}

// ---- steps: the state each scene shows, through the same hooks the game loop calls ----
const bodies = new Bodies3D(scene);
const pixTrack = new BodyTrack();
let simT = 0;
setLiveClock(() => simT);
function tick(events: Partial<SimEvent>[] = [], move?: () => void): void {
  bodies.beforeStep(world); pixTrack.beforeStep(world);
  move?.();
  world.clock[0]++; simT = world.clock[0] / 60;
  world.events = events.map((e) => ({ tick: world.clock[0], who: -1, kind: 'note', ...e }) as SimEvent);
  bodies.afterStep(world); pixTrack.afterStep(world);
}
await Promise.all(liveSlugs().map((sl) => liveModel(sl)));
tick();
if (SCENE === 'walk') {
  // walking east, side-on to the camera, at the walk's pace (0.5: art/live-pose.ts plays the walk clip)
  const ids = LINEUP.map(([i]) => i), step = 0.035;
  for (const i of ids) { b.x[i] -= 50 * step; b.face[i] = 0.02; }
  for (let k = 0; k < 50; k++) tick([], () => { for (const i of ids) b.x[i] += step; });
} else if (SCENE === 'attack') {
  // each enemy just past its hit (the contact frame plays on the game's hit); the wizard's staff jab mid-thrust
  for (const [i] of LINEUP) if (i) { b.ai[i] = AI.windup; b.aiT[i] = 0; }
  tick([{ kind: 'move', text: 'strike', who: 0 }]);
  for (let k = 0; k < 9; k++) tick([], () => { for (const [i, arch] of LINEUP) if (i) { b.ai[i] = AI.cooldown; b.aiT[i] = k + (arch === ARCH.caster ? 1 : 2); } });
} else if (SCENE === 'wizard') {
  s.phase[0] = PHASE.channel; s.castId[0] = CAST_ID.force;
  for (let k = 0; k < 20; k++) tick([], () => { s.guardT[3] = k + 1; });
} else for (let k = 0; k < 4; k++) tick();

// ---- the game camera ----
const cam = new THREE.PerspectiveCamera(28, W / H, 0.5, 500);
const PITCH = THREE.MathUtils.degToRad(46);
const dist = (VIEW_H * Math.sin(PITCH)) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
const target = new THREE.Vector3(0, VIEW_H < 15 ? 1.1 : 0, 0);
cam.position.copy(target).add(new THREE.Vector3(0, Math.sin(PITCH) * dist, Math.cos(PITCH) * dist)); cam.lookAt(target);
sun.position.copy(target).add(new THREE.Vector3(-30, 40, 22)); sun.target.position.copy(target);

const toScene = (x: number, y: number) => new THREE.Vector3(x, 0, y);
const now = world.clock[0] * (1000 / 60);
bodies.update(world, 0, now, toScene);
renderer.render(scene, cam);

// ---- today's pixel version of each, from the same state, in a row under the 3D ones ----
const over = document.createElement('canvas'); over.id = 'pix'; over.width = W; over.height = H;
document.body.appendChild(over);
const ctx = over.getContext('2d')!;
ctx.imageSmoothingEnabled = false;
const screenX = (i: number) => new THREE.Vector3(b.x[i], 0, b.y[i]).project(cam).x * W / 2 + W / 2;
const screenY = (i: number) => (-new THREE.Vector3(b.x[i], 0, b.y[i]).project(cam).y * H) / 2 + H / 2;
ctx.font = '600 15px system-ui, sans-serif'; ctx.textAlign = 'center';
for (const l of labels) {
  ctx.fillStyle = '#0d0f14cc'; const tw = ctx.measureText(l.text).width + 10;
  ctx.fillRect(screenX(l.i) - tw / 2, screenY(l.i) + 14, tw, 20);
  ctx.fillStyle = '#e8e2d4'; ctx.fillText(l.text, screenX(l.i), screenY(l.i) + 29);
}
if (PIXELS) {
  const none: Anchors = { tip: [0, 0], chest: [0, 0], head: [0, 0], hands: [], charge: [0, 0] };
  const t = world.clock[0] / 60, frames: { i: number; f: Frame | null }[] = [];
  for (const l of labels) {
    const rs = pixTrack.rigState(world, l.i, t, t), slug = modelOf(rs);
    frames.push({ i: l.i, f: slug ? liveFrame(slug, livePose(slug, rs, l.i), none, l.i) : null });
  }
  flushLive();
  const k = 3, base = H - 12;
  ctx.fillStyle = '#14161bdd'; ctx.fillRect(0, base - CELL_H * k - 26, W, CELL_H * k + 26);
  ctx.fillStyle = '#9aa0ad'; ctx.textAlign = 'left'; ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(`Today's pixel version (art/live3d.ts), ${k}x`, 12, base - CELL_H * k - 8);
  for (const { i, f } of frames) {
    if (!f) continue;
    ctx.drawImage(f.c, f.sx, f.sy, CELL_W, CELL_H, Math.round(screenX(i) - FEET_X * k), base - CELL_H * k, CELL_W * k, CELL_H * k);
  }
}
ctx.fillStyle = '#14161bdd'; ctx.fillRect(0, 0, W, 34);
ctx.textAlign = 'left'; ctx.fillStyle = '#c8ccd6'; ctx.font = '14px system-ui, sans-serif';
ctx.fillText(`Bodies3D, scene "${SCENE}", ${VIEW_H} u of ground top to bottom, 28° lens, 46° down, the kit's stage`, 12, 22);
(window as unknown as { __ready: boolean }).__ready = true;
