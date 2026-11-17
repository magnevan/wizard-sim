/**
 * Characters drawn live from their 3D models (the user, 2026-11-17: "the 3D version is much better, and it's going to
 * be the more flexible approach"): every frame each one is posed from its RigState and rendered through a shader port
 * of tools/sprites-3d/pixelize.py, so it turns through every angle and plays its clips at any speed. Baked sheets
 * (art/sprites.ts) remain the fallback: until a model loads, past the atlas's slots, without WebGL2, or with ?live3d=0.
 *
 * The models are tools/sprites-3d/export.sh's: content/assets/models/<slug>.glb (normalised, props on their bones, one
 * animation per move) and <slug>.json (each attack's first, hit and last time, a cut hold, the archer's turn and
 * release). Copied from the bake so the two look alike: the camera (orthographic, 20 degrees up, 16 px a unit), the squash
 * (1.15 wide, 0.92 tall), the light, and pixelize's steps: render at 4x into two layers (each part's flat colour; the light
 * against it), each art pixel takes the commonest part of its 4x4 block and that part's means, then four tones, the dark
 * seams where parts meet, and an ink outline. prototypes/02-realtime-3d measured it: 100 goblins hold the frame rate on
 * an integrated laptop GPU.
 *
 * How a frame flows: spriteFrame asks liveFrame for a body's Frame during the view's draw loop; that books a slot of the
 * atlas and returns the slot's Pixi texture at once. flushLive(), after the loop, poses and renders every booked body into
 * its slot, shades the atlas, copies each slot into a 2D canvas laid out in rig cells (so silhouettes, shadows and tints
 * read it like any frame) and re-uploads that canvas. A slot belongs to one body for one frame.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { Rectangle, Texture } from 'pixi.js';
import { CELL_H, CELL_W, FEET_X, FEET_Y, type Anchors } from './rigs';
import type { Frame } from './actors';
import type { TeamPal } from './px';

export interface ModelMeta {
  slug: string; fps: number;
  /** stride: model units the ground passes under the feet in one loop (walk and run). */
  clips: Record<string, { source: string; duration: number; stride?: number }>;
  attacks: { clip: string; first: number; hit: number; last: number; cut: [number, number] | null }[];
  /** A clip's body turn: [degrees, ease in from, to, ease out from, to] in clip seconds. */
  yaw: Record<string, [number, number, number, number, number]>;
  /** A bow clip's release, in clip seconds: the string follows the draw hand until then. */
  release: Record<string, number>;
  /** The wizard's spell moves: each one-shot's first, release and last time (clip seconds). */
  casts?: Record<string, { first: number; hit: number; last: number }>;
  /** Props kept nearer upright than the hand holds them (the wizard's staff): a carrier node, its axis marker, the share of tilt kept. */
  soft?: { node: string; axis: string; k: number }[];
  /** Standing height in model units (--height included). */
  height?: number;
}
/** Art px of standing height per model unit, measured against the baked sheets (35 px for a 1.98-unit goblin). */
export const PX_PER_UNIT = 17;
/**
 * What to show: a move and a time into its clip, facing `face` (radians, 0 east, clockwise on screen); optionally a second
 * clip blended in with weight w2 (an attack's recovery handing over to the walk).
 */
export interface LivePose { move: string; t: number; face: number; flash: boolean; move2?: string; t2?: number; w2?: number; seat?: TeamPal }

const urls = import.meta.glob<string>('../../../../content/assets/models/*.glb', { eager: true, query: '?url', import: 'default' });
const metas = import.meta.glob<ModelMeta>('../../../../content/assets/models/*.json', { eager: true, import: 'default' });
const slugOfPath = (p: string) => p.split('/').pop()!.replace(/\.(glb|json)$/, '');
const META = new Map(Object.entries(metas).map(([p, m]) => [slugOfPath(p), m]));
const URLS = new Map(Object.entries(urls).map(([p, u]) => [slugOfPath(p), u]));

/** ?live3d=0 turns it off; ?live3d=1 keeps it on even on a software renderer (which otherwise gets the sheets). */
const LIVE3D_Q = (() => { try { return new URLSearchParams(globalThis.location?.search ?? '').get('live3d'); } catch { return null; } })();
/** On unless ?live3d=0 (and only in a browser). */
export const LIVE3D_ON = typeof document !== 'undefined' && LIVE3D_Q !== '0';
export const liveMeta = (slug: string): ModelMeta | undefined => META.get(slug);

