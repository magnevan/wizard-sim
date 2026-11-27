/**
 * The map editor (editor.html; tools/map-editor/README.md; docs/explorations/2026-11-23-map-editor.md): edits a kit
 * scene (tools/kit/scenes/*.scene.json) in 3D, live, alongside Claude. Every edit is an op sent to the dev server's
 * scene server (map-editor/plugin.ts); every change, ours or Claude's, comes back over Vite's WebSocket as map:update
 * with the compiled scene, which is drawn by lab/kit-render.ts. ?scene=patch-b picks the scene, ?art=0 draws
 * placeholders only, ?viewer=1 hides the panels (the hidden page the server renders Claude's pictures with).
 * Dev only: the build never includes this page.
 */
import * as THREE from 'three';
import { foliageReady } from '../foliage';
import { overgrowthIds, overgrowthLevel, setOvergrowth } from '../overgrowth';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadStones } from '../kit-stones';
import { buildKit, disposeKit, floorMats, groundPlane, kitPiece, loadKitArt, setKitPieces, setupStage, spinKit, yOf, type Inst, type KitData, type KitPiece } from '../kit-render';
import { eachPoint, type Obj, type Op, type Scene, type Terrace } from '../../../map-editor/ops';
import type { Compiled, Finding } from '../../../map-editor/compile-worker';
import type { Draft, Pin } from '../../../map-editor/store';
import { Concepts } from './concepts';
import { angleOf, roundFrom, roundHandles, roundPoints, roundThrough, type RoundShape } from './round';
import { apexOf, arcPoints, edgeAt, fromSag, lineOf, runOn, sagFor, sagOf, type CurveShape, type EdgeLine, type Pt } from './curve';

const ICON = import.meta.glob<string>('./icons/*.png', { eager: true, query: '?url', import: 'default' });
const icon = (n: string) => ICON[`./icons/${n}.png`];
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const hot = import.meta.hot!;

const q = new URLSearchParams(location.search);
let name = q.get('scene') ?? 'patch-b';
if (q.get('viewer')) document.body.classList.add('viewer');

// ---- three ----
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
const world = new THREE.Scene();
const sun = setupStage(renderer, world);
const cam = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.5, 900);
const controls = new OrbitControls(cam, renderer.domElement);
controls.screenSpacePanning = false;
controls.zoomToCursor = true;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
if (q.get('art') !== '0') await loadKitArt();

// ---- state ----
type Sel = { type: 'edge'; e: [number, number]; p: string } | { type: 'obj'; id: string } | { type: 'terrace'; id: string } | { type: 'pin'; id: string } | null;
type Tool = 'select' | 'brush' | 'rect' | 'stair' | 'curve' | 'round' | 'line' | 'prop' | 'pin';
let rev = 0, sc: Scene | null = null, comp: Compiled | null = null, shown: KitData | null = null;
let pins: Pin[] = [];
let draft: Draft | null = null, showChanges = false, discardArmed = false;
let sel: Sel = null, tool: Tool = 'select';
let brushG = '', brushN = 1, cornersOn = false, showMarkers = true;
let propPiece = 'vignette.lamp', propFront = 'S';
let kit: THREE.Group | null = null, ground: THREE.Mesh | null = null, floors: THREE.Object3D[] = [];
let framed = false, pending = 0, newTerrace: string | null = null;
const G = () => sc?.G ?? 2;

const PALETTE = [0xd9a56f, 0x7d9bc4, 0x8fbf7a, 0xc98aa8, 0xe0c35c, 0x6fb8b0, 0xb48b6a, 0x9b8fd1, 0xd8735b, 0x8a9a5b, 0x5d7fa3, 0xc2b8a3];
const colorOf = (g: string) => PALETTE[Math.max(0, sc?.terraces.findIndex((t) => t.glyph === g) ?? 0) % PALETTE.length];
const terrace = (g: string) => sc?.terraces.find((t) => t.glyph === g);
const glyphAt = (x: number, y: number) => sc?.corners[Math.max(0, Math.min(sc.corners.length - 1, Math.round(y)))]?.[Math.max(0, Math.min(sc.corners[0].length - 1, Math.round(x)))] ?? '';
const heightAt = (x: number, y: number) => terrace(glyphAt(x, y))?.h ?? 0;
const at3 = (x: number, y: number, hm: number) => new THREE.Vector3(x * G(), yOf(hm), y * G());
const inMap = (x: number, y: number) => !!sc && y >= 0 && y < sc.corners.length && x >= 0 && x < sc.corners[0].length;
/** A finding's message with terrace glyphs ('P') replaced by their names. */
const isProp = (o?: Obj) => o?.kind === 'vignette' || o?.kind === 'setpiece';
const named = (msg: string) => msg.replace(/ \('.'\)/g, '').replace(/'(.)'/g, (m, g: string) => terrace(g)?.name ?? m).replace(/''s/g, "'s");

// ---- layers: corners, brush preview, selection, markers, highlights ----
const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
function instanced(n: number, opacity: number) {
  const m = new THREE.InstancedMesh(flat, new THREE.MeshBasicMaterial({ transparent: true, opacity, depthWrite: false }), n);
  m.count = 0; m.frustumCulled = false; m.renderOrder = 5;
  world.add(m);
  return m;
}
let cornerMesh = instanced(1, 0.9);
const preview = instanced(6000, 0.5);
const selMesh = instanced(6000, 0.35);
const flashMesh = instanced(6000, 0.8);
const changesMesh = instanced(20000, 0.45);
const markers = new THREE.Group(); world.add(markers);
const hiGroup = new THREE.Group(); world.add(hiGroup);
const hoverBox = new THREE.BoxHelper(new THREE.Object3D(), 0xffffff);
(hoverBox.material as THREE.LineBasicMaterial).transparent = true; (hoverBox.material as THREE.LineBasicMaterial).opacity = 0.6;
hoverBox.visible = false; world.add(hoverBox);
/** A curve's outline (the one being drawn or dragged, or the selected one) and the selected curve's handles. */
const arcLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }));
arcLine.renderOrder = 11; arcLine.frustumCulled = false; world.add(arcLine);
const handles = new THREE.Group(); world.add(handles);
const handleGeo = new THREE.SphereGeometry(0.42, 16, 12), handleMat = new THREE.MeshBasicMaterial({ color: 0xff8a3d, depthTest: false });
const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color();
type Sq = { x: number; y: number; h: number; c: number; s?: number };

function setSquares(mesh: THREE.InstancedMesh, pts: Sq[]) {
  const n = Math.min(pts.length, mesh.instanceMatrix.count);
  pts.slice(0, n).forEach((p, i) => {
    const s = (p.s ?? 0.45) * G();
    tmpM.makeScale(s, 1, s).setPosition(p.x * G(), yOf(p.h) + 0.06, p.y * G());
    mesh.setMatrixAt(i, tmpM); mesh.setColorAt(i, tmpC.setHex(p.c));
  });
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

/** Corner markers: where terraces meet (every corner with C), coloured by terrace, in the paint tools or with C. */
function rebuildCorners() {
  if (!sc) return;
  const pts: Sq[] = [], rows = sc.corners;
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
    const g = rows[y][x];
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const r = rows[y + dy]; return r !== undefined && r[x + dx] !== undefined && r[x + dx] !== g; });
    if (cornersOn || edge) pts.push({ x, y, h: terrace(g)?.h ?? 0, c: colorOf(g), s: 0.32 });
  }
  if (cornerMesh.instanceMatrix.count < pts.length) { world.remove(cornerMesh); cornerMesh = instanced(Math.max(pts.length, rows.length * rows[0].length), 0.9); }
  setSquares(cornerMesh, pts);
  cornerMesh.visible = cornersOn || tool === 'brush' || tool === 'rect';
}

function sprite(text: string, bg: string, fg = '#fff'): THREE.Sprite {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d')!;
  x.fillStyle = bg; x.beginPath(); x.arc(32, 32, 28, 0, Math.PI * 2); x.fill();
  x.lineWidth = 4; x.strokeStyle = '#fff'; x.stroke();
  x.fillStyle = fg; x.font = 'bold 30px system-ui'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 32, 34);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  s.scale.setScalar(1.6); s.renderOrder = 10;
  return s;
}

function rebuildMarkers() {
  markers.children.forEach((o) => ((o as THREE.Sprite).material as THREE.SpriteMaterial).map?.dispose());
  markers.clear();
  for (const f of shownFindings()) {
    if (!f.at) continue;
    const s = sprite('!', f.severity === 'error' ? '#c4493b' : '#d9962b');
    s.position.copy(at3(f.at[0], f.at[1], heightAt(f.at[0], f.at[1]) + 2.2)); s.userData.finding = f;
    markers.add(s);
  }
  for (const p of pins) {
    if (p.status !== 'open' || p.anchor.x == null || p.anchor.y == null) continue;   // a pin on a concept image shows there
    const s = sprite(p.id.replace('p', ''), '#4a5a7a');
    s.position.copy(at3(p.anchor.x, p.anchor.y, (p.anchor.h ?? heightAt(p.anchor.x, p.anchor.y)) + 2.6)); s.userData.pin = p.id;
    markers.add(s);
  }
  markers.visible = showMarkers;
}

/** The findings to show: run-ends right beside an ambiguous cell are its consequence, so they fold under it. */
function shownFindings(): (Finding & { more?: number })[] {
  const fs = comp?.findings ?? [];
  const saddles = fs.filter((f) => f.code === 'saddle' && f.at);
  const out: (Finding & { more?: number })[] = [];
  for (const f of fs) {
    const s = f.code === 'run-end' && f.at ? saddles.find((x) => Math.hypot(x.at![0] - f.at![0], x.at![1] - f.at![1]) <= 1.01) : null;
    if (s) continue;
    out.push(f.code === 'saddle' ? { ...f, more: fs.filter((r) => r.code === 'run-end' && r.at && Math.hypot(r.at[0] - f.at![0], r.at[1] - f.at![1]) <= 1.01).length } : f);
  }
  return out;
}

/** Outline the pieces that match (orange), and fill a selected terrace's corners. */
function highlight(match: (it: Inst) => boolean, color = 0xff6a00) {
  hiGroup.children.forEach((o) => (o as THREE.BoxHelper).geometry.dispose());
  hiGroup.clear();
  if (!kit || !shown) return;
  kit.updateMatrixWorld(true);   // a freshly built kit has no world matrices until it is first rendered
  for (const g of kit.children) {
    const i = g.userData.inst as number | undefined;
    if (i == null || !match(shown.instances[i])) continue;
    const b = new THREE.BoxHelper(g, color); (b.material as THREE.LineBasicMaterial).depthTest = false; b.renderOrder = 9;
    hiGroup.add(b);
  }
}
const near = (a?: [number, number], b?: [number, number]) => !!a && !!b && Math.abs(a[0] - b[0]) < 1e-3 && Math.abs(a[1] - b[1]) < 1e-3;
function highlightSel() {
  rebuildHandles();
  setSquares(selMesh, []);
  if (!sel || !sc) return showChanges ? highlightChanges() : highlight(() => false);
  if (sel.type === 'edge') { const s = sel; return highlight((it) => near(it.e, s.e) && it.p === s.p); }
  if (sel.type === 'obj') { const id = sel.id; return highlight((it) => it.src === id || it.o === id); }
  if (sel.type === 'terrace') {
    const t = sc.terraces.find((x) => x.id === (sel as { id: string }).id);
    const pts: Sq[] = [];
    if (t) sc.corners.forEach((r, y) => [...r].forEach((g, x) => { if (g === t.glyph) pts.push({ x, y, h: t.h, c: 0xff8a3d, s: 1 }); }));
    setSquares(selMesh, pts);
  }
  highlight(() => false);
}

/** Show on map: every corner and thing that differs from the saved scene, until it is turned off or saved. */
function rebuildChanges() {
  const keys = showChanges && draft?.dirty && sc ? draft.keys : [];
  setSquares(changesMesh, keys.filter((k) => k.startsWith('c:')).map((k) => { const [x, y] = k.slice(2).split(',').map(Number); return { x, y, h: heightAt(x, y), c: 0xff9f1c, s: 1 }; }));
  if (!sel) highlightSel();
}
function highlightChanges() {
  const ids = new Set((draft?.dirty ? draft.keys : []).filter((k) => k.startsWith('o:')).map((k) => k.slice(2)));
  highlight((it) => ids.has(it.src ?? '') || ids.has(it.o ?? ''), 0xff9f1c);
}

let flashUntil = 0;
function flash(keys: string[]) {
  if (!sc) return;
  const pts = keys.filter((k) => k.startsWith('c:')).map((k) => { const [x, y] = k.slice(2).split(',').map(Number); return { x, y, h: heightAt(x, y), c: 0xfff1a8, s: 0.9 }; });
  setSquares(flashMesh, pts);
  flashUntil = performance.now() + 2500;
  const ids = new Set(keys.filter((k) => k.startsWith('o:')).map((k) => k.slice(2)));
  if (ids.size && !sel) { highlight((it) => ids.has(it.src ?? '') || ids.has(it.o ?? ''), 0x9fe3ff); setTimeout(highlightSel, 2500); }
}

// ---- a figure for scale: the game's wizard (1.74 m, as the greybox page has it), on the floor under the cursor (W) ----
const wizUrl = Object.values(import.meta.glob<string>('../../../../../content/assets/models/wizard.glb', { eager: true, query: '?url', import: 'default' }))[0];
const WIZ_H = 2.9;
const figure = new THREE.Group(); figure.visible = false; world.add(figure);
let figureOn = false, figureLoad: Promise<void> | null = null;
function loadFigure() {
  figureLoad ??= (async () => {
    if (!wizUrl) return;
    const [{ GLTFLoader }, meta] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('../../../../../content/assets/models/wizard.json')]);
    const o = (await new GLTFLoader().loadAsync(wizUrl)).scene;
    o.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
    const m = meta.default as { show?: string[]; props?: { node: string; name?: string }[] };
    const show = new Set(m.show ?? []), norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const hide = new Set((m.props ?? []).filter((p) => !show.has(p.name ?? '')).map((p) => norm(p.node)));
    o.traverse((c) => { if (hide.has(norm(c.name))) c.visible = false; });   // its conjured weapons wait hidden; the staff shows
    const b = new THREE.Box3().setFromObject(o), s = b.getSize(new THREE.Vector3());
    o.scale.setScalar(WIZ_H / s.y); o.position.y = -b.min.y * (WIZ_H / s.y); o.rotation.y = 0.4;
    figure.add(o);
  })();
  return figureLoad;
}
/** Stand the figure at corner (x, y), on the floor there (y: the floor's world height). */
function placeFigure(x: number, y: number, wy?: number) { figure.position.set(x * G(), wy ?? yOf(heightAt(x, y)), y * G()); }
function toggleFigure(on = !figureOn) {
  figureOn = on; figure.visible = on && !!hoverCorner;
  if (on) loadFigure().then(() => { if (!wizUrl) toast('No wizard model to show', true); });
  if (on && hoverCorner) placeFigure(hoverCorner[0], hoverCorner[1], lastY);
  renderTop();
}

// ---- the scene from the server ----
function rebuildKit() {
  if (!comp) return;
  if (comp.floors.length) shown = comp;     // a scene with nothing to draw keeps the last drawing; its errors show on top
  if (!shown) return;
  if (kit) { world.remove(kit); disposeKit(kit); }
  if (ground) { world.remove(ground); ground.geometry.dispose(); }
  kit = buildKit(shown); ground = groundPlane(shown);
  floors = kit.children.filter((o) => o.userData.floor);
  world.add(ground, kit);
  hoverBox.visible = false; hover = null;   // its piece index belonged to the old kit
}

