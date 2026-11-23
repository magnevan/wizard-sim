/**
 * The map editor (editor.html; tools/map-editor/README.md; docs/explorations/2026-11-23-map-editor.md): edits a kit
 * scene (tools/kit/scenes/*.scene.json) in 3D, live, alongside Claude. Every edit is an op sent to the dev server's
 * scene server (map-editor/plugin.ts); every change, ours or Claude's, comes back over Vite's WebSocket as map:update
 * with the compiled scene, which is drawn by lab/kit-render.ts. ?scene=patch-b picks the scene, ?art=0 draws
 * placeholders only. Dev only: the build never includes this page.
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
if (q.get('viewer')) document.body.classList.add('viewer');   // the hidden page the server opens for Claude's pictures

// ---- three ----
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
const world = new THREE.Scene();
const sun = setupStage(renderer, world);
const cam = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.5, 900);
const controls = new OrbitControls(cam, renderer.domElement);
controls.mouseButtons = { LEFT: null as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
controls.screenSpacePanning = false;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
if (q.get('art') !== '0') await loadKitArt();

// ---- state ----
type Sel = { type: 'edge'; e: [number, number] } | { type: 'obj'; id: string } | { type: 'terrace'; id: string } | { type: 'pin'; id: string } | null;
type Tool = 'select' | 'brush' | 'rect' | 'stair' | 'prop' | 'pin';
let rev = 0, sc: Scene | null = null, comp: Compiled | null = null, shown: KitData | null = null;
let pins: Pin[] = [];
let sel: Sel = null, tool: Tool = 'select';
let brushG = '', brushN = 1, cornersOn = false;
let propPiece = 'vignette.lamp', propFront = 'S';
let kit: THREE.Group | null = null, ground: THREE.Mesh | null = null;
let framed = false;
const G = () => sc?.G ?? 2;

const PALETTE = [0xd9a56f, 0x7d9bc4, 0x8fbf7a, 0xc98aa8, 0xe0c35c, 0x6fb8b0, 0xb48b6a, 0x9b8fd1, 0xd8735b, 0x8a9a5b, 0x5d7fa3, 0xc2b8a3];
const colorOf = (g: string) => PALETTE[Math.max(0, sc?.terraces.findIndex((t) => t.glyph === g) ?? 0) % PALETTE.length];
const terrace = (g: string) => sc?.terraces.find((t) => t.glyph === g);
const heightAt = (x: number, y: number) => {
  const r = sc?.corners[Math.max(0, Math.min(sc.corners.length - 1, Math.round(y)))];
  return terrace(r?.[Math.max(0, Math.min(r.length - 1, Math.round(x)))] ?? '')?.h ?? 0;
};
const at3 = (x: number, y: number, hm: number) => new THREE.Vector3(x * G(), yOf(hm), y * G());

// ---- layers: corners, brush preview, markers, highlights ----
const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
function instanced(n: number, opacity: number) {
  const m = new THREE.InstancedMesh(flat, new THREE.MeshBasicMaterial({ transparent: opacity < 1, opacity, depthWrite: false }), n);
  m.count = 0; m.frustumCulled = false; m.renderOrder = 5;
  world.add(m);
  return m;
}
let cornerMesh = instanced(1, 0.9);
const preview = instanced(4000, 0.75);
const flashMesh = instanced(4000, 0.8);
const markers = new THREE.Group(); world.add(markers);
const hiGroup = new THREE.Group(); world.add(hiGroup);
const stairLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x4a5a7a, linewidth: 2 }));
stairLine.visible = false; world.add(stairLine);
const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color();

function setSquares(mesh: THREE.InstancedMesh, pts: { x: number; y: number; h: number; c: number; s?: number }[]) {
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

function rebuildCorners() {
  if (!sc) return;
  const pts = [];
  for (let y = 0; y < sc.corners.length; y++) for (let x = 0; x < sc.corners[y].length; x++) {
    const g = sc.corners[y][x]; pts.push({ x, y, h: terrace(g)?.h ?? 0, c: colorOf(g), s: 0.32 });
  }
  if (cornerMesh.instanceMatrix.count < pts.length) { world.remove(cornerMesh); cornerMesh = instanced(pts.length, 0.9); }
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

let showMarkers = true;
function rebuildMarkers() {
  markers.children.forEach((o) => ((o as THREE.Sprite).material as THREE.SpriteMaterial).map?.dispose());
  markers.clear();
  for (const f of comp?.findings ?? []) {
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

/** Outline the pieces that came from a source (an object or terrace id, or an edge midpoint). */
function highlight(match: (it: Inst) => boolean, color = 0xffe08a) {
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
  if (!sel) return highlight(() => false);
  if (sel.type === 'edge') return highlight((it) => near(it.e, (sel as { e: [number, number] }).e));
  if (sel.type === 'obj' || sel.type === 'terrace') { const id = sel.id; return highlight((it) => it.src === id || it.o === id); }
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
  world.add(ground, kit);
}