// ---- the atlas ------------------------------------------------------------------------------------------------------------
const PPU = 16, SUPER = 4, ELEV = (20 * Math.PI) / 180;
const SQUASH = new THREE.Vector3(1.15, 0.92, 1.15);
const SUN = 2.5, AMB = 1.4, BANDS = [0.55, 0.85, 1.25];
/** Slots: small ones for goblins, big ones for the chieftain; the body's feet sit at FEET of its slot. */
const SMALL = { size: 64, feet: [32, 56], cols: 12, rows: 6 };
const BIG = { size: 128, feet: [64, 112], cols: 6, rows: 1 };
const BIG_SLUGS = new Set(['chieftain']);
const AW = SMALL.cols * SMALL.size, AH = SMALL.rows * SMALL.size + BIG.rows * BIG.size;
const NSMALL = SMALL.cols * SMALL.rows, NBIG = BIG.cols * BIG.rows;
/** The 2D canvas the game reads: one rig cell per slot. */
const CCOLS = 12, CROWS = Math.ceil((NSMALL + NBIG) / CCOLS);

interface Slot { big: boolean; x: number; y: number; cx: number; cy: number; tex: Texture | null; frame: Frame | null }
function slotRect(big: boolean, k: number): [number, number] {
  return big ? [(k % BIG.cols) * BIG.size, SMALL.rows * SMALL.size + Math.floor(k / BIG.cols) * BIG.size] : [(k % SMALL.cols) * SMALL.size, Math.floor(k / SMALL.cols) * SMALL.size];
}
const slots: Slot[] = [];
for (let k = 0; k < NSMALL + NBIG; k++) {
  const big = k >= NSMALL, [x, y] = slotRect(big, big ? k - NSMALL : k);
  slots.push({ big, x, y, cx: (k % CCOLS) * CELL_W, cy: Math.floor(k / CCOLS) * CELL_H, tex: null, frame: null });
}

// ---- GL state, made on first use ------------------------------------------------------------------------------------------------
interface Gl {
  renderer: THREE.WebGLRenderer; hiRT: THREE.WebGLRenderTarget; lowRT: THREE.WebGLRenderTarget;
  resolve: THREE.Scene; shade: THREE.Scene; quadCam: THREE.OrthographicCamera;
  scene: THREE.Scene; stage: THREE.Group; camSmall: THREE.OrthographicCamera; camBig: THREE.OrthographicCamera;
  out: HTMLCanvasElement; ctx: CanvasRenderingContext2D; base: Texture;
}
let gl: Gl | null = null, failed = false;

const TONE_GLSL = `
  vec3 toSrgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
  float lumaOf(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
  vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y); float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
  }
  vec3 hsv2rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
    return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
  }
  float shiftHue(float h, float to, float amt) { float d = fract(to - h + 0.5) - 0.5; return fract(h + d * amt); }
  vec3 toneOf(vec3 srgb, int lv) {   // pixelize.py tone(): 0 dark, 1 shadow, 2 base, 3 light
    vec3 c = rgb2hsv(srgb);
    if (lv == 0) c = vec3(shiftHue(c.x, 0.7, 0.10), min(1.0, c.y * 1.1 + 0.05), c.z * 0.46);
    else if (lv == 1) c = vec3(shiftHue(c.x, 0.7, 0.05), min(1.0, c.y * 1.05), c.z * 0.7);
    else if (lv == 3) c = vec3(shiftHue(c.x, 0.15, 0.06), c.y * 0.85, min(1.0, c.z * 1.2 + 0.04));
    return hsv2rgb(c);
  }`;
// which slot an atlas pixel is in (top-down rows), so outlines and seams never reach into a neighbour's slot
const SLOT_GLSL = `
  int slotAt(ivec2 p) {
    int y = ${AH} - 1 - p.y;
    if (p.x < 0 || p.x >= ${AW} || y < 0) return -1;
    if (y < ${SMALL.rows * SMALL.size}) return (y / ${SMALL.size}) * ${SMALL.cols} + p.x / ${SMALL.size};
    return ${NSMALL} + ((y - ${SMALL.rows * SMALL.size}) / ${BIG.size}) * ${BIG.cols} + p.x / ${BIG.size};
  }`;

