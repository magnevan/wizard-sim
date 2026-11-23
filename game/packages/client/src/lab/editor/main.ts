/**
 * The map editor (editor.html; tools/map-editor/README.md; docs/explorations/2026-11-23-map-editor.md): edits a kit
 * scene (tools/kit/scenes/*.scene.json) in 3D, live, alongside Claude. Every edit is an op sent to the dev server's
 * scene server (map-editor/plugin.ts); every change, ours or Claude's, comes back over Vite's WebSocket as map:update
 * with the compiled scene, which is drawn by lab/kit-render.ts. ?scene=patch-b picks the scene, ?art=0 draws
 * placeholders only, ?viewer=1 hides the panels (the hidden page the server renders Claude's pictures with).
 * Dev only: the build never includes this page.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildKit, disposeKit, groundPlane, loadKitArt, setupStage, yOf, type Inst, type KitData } from '../kit-render';
import type { Obj, Op, Scene, Terrace } from '../../../map-editor/ops';
import type { Compiled, Finding } from '../../../map-editor/compile-worker';
import type { Pin } from '../../../map-editor/store';

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
type Tool = 'select' | 'brush' | 'rect' | 'stair' | 'prop' | 'pin';
let rev = 0, sc: Scene | null = null, comp: Compiled | null = null, shown: KitData | null = null;
let pins: Pin[] = [];
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
const markers = new THREE.Group(); world.add(markers);
const hiGroup = new THREE.Group(); world.add(hiGroup);
const hoverBox = new THREE.BoxHelper(new THREE.Object3D(), 0xffffff);
(hoverBox.material as THREE.LineBasicMaterial).transparent = true; (hoverBox.material as THREE.LineBasicMaterial).opacity = 0.6;
hoverBox.visible = false; world.add(hoverBox);
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
    if (p.status !== 'open') continue;
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
  setSquares(selMesh, []);
  if (!sel || !sc) return highlight(() => false);
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

let flashUntil = 0;
function flash(keys: string[]) {
  if (!sc) return;
  const pts = keys.filter((k) => k.startsWith('c:')).map((k) => { const [x, y] = k.slice(2).split(',').map(Number); return { x, y, h: heightAt(x, y), c: 0xfff1a8, s: 0.9 }; });
  setSquares(flashMesh, pts);
  flashUntil = performance.now() + 2500;
  const ids = new Set(keys.filter((k) => k.startsWith('o:')).map((k) => k.slice(2)));
  if (ids.size && !sel) { highlight((it) => ids.has(it.src ?? '') || ids.has(it.o ?? ''), 0x9fe3ff); setTimeout(highlightSel, 2500); }
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

type Update = { name: string; rev: number; scene: Scene; compiled: Compiled; change: { author: string; label: string; keys: string[] } | null };
function onUpdate(d: Update) {
  if (d.name !== name) return;
  $('err').style.display = 'none';
  rev = d.rev; sc = d.scene; comp = d.compiled;
  if (!terrace(brushG)) brushG = sc.terraces.find((t) => t.edge !== 'wall')?.glyph ?? sc.terraces[0]?.glyph ?? '';
  rebuildKit(); rebuildCorners(); rebuildMarkers(); highlightSel();
  if (!framed && shown) { framed = true; setTimeout(() => { (window as unknown as { __ready: boolean }).__ready = true; }, 300); frameAll(); }
  if (d.change && d.change.author !== 'user') { toast(`${d.change.author === 'claude' ? 'Claude' : d.change.author}: ${d.change.label}`); flash(d.change.keys); }
  renderUI();
  adoptNewTerrace();
}
hot.on('map:update', onUpdate);
hot.on('map:pins', (d: { name: string; pins: Pin[] }) => { if (d.name === name) { pins = d.pins; rebuildMarkers(); renderLists(); } });
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
async function redo() { const r = await call('redo', { name }); if (r?.redone) toast(`Redid: ${r.redone.label}`); }
async function open(n: string) {
  name = n; framed = false; sel = null; shown = null;
  history.replaceState(null, '', `?scene=${n}${q.get('art') === '0' ? '&art=0' : ''}`);
  const p = await call(`pins?name=${n}&status=all`); pins = p?.pins ?? [];
  hot.send('map:hello', { name: n });
}

// ---- cameras ----
const PITCH = THREE.MathUtils.degToRad(46);
function gameView(cx: number, cy: number, viewH = 40) {
  const t = new THREE.Vector3(cx * G(), yOf(heightAt(cx, cy)), cy * G());
  const dist = (viewH * Math.sin(PITCH)) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
  controls.target.copy(t);
  cam.position.copy(t).add(new THREE.Vector3(0, Math.sin(PITCH) * dist, Math.cos(PITCH) * dist));
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
  if (sel.type === 'pin') { const p = pins.find((x) => x.id === (sel as { id: string }).id); return p ? [p.anchor.x, p.anchor.y] : null; }
  if (sel.type === 'obj') {
    const o = sc.objects.find((x) => x.id === (sel as { id: string }).id) as Record<string, unknown> | undefined;
    const pts = [o?.at, o?.centre, ...((o?.head ?? o?.ends ?? []) as unknown[])].filter((p): p is [number, number] => Array.isArray(p));
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

type Drag = { kind: 'paint'; start: [number, number]; last: [number, number]; corners: Map<string, [number, number]>; px: [number, number] }
  | { kind: 'prop'; id: string; start: [number, number]; at: [number, number] } | { kind: 'click'; px: [number, number] };
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
  prop: 'Click to place the prop · Q/E turn it first',
  pin: 'Click anything and write what should change: Claude sees new pins with your next message',
};

const cv = renderer.domElement;
const objOf = (it?: Inst) => (it?.src ? sc?.objects.find((o) => o.id === it.src) : undefined);
// capture: these run before OrbitControls, so a tool can claim the left button
cv.addEventListener('pointerdown', (ev) => {
  if (ev.button !== 0 || !sc) return;
  alt = ev.altKey;
  $('pinbox').style.display = 'none';
  if (tool === 'select') {
    const h = pick(ev), o = h?.inst != null && shown ? objOf(shown.instances[h.inst]) : undefined;
    if (o?.kind === 'vignette' && !ev.shiftKey) {
      controls.enabled = false; sel = { type: 'obj', id: o.id }; highlightSel(); renderInspect();
      drag = { kind: 'prop', id: o.id, start: o.at as [number, number], at: o.at as [number, number] };
      cv.setPointerCapture(ev.pointerId);
    } else drag = { kind: 'click', px: [ev.clientX, ev.clientY] };   // a click selects; a drag orbits (OrbitControls)
    return;
  }
  controls.enabled = false;
  const c = groundAt(ev);
  if (!c) return;
  if (tool === 'prop') { apply([{ op: 'add', kind: 'vignette', piece: propPiece, at: [Math.round(c[0] * 2) / 2, Math.round(c[1] * 2) / 2], front: propFront }], `place ${propPiece.replace('vignette.', '')}`); return; }
  if (tool === 'pin') { ev.preventDefault(); const h = pick(ev); if (h) openPinBox(ev, h); return; }
  drag = { kind: 'paint', start: c, last: c, corners: new Map(), px: [ev.clientX, ev.clientY] };
  cv.setPointerCapture(ev.pointerId);
  updatePreview(ev);
}, { capture: true });
cv.addEventListener('pointermove', (ev) => {
  alt = ev.altKey;
  if (!drag || drag.kind === 'click') {
    hover = pick(ev); info(hover);
    const g = tool === 'select' && hover?.inst != null && kit ? kit.children.find((o) => o.userData.inst === hover!.inst) : null;
    if (g) { hoverBox.setFromObject(g); hoverBox.visible = true; } else hoverBox.visible = false;
  }
  if (tool !== 'select' && tool !== 'pin' || drag?.kind === 'prop') updatePreview(ev);
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
  const end = groundAt(ev) ?? d.last, moved = Math.hypot(ev.clientX - d.px[0], ev.clientY - d.px[1]) > 6;
  if (tool === 'brush' && d.corners.size) {
    completeSaddles(d.corners, brushG);
    apply([{ op: 'paint', terrace: brushG, at: [...d.corners.values()] }], `paint ${terrace(brushG)?.name ?? brushG}`);
  }
  if (tool === 'rect' && moved) {
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
  const box = $('pinbox'), ta = box.querySelector('textarea')!;
  box.style.display = 'block';
  box.style.left = `${Math.min(innerWidth - 290, ev.clientX + 12)}px`; box.style.top = `${Math.min(innerHeight - 110, ev.clientY + 12)}px`;
  ta.value = ''; ta.focus(); requestAnimationFrame(() => ta.focus());   // again after the click, which can take the focus back
}
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
const TOOLKEY: Record<string, Tool> = { v: 'select', b: 'brush', r: 'rect', s: 'stair', p: 'prop', n: 'pin' };
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
  if (k === '?' || k === 'h') { $('keys').style.display = $('keys').style.display === 'block' ? 'none' : 'block'; return; }
  if (k === 'i' && hoverCorner && sc) { const [x, y] = hoverCorner.map(Math.round); if (inMap(x, y)) { brushG = sc.corners[y][x]; renderPalette(); renderBrushbar(); toast(`Brush: ${terrace(brushG)?.name}`); } return; }
  if (k === 'escape') { sel = null; $('keys').style.display = 'none'; highlightSel(); renderInspect(); return; }
  if (k === 'q' || k === 'e') {
    const d = k === 'e' ? 1 : 3;
    if (sel?.type === 'obj') { const o = sc?.objects.find((x) => x.id === (sel as { id: string }).id); if (o?.kind === 'vignette') apply([{ op: 'set', id: o.id, front: FRONTS[(FRONTS.indexOf(String(o.front ?? 'S')) + d) % 4] }], 'turn a prop'); }
    else { propFront = FRONTS[(FRONTS.indexOf(propFront) + d) % 4]; renderBrushbar(); }
    return;
  }
  if ((k === 'delete' || k === 'backspace') && sel?.type === 'obj') { apply([{ op: 'remove', id: sel.id }], `remove ${sel.id}`); sel = null; renderInspect(); return; }
  if (k.startsWith('arrow') && sel?.type === 'obj') {
    e.preventDefault();
    const o = sc?.objects.find((x) => x.id === (sel as { id: string }).id), dir = arrowStep(k); if (!o || !dir) return;
    const step = o.kind === 'vignette' && !e.shiftKey ? 0.5 : 1;
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
  tool = t; drag = null; setSquares(preview, []); hoverBox.visible = false;
  controls.mouseButtons = { LEFT: t === 'select' ? THREE.MOUSE.ROTATE : (null as unknown as THREE.MOUSE), MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
  rebuildCorners(); renderTools(); renderBrushbar(); info(hover);
}
/** True while the user is typing in a panel: an update mustn't redraw it under their cursor. */
const typingIn = (id: string) => { const a = document.activeElement as HTMLElement | null; return !!a && $(id).contains(a) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName); };

