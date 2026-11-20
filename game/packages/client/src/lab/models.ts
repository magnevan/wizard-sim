/**
 * The Model Viewer (dev server only: /models.html; never built). Every live 3D model (art/live3d.ts), each clip on a
 * timeline marked with the game's own timings, shown two ways side by side: full size from any angle, and through the
 * game's own pixel renderer (liveFrame and flushLive, the very calls the game makes), so a fault that hides at 40 px
 * can be found at 400 and checked back at 40.
 *
 * Its state lives in the #hash (model, clip, time, facing and every switch), so a reload, a model re-exported by
 * tools/sprites-3d/export.sh (Vite reloads the page), or a link sent to someone lands on the same frame.
 *
 * Keys: Space play/pause, , and . a frame back and on, Left/Right turn 45 degrees, Up/Down the clip, G the game camera,
 * F the free camera, 1/2/3 split/full/pixel, O onion skin.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Container } from 'pixi.js';
import { ARCHETYPES, BODY, EL as ELID, GUARD, N_EL, type World } from '@wizard-sim/sim';
import { GUARD_PLACE, LIVE_VIEW, flushLive, liveFrame, liveInstance, liveMeta, liveModel, livePoseInst, liveSlugs, liveString, liveWorks, type LiveInst, type LiveModel, type LivePose, type ModelMeta } from '../art/live3d';
import { CELL_H, CELL_W, FEET_X, FEET_Y, newRigState, type Anchors, type RigState } from '../art/rigs';
import { TEAMS } from '../art/px';
import { SHOT_LEAD, shotClipTime, wizardLivePose } from '../art/sprites';
import type { Frame } from '../art/actors';
import * as X from '../art/px';
import { CU, FY, TAU } from '../art/util';
import type { BodyView } from '../art/vfx';
import { StructureView } from '../view-structures';

// ---- state, kept in the #hash ------------------------------------------------------------------------------------------------
const DEFAULTS = {
  m: 'wizard', c: 'walk', t: 0, f: 90, play: true, rate: 1, view: 'split', zoom: 0, cam: 'game',
  seat: 0, flash: false, squash: true, bones: false, rings: true, onion: false, ring8: false, lineup: false,
  wp: '', gd: '', gu: 0, c2: '', w2: 0.5, legs: '', drive: false, speed: 4.2, asGame: false, floor: '#3b3833',
};
type St = typeof DEFAULTS;
const st: St = { ...DEFAULTS };
(function readHash() {
  const q = new URLSearchParams(location.hash.replace(/^#/, ''));
  const s = st as Record<string, unknown>;
  for (const [k, d] of Object.entries(DEFAULTS)) {
    const v = q.get(k);
    if (v === null) continue;
    s[k] = typeof d === 'number' ? Number(v) || 0 : typeof d === 'boolean' ? v === '1' : v;
  }
})();
let hashDue = 0;
function writeHash(): void {
  const q = new URLSearchParams();
  for (const [k, d] of Object.entries(DEFAULTS)) {
    let v = (st as Record<string, unknown>)[k];
    if (k === 't') v = Math.round((v as number) * 1000) / 1000;
    if (v === d) continue;
    q.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
  }
  history.replaceState(null, '', '#' + q.toString());
}
const changed = () => { hashDue = performance.now() + 250; };

// ---- what the sim says about each body -------------------------------------------------------------------------------------------
/** The run clip takes over from this speed: view.ts plays run once a body moves at 0.6 of a wizard's 4.2 u/s. */
const RUN_AT = 0.6 * BODY.walkSpeed;
const ARCH_OF: Record<string, string> = { archer: 'caster', chieftain: 'brute', shieldbearer: 'shieldbearer', hooker: 'grabber' };
function simOf(slug: string): { name: string; radius: number; speed: number; reach: number | null } {
  if (slug === 'wizard') return { name: 'Wizard', radius: BODY.wizardRadius, speed: BODY.walkSpeed, reach: null };
  const a = ARCHETYPES.find((x) => x.id === (ARCH_OF[slug] ?? 'swarmer'))!;
  return { name: a.name, radius: a.radius, speed: a.speed, reach: a.reach };
}
/** Not a clip: a body standing still holds the walk's first frame (sprites.ts livePose), so "idle" shows exactly that. */
const IDLE = 'idle';
/**
 * Game sequences (wizard only): scripted inputs on game seconds, posed by the game's own code (art/sprites.ts
 * wizardLivePose, live3d's blended transitions) so what plays here is what the game plays (the user, 2026-11-20: "I want
 * to be able to view the actual in-game animation in the model viewer"). Gaps follow the sim: the spear recovers in
 * 0.9 s, the trident in 0.65. Pick the weapon and guard in Weapons and guards.
 */
interface SeqEv { at: number; kind: 'blow' | 'cast' | 'area' | 'self' | 'walk' | 'block'; len?: number }
const SEQS: Record<string, { len: number; ev: SeqEv[] }> = {
  '▶ blow': { len: 2, ev: [{ at: 0.2, kind: 'blow' }] },
  '▶ blow x3 (spear)': { len: 3.4, ev: [{ at: 0.2, kind: 'blow' }, { at: 1.1, kind: 'blow' }, { at: 2, kind: 'blow' }] },
  '▶ blow x4 (trident)': { len: 3.4, ev: [0.2, 0.85, 1.5, 2.15].map((at) => ({ at, kind: 'blow' as const })) },
  '▶ blow, Force cast': { len: 3.2, ev: [{ at: 0.2, kind: 'blow' }, { at: 1.1, kind: 'cast', len: 1 }] },
  '▶ blow, Self cast': { len: 3.2, ev: [{ at: 0.2, kind: 'blow' }, { at: 1.1, kind: 'self' }] },
  '▶ blow, walk on': { len: 2.6, ev: [{ at: 0.2, kind: 'blow' }, { at: 0.6, kind: 'walk' }] },
  '▶ walk, blow x2': { len: 2.8, ev: [{ at: 0, kind: 'walk' }, { at: 0.4, kind: 'blow' }, { at: 1.3, kind: 'blow' }] },
  '▶ blow, block': { len: 2.8, ev: [{ at: 0.2, kind: 'blow' }, { at: 1.1, kind: 'block', len: 1 }] },
};
const isSeq = (c: string) => c in SEQS;
/** The game's rig state for a sequence `t` s in. */
function seqState(name: string, t: number, face: number): RigState {
  const s = newRigState(), q = SEQS[name];
  s.kind = 'wizard'; s.pal = Math.max(0, st.seat); s.face = s.faceT = face;
  s.weapon = WEAPON_EL[st.wp] ?? 0; s.bare = s.weapon ? 1 : 0;
  s.guard = st.gd ? GUARD[st.gd as keyof typeof GUARD] ?? 0 : 0;
  for (const e of q.ev) {
    if (e.at > t) continue;
    const u = t - e.at;
    if (e.kind === 'blow' || e.kind === 'area' || e.kind === 'self') { s.shot = e.kind === 'blow' ? 1 : e.kind === 'area' ? 2 : 3; s.shotT = u; }
    if (e.kind === 'cast' && u < (e.len ?? 1)) s.cast = u < 0.05 ? 0.5 : 1;   // the view's cast pose steps by halves
    if (e.kind === 'block' && u < (e.len ?? 1) && s.guard) s.block = Math.round(u * 60);
    if (e.kind === 'walk') { s.spd = 0.5; s.dist = u * st.speed * 16 * 1.15; }
  }
  return s;
}
const clipNames = (m: ModelMeta): string[] => [IDLE, ...Object.keys(m.clips)];
const ONE_SHOTS = new Set(['attack0', 'area', 'self', 'thrust', 'lash', 'shoot']);