type Update = { name: string; rev: number; scene: Scene; compiled: Compiled; change: { author: string; label: string; keys: string[] } | null; draft?: Draft };
function onUpdate(d: Update) {
  if (d.name !== name) return;
  $('err').style.display = 'none';
  rev = d.rev; sc = d.scene; comp = d.compiled; if (d.draft) setDraft(d.draft);
  if (!terrace(brushG)) brushG = sc.terraces.find((t) => t.edge !== 'wall')?.glyph ?? sc.terraces[0]?.glyph ?? '';
  rebuildKit(); rebuildCorners(); rebuildMarkers(); highlightSel(); rebuildChanges();
  if (!framed && shown) { framed = true; setTimeout(() => { (window as unknown as { __ready: boolean }).__ready = true; }, 300); frameAll(); }
  if (d.change && d.change.author !== 'user') { toast(`${d.change.author === 'claude' ? 'Claude' : d.change.author}: ${d.change.label}`); flash(d.change.keys); }
  renderUI();
  adoptNewTerrace();
}
hot.on('map:update', onUpdate);
hot.on('map:stones', (d: { name: string }) => { if (d.name === name) void loadStones(name, true); });
function setDraft(d: Draft) { draft = d; if (!d.dirty) { showChanges = false; discardArmed = false; } }
hot.on('map:draft', (d: { name: string; draft: Draft; notice?: string }) => {
  if (d.name !== name) return;
  setDraft(d.draft); rebuildChanges(); renderTop(); renderLists();
  if (d.notice) toast(d.notice, true);
});
hot.on('map:pins', (d: { name: string; pins: Pin[] }) => { if (d.name === name) { pins = d.pins; rebuildMarkers(); renderLists(); concepts.renderPins(); } });
hot.on('map:error', (d: { name: string; error: string }) => { if (d.name === name) { $('err').style.display = 'flex'; $('err').textContent = d.error; } });

