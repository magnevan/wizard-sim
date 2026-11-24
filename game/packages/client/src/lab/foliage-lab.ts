/**
 * The foliage lab (foliage.html): procedural plants (lab/foliage.ts) on a small stage of the courtyard's stone, a
 * retaining wall with a parapet over paving, at the game's camera, with the wizard for scale. It exists to judge the
 * plants in a scene and against the concept (docs/reference/element-order/area-courtyard-start.jpg).
 * ?x=&z= target (m), ?view=26 (u of ground seen top to bottom), ?pitch=46, ?yaw=0, ?seed=1, ?wind=0 stills the wind,
 * ?sheet=1 shows the sprite sheet instead, ?bare=1 leaves the plants out.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import wizMeta from '../../../../content/assets/models/wizard.json';
import { Foliage, FOLIAGE_DEBUG, FOLIAGE_TIME, bed, bush, cascade, cone, rng, spriteCanvas, tree, type Pal } from './foliage';
import { M, kitMat, loadKitArt, setupStage } from './kit-render';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => Number(q.get(k) ?? d);
if (q.get('sheet') === '1') {
  const cv = spriteCanvas(); cv.style.cssText = 'background:#2a4a34;width:1024px;height:1024px;image-rendering:pixelated';
  document.body.appendChild(cv); (window as unknown as { __ready: boolean }).__ready = true;
  throw new Error('sheet only');
}

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const sun = setupStage(renderer, scene);
scene.background = new THREE.Color(0x2a2d33);
await loadKitArt();

// ---- the stage, in metres (the world group scales it to the kit's u) ----
const world = new THREE.Group(); world.scale.setScalar(M); scene.add(world);
const flat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.92 });
const stone = kitMat('ashlar') ?? flat(0xd8c8b0), smooth = kitMat('smooth-stone') ?? flat(0xe2d6c2), paving = kitMat(q.get('floor') ?? 'plaza') ?? flat(0xc9b9a4);
const soil = kitMat('dirt') ?? flat(0x5a4636), lawn = kitMat('lawn') ?? flat(0x6f8f55);
function box(m: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m);
  b.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); b.castShadow = b.receiveShadow = true; world.add(b); return b;
}
const WALL_Z = -4.4, WALL_H = 3;
box(paving, -22, 22, -0.5, 0, WALL_Z, 14);                              // the court's floor
box(stone, -22, 22, -0.5, WALL_H, -14, WALL_Z);                         // the terrace above, its face the retaining wall
box(paving, -22, 22, WALL_H, WALL_H + 0.01, -14, WALL_Z - 0.3);
box(smooth, -22, 22, WALL_H, WALL_H + 0.15, WALL_Z - 0.34, WALL_Z + 0.12);   // coping
box(stone, -22, 22, WALL_H + 0.15, WALL_H + 0.95, WALL_Z - 0.28, WALL_Z - 0.02);   // parapet
box(smooth, -22, 22, WALL_H + 0.95, WALL_H + 1.07, WALL_Z - 0.34, WALL_Z + 0.04);
/** A stone trough against the wall, x0 to x1, with soil; returns its soil height. */
function trough(x0: number, x1: number, depth = 0.9, h = 0.45) {
  box(smooth, x0, x1, 0, h, WALL_Z, WALL_Z + depth); box(smooth, x0 - 0.04, x1 + 0.04, h - 0.08, h + 0.02, WALL_Z, WALL_Z + depth + 0.04);
  box(soil, x0 + 0.08, x1 - 0.08, h, h + 0.03, WALL_Z + 0.04, WALL_Z + depth - 0.08); return h + 0.03;
}
function planter(x: number, z: number, s = 0.7, h = 0.6) {
  box(smooth, x - s / 2, x + s / 2, 0, h, z - s / 2, z + s / 2); box(smooth, x - s / 2 - 0.04, x + s / 2 + 0.04, h - 0.1, h + 0.02, z - s / 2 - 0.04, z + s / 2 + 0.04);
  box(soil, x - s / 2 + 0.07, x + s / 2 - 0.07, h, h + 0.03, z - s / 2 + 0.07, z + s / 2 - 0.07); return h + 0.03;
}