// ---- the clip's marks: the game's timings ----------------------------------------------------------------------------------------
interface Mark { t: number; label: string; color: string }
interface Span { a: number; b: number; label: string; color: string }
interface Marks { marks: Mark[]; spans: Span[]; range: [number, number] | null; cut: [number, number] | null; note: string }
function marksOf(slug: string, meta: ModelMeta, clip: string): Marks {
  const out: Marks = { marks: [], spans: [], range: null, cut: null, note: '' };
  if (isSeq(clip)) {
    for (const e of SEQS[clip].ev) out.marks.push({ t: e.at, label: e.kind, color: e.kind === 'blow' ? '#ff5a4a' : '#5ac8ff' });
    out.note = 'A game sequence: the game\'s own pose code on game seconds (the timeline), with its blended transitions. Weapon and guard from Weapons and guards (the staff when none).';
    return out;
  }
  if (clip === IDLE) { out.note = "The models have no idle clip: in the game a body standing still holds the walk's first frame, as here."; return out; }
  const atk = meta.attacks.find((a) => a.clip === clip);
  if (atk) {
    out.marks.push({ t: atk.first, label: 'first', color: '#8a93a6' }, { t: atk.hit, label: 'hit', color: '#ff5a4a' }, { t: atk.last, label: 'last', color: '#8a93a6' });
    if (atk.cut) { out.cut = atk.cut; out.spans.push({ a: atk.cut[0], b: atk.cut[1], label: 'cut (skipped)', color: 'rgba(255,90,74,.22)' }); }
    out.range = [atk.first, atk.last];
    out.note = 'The game runs it from "first" to "last" on its own clock, the hit on the sim\'s hit' + (atk.cut ? ', and skips the cut hold.' : '.');
  }
  const cast = meta.casts?.[clip];
  if (cast) {
    out.marks.push({ t: cast.first, label: 'first', color: '#8a93a6' }, { t: cast.hit, label: 'release', color: '#5ac8ff' }, { t: cast.last, label: 'last', color: '#8a93a6' });
    if (clip === 'cast') {
      const held = cast.hit + (cast.last - cast.hit) / 2;
      out.marks.push({ t: held, label: 'held', color: '#e0b04a' });
      out.range = [cast.first, held];
      out.note = 'A Force cast pushes from "first" into "held" as the spell charges, then holds there while it flows.';
    }
  }
  if (slug === 'wizard' && ONE_SHOTS.has(clip)) {
    const o = clip === 'attack0' ? atk : cast;
    if (o) {
      const start = shotClipTime(o, 0, clip);
      out.marks.push({ t: start, label: 'game starts', color: '#e0b04a' });
      out.range = [start, o.last];
      out.note = `The wizard's one-shots run their wind-up in the ${SHOT_LEAD} s before the release (the game's cast is instant), then play on and hand back.`;
    }
  }
  const rel = meta.release[clip];
  if (rel !== undefined && !out.marks.some((m) => Math.abs(m.t - rel) < 1e-3)) out.marks.push({ t: rel, label: 'release', color: '#5ac8ff' });
  const y = meta.yaw[clip];
  if (y) out.spans.push({ a: y[1], b: y[4], label: `turn ${y[0]}°`, color: 'rgba(90,150,255,.16)' });
  if (clip === 'gather') out.note = 'Not played in the game: queuing runes plays no animation, only casting does.';
  if (clip === 'death') out.note = 'Plays once, lies still 1.6 s, then fades over 0.6 s.';
  if (meta.clips[clip]?.stride) out.note = 'The game plays walk and run by distance over the stride, not by the clock: try "drive by speed".';
  return out;
}

// ---- page --------------------------------------------------------------------------------------------------------------------------
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const side = $('side'), fullBox = $('full'), pixBox = $('pix'), tl = $<HTMLCanvasElement>('tl'), readout = $('readout');
const playBtn = $<HTMLButtonElement>('play'), rateSel = $<HTMLSelectElement>('rate');
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props); e.append(...kids);
  return e;
}
const h3 = (t: string) => el('h3', { textContent: t });
const row = (...kids: (Node | string)[]) => el('div', { className: 'row' }, ...kids);

type BoolKey = { [K in keyof St]: St[K] extends boolean ? K : never }[keyof St];
function check(label: string, key: BoolKey, title = '', after?: () => void): HTMLElement {
  const b = el('input', { type: 'checkbox', checked: st[key] });
  b.onchange = () => { st[key] = b.checked; changed(); after?.(); };
  const l = el('label', { title }, b, ' ' + label);
  return l;
}

// ---- the full-size view ------------------------------------------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(devicePixelRatio);
fullBox.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2026);
scene.add(new THREE.HemisphereLight(0xfff4e6, 0x3a3530, 1.4));
const sunL = new THREE.DirectionalLight(0xffffff, 2.2); sunL.position.copy(LIVE_VIEW.sun); scene.add(sunL, sunL.target);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshLambertMaterial({ color: 0x34373d }));
ground.rotation.x = -Math.PI / 2; scene.add(ground);
const grid = new THREE.GridHelper(60, 60, 0x5a606c, 0x454a54); grid.position.y = 0.002; scene.add(grid);
const circle = (color: number) => {
  const pts = Array.from({ length: 64 }, (_, i) => new THREE.Vector3(Math.cos((i / 64) * Math.PI * 2), 0, Math.sin((i / 64) * Math.PI * 2)));
  const l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, depthTest: false }));
  l.position.y = 0.01; l.renderOrder = 2; scene.add(l); return l;
};
const bodyRing = circle(0x6adf7a), reachRing = circle(0xe0904a);
const facing = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0.02, 0), 1, 0x6adf7a, 0.18, 0.12); scene.add(facing);
const strings = new THREE.Group(); scene.add(strings);

