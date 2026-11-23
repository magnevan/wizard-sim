/**
 * The kit test's greybox (2026-11-23, docs/explorations/2026-11-23-flexible-building.md): a layout compiled by
 * tools/kit/compile.py into instances of made pieces, each drawn here as a plain placeholder of its exact size, so the
 * joins can be judged before any art exists. Placeholders only: every piece is replaced by its made model later
 * (tools/kit/kit.json is the contract both sides keep). Its own page (kit3d.html). ?layout=patch-a, ?x=&y= target
 * (u), ?view=26, ?pitch=46, ?yaw=0 (degrees, turns the camera round the target), ?wiz=0 hides the wizard.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import wizMeta from '../../../../content/assets/models/wizard.json';

type Inst = { p: string; x: number; y: number; x2?: number; y2?: number; h: number; low?: number; rot: number; len?: number; v?: string; dx?: number; dy?: number; n?: number };
type Scene = { G: number; size: [number, number]; floors: { t: string; h: number; mat: string; polys: number[][][][] }[]; instances: Inst[] };

const q = new URLSearchParams(location.search);
const layouts = import.meta.glob<Scene>('./kit-*.json', { eager: true, import: 'default' });
const data = layouts[`./kit-${q.get('layout') ?? 'patch-a'}.json`];
const modelUrls = import.meta.glob<string>('../../../../content/assets/models/wizard.glb', { eager: true, query: '?url', import: 'default' });

const M = 1 / 0.6;                         // u per metre
const yOf = (m: number) => m * M;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2027);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x5a5048, 0.9));
const sun = new THREE.DirectionalLight(0xfff0dc, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

// greybox materials: one tone per role, so a join reads by shape, not by texture
const mat = (c: number, r = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
const MAT = {
  paving: mat(0xc9c3b8), plaza: mat(0xbdb6aa), road: mat(0x8c8780), lawn: mat(0x8fa877), roof: mat(0x6d7489),
  wall: mat(0xd8d2c6), face: mat(0xb7aea0), coping: mat(0xe6e0d4), stone: mat(0xd2cabd), dark: mat(0x2d2a2c),
  wood: mat(0x8a6a4c), leaf: mat(0x6f8f55), metal: mat(0x3b3d42, 0.5), kerb: mat(0xd9d4ca),
} as const;
const FLOOR: Record<string, THREE.Material> = { paving: MAT.paving, plaza: MAT.plaza, road: MAT.road, lawn: MAT.lawn, roof: MAT.roof, rock: mat(0x7d7468) };

function box(g: THREE.Group, m: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
  if (x1 - x0 <= 1e-4 || y1 - y0 <= 1e-4 || z1 - z0 <= 1e-4) return;
  const b = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m);
  b.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  b.castShadow = b.receiveShadow = true;
  g.add(b);
}

// ---- floors ----
for (const f of data.floors) for (const [outer, ...holes] of f.polys) {
  const s = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, -y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, -y))));
  const m = new THREE.Mesh(new THREE.ShapeGeometry(s), FLOOR[f.mat] ?? MAT.paving);
  m.rotation.x = -Math.PI / 2; m.position.y = yOf(f.h); m.receiveShadow = true;
  scene.add(m);
}
{ // the ground beyond the patch, a little below everything
  const g = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat(0x2a2d33));
  g.rotation.x = -Math.PI / 2; g.position.set(data.size[0] / 2, yOf(Math.min(...data.floors.map((f) => f.h)) - 0.4), data.size[1] / 2); scene.add(g);
}

// ---- pieces: each built in its own frame (x along the edge from its start, z out toward the lower side, y up) ----
function edgeFrame(it: Inst): THREE.Group {
  const g = new THREE.Group();
  const dx = (it.x2! - it.x) / it.len!, dy = (it.y2! - it.y) / it.len!;
  g.matrixAutoUpdate = false;
  g.matrix.makeBasis(new THREE.Vector3(dx, 0, dy), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-dy, 0, dx)).setPosition(it.x, 0, it.y);
  return g;
}
const COP = 0.15, COP_OUT = 0.12, PROUD = 0.05;   // coping: m tall, u overhang, m it stands above the floor it caps
function retain(g: THREE.Group, L: number, h: number, low: number) {
  box(g, MAT.face, 0, L, yOf(low) - 0.4, yOf(h - COP), -0.45, 0);
  box(g, MAT.coping, 0, L, yOf(h - COP), yOf(h + PROUD), -0.5, COP_OUT);
}
function balustrade(g: THREE.Group, L: number, h: number, inset: number) {
  const y0 = yOf(h), z0 = -0.36, z1 = -0.04;
  box(g, MAT.stone, inset, L - inset, y0, y0 + yOf(0.12), z0, z1);                         // the plinth
  box(g, MAT.stone, inset, L - inset, y0 + yOf(0.82), y0 + yOf(0.95), z0 - 0.03, z1 + 0.03);   // the rail
  const n = Math.max(1, Math.round((L - 2 * inset) / 0.32));
  for (let k = 0; k < n; k++) { const x = inset + ((k + 0.5) * (L - 2 * inset)) / n; box(g, MAT.stone, x - 0.07, x + 0.07, y0 + yOf(0.12), y0 + yOf(0.82), -0.27, -0.13); }
}
function wall(g: THREE.Group, L: number, h: number, low: number, v?: string, door = false) {
  box(g, MAT.wall, 0, L, yOf(low) - 0.4, yOf(h), -0.6, 0);
  box(g, MAT.coping, 0, L, yOf(low) - 0.4, yOf(low) + yOf(0.5), -0.6, 0.08);              // a plinth course
  box(g, MAT.coping, 0, L, yOf(h) - yOf(0.35), yOf(h), -0.6, 0.15);                         // the cornice
  const mid = L / 2;
  if (door) { box(g, MAT.dark, mid - 0.7, mid + 0.7, yOf(low), yOf(low + 2.7), -0.1, 0.02); box(g, MAT.coping, mid - 0.9, mid + 0.9, yOf(low + 2.7), yOf(low + 3.0), -0.1, 0.1); }
  if (v === 'window') for (const fl of [low + 1.6, low + 4.6]) {
    box(g, MAT.dark, mid - 0.4, mid + 0.4, yOf(fl), yOf(fl + 1.5), -0.08, 0.02);
    box(g, MAT.coping, mid - 0.55, mid + 0.55, yOf(fl - 0.12), yOf(fl), -0.1, 0.12);
  }
}

// ---- made models: a fitted model (tools/kit/fit.py) replaces its placeholder wherever one exists (?art=0: none) ----
const artUrls = import.meta.glob<string>('../../../../content/generated/meshy/kit/*.glb', { eager: true, query: '?url', import: 'default' });
const ART: Record<string, THREE.Object3D> = {};
if (q.get('art') !== '0') await Promise.all(Object.entries(artUrls).map(([p, url]) => new GLTFLoader().loadAsync(url).then((g) => {
  g.scene.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = c.receiveShadow = true; });
  ART[p.split('/').pop()!.replace('.glb', '')] = g.scene;
})));
/** A fitted model, placed in a piece's frame: moved, and stretched along x and y (u). */
function art(g: THREE.Group, name: string, x: number, y: number, sx = 1, sy = 1, s = 1): boolean {
  const a = ART[name]; if (!a) return false;
  const o = a.clone(); o.position.set(x, y, 0); o.scale.set(sx * s, sy * s, s); g.add(o); return true;
}