async function call(path: string, body?: unknown) {
  pending++; renderStatus();
  try {
    const r = await fetch(`/__map/${path}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) toast(j.error ?? `${path} failed`, true);
    return r.ok ? j : null;
  } finally { pending--; renderStatus(); }
}
const apply = (ops: Op[], label: string) => call('apply', { name, ops, author: 'user', label });
const pinOp = (b: Record<string, unknown>) => call('pins', { name, ...b });
async function undo() { const r = await call('undo', { name }); if (r?.undone) toast(`Undid: ${r.undone.label}${r.undone.author === 'claude' ? ' (Claude)' : ''}`); }
async function save() {
  if (!draft?.dirty) { toast('Nothing to save'); return; }
  const r = await call('save', { name });
  if (r?.saved) toast(`Saved ${r.edits} edit${r.edits === 1 ? '' : 's'} to ${name}.scene.json`);
}
async function discard() {
  const r = await call('discard', { name, author: 'user' });
  if (r?.discarded) toast('Back to the saved scene: Ctrl+Z brings the changes back');
}
async function redo() { const r = await call('redo', { name }); if (r?.redone) toast(`Redid: ${r.redone.label}`); }
async function open(n: string) {
  name = n; framed = false; sel = null; shown = null; draft = null; showChanges = false; discardArmed = false;
  history.replaceState(null, '', `?scene=${n}${q.get('art') === '0' ? '&art=0' : ''}`);
  const p = await call(`pins?name=${n}&status=all`); pins = p?.pins ?? [];
  await concepts.load();
  await loadStones(n, true);   // its road and paving laid stone by stone (the server lays them again after each edit: map:stones)
  hot.send('map:hello', { name: n });
}

// ---- cameras ----
const PITCH = THREE.MathUtils.degToRad(46);
/**
 * The game's camera on corner (cx, cy), showing about viewH u of ground; or, for a picture, from another bearing (yaw,
 * degrees round the target: 0 from the south as the game looks, 90 from the east) and elevation (pitch, degrees).
 */
function gameView(cx: number, cy: number, viewH = 40, pitch = PITCH, yaw = 0) {
  const t = new THREE.Vector3(cx * G(), yOf(heightAt(cx, cy)), cy * G());
  // the game's framing keeps the ground's depth in view (sin pitch); seen low, side-on, keep the distance a whole view needs
  const dist = (viewH * Math.max(Math.sin(pitch), 0.7)) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
  controls.target.copy(t);
  cam.position.copy(t).add(new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist));
  controls.update();
}
function topView(cx: number, cy: number, half: number) {
  const t = new THREE.Vector3(cx * G(), yOf(heightAt(cx, cy)), cy * G());
  const dist = (half * G()) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / Math.min(1, cam.aspect);
  controls.target.copy(t);
  cam.position.copy(t).add(new THREE.Vector3(0, dist, 0.01));
  controls.update();
}
const targetCorner = (): [number, number] => [controls.target.x / G(), controls.target.z / G()];
const span = () => (shown ? Math.max(shown.size[0], shown.size[1]) : 40);
function frameAll() { if (shown) gameView(shown.size[0] / 2 / G(), shown.size[1] / 2 / G(), span() * 1.15); }
function focus(x: number, y: number, viewH?: number) {
  if (viewH) { gameView(x, y, viewH); return; }
  const off = cam.position.clone().sub(controls.target);
  controls.target.copy(at3(x, y, heightAt(x, y)));
  cam.position.copy(controls.target).add(off); controls.update();
}
/** Where the selection is, in corners. */
function selWhere(): [number, number] | null {
  if (!sel || !sc) return null;
  if (sel.type === 'edge') return sel.e;
  if (sel.type === 'pin') { const p = pins.find((x) => x.id === (sel as { id: string }).id); return p?.anchor.x != null && p.anchor.y != null ? [p.anchor.x, p.anchor.y] : null; }
  if (sel.type === 'obj') {
    const o = sc.objects.find((x) => x.id === (sel as { id: string }).id) as Record<string, unknown> | undefined;
    const pts = [o?.at, o?.centre, ...((o?.head ?? o?.ends ?? o?.pts ?? []) as unknown[])].filter((p): p is [number, number] => Array.isArray(p));
    return pts.length ? [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length] : null;
  }
  const t = sc.terraces.find((x) => x.id === (sel as { id: string }).id);
  let n = 0, sx = 0, sy = 0;
  sc.corners.forEach((r, y) => [...r].forEach((g, x) => { if (g === t?.glyph) { n++; sx += x; sy += y; } }));
  return n ? [sx / n, sy / n] : null;
}

// ---- picking ----
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
type Hit = { point: THREE.Vector3; inst?: number; floor?: { id?: string; t: string; h: number }; pin?: string; finding?: Finding };
function castFrom(ev: { clientX: number; clientY: number }) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, cam);
}
function pick(ev: { clientX: number; clientY: number }): Hit | null {
  castFrom(ev);
  const targets: THREE.Object3D[] = [];
  if (markers.visible) targets.push(markers);
  if (kit) targets.push(kit);
  if (ground) targets.push(ground);
  for (const h of ray.intersectObjects(targets, true)) {
    let o: THREE.Object3D | null = h.object;
    while (o) {
      const u = o.userData;
      if (u.pin) return { point: h.point, pin: u.pin };
      if (u.finding) return { point: h.point, finding: u.finding };
      if (u.inst != null) return { point: h.point, inst: u.inst };
      if (u.floor) return { point: h.point, floor: u.floor };
      o = o.parent;
    }
    if (h.object === ground) return { point: h.point };
  }
  return null;
}
/** Where the cursor is on the ground (floors only: walls, railings and markers don't get in the way), in corners. */
let lastY = 0;
function groundAt(ev: { clientX: number; clientY: number }): [number, number] | null {
  castFrom(ev);
  const hit = ray.intersectObjects(ground ? [...floors, ground] : floors, false)[0];
  if (hit) { lastY = hit.point.y; return [hit.point.x / G(), hit.point.z / G()]; }
  const p = new THREE.Vector3();
  return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -lastY), p) ? [p.x / G(), p.z / G()] : null;
}

// ---- tools ----
let alt = false;
/** The cell under the cursor (and its neighbours for a bigger brush): all its corners. Alt: the nearest corner. */
function brushCorners(cx: number, cy: number): [number, number][] {
  if (alt) return inMap(Math.round(cx), Math.round(cy)) ? [[Math.round(cx), Math.round(cy)]] : [];
  const x0 = Math.floor(cx) - Math.floor((brushN - 1) / 2), y0 = Math.floor(cy) - Math.floor((brushN - 1) / 2), out: [number, number][] = [];
  for (let y = y0; y <= y0 + brushN; y++) for (let x = x0; x <= x0 + brushN; x++) if (inMap(x, y)) out.push([x, y]);
  return out;
}
/** The cells from a to b: all their corners. */
function rectCorners(a: [number, number], b: [number, number]): [number, number][] {
  const out: [number, number][] = [];
  const x0 = Math.floor(Math.min(a[0], b[0])), x1 = Math.floor(Math.max(a[0], b[0])) + 1, y0 = Math.floor(Math.min(a[1], b[1])), y1 = Math.floor(Math.max(a[1], b[1])) + 1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inMap(x, y)) out.push([x, y]);
  return out;
}
/** Paint the other two corners of any cell the stroke would leave with only a diagonal pair: no ambiguous cells. */
function completeSaddles(painted: Map<string, [number, number]>, g: string) {
  if (!sc) return;
  const is = (x: number, y: number) => painted.has(`${x},${y}`) || (inMap(x, y) && sc!.corners[y][x] === g);
  for (let pass = 0; pass < 6; pass++) {
    let added = 0;
    for (const [px, py] of [...painted.values()]) for (const [cx, cy] of [[px - 1, py - 1], [px, py - 1], [px - 1, py], [px, py]]) {
      const c = [[cx, cy], [cx + 1, cy], [cx + 1, cy + 1], [cx, cy + 1]];
      if (!c.every(([x, y]) => inMap(x, y))) continue;
      const m = c.map(([x, y]) => is(x, y));
      if ((m[0] && m[2] && !m[1] && !m[3]) || (m[1] && m[3] && !m[0] && !m[2])) for (const [x, y] of c) if (!is(x, y)) { painted.set(`${x},${y}`, [x, y]); added++; }
    }
    if (!added) break;
  }
}
/** A flight's head from a drag: along the row or column line (a half-coordinate) nearest the drag, where there is a drop. */
function stairHead(a: [number, number], b: [number, number]): [[number, number], [number, number]] | null {
  const horiz = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
  const lo = (v: number) => Math.round(v), base = Math.floor(((horiz ? a[1] + b[1] : a[0] + b[0]) / 2));
  const [s0, s1] = horiz ? [lo(Math.min(a[0], b[0])), lo(Math.max(a[0], b[0]))] : [lo(Math.min(a[1], b[1])), lo(Math.max(a[1], b[1]))];
  if (s1 - s0 < 1) return null;
  const mid = (s0 + s1) / 2;
  for (const line of [base, base - 1, base + 1]) {
    const h1 = horiz ? heightAt(mid, line) : heightAt(line, mid), h2 = horiz ? heightAt(mid, line + 1) : heightAt(line + 1, mid);
    if (Math.abs(h1 - h2) > 0.3) return horiz ? [[s0, line + 0.5], [s1, line + 0.5]] : [[line + 0.5, s0], [line + 0.5, s1]];
  }
  return null;
}
/** A stair from a selected edge section: w cells wide, starting at the section. */
function stairFromEdge(it: Inst, w: number): [[number, number], [number, number]] {
  const e = it.e!, horiz = Math.abs((it.y2 ?? it.y) - it.y) < 1e-6;
  const s0 = Math.floor(horiz ? e[0] : e[1]) - Math.floor((w - 1) / 2);
  return horiz ? [[s0, e[1]], [s0 + w, e[1]]] : [[e[0], s0], [e[0], s0 + w]];
}

// ---- curves (curve.ts): drag along a straight edge for the ends, then move out for the bulge and click ----
const hOf = (g: string) => terrace(g)?.h;
const along = (e: EdgeLine, p: Pt) => (e.horiz ? p[0] : p[1]);
const halfOf = (ends: Pt[]) => Math.hypot(ends[1][0] - ends[0][0], ends[1][1] - ends[0][1]) / 2;
const inBounds = (pts: Pt[]) => !!sc && pts.every(([x, y]) => x > -1e-6 && y > -1e-6 && x < sc!.corners[0].length - 1 + 1e-6 && y < sc!.corners.length - 1 + 1e-6);
const curveTerr = (o: Obj) => sc?.terraces.find((t) => t.id === o.terrace || t.glyph === o.terrace);
const selCurve = () => (sel?.type === 'obj' ? sc?.objects.find((o) => o.id === (sel as { id: string }).id && o.kind === 'curve') : undefined);
/** Where the pointer meets the level plane at height hm (m), in corners. */
function planeAt(ev: { clientX: number; clientY: number }, hm: number): Pt | null {
  castFrom(ev);
  const p = new THREE.Vector3();
  return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -yOf(hm)), p) ? [p.x / G(), p.z / G()] : null;
}
function showLine(pts: Pt[] | null, hm = 0, color = 0xffffff) {
  arcLine.geometry.dispose();
  arcLine.geometry = new THREE.BufferGeometry().setFromPoints((pts ?? []).map(([x, y]) => at3(x, y, hm).setY(yOf(hm) + 0.15)));
  (arcLine.material as THREE.LineBasicMaterial).color.setHex(color);
  arcLine.visible = !!pts;
}
/** A curve being drawn or dragged: its outline, dotted so it reads at any zoom, and its ends. */
function showCurve(c: CurveShape, hm: number, ok: boolean) {
  const pts = arcPoints(c, 48), col = ok ? 0xffe08a : 0xff5544;
  showLine(pts, hm, col);
  setSquares(preview, [...pts.map(([x, y]) => ({ x, y, h: hm, c: col, s: 0.16 })), ...c.ends.map(([x, y]) => ({ x, y, h: hm, c: 0xff8a3d, s: 0.4 }))]);
}
// ---- rounds (round.ts): a true circle the compiler snaps nearby edges onto; dashed, draped along the upper edge ----
const roundLines = new THREE.Group(); world.add(roundLines);
const selRound = () => (sel?.type === 'obj' ? sc?.objects.find((o) => o.id === (sel as { id: string }).id && o.kind === 'round') : undefined);
/** The height to draw a round at, at a point: the highest level among the corners around it (it follows the upper edge). */
const upperAt = (x: number, y: number) => Math.max(heightAt(Math.floor(x), Math.floor(y)), heightAt(Math.ceil(x), Math.floor(y)), heightAt(Math.floor(x), Math.ceil(y)), heightAt(Math.ceil(x), Math.ceil(y)));
function dashed(o: RoundShape, color: number, dash = 0.7) {
  const pts = roundPoints(o).map(([x, y]) => at3(x, y, upperAt(x, y)).setY(yOf(upperAt(x, y)) + 0.35));
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color, dashSize: dash, gapSize: dash * 0.6, depthTest: false, transparent: true }));
  l.computeLineDistances(); l.renderOrder = 11; l.frustumCulled = false;
  roundLines.add(l);
}
let roundPts: Pt[] = [], roundPreview: RoundShape | null = null;
// ---- lines: a round's straight twin (the compiler's `line`): every edge near segment a-b snaps onto it, at any angle ----
type LineShape = { a: Pt; b: Pt };
const selLine = () => (sel?.type === 'obj' ? sc?.objects.find((o) => o.id === (sel as { id: string }).id && o.kind === 'line') : undefined);
let linePts: Pt[] = [], linePreview: LineShape | null = null;
const snapQ = (p: Pt): Pt => [Math.round(p[0] * 4) / 4, Math.round(p[1] * 4) / 4];
function dashedSeg(o: LineShape, color: number) {
  const n = Math.max(2, Math.ceil(Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]) / 0.5)), pts: THREE.Vector3[] = [];
  for (let k = 0; k <= n; k++) { const x = o.a[0] + ((o.b[0] - o.a[0]) * k) / n, y = o.a[1] + ((o.b[1] - o.a[1]) * k) / n; pts.push(at3(x, y, upperAt(x, y)).setY(yOf(upperAt(x, y)) + 0.35)); }
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color, dashSize: 0.7, gapSize: 0.42, depthTest: false, transparent: true }));
  l.computeLineDistances(); l.renderOrder = 11; l.frustumCulled = false;
  roundLines.add(l);
}
function lineBar(o: LineShape | null, what: string) {
  $('brushbar').style.display = 'flex';
  $('brushbar').innerHTML = o ? `${what}: ${Math.round(Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]) * 100) / 100} cells, at ${Math.round(((Math.atan2(o.b[1] - o.a[1], o.b[0] - o.a[0]) * 180) / Math.PI + 360) % 360)}°` : what;
}
async function commitLine(o: LineShape) {
  linePts = []; linePreview = null; rebuildRounds(); renderBrushbar();
  if (Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]) < 1) { toast('A line needs its ends at least a cell apart', true); return; }
  const r = await apply([{ op: 'add', kind: 'line', name: 'a line', a: o.a, b: o.b }], 'add a line');
  if (r?.minted?.[0]) { sel = { type: 'obj', id: r.minted[0] }; highlightSel(); renderInspect(); }
}

/** Rounds and lines, dashed: all of them while the Round or Line tool is on, else only the selected one. */
function rebuildRounds() {
  roundLines.children.forEach((l) => { (l as THREE.Line).geometry.dispose(); ((l as THREE.Line).material as THREE.Material).dispose(); });
  roundLines.clear();
  const s = selRound() ?? selLine(), all = tool === 'round' || tool === 'line';
  for (const o of sc?.objects ?? []) {
    if (!(all || o === s)) continue;
    const c = o === s ? 0xffffff : 0x9fb6d9;
    if (o.kind === 'round') dashed(o as unknown as RoundShape, c);
    if (o.kind === 'line') dashedSeg(o as unknown as LineShape, c);
  }
  if (roundPreview) dashed(roundPreview, 0xffe08a);
  if (linePreview) dashedSeg(linePreview, 0xffe08a);
  if (tool === 'round') setSquares(preview, roundPts.map(([x, y]) => ({ x, y, h: upperAt(x, y), c: 0xff8a3d, s: 0.4 })));
  if (tool === 'line') setSquares(preview, linePts.map(([x, y]) => ({ x, y, h: upperAt(x, y), c: 0xff8a3d, s: 0.4 })));
}
function roundBar(o: RoundShape | null, what: string) {
  const m = (v: number) => Math.round(v * G() * 0.6 * 10) / 10;
  $('brushbar').style.display = 'flex';
  $('brushbar').innerHTML = o ? `${what}: radius ${o.r} cells (${m(o.r)} m)${o.from != null ? `, from ${o.from}° to ${o.to}°` : ', a whole circle'}` : what;
}
async function commitRound(o: RoundShape) {
  roundPts = []; roundPreview = null; rebuildRounds(); renderBrushbar();
  const r = await apply([{ op: 'add', kind: 'round', name: 'a round', ...o }], 'add a round');
  if (r?.minted?.[0]) { sel = { type: 'obj', id: r.minted[0] }; highlightSel(); renderInspect(); }
}
/** A round's handle dragged to p: the new shape. */
function dragRound(b: RoundShape, which: string, p: Pt): RoundShape {
  const q = (v: number) => Math.round(v * 4) / 4;
  if (which === 'centre') return { ...b, centre: [q(p[0]), q(p[1])] };
  if (which === 'r') return { ...b, r: Math.max(0.5, q(Math.hypot(p[0] - b.centre[0], p[1] - b.centre[1]))) };
  return { ...b, [which]: Math.round(angleOf(b.centre, p)) % 360 };
}

// ---- a selected stair's handles: its head's ends slide along the edge (wider, narrower), its middle slides it along ----
const selFlight = () => (sel?.type === 'obj' ? sc?.objects.find((o) => o.id === (sel as { id: string }).id && o.kind === 'flight') : undefined);
type Head = [Pt, Pt];
/** A flight's head after its handle `which` (a, b or mid) is dragged to p: whole cells along the head's line, at least one wide. */
function dragHead(h: Head, which: string, p: Pt): Head {
  const horiz = Math.abs(h[1][1] - h[0][1]) < 1e-6, i = horiz ? 0 : 1;
  const at = (q: Pt, v: number): Pt => (horiz ? [v, q[1]] : [q[0], v]);
  const a = h[0][i], b = h[1][i], dir = Math.sign(b - a) || 1, v = Math.round(p[i]);
  if (which === 'mid') { const d = Math.round(p[i] - (a + b) / 2); return [at(h[0], a + d), at(h[1], b + d)]; }
  if (which === 'a') return [at(h[0], dir > 0 ? Math.min(v, b - 1) : Math.max(v, b + 1)), h[1]];
  return [h[0], at(h[1], dir > 0 ? Math.max(v, a + 1) : Math.min(v, a - 1))];
}
function headDots(h: Head, ok = true) {
  const [[x0, y0], [x1, y1]] = h, n = Math.round(Math.hypot(x1 - x0, y1 - y0) * 2), pts: Sq[] = [];
  for (let k = 0; k <= n; k++) { const x = x0 + ((x1 - x0) * k) / n, y = y0 + ((y1 - y0) * k) / n; pts.push({ x, y, h: upperAt(x, y), c: ok ? 0xffe08a : 0xff5544, s: 0.5 }); }
  setSquares(preview, pts);
}

/** The selected curve's three handles (its ends and the middle of its bulge) and its outline; a selected round's handles. */
function rebuildHandles() {
  handles.clear();
  rebuildRounds();
  const fl = selFlight();
  if (fl && tool === 'select') {
    const h = fl.head as Head, mid: Pt = [(h[0][0] + h[1][0]) / 2, (h[0][1] + h[1][1]) / 2];
    for (const [w, p] of [['a', h[0]], ['b', h[1]], ['mid', mid]] as [string, Pt][]) {
      const m = new THREE.Mesh(handleGeo, handleMat), hm = upperAt(p[0], p[1]);
      m.position.copy(at3(p[0], p[1], hm)).setY(yOf(hm) + 0.45); m.userData.handle = w; m.renderOrder = 12;
      if (w === 'mid') m.scale.setScalar(1.3);
      handles.add(m);
    }
    if (!curving && drag?.kind !== 'handle') showLine(null);
    return;
  }
  // a selected set piece: its footprint on the ground (a circle or its box, turned to its front)
  const sp = sel?.type === 'obj' ? sc?.objects.find((o) => o.id === (sel as { id: string }).id && o.kind === 'setpiece') : undefined;
  const fp = sp && kitPiece(String(sp.piece))?.footprint;
  if (sp && fp && !curving && drag?.kind !== 'handle') {
    const [cx, cy] = sp.at as Pt, side = sp.front === 'E' || sp.front === 'W', w = (side ? fp[1] : fp[0]) / G(), d = (side ? fp[0] : fp[1]) / G();
    const pts: Pt[] = kitPiece(String(sp.piece))?.shape === 'round'
      ? Array.from({ length: 49 }, (_, k) => [cx + (w / 2) * Math.cos((k / 48) * 2 * Math.PI), cy + (d / 2) * Math.sin((k / 48) * 2 * Math.PI)] as Pt)
      : [[cx - w / 2, cy - d / 2], [cx + w / 2, cy - d / 2], [cx + w / 2, cy + d / 2], [cx - w / 2, cy + d / 2], [cx - w / 2, cy - d / 2]];
    showLine(pts, heightAt(cx, cy), 0xff8a3d);
    return;
  }
  const ln = selLine();
  if (ln && (tool === 'select' || tool === 'line')) {
    for (const w of ['a', 'b']) {
      const p = ln[w] as Pt, m = new THREE.Mesh(handleGeo, handleMat), hm = upperAt(p[0], p[1]);
      m.position.copy(at3(p[0], p[1], hm)).setY(yOf(hm) + 0.45); m.userData.handle = w; m.renderOrder = 12;
      handles.add(m);
    }
    if (!curving && drag?.kind !== 'handle') showLine(null);
    return;
  }
  const rd = selRound();
  if (rd && (tool === 'select' || tool === 'round')) {
    for (const [w, p] of roundHandles(rd as unknown as RoundShape)) {
      const m = new THREE.Mesh(handleGeo, handleMat), hm = upperAt(p[0], p[1]);
      m.position.copy(at3(p[0], p[1], hm)).setY(yOf(hm) + 0.45); m.userData.handle = w; m.userData.round = true; m.renderOrder = 12;
      if (w === 'centre') m.scale.setScalar(1.3);
      handles.add(m);
    }
    if (!curving && drag?.kind !== 'handle') showLine(null);
    return;
  }
  const o = selCurve();
  if (!o || (tool !== 'select' && tool !== 'curve')) { if (!curving && drag?.kind !== 'handle') showLine(null); return; }
  const c = o as unknown as CurveShape, hm = curveTerr(o)?.h ?? 0;
  ([['a', c.ends[0]], ['b', c.ends[1]], ['apex', apexOf(c)]] as [string, Pt][]).forEach(([w, p]) => {
    const m = new THREE.Mesh(handleGeo, handleMat);
    m.position.copy(at3(p[0], p[1], hm)).setY(yOf(hm) + 0.45); m.userData.handle = w; m.renderOrder = 12;
    handles.add(m);
  });
  if (!curving && drag?.kind !== 'handle') showLine(arcPoints(c, 48), hm, 0xffffff);
}
let curving: { e: EdgeLine; ends: [Pt, Pt]; shape: CurveShape } | null = null;
function curveBar(c: CurveShape, what: string) {
  const s = sagOf(c), m = (v: number) => Math.round(v * G() * 0.6 * 10) / 10;
  $('brushbar').innerHTML = `${what}: ${halfOf(c.ends) * 2} cells wide (${m(halfOf(c.ends) * 2)} m), bulging ${Math.round(s * 100) / 100} cells (${m(s)} m)${Math.abs(s - halfOf(c.ends)) < 1e-3 ? ' · a semicircle' : ''}`;
}
function cancelCurve() { curving = null; setSquares(preview, []); rebuildHandles(); renderBrushbar(); }
async function commitCurve() {
  const c = curving!, t = terrace(c.e.glyph);
  cancelCurve();
  if (!t) return;
  if (!inBounds(arcPoints(c.shape))) { toast('That bulge runs off the map: make it shallower, or grow the map', true); return; }
  const r = await apply([{ op: 'add', kind: 'curve', name: 'a curve', terrace: t.id, centre: c.shape.centre, r: c.shape.r, ends: c.shape.ends, out: c.shape.out }], 'add a curve');
  if (r?.minted?.[0]) { sel = { type: 'obj', id: r.minted[0] }; highlightSel(); renderInspect(); }
}
/** A handle dragged to p: the new shape, and whether its ends are still on one straight run of the edge. */
function dragHandle(d: Extract<Drag, { kind: 'handle' }>, p: Pt) {
  const b = d.base;
  if (d.which === 'apex') { d.shape = fromSag(b.ends, b.out, sagFor(b.ends, b.out, p)); d.ok = true; return; }
  const fixed = d.which === 'a' ? b.ends[1] : b.ends[0];
  const run = runOn(sc!.corners, hOf, d.e, along(d.e, fixed), along(d.e, p));
  const semi = Math.abs(sagOf(b) - halfOf(b.ends)) < 1e-3;
  d.shape = fromSag(run.ends, b.out, semi ? run.len / 2 : Math.min(sagOf(b), run.len));
  d.ok = run.ok;
}
const setCurve = (id: string, c: CurveShape, label: string) => apply([{ op: 'set', id, ends: c.ends, centre: c.centre, r: c.r }], label);

// ---- copy and paste: Ctrl+drag in the Rectangle tool selects cells; Ctrl+C copies them and what stands wholly in them ----
type Region = { x0: number; y0: number; x1: number; y1: number };
type Clip = { w: number; h: number; corners: [number, number, string][]; objects: Obj[] };
let region: Region | null = null, clip: Clip | null = null;
const regionLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0x9fe3ff, dashSize: 0.6, gapSize: 0.35, depthTest: false, transparent: true }));
regionLine.renderOrder = 11; regionLine.frustumCulled = false; regionLine.visible = false; world.add(regionLine);
const regionOf = (a: Pt, b: Pt): Region => ({ x0: Math.floor(Math.min(a[0], b[0])), y0: Math.floor(Math.min(a[1], b[1])), x1: Math.floor(Math.max(a[0], b[0])) + 1, y1: Math.floor(Math.max(a[1], b[1])) + 1 });
function showRegion(r: Region | null) {
  regionLine.visible = !!r; if (!r) return;
  const ring: Pt[] = [];
  for (let x = r.x0; x <= r.x1; x += 0.5) ring.push([x, r.y0]);
  for (let y = r.y0; y <= r.y1; y += 0.5) ring.push([r.x1, y]);
  for (let x = r.x1; x >= r.x0; x -= 0.5) ring.push([x, r.y1]);
  for (let y = r.y1; y >= r.y0; y -= 0.5) ring.push([r.x0, y]);
  regionLine.geometry.dispose();
  regionLine.geometry = new THREE.BufferGeometry().setFromPoints(ring.map(([x, y]) => at3(x, y, upperAt(x, y)).setY(yOf(upperAt(x, y)) + 0.3)));
  regionLine.computeLineDistances();
}
const objPoints = (o: Obj) => { const ps: Pt[] = []; eachPoint({ ...o }, (p) => { ps.push(p); return p; }); return ps; };
function copyRegion() {
  if (!sc || !region) { toast('Select cells first: Ctrl+drag with the Rectangle tool (R)', true); return; }
  const r = region, corners: Clip['corners'] = [];
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if (inMap(x, y)) corners.push([x - r.x0, y - r.y0, terrace(sc.corners[y][x])?.id ?? sc.corners[y][x]]);
  const inside = (p: Pt) => p[0] >= r.x0 - 1e-6 && p[0] <= r.x1 + 1e-6 && p[1] >= r.y0 - 1e-6 && p[1] <= r.y1 + 1e-6;
  const objects = sc.objects.filter((o) => { const ps = objPoints(o); return ps.length > 0 && ps.every(inside); }).map((o) => {
    const c = JSON.parse(JSON.stringify(o)) as Obj; eachPoint(c, ([x, y]) => [x - r.x0, y - r.y0]); return c;
  });
  clip = { w: r.x1 - r.x0, h: r.y1 - r.y0, corners, objects };
  toast(`Copied ${clip.w} × ${clip.h} cells${objects.length ? ` and ${objects.length} thing${objects.length > 1 ? 's' : ''} on them` : ''}: Ctrl+V pastes at the cursor`);
}
async function pasteRegion() {
  if (!sc || !clip || !hoverCorner) return;
  const ox = Math.round(hoverCorner[0]), oy = Math.round(hoverCorner[1]), by = new Map<string, Pt[]>();
  for (const [dx, dy, t] of clip.corners) if (inMap(ox + dx, oy + dy)) { if (!by.has(t)) by.set(t, []); by.get(t)!.push([ox + dx, oy + dy]); }
  const ops: Op[] = [...by].map(([t, at]) => ({ op: 'paint', terrace: t, at }));
  for (const o of clip.objects) {
    const c = JSON.parse(JSON.stringify(o)) as Obj; eachPoint(c, ([x, y]) => [x + ox, y + oy]);
    const { id: _id, ...fields } = c; ops.push({ op: 'add', ...fields });
  }
  const r = await apply(ops, `paste ${clip.w} × ${clip.h} cells`);
  if (r) { region = { x0: ox, y0: oy, x1: ox + clip.w, y1: oy + clip.h }; showRegion(region); toast('Pasted: Ctrl+Z undoes it'); }
}
// Ctrl+V: an image on the clipboard is a concept (concepts.ts); otherwise the copied cells. The paste event says which;
// where none comes (no clipboard access), a moment after the key the cells are pasted anyway.
let pasteTimer = 0;
addEventListener('paste', (e) => {
  clearTimeout(pasteTimer);
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || !clip || [...(e.clipboardData?.items ?? [])].some((i) => i.type.startsWith('image/'))) return;
  e.preventDefault(); pasteRegion();
});

type Drag = { kind: 'paint'; start: [number, number]; last: [number, number]; corners: Map<string, [number, number]>; px: [number, number]; select?: boolean }
  | { kind: 'prop'; id: string; start: [number, number]; at: [number, number] } | { kind: 'click'; px: [number, number] }
  | { kind: 'curve'; e: EdgeLine; a0: number; ends: [Pt, Pt]; ok: boolean }
  | { kind: 'handle'; id: string; which: string; e: EdgeLine; hm: number; base: CurveShape; shape: CurveShape; ok: boolean }
  | { kind: 'round'; start: Pt; px: [number, number]; moved: boolean }
  | { kind: 'fhandle'; id: string; which: string; hm: number; base: Head; head: Head }
  | { kind: 'lhandle'; id: string; which: 'a' | 'b'; hm: number; base: LineShape; shape: LineShape }
  | { kind: 'rhandle'; id: string; which: string; hm: number; base: RoundShape; shape: RoundShape };
let drag: Drag | null = null;
let hover: Hit | null = null, hoverCorner: [number, number] | null = null;

function updatePreview(ev: PointerEvent) {
  if (!sc) return;
  const c = groundAt(ev);
  hoverCorner = c;
  let pts: Sq[] = [];
  const t = terrace(brushG), col = colorOf(brushG);
  const sq = (xy: [number, number][], s = 1): Sq[] => xy.map(([x, y]) => ({ x, y, h: Math.max(heightAt(x, y), t?.h ?? 0), c: col, s }));
  if (drag?.kind === 'prop' && c) {
    drag.at = [Math.round(c[0] * 2) / 2, Math.round(c[1] * 2) / 2];
    pts = [{ x: drag.at[0], y: drag.at[1], h: heightAt(...drag.at), c: 0xff6a00, s: 1 }];
  } else if (tool === 'brush' && c) {
    if (drag?.kind === 'paint') {
      // fill in between the pointer's samples, so a quick stroke leaves no gaps
      const [lx, ly] = drag.last, n = Math.max(1, Math.ceil(Math.hypot(c[0] - lx, c[1] - ly) / 0.25));
      for (let k = 1; k <= n; k++) for (const p of brushCorners(lx + ((c[0] - lx) * k) / n, ly + ((c[1] - ly) * k) / n)) drag.corners.set(p.join(), p);
      drag.last = c;
      pts = sq([...drag.corners.values()]);
    } else pts = sq(brushCorners(c[0], c[1]));
  } else if (tool === 'rect' && c && drag?.kind === 'paint' && drag.select) {
    const r = regionOf(drag.start, c); showRegion(r);
    $('brushbar').innerHTML = `Selecting ${r.x1 - r.x0} × ${r.y1 - r.y0} cells to copy`;
  } else if (tool === 'rect' && c) {
    const xy = drag?.kind === 'paint' ? rectCorners(drag.start, c) : brushCorners(c[0], c[1]).slice(0, 4);
    pts = sq(xy);
    if (drag?.kind === 'paint') { const w = Math.abs(Math.floor(c[0]) - Math.floor(drag.start[0])) + 1, h = Math.abs(Math.floor(c[1]) - Math.floor(drag.start[1])) + 1; $('brushbar').innerHTML = `Painting <b>${esc(t?.name)}</b>: ${w} × ${h} cells (${w * G() * 0.6} × ${h * G() * 0.6} m)`; }
  } else if (tool === 'stair' && drag?.kind === 'paint' && c) {
    const h = stairHead(drag.start, c);
    if (h) { const [[x0, y0], [x1, y1]] = h, n = Math.round(Math.hypot(x1 - x0, y1 - y0) * 2); for (let k = 0; k <= n; k++) { const x = x0 + ((x1 - x0) * k) / n, y = y0 + ((y1 - y0) * k) / n; pts.push({ x, y, h: Math.max(heightAt(Math.floor(x), Math.floor(y)), heightAt(Math.ceil(x), Math.ceil(y))), c: 0x4a5a7a, s: 0.5 }); } }
  }
  setSquares(preview, pts);
}

function info(h: Hit | null) {
  let s = '';
  if (h && sc) {
    const x = h.point.x / G(), y = h.point.z / G(), cx = Math.round(x), cy = Math.round(y);
    const t = inMap(cx, cy) ? terrace(sc.corners[cy][cx]) : null;
    s = `corner (${cx}, ${cy})${t ? ` · ${t.name ?? t.id} ${t.h} m` : ''}`;
    const it = h.inst != null ? shown?.instances[h.inst] : undefined;
    if (it) s += ` · ${it.p}${it.v ? ` (${it.v})` : ''}${it.src ? ` from ${it.src}` : ''}`;
    if (h.pin) s += ` · pin ${h.pin}`;
    if (h.finding) s += ` · ${named(h.finding.msg)}`;
    s += ' — ';
  }
  $('help').innerHTML = `<div>${esc(s)}${esc(HELP[tool])}</div><div class="cam">${tool === 'select' ? 'Left-drag' : 'Right-drag'}: orbit · middle-drag or Shift+drag: pan · wheel: zoom · F: frame the selection · T: top · G: game camera · C: all corners · ?: keys</div>`;
}
const HELP: Record<Tool, string> = {
  select: 'Click a piece, floor, pin or marker to inspect it · drag a prop to move it · Delete removes · arrows move · Q/E turn',
  brush: 'Drag to paint the chosen terrace · [ ] brush size · Alt: one corner · I: pick the terrace under the cursor',
  rect: 'Drag over the cells to paint',
  stair: 'Drag along the edge where the stair should start; it runs down to the lower side (or select an edge and use Add a stair)',
  line: "Click a line's two ends: every edge near it snaps onto it, straight, at any angle · drag a selected line's ends · Esc clears the first point",
  round: 'Click three points along an edge to fit a round through them (or drag from a centre for a whole circle): every edge near it snaps onto it · Esc clears the points',
  curve: 'Drag along a straight edge of a higher level for the ends, then move out for the bulge and click · drag a selected curve\'s handles to change it',
  prop: 'Click to place the prop · Q/E turn it first',
  pin: 'Click anything and write what should change: Claude sees new pins with your next message · K: concept images (click one to pin on it)',
};

const cv = renderer.domElement;
const objOf = (it?: Inst) => (it?.src ? sc?.objects.find((o) => o.id === it.src) : undefined);
// capture: these run before OrbitControls, so a tool can claim the left button
cv.addEventListener('pointerdown', (ev) => {
  if (ev.button !== 0 || !sc) return;
  alt = ev.altKey;
  $('pinbox').style.display = 'none';
  if (tool === 'curve' && curving) { commitCurve(); return; }
  if (tool === 'select' && handles.children.length && selFlight()) {
    castFrom(ev);
    const hh = ray.intersectObjects(handles.children, false)[0], o = selFlight()!;
    if (hh) {
      const base = o.head as Head, w = hh.object.userData.handle as string;
      controls.enabled = false;
      drag = { kind: 'fhandle', id: o.id, which: w, hm: upperAt((base[0][0] + base[1][0]) / 2, (base[0][1] + base[1][1]) / 2), base, head: base };
      cv.setPointerCapture(ev.pointerId); headDots(base);
      return;
    }
  }
  if ((tool === 'select' || tool === 'line') && handles.children.length && selLine()) {
    castFrom(ev);
    const hh = ray.intersectObjects(handles.children, false)[0], o = selLine()!;
    if (hh) {
      const base = { a: o.a as Pt, b: o.b as Pt }, w = hh.object.userData.handle as 'a' | 'b';
      controls.enabled = false;
      drag = { kind: 'lhandle', id: o.id, which: w, hm: upperAt(...base[w]), base, shape: base };
      cv.setPointerCapture(ev.pointerId);
      return;
    }
  }
  if (tool === 'line') {
    const c = groundAt(ev); if (!c) return;
    if (!linePts.length) { linePts = [snapQ(c)]; rebuildRounds(); lineBar(null, 'Click the line\'s other end'); }
    else commitLine({ a: linePts[0], b: snapQ(c) });
    return;
  }
  if ((tool === 'select' || tool === 'round') && handles.children.length && selRound()) {
    castFrom(ev);
    const hh = ray.intersectObjects(handles.children, false)[0], o = selRound()!;
    if (hh) {
      const base = o as unknown as RoundShape;
      controls.enabled = false;
      drag = { kind: 'rhandle', id: o.id, which: hh.object.userData.handle, hm: upperAt(...(hh.object.userData.handle === 'centre' ? base.centre : roundHandles(base).find(([w]) => w === hh.object.userData.handle)![1])), base, shape: base };
      cv.setPointerCapture(ev.pointerId);
      return;
    }
  }
  if (tool === 'round') {
    controls.enabled = false;
    const c = groundAt(ev); if (!c) return;
    drag = { kind: 'round', start: [Math.round(c[0] * 4) / 4, Math.round(c[1] * 4) / 4], px: [ev.clientX, ev.clientY], moved: false };
    cv.setPointerCapture(ev.pointerId);
    return;
  }
  if ((tool === 'select' || tool === 'curve') && handles.children.length) {
    castFrom(ev);
    const hh = ray.intersectObjects(handles.children, false)[0], o = selCurve(), t = o && curveTerr(o);
    if (hh && o && t) {
      const base = o as unknown as CurveShape;
      controls.enabled = false;
      drag = { kind: 'handle', id: o.id, which: hh.object.userData.handle, e: lineOf(base, t.glyph), hm: t.h, base, shape: base, ok: true };
      cv.setPointerCapture(ev.pointerId);
      return;
    }
  }
  if (tool === 'curve') {
    controls.enabled = false;
    const c = groundAt(ev), e = c && edgeAt(sc.corners, hOf, c);
    if (!c || !e) { toast('Press on a straight edge of a higher level, where it drops to lower ground', true); return; }
    const run = runOn(sc.corners, hOf, e, along(e, c), along(e, c));
    drag = { kind: 'curve', e, a0: along(e, c), ends: run.ends, ok: run.ok };
    cv.setPointerCapture(ev.pointerId);
    return;
  }
  if (tool === 'select') {
    const h = pick(ev), o = h?.inst != null && shown ? objOf(shown.instances[h.inst]) : undefined;
    if (o && isProp(o) && !ev.shiftKey) {
      controls.enabled = false; sel = { type: 'obj', id: o.id }; highlightSel(); renderInspect();
      drag = { kind: 'prop', id: o.id, start: o.at as [number, number], at: o.at as [number, number] };
      cv.setPointerCapture(ev.pointerId);
    } else drag = { kind: 'click', px: [ev.clientX, ev.clientY] };   // a click selects; a drag orbits (OrbitControls)
    return;
  }
  controls.enabled = false;
  const c = groundAt(ev);
  if (!c) return;
  if (tool === 'prop') { apply([{ op: 'add', kind: propPiece.startsWith('setpiece.') ? 'setpiece' : 'vignette', piece: propPiece, at: [Math.round(c[0] * 2) / 2, Math.round(c[1] * 2) / 2], front: propFront }], `place ${pieceName(propPiece)}`); return; }
  if (tool === 'pin') { ev.preventDefault(); const h = pick(ev); if (h) openPinBox(ev, h); return; }
  drag = { kind: 'paint', start: c, last: c, corners: new Map(), px: [ev.clientX, ev.clientY], select: tool === 'rect' && (ev.ctrlKey || ev.metaKey) };
  cv.setPointerCapture(ev.pointerId);
  updatePreview(ev);
}, { capture: true });
cv.addEventListener('pointermove', (ev) => {
  alt = ev.altKey;
  if (figureOn) { const c = groundAt(ev); if (c) { hoverCorner = c; placeFigure(c[0], c[1], lastY); figure.visible = true; } }
  if (!drag || drag.kind === 'click') {
    hover = pick(ev); info(hover);
    const g = tool === 'select' && hover?.inst != null && kit ? kit.children.find((o) => o.userData.inst === hover!.inst) : null;
    if (g) { hoverBox.setFromObject(g); hoverBox.visible = true; } else hoverBox.visible = false;
  }
  if (drag?.kind === 'curve') {
    const hm = hOf(drag.e.glyph) ?? 0, p = planeAt(ev, hm); if (!p) return;
    const run = runOn(sc!.corners, hOf, drag.e, drag.a0, along(drag.e, p));
    drag.ends = run.ends; drag.ok = run.ok;
    showLine(run.ends, hm, run.ok ? 0xffe08a : 0xff5544);
    setSquares(preview, run.ends.map(([x, y]) => ({ x, y, h: hm, c: run.ok ? 0xff8a3d : 0xff5544, s: 0.4 })));
    $('brushbar').innerHTML = run.ok ? `The curve's ends: ${run.len} cell${run.len > 1 ? 's' : ''} of ${esc(terrace(drag.e.glyph)?.name)}'s edge · release, then move out for the bulge` : 'The ends must be on one straight run of the edge';
    return;
  }
  if (curving) {
    const hm = hOf(curving.e.glyph) ?? 0, p = planeAt(ev, hm); if (!p) return;
    curving.shape = fromSag(curving.ends, curving.e.out, sagFor(curving.ends, curving.e.out, p));
    const ok = inBounds(arcPoints(curving.shape));
    showCurve(curving.shape, hm, ok); curveBar(curving.shape, ok ? 'Click to place' : 'Off the map');
    return;
  }
  if (drag?.kind === 'lhandle') {
    const p = planeAt(ev, drag.hm); if (!p) return;
    drag.shape = { ...drag.base, [drag.which]: snapQ(p) };
    linePreview = drag.shape; rebuildRounds(); lineBar(drag.shape, 'Release to set it');
    return;
  }
  if (tool === 'line') {
    const c = groundAt(ev); if (!c) return;
    linePreview = linePts.length ? { a: linePts[0], b: snapQ(c) } : null;
    rebuildRounds(); lineBar(linePreview, linePts.length ? 'Click the other end' : 'Click a line\'s two ends: every edge near it snaps onto it, straight, at any angle');
    return;
  }
  if (drag?.kind === 'fhandle') {
    const p = planeAt(ev, drag.hm); if (!p) return;
    drag.head = dragHead(drag.base, drag.which, p); headDots(drag.head);
    const w = Math.round(Math.hypot(drag.head[1][0] - drag.head[0][0], drag.head[1][1] - drag.head[0][1]));
    $('brushbar').style.display = 'flex'; $('brushbar').innerHTML = `The stair: ${w} cell${w > 1 ? 's' : ''} wide (${Math.round(w * G() * 0.6 * 10) / 10} m) · release to set it`;
    return;
  }
  if (drag?.kind === 'rhandle') {
    const p = planeAt(ev, drag.hm); if (!p) return;
    drag.shape = dragRound(drag.base, drag.which, p);
    roundPreview = drag.shape; rebuildRounds(); roundBar(drag.shape, 'Release to set it');
    return;
  }
  if (tool === 'round') {
    const c = groundAt(ev); if (!c) return;
    const p: Pt = [Math.round(c[0] * 4) / 4, Math.round(c[1] * 4) / 4];
    if (drag?.kind === 'round') {
      if (Math.hypot(ev.clientX - drag.px[0], ev.clientY - drag.px[1]) > 6) drag.moved = true;
      if (drag.moved) { roundPreview = roundFrom(drag.start, p); rebuildRounds(); roundBar(roundPreview, 'A whole circle, release to place it'); return; }
    }
    roundPreview = roundPts.length === 2 ? roundThrough(roundPts[0], roundPts[1], p) : roundPts.length === 1 ? null : null;
    rebuildRounds();
    if (!drag) roundBar(roundPreview, roundPts.length === 2 ? 'Click the last point along the edge' : roundPts.length === 1 ? 'Click a second point along the edge, then a third' : 'Click three points along an edge to fit a round through them, or drag from a centre for a whole circle');
    return;
  }
  if (drag?.kind === 'handle') {
    const p = planeAt(ev, drag.hm); if (!p) return;
    dragHandle(drag, p);
    const ok = drag.ok && inBounds(arcPoints(drag.shape));
    showCurve(drag.shape, drag.hm, ok); $('brushbar').style.display = 'flex'; curveBar(drag.shape, ok ? 'Release to set it' : 'Not on one straight run of the edge');
    return;
  }
  if (tool !== 'select' && tool !== 'pin' && tool !== 'curve' || drag?.kind === 'prop') updatePreview(ev);
});
function endDrag() { drag = null; controls.enabled = true; setSquares(preview, []); renderBrushbar(); }
cv.addEventListener('pointercancel', endDrag);
cv.addEventListener('lostpointercapture', () => { if (drag && drag.kind !== 'click') endDrag(); });
cv.addEventListener('pointerup', (ev) => {
  controls.enabled = true;
  if (!drag || !sc) return;
  const d = drag; drag = null;
  if (d.kind === 'click') { if (Math.hypot(ev.clientX - d.px[0], ev.clientY - d.px[1]) < 5) select(pick(ev)); return; }
  if (d.kind === 'prop') {
    const by = [d.at[0] - d.start[0], d.at[1] - d.start[1]];
    if (by[0] || by[1]) apply([{ op: 'move', id: d.id, by }], `move ${d.id}`);
    setSquares(preview, []); return;
  }
  if (d.kind === 'curve') {
    endDrag();
    if (!d.ok) { toast("The ends must be on one straight run of the level's edge", true); rebuildHandles(); return; }
    const e = d.e, shape = fromSag(d.ends, e.out, halfOf(d.ends));
    curving = { e, ends: d.ends, shape };
    showCurve(shape, hOf(e.glyph) ?? 0, inBounds(arcPoints(shape))); curveBar(shape, 'Move out for the bulge, click to place (Esc cancels)');
    return;
  }
  if (d.kind === 'lhandle') {
    endDrag(); linePreview = null;
    const s = d.shape;
    if (s.a.join() !== d.base.a.join() || s.b.join() !== d.base.b.join()) apply([{ op: 'set', id: d.id, a: s.a, b: s.b }], 'move a line\'s end');
    rebuildHandles();
    return;
  }
  if (d.kind === 'fhandle') {
    endDrag();
    if (JSON.stringify(d.head) !== JSON.stringify(d.base)) apply([{ op: 'set', id: d.id, head: d.head }], d.which === 'mid' ? 'slide a stair' : 'resize a stair');
    rebuildHandles();
    return;
  }
  if (d.kind === 'rhandle') {
    endDrag(); roundPreview = null;
    const s = d.shape, b = d.base;
    if (s.r !== b.r || s.centre.join() !== b.centre.join() || s.from !== b.from || s.to !== b.to)
      apply([{ op: 'set', id: d.id, centre: s.centre, r: s.r, ...(s.from != null ? { from: s.from, to: s.to } : {}) }], d.which === 'centre' ? 'move a round' : d.which === 'r' ? 'resize a round' : 'set a round\'s arc');
    rebuildHandles();
    return;
  }
  if (d.kind === 'round') {
    endDrag();
    const p = groundAt(ev);
    if (d.moved && p) { const o = roundFrom(d.start, [Math.round(p[0] * 4) / 4, Math.round(p[1] * 4) / 4]); if (o.r >= 1) commitRound(o); else rebuildRounds(); return; }
    roundPts.push(d.start);
    if (roundPts.length === 3) {
      const o = roundThrough(roundPts[0], roundPts[1], roundPts[2]);
      if (o) commitRound(o); else { roundPts = []; roundPreview = null; rebuildRounds(); toast('Those three points are in a line: pick three along a curve', true); }
    } else rebuildRounds();
    return;
  }
  if (d.kind === 'handle') {
    endDrag();
    const ok = d.ok && inBounds(arcPoints(d.shape)), same = JSON.stringify([d.shape.ends, d.shape.centre, d.shape.r]) === JSON.stringify([d.base.ends, d.base.centre, d.base.r]);
    if (!ok) toast('That would put the ends off one straight run of the edge, or the bulge off the map', true);
    else if (!same) setCurve(d.id, d.shape, d.which === 'apex' ? 'bulge a curve' : 'move a curve end');
    rebuildHandles();
    return;
  }
  const end = groundAt(ev) ?? d.last, moved = Math.hypot(ev.clientX - d.px[0], ev.clientY - d.px[1]) > 6;
  if (tool === 'brush' && d.corners.size) {
    completeSaddles(d.corners, brushG);
    apply([{ op: 'paint', terrace: brushG, at: [...d.corners.values()] }], `paint ${terrace(brushG)?.name ?? brushG}`);
  }
  if (tool === 'rect' && moved && d.select) {
    region = regionOf(d.start, end); showRegion(region);
    toast(`${region.x1 - region.x0} × ${region.y1 - region.y0} cells selected: Ctrl+C copies them, then Ctrl+V pastes at the cursor`);
  } else if (tool === 'rect' && moved) {
    const m = new Map(rectCorners(d.start, end).map((p) => [p.join(), p] as [string, [number, number]]));
    completeSaddles(m, brushG);
    if (m.size) apply([{ op: 'paint', terrace: brushG, at: [...m.values()] }], `paint ${terrace(brushG)?.name ?? brushG}`);
  }
  if (tool === 'stair' && moved) {
    const head = stairHead(d.start, end);
    if (head) apply([{ op: 'add', kind: 'flight', name: 'a stair', head }], 'add a stair');
    else toast('No drop there: drag along the edge between two levels, at least one cell wide', true);
  }
  endDrag();
});

function select(h: Hit | null) {
  if (!h || !sc) sel = null;
  else if (h.pin) sel = { type: 'pin', id: h.pin };
  else if (h.finding) { sel = null; focus(h.finding.at![0], h.finding.at![1]); }
  else if (h.inst != null && shown) {
    const it = shown.instances[h.inst];
    if (it.e && it.p.startsWith('edge.')) sel = { type: 'edge', e: it.e, p: it.p };
    else if (it.src && sc.objects.some((o) => o.id === it.src)) sel = { type: 'obj', id: it.src };
    else if (it.src && sc.terraces.some((t) => t.id === it.src)) sel = { type: 'terrace', id: it.src };
    else sel = null;
  } else if (h.floor) sel = { type: 'terrace', id: h.floor.id ?? terrace(h.floor.t)?.id ?? '' };
  else sel = null;
  highlightSel(); renderInspect();
}

// ---- pins ----
let pinAnchor: Pin['anchor'] | null = null;
function openPinBox(ev: PointerEvent, h: Hit) {
  const x = h.point.x / G(), y = h.point.z / G();
  const it = h.inst != null && shown ? shown.instances[h.inst] : null;
  pinAnchor = {
    x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, h: Math.round((h.point.y / yOf(1)) * 100) / 100,
    obj: it?.o ?? it?.src ?? h.floor?.id, inst: it ? { p: it.p, e: it.e } : undefined,
    cam: [...cam.position.toArray(), ...controls.target.toArray()].map((v) => Math.round(v * 100) / 100),
  };
  showPinBox(ev);
}
/** The note box, beside where the user clicked (on the map or on a concept image). */
function showPinBox(ev: { clientX: number; clientY: number }) {
  const box = $('pinbox'), ta = box.querySelector('textarea')!;
  box.style.display = 'block';
  box.style.left = `${Math.min(innerWidth - 290, ev.clientX + 12)}px`; box.style.top = `${Math.min(innerHeight - 110, ev.clientY + 12)}px`;
  ta.value = ''; ta.focus(); requestAnimationFrame(() => ta.focus());   // again after the click, which can take the focus back
}
const concepts = new Concepts({
  scene: () => name, call, toast, pins: () => pins,
  selectedPin: () => (sel?.type === 'pin' ? sel.id : null),
  pinAt: (ev, anchor) => { pinAnchor = anchor; showPinBox(ev); },
  selectPin: (id) => { sel = { type: 'pin', id }; highlightSel(); renderInspect(); concepts.renderPins(); },
});
hot.on('map:refs', (d: { name: string; refs: Parameters<Concepts['set']>[0] }) => { if (d.name === name) { concepts.set(d.refs); renderTop(); renderLists(); } });
$('pinbox').querySelector('textarea')!.addEventListener('keydown', async (e) => {
  const ta = e.target as HTMLTextAreaElement;
  if (e.key === 'Escape') { $('pinbox').style.display = 'none'; return; }
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (pinAnchor && ta.value.trim()) { await pinOp({ op: 'add', note: ta.value.trim(), anchor: pinAnchor, author: 'user' }); toast('Pin saved: Claude sees it with your next message'); }
    $('pinbox').style.display = 'none';
  }
});

// ---- keys ----
const TOOLKEY: Record<string, Tool> = { v: 'select', b: 'brush', r: 'rect', s: 'stair', a: 'curve', o: 'round', l: 'line', p: 'prop', n: 'pin' };
const FRONTS = ['N', 'E', 'S', 'W'];
/** An arrow key as a step on the map, relative to where the camera looks. */
function arrowStep(k: string): [number, number] | null {
  const f = controls.target.clone().sub(cam.position); f.y = 0;
  const fwd: [number, number] = Math.abs(f.x) > Math.abs(f.z) ? [Math.sign(f.x), 0] : [0, Math.sign(f.z)];
  const right: [number, number] = [-fwd[1], fwd[0]];
  return ({ arrowup: fwd, arrowdown: [-fwd[0], -fwd[1]], arrowright: right, arrowleft: [-right[0], -right[1]] } as Record<string, [number, number]>)[k] ?? null;
}
addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); save(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'c' && region) { e.preventDefault(); copyRegion(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'v' && clip) { clearTimeout(pasteTimer); pasteTimer = window.setTimeout(pasteRegion, 120); return; }
  if (e.ctrlKey || e.metaKey) return;
  if (TOOLKEY[k]) { setTool(TOOLKEY[k]); return; }
  if (k >= '1' && k <= '9' && sc?.terraces[Number(k) - 1]) { brushG = sc.terraces[Number(k) - 1].glyph; if (tool !== 'brush' && tool !== 'rect') setTool('brush'); renderPalette(); renderBrushbar(); return; }
  if (k === '[') { brushN = Math.max(1, brushN - 1); renderBrushbar(); return; }
  if (k === ']') { brushN = Math.min(12, brushN + 1); renderBrushbar(); return; }
  if (k === 't') { const [x, y] = targetCorner(); topView(x, y, span() / G() / 2); return; }
  if (k === 'g') { const [x, y] = targetCorner(); gameView(x, y, span() * 0.6); return; }
  if (k === 'f') { const w = selWhere(); if (w) focus(w[0], w[1], 24); else frameAll(); return; }
  if (k === 'c') { cornersOn = !cornersOn; rebuildCorners(); renderTop(); return; }
  if (k === 'm') { showMarkers = !showMarkers; markers.visible = showMarkers; return; }
  if (k === 'k') { concepts.toggle(); return; }
  if (k === 'w') { toggleFigure(); return; }
  if (k === '?' || k === 'h') { $('keys').style.display = $('keys').style.display === 'block' ? 'none' : 'block'; return; }
  if (k === 'i' && hoverCorner && sc) { const [x, y] = hoverCorner.map(Math.round); if (inMap(x, y)) { brushG = sc.corners[y][x]; renderPalette(); renderBrushbar(); toast(`Brush: ${terrace(brushG)?.name}`); } return; }
  if (k === 'escape' && (curving || drag?.kind === 'curve')) { drag = null; controls.enabled = true; cancelCurve(); return; }
  if (k === 'escape' && region) { region = null; showRegion(null); return; }
  if (k === 'escape' && linePts.length) { linePts = []; linePreview = null; rebuildRounds(); setSquares(preview, []); return; }
  if (k === 'escape' && roundPts.length) { roundPts = []; roundPreview = null; rebuildRounds(); setSquares(preview, []); return; }
  if (k === 'escape') { sel = null; $('keys').style.display = 'none'; highlightSel(); renderInspect(); return; }
  if (k === 'q' || k === 'e') {
    const d = k === 'e' ? 1 : 3;
    if (sel?.type === 'obj') { const o = sc?.objects.find((x) => x.id === (sel as { id: string }).id); if (o && isProp(o)) apply([{ op: 'set', id: o.id, front: FRONTS[(FRONTS.indexOf(String(o.front ?? 'S')) + d) % 4] }], 'turn a prop'); }
    else { propFront = FRONTS[(FRONTS.indexOf(propFront) + d) % 4]; renderBrushbar(); }
    return;
  }
  if ((k === 'delete' || k === 'backspace') && sel?.type === 'obj') { apply([{ op: 'remove', id: sel.id }], `remove ${sel.id}`); sel = null; renderInspect(); return; }
  if (k.startsWith('arrow') && sel?.type === 'obj') {
    e.preventDefault();
    const o = sc?.objects.find((x) => x.id === (sel as { id: string }).id), dir = arrowStep(k); if (!o || !dir) return;
    if (o.kind === 'curve') { toast("A curve sits on its level's edge: drag its end handles instead", true); return; }
    const step = isProp(o) && !e.shiftKey ? 0.5 : 1;
    apply([{ op: 'move', id: o.id, by: [dir[0] * step, dir[1] * step] }], `move ${o.id}`);
  }
});

// ---- UI ----
let toastT = 0;
function toast(msg: string, bad = false) {
  const t = $('toast'); t.textContent = msg; t.style.background = bad ? '#c4493b' : '#4a5a7a'; t.style.opacity = '1';
  clearTimeout(toastT); toastT = window.setTimeout(() => { t.style.opacity = '0'; }, bad ? 4500 : 2800);
}
function setTool(t: Tool) {
  tool = t; drag = null; curving = null; roundPts = []; roundPreview = null; linePts = []; linePreview = null; controls.enabled = true; setSquares(preview, []); hoverBox.visible = false;
  controls.mouseButtons = { LEFT: t === 'select' ? THREE.MOUSE.ROTATE : (null as unknown as THREE.MOUSE), MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
  rebuildCorners(); rebuildHandles(); renderTools(); renderBrushbar(); info(hover);
}
/** True while the user is typing in a panel: an update mustn't redraw it under their cursor. */
const typingIn = (id: string) => { const a = document.activeElement as HTMLElement | null; return !!a && $(id).contains(a) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName); };

let sceneNames: string[] = [];
function renderStatus() {
  const el = document.getElementById('status');
  if (!el) return;
  const n = draft?.edits.length ?? 0;
  el.textContent = pending ? 'working…' : draft?.dirty ? `● unsaved${n ? `: ${n} edit${n > 1 ? 's' : ''}` : ''}` : '✓ saved';
  el.className = `chip ${draft?.dirty ? 'warn' : 'ok'}`;
  el.title = draft?.dirty ? `Edits go to a draft (${name}.draft.json); ${name}.scene.json changes only when you save (Ctrl+S). The list on the right shows what changed` : `${name}.scene.json is up to date · rev ${rev}`;
  const sv = document.getElementById('b-save') as HTMLButtonElement | null; if (sv) sv.disabled = !draft?.dirty;
}
function renderTop() {
  if (typingIn('top')) return;
  const c = comp, errs = c?.errors.length ?? 0, warns = c?.warnings.length ?? 0;
  $('top').innerHTML = `
    <b style="font-size:15px">Map editor</b>
    <select id="scene">${sceneNames.map((n) => `<option ${n === name ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
    <button id="b-new" title="A new scene: blank, or a copy of this one">New…</button>
    <span class="chip" id="status"></span>
    <button id="b-save" title="Save the draft to the scene file (Ctrl+S)">Save</button>
    ${errs ? `<span class="chip err">${errs} error${errs > 1 ? 's' : ''}</span>` : '<span class="chip ok">✓ compiles</span>'}
    ${warns ? `<span class="chip warn">${warns} warning${warns > 1 ? 's' : ''}</span>` : ''}
    <span class="chip" title="pieces · compile time">${c ? Object.values(c.pieces).reduce((a, b) => a + b, 0) : 0} pieces · ${c?.ms ?? '?'} ms</span>
    <span class="grow"></span>
    <button id="b-top" title="Look straight down (T)">Top</button><button id="b-game" title="The game's camera (G)">Game</button>
    <button id="b-corners" title="Show every corner's terrace (C)">${cornersOn ? '◉' : '○'} Corners</button>
    <button id="b-figure" title="A wizard for scale, on the floor under the cursor (W)">${figureOn ? '◉' : '○'} Figure</button>
    <button id="b-concepts" title="Concept images for this map: click one to pin a note on it (K)">Concepts (${concepts.refs.length})</button>
    <button id="b-keys" title="All the keys (?)">?</button>
    <button id="b-undo" title="Undo (Ctrl+Z)"><img src="${icon('undo')}" width="18"></button>
    <button id="b-redo" title="Redo (Ctrl+Y)"><img src="${icon('redo')}" width="18"></button>`;
  renderStatus();
  $<HTMLSelectElement>('scene').onchange = (e) => open((e.target as HTMLSelectElement).value);
  $('b-new').onclick = () => {
    $('b-new').outerHTML = `<span id="newform"><input id="nf-name" placeholder="name, e.g. courtyard" style="width:150px" class="btn">
      <input id="nf-w" type="number" value="24" style="width:52px" class="btn" title="cells across">×<input id="nf-h" type="number" value="16" style="width:52px" class="btn" title="cells down">
      <button class="btn" id="nf-blank">Blank</button><button class="btn" id="nf-copy">Copy ${esc(name)}</button><button class="btn" id="nf-x">✕</button></span>`;
    const make = async (from?: string) => {
      const n = $<HTMLInputElement>('nf-name').value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
      const r = await call('new', { name: n, w: Number($<HTMLInputElement>('nf-w').value), h: Number($<HTMLInputElement>('nf-h').value), from });
      if (r) { sceneNames = [...new Set([...sceneNames, n])].sort(); (document.activeElement as HTMLElement)?.blur(); await open(n); }
    };
    $('nf-blank').onclick = () => make(); $('nf-copy').onclick = () => make(name); $('nf-x').onclick = () => { (document.activeElement as HTMLElement)?.blur(); renderTop(); };
    $('nf-name').focus();
  };
  $('b-save').onclick = () => save();
  $('b-undo').onclick = () => undo();
  $('b-redo').onclick = () => redo();
  $('b-top').onclick = () => dispatchEvent(new KeyboardEvent('keydown', { key: 't' }));
  $('b-game').onclick = () => dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }));
  $('b-keys').onclick = () => dispatchEvent(new KeyboardEvent('keydown', { key: '?' }));
  $('b-corners').onclick = () => { cornersOn = !cornersOn; rebuildCorners(); renderTop(); };
  $('b-concepts').onclick = () => concepts.toggle();
  $('b-figure').onclick = () => toggleFigure();
}