type Update = { name: string; rev: number; scene: Scene; compiled: Compiled; change: { author: string; label: string; keys: string[] } | null };
function onUpdate(d: Update) {
  if (d.name !== name) return;
  rev = d.rev; sc = d.scene; comp = d.compiled;
  if (!terrace(brushG)) brushG = sc.terraces.find((t) => t.edge !== 'wall')?.glyph ?? sc.terraces[0]?.glyph ?? '';
  rebuildKit(); rebuildCorners(); rebuildMarkers(); highlightSel();
  if (!framed && shown) { framed = true; setTimeout(() => { (window as unknown as { __ready: boolean }).__ready = true; }, 300); gameView(shown.size[0] / 2 / G(), shown.size[1] / 2 / G(), Math.max(shown.size[0], shown.size[1]) * 1.15); }
  if (d.change && d.change.author !== 'user') { toast(`${d.change.author === 'claude' ? 'Claude' : d.change.author}: ${d.change.label}`); flash(d.change.keys); }
  renderUI();
}
hot.on('map:update', onUpdate);
hot.on('map:pins', (d: { name: string; pins: Pin[] }) => { if (d.name === name) { pins = d.pins; rebuildMarkers(); renderLists(); } });
hot.on('map:error', (d: { name: string; error: string }) => { if (d.name === name) { $('err').style.display = 'flex'; $('err').textContent = d.error; } });