/** A fitted model placed by a basis (x along, y up, z out): a non-orthogonal x shears it down a slope, balusters upright. */
function artBasis(g: THREE.Group, name: string, X: THREE.Vector3, Z: THREE.Vector3, P: THREE.Vector3): boolean {
  const a = ART[name]; if (!a) return false;
  const o = a.clone(); o.matrixAutoUpdate = false; o.matrix.makeBasis(X, new THREE.Vector3(0, 1, 0), Z).setPosition(P); g.add(o); return true;
}

for (const it of data.instances) {
  const [cls, kind, shape] = it.p.split('.');
  if (cls === 'edge' || cls === 'sweep') {
    const g = edgeFrame(it), L = it.len!, low = it.low!;
    const drop = it.h - low;
    // a made retaining wall: its top course with the coping, then plain courses stacked down past the lower floor
    // (every other one mirrored, so the joints don't line up), never stretched
    let madeRetain = false;
    const niche = it.v === 'niche' && ART.niche;
    if ((kind === 'retain' || kind === 'parapet') && drop >= 0.3 && art(g, niche ? 'niche' : 'retain-top', 0, yOf(it.h), L / 2)) {
      madeRetain = true;
      for (let y = yOf(it.h) - (niche ? 2.0 : 1.1), k = 0; y > yOf(low) - 0.4; y -= 0.78, k++) {
        if (k % 2) art(g, 'retain-course', L, y, -L / 2); else art(g, 'retain-course', 0, y, L / 2);
      }
    }
    if (kind === 'retain') { if (!madeRetain) retain(g, L, it.h, low); }
    else if (kind === 'parapet') {
      if (!madeRetain) retain(g, L, it.h, low);
      if (!art(g, 'balustrade', 0.275, yOf(it.h + 0.05), (L - 0.55) / 1.45)) balustrade(g, L, it.h, 0.275);
    }
    else if (kind === 'kerb') { if (!art(g, 'kerb', 0, yOf(it.h), L / 2)) box(g, MAT.kerb, 0, L, yOf(low) - 0.1, yOf(it.h), -0.32, 0); }
    else if (kind === 'wall') wall(g, L, it.h, low, it.v, shape === 'door');
    scene.add(g);
  } else if (cls === 'joint') {
    const g = new THREE.Group(); g.position.set(it.x, 0, it.y); g.rotation.y = -it.rot;
    const y = yOf(it.h);
    if ((kind === 'pier' || kind === 'newel') && art(g, 'pier', 0, y, 1, 1, kind === 'newel' ? 1.25 : 1)) { scene.add(g); continue; }
    if (kind === 'pier') { box(g, MAT.stone, -0.275, 0.275, y, y + yOf(1.08), -0.275, 0.275); box(g, MAT.coping, -0.33, 0.33, y + yOf(1.08), y + yOf(1.2), -0.33, 0.33); }
    if (kind === 'newel') {
      box(g, MAT.stone, -0.35, 0.35, y - 0.2, y + yOf(1.25), -0.35, 0.35); box(g, MAT.coping, -0.42, 0.42, y + yOf(1.25), y + yOf(1.4), -0.42, 0.42);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.26, 20, 14), MAT.stone); ball.position.y = y + yOf(1.4) + 0.24; ball.castShadow = true; g.add(ball);
    }
    if (kind === 'corner' && art(g, 'corner', 0, y + yOf(PROUD))) { scene.add(g); continue; }
    if (kind === 'corner') box(g, MAT.coping, -0.36, 0.36, y - yOf(COP), y + yOf(PROUD + 0.04), -0.36, 0.36);
    if (kind === 'pilaster') box(g, MAT.coping, -0.3, 0.3, yOf(it.low ?? it.h - 7) - 0.4, y - yOf(0.35), -0.3, 0.3);
    scene.add(g);
  } else if (cls === 'connector') {
    // a flight: treads from the head out, and a cheek wall each side whose coping follows the steps
    const g = new THREE.Group(), L = it.len!, n = it.n!, W = Math.hypot(it.x2! - it.x, it.y2! - it.y);
    const ax = (it.x2! - it.x) / W, ay = (it.y2! - it.y) / W, ox = it.dx!, oy = it.dy!;
    g.matrixAutoUpdate = false;   // local: x across (head start to end), z out along the flight, y up
    g.matrix.makeBasis(new THREE.Vector3(ax, 0, ay), new THREE.Vector3(0, 1, 0), new THREE.Vector3(ox, 0, oy)).setPosition(it.x, 0, it.y);
    const rise = (it.h - it.low!) / n, go = L / n;
    // the head sill: the terrace's edge stone across the flight (a row of made treads level with the terrace, if made)
    if (ART.tread) { for (let m = -0.6; m < W + 0.6 - 0.01; m += (W + 1.2) / Math.ceil((W + 1.2) / 2)) { art(g, 'tread', m, yOf(it.h) + 0.01, (W + 1.2) / Math.ceil((W + 1.2) / 2) / 2); g.children[g.children.length - 1].position.z = 0.0; } }
    else box(g, MAT.coping, -0.6, W + 0.6, yOf(it.h - rise) - 0.1, yOf(it.h + PROUD * 0.4), -0.45, 0.05);
    const madeTreads = !!ART.tread;
    for (let k = 0; k < n; k++) {
      const top = yOf(it.h - (k + 1) * rise);
      box(g, MAT.stone, 0, W, yOf(it.low!) - 0.4, madeTreads ? top - 0.3 : top, k * go, (k + 1) * go);
      if (madeTreads && k < n - 1) { for (let m = 0; m + 1.99 < W; m += 2) art(g, 'tread', m, top, 1, 1); g.children.slice(-Math.round(W / 2)).forEach((o) => { o.position.z = (k + 1) * go - 0.06; }); }
      else box(g, MAT.coping, 0, W, top - 0.05, top, k * go - 0.05, k * go + 0.08);   // a nosing
    }
    const sl = yOf(it.h - it.low!) / L, topAt = (z: number) => yOf(it.h + 0.1) - sl * z;
    const madeCheeks = !!(ART['retain-top'] && ART['retain-course'] && ART.balustrade && ART.pier);
    for (const side of madeCheeks ? [-1, 1] : []) {
      const x0 = side < 0 ? -0.6 : W, cx = x0 + 0.3, Z = new THREE.Vector3(side, 0, 0);
      // left (side -1) runs from the head down; right runs from the foot up, so neither side is mirrored inside out
      const along = (z0: number, z1: number, len: number) => (side < 0 ? new THREE.Vector3(0, -sl, 1) : new THREE.Vector3(0, sl, -1)).multiplyScalar((z1 - z0) / len);
      const start = (z0: number, z1: number) => (side < 0 ? z0 : z1);
      const nm = Math.max(1, Math.ceil(L / 2)), lm = L / nm;
      for (let i = 0; i < nm; i++) {
        const z0 = i * lm, z1 = z0 + lm, zs = start(z0, z1), wx = side < 0 ? x0 + 0.06 : x0 + 0.54;
        artBasis(g, 'retain-top', along(z0, z1, 2), Z, new THREE.Vector3(wx, topAt(zs), zs));
        for (let y = topAt(zs) - 1.1; y > yOf(it.low!) - 1.6 - sl * lm; y -= 0.78) artBasis(g, 'retain-course', along(z0, z1, 2), Z, new THREE.Vector3(wx, y, zs));
      }
      const nb = Math.max(1, Math.round(L / 1.75)), lb = L / nb;
      for (let i = 0; i < nb; i++) {
        const z0 = i * lb + 0.15, z1 = (i + 1) * lb - 0.15, zs = start(z0, z1);
        artBasis(g, 'balustrade', along(z0, z1, 1.45), Z, new THREE.Vector3(cx - side * 0.2, topAt(zs) + yOf(0.05), zs));
        if (i > 0) { const pz = i * lb; art(g, 'pier', cx, topAt(pz) - 0.1, 1, 1, 0.85); g.children[g.children.length - 1].position.z = pz; }
      }
      art(g, 'pier', cx, yOf(it.low!), 1, 1, 1.25); g.children[g.children.length - 1].position.z = L - 0.4;   // the newel at the foot
    }
    for (const side of madeCheeks ? [] : [-1, 1]) {
      const x0 = side < 0 ? -0.6 : W, x1 = x0 + 0.6;
      const prof = new THREE.Shape([new THREE.Vector2(0, yOf(it.low!) - 0.4), new THREE.Vector2(L + 0.1, yOf(it.low!) - 0.4), new THREE.Vector2(L + 0.1, yOf(it.low! + 0.9)), new THREE.Vector2(0, yOf(it.h + 0.9))]);
      const geo = new THREE.ExtrudeGeometry(prof, { depth: 0.6, bevelEnabled: false });
      const cheek = new THREE.Mesh(geo, MAT.face); cheek.castShadow = cheek.receiveShadow = true;
      // the profile is drawn in (out, up); turn it so its x runs along the flight (local z) and its depth across (local x)
      cheek.rotation.y = -Math.PI / 2; cheek.position.set(x1, 0, 0);
      g.add(cheek);
      const len = Math.hypot(L + 0.1, yOf(it.h - it.low!)), cop = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.16, len), MAT.coping);
      cop.position.set((x0 + x1) / 2, (yOf(it.h + 0.9) + yOf(it.low! + 0.9)) / 2 + 0.06, (L + 0.1) / 2);
      cop.rotation.x = Math.atan2(yOf(it.h - it.low!), L + 0.1); cop.castShadow = true; g.add(cop);
    }
    scene.add(g);
  } else if (cls === 'vignette') {
    const g = new THREE.Group(), y = yOf(it.h);
    g.position.set(it.x, 0, it.y); g.rotation.y = Math.atan2(Math.cos(it.rot), Math.sin(it.rot));   // local +z is the front
    if (kind === 'bench-planter') {
      box(g, MAT.wood, -1.0, 1.0, y + yOf(0.4), y + yOf(0.47), -0.3, 0.3); box(g, MAT.wood, -1.0, 1.0, y + yOf(0.47), y + yOf(0.9), -0.35, -0.27);
      for (const sx of [-0.85, 0.85]) box(g, MAT.metal, sx - 0.05, sx + 0.05, y, y + yOf(0.4), -0.25, 0.25);
      for (const sx of [-1.55, 1.55]) {
        box(g, MAT.stone, sx - 0.4, sx + 0.4, y, y + yOf(0.6), -0.4, 0.4);
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), MAT.leaf); b.position.set(sx, y + yOf(0.6) + 0.35, 0); b.castShadow = true; g.add(b);
      }
    }
    if (kind === 'lamp') {
      box(g, MAT.metal, -0.08, 0.08, y, y + yOf(3.0), -0.08, 0.08); box(g, MAT.metal, -0.2, 0.2, y, y + yOf(0.3), -0.2, 0.2);
      box(g, new THREE.MeshStandardMaterial({ color: 0xffe2a8, emissive: 0xffc870, emissiveIntensity: 0.6 }), -0.18, 0.18, y + yOf(3.0), y + yOf(3.45), -0.18, 0.18);
    }
    scene.add(g);
  }
}