const TOOLS: [Tool, string, string, string][] = [
  ['select', '', 'Select and inspect', 'V'], ['brush', 'brush', 'Paint terraces', 'B'], ['rect', 'rect', 'Paint a rectangle', 'R'],
  ['stair', 'stair', 'Add a stair', 'S'], ['curve', 'curve', 'Curve an edge', 'A'], ['round', '◯', 'Round: snap edges onto a circle', 'O'], ['line', '╱', 'Line: snap edges onto a straight line, at any angle', 'L'], ['prop', 'prop', 'Place a prop', 'P'], ['pin', 'pin', 'Pin a note for Claude', 'N'],
];
function renderTools() {
  $('tools').innerHTML = TOOLS.map(([t, ic, title, key]) => `<button data-t="${t}" class="${tool === t ? 'on' : ''}" title="${title} (${key})">${icon(ic) ? `<img src="${icon(ic)}">` : `<span>${ic || '↖'}</span>`}<kbd>${key}</kbd></button>`).join('');
  $('tools').querySelectorAll('button').forEach((b) => { b.onclick = () => setTool((b as HTMLElement).dataset.t as Tool); });
}

/** What the Prop tool places: vignettes (small props) and set pieces (unique made pieces on a footprint), from kit.json. */
let PIECES = ['vignette.lamp', 'vignette.bench-planter'];
const pieceName = (p: string) => p.replace(/^(vignette|setpiece)\./, '');
const pieceOptions = () => (['vignette', 'setpiece'] as const).map((c) => {
  const ps = PIECES.filter((p) => p.startsWith(`${c}.`));
  return ps.length ? `<optgroup label="${c === 'vignette' ? 'props' : 'set pieces'}">${ps.map((p) => `<option ${p === propPiece ? 'selected' : ''} value="${p}">${pieceName(p)}</option>`).join('')}</optgroup>` : '';
}).join('');
function renderBrushbar() {
  const bar = $('brushbar'), t = terrace(brushG);
  bar.style.display = tool === 'select' || tool === 'pin' ? 'none' : 'flex';
  if (tool === 'brush' || tool === 'rect') bar.innerHTML = `Painting <b>${esc(t?.name ?? brushG)}</b> (${t?.h ?? 0} m)${tool === 'brush' ? ` · brush ${brushN} cell${brushN > 1 ? 's' : ''} <button class="btn" id="bs-">−</button><button class="btn" id="bs+">+</button> · Alt: one corner` : ' · drag over the cells · Ctrl+drag: select them, then Ctrl+C, Ctrl+V'}`;
  if (tool === 'stair') bar.innerHTML = 'Drag along an edge between two levels: the stair runs down from there';
  if (tool === 'line') bar.innerHTML = "Click a line's two ends: every edge near it snaps onto it";
  if (tool === 'round') bar.innerHTML = 'Click three points along an edge to fit a round through them, or drag from a centre for a whole circle';
  if (tool === 'curve') bar.innerHTML = 'Drag along a straight edge of a higher level for the ends; then move out for the bulge and click';
  if (tool === 'prop') bar.innerHTML = `<select id="piece" class="btn">${pieceOptions()}</select>${kitPiece(propPiece)?.footprint ? ` <span class="meta">${kitPiece(propPiece)!.footprint!.join(' × ')} u, ${kitPiece(propPiece)!.height} m</span>` : ''} facing <span class="seg">${FRONTS.map((f) => `<button data-f="${f}" class="${f === propFront ? 'on' : ''}">${f}</button>`).join('')}</span>`;
  const m = document.getElementById('bs-'), p = document.getElementById('bs+');
  if (m) m.onclick = () => { brushN = Math.max(1, brushN - 1); renderBrushbar(); };
  if (p) p.onclick = () => { brushN = Math.min(12, brushN + 1); renderBrushbar(); };
  const ps = document.getElementById('piece') as HTMLSelectElement | null; if (ps) ps.onchange = () => { propPiece = ps.value; renderBrushbar(); };
  bar.querySelectorAll('[data-f]').forEach((b) => { (b as HTMLElement).onclick = () => { propFront = (b as HTMLElement).dataset.f!; renderBrushbar(); }; });
}