async function call(path: string, body?: unknown) {
  const r = await fetch(`/__map/${path}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) toast(j.error ?? `${path} failed`, true);
  return r.ok ? j : null;
}
const apply = (ops: Op[], label: string) => call('apply', { name, ops, author: 'user', label });
const pinOp = (b: Record<string, unknown>) => call('pins', { name, ...b });
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
function focus(x: number, y: number) {
  const off = cam.position.clone().sub(controls.target);
  controls.target.copy(at3(x, y, heightAt(x, y)));
  cam.position.copy(controls.target).add(off); controls.update();
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
/** Where the ray meets the level plane at height y (u), in corners. */
function onPlane(ev: { clientX: number; clientY: number }, y: number): [number, number] | null {
  castFrom(ev);
  const p = new THREE.Vector3();
  return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), p) ? [p.x / G(), p.z / G()] : null;
}

// ---- tools ----
const inMap = (x: number, y: number) => !!sc && y >= 0 && y < sc.corners.length && x >= 0 && x < sc.corners[0].length;
let alt = false;
function brushCorners(cx: number, cy: number): [number, number][] {
  if (alt) return inMap(Math.round(cx), Math.round(cy)) ? [[Math.round(cx), Math.round(cy)]] : [];
  // the cell under the cursor (and its neighbours for a bigger brush): all its corners
  const x0 = Math.floor(cx) - Math.floor((brushN - 1) / 2), y0 = Math.floor(cy) - Math.floor((brushN - 1) / 2), out: [number, number][] = [];
  for (let y = y0; y <= y0 + brushN; y++) for (let x = x0; x <= x0 + brushN; x++) if (inMap(x, y)) out.push([x, y]);
  return out;
}
const rectCorners = (a: [number, number], b: [number, number]): [number, number][] => {
  const out: [number, number][] = [];
  const [x0, x1] = [Math.round(Math.min(a[0], b[0])), Math.round(Math.max(a[0], b[0]))], [y0, y1] = [Math.round(Math.min(a[1], b[1])), Math.round(Math.max(a[1], b[1]))];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inMap(x, y)) out.push([x, y]);
  return out;
};
/** A flight's head from a drag: along the row or column line (a half-coordinate) nearest the drag, whole corners at its ends. */
function stairHead(a: [number, number], b: [number, number]): [[number, number], [number, number]] | null {
  const horiz = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
  if (horiz) {
    const yl = Math.floor((a[1] + b[1]) / 2) + 0.5, x0 = Math.round(Math.min(a[0], b[0])), x1 = Math.round(Math.max(a[0], b[0]));
    return x1 - x0 >= 1 ? [[x0, yl], [x1, yl]] : null;
  }
  const xl = Math.floor((a[0] + b[0]) / 2) + 0.5, y0 = Math.round(Math.min(a[1], b[1])), y1 = Math.round(Math.max(a[1], b[1]));
  return y1 - y0 >= 1 ? [[xl, y0], [xl, y1]] : null;
}

let drag: { planeY: number; start: [number, number]; corners: Map<string, [number, number]> } | null = null;
let hover: Hit | null = null, hoverCorner: [number, number] | null = null;

function updatePreview(ev: PointerEvent) {
  if (!sc) return;
  const c = drag ? onPlane(ev, drag.planeY) : hover ? [hover.point.x / G(), hover.point.z / G()] as [number, number] : null;
  hoverCorner = c;
  stairLine.visible = false;
  let pts: [number, number][] = [];
  if (tool === 'brush' && c) { pts = brushCorners(c[0], c[1]); if (drag) for (const p of pts) drag.corners.set(p.join(), p); if (drag) pts = [...drag.corners.values()]; }
  if (tool === 'rect' && c) pts = drag ? rectCorners(drag.start, c) : brushCorners(c[0], c[1]).slice(0, 1);
  if (tool === 'stair' && drag && c) {
    const h = stairHead(drag.start, c);
    if (h) { const y = drag.planeY + 0.1; stairLine.geometry.setFromPoints([new THREE.Vector3(h[0][0] * G(), y, h[0][1] * G()), new THREE.Vector3(h[1][0] * G(), y, h[1][1] * G())]); stairLine.visible = true; }
  }
  const t = terrace(brushG);
  setSquares(preview, pts.map(([x, y]) => ({ x, y, h: Math.max(heightAt(x, y), t?.h ?? 0), c: colorOf(brushG), s: 0.7 })));
}

function info(h: Hit | null) {
  const el = $('help');
  if (!h || !sc) { el.textContent = HELP[tool]; return; }
  const x = h.point.x / G(), y = h.point.z / G(), cx = Math.round(x), cy = Math.round(y);
  const t = inMap(cx, cy) ? terrace(sc.corners[cy][cx]) : null;
  let s = `corner (${cx}, ${cy})${t ? ` · ${t.name ?? t.id} ${t.h} m` : ''}`;
  if (h.inst != null && shown) { const it = shown.instances[h.inst]; s += ` · ${it.p}${it.v ? ` (${it.v})` : ''}${it.src ? ` from ${it.src}` : ''}`; }
  if (h.pin) s += ` · pin ${h.pin}`;
  if (h.finding) s += ` · ${h.finding.msg}`;
  el.textContent = `${s}   —   ${HELP[tool]}`;
}
const HELP: Record<Tool, string> = {
  select: 'Click a piece, floor, pin or marker to inspect it · Delete removes · arrows move · Q/E turn',
  brush: 'Drag to paint the chosen terrace · [ ] brush size · Alt: one corner · I picks the terrace under the cursor',
  rect: 'Drag a rectangle of corners to paint',
  stair: 'Drag along a terrace edge where the stair should start (its head); it runs down to the lower side',
  prop: 'Click to place the prop · Q/E turn before placing',
  pin: 'Click anything and write what should change: Claude sees new pins with your next message',
};

const cv = renderer.domElement;
cv.addEventListener('pointerdown', (ev) => {
  if (ev.button !== 0 || !sc) return;
  alt = ev.altKey;
  const h = pick(ev);
  if (tool === 'select') { select(h); return; }
  if (!h) return;
  const c: [number, number] = [h.point.x / G(), h.point.z / G()];
  if (tool === 'prop') { const at = [Math.round(c[0] * 2) / 2, Math.round(c[1] * 2) / 2]; apply([{ op: 'add', kind: 'vignette', piece: propPiece, at, front: propFront }], `place ${propPiece.replace('vignette.', '')}`); return; }
  if (tool === 'pin') { ev.preventDefault(); openPinBox(ev, h); return; }
  drag = { planeY: h.point.y, start: c, corners: new Map() };
  cv.setPointerCapture(ev.pointerId);
  updatePreview(ev);
});
cv.addEventListener('pointermove', (ev) => {
  alt = ev.altKey;
  if (!drag) { hover = pick(ev); info(hover); }
  if (tool !== 'select' && tool !== 'pin' && tool !== 'prop') updatePreview(ev);
});
cv.addEventListener('pointerup', (ev) => {
  if (!drag || !sc) return;
  const d = drag; drag = null;
  const end = onPlane(ev, d.planeY) ?? d.start;
  if (tool === 'brush' && d.corners.size) apply([{ op: 'paint', terrace: brushG, at: [...d.corners.values()] }], `paint ${terrace(brushG)?.name ?? brushG}`);
  if (tool === 'rect') { const pts = rectCorners(d.start, end); if (pts.length) apply([{ op: 'paint', terrace: brushG, rect: [...pts[0], ...pts[pts.length - 1]] }], `paint ${terrace(brushG)?.name ?? brushG}`); }
  if (tool === 'stair') {
    const head = stairHead(d.start, end);
    if (head) apply([{ op: 'add', kind: 'flight', name: 'a stair', head }], 'add a stair'); else toast('Drag along the edge, at least one cell wide', true);
  }
  setSquares(preview, []); stairLine.visible = false;
});

function select(h: Hit | null) {
  if (!h || !sc) { sel = null; }
  else if (h.pin) sel = { type: 'pin', id: h.pin };
  else if (h.finding) { sel = null; focus(h.finding.at![0], h.finding.at![1]); }
  else if (h.inst != null && shown) {
    const it = shown.instances[h.inst];
    if (it.e && it.p.startsWith('edge.')) sel = { type: 'edge', e: it.e };
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
addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); call(e.shiftKey ? 'redo' : 'undo', { name }); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); call('redo', { name }); return; }
  if (e.ctrlKey || e.metaKey) return;
  if (TOOLKEY[k]) { setTool(TOOLKEY[k]); return; }
  if (k >= '1' && k <= '9' && sc?.terraces[Number(k) - 1]) { brushG = sc.terraces[Number(k) - 1].glyph; renderPalette(); return; }
  if (k === '[') { brushN = Math.max(1, brushN - 1); renderBrushbar(); return; }
  if (k === ']') { brushN = Math.min(12, brushN + 1); renderBrushbar(); return; }
  if (k === 't') { const [x, y] = targetCorner(); topView(x, y, shown ? Math.max(shown.size[0], shown.size[1]) / G() / 2 : 20); return; }
  if (k === 'g') { const [x, y] = targetCorner(); gameView(x, y, shown ? Math.max(shown.size[0], shown.size[1]) * 0.6 : 40); return; }
  if (k === 'c') { cornersOn = !cornersOn; rebuildCorners(); return; }
  if (k === 'm') { showMarkers = !showMarkers; markers.visible = showMarkers; return; }
  if (k === 'i' && hoverCorner && sc) { const [x, y] = hoverCorner.map(Math.round); if (inMap(x, y)) { brushG = sc.corners[y][x]; renderPalette(); toast(`Brush: ${terrace(brushG)?.name}`); } return; }
  if (k === 'escape') { sel = null; highlightSel(); renderInspect(); return; }
  if ((k === 'q' || k === 'e')) {
    const d = k === 'e' ? 1 : 3;
    if (sel?.type === 'obj') { const o = sc?.objects.find((x) => x.id === (sel as { id: string }).id); if (o?.kind === 'vignette') apply([{ op: 'set', id: o.id, front: FRONTS[(FRONTS.indexOf(String(o.front ?? 'S')) + d) % 4] }], 'turn a prop'); }
    else { propFront = FRONTS[(FRONTS.indexOf(propFront) + d) % 4]; renderBrushbar(); }
    return;
  }
  if ((k === 'delete' || k === 'backspace') && sel?.type === 'obj') { apply([{ op: 'remove', id: sel.id }], `remove ${sel.id}`); sel = null; renderInspect(); return; }
  if (k.startsWith('arrow') && sel?.type === 'obj') {
    e.preventDefault();
    const o = sc?.objects.find((x) => x.id === (sel as { id: string }).id); if (!o) return;
    const step = o.kind === 'vignette' && !e.shiftKey ? 0.5 : 1;
    const by = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] }[k];
    if (by) apply([{ op: 'move', id: o.id, by }], `move ${o.id}`);
  }
});

// ---- UI ----
let toastT = 0;
function toast(msg: string, bad = false) {
  const t = $('toast'); t.textContent = msg; t.style.background = bad ? '#c4493b' : '#4a5a7a'; t.style.opacity = '1';
  clearTimeout(toastT); toastT = window.setTimeout(() => { t.style.opacity = '0'; }, bad ? 4500 : 2800);
}
function setTool(t: Tool) {
  tool = t; drag = null; setSquares(preview, []); stairLine.visible = false;
  rebuildCorners(); renderTools(); renderBrushbar(); info(hover);
}

let sceneNames: string[] = [];
function renderTop() {
  const c = comp, errs = c?.errors.length ?? 0, warns = c?.warnings.length ?? 0;
  $('top').innerHTML = `
    <b style="font-size:15px">Map editor</b>
    <select id="scene">${sceneNames.map((n) => `<option ${n === name ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
    <button id="b-new" title="A new scene: blank, or a copy of this one">New…</button>
    <span class="chip">rev ${rev}</span>
    ${errs ? `<span class="chip err">${errs} error${errs > 1 ? 's' : ''}</span>` : '<span class="chip ok">✓ compiles</span>'}
    ${warns ? `<span class="chip warn">${warns} warning${warns > 1 ? 's' : ''}</span>` : ''}
    <span class="chip" title="pieces · compile time">${c ? Object.values(c.pieces).reduce((a, b) => a + b, 0) : 0} pieces · ${c?.ms ?? '?'} ms</span>
    <span class="grow"></span>
    <button id="b-top" title="Top view (T)">Top</button><button id="b-game" title="Game camera (G)">Game</button>
    <button id="b-corners" title="Show corners (C)">${cornersOn ? '◉' : '○'} Corners</button>
    <button id="b-undo" title="Undo (Ctrl+Z)"><img src="${icon('undo')}" width="18"></button>
    <button id="b-redo" title="Redo (Ctrl+Y)"><img src="${icon('redo')}" width="18"></button>`;
  $<HTMLSelectElement>('scene').onchange = (e) => open((e.target as HTMLSelectElement).value);
  $('b-new').onclick = () => {
    $('b-new').outerHTML = `<span id="newform"><input id="nf-name" placeholder="name, e.g. courtyard" style="width:150px" class="btn">
      <input id="nf-w" type="number" value="24" style="width:52px" class="btn" title="cells across">×<input id="nf-h" type="number" value="16" style="width:52px" class="btn" title="cells down">
      <button class="btn" id="nf-blank">Blank</button><button class="btn" id="nf-copy">Copy ${esc(name)}</button><button class="btn" id="nf-x">✕</button></span>`;
    const make = async (from?: string) => {
      const n = $<HTMLInputElement>('nf-name').value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
      const r = await call('new', { name: n, w: Number($<HTMLInputElement>('nf-w').value), h: Number($<HTMLInputElement>('nf-h').value), from });
      if (r) { sceneNames = [...new Set([...sceneNames, n])].sort(); await open(n); }
    };
    $('nf-blank').onclick = () => make(); $('nf-copy').onclick = () => make(name); $('nf-x').onclick = () => renderTop();
    $('nf-name').focus();
  };
  $('b-undo').onclick = () => call('undo', { name });
  $('b-redo').onclick = () => call('redo', { name });
  $('b-top').onclick = () => dispatchEvent(new KeyboardEvent('keydown', { key: 't' }));
  $('b-game').onclick = () => dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }));
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
  if (tool === 'brush' || tool === 'rect') bar.innerHTML = `Painting <b>${esc(t?.name ?? brushG)}</b>${tool === 'brush' ? ` · brush ${brushN} cell${brushN > 1 ? 's' : ''} <button class="btn" id="bs-">−</button><button class="btn" id="bs+">+</button> · Alt: one corner` : ''}`;
  if (tool === 'stair') bar.innerHTML = 'Drag along an edge: the stair runs down from there to the lower terrace';
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
  $('palette').innerHTML = sc.terraces.map((t, i) => `<div class="sw ${t.glyph === brushG ? 'on' : ''}" data-g="${esc(t.glyph)}" title="${esc(t.id)} · glyph ${esc(t.glyph)} · edge ${esc(t.edge)}${t.walk === false ? ' · not walkable' : ''} — double-click to edit">
      <i style="background:${hex(colorOf(t.glyph))}"></i><div><div class="n">${i < 9 ? `<span class="meta">${i + 1}</span> ` : ''}${esc(t.name ?? t.id)}</div><div class="h">${t.h} m · ${esc(t.edge ?? 'retain')}</div></div></div>`).join('')
    + '<div class="sw add" title="Add a terrace">+</div>';
  $('palette').querySelectorAll<HTMLElement>('.sw[data-g]').forEach((el) => {
    el.onclick = () => { brushG = el.dataset.g!; if (tool === 'select' || tool === 'pin' || tool === 'stair' || tool === 'prop') setTool('brush'); renderPalette(); renderBrushbar(); };
    el.ondblclick = () => { const t = terrace(el.dataset.g!); if (t) { sel = { type: 'terrace', id: t.id }; highlightSel(); renderInspect(); } };
  });
  ($('palette').querySelector('.sw.add') as HTMLElement).onclick = async () => {
    const top = Math.max(...sc!.terraces.filter((t) => t.edge !== 'wall').map((t) => t.h));
    const r = await apply([{ op: 'add_terrace', name: 'a new terrace', h: Math.round((top + 1) * 100) / 100, mat: 'paving', edge: 'parapet' }], 'add a terrace');
    if (r?.minted?.[0]) { sel = { type: 'terrace', id: r.minted[0] }; }
  };
}