function quad(frag: string, uniforms: Record<string, THREE.IUniform>): THREE.Scene {
  const m = new THREE.ShaderMaterial({
    uniforms, depthTest: false, depthWrite: false, glslVersion: THREE.GLSL3,
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'layout(location = 0) out highp vec4 pcColor;\n#define gl_FragColor pcColor\n' + frag,
  });
  const s = new THREE.Scene(); s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m));
  return s;
}

function makeGl(): Gl | null {
  if (failed || typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas'); canvas.width = AW; canvas.height = AH;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
    // a software renderer (SwiftShader: headless checks, machines without a usable GPU) takes minutes a frame's worth
    // of seconds here; those get the baked sheets
    const ctx3 = renderer.getContext(), info = ctx3.getExtension('WEBGL_debug_renderer_info');
    const gpu = String(info ? ctx3.getParameter(info.UNMASKED_RENDERER_WEBGL) : ctx3.getParameter(ctx3.RENDERER));
    if (/swiftshader|llvmpipe|software/i.test(gpu) && LIVE3D_Q !== '1') { renderer.dispose(); failed = true; return null; }
    renderer.setPixelRatio(1); renderer.setSize(AW, AH, false); renderer.toneMapping = THREE.NoToneMapping;
    renderer.setClearColor(0x000000, 0);
    const rt = (w: number, h: number, depth: boolean, count: number) => {
      const t = new THREE.WebGLRenderTarget(w, h, { count, depthBuffer: depth, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
      for (const x of t.textures) x.colorSpace = THREE.NoColorSpace;
      return t;
    };
    // two layers, as pixelize.py's two shots: [0] each part's flat colour (sRGB), [1] the light ratio (stored * 0.4)
    const hiRT = rt(AW * SUPER, AH * SUPER, true, 2), lowRT = rt(AW, AH, false, 2);
    const resolve = quad(`
      layout(location = 1) out highp vec4 oRatio;
      uniform sampler2D tFlat; uniform sampler2D tRatio;
      bool same(vec4 a, vec4 b) { return floor(a.rgb * 32.0) == floor(b.rgb * 32.0); }
      void main() {
        ivec2 p = ivec2(gl_FragCoord.xy) * ${SUPER};
        vec4 c[${SUPER * SUPER}]; float r[${SUPER * SUPER}]; int cover = 0;
        for (int j = 0; j < ${SUPER}; j++) for (int i = 0; i < ${SUPER}; i++) {
          int k = j * ${SUPER} + i;
          c[k] = texelFetch(tFlat, p + ivec2(i, j), 0); r[k] = texelFetch(tRatio, p + ivec2(i, j), 0).r;
          if (c[k].a > 0.5) cover++;
        }
        if (cover * 2 < ${SUPER * SUPER}) { gl_FragColor = vec4(0.0); oRatio = vec4(0.0); return; }
        int best = 0, bestN = 0;
        for (int a = 0; a < ${SUPER * SUPER}; a++) {
          if (c[a].a <= 0.5) continue;
          int n = 0;
          for (int b = 0; b < ${SUPER * SUPER}; b++) if (c[b].a > 0.5 && same(c[a], c[b])) n++;
          if (n > bestN) { bestN = n; best = a; }
        }
        vec4 w = vec4(0.0); for (int a = 0; a < ${SUPER * SUPER}; a++) if (a == best) w = c[a];
        vec3 sum = vec3(0.0); float rs = 0.0, m = 0.0;
        for (int b = 0; b < ${SUPER * SUPER}; b++) if (c[b].a > 0.5 && same(w, c[b])) { sum += c[b].rgb; rs += r[b]; m += 1.0; }
        gl_FragColor = vec4(sum / m, 1.0); oRatio = vec4(rs / m, 0.0, 0.0, 1.0);
      }`, { tFlat: { value: hiRT.textures[0] }, tRatio: { value: hiRT.textures[1] } });
    // four tones; the darker side of a meeting between two parts takes its dark tone (pixelize's seams: a neighbour of
    // another part brighter by 18 of 255); ink outside the shape. Only neighbours in the same slot count.
    const shade = quad(`
      uniform sampler2D tFlat; uniform sampler2D tRatio; uniform vec3 ink;
      ${TONE_GLSL}
      ${SLOT_GLSL}
      void main() {
        ivec2 p = ivec2(gl_FragCoord.xy); int s = slotAt(p);
        vec4 c = texelFetch(tFlat, p, 0); bool on = c.a > 0.5;
        ivec2 d[4] = ivec2[4](ivec2(1, 0), ivec2(-1, 0), ivec2(0, 1), ivec2(0, -1));
        bool near = false, seam = false; float L = lumaOf(c.rgb);
        for (int k = 0; k < 4; k++) {
          ivec2 q = p + d[k];
          if (slotAt(q) != s) continue;
          vec4 n = texelFetch(tFlat, q, 0);
          if (n.a <= 0.5) continue;
          near = true;
          if (on && floor(n.rgb * 32.0) != floor(c.rgb * 32.0) && L < lumaOf(n.rgb) - 18.0 / 255.0) seam = true;
        }
        if (!on) { gl_FragColor = near ? vec4(ink, 1.0) : vec4(0.0); return; }
        float ratio = texelFetch(tRatio, p, 0).r / 0.4;
        int lv = ratio < ${BANDS[0]} ? 0 : ratio < ${BANDS[1]} ? 1 : ratio < ${BANDS[2]} ? 2 : 3;
        gl_FragColor = vec4(toneOf(c.rgb, seam ? 0 : lv), 1.0);
      }`, { tFlat: { value: lowRT.textures[0] }, tRatio: { value: lowRT.textures[1] }, ink: { value: new THREE.Vector3(26 / 255, 18 / 255, 14 / 255) } });
    const scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight(0xffffff, SUN); sun.position.set(-7, 12, 9);
    scene.add(sun, sun.target, new THREE.AmbientLight(new THREE.Color(1, 0.95, 0.88), AMB));
    const stage = new THREE.Group(); scene.add(stage);
    // a slot's camera: the body's feet (the origin) land on the slot's feet point
    const cam = (o: typeof SMALL) => {
      const c = new THREE.OrthographicCamera(-o.feet[0] / PPU, (o.size - o.feet[0]) / PPU, o.feet[1] / PPU, -(o.size - o.feet[1]) / PPU, 0.1, 100);
      c.position.set(0, Math.sin(ELEV), Math.cos(ELEV)).multiplyScalar(40); c.lookAt(0, 0, 0); c.updateMatrixWorld();
      return c;
    };
    const out = document.createElement('canvas'); out.width = CCOLS * CELL_W; out.height = CROWS * CELL_H;
    const ctx = out.getContext('2d')!;
    const base = Texture.from(out); base.source.scaleMode = 'nearest';
    for (const s of slots) {
      s.tex = new Texture({ source: base.source, frame: new Rectangle(s.cx, s.cy, CELL_W, CELL_H) });
    }
    return { renderer, hiRT, lowRT, resolve, shade, quadCam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), scene, stage, camSmall: cam(SMALL), camBig: cam(BIG), out, ctx, base };
  } catch (e) {
    console.warn('live3d: off, falling back to the baked sheets', e);
    failed = true;
    return null;
  }
}

// ---- models and their instances -------------------------------------------------------------------------------------------------
/**
 * The material writes the two layers: each part's flat colour (sRGB) and the light against it. A hit flash turns the
 * whole body white.
 */
function toon(m: THREE.MeshLambertMaterial, flash: { value: number }, seat?: Seat): THREE.MeshLambertMaterial {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.flash = flash;
    sh.uniforms.seatOn = seat?.on ?? { value: 0 };
    sh.uniforms.seatMain = seat?.main ?? { value: new THREE.Vector3() };
    sh.uniforms.seatTrim = seat?.trim ?? { value: new THREE.Vector3() };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float flash; uniform float seatOn; uniform vec3 seatMain; uniform vec3 seatTrim;\nlayout(location = 1) out highp vec4 gRatio;\n' + TONE_GLSL)
      .replace('#include <opaque_fragment>', `
        vec3 albedo = toSrgb(diffuseColor.rgb);
        float ratio = lumaOf(toSrgb(outgoingLight)) / max(lumaOf(albedo), 0.03);
        if (seatOn > 0.5) {   // the seat's colours, as sprites.ts seatSheet: crimson cloth to the robe, gold to the trim
          vec3 h = rgb2hsv(albedo);
          if (h.z > 0.16 && h.y > 0.45) {
            if (h.x >= 320.0 / 360.0 || h.x <= 15.0 / 360.0) albedo = clamp(seatMain * (h.z / 0.62), 0.0, 1.0);
            else if (h.x >= 30.0 / 360.0 && h.x <= 58.0 / 360.0 && h.y > 0.6) albedo = clamp(seatTrim * min(1.1, h.z / 0.92), 0.0, 1.0);
          }
        }
        #include <opaque_fragment>
        gl_FragColor = vec4(mix(albedo, vec3(1.0), flash), 1.0);
        gRatio = vec4(mix(ratio, 1.0, flash) * 0.4, 0.0, 0.0, 1.0);`);
  };
  return m;
}