let sceneNames: string[] = [];
function renderStatus() {
  const el = document.getElementById('status');
  if (el) el.textContent = pending ? 'saving…' : `saved · rev ${rev}`;
}
function renderTop() {
  if (typingIn('top')) return;
  const c = comp, errs = c?.errors.length ?? 0, warns = c?.warnings.length ?? 0;
  $('top').innerHTML = `
    <b style="font-size:15px">Map editor</b>
    <select id="scene">${sceneNames.map((n) => `<option ${n === name ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
    <button id="b-new" title="A new scene: blank, or a copy of this one">New…</button>
    <span class="chip" id="status"></span>
    ${errs ? `<span class="chip err">${errs} error${errs > 1 ? 's' : ''}</span>` : '<span class="chip ok">✓ compiles</span>'}
    ${warns ? `<span class="chip warn">${warns} warning${warns > 1 ? 's' : ''}</span>` : ''}
    <span class="chip" title="pieces · compile time">${c ? Object.values(c.pieces).reduce((a, b) => a + b, 0) : 0} pieces · ${c?.ms ?? '?'} ms</span>
    <span class="grow"></span>
    <button id="b-top" title="Look straight down (T)">Top</button><button id="b-game" title="The game's camera (G)">Game</button>
    <button id="b-corners" title="Show every corner's terrace (C)">${cornersOn ? '◉' : '○'} Corners</button>
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
  $('b-undo').onclick = () => undo();
  $('b-redo').onclick = () => redo();
  $('b-top').onclick = () => dispatchEvent(new KeyboardEvent('keydown', { key: 't' }));
  $('b-game').onclick = () => dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }));
  $('b-keys').onclick = () => dispatchEvent(new KeyboardEvent('keydown', { key: '?' }));
  $('b-corners').onclick = () => { cornersOn = !cornersOn; rebuildCorners(); renderTop(); };
}