const MATS = ['paving', 'plaza', 'road', 'lawn', 'roof', 'rock'], EDGES = ['parapet', 'retain', 'wall', 'open'];
const VARIANTS: Record<string, string[]> = { wall: ['plain', 'window', 'door'], parapet: ['plain', 'niche'], retain: ['plain', 'niche'] };
function renderInspect() {
  const el = $('inspect');
  if (!sc || !sel) { el.innerHTML = '<h3>Inspector</h3><div class="meta">Select a piece, a floor or a pin (V). Wall sections can be set to plain, window or door here.</div>'; return; }
  if (sel.type === 'terrace') {
    const t = sc.terraces.find((x) => x.id === (sel as { id: string }).id);
    if (!t) { el.innerHTML = ''; return; }
    el.innerHTML = `<h3>Terrace · ${esc(t.id)}</h3>
      <div class="row"><label>Name</label><input id="t-name" value="${esc(t.name)}"></div>
      <div class="row"><label>Height</label><input id="t-h" type="number" step="0.05" value="${t.h}"> m</div>
      <div class="row"><label>Floor</label><select id="t-mat">${MATS.map((m) => `<option ${m === t.mat ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
      <div class="row"><label>Edge</label><select id="t-edge">${EDGES.map((m) => `<option ${m === (t.edge ?? 'retain') ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
      <div class="row"><label>Walkable</label><input id="t-walk" type="checkbox" ${t.walk === false ? '' : 'checked'}></div>
      <div class="row"><button class="btn" id="t-brush">Paint with it</button><button class="btn" id="t-del">Delete</button></div>`;
    const set = (f: Partial<Terrace>, label: string) => apply([{ op: 'set_terrace', id: t.id, ...f }], label);
    $<HTMLInputElement>('t-name').onchange = (e) => set({ name: (e.target as HTMLInputElement).value }, 'rename a terrace');
    $<HTMLInputElement>('t-h').onchange = (e) => set({ h: Number((e.target as HTMLInputElement).value) }, `${t.name}: height`);
    $<HTMLSelectElement>('t-mat').onchange = (e) => set({ mat: (e.target as HTMLSelectElement).value }, `${t.name}: floor`);
    $<HTMLSelectElement>('t-edge').onchange = (e) => set({ edge: (e.target as HTMLSelectElement).value }, `${t.name}: edge`);
    $<HTMLInputElement>('t-walk').onchange = (e) => set({ walk: (e.target as HTMLInputElement).checked }, `${t.name}: walkable`);
    $('t-brush').onclick = () => { brushG = t.glyph; setTool('brush'); renderPalette(); };
    $('t-del').onclick = () => apply([{ op: 'remove_terrace', id: t.id }], `remove ${t.name}`);
    return;
  }
  if (sel.type === 'edge') {
    const e = sel.e, it = shown?.instances.find((i) => near(i.e, e));
    if (!it) { el.innerHTML = '<h3>Edge</h3><div class="meta">This section is gone.</div>'; return; }
    const tr = it.p.split('.')[1], straight = it.p.endsWith('.straight') || it.p === 'edge.wall.door';
    const over = it.o ? sc.objects.find((o) => o.id === it.o) : null;
    const cur = it.p === 'edge.wall.door' ? 'door' : (it.v ?? 'plain');
    const opts = straight ? VARIANTS[tr] ?? [] : [];
    const t = sc.terraces.find((x) => x.id === it.src);
    el.innerHTML = `<h3>${esc(tr)} section · (${e[0]}, ${e[1]})</h3>
      <div class="meta">${esc(it.p)} on <a href="#" id="e-t">${esc(t?.name ?? it.src)}</a> · ${it.h} m over ${it.low} m</div>
      ${opts.length ? `<div class="row" style="margin-top:8px"><span class="seg">${opts.map((v) => `<button data-v="${v}" class="${v === cur ? 'on' : ''}">${v}</button>`).join('')}</span>
      ${over ? '<button class="btn" id="e-auto" title="Remove the override: the compiler chooses">auto</button>' : ''}</div>
      <div class="meta">${over ? `Set by ${esc(over.id)}.` : 'Chosen by the compiler; pick one to set it here.'}</div>` : '<div class="meta">This section has no variants.</div>'}`;
    el.querySelectorAll<HTMLElement>('[data-v]').forEach((b) => {
      b.onclick = () => { const v = b.dataset.v!; apply([over ? { op: 'set', id: over.id, v } : { op: 'add', kind: 'edge', at: e, v }], `${tr} section: ${v}`); };
    });
    const auto = document.getElementById('e-auto'); if (auto && over) auto.onclick = () => apply([{ op: 'remove', id: over.id }], `${tr} section: auto`);
    $('e-t').onclick = (ev) => { ev.preventDefault(); if (t) { sel = { type: 'terrace', id: t.id }; highlightSel(); renderInspect(); } };
    return;
  }
  if (sel.type === 'obj') {
    const o = sc.objects.find((x) => x.id === (sel as { id: string }).id) as Obj | undefined;
    if (!o) { el.innerHTML = '<h3>Object</h3><div class="meta">It was removed.</div>'; return; }
    const fields = Object.entries(o).filter(([k]) => !['id', 'kind', 'name'].includes(k)).map(([k, v]) => `<div class="row"><label>${esc(k)}</label><span>${esc(JSON.stringify(v))}</span></div>`).join('');
    el.innerHTML = `<h3>${esc(o.kind)} · ${esc(o.id)}</h3>
      <div class="row"><label>Name</label><input id="o-name" value="${esc(o.name)}"></div>${fields}
      ${o.kind === 'vignette' ? `<div class="row"><label>Facing</label><span class="seg">${FRONTS.map((f) => `<button data-f="${f}" class="${f === o.front ? 'on' : ''}">${f}</button>`).join('')}</span></div>` : ''}
      <div class="row"><button class="btn" id="o-del">Delete</button><span class="meta">Arrows move it${o.kind === 'vignette' ? ', Q/E turn it' : ''}</span></div>`;
    $<HTMLInputElement>('o-name').onchange = (e) => apply([{ op: 'set', id: o.id, name: (e.target as HTMLInputElement).value }], `rename ${o.id}`);
    el.querySelectorAll<HTMLElement>('[data-f]').forEach((b) => { b.onclick = () => apply([{ op: 'set', id: o.id, front: b.dataset.f }], 'turn a prop'); });
    $('o-del').onclick = () => { apply([{ op: 'remove', id: o.id }], `remove ${o.id}`); sel = null; renderInspect(); };
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
  const fs = comp?.findings ?? [];
  const open = pins.filter((p) => p.status === 'open'), done = pins.filter((p) => p.status !== 'open').slice(-5);
  el.innerHTML = `<h3>Problems (${fs.length})</h3>
    ${fs.map((f, i) => `<div class="item ${f.severity === 'error' ? 'err' : 'warn'}" data-f="${i}">${esc(f.msg)}<div class="meta">${f.code}${f.at ? ` · (${f.at[0]}, ${f.at[1]})` : ''}</div></div>`).join('') || '<div class="meta">None.</div>'}
    <h3 style="margin-top:12px">Pins (${open.length} open)</h3>
    ${open.map(pinHtml).join('') || '<div class="meta">Pin a note on anything (N); Claude sees new pins with your next message in the terminal.</div>'}
    ${done.length ? `<div class="meta" style="margin-top:8px">Recently resolved</div>${done.map(pinHtml).join('')}` : ''}`;
  el.querySelectorAll<HTMLElement>('[data-f]').forEach((d) => { d.onclick = () => { const f = fs[Number(d.dataset.f)]; if (f.at) focus(f.at[0], f.at[1]); if (f.refs[0] && sc?.objects.some((o) => o.id === f.refs[0])) { sel = { type: 'obj', id: f.refs[0] }; highlightSel(); renderInspect(); } }; });
  el.querySelectorAll<HTMLElement>('[data-pin]').forEach((d) => { d.onclick = () => { const p = pins.find((x) => x.id === d.dataset.pin); if (p) { focus(p.anchor.x, p.anchor.y); sel = { type: 'pin', id: p.id }; renderInspect(); } }; });
  bindPinButtons(el);
}

function renderUI() { renderTop(); renderTools(); renderBrushbar(); renderPalette(); renderInspect(); renderLists(); }

// ---- pictures for Claude (GET /__map/view) ----
hot.on('map:view-request', (d: { id: number; name: string; opts: Record<string, string> }) => {
  if (d.name !== name || !shown) { hot.send('map:view', { id: d.id, error: `the open editor shows ${name}, not ${d.name}` }); return; }
  const o = d.opts, saved = { pos: cam.position.clone(), target: controls.target.clone() }, mk = markers.visible;
  const [tx, ty] = targetCorner();
  const x = o.x != null ? Number(o.x) : tx, y = o.y != null ? Number(o.y) : ty, r = o.r != null ? Number(o.r) : null;
  if (o.cam === 'top') topView(x, y, r ?? Math.max(shown.size[0], shown.size[1]) / G() / 2);
  else if (o.cam === 'game' || o.x != null) gameView(x, y, (r ?? 12) * 2 * G());
  markers.visible = o.findings !== '0' || o.pins !== '0';
  sun.position.copy(controls.target).add(new THREE.Vector3(-30, 40, 22)); sun.target.position.copy(controls.target);
  renderer.render(world, cam);
  const png = renderer.domElement.toDataURL('image/png');
  cam.position.copy(saved.pos); controls.target.copy(saved.target); controls.update(); markers.visible = mk;
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
/** For scripted checks (scripts/editor-shot.mjs): where a corner (x, y) at height h (m) is on screen, and the state. */
(window as unknown as { __editor: unknown }).__editor = {
  screen: (x: number, y: number, h?: number) => { const v = at3(x, y, h ?? heightAt(x, y)).project(cam); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; },
  state: () => ({ name, rev, tool, sel, brushG, errors: comp?.errors.length, warnings: comp?.warnings.length, pins: pins.length }),
};
fetch('/__map/scenes').then((r) => r.json()).then((j: { scenes: { name: string }[] }) => { sceneNames = j.scenes.map((s) => s.name); renderTop(); });
setTool('select');
await open(name);