interface Model { scene: THREE.Object3D; clips: Map<string, THREE.AnimationClip>; meta: ModelMeta }
interface Seat { on: { value: number }; main: { value: THREE.Vector3 }; trim: { value: THREE.Vector3 } }
interface Soft { node: THREE.Object3D; axis: THREE.Object3D; k: number; rest: THREE.Quaternion }
interface Inst {
  seat: Seat; soft: Soft[]; tip: THREE.Object3D | null;
  root: THREE.Group; shift: THREE.Group; turn: THREE.Group; body: THREE.Object3D; mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>; hips: THREE.Object3D | null; rest: THREE.Vector3; flash: { value: number };
  bow: { tips: THREE.Object3D[]; nock: THREE.Object3D; grip: THREE.Object3D; hand: THREE.Object3D; fore: THREE.Object3D; parts: THREE.Mesh[] } | null;
}
const models = new Map<string, Model | 'loading' | 'failed'>();
const pools = new Map<string, Inst[]>();
const loader = new GLTFLoader();

function model(slug: string): Model | null {
  const m = models.get(slug);
  if (m && m !== 'loading' && m !== 'failed') return m;
  if (!m) {
    const url = URLS.get(slug), meta = META.get(slug);
    if (!url || !meta) { models.set(slug, 'failed'); return null; }
    models.set(slug, 'loading');
    loader.loadAsync(url).then((g) => {
      models.set(slug, { scene: g.scene, clips: new Map(g.animations.map((a) => [a.name, a])), meta });
    }).catch((e) => { console.warn('live3d: could not load', slug, e); models.set(slug, 'failed'); });
  }
  return null;
}