const persp = new THREE.PerspectiveCamera(35, 1, 0.05, 200);
persp.position.set(3.2, 2.6, 4.4);
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
const controls = new OrbitControls(persp as THREE.Camera, renderer.domElement);
controls.target.set(0, 1, 0); controls.enableDamping = true;
let cam: THREE.Camera = persp;

let model: LiveModel | null = null, meta: ModelMeta | null = null, inst: LiveInst | null = null, bones: THREE.SkeletonHelper | null = null;
let loadTicket = 0, height = 2;

/** The game's camera: orthographic, 20 degrees up, at the pixel view's scale so the two frame the body alike. */
function gameCam(): void {
  st.cam = 'game'; changed();
  cam = ortho; controls.object = ortho;
  controls.target.set(0, height * 0.5, 0);
  ortho.position.set(0, Math.sin(LIVE_VIEW.elev), Math.cos(LIVE_VIEW.elev)).multiplyScalar(40).add(controls.target);
  ortho.zoom = 1; ortho.up.set(0, 1, 0); ortho.lookAt(controls.target);
  fitCams(); controls.update(); syncCamButtons();
}
function freeCam(): void {
  st.cam = 'free'; changed();
  cam = persp; controls.object = persp;
  controls.target.set(0, height * 0.5, 0);
  persp.position.set(height * 1.4, height * 1.1, height * 1.9);
  controls.update(); syncCamButtons();
}
function fitCams(): void {
  const w = fullBox.clientWidth || 1, h = fullBox.clientHeight || 1;
  renderer.setSize(w, h);
  persp.aspect = w / h; persp.updateProjectionMatrix();
  // the body's height fills about 60 % of the view
  const ppx = h / (height * 1.65);
  ortho.left = -w / 2 / ppx; ortho.right = w / 2 / ppx; ortho.top = h / 2 / ppx; ortho.bottom = -h / 2 / ppx;
  ortho.updateProjectionMatrix();
}

async function loadModel(slug: string): Promise<void> {
  const ticket = ++loadTicket;
  const m = await liveModel(slug);
  if (ticket !== loadTicket) return;   // another model was picked meanwhile
  if (inst) scene.remove(inst.root);
  if (bones) { scene.remove(bones); bones.dispose(); bones = null; }
  model = m; meta = liveMeta(slug) ?? null;
  if (!m || !meta) { inst = null; buildModelPanel(); return; }
  inst = liveInstance(slug, m, true);
  scene.add(inst.root);
  bones = new THREE.SkeletonHelper(inst.body); scene.add(bones);
  height = meta.height ?? 2;
  if (st.c !== IDLE && !isSeq(st.c) && !meta.clips[st.c]) st.c = meta.clips.walk ? 'walk' : Object.keys(meta.clips)[0];
  if (st.c2 && !meta.clips[st.c2]) st.c2 = '';
  const sim = simOf(slug);
  bodyRing.scale.setScalar(sim.radius);
  reachRing.scale.setScalar(sim.radius + (sim.reach ?? 0));
  if (st.cam === 'game') gameCam(); else freeCam();
  buildModelPanel();
}

// ---- the pixel view ---------------------------------------------------------------------------------------------------------------
const pixCanvas = el('canvas'); pixBox.append(pixCanvas);
const px = pixCanvas.getContext('2d')!;
const ANCH: Anchors = { tip: [0, -30], chest: [0, -20], head: [0, -32], hands: [[0, -16], [0, -16]], charge: [0, -30] };
/** The game's own scale on this screen: the largest whole number that shows about 270 art px of height (camera.ts fit). */
const gameScale = () => Math.max(1, Math.floor((screen.height * devicePixelRatio) / 270));
/** Spacing of the small rows (8 facings, the line-up), in art px a frame. */
const STEP = Math.round(CELL_W * 0.55);
/** The small rows' scale: the game's, or less if a row wouldn't fit across. */
function rowScale(): number {
  const n = Math.max(st.ring8 ? 8 : 0, st.lineup ? liveSlugs().length * 1.25 : 0) || 1;
  return Math.max(1, Math.min(gameScale(), Math.floor((pixCanvas.width || 400) / (STEP * (n + 0.6)))));
}
const rowsH = () => ((st.ring8 ? 1 : 0) + (st.lineup ? 1 : 0)) * (CELL_H * rowScale() + 16 * devicePixelRatio);
function pixZoom(): number {
  if (st.zoom > 0) return st.zoom;
  const w = pixCanvas.width || 400, h = pixCanvas.height || 400;
  return Math.max(1, Math.floor(Math.min(w / (CELL_W * 1.1), (h - rowsH() - 30 * devicePixelRatio) / CELL_H)));
}
function fitPix(): void {
  pixCanvas.width = Math.round(pixBox.clientWidth * devicePixelRatio); pixCanvas.height = Math.round(pixBox.clientHeight * devicePixelRatio);
  pixCanvas.style.width = pixBox.clientWidth + 'px'; pixCanvas.style.height = pixBox.clientHeight + 'px';
}
const DIRS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];

