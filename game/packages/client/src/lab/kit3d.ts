/**
 * The kit test's greybox (2026-11-23, docs/explorations/2026-11-23-flexible-building.md): a layout compiled by
 * tools/kit/compile.py into instances of made pieces, drawn by kit-render.ts (fitted Meshy models where made, plain
 * placeholders of their exact size elsewhere), so the joins can be judged. Its own page (kit3d.html).
 * ?layout=patch-a, ?x=&y= target (u), ?view=26, ?pitch=46, ?yaw=0 (degrees, turns the camera round the target),
 * ?wiz=0 hides the wizard, ?art=0 draws placeholders only. ?stones=0 draws kerbs plain and no road courses.
 * ?plan=30 looks straight down on 30 u across (north up, no shadows, only floors and kerbs): the guide a ground painting is
 * painted over; ?paint=paint/x.png&prect=x0,y0,x1,y1 lays a ground painting over that rectangle (u). The map editor (editor.html) edits the same scenes live.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import wizMeta from '../../../../content/assets/models/wizard.json';
import { buildKit, groundPlane, KIT_OPTS, loadKitArt, setGroundPaint, setKitPieces, setupStage, spinKit, yOf, type KitData } from './kit-render';

const q = new URLSearchParams(location.search);
const layouts = import.meta.glob<KitData>('./kit-*.json', { eager: true, import: 'default' });
const data = layouts[`./kit-${q.get('layout') ?? 'patch-a'}.json`];
const modelUrls = import.meta.glob<string>('../../../../content/assets/models/wizard.glb', { eager: true, query: '?url', import: 'default' });

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const sun = setupStage(renderer, scene);

if (q.get('art') !== '0') await loadKitArt();
// the kit's pieces (set pieces' sizes, decals) from the dev server's scene server, when there is one
await fetch('/__map/kit').then((r) => r.json()).then((k) => setKitPieces(k.pieces)).catch(() => undefined);
KIT_OPTS.stones = q.get('stones') !== '0';
const PLAN = Number(q.get('plan') ?? 0);
if (PLAN) renderer.shadowMap.enabled = false;
if (q.get('paint')) await setGroundPaint(q.get('paint'), (q.get('prect') ?? '').split(',').map(Number) as [number, number, number, number], Number(q.get('pgain') ?? 1));
scene.add(groundPlane(data), buildKit(PLAN ? { ...data, instances: data.instances.filter((i) => /^(edge|sweep)\.kerb/.test(i.p)), courses: [] } : data));

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
const cam: THREE.PerspectiveCamera | THREE.OrthographicCamera = PLAN ? new THREE.OrthographicCamera() : new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.5, 500);
function frame() {
  if (cam instanceof THREE.OrthographicCamera) {     // straight down, north up, PLAN u across
    const hw = PLAN / 2, hh = hw * innerHeight / innerWidth;
    Object.assign(cam, { left: -hw, right: hw, top: hh, bottom: -hh, near: 1, far: 400 });
    cam.position.set(target.x, 200, target.z); cam.up.set(0, 0, -1); cam.lookAt(target.x, 0, target.z); cam.updateProjectionMatrix();
    sun.position.set(target.x, 100, target.z + 0.01); sun.target.position.set(target.x, 0, target.z);
    return;
  }
  cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
  const dist = (VIEW_H * Math.sin(PITCH)) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
  const t = target.clone().setY(yOf(Number(q.get('th') ?? 1.5)));
  const back = new THREE.Vector3(Math.sin(YAW), 0, Math.cos(YAW)).multiplyScalar(Math.cos(PITCH) * dist).add(new THREE.Vector3(0, Math.sin(PITCH) * dist, 0));
  cam.position.copy(t).add(back); cam.lookAt(t);
  sun.position.copy(t).add(new THREE.Vector3(-30, 40, 22)); sun.target.position.copy(t);
}
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); frame(); });
frame();
const loop = () => { spinKit(performance.now() / 1000); renderer.render(scene, cam); requestAnimationFrame(loop); };
loop();
Promise.all(pending).then(() => { (window as unknown as { __ready: boolean }).__ready = true; });