/** A node by its Blender name: the glTF loader turns spaces into underscores and drops a few characters. */
const node = (o: THREE.Object3D, name: string) => o.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));
const hexVec = (h: string) => new THREE.Vector3(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

function instance(slug: string, m: Model): Inst {
  const flash = { value: 0 };
  const seat: Seat = { on: { value: 0 }, main: { value: new THREE.Vector3() }, trim: { value: new THREE.Vector3() } };
  const body = SkeletonUtils.clone(m.scene);
  body.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.material as THREE.MeshStandardMaterial;
    mesh.material = toon(new THREE.MeshLambertMaterial({ map: src.map, color: src.color, emissive: src.emissive, emissiveMap: src.emissiveMap }), flash, seat);
    mesh.frustumCulled = false;
  });
  const turn = new THREE.Group(); turn.add(body);
  const shift = new THREE.Group(); shift.add(turn);
  const root = new THREE.Group(); root.add(shift); root.scale.copy(SQUASH);
  root.updateMatrixWorld(true);
  const hips = body.getObjectByName('Hips') ?? null;
  const rest = hips ? root.worldToLocal(hips.getWorldPosition(new THREE.Vector3())) : new THREE.Vector3();
  const mixer = new THREE.AnimationMixer(body);
  const actions = new Map([...m.clips].map(([k, c]) => [k, mixer.clipAction(c)]));
  let bow: Inst['bow'] = null;
  const tipA = node(body, 'bow tip+'), tipB = node(body, 'bow tip-'), nock = node(body, 'bow nock'), grip = node(body, 'bow grip point');
  const hand = node(body, 'RightHand'), fore = node(body, 'RightForeArm');
  if (tipA && tipB && nock && grip && hand && fore) {
    const strMat = toon(new THREE.MeshLambertMaterial({ color: new THREE.Color(0.85, 0.78, 0.55) }), flash);
    const woodMat = toon(new THREE.MeshLambertMaterial({ color: new THREE.Color(0.45, 0.24, 0.1) }), flash);
    const ironMat = toon(new THREE.MeshLambertMaterial({ color: new THREE.Color(0.32, 0.32, 0.34) }), flash);
    const rod = (r: number, mat: THREE.Material) => { const g = new THREE.CylinderGeometry(r, r, 1, 5); g.translate(0, 0.5, 0); const x = new THREE.Mesh(g, mat); x.frustumCulled = false; return x; };
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.17, 4), ironMat);
    bow = { tips: [tipA, tipB], nock, grip, hand, fore, parts: [rod(0.014, strMat), rod(0.014, strMat), rod(0.02, woodMat), head] };
  }
  const soft: Soft[] = [];
  for (const sp of m.meta.soft ?? []) {
    const n = node(body, sp.node), ax = node(body, sp.axis);
    if (n && ax) soft.push({ node: n, axis: ax, k: sp.k, rest: n.quaternion.clone() });
  }
  return { seat, soft, tip: node(body, 'staff socket') ?? null, root, shift, turn, body, mixer, actions, hips, rest, flash, bow };
}