interface Booked { f: Frame | null; x: number; y: number; z: number; a: number; label?: string; top?: boolean; fx?: LivePose }
function drawPixels(pose: LivePose, ghosts: LivePose[]): void {
  const W = pixCanvas.width, H = pixCanvas.height, dpr = devicePixelRatio;
  px.imageSmoothingEnabled = false;
  px.fillStyle = st.floor; px.fillRect(0, 0, W, H);
  if (!model || !meta) return;
  const z = pixZoom(), gz = gameScale(), list: Booked[] = [];
  const book = (slug: string, p: LivePose, x: number, y: number, zz: number, a = 1, label?: string, who = 0, top = false, fx = false) =>
    list.push({ f: liveFrame(slug, p, ANCH, who), x, y, z: zz, a, label, top, fx: fx ? p : undefined });
  // the main body (and its ghosts), the feet a little below the middle
  const mx = Math.round(W / 2), my = Math.round(24 * dpr + FEET_Y * z), rz = rowScale();
  ghosts.forEach((g, i) => book(st.m, g, mx, my, z, 0.28, undefined, 10 + i));
  book(st.m, pose, mx, my, z, 1, undefined, 0, false, true);
  // the same frame at the game's own size, top right
  book(st.m, pose, W - Math.round(CELL_W * gz * 0.75), Math.round(28 * dpr + FEET_Y * gz), gz, 1, `game size (${gz}x)`, 1, true, true);
  let y = Math.round(24 * dpr + CELL_H * z);
  const step = STEP * rz;
  if (st.ring8) {
    y += FEET_Y * rz;
    const x0 = Math.round(W / 2 - (step * 7) / 2);
    for (let d = 0; d < 8; d++) book(st.m, { ...pose, face: (d * Math.PI) / 4 }, x0 + d * step, y, rz, 1, DIRS[d], 20 + d);
    y += (CELL_H - FEET_Y) * rz + Math.round(16 * dpr);
  }
  if (st.lineup) {
    y += FEET_Y * rz;
    const slugs = liveSlugs(), ls = Math.round(step * 1.25), x0 = Math.round(W / 2 - (ls * (slugs.length - 1)) / 2);
    slugs.forEach((s, i) => {
      const mm = liveMeta(s)!, clip = st.c !== IDLE && mm.clips[st.c] ? st.c : 'walk', d = mm.clips[clip]?.duration ?? 1;
      const p: LivePose = { move: clip, t: Math.min(pose.t, d - 1e-3), face: pose.face, flash: false, seat: s === 'wizard' ? TEAMS[Math.max(0, st.seat)] : undefined };
      book(s, p, x0 + i * ls, y, rz, 1, s, 40 + i);
    });
  }
  flushLive();
  if (!liveWorks()) {
    px.fillStyle = '#e08a5a'; px.font = `${13 * dpr}px system-ui`;
    px.fillText('Live 3D is off here (no WebGL2, a software renderer, or ?live3d=0). Add ?live3d=1 to force it.', 12 * dpr, 40 * dpr);
    return;
  }
  px.font = `${11 * dpr}px system-ui`; px.textAlign = 'center';
  for (const b of list) {
    if (b.label) { px.globalAlpha = 1; px.fillStyle = '#9aa0ad'; px.fillText(b.label, b.x, b.top ? 18 * dpr : b.y + 12 * dpr); }
    if (!b.f) continue;
    px.globalAlpha = b.a;
    // a wizard's weapon and guard bring their own particles (the game's code), under the body and over it
    const fx = b.fx ? armsLayers(b.f, b.fx) : null;
    const put = (c: HTMLCanvasElement) => px.drawImage(c, 0, 0, c.width, c.height, b.x - (FEET_X + FX_PAD) * b.z, b.y - (FEET_Y + FX_PAD) * b.z, c.width * b.z, c.height * b.z);
    if (fx) put(fx.g);
    px.drawImage(b.f.c as CanvasImageSource, b.f.sx, b.f.sy, CELL_W, CELL_H, b.x - FEET_X * b.z, b.y - FEET_Y * b.z, CELL_W * b.z, CELL_H * b.z);
    if (fx) put(fx.o);
  }
  px.globalAlpha = 1; px.textAlign = 'left';
  $('pixtag').textContent = `Pixel, the game's own renderer: ${z}x` + (st.zoom ? '' : ' (fit)') + (st.ring8 || st.lineup ? `; rows at ${rz}x` : '');
}

// ---- the weapons' and guards' own effects -----------------------------------------------------------------------------------------
/** The wizard's weapon props and the element each one conjures (sprites.ts WEAPON_PROP, the other way round). */
const WEAPON_EL: Record<string, number> = { sword: ELID.fire, earthmaul: ELID.earth, focus: ELID.arcane, icebow: ELID.ice, frostspear: ELID.cold, whip: ELID.lightning, trident: ELID.water };
const armsView = new StructureView(new Container());
/** Art px of room round a cell for effects that run past it, and the two layers (behind the body, over it). */
const FX_PAD = 48;
const fxG = X.canvas(CELL_W + 2 * FX_PAD, CELL_H + 2 * FX_PAD), fxO = X.canvas(CELL_W + 2 * FX_PAD, CELL_H + 2 * FX_PAD);
/**
 * The picked weapon's and guard's effects for this frame: the game's own StructureView.armsFx on a one-seat stand-in
 * world, laid over the live frame f (its anchors say where the prop is on screen). Null when nothing is picked.
 */
function armsLayers(f: Frame, pose: LivePose): { g: HTMLCanvasElement; o: HTMLCanvasElement } | null {
  if (st.m !== 'wizard') return null;
  const guard = st.gd ? GUARD[st.gd as keyof typeof GUARD] ?? 0 : 0, weapon = WEAPON_EL[st.wp] ?? 0;
  if (!guard && !weapon) return null;
  const up = pose.guardUp ?? 0;
  const world = {
    seats: {
      weapon: Uint8Array.of(weapon), weaponEls: new Uint8Array(N_EL), specT: new Float64Array(1), handT: new Float64Array(1),
      guard: Uint8Array.of(guard), guardEls: new Uint8Array(N_EL), guardT: Float64Array.of(up > 0 ? 6 * up + 0.01 : 0), guardHp: Float64Array.of(999), guardCharge: new Float64Array(1),
    },
    bodies: { face: Float64Array.of(pose.face / TAU) },
  } as unknown as World;
  for (const c of [fxG, fxO]) c.x.clearRect(0, 0, c.c.width, c.c.height);
  const v: BodyView = { on: true, x: FX_PAD + FEET_X, y: FX_PAD + FEET_Y, a: f.a, rig: 'wizard', seat: 0, f };
  const cs = Math.cos(pose.face), sn = Math.sin(pose.face);
  const P = (a: number, b: number, u: number): [number, number, number] => [v.x + a * cs - b * sn, v.y + (a * sn + b * cs) * FY - u * CU, a * sn + b * cs];
  armsView.armsFx(world, 0, v, performance.now() / 1000, fxG.x, fxO.x, P, () => {});
  return { g: fxG.c, o: fxO.c };
}