function renderPalette() {
  if (!sc) return;
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  $('palette').innerHTML = sc.terraces.map((t, i) => `<div class="sw ${t.glyph === brushG ? 'on' : ''}" data-g="${esc(t.glyph)}" title="${esc(t.id)} · glyph ${esc(t.glyph)} · edge ${esc(t.edge)}${t.walk === false ? ' · not walkable' : ''} — click to paint with it, double-click to edit it">
      <i style="background:${hex(colorOf(t.glyph))}"></i><div><div class="n">${i < 9 ? `<span class="meta">${i + 1}</span> ` : ''}${esc(t.name ?? t.id)}</div><div class="h">${t.h} m · ${esc(t.edge ?? 'retain')}</div></div></div>`).join('')
    + '<div class="sw add" title="Add a level: then paint where it goes">+ level</div>';
  $('palette').querySelectorAll<HTMLElement>('.sw[data-g]').forEach((el) => {
    el.onclick = () => { brushG = el.dataset.g!; if (tool !== 'brush' && tool !== 'rect') setTool('brush'); renderPalette(); renderBrushbar(); };
    el.ondblclick = () => { const t = terrace(el.dataset.g!); if (t) { sel = { type: 'terrace', id: t.id }; highlightSel(); renderInspect(); } };
  });
  ($('palette').querySelector('.sw.add') as HTMLElement).onclick = async () => {
    const hs = sc!.terraces.filter((t) => t.edge !== 'wall').map((t) => t.h);
    const top = hs.length ? Math.max(...hs) : 0;
    const r = await apply([{ op: 'add_terrace', name: 'a new level', h: Math.round((top + 1) * 100) / 100, mat: 'paving', edge: 'parapet' }], 'add a level');
    if (r?.minted?.[0]) { newTerrace = r.minted[0]; adoptNewTerrace(); }
  };
}
/** A terrace just added: paint with it, and open it to name it. */
function adoptNewTerrace() {
  const t = newTerrace ? sc?.terraces.find((x) => x.id === newTerrace) : null;
  if (!t) return;
  newTerrace = null;
  brushG = t.glyph; setTool('brush');
  sel = { type: 'terrace', id: t.id }; highlightSel(); renderPalette(); renderInspect();
  const n = document.getElementById('t-name') as HTMLInputElement | null; if (n) { n.focus(); n.select(); }
  toast('A new level: name it, set its height, then paint where it goes');
}