const ease = (t: number) => t * t * (3 - 2 * t);
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
function rodBetween(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
  const d = v3.subVectors(b, a), len = d.length();
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(up, d.divideScalar(len || 1));
  mesh.scale.set(1, len, 1);
  mesh.updateMatrixWorld(true);
}

/** Poses an instance: the clip at its time, the clip's body turn, the hips held over the feet as the bake does. */
function pose(inst: Inst, m: Model, p: LivePose): void {
  const clipName = m.clips.has(p.move) ? p.move : 'walk';
  const second = p.move2 && p.w2 && m.clips.has(p.move2) && p.move2 !== clipName ? p.move2 : null;
  // each playing clip at its own time and weight; update(0) applies them
  for (const [k, a] of inst.actions) {
    const on = k === clipName ? 1 - (second ? p.w2! : 0) : k === second ? p.w2! : 0;
    if (!on) { if (a.isRunning()) a.stop(); continue; }
    if (!a.isRunning()) { a.reset(); a.play(); }
    a.setEffectiveWeight(on);
    a.time = Math.min(Math.max(0, k === clipName ? p.t : p.t2 ?? 0), a.getClip().duration - 1e-4);
  }
  inst.mixer.update(0);
  const y = m.meta.yaw[clipName];
  let k = 0;
  if (y) {
    const [, a, b, c, d] = y, t = p.t;
    k = t <= a || t >= d ? 0 : t < b ? ease((t - a) / (b - a)) : t > c ? ease((d - t) / (d - c)) : 1;
  }
  inst.turn.rotation.y = y ? (y[0] * k * Math.PI) / 180 : 0;
  inst.root.rotation.y = Math.PI / 2 - p.face;
  inst.shift.position.set(0, 0, 0);
  inst.root.updateMatrixWorld(true);
  if (inst.hips) {   // sprites stay put (the game moves them): cancel the hips' travel over the ground, keep their rise and fall
    const h = inst.root.worldToLocal(inst.hips.getWorldPosition(v1));
    inst.shift.position.set(-(h.x - inst.rest.x), 0, -(h.z - inst.rest.z));
    inst.root.updateMatrixWorld(true);
  }
  inst.flash.value = p.flash ? 1 : 0;
  inst.seat.on.value = p.seat ? 1 : 0;
  if (p.seat) { inst.seat.main.value.copy(hexVec(p.seat.main)); inst.seat.trim.value.copy(hexVec(p.seat.trim)); }
  if (inst.soft.length) softProps(inst, p.face);
}

const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qp = new THREE.Quaternion(), qi = new THREE.Quaternion();
/**
 * render.py soft_props: each soft prop's main axis is turned from where the hand holds it back toward upright (leaning
 * a little toward the facing), keeping k of the hand's tilt; it turns about the carrier's own origin, the wrist.
 */