// ---- the planting ----
FOLIAGE_DEBUG.value = num('debug', 0);
const seed = num('seed', 1);
let nth = 0;
/** One plant: its own seeded builder, placed at (x, y, z) m, turned yaw. */
function plant(x: number, y: number, z: number, grow: (F: Foliage) => void, yaw = 0): THREE.Group {
  const F = new Foliage(rng(seed * 1000 + ++nth)); grow(F);
  const g = F.build(); g.position.set(x, y, z); g.rotation.y = yaw; world.add(g); return g;
}
if (q.get('bare') !== '1') {
  const BZ = WALL_Z + 0.45;
  const t1 = trough(-11, -5.2), t2 = trough(-3.4, 3.4), t3 = trough(5.6, 11);
  plant(-8.1, t1, BZ, (F) => bed(F, { w: 5.6, d: 0.75, blooms: ['pink', 'white', 'lilac'] }));
  plant(0, t2, BZ, (F) => bed(F, { w: 6.6, d: 0.75, blooms: ['lilac', 'pink', 'yellow'], spikes: ['blue'] }));
  plant(8.3, t3, BZ, (F) => bed(F, { w: 5.2, d: 0.75, blooms: ['rose', 'white', 'pink'] }));
  for (const x of [-12, -4.3, 4.5, 12]) { const y = planter(x, WALL_Z + 0.5); plant(x, y, WALL_Z + 0.5, (F) => cone(F, { h: 1.5 + (Math.abs(x) > 6 ? 0.3 : 0) })); }
  // vines over the coping: frame x along the wall, +z out of its face
  const top = WALL_H + 0.15, face = WALL_Z + 0.12;
  plant(-8.2, top, face, (F) => cascade(F, { w: 3.0, drop: 2.2, pal: ['gold', 'green'], bloom: { pal: ['pink'], amount: 0.75 } }));
  plant(0.8, top, face, (F) => cascade(F, { w: 3.6, drop: 2.0, pal: ['green', 'gold'], bloom: { pal: ['lilac', 'pink'], amount: 0.7 } }));
  plant(8.6, top, face, (F) => cascade(F, { w: 1.8, drop: 1.3, pal: ['gold'], clumps: 1 }));
  plant(14.5, WALL_H + 1.07, WALL_Z - 0.1, (F) => cascade(F, { w: 2.6, drop: 2.6, pal: ['green'], bloom: { pal: ['white'], amount: 0.5 } }));
  // the garden corner: lawn, shrubs in bloom, a flowering tree
  const lw = new THREE.Mesh(new THREE.PlaneGeometry(9, 7), lawn); lw.rotation.x = -Math.PI / 2; lw.position.set(-14.5, 0.012, 7.5); lw.receiveShadow = true; world.add(lw);
  const shrubs: [number, number, number, Pal, Pal | null][] = [[-13.6, 5.4, 0.8, 'gold', null], [-11.9, 6.2, 0.6, 'green', 'pink'], [-12.9, 7.6, 0.95, 'gold', 'lilac'],
    [-10.9, 8.2, 0.7, 'gold', null], [-11.2, 5.0, 0.45, 'green', 'white'], [-14.6, 8.8, 0.75, 'green', 'pink'], [-10.4, 6.8, 0.4, 'gold', 'yellow']];
  for (const [x, z, r, pal, bl] of shrubs) plant(x, 0, z, (F) => bush(F, { r, pal: [pal, pal === 'gold' ? 'green' : 'gold'], bloom: bl ? { pal: bl, amount: 0.7 } : undefined }));
  plant(-15.3, 0, 6.4, (F) => tree(F, { h: 3.6, r: 1.4, pal: ['green', 'gold'], bloom: { pal: 'pink', amount: 0.9, size: 0.12 } }));
  // a pair in the open, and a pot
  plant(6.5, 0, 3.2, (F) => bush(F, { r: 0.7, pal: ['gold', 'green'] }));
  plant(8.4, 0, 3.6, (F) => bush(F, { r: 0.5, pal: ['green'], bloom: { pal: 'rose', amount: 0.8 } }));
  { const y = planter(11.2, 2.4, 0.9, 0.5); plant(11.2, y, 2.4, (F) => bed(F, { w: 0.8, d: 0.7, h: 0.5, back: 0, blooms: ['pink', 'white'], spikes: ['blue'] })); }
}

// ---- the wizard, for scale (1.74 m) ----
const pending: Promise<unknown>[] = [];
const modelUrls = import.meta.glob<string>('../../../../content/assets/models/wizard.glb', { eager: true, query: '?url', import: 'default' });
if (q.get('wiz') !== '0') pending.push(new GLTFLoader().loadAsync(Object.values(modelUrls)[0]).then((g) => {
  const o = g.scene; o.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  const show = new Set<string>(wizMeta.show ?? []), norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const hide = new Set((wizMeta.props ?? []).filter((pr) => !show.has(pr.name ?? '')).map((pr) => norm(pr.node)));
  o.traverse((c) => { if (hide.has(norm(c.name))) c.visible = false; });
  const b = new THREE.Box3().setFromObject(o), s = b.getSize(new THREE.Vector3()), k = 1.74 / s.y;
  o.scale.setScalar(k); o.position.y = -b.min.y * k;
  const holder = new THREE.Group(); holder.add(o); holder.position.set(num('wx', -2), 0, num('wz', -1.6)); holder.rotation.y = 0.4; world.add(holder);
}));

// ---- the camera: the game's ----
const PITCH = THREE.MathUtils.degToRad(num('pitch', 46)), YAW = THREE.MathUtils.degToRad(num('yaw', 0)), VIEW_H = num('view', 26);
const cam = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.5, 500);
const target = new THREE.Vector3(num('x', 0) * M, 1.2 * M, num('z', 0) * M);
function frame() {
  cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
  const dist = (VIEW_H * Math.sin(PITCH)) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
  const back = new THREE.Vector3(Math.sin(YAW), 0, Math.cos(YAW)).multiplyScalar(Math.cos(PITCH) * dist).add(new THREE.Vector3(0, Math.sin(PITCH) * dist, 0));
  cam.position.copy(target).add(back); cam.lookAt(target);
  sun.position.copy(target).add(new THREE.Vector3(-30, 40, 22)); sun.target.position.copy(target);
}
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); frame(); });
frame();
const wind = q.get('wind') !== '0';
const loop = () => { if (wind) FOLIAGE_TIME.value = performance.now() / 1000; renderer.render(scene, cam); requestAnimationFrame(loop); };
loop();
Promise.all(pending).then(() => { (window as unknown as { __ready: boolean }).__ready = true; });