/** kit.json's dressing styles: named lists of rules (the compiler places by them). */
type Style = { note?: string; rules?: Record<string, unknown>[] };
let STYLES: Record<string, Style> = {};
/** A rule, read out: "on every 3rd pier: urn or cap-lantern". */
function ruleText(r: Record<string, unknown>): string {
  const put = ((r.put as string[]) ?? []).map(pieceName).join(' or ');
  if (r.on) return `on ${r.every && Number(r.every) > 1 ? `every ${r.every}${Number(r.every) === 2 ? 'nd' : Number(r.every) === 3 ? 'rd' : 'th'} ` : 'each '}${pieceName(String(r.on)).replace(/^joint\./, '')}: ${put}`;
  if (r.at) return `at each ${String(r.at).replace(/-/g, ' ')}: ${put}`;
  if (r.along) return `along ${r.along}s, every ${r.spacing ?? '?'} u${r.inset != null ? `, ${r.inset} u in` : ''}: ${put}`;
  return `${JSON.stringify(r)}`;
}
/** A dress's controls: its style, seed (and a new one), its level, and the style's rules read out. */
function dressBox(o: Obj): HTMLElement {
  const box = document.createElement('div'), st = STYLES[String(o.style)];
  const names = [...new Set([...Object.keys(STYLES), String(o.style)])];
  box.innerHTML = `<div class="row"><label>Style</label><select id="dr-st">${names.map((n) => `<option ${n === o.style ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
    <div class="row"><label>Seed</label><input id="dr-sd" type="number" step="1" value="${o.seed ?? 1}" style="width:70px"><button class="btn" id="dr-new" title="Another choice of pieces and parts by the same rules">new seed</button></div>
    <div class="row"><label>On</label><select id="dr-t"><option value="">the whole scene</option>${sc!.terraces.map((t) => `<option value="${t.id}" ${t.id === o.terrace ? 'selected' : ''}>${esc(t.name ?? t.id)}</option>`).join('')}</select></div>
    <div class="meta">${st ? `${esc(st.note ?? '')}<ul style="margin:4px 0 0 16px;padding:0">${(st.rules ?? []).map((r) => `<li>${esc(ruleText(r))}</li>`).join('')}</ul>` : 'This style is not in kit.json.'}</div>`;
  const set = (f: Record<string, unknown>, label: string) => apply([{ op: 'set', id: o.id, ...f }], label);
  (box.querySelector('#dr-st') as HTMLSelectElement).onchange = (e) => set({ style: (e.target as HTMLSelectElement).value }, "a dress's style");
  (box.querySelector('#dr-sd') as HTMLInputElement).onchange = (e) => set({ seed: Math.round(Number((e.target as HTMLInputElement).value)) }, "a dress's seed");
  (box.querySelector('#dr-new') as HTMLElement).onclick = () => set({ seed: 1 + Math.floor(Math.random() * 99999) }, 'dress anew');
  (box.querySelector('#dr-t') as HTMLSelectElement).onchange = (e) => set({ terrace: (e.target as HTMLSelectElement).value || null }, "a dress's level");
  return box;
}
/** A scatter's controls (a level filled with set pieces on a seeded grid: the woods' trees), in a box to put in a panel. */
function scatterBox(o: Obj): HTMLElement {
  const box = document.createElement('div'), chosen = new Set((o.pieces as string[]) ?? []);
  const kinds = PIECES.filter((p) => p.startsWith('setpiece.'));
  for (const p of chosen) if (!kinds.includes(p)) kinds.push(p);
  box.innerHTML = `<div class="row"><label>Pieces</label><span>${kinds.map((p) => `<label style="min-width:0;color:inherit;margin-right:6px"><input type="checkbox" data-sp="${esc(p)}" ${chosen.has(p) ? 'checked' : ''}> ${esc(pieceName(p))}</label>`).join('')}</span></div>
    <div class="row"><label>Spacing</label><input id="sc-sp" type="number" step="0.5" value="${o.spacing ?? 7}" style="width:60px"> u apart</div>
    <div class="row"><label>Margin</label><input id="sc-mg" type="number" step="0.5" value="${o.margin ?? 1}" style="width:60px"> cells from the edge</div>
    <div class="row"><label>Seed</label><input id="sc-sd" type="number" step="1" value="${o.seed ?? 1}" style="width:60px"><button class="btn" id="sc-new" title="Another layout of the same density">new seed</button></div>
    <div class="meta">Fills ${esc(curveTerr(o)?.name ?? o.terrace)} with these, on a jittered grid; the same seed gives the same layout every time.</div>`;
  const set = (f: Record<string, unknown>, label: string) => apply([{ op: 'set', id: o.id, ...f }], label);
  box.querySelectorAll<HTMLInputElement>('[data-sp]').forEach((c) => {
    c.onchange = () => {
      const ps = [...box.querySelectorAll<HTMLInputElement>('[data-sp]')].filter((x) => x.checked).map((x) => x.dataset.sp!);
      if (!ps.length) { c.checked = true; toast('A scatter needs at least one piece', true); return; }
      set({ pieces: ps }, "a scatter's pieces");
    };
  });
  (box.querySelector('#sc-sp') as HTMLInputElement).onchange = (e) => { const v = Number((e.target as HTMLInputElement).value); if (v > 0) set({ spacing: v }, "a scatter's spacing"); };
  (box.querySelector('#sc-mg') as HTMLInputElement).onchange = (e) => { const v = Number((e.target as HTMLInputElement).value); if (v >= 0) set({ margin: v }, "a scatter's margin"); };
  (box.querySelector('#sc-sd') as HTMLInputElement).onchange = (e) => set({ seed: Math.round(Number((e.target as HTMLInputElement).value)) }, "a scatter's seed");
  (box.querySelector('#sc-new') as HTMLElement).onclick = () => set({ seed: 1 + Math.floor(Math.random() * 99999) }, 'scatter anew');
  return box;
}
// floors: the flat tones and every floor texture (kit-render.ts floorMats), so a new texture is offered on its own
const MATS = floorMats(), EDGES = ['parapet', 'retain', 'wall', 'open'];
const VARIANTS: Record<string, string[]> = { wall: ['plain', 'window', 'door'], parapet: ['plain', 'niche'], retain: ['plain', 'niche'] };
function renderInspect() {
  if (typingIn('inspect')) return;
  const el = $('inspect');
  if (!sc) { el.innerHTML = ''; return; }
  if (!sel) {
    const w = sc.corners[0].length - 1, h = sc.corners.length - 1, m = (n: number) => Math.round(n * G() * 0.6 * 10) / 10;
    el.innerHTML = `<h3>The map · ${esc(sc.name)}</h3>
      <div class="meta">${w} × ${h} cells (${m(w)} × ${m(h)} m). Select something to inspect it (V, then click).</div>
      <div class="row" style="margin-top:8px"><label>Grow</label><button class="btn" data-g="n">north</button><button class="btn" data-g="s">south</button><button class="btn" data-g="w">west</button><button class="btn" data-g="e">east</button></div>
      <div class="row"><label>Shrink</label><button class="btn" data-s="n">north</button><button class="btn" data-s="s">south</button><button class="btn" data-s="w">west</button><button class="btn" data-s="e">east</button></div>
      <div class="row"><label>Notes</label></div><textarea id="m-notes" style="width:100%;box-sizing:border-box;height:70px;font:inherit;border:1px solid var(--line);border-radius:6px">${esc(sc.notes)}</textarea>`;
    const grow: Record<string, Op> = { n: { op: 'insert_rows', at: 0, n: 1 }, s: { op: 'insert_rows', at: h + 1, n: 1 }, w: { op: 'insert_cols', at: 0, n: 1 }, e: { op: 'insert_cols', at: w + 1, n: 1 } };
    const shrink: Record<string, Op> = { n: { op: 'remove_rows', at: 0, n: 1 }, s: { op: 'remove_rows', at: h, n: 1 }, w: { op: 'remove_cols', at: 0, n: 1 }, e: { op: 'remove_cols', at: w, n: 1 } };
    el.querySelectorAll<HTMLElement>('[data-g]').forEach((b) => { b.onclick = () => apply([grow[b.dataset.g!]], `grow the map ${b.textContent}`); });
    el.querySelectorAll<HTMLElement>('[data-s]').forEach((b) => { b.onclick = () => apply([shrink[b.dataset.s!]], `shrink the map ${b.textContent}`); });
    $<HTMLTextAreaElement>('m-notes').onchange = (e) => apply([{ op: 'set_meta', notes: (e.target as HTMLTextAreaElement).value }], 'notes');
    return;
  }
  if (sel.type === 'terrace') {
    const t = sc.terraces.find((x) => x.id === (sel as { id: string }).id);
    if (!t) { el.innerHTML = ''; return; }
    el.innerHTML = `<h3>Level · ${esc(t.id)}</h3>
      <div class="row"><label>Name</label><input id="t-name" value="${esc(t.name)}"></div>
      <div class="row"><label>Height</label><input id="t-h" type="number" step="0.05" value="${t.h}" style="width:70px"> m <button class="btn" id="t-dn">−0.5</button><button class="btn" id="t-up">+0.5</button></div>
      <div class="row"><label>Floor</label><select id="t-mat">${[...new Set([...MATS, t.mat])].map((m) => `<option ${m === t.mat ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
      <div class="row"><label>Edge</label><select id="t-edge">${EDGES.map((m) => `<option ${m === (t.edge ?? 'retain') ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
      <div class="row"><label>Walkable</label><input id="t-walk" type="checkbox" ${t.walk === false ? '' : 'checked'}></div>
      <div class="meta">Edge: how it meets lower ground. Parapet: a balustrade; retain: a wall with coping; wall: a building; open: a bare drop.</div>
      <div class="row"><button class="btn" id="t-brush">Paint with it</button><button class="btn" id="t-del">Delete</button></div>`;
    const set = (f: Partial<Terrace>, label: string) => apply([{ op: 'set_terrace', id: t.id, ...f }], label);
    const blurThen = (f: () => void) => (e: Event) => { (e.target as HTMLElement).blur(); f(); };
    $<HTMLInputElement>('t-name').onchange = blurThen(() => set({ name: $<HTMLInputElement>('t-name').value }, 'rename a level'));
    $<HTMLInputElement>('t-name').onkeydown = (e) => { if (e.key === 'Enter') (e.target as HTMLElement).blur(); };
    $<HTMLInputElement>('t-h').onchange = blurThen(() => set({ h: Number($<HTMLInputElement>('t-h').value) }, `${t.name}: height`));
    $('t-dn').onclick = () => set({ h: Math.round((t.h - 0.5) * 100) / 100 }, `${t.name}: height`);
    $('t-up').onclick = () => set({ h: Math.round((t.h + 0.5) * 100) / 100 }, `${t.name}: height`);
    $<HTMLSelectElement>('t-mat').onchange = blurThen(() => set({ mat: $<HTMLSelectElement>('t-mat').value }, `${t.name}: floor`));
    $<HTMLSelectElement>('t-edge').onchange = blurThen(() => set({ edge: $<HTMLSelectElement>('t-edge').value }, `${t.name}: edge`));
    $<HTMLInputElement>('t-walk').onchange = blurThen(() => set({ walk: $<HTMLInputElement>('t-walk').checked }, `${t.name}: walkable`));
    $('t-brush').onclick = () => { brushG = t.glyph; setTool('brush'); renderPalette(); };
    $('t-del').onclick = () => apply([{ op: 'remove_terrace', id: t.id }], `remove ${t.name}`);
    // what's scattered over it (trees), or a button to scatter some
    const scs = sc.objects.filter((o) => o.kind === 'scatter' && o.terrace === t.id);
    for (const s of scs) { const h = document.createElement('h3'); h.style.marginTop = '10px'; h.textContent = `Scatter · ${s.id}`; el.append(h, scatterBox(s)); }
    const trees = PIECES.filter((p) => p.startsWith('setpiece.tree'));
    if (!scs.length && PIECES.some((p) => p.startsWith('setpiece.'))) {
      const b = document.createElement('div'); b.className = 'row';
      b.innerHTML = '<button class="btn" id="t-scatter" title="Fill this level with set pieces (trees) on a seeded grid">Scatter pieces over it</button>';
      el.append(b);
      $('t-scatter').onclick = () => apply([{ op: 'add', kind: 'scatter', name: `${t.name}: scattered`, terrace: t.id, pieces: trees.length ? trees : [PIECES.find((p) => p.startsWith('setpiece.'))!], spacing: 7, margin: 1, seed: 1 }], 'scatter pieces');
    }
    return;
  }
  if (sel.type === 'edge') {
    const s = sel, it = shown?.instances.find((i) => near(i.e, s.e) && i.p === s.p) ?? shown?.instances.find((i) => near(i.e, s.e));
    if (!it) { el.innerHTML = '<h3>Edge</h3><div class="meta">This section is gone.</div>'; return; }
    const tr = it.p.split('.')[1], straight = it.p.endsWith('.straight') || it.p === 'edge.wall.door';
    const over = it.o ? sc.objects.find((o) => o.id === it.o) : null;
    const cur = it.p === 'edge.wall.door' ? 'door' : (it.v ?? 'plain');
    const opts = straight ? VARIANTS[tr] ?? [] : [];
    const t = sc.terraces.find((x) => x.id === it.src);
    const drop = it.low != null && it.h - it.low > 0.3 && tr !== 'wall';
    el.innerHTML = `<h3>${esc(tr)} section · (${s.e[0]}, ${s.e[1]})</h3>
      <div class="meta">${esc(it.p)} on <a href="#" id="e-t">${esc(t?.name ?? it.src)}</a> · ${it.h} m over ${it.low} m</div>
      ${opts.length ? `<div class="row" style="margin-top:8px"><span class="seg">${opts.map((v) => `<button data-v="${v}" class="${v === cur ? 'on' : ''}">${v}</button>`).join('')}</span>
      ${over ? '<button class="btn" id="e-auto" title="Remove the override: the compiler chooses">auto</button>' : ''}</div>
      <div class="meta">${over ? `Set here (${esc(over.id)}).` : 'Chosen by the compiler; pick one to set it here.'}</div>` : '<div class="meta">This section has no variants.</div>'}
      ${drop ? `<div class="row" style="margin-top:8px"><button class="btn" id="e-stair">Add a stair here</button> <select id="e-w" class="btn">${[2, 3, 4].map((w) => `<option value="${w}">${w} cells wide</option>`).join('')}</select></div>` : ''}`;
    el.querySelectorAll<HTMLElement>('[data-v]').forEach((b) => {
      b.onclick = () => { const v = b.dataset.v!; apply([over ? { op: 'set', id: over.id, v } : { op: 'add', kind: 'edge', at: s.e, v }], `${tr} section: ${v}`); };
    });
    const auto = document.getElementById('e-auto'); if (auto && over) auto.onclick = () => apply([{ op: 'remove', id: over.id }], `${tr} section: auto`);
    const st = document.getElementById('e-stair');
    if (st) st.onclick = async () => {
      const r = await apply([{ op: 'add', kind: 'flight', name: 'a stair', head: stairFromEdge(it, Number($<HTMLSelectElement>('e-w').value)) }], 'add a stair');
      if (r?.minted?.[0]) { sel = { type: 'obj', id: r.minted[0] }; highlightSel(); renderInspect(); }
    };
    $('e-t').onclick = (ev) => { ev.preventDefault(); if (t) { sel = { type: 'terrace', id: t.id }; highlightSel(); renderInspect(); } };
    return;
  }
  if (sel.type === 'obj') {
    const o = sc.objects.find((x) => x.id === (sel as { id: string }).id) as Obj | undefined;
    if (!o) { el.innerHTML = '<h3>Object</h3><div class="meta">It was removed.</div>'; return; }
    const fields = Object.entries(o).filter(([k]) => !['id', 'kind', 'name'].includes(k)).map(([k, v]) => `<div class="row"><label>${esc(k)}</label><span>${esc(JSON.stringify(v))}</span></div>`).join('');
    el.innerHTML = `<h3>${esc(o.kind === 'flight' ? 'stair' : o.kind === 'vignette' ? 'prop' : o.kind === 'setpiece' ? 'set piece' : o.kind)} · ${esc(o.id)}</h3>
      <div class="row"><label>Name</label><input id="o-name" value="${esc(o.name)}"></div>${fields}
      ${isProp(o) ? `<div class="row"><label>Facing</label><span class="seg">${FRONTS.map((f) => `<button data-f="${f}" class="${f === o.front ? 'on' : ''}">${f}</button>`).join('')}</span></div>` : ''}
      ${o.kind === 'flight' ? '<div class="row"><label>Width</label><button class="btn" id="o-narrow">−1 cell</button><button class="btn" id="o-widen">+1 cell</button></div>' : ''}
      ${o.kind === 'curve' ? `<div class="row"><label>Bulge</label><button class="btn" id="c-less">−½ cell</button><button class="btn" id="c-more">+½ cell</button><button class="btn" id="c-semi">semicircle</button></div>
        <div class="meta">On ${esc(curveTerr(o)?.name ?? o.terrace)}: ${halfOf(o.ends as Pt[]) * 2} cells wide, bulging ${Math.round(sagOf(o as unknown as CurveShape) * 100) / 100}.</div>` : ''}
      <div class="row"><button class="btn" id="o-del">Delete</button><span class="meta">${isProp(o) ? 'Drag it, or arrows; Q/E turn it' : o.kind === 'curve' ? 'Drag its handles: the ends slide along the edge, the middle sets the bulge' : 'Arrows move it'}</span></div>`;
    if (o.kind === 'scatter') el.querySelector('#o-del')!.closest('.row')!.before(scatterBox(o));
    if (o.kind === 'dress') el.querySelector('#o-del')!.closest('.row')!.before(dressBox(o));
    if (o.kind === 'line') {
      const box = document.createElement('div');
      box.innerHTML = `<div class="row"><label>Reach</label><input id="ln-tol" type="number" step="0.25" value="${o.tol ?? 0.75}" style="width:70px" title="How far an edge may lie from the line and still snap onto it (cells)"> cells</div>
        <div class="row"><label>Edges of</label><select id="ln-t"><option value="">any level</option>${sc.terraces.map((t) => `<option value="${t.id}" ${t.id === o.terrace ? 'selected' : ''}>${esc(t.name ?? t.id)}</option>`).join('')}</select></div>
        <div class="meta">Every edge within reach of this line (runs of 3 or more) snaps onto it, straight, at any angle. Drag its ends.</div>`;
      el.querySelector('#o-del')!.closest('.row')!.before(box);
      $<HTMLInputElement>('ln-tol').onchange = () => { const v = Number($<HTMLInputElement>('ln-tol').value); if (v > 0) apply([{ op: 'set', id: o.id, tol: v }], "a line's reach"); };
      $<HTMLSelectElement>('ln-t').onchange = () => apply([{ op: 'set', id: o.id, terrace: $<HTMLSelectElement>('ln-t').value || null }], "a line's level");
    }
    if (o.kind === 'round') {
      // the fields as controls, under the generic list (which shows them raw)
      const box = document.createElement('div');
      box.innerHTML = `<div class="row"><label>Radius</label><input id="rd-r" type="number" step="0.25" value="${o.r}" style="width:70px"> cells</div>
        <div class="row"><label>Reach</label><input id="rd-tol" type="number" step="0.25" value="${o.tol ?? 0.75}" style="width:70px" title="How far an edge may lie from the circle and still snap onto it (cells)"> cells</div>
        <div class="row"><label>Edges of</label><select id="rd-t"><option value="">any level</option>${sc.terraces.map((t) => `<option value="${t.id}" ${t.id === o.terrace ? 'selected' : ''}>${esc(t.name ?? t.id)}</option>`).join('')}</select></div>
        <div class="row"><label>Arc</label><input id="rd-from" type="number" step="1" value="${o.from ?? ''}" placeholder="from" style="width:56px">° to <input id="rd-to" type="number" step="1" value="${o.to ?? ''}" placeholder="to" style="width:56px">° <button class="btn" id="rd-all">whole circle</button></div>
        <div class="meta">Every edge within reach of this circle (runs of 3 or more) snaps onto it, curving out or in. Arc: 0° east, 90° south. Drag its handles: the big one moves it, the others set the radius and the arc's ends.</div>`;
      el.querySelector('#o-del')!.closest('.row')!.before(box);
      const set = (f: Record<string, unknown>, label: string) => apply([{ op: 'set', id: o.id, ...f }], label);
      const n = (id: string) => $<HTMLInputElement>(id).value.trim();
      $<HTMLInputElement>('rd-r').onchange = () => { const v = Number(n('rd-r')); if (v > 0) set({ r: v }, 'resize a round'); };
      $<HTMLInputElement>('rd-tol').onchange = () => { const v = Number(n('rd-tol')); if (v > 0) set({ tol: v }, "a round's reach"); };
      $<HTMLSelectElement>('rd-t').onchange = () => set({ terrace: n('rd-t') || null }, "a round's level");
      const arc = () => { const f = n('rd-from'), t = n('rd-to'); if (f && t) set({ from: Number(f) % 360, to: Number(t) % 360 }, "set a round's arc"); else if (!f && !t) set({ from: null, to: null }, 'a whole round'); };
      $<HTMLInputElement>('rd-from').onchange = arc; $<HTMLInputElement>('rd-to').onchange = arc;
      $('rd-all').onclick = () => set({ from: null, to: null }, 'a whole round');
    }
    if (o.kind === 'curve') {
      const c = o as unknown as CurveShape, half = halfOf(c.ends);
      const bulge = (s: number) => { const v = Math.max(0.25, Math.min(half * 2, s)); if (Math.abs(v - sagOf(c)) > 1e-3) setCurve(o.id, fromSag(c.ends, c.out, v), 'bulge a curve'); };
      $('c-less').onclick = () => bulge(Math.round((sagOf(c) - 0.5) * 4) / 4);
      $('c-more').onclick = () => bulge(Math.round((sagOf(c) + 0.5) * 4) / 4);
      $('c-semi').onclick = () => bulge(half);
    }
    $<HTMLInputElement>('o-name').onchange = (e) => { (e.target as HTMLElement).blur(); apply([{ op: 'set', id: o.id, name: $<HTMLInputElement>('o-name').value }], `rename ${o.id}`); };
    el.querySelectorAll<HTMLElement>('[data-f]').forEach((b) => { b.onclick = () => apply([{ op: 'set', id: o.id, front: b.dataset.f }], 'turn a prop'); });
    const widen = (d: number) => { const [[ax, ay], [bx, by]] = o.head as [number, number][]; const L = Math.hypot(bx - ax, by - ay); if (L + d < 1) return; apply([{ op: 'set', id: o.id, head: [[ax, ay], [ax + ((bx - ax) / L) * (L + d), ay + ((by - ay) / L) * (L + d)]] }], d > 0 ? 'widen a stair' : 'narrow a stair'); };
    const nw = document.getElementById('o-narrow'), wd = document.getElementById('o-widen');
    if (nw) nw.onclick = () => widen(-1); if (wd) wd.onclick = () => widen(1);
    $('o-del').onclick = () => { apply([{ op: 'remove', id: o.id }], `remove ${o.id}`); sel = null; highlightSel(); renderInspect(); };
    return;
  }
  if (sel.type === 'pin') {
    const p = pins.find((x) => x.id === (sel as { id: string }).id);
    el.innerHTML = p ? `<h3>Pin ${esc(p.id)}</h3>${pinHtml(p)}` : '';
    bindPinButtons(el);
  }
}

function pinHtml(p: Pin) {
  return `<div class="item pin ${p.status === 'resolved' ? 'done' : ''}" data-pin="${p.id}">
    <div><b>${esc(p.id)}</b> ${esc(p.note)}</div>
    <div class="meta">${p.anchor.ref ? `on the concept “${esc(concepts.title(p.anchor.ref.id) ?? `${p.anchor.ref.id}, removed`)}”` : `(${p.anchor.x}, ${p.anchor.y})`}${p.anchor.obj ? ` · ${esc(p.anchor.obj)}` : ''}${p.anchor.inst ? ` · ${esc(p.anchor.inst.p)}` : ''} · ${p.status}${p.outcome ? `: ${p.outcome}` : ''}${p.status === 'open' ? (p.seen ? ' · Claude has seen it' : ' · new') : ''}</div>
    ${p.thread.length ? `<div class="thread">${p.thread.map((m) => `<div><b>${m.author === 'claude' ? 'Claude' : esc(m.author)}:</b> ${esc(m.text)}</div>`).join('')}</div>` : ''}
    <div class="row">${p.status === 'open' ? `<button class="btn" data-act="resolve">Done</button>` : `<button class="btn" data-act="reopen">Reopen</button>`}<button class="btn" data-act="delete">Delete</button></div></div>`;
}
function bindPinButtons(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('[data-act]').forEach((b) => {
    const id = b.closest<HTMLElement>('[data-pin]')!.dataset.pin!;
    b.onclick = (e) => { e.stopPropagation(); const act = b.dataset.act; pinOp(act === 'resolve' ? { op: 'resolve', id, outcome: 'scene', author: 'user' } : { op: act, id }); };
  });
}

function renderLists() {
  const el = $('lists');
  const fs = shownFindings();
  const open = pins.filter((p) => p.status === 'open'), done = pins.filter((p) => p.status !== 'open').slice(-5);
  const ago = (t: string) => { const m = Math.round((Date.now() - Date.parse(t)) / 60000); return m < 1 ? 'now' : m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`; };
  const ch = draft?.changed, all = draft?.edits ?? [], edits = all.slice(-12).reverse();
  const unsaved = draft?.dirty && ch ? `<div class="unsaved"><h3>Unsaved changes</h3>
    <div class="meta">${[ch.corners ? `${ch.corners} corner${ch.corners > 1 ? 's' : ''}` : '', ch.ids.length ? `${ch.ids.length} thing${ch.ids.length > 1 ? 's' : ''}: ${esc(ch.ids.slice(0, 8).join(', '))}${ch.ids.length > 8 ? '…' : ''}` : '', ch.resized ? 'the map resized' : ''].filter(Boolean).join(' · ')}</div>
    ${edits.map((e) => `<div class="edit"><span>${e.author === 'user' ? '' : `<b>${esc(e.author === 'claude' ? 'Claude' : e.author)}:</b> `}${esc(e.label)}</span><span class="meta">${ago(e.time)}</span></div>`).join('')}
    ${all.length > 12 ? `<div class="meta">and ${all.length - 12} earlier</div>` : ''}
    <div class="row"><button class="btn" id="ch-show">${showChanges ? '◉' : '○'} Show on map</button><button class="btn" id="ch-save">Save</button><button class="btn ${discardArmed ? 'danger' : ''}" id="ch-discard">${discardArmed ? 'Discard all?' : 'Discard…'}</button></div></div>` : '';
  el.innerHTML = `${unsaved}<h3>Problems (${fs.length})</h3>
    ${fs.map((f, i) => `<div class="item ${f.severity === 'error' ? 'err' : 'warn'}" data-f="${i}">${esc(named(f.msg))}${f.more ? `<div class="meta">and ${f.more} broken run${f.more > 1 ? 's' : ''} beside it</div>` : ''}<div class="meta">${f.code}${f.at ? ` · (${f.at[0]}, ${f.at[1]})` : ''}</div></div>`).join('') || '<div class="meta">None.</div>'}
    <h3 style="margin-top:12px">Pins (${open.length} open)</h3>
    ${open.map(pinHtml).join('') || '<div class="meta">Pin a note on anything (N); Claude sees new pins with your next message in the terminal.</div>'}
    ${done.length ? `<div class="meta" style="margin-top:8px">Recently resolved</div>${done.map(pinHtml).join('')}` : ''}`;
  el.querySelectorAll<HTMLElement>('[data-f]').forEach((d) => { d.onclick = () => { const f = fs[Number(d.dataset.f)]; if (f.at) focus(f.at[0], f.at[1], 20); if (f.refs[0] && sc?.objects.some((o) => o.id === f.refs[0])) { sel = { type: 'obj', id: f.refs[0] }; highlightSel(); renderInspect(); } }; });
  el.querySelectorAll<HTMLElement>('[data-pin]').forEach((d) => { d.onclick = () => { const p = pins.find((x) => x.id === d.dataset.pin); if (!p) return; sel = { type: 'pin', id: p.id }; renderInspect();
    if (p.anchor.ref) { if (concepts.title(p.anchor.ref.id)) concepts.show(p.anchor.ref.id, p.anchor.ref); } else if (p.anchor.x != null && p.anchor.y != null) focus(p.anchor.x, p.anchor.y);
    concepts.renderPins(); }; });
  bindPinButtons(el);
  const b = (id: string) => document.getElementById(id);
  if (b('ch-show')) b('ch-show')!.onclick = () => { showChanges = !showChanges; rebuildChanges(); renderLists(); };
  if (b('ch-save')) b('ch-save')!.onclick = () => save();
  if (b('ch-discard')) b('ch-discard')!.onclick = () => { if (discardArmed) { discardArmed = false; discard(); } else { discardArmed = true; renderLists(); setTimeout(() => { if (discardArmed) { discardArmed = false; renderLists(); } }, 4000); } };
}

function renderUI() { renderTop(); renderTools(); renderBrushbar(); renderPalette(); renderInspect(); renderLists(); info(hover); }

// ---- pictures for Claude (GET /__map/view) ----
hot.on('map:view-request', async (d: { id: number; name: string; opts: Record<string, string> }) => {
  if (d.name !== name || !shown) { hot.send('map:view', { id: d.id, error: `the open editor shows ${name}, not ${d.name}` }); return; }
  const o = d.opts, fig = { on: figure.visible, at: figure.position.clone() };
  if (o.figure) {   // &figure=x,y: the wizard for scale, standing there
    const [fx, fy] = o.figure.split(',').map(Number);
    if (Number.isFinite(fx) && Number.isFinite(fy)) { await loadFigure(); placeFigure(fx, fy); figure.visible = true; }
  }
  const saved = { pos: cam.position.clone(), target: controls.target.clone() }, mk = markers.visible;
  const [tx, ty] = targetCorner();
  const x = o.x != null ? Number(o.x) : tx, y = o.y != null ? Number(o.y) : ty, r = o.r != null ? Number(o.r) : null;
  if (o.cam === 'top') topView(x, y, r ?? span() / G() / 2);
  else if (o.cam === 'game' || o.x != null || o.yaw != null || o.pitch != null) {
    // &yaw= (degrees round the target: 0 from the south, 90 from the east) and &pitch= (elevation; 5 to 10 is near side-on)
    const deg = (v: string | undefined, d: number) => (v != null && Number.isFinite(Number(v)) ? THREE.MathUtils.degToRad(Number(v)) : d);
    gameView(x, y, (r ?? 12) * 2 * G(), Math.min(deg(o.pitch, PITCH), Math.PI / 2 - 0.01), deg(o.yaw, 0));
  }
  markers.visible = true;
  for (const m of markers.children) m.visible = m.userData.pin ? o.pins !== '0' : o.findings !== '0';
  const hb = hoverBox.visible; hoverBox.visible = false;
  sun.position.copy(controls.target).add(new THREE.Vector3(-30, 40, 22)); sun.target.position.copy(controls.target);
  // (the plants' painted blossom and spike sheets load once their material is first drawn: wait for them, or a picture taken
  // soon after a load shows bushes with no flowers)
  // &grow=0..1: every overgrowth at that level (1 choked, 0 cut back) for this picture; &t= seconds: the moving things (smoke, wind) at that time
  const grown = o.grow != null && Number.isFinite(Number(o.grow)) ? overgrowthIds().map((id) => [id, overgrowthLevel(id) ?? 1] as const) : [];
  for (const [id] of grown) setOvergrowth(id, Number(o.grow), 0);
  if (o.t != null && Number.isFinite(Number(o.t))) spinKit(Number(o.t));
  renderer.render(world, cam); await foliageReady();
  renderer.render(world, cam);
  const png = renderer.domElement.toDataURL('image/png');
  for (const [id, lv] of grown) setOvergrowth(id, lv, 0);
  cam.position.copy(saved.pos); controls.target.copy(saved.target); controls.update();
  for (const m of markers.children) m.visible = true;
  markers.visible = mk; hoverBox.visible = hb;
  figure.visible = fig.on; figure.position.copy(fig.at);
  hot.send('map:view', { id: d.id, png });
});

// ---- go ----
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); });
cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
// the hidden viewer page (?viewer=1) draws only when asked for a picture: on a software renderer a big scene takes
// seconds a frame, and a running loop would starve the picture
const viewer = !!q.get('viewer');
const loop = () => {
  if (viewer) return;
  spinKit(performance.now() / 1000);
  if (flashMesh.count && performance.now() > flashUntil) setSquares(flashMesh, []);
  (flashMesh.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.35 * Math.abs(Math.sin(performance.now() / 180));
  sun.position.copy(controls.target).add(new THREE.Vector3(-30, 40, 22)); sun.target.position.copy(controls.target);
  renderer.render(world, cam);
  requestAnimationFrame(loop);
};
loop();
/** For scripted checks (scripts/editor-check.mjs): where a corner (x, y) at height h (m) is on screen, and the state. */
(window as unknown as { __editor: unknown }).__editor = {
  screen: (x: number, y: number, h?: number) => { const v = at3(x, y, h ?? heightAt(x, y)).project(cam); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; },
  state: () => ({ name, rev, tool, sel, brushG, errors: comp?.errors.length, warnings: comp?.warnings.length, pins: pins.length, region, clip: clip && { w: clip.w, h: clip.h, objects: clip.objects.length } }),
  /** Point the game camera at corner (x, y), showing about r corners either side. */
  look: (x: number, y: number, r: number) => gameView(x, y, r * 2 * G()),
  /** The selected thing's handles, on screen. */
  handles: () => handles.children.map((m) => { const v = m.position.clone().project(cam); return { w: m.userData.handle as string, s: [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight] }; }),
};
fetch('/__map/scenes').then((r) => r.json()).then((j: { scenes: { name: string }[] }) => { sceneNames = j.scenes.map((s) => s.name); renderTop(); });
// the kit's pieces: set pieces' sizes for the drawing, and what the Prop tool offers
await fetch('/__map/kit').then((r) => r.json()).then((k: { pieces: Record<string, KitPiece>; styles?: Record<string, Style> }) => {
  setKitPieces(k.pieces); STYLES = k.styles ?? {};
  PIECES = Object.keys(k.pieces).filter((p) => p.startsWith('vignette.') || p.startsWith('setpiece.'));
}).catch(() => undefined);
setTool('select');
await open(name);