function softProps(inst: Inst, face: number): void {
  for (const s of inst.soft) {
    s.node.quaternion.copy(s.rest);
    s.node.updateMatrixWorld(true);
    const p = s.node.getWorldPosition(v1), a = s.axis.getWorldPosition(v2).sub(p).normalize();
    const want = v3.set(Math.cos(face) * 0.12, 1, Math.sin(face) * 0.12).normalize();
    const turn = qa.setFromUnitVectors(a, want);
    qi.identity().slerp(turn, 1 - s.k);
    // world rotation -> the carrier's local one
    s.node.getWorldQuaternion(qb);
    s.node.parent!.getWorldQuaternion(qp);
    s.node.quaternion.copy(qp.invert().multiply(qi).multiply(qb));
    s.node.updateMatrixWorld(true);
  }
}

/** The archer's string: tip to the draw hand to tip, with an arrow nocked, while drawing and before the release. */
function stringOf(inst: Inst, m: Model, p: LivePose, stage: THREE.Group): void {
  const bw = inst.bow!;
  for (const x of bw.parts) stage.remove(x);
  const a = bw.tips[0].getWorldPosition(new THREE.Vector3()), b = bw.tips[1].getWorldPosition(new THREE.Vector3());
  const n0 = bw.nock.getWorldPosition(new THREE.Vector3()), g = bw.grip.getWorldPosition(new THREE.Vector3());
  const w0 = bw.fore.getWorldPosition(new THREE.Vector3()), w1 = bw.hand.getWorldPosition(new THREE.Vector3());
  const L = a.distanceTo(b), u = v1.subVectors(a, b).normalize().clone(), f = v2.subVectors(g, n0).normalize().clone();
  const rh = w1.clone().add(w1.clone().sub(w0).normalize().multiplyScalar(0.09 * L / 1.12));   // the palm
  const rel = rh.clone().sub(g), along = rel.dot(f), vert = rel.dot(u), lat = rel.clone().sub(f.clone().multiplyScalar(along)).sub(u.clone().multiplyScalar(vert)).length();
  const release = m.meta.release[p.move];
  const hooked = p.move.startsWith('attack') && along < -0.05 * L && lat < 0.3 * L && Math.abs(vert) < 0.3 * L && (release === undefined || p.t <= release);
  const mid = hooked ? rh : n0;
  rodBetween(bw.parts[0], a, mid); rodBetween(bw.parts[1], mid, b);
  stage.add(bw.parts[0], bw.parts[1]);
  if (hooked) {
    const tipEnd = g.clone().add(g.clone().sub(rh).normalize().multiplyScalar(0.3 * L / 1.12));
    rodBetween(bw.parts[2], rh, tipEnd);
    const head = bw.parts[3]; head.position.copy(tipEnd); head.quaternion.setFromUnitVectors(up, tipEnd.clone().sub(rh).normalize()); head.updateMatrixWorld(true);
    stage.add(bw.parts[2], head);
  }
}

// ---- booking and flushing --------------------------------------------------------------------------------------------------------
interface Booking { slug: string; slot: Slot; pose: LivePose; key: string }
/** Each live body's staff tip last frame (art px from the feet), where its spells start (anchors tip and charge). */
const tips = new Map<string, [number, number]>();
const booked: Booking[] = [];
let nextSmall = 0, nextBig = 0;

/**
 * A body's live frame for this draw, or null (live drawing is off, its model isn't loaded yet, or the atlas is full):
 * the caller falls back to the baked sheet. `anchors` are the rig's, already fitted to the sprite's height.
 */
export function liveFrame(slug: string, p: LivePose, anchors: Anchors, who = 0): Frame | null {
  if (!LIVE3D_ON || failed) return null;
  if (!model(slug)) return null;
  if (!gl) gl = makeGl();
  if (!gl) return null;
  const big = BIG_SLUGS.has(slug);
  const k = big ? (nextBig < NBIG ? NSMALL + nextBig++ : -1) : (nextSmall < NSMALL ? nextSmall++ : -1);
  if (k < 0) return null;
  const slot = slots[k], key = slug + '|' + who, tip = tips.get(key);
  if (tip) anchors = { ...anchors, tip, charge: tip };
  booked.push({ slug, slot, pose: p, key });
  if (!slot.frame) slot.frame = { tex: slot.tex!, a: anchors, c: gl.out, sx: slot.cx, sy: slot.cy };
  else slot.frame = { ...slot.frame, a: anchors };
  return slot.frame;
}