const TOOLS: [Tool, string, string, string][] = [
  ['select', '', 'Select and inspect', 'V'], ['brush', 'brush', 'Paint terraces', 'B'], ['rect', 'rect', 'Paint a rectangle', 'R'],
  ['stair', 'stair', 'Add a stair', 'S'], ['prop', 'prop', 'Place a prop', 'P'], ['pin', 'pin', 'Pin a note for Claude', 'N'],
];
function renderTools() {
  $('tools').innerHTML = TOOLS.map(([t, ic, title, key]) => `<button data-t="${t}" class="${tool === t ? 'on' : ''}" title="${title} (${key})">${ic ? `<img src="${icon(ic)}">` : '<span>↖</span>'}<kbd>${key}</kbd></button>`).join('');
  $('tools').querySelectorAll('button').forEach((b) => { b.onclick = () => setTool((b as HTMLElement).dataset.t as Tool); });
}

const PIECES = ['vignette.lamp', 'vignette.bench-planter'];
function renderBrushbar() {
  const bar = $('brushbar'), t = terrace(brushG);
  bar.style.display = tool === 'select' || tool === 'pin' ? 'none' : 'flex';
  if (tool === 'brush' || tool === 'rect') bar.innerHTML = `Painting <b>${esc(t?.name ?? brushG)}</b> (${t?.h ?? 0} m)${tool === 'brush' ? ` · brush ${brushN} cell${brushN > 1 ? 's' : ''} <button class="btn" id="bs-">−</button><button class="btn" id="bs+">+</button> · Alt: one corner` : ' · drag over the cells'}`;
  if (tool === 'stair') bar.innerHTML = 'Drag along an edge between two levels: the stair runs down from there';
  if (tool === 'prop') bar.innerHTML = `<select id="piece" class="btn">${PIECES.map((p) => `<option ${p === propPiece ? 'selected' : ''} value="${p}">${p.replace('vignette.', '')}</option>`).join('')}</select> facing <span class="seg">${FRONTS.map((f) => `<button data-f="${f}" class="${f === propFront ? 'on' : ''}">${f}</button>`).join('')}</span>`;
  const m = document.getElementById('bs-'), p = document.getElementById('bs+');
  if (m) m.onclick = () => { brushN = Math.max(1, brushN - 1); renderBrushbar(); };
  if (p) p.onclick = () => { brushN = Math.min(12, brushN + 1); renderBrushbar(); };
  const ps = document.getElementById('piece') as HTMLSelectElement | null; if (ps) ps.onchange = () => { propPiece = ps.value; };
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

const MATS = ['paving', 'plaza', 'road', 'lawn', 'roof', 'rock'], EDGES = ['parapet', 'retain', 'wall', 'open'];
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
      <div class="row"><label>Floor</label><select id="t-mat">${MATS.map((m) => `<option ${m === t.mat ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
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
    el.innerHTML = `<h3>${esc(o.kind === 'flight' ? 'stair' : o.kind === 'vignette' ? 'prop' : o.kind)} · ${esc(o.id)}</h3>
      <div class="row"><label>Name</label><input id="o-name" value="${esc(o.name)}"></div>${fields}
      ${o.kind === 'vignette' ? `<div class="row"><label>Facing</label><span class="seg">${FRONTS.map((f) => `<button data-f="${f}" class="${f === o.front ? 'on' : ''}">${f}</button>`).join('')}</span></div>` : ''}
      ${o.kind === 'flight' ? '<div class="row"><label>Width</label><button class="btn" id="o-narrow">−1 cell</button><button class="btn" id="o-widen">+1 cell</button></div>' : ''}
      <div class="row"><button class="btn" id="o-del">Delete</button><span class="meta">${o.kind === 'vignette' ? 'Drag it, or arrows; Q/E turn it' : 'Arrows move it'}</span></div>`;
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
    <div class="meta">(${p.anchor.x}, ${p.anchor.y})${p.anchor.obj ? ` · ${esc(p.anchor.obj)}` : ''}${p.anchor.inst ? ` · ${esc(p.anchor.inst.p)}` : ''} · ${p.status}${p.outcome ? `: ${p.outcome}` : ''}${p.status === 'open' ? (p.seen ? ' · Claude has seen it' : ' · new') : ''}</div>
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
  el.innerHTML = `<h3>Problems (${fs.length})</h3>
    ${fs.map((f, i) => `<div class="item ${f.severity === 'error' ? 'err' : 'warn'}" data-f="${i}">${esc(named(f.msg))}${f.more ? `<div class="meta">and ${f.more} broken run${f.more > 1 ? 's' : ''} beside it</div>` : ''}<div class="meta">${f.code}${f.at ? ` · (${f.at[0]}, ${f.at[1]})` : ''}</div></div>`).join('') || '<div class="meta">None.</div>'}
    <h3 style="margin-top:12px">Pins (${open.length} open)</h3>
    ${open.map(pinHtml).join('') || '<div class="meta">Pin a note on anything (N); Claude sees new pins with your next message in the terminal.</div>'}
    ${done.length ? `<div class="meta" style="margin-top:8px">Recently resolved</div>${done.map(pinHtml).join('')}` : ''}`;
  el.querySelectorAll<HTMLElement>('[data-f]').forEach((d) => { d.onclick = () => { const f = fs[Number(d.dataset.f)]; if (f.at) focus(f.at[0], f.at[1], 20); if (f.refs[0] && sc?.objects.some((o) => o.id === f.refs[0])) { sel = { type: 'obj', id: f.refs[0] }; highlightSel(); renderInspect(); } }; });
  el.querySelectorAll<HTMLElement>('[data-pin]').forEach((d) => { d.onclick = () => { const p = pins.find((x) => x.id === d.dataset.pin); if (p) { focus(p.anchor.x, p.anchor.y); sel = { type: 'pin', id: p.id }; renderInspect(); } }; });
  bindPinButtons(el);
}

function renderUI() { renderTop(); renderTools(); renderBrushbar(); renderPalette(); renderInspect(); renderLists(); info(hover); }

// ---- pictures for Claude (GET /__map/view) ----
hot.on('map:view-request', (d: { id: number; name: string; opts: Record<string, string> }) => {
  if (d.name !== name || !shown) { hot.send('map:view', { id: d.id, error: `the open editor shows ${name}, not ${d.name}` }); return; }
  const o = d.opts, saved = { pos: cam.position.clone(), target: controls.target.clone() }, mk = markers.visible;
  const [tx, ty] = targetCorner();
  const x = o.x != null ? Number(o.x) : tx, y = o.y != null ? Number(o.y) : ty, r = o.r != null ? Number(o.r) : null;
  if (o.cam === 'top') topView(x, y, r ?? span() / G() / 2);
  else if (o.cam === 'game' || o.x != null) gameView(x, y, (r ?? 12) * 2 * G());
  markers.visible = true;
  for (const m of markers.children) m.visible = m.userData.pin ? o.pins !== '0' : o.findings !== '0';
  const hb = hoverBox.visible; hoverBox.visible = false;
  sun.position.copy(controls.target).add(new THREE.Vector3(-30, 40, 22)); sun.target.position.copy(controls.target);
  renderer.render(world, cam);
  const png = renderer.domElement.toDataURL('image/png');
  cam.position.copy(saved.pos); controls.target.copy(saved.target); controls.update();
  for (const m of markers.children) m.visible = true;
  markers.visible = mk; hoverBox.visible = hb;
  hot.send('map:view', { id: d.id, png });
});

// ---- go ----
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); });
cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
const loop = () => {
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
  state: () => ({ name, rev, tool, sel, brushG, errors: comp?.errors.length, warnings: comp?.warnings.length, pins: pins.length }),
};
fetch('/__map/scenes').then((r) => r.json()).then((j: { scenes: { name: string }[] }) => { sceneNames = j.scenes.map((s) => s.name); renderTop(); });
setTool('select');
await open(name);