// ---- the timeline -----------------------------------------------------------------------------------------------------------------
let marks: Marks = { marks: [], spans: [], range: null, cut: null, note: '' };
const dur = () => (st.c === IDLE ? 1 : isSeq(st.c) ? SEQS[st.c].len : meta?.clips[st.c]?.duration ?? 1);
function drawTimeline(): void {
  const dpr = devicePixelRatio, W = Math.round(tl.clientWidth * dpr), H = Math.round(tl.clientHeight * dpr);
  if (tl.width !== W || tl.height !== H) { tl.width = W; tl.height = H; }
  const g = tl.getContext('2d')!, D = dur(), X = (t: number) => (t / D) * (W - 2) + 1;
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#23262e'; g.fillRect(0, 14 * dpr, W, H - 14 * dpr);
  if (marks.range && st.asGame) { g.fillStyle = 'rgba(224,176,74,.12)'; g.fillRect(X(marks.range[0]), 14 * dpr, X(marks.range[1]) - X(marks.range[0]), H); }
  for (const s of marks.spans) { g.fillStyle = s.color; g.fillRect(X(s.a), 14 * dpr, X(s.b) - X(s.a), H); }
  // frames and tenths
  const fps = meta?.fps ?? 24;
  g.fillStyle = '#3a3e48';
  if (W / (D * fps) > 4 * dpr) for (let f = 0; f <= D * fps; f++) g.fillRect(Math.round(X(f / fps)), H - 5 * dpr, 1, 5 * dpr);
  g.fillStyle = '#5a5f6b'; g.font = `${9 * dpr}px system-ui`;
  for (let t = 0; t <= D + 1e-6; t += 0.1) {
    const big = Math.abs(t * 2 - Math.round(t * 2)) < 1e-6;
    g.fillRect(Math.round(X(t)), H - (big ? 12 : 8) * dpr, 1, (big ? 12 : 8) * dpr);
    if (big) g.fillText(t.toFixed(1), X(t) + 2, H - 13 * dpr);
  }
  g.font = `${10 * dpr}px system-ui`;
  for (const m of marks.marks) {
    g.fillStyle = m.color; g.fillRect(Math.round(X(m.t)) - dpr, 14 * dpr, 2 * dpr, H);
    g.fillText(m.label, Math.min(W - 60 * dpr, X(m.t) + 3), 11 * dpr);
  }
  for (const s of marks.spans) { g.fillStyle = '#9aa0ad'; g.fillText(s.label, X(s.a) + 3, 26 * dpr); }
  g.fillStyle = '#fff'; g.fillRect(Math.round(X(st.t)) - dpr, 14 * dpr, 2 * dpr, H);
  const f = Math.round(st.t * fps);
  readout.textContent = `${st.t.toFixed(3)} s  ·  frame ${f}/${Math.round(D * fps)}  ·  ${fps} fps`;
}
let scrubbing = false;
const scrubTo = (e: PointerEvent) => {
  const r = tl.getBoundingClientRect();
  st.t = Math.min(dur(), Math.max(0, ((e.clientX - r.left) / r.width) * dur()));
  st.drive = false; syncDrive(); changed();
};
tl.onpointerdown = (e) => { scrubbing = true; tl.setPointerCapture(e.pointerId); setPlay(false); scrubTo(e); };
tl.onpointermove = (e) => { if (scrubbing) scrubTo(e); };
tl.onpointerup = () => { scrubbing = false; };

function setPlay(on: boolean): void { st.play = on; playBtn.textContent = on ? 'Pause' : 'Play'; changed(); }
playBtn.onclick = () => setPlay(!st.play);
rateSel.value = String(st.rate);
rateSel.onchange = () => { st.rate = Number(rateSel.value); changed(); };
function stepFrame(n: number): void {
  setPlay(false);
  const fps = meta?.fps ?? 24;
  st.t = Math.min(dur(), Math.max(0, (Math.round(st.t * fps) + n) / fps)); changed();
}

// ---- the side panel ---------------------------------------------------------------------------------------------------------------
const modelList = el('div', { className: 'list' }), clipList = el('div', { className: 'list' }), info = el('div', { className: 'note' });
const clip2Sel = el('select');
const gearBox = el('div');
const driveBox = el('div'), driveNote = el('div', { className: 'note' });
const camFree = el('button', { className: 'b', textContent: 'Free', title: 'F' }), camGame = el('button', { className: 'b', textContent: 'Game camera', title: 'G' });
camFree.onclick = freeCam; camGame.onclick = gameCam;
const syncCamButtons = () => { camFree.classList.toggle('on', st.cam === 'free'); camGame.classList.toggle('on', st.cam === 'game'); };
const viewBtns = (['split', 'full', 'pix'] as const).map((v, i) => {
  const b = el('button', { className: 'b', textContent: ['Split', 'Full', 'Pixel'][i], title: String(i + 1) });
  b.onclick = () => setView(v); return b;
});
function setView(v: string): void {
  st.view = v; changed();
  fullBox.classList.toggle('off', v === 'pix'); pixBox.classList.toggle('off', v === 'full');
  viewBtns.forEach((b, i) => b.classList.toggle('on', ['split', 'full', 'pix'][i] === v));
  requestAnimationFrame(resize);
}

function setClip(c: string): void {
  st.c = c; st.t = 0; changed();
  buildModelPanel();
}