/** Renders every body booked this draw into its slot and hands the atlas to Pixi. Call once a draw, after the bodies. */
export function flushLive(): void {
  const g = gl;
  const used = booked.splice(0);
  nextSmall = 0; nextBig = 0;
  if (!g || !used.length) return;
  const { renderer, hiRT, lowRT, scene, stage } = g;
  // only the rows in use are cleared and shaded (top-down y0..y1 of the atlas; GL rows run bottom up)
  let y0 = AH, y1 = 0;
  for (const b of used) { const size = b.slot.big ? BIG.size : SMALL.size; y0 = Math.min(y0, b.slot.y); y1 = Math.max(y1, b.slot.y + size); }
  const gy = AH - y1, gh = y1 - y0;
  renderer.setRenderTarget(hiRT);
  hiRT.viewport.set(0, 0, AW * SUPER, AH * SUPER);
  hiRT.scissor.set(0, gy * SUPER, AW * SUPER, gh * SUPER); hiRT.scissorTest = true;
  renderer.setRenderTarget(hiRT);
  renderer.clear();
  const n = new Map<string, number>();
  for (const b of used) {
    const m = models.get(b.slug) as Model;
    const i = n.get(b.slug) ?? 0; n.set(b.slug, i + 1);
    let pool = pools.get(b.slug);
    if (!pool) pools.set(b.slug, (pool = []));
    const inst = pool[i] ?? (pool[i] = instance(b.slug, m));
    pose(inst, m, b.pose);
    stage.add(inst.root);
    if (inst.bow) stringOf(inst, m, b.pose, stage);
    // the slot in the 4x target (GL's rows run bottom up)
    const size = b.slot.big ? BIG.size : SMALL.size;
    const x = b.slot.x * SUPER, y = (AH - b.slot.y - size) * SUPER, w = size * SUPER;
    hiRT.viewport.set(x, y, w, w); hiRT.scissor.set(x, y, w, w); hiRT.scissorTest = true;
    renderer.setRenderTarget(hiRT);
    const cam = b.slot.big ? g.camBig : g.camSmall;
    renderer.render(scene, cam);
    if (inst.tip) {   // the staff's socket, projected into the slot, as art px from the feet
      const o = b.slot.big ? BIG : SMALL, q = inst.tip.getWorldPosition(v1).project(cam);
      tips.set(b.key, [Math.round((q.x + 1) / 2 * o.size - o.feet[0]), Math.round((1 - q.y) / 2 * o.size - o.feet[1])]);
    }
    stage.clear();
  }
  hiRT.scissorTest = false; hiRT.viewport.set(0, 0, AW * SUPER, AH * SUPER);
  lowRT.scissor.set(0, gy, AW, gh); lowRT.scissorTest = true;
  renderer.setRenderTarget(lowRT); renderer.render(g.resolve, g.quadCam);
  renderer.setRenderTarget(null);
  renderer.setScissor(0, gy, AW, gh); renderer.setScissorTest(true);
  renderer.render(g.shade, g.quadCam);
  renderer.setScissorTest(false);
  // each slot into its rig cell, the feet on the cell's feet point
  const { ctx } = g, canvas = renderer.domElement;
  for (const b of used) {
    const o = b.slot.big ? BIG : SMALL;
    ctx.clearRect(b.slot.cx, b.slot.cy, CELL_W, CELL_H);
    // the part of the slot that fits the cell
    const dx = FEET_X - o.feet[0], dy = FEET_Y - o.feet[1];
    const sx = Math.max(0, -dx), sy = Math.max(0, -dy), w = Math.min(o.size - sx, CELL_W - Math.max(0, dx)), h = Math.min(o.size - sy, CELL_H - Math.max(0, dy));
    ctx.drawImage(canvas, b.slot.x + sx, b.slot.y + sy, w, h, b.slot.cx + Math.max(0, dx), b.slot.cy + Math.max(0, dy), w, h);
  }
  g.base.source.update();
}
