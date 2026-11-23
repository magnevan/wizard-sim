/**
 * The stylised-3D spike (2026-11-23, the user approved it as a reversible test of leaving pixel art): the courtyard's
 * plan-made level drawn as real 3D terrain from its heights and ground, with Meshy models of the great hall's pieces
 * (from Codex pictures) standing on it, and the wizard's own 3D model walking about, at a camera as steep and close as
 * Magicka's. Its own page (world3d.html), so nothing in the game's path changes. Not a renderer yet: no sim, no
 * collisions beyond tier steps, no props but the kit.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ROOMS } from '@wizard-sim/sim';
import { heightMap } from '../art/heights';
import { GROUNDS } from '../art/grounds.gen';
import place from './world3d-place.json';

const ROOM = 'court';
const U_PER_M = 1 / 0.6;                 // world units per metre (art/massing.ts)
const CELL = 0.5;
const q = new URLSearchParams(location.search);

const groundUrls = import.meta.glob<string>('../../../../content/assets/ground/*.png', { eager: true, query: '?url', import: 'default' });
const kitUrls = import.meta.glob<string>('../../../../content/generated/meshy/court-kit/*.glb', { eager: true, query: '?url', import: 'default' });
const modelUrls = import.meta.glob<string>('../../../../content/assets/models/wizard.glb', { eager: true, query: '?url', import: 'default' });
import wizMeta from '../../../../content/assets/models/wizard.json';
const urlOf = (all: Record<string, string>, name: string) => Object.entries(all).find(([p]) => p.endsWith('/' + name))?.[1];

const GROUND_FILE: Record<string, string> = { g: 'grass', d: 'dirt', s: 'sand', f: 'flagstone', c: 'cobble', m: 'mud', l: 'leaves', r: 'gravel', a: 'flagstone', p: 'planks', h: 'flagstone', w: 'water' };

// ---- the scene ----
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2230);
scene.fog = new THREE.Fog(0x2a2f3c, 70, 140);
// a soft environment for PBR materials to reflect (metal and gloss read dark without one)
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.15;

// screen axes in world (x, y): the plan's U (screen right) and V (screen down) are turned 45 degrees to the world grid
const R2 = Math.SQRT1_2;
const RIGHT = new THREE.Vector3(R2, 0, -R2), DOWN = new THREE.Vector3(R2, 0, R2);

scene.add(new THREE.HemisphereLight(0xc8d8ff, 0x9a7050, 1.5));
const sun = new THREE.DirectionalLight(0xffc98f, 3.0);   // a low warm morning sun (the critic: flat midday light)
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
const sc = sun.shadow.camera as THREE.OrthographicCamera;
sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 200;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
// from the upper left of the screen, fairly high: shadows fall down and to the right
const SUN_OFF = RIGHT.clone().multiplyScalar(-46).add(DOWN.clone().multiplyScalar(22)).add(new THREE.Vector3(0, 34, 0));   // on the camera's side, so the faces you see are lit

// ---- the terrain, from the level's heights and ground ----
const def = (ROOMS as Record<string, Parameters<typeof heightMap>[0]>)[ROOM];
const hm = heightMap(def)!;
const rows = GROUNDS[ROOM];
const { gw, gh } = hm;
const m = Float32Array.from(hm.m);
const ground = (cx: number, cy: number) => rows[cy]?.[cx] ?? 'g';
// buildings' roofs ('a', ash) come down to the ground they stand on: the kit stands there instead
{
  const roof = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) if (ground(x, y) === 'a' && !hm.out[y * gw + x]) roof[y * gw + x] = 1;
  for (let pass = 0; pass < 200; pass++) {
    let left = 0;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const k = y * gw + x;
      if (roof[k] !== 1) continue;
      let lo = Infinity;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, n = ny * gw + nx;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh || hm.out[n] || roof[n] === 1) continue;
        lo = Math.min(lo, m[n]);
      }
      if (lo < Infinity) { m[k] = lo; roof[k] = 2; } else left++;
    }
    for (let k = 0; k < roof.length; k++) if (roof[k] === 2) roof[k] = 3;
    if (!left) break;
  }
}
const wx = (cx: number) => -hm.w / 2 + cx * CELL, wy = (cy: number) => -hm.h / 2 + cy * CELL;
const yOf = (metres: number) => metres * U_PER_M;
const loader = new THREE.TextureLoader();
const tex = new Map<string, THREE.Texture>();
const texOf = (file: string) => {
  let t = tex.get(file);
  if (!t) {
    t = loader.load(urlOf(groundUrls, file + '.png')!);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    tex.set(file, t);
  }
  return t;
};
interface Buf { pos: number[]; uv: number[]; nrm: number[] }
const bufs = new Map<string, Buf>();
const buf = (key: string) => { let b = bufs.get(key); if (!b) { b = { pos: [], uv: [], nrm: [] }; bufs.set(key, b); } return b; };
const TS = 4; // world units per texture repeat
function tri(bf: Buf, p: number[][], n: number[], uv: (q: number[]) => number[]) {
  // wind it counter-clockwise about its normal, so a double-sided material never flips it
  const [a, b, c] = p, ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  const order = cx * n[0] + cy * n[1] + cz * n[2] < 0 ? [a, c, b] : [a, b, c];
  for (const q of order) { bf.pos.push(...q); bf.nrm.push(...n); bf.uv.push(...uv(q)); }
}
const topUV = (q: number[]) => [q[0] / TS, q[2] / TS];
/** A vertical face along p -> q (top points), from height `hi` down to `lo`, facing away from (cx, cz). */
function side(key: string, p: number[], q: number[], hi: number, lo: number, cx: number, cz: number) {
  let nx = q[2] - p[2], nz = -(q[0] - p[0]);
  const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
  if (nx * ((p[0] + q[0]) / 2 - cx) + nz * ((p[2] + q[2]) / 2 - cz) < 0) { nx = -nx; nz = -nz; }
  const along = (v: number[]) => (Math.abs(nx) > Math.abs(nz) ? v[2] : v[0]) / TS;
  const A = [p[0], hi, p[2]], Bq = [q[0], hi, q[2]], C2 = [q[0], lo, q[2]], D = [p[0], lo, p[2]];
  const uv = (v: number[]) => [along(v), v[1] / TS];
  tri(buf(key), [A, D, C2], [nx, 0, nz], uv); tri(buf(key), [A, C2, Bq], [nx, 0, nz], uv);
}
/** A convex polygon at height y, fanned. */
function top(key: string, pts: number[][], y: number) {
  const v = pts.map((q) => [q[0], y, q[1]]);
  for (let i = 1; i + 1 < v.length; i++) tri(buf(key), [v[0], v[i], v[i + 1]], [0, 1, 0], topUV);
}
// The level comes in 1 u blocks (2 x 2 cells) on a grid turned 45 degrees to the screen, so a straight edge across the
// screen is a staircase of blocks. Each outer step corner is cut on the diagonal and the notch filled at the lower
// height, so the staircase reads as the straight line the plan drew.
const B = hm.b, BS = B * CELL, bw = Math.floor(gw / B), bh = Math.floor(gh / B);
const CLIFF = 0.2; // metres: a flight's own treads (about 0.1) are never cut
const Hb = (i: number, j: number) => (i < 0 || j < 0 || i >= bw || j >= bh || hm.out[j * B * gw + i * B] ? -Infinity : m[j * B * gw + i * B]);
const Gb = (i: number, j: number) => ground(i * B, j * B);
const fileOf = (ch: string) => GROUND_FILE[ch] ?? 'grass';
const sideOf = (ch: string) => (ch === 'g' || ch === 'l' || ch === 'd' ? 'cliff' : 'wall');
const yb = (h: number) => (h === -Infinity ? -12 : yOf(h));
for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
  const h = Hb(i, j);
  if (h === -Infinity) continue;
  const ch = Gb(i, j), y = yOf(h);
  const x0 = wx(i * B), z0 = wy(j * B), x1 = x0 + BS, z1 = z0 + BS, cx = x0 + BS / 2, cz = z0 + BS / 2;
  const corner = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  // each corner's two edge neighbours: 0 (left, up), 1 (right, up), 2 (right, down), 3 (left, down)
  const nb: [number, number][][] = [[[i - 1, j], [i, j - 1]], [[i + 1, j], [i, j - 1]], [[i + 1, j], [i, j + 1]], [[i - 1, j], [i, j + 1]]];
  const cut = nb.map(([a, c]) => Hb(...a) < h - CLIFF && Hb(...c) < h - CLIFF);
  const n = cut.filter(Boolean).length;
  const leg = n === 1 ? BS : BS / 2;
  const pts: number[][] = [];
  const at = (c: number, toward: number, d: number) => [corner[c][0] + ((corner[toward][0] - corner[c][0]) * d) / BS, corner[c][1] + ((corner[toward][1] - corner[c][1]) * d) / BS];
  for (let c = 0; c < 4; c++) {
    const add = (q: number[]) => { const l = pts[pts.length - 1]; if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 1e-6) pts.push(q); };
    if (cut[c]) { add(at(c, (c + 3) % 4, leg)); add(at(c, (c + 1) % 4, leg)); } else add(corner[c]);
  }
  if (pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6) pts.pop();
  top(fileOf(ch), pts, y);
  // which neighbour a straight piece of edge borders
  const edgeNb = (p: number[], q: number[]): [number, number] | null => {
    if (Math.abs(p[1] - z0) < 1e-6 && Math.abs(q[1] - z0) < 1e-6) return [i, j - 1];
    if (Math.abs(p[1] - z1) < 1e-6 && Math.abs(q[1] - z1) < 1e-6) return [i, j + 1];
    if (Math.abs(p[0] - x0) < 1e-6 && Math.abs(q[0] - x0) < 1e-6) return [i - 1, j];
    if (Math.abs(p[0] - x1) < 1e-6 && Math.abs(q[0] - x1) < 1e-6) return [i + 1, j];
    return null;
  };
  const fillOf = (c: number) => Math.max(Hb(...nb[c][0]), Hb(...nb[c][1]));
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k], q = pts[(k + 1) % pts.length], e = edgeNb(p, q);
    let lo: number;
    if (e) lo = Hb(...e);
    else { // a cut: which corner's?
      const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      let best = 0, bd = Infinity;
      for (let c = 0; c < 4; c++) { const d = Math.hypot(corner[c][0] - mid[0], corner[c][1] - mid[1]); if (cut[c] && d < bd) { bd = d; best = c; } }
      lo = fillOf(best);
    }
    if (yb(lo) < y - 0.01) side(sideOf(ch), [p[0], 0, p[1]], [q[0], 0, q[1]], y, yb(lo), cx, cz);
  }
  // the notches, filled at the higher of the two lower neighbours, with its own faces down to a lower one still
  for (let c = 0; c < 4; c++) {
    if (!cut[c]) continue;
    const f = fillOf(c);
    if (f === -Infinity) continue;
    const fy = yOf(f), src = Hb(...nb[c][0]) >= Hb(...nb[c][1]) ? nb[c][0] : nb[c][1];
    const A = at(c, (c + 3) % 4, leg), Cc = corner[c], D = at(c, (c + 1) % 4, leg);
    top(fileOf(Gb(...src)), [A, Cc, D], fy);
    for (const [p, q] of [[A, Cc], [Cc, D]]) {
      const e = edgeNb(p, q);
      if (!e) continue;
      const lo = Hb(...e);
      if (yb(lo) < fy - 0.01) side(sideOf(Gb(...src)), [p[0], 0, p[1]], [q[0], 0, q[1]], fy, yb(lo), cx, cz);
    }
  }
}
for (const [key, b] of bufs) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  const mat = key === 'water'
    ? new THREE.MeshStandardMaterial({ color: 0x3f8fb8, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88 })
    : key === 'wall' ? new THREE.MeshStandardMaterial({ map: texOf('flagstone'), color: 0xd9c6a8, roughness: 0.9 })
    : key === 'cliff' ? new THREE.MeshStandardMaterial({ map: texOf('gravel'), color: 0xb7a58e, roughness: 1 })
    : new THREE.MeshStandardMaterial({ map: texOf(key), roughness: 0.95 });
  mat.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true; mesh.castShadow = key === 'wall' || key === 'cliff';
  scene.add(mesh);
}