function buildSide(): void {
  side.replaceChildren();
  side.append(h3('Model'), modelList);
  for (const s of liveSlugs()) {
    const b = el('button', { className: s === st.m ? 'on' : '' }, s, el('small', { textContent: simOf(s).name }));
    b.onclick = () => { st.m = s; changed(); for (const x of modelList.children) x.classList.toggle('on', x === b); void loadModel(s); };
    modelList.append(b);
  }
  side.append(h3('Clip'), clipList, info);

  side.append(h3('View'), row(...viewBtns), row(camGame, camFree));
  const zoomSel = el('select', { title: 'Pixel zoom (device px per art px)' });
  zoomSel.append(el('option', { value: '0', textContent: 'fit' }), ...[1, 2, 3, 4, 5, 6, 8, 10, 12].map((z) => el('option', { value: String(z), textContent: z + 'x' })));
  zoomSel.value = String(st.zoom);
  zoomSel.onchange = () => { st.zoom = Number(zoomSel.value); changed(); fitCams(); };
  const floorSel = el('select', { title: 'The floor behind the pixel view' });
  for (const [n, c] of [['stone', '#3b3833'], ['grass', '#4a5a34'], ['sand', '#a89a76'], ['light', '#c9c4b8'], ['dark', '#16181d']]) floorSel.append(el('option', { value: c, textContent: n }));
  floorSel.value = st.floor; floorSel.onchange = () => { st.floor = floorSel.value; changed(); };
  side.append(row('Pixel zoom', zoomSel, 'floor', floorSel));

  side.append(h3('Facing'));
  const faceIn = el('input', { type: 'range', min: '0', max: '359', step: '1', value: String(st.f) });
  const faceOut = el('span', { textContent: '' });
  const syncFace = () => { faceIn.value = String(st.f); faceOut.textContent = `${st.f}° ${DIRS[Math.round(st.f / 45) % 8]}`; };
  faceIn.oninput = () => { st.f = Number(faceIn.value); syncFace(); changed(); };
  const dirs = el('div', { className: 'dirs' });
  for (const d of [5, 6, 7, 4, -1, 0, 3, 2, 1]) {
    const b = el('button', { className: 'b', textContent: d < 0 ? '·' : DIRS[d] });
    b.onclick = () => { if (d >= 0) { st.f = d * 45; syncFace(); changed(); } };
    dirs.append(b);
  }
  setFace = (deg: number) => { st.f = ((deg % 360) + 360) % 360; syncFace(); changed(); };
  syncFace();
  side.append(row(faceIn, faceOut), row(dirs, el('div', { className: 'note', textContent: '0° faces east; turning runs clockwise on screen, as the game.' })));

  side.append(h3('Show'));
  side.append(row(check('8 facings', 'ring8', 'Every facing at once, at game size')), row(check('line-up', 'lineup', 'Every model side by side at game size, for scale')));
  side.append(row(check('onion skin', 'onion', 'The frames 1/8 s before and after, faint (pixel view)')), row(check('skeleton', 'bones')));
  side.append(row(check('radius and reach', 'rings', 'Green: the sim body radius. Orange: radius + the reach where it starts its wind-up.')));
  side.append(row(check('squash as the game', 'squash', 'The game draws every body 1.15 wide and 0.92 tall')));
  side.append(row(check('hit flash', 'flash')));
  const seatSel = el('select');
  seatSel.append(el('option', { value: '-1', textContent: 'model colours' }), ...TEAMS.map((t, i) => el('option', { value: String(i), textContent: t.name })));
  seatSel.value = String(st.seat); seatSel.onchange = () => { st.seat = Number(seatSel.value); changed(); };
  side.append(row('Wizard seat', seatSel));

  side.append(h3('Weapons and guards'), gearBox);

  side.append(h3('Timing'));
  side.append(row(check('play as the game', 'asGame', 'Loop only the part the game plays, and skip a cut hold')));
  side.append(row('Blend in', clip2Sel));
  const w2 = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(st.w2) });
  w2.oninput = () => { st.w2 = Number(w2.value); changed(); };
  clip2Sel.onchange = () => { st.c2 = clip2Sel.value; changed(); };
  side.append(row('weight', w2));
  side.append(el('div', { className: 'note', textContent: 'The game blends an attack\'s recovery into the walk or run once the follow-through is done.' }));

  const legsSel = el('select');
  legsSel.append(...['', 'walk', 'run'].map((v) => el('option', { value: v, textContent: v || 'the clip\'s own' })));
  legsSel.value = st.legs; legsSel.onchange = () => { st.legs = legsSel.value; changed(); };
  side.append(row('Legs', legsSel));
  side.append(el('div', { className: 'note', textContent: 'A wizard walking while it casts: the clip drives the upper body, the walk or run the hips and legs.' }));

  side.append(h3('Drive by speed'), driveBox, driveNote);
  side.append(h3('Keys'), el('div', { className: 'note', innerHTML: '<kbd>Space</kbd> play · <kbd>,</kbd> <kbd>.</kbd> frame · <kbd>←</kbd> <kbd>→</kbd> turn · <kbd>↑</kbd> <kbd>↓</kbd> clip · <kbd>G</kbd> game cam · <kbd>F</kbd> free cam · <kbd>1</kbd>–<kbd>3</kbd> view · <kbd>O</kbd> onion' }));
  const shot = el('button', { className: 'b', textContent: 'Save PNG' }); shot.onclick = savePng;
  side.append(row(shot));
  side.append(h3('Play area'), el('div', { className: 'note', textContent: 'The real game in the Sanctum, with the Tools panel\'s Stage on: enemies held still, God mode, any weapon a click away, and any enemy as a puppet (hold left to walk it, right-click attacks). Real spells, hits and deaths; F3 Time slows or steps it.' }));
  const play = el('a', { className: 'b', textContent: 'Open the play area', href: './index.html?stage=1#sanctum', target: '_blank' });
  side.append(row(play));
}
let setFace = (_deg: number) => {};

function buildModelPanel(): void {
  clipList.replaceChildren(); clip2Sel.replaceChildren(el('option', { value: '', textContent: 'none' }));
  if (!meta) { info.textContent = 'This model could not be loaded.'; return; }
  const idle = el('button', { className: st.c === IDLE ? 'on' : '', title: 'What the game shows for a body standing still' }, IDLE, el('small', { textContent: 'walk, frame 0' }));
  idle.onclick = () => setClip(IDLE);
  clipList.append(idle);
  for (const [c, v] of Object.entries(meta.clips)) {
    const kind = meta.attacks.some((a) => a.clip === c) ? 'attack' : meta.casts?.[c] ? 'cast' : v.stride ? 'legs' : '';
    const b = el('button', { className: c === st.c ? 'on' : '', title: v.source }, c, el('small', { textContent: `${kind} ${v.duration.toFixed(2)} s` }));
    b.onclick = () => setClip(c);
    clipList.append(b);
    clip2Sel.append(el('option', { value: c, textContent: c }));
  }
  if (st.m === 'wizard') for (const c of Object.keys(SEQS)) {
    const b = el('button', { className: c === st.c ? 'on' : '', title: 'Scripted inputs through the game\'s own pose code' }, c, el('small', { textContent: `game ${SEQS[c].len.toFixed(1)} s` }));
    b.onclick = () => setClip(c);
    clipList.append(b);
  }
  if (isSeq(st.c) && st.m !== 'wizard') st.c = 'walk';
  clip2Sel.value = st.c2;
  marks = marksOf(st.m, meta, st.c);
  const sim = simOf(st.m);
  info.textContent = `${marks.note} ${meta.slug}: ${meta.height?.toFixed(2) ?? '?'} units tall, ${(meta as { tris?: number }).tris ?? '?'} tris. Sim: radius ${sim.radius} u, speed ${sim.speed} u/s` + (sim.reach !== null ? `, reach ${sim.reach} u.` : '.');
  syncDrive();
  buildGear();
}