// ---- the wizard, for scale ----
const WIZ_H = 2.9;
const target = new THREE.Vector3(Number(q.get('x') ?? data.size[0] / 2), 0, Number(q.get('y') ?? data.size[1] / 2));
const pending: Promise<unknown>[] = [];
if (q.get('wiz') !== '0') {
  const url = Object.values(modelUrls)[0];
  pending.push(new GLTFLoader().loadAsync(url).then((g) => {
    const o = g.scene;
    o.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
    const show = new Set<string>(wizMeta.show ?? []);
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const hide = new Set((wizMeta.props ?? []).filter((pr) => !show.has(pr.name ?? '')).map((pr) => norm(pr.node)));
    o.traverse((c) => { if (hide.has(norm(c.name))) c.visible = false; });
    const b = new THREE.Box3().setFromObject(o), s = b.getSize(new THREE.Vector3());
    o.scale.setScalar(WIZ_H / s.y); o.position.y = -b.min.y * (WIZ_H / s.y);
    const wx = Number(q.get('wx') ?? target.x), wy = Number(q.get('wy') ?? target.z), wh = Number(q.get('wh') ?? 3);
    const holder = new THREE.Group(); holder.add(o); holder.position.set(wx, yOf(wh), wy); holder.rotation.y = 0.4; scene.add(holder);
  }));
}

// ---- the camera: Magicka's, about ----
const PITCH = THREE.MathUtils.degToRad(Number(q.get('pitch') ?? 46)), YAW = THREE.MathUtils.degToRad(Number(q.get('yaw') ?? 0));
const VIEW_H = Number(q.get('view') ?? 26);
const cam = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.5, 500);
function frame() {
  cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
  const dist = (VIEW_H * Math.sin(PITCH)) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
  const t = target.clone().setY(yOf(Number(q.get('th') ?? 1.5)));
  const back = new THREE.Vector3(Math.sin(YAW), 0, Math.cos(YAW)).multiplyScalar(Math.cos(PITCH) * dist).add(new THREE.Vector3(0, Math.sin(PITCH) * dist, 0));
  cam.position.copy(t).add(back); cam.lookAt(t);
  sun.position.copy(t).add(new THREE.Vector3(-30, 40, 22)); sun.target.position.copy(t);
}
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); frame(); });
frame();
const loop = () => { renderer.render(scene, cam); requestAnimationFrame(loop); };
loop();
Promise.all(pending).then(() => { (window as unknown as { __ready: boolean }).__ready = true; });