// ---- the kit and the wizard ----
const gltf = new GLTFLoader();
const pending: Promise<unknown>[] = [];
const kitCache = new Map<string, Promise<THREE.Object3D>>();
const kit = (name: string) => {
  let p = kitCache.get(name);
  // ?kit=gateway:/@fs/<abs path>.glb swaps a piece for any model file (the dev server serves it), to compare
  const swap = new Map((q.get('kit') ?? '').split(',').filter(Boolean).map((e) => e.split(/:(.*)/s).slice(0, 2) as [string, string]));
  if (!p) { p = gltf.loadAsync(swap.get(name) ?? urlOf(kitUrls, name + '.glb')!).then((g) => g.scene); kitCache.set(name, p); }
  return p;
};
for (const pc of place.pieces) {
  pending.push(kit(pc.kit).then((src) => {
    const o = src.clone(true);
    o.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true; mesh.receiveShadow = true;
      const mt = mesh.material as THREE.MeshStandardMaterial;
      if (mt && 'metalness' in mt && !mt.metalnessMap) { mt.metalness = 0; mt.roughness = 0.85; }   // a flat Meshy material comes in metallic, which reads dark with no environment; a PBR one keeps its maps
    });
    const box = new THREE.Box3().setFromObject(o), size = box.getSize(new THREE.Vector3());
    const s = pc.width / Math.max(size.x, 1e-6);
    const holder = new THREE.Group();
    o.scale.setScalar(s);
    o.position.set(-(box.min.x + size.x / 2) * s, -box.min.y * s, -(box.min.z + size.z / 2) * s);
    holder.add(o);
    holder.position.set(pc.x, yOf(pc.z), pc.y);
    holder.rotation.y = Math.atan2(pc.fx, pc.fy);   // the model's front (+z) turned to face (fx, fy)
    scene.add(holder);
  }));
}
const WIZ_H = 2.9; // world units (about 1.75 m)
let wizard: THREE.Object3D | null = null, mixer: THREE.AnimationMixer | null = null, walk: THREE.AnimationAction | null = null;
pending.push(gltf.loadAsync(urlOf(modelUrls, 'wizard.glb')!).then((g) => {
  const o = g.scene;
  o.traverse((c) => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  // only the props the model shows by default (its staff): the conjured weapons and guards wait hidden (art/live3d.ts)
  const show = new Set<string>(wizMeta.show ?? []);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const hide = new Set((wizMeta.props ?? []).filter((pr) => !show.has(pr.name ?? '')).map((pr) => norm(pr.node)));
  o.traverse((c) => { if (hide.has(norm(c.name))) c.visible = false; });
  const box = new THREE.Box3().setFromObject(o), size = box.getSize(new THREE.Vector3());
  const holder = new THREE.Group();
  o.scale.setScalar(WIZ_H / size.y);
  o.position.y = -box.min.y * (WIZ_H / size.y);
  holder.add(o); scene.add(holder);
  wizard = holder;
  mixer = new THREE.AnimationMixer(o);
  const clip = g.animations.find((a) => a.name.toLowerCase().includes('walk')) ?? g.animations[0];
  if (clip) { walk = mixer.clipAction(clip); walk.play(); walk.paused = true; }
}));

// ---- the camera: steep and close, as Magicka's ----
const PITCH = THREE.MathUtils.degToRad(Number(q.get('pitch') ?? 46));   // Magicka's, about (the critic: 52 let roofs take over)
const ortho = q.get('ortho') === '1';
const VIEW_H = Number(q.get('view') ?? 18); // world units of ground-plane height the screen shows at the target
const cam: THREE.Camera = ortho
  ? new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400)
  : new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.5, 400);