// ---- weapons and guards on the wizard (moved here from the Tools panel's Stage section) ------------------------------------------------
const WEAPONS: [string, string][] = [['staff (wand)', ''], ['sword (fire)', 'sword'], ['maul (earth)', 'earthmaul'], ['focus (arcane)', 'focus'], ['bow (ice)', 'icebow'], ['spear (cold)', 'frostspear'], ['whip (lightning)', 'whip'], ['trident (water)', 'trident']];
const GUARDS: [string, string][] = [['none', ''], ['mirror', 'mirror'], ['bulwark', 'bulwark'], ['ember', 'ember'], ['rime', 'rime'], ['spark', 'spark'], ['tide', 'tide'], ['prism', 'prism'], ['leaf', 'leaf'], ['spike', 'spike']];
function buildGear(): void {
  gearBox.replaceChildren();
  if (st.m !== 'wizard') { gearBox.append(el('div', { className: 'note', textContent: 'Only the wizard carries them.' })); return; }
  const pick = (label: string, list: [string, string][], key: 'wp' | 'gd') => {
    const sel = el('select');
    sel.append(...list.map(([n, v]) => el('option', { value: v, textContent: n })));
    sel.value = st[key]; sel.onchange = () => { st[key] = sel.value; changed(); };
    return row(label, sel);
  };
  gearBox.append(pick('Weapon', WEAPONS, 'wp'), pick('Guard', GUARDS, 'gd'));
  const G = GUARD_PLACE as unknown as Record<string, number>, D = { ...G };
  const gu = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(st.gu) });
  const guOut = el('span', { textContent: st.gu.toFixed(2) });
  gu.oninput = () => { st.gu = Number(gu.value); guOut.textContent = st.gu.toFixed(2); changed(); };
  gearBox.append(row('Raised', gu, guOut), el('div', { className: 'note', textContent: 'Raised: 0 is the guard carried at the side, 1 square in front of the chest (blocking).' }));
  gearBox.append(el('div', { className: 'note', textContent: 'Place the guard: drag until it sits right, then Copy numbers and send them. The numbers box is two-way: paste numbers in and the sliders follow. Lengths are in torso lengths (hips to shoulders). Pick a guard first. Their particles show in the pixel view (the same effect code as the game); the full-size view has the 3D props only.' }));
  const out = el('textarea', { rows: 4, spellcheck: false });
  out.style.cssText = 'width:100%;font:11px monospace';
  const show = () => { out.value = JSON.stringify(G); };
  const rows: [string, string, number, number, number][] = [
    ['carryUp', 'Carried: up', -0.5, 1.5, 0.01], ['carryOut', 'Carried: out to the side', -1.5, 1.5, 0.01], ['carryAhead', 'Carried: forward', -1, 1, 0.01],
    ['carryAngle', 'Carried: turn outward', -3.14, 3.14, 0.02], ['carryTilt', 'Carried: top leans out', -1, 1, 0.01],
    ['blockUp', 'Blocking: up', -0.5, 1.5, 0.01], ['blockAhead', 'Blocking: forward', -1, 5, 0.02], ['blockOut', 'Blocking: sideways (his left)', -3, 3, 0.02],
    ['blockSize', 'Blocking: stand off by its size', -2, 4, 0.01], ['blockYaw', 'Blocking: turn', -3.14, 3.14, 0.02],
  ];
  const syncs: (() => void)[] = [];
  for (const [k, label, lo, hi, step] of rows) {
    const r = el('input', { type: 'range', min: String(lo), max: String(hi), step: String(step), value: String(G[k]) });
    const n = el('span', { textContent: G[k].toFixed(2) });
    r.oninput = () => { G[k] = Number(r.value); n.textContent = G[k].toFixed(2); show(); };
    syncs.push(() => { r.value = String(G[k]); n.textContent = G[k].toFixed(2); });
    gearBox.append(el('div', { className: 'note', textContent: label }), row(r, n));
  }
  const reset = el('button', { className: 'b', textContent: 'Reset' });
  reset.onclick = () => { Object.assign(G, D); for (const f of syncs) f(); show(); };
  const copy = el('button', { className: 'b', textContent: 'Copy numbers', title: 'Copies the numbers, and shows them below' });
  copy.onclick = () => { show(); void navigator.clipboard?.writeText(out.value); out.select(); };
  gearBox.append(row(reset, copy));
  out.addEventListener('input', () => {
    try {
      const o = JSON.parse(out.value) as Record<string, unknown>;
      for (const k of Object.keys(o)) if (typeof o[k] === 'number' && k in G) G[k] = o[k] as number;
      for (const f of syncs) f();
      out.style.outline = '';
    } catch { out.style.outline = '1px solid #c55'; }
  });
  gearBox.append(out); show();
}

function syncDrive(): void {
  driveBox.replaceChildren();
  if (!meta) return;
  const c = meta.clips[st.c], sim = simOf(st.m);
  if (!c?.stride) { driveNote.textContent = 'Pick walk or run: the legs move the body, so their clips play by distance.'; return; }
  const box = el('input', { type: 'checkbox', checked: st.drive });
  box.onchange = () => { st.drive = box.checked; if (st.drive) setPlay(true); changed(); syncDrive(); };
  const sp = el('input', { type: 'range', min: '0.5', max: '8', step: '0.1', value: String(st.speed) });
  const out = el('span', { textContent: `${st.speed.toFixed(1)} u/s` });
  sp.oninput = () => { st.speed = Number(sp.value); out.textContent = `${st.speed.toFixed(1)} u/s`; changed(); explain(); };
  const preset = el('button', { className: 'b', textContent: `game: ${sim.speed} u/s` });
  preset.onclick = () => { st.speed = sim.speed; sp.value = String(st.speed); out.textContent = `${st.speed.toFixed(1)} u/s`; changed(); explain(); };
  driveBox.append(row(el('label', {}, box, ' drive: the ground moves at')), row(sp, out), row(preset));
  // the clip's own pace: one stride (squashed 1.15 wide as the game draws it) a loop
  const natural = (c.stride * LIVE_VIEW.squash.x) / c.duration;
  const explain = () => {
    const k = st.speed / natural, game = st.speed < 0.15 * BODY.walkSpeed ? 'stands' : st.speed < RUN_AT ? 'walk' : 'run';
    driveNote.innerHTML = `This clip's own pace is <b>${natural.toFixed(2)} u/s</b>, so at ${st.speed.toFixed(1)} u/s it plays <b class="${k > 1.35 || k < 0.7 ? 'warn' : ''}">${k.toFixed(2)}x</b> its natural speed. ` +
      `The game plays <b>${game}</b> at this speed (run from ${RUN_AT.toFixed(2)} u/s)` + (game !== st.c && game !== 'stands' ? ` <span class="warn">, not ${st.c}</span>` : '') + '.';
  };
  explain();
}