function frame(target: THREE.Vector3) {
  const aspect = innerWidth / innerHeight;
  let dist = 60;
  if (cam instanceof THREE.PerspectiveCamera) { cam.aspect = aspect; dist = (VIEW_H * Math.sin(PITCH)) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))); cam.updateProjectionMatrix(); }
  else { const o = cam as THREE.OrthographicCamera, hh = (VIEW_H * Math.sin(PITCH)) / 2; o.top = hh; o.bottom = -hh; o.left = -hh * aspect; o.right = hh * aspect; o.updateProjectionMatrix(); }
  const back = DOWN.clone().multiplyScalar(Math.cos(PITCH) * dist).add(new THREE.Vector3(0, Math.sin(PITCH) * dist, 0));
  cam.position.copy(target).add(back);
  cam.lookAt(target);
  sun.position.copy(target).add(SUN_OFF); sun.target.position.copy(target);
}

// ---- walking ----
const pos = new THREE.Vector2(Number(q.get('x') ?? place.start.x), Number(q.get('y') ?? place.start.y));
const metresAt = (x: number, y: number) => {
  const cx = Math.floor((x + hm.w / 2) / CELL), cy = Math.floor((y + hm.h / 2) / CELL);
  if (cx < 0 || cy < 0 || cx >= gw || cy >= gh || hm.out[cy * gw + cx]) return NaN;
  return m[cy * gw + cx];
};
const keys = new Set<string>();
addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('resize', () => renderer.setSize(innerWidth, innerHeight));
// ambient occlusion in the corners and at the feet of walls (?ao=0 to compare)
let composer: EffectComposer | null = null;
if (q.get('ao') !== '0') {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, cam));
  const ao = new GTAOPass(scene, cam, innerWidth, innerHeight);
  ao.updateGtaoMaterial({ radius: 1.2, distanceFallOff: 1, thickness: 1.5 });
  ao.blendIntensity = 0.85;
  composer.addPass(ao);
  composer.addPass(new OutputPass());
}
addEventListener('resize', () => composer?.setSize(innerWidth, innerHeight));
const clock = new THREE.Clock();
let facing = Math.atan2(-DOWN.x, -DOWN.z);
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const up = keys.has('w') || keys.has('arrowup'), dn = keys.has('s') || keys.has('arrowdown');
  const lf = keys.has('a') || keys.has('arrowleft'), rt = keys.has('d') || keys.has('arrowright');
  const mv = RIGHT.clone().multiplyScalar((rt ? 1 : 0) - (lf ? 1 : 0)).add(DOWN.clone().multiplyScalar((dn ? 1 : 0) - (up ? 1 : 0)));
  const moving = mv.lengthSq() > 0;
  if (moving) {
    mv.normalize().multiplyScalar(6 * dt);
    const here = metresAt(pos.x, pos.y), there = metresAt(pos.x + mv.x, pos.y + mv.z);
    if (!Number.isNaN(there) && (Number.isNaN(here) || Math.abs(there - here) <= 0.6)) pos.set(pos.x + mv.x, pos.y + mv.z);
    facing = Math.atan2(mv.x, mv.z);
  }
  if (walk) walk.paused = !moving;
  mixer?.update(dt);
  const z = yOf(metresAt(pos.x, pos.y) || 0);
  if (wizard) { wizard.position.set(pos.x, z, pos.y); wizard.rotation.y = facing; }
  frame(new THREE.Vector3(pos.x, z + 1.2, pos.y));
  if (composer) composer.render(); else renderer.render(scene, cam);
  requestAnimationFrame(tick);
}
Promise.all(pending).then(() => { (window as unknown as { __ready: boolean }).__ready = true; });
tick();