// ---- the loop ---------------------------------------------------------------------------------------------------------------------
let dist = 0, last = performance.now(), seqT = 0;
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (meta && model && inst) {
    const D = dur(), c = meta.clips[st.c];
    if (st.drive && c?.stride) {
      if (st.play) dist += st.speed * dt * st.rate;
      st.t = ((((dist / (c.stride * LIVE_VIEW.squash.x)) % 1) + 1) % 1) * D;
    } else if (st.play) {
      st.t += dt * st.rate;
      const [lo, hi] = st.asGame && marks.range ? marks.range : [0, D];
      if (st.asGame && marks.cut && st.t > marks.cut[0] && st.t < marks.cut[1]) st.t = marks.cut[1];
      if (st.t > hi || st.t < lo) st.t = lo;
    }
    const face = (st.f * Math.PI) / 180;
    if (st.c === IDLE) st.t = 0;
    const seq = isSeq(st.c) && st.m === 'wizard';
    // a sequence's blends remember the poses before: after a jump back (a loop, a scrub) it is replayed from the start
    if (seq && (st.t < seqT || st.t - seqT > 0.1)) for (let u = 0; u < st.t; u += 1 / 60) livePoseInst(inst, model, { ...wizardLivePose(seqState(st.c, u, face)), now: u }, 'viewer');
    seqT = st.t;
    const pose: LivePose = seq ? { ...wizardLivePose(seqState(st.c, st.t, face)), now: st.t } : { move: st.c === IDLE ? 'walk' : st.c, t: st.t, face, flash: st.flash, seat: st.m === 'wizard' && st.seat >= 0 ? TEAMS[st.seat] : undefined, ...(st.m === 'wizard' && ['attack0', 'thrust', 'lash', 'shoot'].includes(st.c) ? { grip: 1, ...(st.c === 'thrust' ? { aim: 1 } : {}) } : {}) };
    if (!seq && st.m === 'wizard' && (st.wp || st.gd)) Object.assign(pose, { props: [st.wp || 'staff', ...(st.gd ? [st.gd] : [])], guardUp: st.gu });
    if (st.c2 && st.c2 !== st.c && meta.clips[st.c2]) Object.assign(pose, { move2: st.c2, t2: st.t % meta.clips[st.c2].duration, w2: st.w2 });
    if (st.legs && st.legs !== st.c && meta.clips[st.legs]) Object.assign(pose, { legs: st.legs, tl: st.t % meta.clips[st.legs].duration });
    // full size
    livePoseInst(inst, model, pose, seq ? 'viewer' : undefined);
    inst.root.scale.copy(st.squash ? LIVE_VIEW.squash : new THREE.Vector3(1, 1, 1));
    inst.root.updateMatrixWorld(true);
    liveString(inst, model, pose, strings);
    const fwd = new THREE.Vector3(Math.cos(face), 0, Math.sin(face));
    facing.setDirection(fwd);
    const off = st.drive && c?.stride ? (dist * (inst.root.scale.x / LIVE_VIEW.squash.x)) % 1 : 0;
    grid.position.set(-fwd.x * off, 0.002, -fwd.z * off);
    bodyRing.visible = reachRing.visible = facing.visible = st.rings;
    reachRing.visible = st.rings && simOf(st.m).reach !== null;
    if (bones) bones.visible = st.bones;
    if (st.view !== 'pix') { controls.update(); renderer.render(scene, cam); }
    // pixel
    if (st.view !== 'full') {
      const ghosts: LivePose[] = [];
      if (st.onion) for (const k of [-2, -1, 1]) { const t = st.t + k * (3 / meta.fps); if (t >= 0 && t <= D) ghosts.push({ ...pose, t }); }
      drawPixels(pose, ghosts);
    }
    drawTimeline();
  }
  if (hashDue && now > hashDue) { hashDue = 0; writeHash(); }
  requestAnimationFrame(frame);
}

function resize(): void { fitPix(); fitCams(); }
new ResizeObserver(resize).observe(fullBox);
new ResizeObserver(resize).observe(pixBox);

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  const clips = meta ? clipNames(meta) : [];
  const k = e.key;
  if (k === ' ') { e.preventDefault(); setPlay(!st.play); }
  else if (k === ',') stepFrame(-1);
  else if (k === '.') stepFrame(1);
  else if (k === 'ArrowLeft') { e.preventDefault(); setFace(Math.round(st.f / 45) * 45 - 45); }
  else if (k === 'ArrowRight') { e.preventDefault(); setFace(Math.round(st.f / 45) * 45 + 45); }
  else if ((k === 'ArrowUp' || k === 'ArrowDown') && clips.length) {
    e.preventDefault();
    const i = clips.indexOf(st.c) + (k === 'ArrowUp' ? -1 : 1);
    setClip(clips[(i + clips.length) % clips.length]);
  } else if (k === 'g' || k === 'G') gameCam();
  else if (k === 'f' || k === 'F') freeCam();
  else if (k === '1' || k === '2' || k === '3') setView(['split', 'full', 'pix'][Number(k) - 1]);
  else if (k === 'o' || k === 'O') { st.onion = !st.onion; changed(); buildSide(); buildModelPanel(); }
});

function savePng(): void {
  const a = renderer.domElement, b = pixCanvas;
  const parts = [st.view !== 'pix' ? a : null, st.view !== 'full' ? b : null].filter(Boolean) as HTMLCanvasElement[];
  const out = el('canvas', { width: parts.reduce((s, p) => s + p.width, 0), height: Math.max(...parts.map((p) => p.height)) });
  const g = out.getContext('2d')!;
  let x = 0;
  for (const p of parts) { g.drawImage(p, x, 0); x += p.width; }
  const link = el('a', { download: `${st.m}-${st.c}-${st.t.toFixed(3)}s-${st.f}deg.png`, href: out.toDataURL('image/png') });
  link.click();
}

buildSide();
setPlay(st.play);
setView(st.view);
void loadModel(st.m);
requestAnimationFrame(frame);
