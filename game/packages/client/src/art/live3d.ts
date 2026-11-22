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
import { opt } from '../dev-options';

export interface ModelMeta {
  slug: string; fps: number;
  /** stride: model units the ground passes under the feet in one loop (walk and run). */
  clips: Record<string, { source: string; duration: number; stride?: number }>;
  attacks: { clip: string; first: number; hit: number; last: number; cut: [number, number] | null }[];
  /** A clip's body turn: [degrees, ease in from, to, ease out from, to] in clip seconds. */
  yaw: Record<string, [number, number, number, number, number]>;
  /** A guard carrier's face marker by carrier node (the export's FACES): its face normal, squared to the body while blocking. */
  faces?: Record<string, string>;
  /** A bow clip's release, in clip seconds: the string follows the draw hand until then. */
  release: Record<string, number>;
  /** The wizard's spell moves: each one-shot's first, release and last time (clip seconds). */
  casts?: Record<string, { first: number; hit: number; last: number }>;
  /** Props kept nearer upright than the hand holds them (the wizard's staff): a carrier node, its axis marker, the share of tilt kept. */
  soft?: { node: string; axis: string; k: number; firm?: string[] }[];
  /** Each held prop's carrier node (at the grip) and its bone; `drop`: it falls from the hand when its holder dies. */
  props?: { node: string; name?: string; bone: string; drop: boolean }[];
  /** The props shown when a pose names none (the wizard: its staff; its conjured weapons and guards wait hidden). */
  show?: string[];
  /** Standing height in model units (--height included). */
  height?: number;
}
/** Art px of standing height per model unit, measured against the baked sheets (35 px for a 1.98-unit goblin). */
export const PX_PER_UNIT = 17;
/**
 * What to show: a move and a time into its clip, facing `face` (radians, 0 east, clockwise on screen); optionally a second
 * clip blended in with weight w2 (an attack's recovery handing over to the walk).
 */
export interface LivePose {
  move: string; t: number; face: number; flash: boolean; move2?: string; t2?: number; w2?: number; seat?: TeamPal;
  /** Walking while the move plays: the move drives the upper body, this clip (walk or run) at time tl the hips and legs. */
  legs?: string; tl?: number;
  /** A thrust: how far the shaft is turned to point along the facing (0..1), whatever the hand's tilt. */
  aim?: number;
  /** How firmly a soft prop is held, 0 (kept upright) to 1 (every turn of the hand); by default 1 in its `firm` moves. */
  grip?: number;
  /**
   * Blended transitions (inertialization, `blendPose`): when the move changes or its clip time jumps, the body eases from
   * the pose last shown into the new one, its gap closing with this half-life (s). Unset: no blending (the goblins).
   */
  hl?: number;
  /** The clock for blending (s); by default the page's. The Model Viewer passes its own timeline's. */
  now?: number;
  /** A jab: how far (model units) the shaft slides forward through the hands, along the facing. */
  slide?: number;
  /**
   * A two-handed swing (the maul): the weapon's haft is turned to run out along the arms, from the shoulders' middle
   * through the hands', so its head leads the swing and lands ahead of the fists instead of riding the wrist (the user,
   * 2026-11-21: "it just looks like the character slamming the ground with his fist"). The number leans it down by that
   * much per unit of the arm line (a level arm line at 0.8 points the haft 39° down, to the ground; one overhead stays up).
   */
  haft?: number;
  /**
   * A maul's swing (sprites.ts SMASH_ARC): the haft pointed [elevation, sideways] degrees from the facing (0 level
   * ahead, 90 up, past 90 back over the shoulders; sideways to the wielder's right), about the palm. Over `haft`.
   */
  arc?: readonly [number, number];
  /**
   * The whole body turned this many degrees toward its right (at the hips, so the blend eases it in and out): a clip
   * that strikes off its own facing, as the jab's thrust drives 49° to the left, is turned so the strike runs along it.
   */
  turn?: number;
  /** The guard slung behind the shoulder (0..1): a two-handed weapon (the bow, the maul) leaves it on the back. By default 1 while the bow shoots. */
  sling?: number;
  /** The props to show by name (ModelMeta.props); the rest are hidden. By default the model's `show`, else all. */
  props?: readonly string[];
  /** Blocking, 0..1: the strapped guard goes from its carried place at the side to square in front of the chest (placeGuard). */
  guardUp?: number;
}

const urls = import.meta.glob<string>('../../../../content/assets/models/*.glb', { eager: true, query: '?url', import: 'default' });
const metas = import.meta.glob<ModelMeta>('../../../../content/assets/models/*.json', { eager: true, import: 'default' });
const slugOfPath = (p: string) => p.split('/').pop()!.replace(/\.(glb|json)$/, '');
const META = new Map(Object.entries(metas).map(([p, m]) => [slugOfPath(p), m]));
const URLS = new Map(Object.entries(urls).map(([p, u]) => [slugOfPath(p), u]));

/** ?live3d=0 turns it off; ?live3d=1 keeps it on even on a software renderer (which otherwise gets the sheets). */
const LIVE3D_Q = opt('live3d');
/** On unless ?live3d=0 (and only in a browser). */
export const LIVE3D_ON = typeof document !== 'undefined' && LIVE3D_Q !== '0';
export const liveMeta = (slug: string): ModelMeta | undefined => META.get(slug);

// ---- the atlas ------------------------------------------------------------------------------------------------------------
const PPU = 16, SUPER = 4, ELEV = (20 * Math.PI) / 180;
const SQUASH = new THREE.Vector3(1.15, 0.92, 1.15);
const SUN = 2.5, AMB = 1.4, BANDS = [0.55, 0.85, 1.25];
/** Slots: small ones for goblins, big ones for the chieftain; the body's feet sit at FEET of its slot. */
// (80 px, as wide as the rig cell: at 64 a jabbing trident's head was cut off 32 px out, the user 2026-11-20)
const SMALL = { size: 80, feet: [40, 68], cols: 12, rows: 6 };
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
    const sun = new THREE.DirectionalLight(0xffffff, SUN); sun.position.set(-7, 12, 9); // LIVE_VIEW.sun
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
/** Seconds, for the animated shells (FX_GLSL); set once a draw by flushLive. */
const fxTime = { value: 0 };
/**
 * The guards' animated shells (docs/explorations/2026-11-17-guard-refinement.md), by the Blender material's name:
 * 1 a rainbow sweeping across (the Prism), 2 a slow hot pulse (the Ember's core), 3 a dithered see-through ward with
 * rings rippling out (the Mirror's halo), 4 bands flowing across (the Tide's water). 0 for every other material.
 */
function fxModeOf(name: string): number {
  if (/^arm magenta/.test(name)) return 1;
  if (/^arm (flame core|ember red)/.test(name)) return 2;
  if (/^arm halo/.test(name)) return 3;
  if (/^arm water/.test(name)) return 4;
  return 0;
}
// object-space position, so a pattern sticks to the prop as it moves; a 4x4 Bayer threshold for the ward's see-through
const FX_GLSL = `
  float bayer4(vec2 p) { ivec2 q = ivec2(mod(p, 4.0)); int i = q.x + q.y * 4;
    int b[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5); return (float(b[i]) + 0.5) / 16.0; }`;
const FX_FRAG = `
  if (fxMode == 1) {
    // the Prism: light it reflects, its hue set by each facet's angle to the camera (the view-space normal), added on
    // top; standing still it holds still, and it shifts as the guard turns (the user: not a rainbow that runs on)
    vec3 nv = normalize(vNormal);
    float hh = fract(nv.x * 0.55 + nv.y * 0.35 + 0.1);
    albedo = mix(albedo, hsv2rgb(vec3(hh, 0.65, max(0.8, rgb2hsv(albedo).z))), 0.45);   // mixed in, not added (added, it blew out to white)
  } else if (fxMode == 2) {
    // the Ember: a shield of flame, not a glowing red disc: its rock flickers between deep red and yellow
    float fl = 0.5 + 0.5 * sin(dot(vFx, vec3(23.0, 17.0, 19.0)) + fxTime * 6.0) * sin(dot(vFx, vec3(-11.0, 29.0, 7.0)) - fxTime * 4.3);
    albedo = mix(vec3(0.82, 0.16, 0.05), vec3(1.0, 0.82, 0.25), fl);
    ratio *= 0.9 + 0.25 * fl;
  } else if (fxMode == 3) {
    // a soft shimmer: mostly see-through, slow faint swells rather than hard rings (round 3: the rings read as a target)
    float band = sin(length(vFx) * 30.0 - fxTime * 3.0);
    if (bayer4(gl_FragCoord.xy * 0.5) > 0.38 + 0.12 * band) discard;
    ratio *= 1.0 + 0.15 * max(band, 0.0);
  } else if (fxMode == 4) {
    ratio *= 0.85 + 0.3 * sin(dot(vFx, vec3(38.0, 27.0, 33.0)) - fxTime * 7.0);
  }`;

function toon(m: THREE.MeshLambertMaterial, flash: { value: number }, seat?: Seat, fxMode = 0): THREE.MeshLambertMaterial {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.fxMode = { value: fxMode };
    sh.uniforms.fxTime = fxTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFx;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFx = position;');
    sh.uniforms.flash = flash;
    sh.uniforms.seatOn = seat?.on ?? { value: 0 };
    sh.uniforms.seatMain = seat?.main ?? { value: new THREE.Vector3() };
    sh.uniforms.seatTrim = seat?.trim ?? { value: new THREE.Vector3() };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float flash; uniform float seatOn; uniform vec3 seatMain; uniform vec3 seatTrim;\nuniform int fxMode; uniform float fxTime; varying vec3 vFx;\nlayout(location = 1) out highp vec4 gRatio;\n' + TONE_GLSL + FX_GLSL)
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
        ${FX_FRAG}
        #include <opaque_fragment>
        gl_FragColor = vec4(mix(albedo, vec3(1.0), flash), 1.0);
        gRatio = vec4(mix(ratio, 1.0, flash) * 0.4, 0.0, 0.0, 1.0);`);
  };
  return m;
}

interface Model { scene: THREE.Object3D; clips: Map<string, THREE.AnimationClip>; meta: ModelMeta }
/** The tracks a walking body's legs drive: the hips (the body's sway and travel) and both legs (Meshy's bone names). */
const LOWER = /^(Hips|(Left|Right)(UpLeg|Leg|Foot|ToeBase))\./;
interface Seat { on: { value: number }; main: { value: THREE.Vector3 }; trim: { value: THREE.Vector3 } }
interface Soft { node: THREE.Object3D; axis: THREE.Object3D; k: number; rest: THREE.Quaternion; restPos: THREE.Vector3; firm: string[] }
/** A held prop that falls when its holder dies: its carrier, the carrier's own local matrix, and its shape (carrier space). */
interface Drop { node: THREE.Object3D; rest: THREE.Matrix4; box: THREE.Box3; slide: boolean }
/**
 * A prop by name: its carrier, and in the carrier's frame its far end along its main axis (a soft prop's: the weapon's
 * tip, where its particles run to) and the middle of its shape (a guard's).
 */
interface Carrier { name: string; node: THREE.Object3D; held: boolean; left: boolean; tip: THREE.Vector3 | null; mid: THREE.Vector3; axes: THREE.Vector3[]; face?: THREE.Object3D }
/** A shape's three half-extents along its box's axes, longest first: a guard's face is the first two, its normal the last. */
function halfAxes(box: THREE.Box3): THREE.Vector3[] {
  const s = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  return [new THREE.Vector3(s.x, 0, 0), new THREE.Vector3(0, s.y, 0), new THREE.Vector3(0, 0, s.z)].sort((a, b) => b.length() - a.length());
}
interface Inst {
  seat: Seat; soft: Soft[]; drops: Drop[]; carriers: Carrier[]; bowOf: THREE.Object3D | null; hands: [THREE.Object3D, THREE.Object3D] | null;
  root: THREE.Group; shift: THREE.Group; turn: THREE.Group; body: THREE.Object3D; mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>; hips: THREE.Object3D | null; rest: THREE.Vector3; flash: { value: number };
  /** The upper arms (left, right), for the body's frame from its shoulders (placeGuard). */
  arms: [THREE.Object3D, THREE.Object3D] | null;
  /** The guard arm's bones (shoulder to hand) and the standing pose they are held toward while a guard is carried (pinGuardArm). */
  pin: { bones: THREE.Object3D[]; stand: THREE.Quaternion[] };
  bow: { tips: THREE.Object3D[]; nock: THREE.Object3D; grip: THREE.Object3D; hand: THREE.Object3D; fore: THREE.Object3D; parts: THREE.Mesh[] } | null;
  /** What blendPose eases: the skeleton's bones, then (from `nBones`) the soft props' carriers. Same order in every copy of a model. */
  blendNodes: THREE.Object3D[]; nBones: number;
  /**
   * The bones as the clips last left them, before any pinning or blending: put back before each pose, because three's
   * mixer only writes a value that changed, so a paused or standing clip would otherwise keep the last pose's offsets.
   */
  rawQ: Float32Array; rawP: Float32Array;
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
      const clips = new Map(g.animations.map((a) => [a.name, a]));
      // each clip's halves, so a move can play over walking legs (LivePose.legs): '<clip>:upper' is everything above
      // the hips, '<clip>:lower' the hips and legs
      for (const a of g.animations) {
        const lower = a.tracks.filter((t) => LOWER.test(t.name)), upper = a.tracks.filter((t) => !LOWER.test(t.name));
        clips.set(a.name + ':upper', new THREE.AnimationClip(a.name + ':upper', a.duration, upper));
        clips.set(a.name + ':lower', new THREE.AnimationClip(a.name + ':lower', a.duration, lower));
      }
      models.set(slug, { scene: g.scene, clips, meta });
    }).catch((e) => { console.warn('live3d: could not load', slug, e); models.set(slug, 'failed'); });
  }
  return null;
}

/** A node by its Blender name: the glTF loader turns spaces into underscores and drops a few characters. */
const node = (o: THREE.Object3D, name: string) => o.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));
const hexVec = (h: string) => new THREE.Vector3(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

function instance(slug: string, m: Model, original = false): Inst {
  const flash = { value: 0 };
  // the dev viewer's full-size view (lab/models.ts) keeps the model's own materials
  const look = (mat: THREE.MeshLambertMaterial) => (original ? mat : toon(mat, flash));
  const seat: Seat = { on: { value: 0 }, main: { value: new THREE.Vector3() }, trim: { value: new THREE.Vector3() } };
  const body = SkeletonUtils.clone(m.scene);
  body.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.material as THREE.MeshStandardMaterial;
    mesh.material = original ? src.clone() : toon(new THREE.MeshLambertMaterial({ map: src.map, color: src.color, emissive: src.emissive, emissiveMap: src.emissiveMap }), flash, seat, fxModeOf(src.name ?? ''));
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
    const strMat = look(new THREE.MeshLambertMaterial({ color: slug === 'wizard' ? new THREE.Color(0.75, 0.95, 1) : new THREE.Color(0.85, 0.78, 0.55) }));   // the wizard's bow is ice
    const woodMat = look(new THREE.MeshLambertMaterial({ color: new THREE.Color(0.45, 0.24, 0.1) }));
    const ironMat = look(new THREE.MeshLambertMaterial({ color: new THREE.Color(0.32, 0.32, 0.34) }));
    const rod = (r: number, mat: THREE.Material) => { const g = new THREE.CylinderGeometry(r, r, 1, 5); g.translate(0, 0.5, 0); const x = new THREE.Mesh(g, mat); x.frustumCulled = false; return x; };
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.17, 4), ironMat);
    bow = { tips: [tipA, tipB], nock, grip, hand, fore, parts: [rod(0.014, strMat), rod(0.014, strMat), rod(0.02, woodMat), head] };
  }
  const soft: Soft[] = [];
  for (const sp of m.meta.soft ?? []) {
    const n = node(body, sp.node), ax = node(body, sp.axis);
    if (n && ax) soft.push({ node: n, axis: ax, k: sp.k, rest: n.quaternion.clone(), restPos: n.position.clone(), firm: sp.firm ?? [] });
  }
  const drops: Drop[] = [], carriers: Carrier[] = [];
  body.updateMatrixWorld(true);
  for (const pr of m.meta.props ?? []) {
    const n = node(body, pr.node);
    if (!n) continue;
    // its shape in the carrier's frame, for laying it down on the ground
    const inv = n.matrixWorld.clone().invert(), box = new THREE.Box3();
    n.traverse((o) => {
      const g = (o as THREE.Mesh).geometry;
      if (!(o as THREE.Mesh).isMesh || !g) return;
      if (!g.boundingBox) g.computeBoundingBox();
      box.union(g.boundingBox!.clone().applyMatrix4(inv.clone().multiply(o.matrixWorld)));
    });
    if (box.isEmpty()) continue;
    if (pr.drop || !/Hand$/.test(pr.bone)) drops.push({ node: n, rest: n.matrix.clone(), box, slide: !/Hand$/.test(pr.bone) });   // a guard lets go in the death as a weapon does
    // the far end along a soft prop's axis (its marker is a child of the carrier, along the axis)
    const sp = m.meta.soft?.find((x) => x.node === pr.node), ax = sp ? node(body, sp.axis) : undefined;
    let tip: THREE.Vector3 | null = null;
    if (ax) {
      const d = ax.position.clone().normalize();
      let far = 0;
      for (let c = 0; c < 8; c++) far = Math.max(far, v1.set(c & 1 ? box.max.x : box.min.x, c & 2 ? box.max.y : box.min.y, c & 4 ? box.max.z : box.min.z).dot(d));
      tip = d.multiplyScalar(far);
    }
    carriers.push({ name: pr.name ?? pr.node.replace(/ carrier$/, ''), node: n, held: /Hand$/.test(pr.bone), left: /^Left/.test(pr.bone), tip, mid: box.getCenter(new THREE.Vector3()), axes: halfAxes(box), face: m.meta.faces?.[pr.node] ? node(body, m.meta.faces[pr.node]) : undefined });
  }
  // a bow's string is drawn only while its carrier shows (the wizard's ice bow waits hidden)
  let bowOf: THREE.Object3D | null = null;
  for (let o = tipA?.parent ?? null; o && !bowOf; o = o.parent) if (carriers.some((c) => c.node === o)) bowOf = o;
  const lh = body.getObjectByName('LeftHand'), rh = body.getObjectByName('RightHand');
  const hands: Inst['hands'] = lh && rh ? [lh, rh] : null;
  const la = body.getObjectByName('LeftArm'), ra = body.getObjectByName('RightArm');
  const arms: Inst['arms'] = la && ra ? [la, ra] : null;
  // the guard arm's standing pose: the walk's first frame (what a body standing still holds), read once
  const pin: Inst['pin'] = { bones: ['LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand'].map((n) => body.getObjectByName(n)).filter((o): o is THREE.Object3D => !!o), stand: [] };
  const walkAction = actions.get('walk');
  if (walkAction && m.meta.props?.some((pr) => !/Hand$/.test(pr.bone))) {
    walkAction.reset().play(); walkAction.time = 0; mixer.update(0);
    pin.stand = pin.bones.map((b) => b.quaternion.clone());
    walkAction.stop();
  }
  const bones: THREE.Object3D[] = [];
  body.traverse((o) => { if ((o as THREE.Bone).isBone) bones.push(o); });
  const rawQ = new Float32Array(bones.length * 4), rawP = new Float32Array(bones.length * 3);
  bones.forEach((o, j) => { o.quaternion.toArray(rawQ, j * 4); o.position.toArray(rawP, j * 3); });
  return { seat, soft, drops, carriers, bowOf, hands, arms, pin, root, shift, turn, body, mixer, actions, hips, rest, flash, bow, blendNodes: [...bones, ...soft.map((s) => s.node)], nBones: bones.length, rawQ, rawP };
}

// ---- blended transitions (inertialization) ---------------------------------------------------------------------------------------
/**
 * Each body's blending memory (by slug and seat, as `tips`): the pose last shown (local rotations, and the hips' position),
 * and the offset still being closed between it and the pose its clips ask for, with that offset's rate of change.
 * When a transition starts (the move changes, or its clip jumps), the offset becomes "what was shown minus what's asked
 * for"; every draw it decays toward zero as a critically damped spring (Holden, "Spring-It-On"), so a jab into a jab,
 * a cast or the standing pose eases from wherever the body was, and an interrupted ease simply starts from the screen.
 * The user, 2026-11-20: "It's not natural to return to a base state between animations" (explorations/2026-11-20-weapon-motion-flow.md).
 */
interface Blend { now: number; move: string; t: number; hl: number; shown: Float32Array; off: Float32Array; vel: Float32Array; hip: Float32Array; hipV: Float32Array; hipShown: Float32Array }
const blends = new Map<string, Blend>();
const bq = new THREE.Quaternion(), bq2 = new THREE.Quaternion();
/** Clip time moving faster than this many times real time counts as a jump (a cut), not playback. */
const JUMP_RATE = 6;
/** The gap at a transition (shown x inverse target) as a scaled angle-axis vector, into `out` at `j`. */
function logQ(q: THREE.Quaternion, out: Float32Array, j: number): void {
  if (q.w < 0) { q.x = -q.x; q.y = -q.y; q.z = -q.z; q.w = -q.w; }
  const s = Math.hypot(q.x, q.y, q.z), a = 2 * Math.atan2(s, q.w), k = s > 1e-8 ? a / s : 2;
  out[j] = q.x * k; out[j + 1] = q.y * k; out[j + 2] = q.z * k;
}
function expQ(x: number, y: number, z: number, out: THREE.Quaternion): THREE.Quaternion {
  const a = Math.hypot(x, y, z), h = a / 2, k = a > 1e-8 ? Math.sin(h) / a : 0.5;
  return out.set(x * k, y * k, z * k, Math.cos(h));
}
/**
 * Applies the body's blend to its nodes [lo, hi) after the clips posed them (pass 0: the bones, before the hips are placed;
 * pass 1: the soft props, after softProps aims them). Pass 0 also advances the springs and notices a transition.
 */
function blendPose(inst: Inst, key: string | undefined, p: LivePose, pass: 0 | 1, looping: boolean): void {
  const N = inst.blendNodes.length, lo = pass ? inst.nBones : 0, hi = pass ? N : inst.nBones;
  if (!key || p.hl === undefined || p.move === 'death') { if (key && pass === 0) blends.delete(key); return; }
  let b = blends.get(key);
  const now = p.now ?? liveNow();
  if (pass === 0) {
    if (!b || b.shown.length !== N * 4 || now < b.now || now - b.now > 1) {   // first sight, a new model, or the clock jumped: no blend
      b = { now, move: p.move, t: p.t, hl: p.hl, shown: new Float32Array(N * 4), off: new Float32Array(N * 3), vel: new Float32Array(N * 3), hip: new Float32Array(3), hipV: new Float32Array(3), hipShown: new Float32Array(3) };
      blends.set(key, b);
      b.shown[0] = NaN;   // nothing shown yet
    }
    const dt = now - b.now;
    const cut = p.move !== b.move || (!looping && (p.t < b.t - 1e-3 || p.t - b.t > JUMP_RATE * dt + 0.02));
    if (cut && b.shown[0] === b.shown[0]) {
      // the new gap: what was shown, against what the clips ask for now; the gap's motion carries on (vel kept)
      for (let j = 0; j < N; j++) {
        const n = inst.blendNodes[j];
        bq.set(b.shown[j * 4], b.shown[j * 4 + 1], b.shown[j * 4 + 2], b.shown[j * 4 + 3]);
        if (j < inst.nBones) logQ(bq.multiply(bq2.copy(n.quaternion).invert()), b.off, j * 3);
        else b.off[j * 3] = NaN;   // a soft prop's gap is taken in pass 1, once softProps has aimed it
      }
      if (inst.hips) for (let a = 0; a < 3; a++) b.hip[a] = b.hipShown[a] - inst.hips.position.getComponent(a);
      b.hl = p.hl;
    }
    b.move = p.move; b.t = p.t; b.now = now;
    // the springs: x' = v, critically damped to 0 with half-life hl
    const y = (2 * Math.LN2) / Math.max(1e-3, b.hl), e = Math.exp(-y * dt);
    const step = (x: Float32Array, v: Float32Array, j: number) => {
      if (x[j] !== x[j]) return;
      const j1 = v[j] + x[j] * y;
      x[j] = e * (x[j] + j1 * dt); v[j] = e * (v[j] - j1 * y * dt);
    };
    for (let j = 0; j < N * 3; j++) step(b.off, b.vel, j);
    for (let a = 0; a < 3; a++) step(b.hip, b.hipV, a);
    if (inst.hips) { inst.hips.position.x += b.hip[0]; inst.hips.position.y += b.hip[1]; inst.hips.position.z += b.hip[2]; inst.hips.position.toArray(b.hipShown); }
  }
  if (!b) return;
  for (let j = lo; j < hi; j++) {
    const n = inst.blendNodes[j];
    if (pass === 1 && b.off[j * 3] !== b.off[j * 3]) {   // a soft prop's gap at a transition (pass 0 marked it)
      if (b.shown[0] === b.shown[0]) { bq.set(b.shown[j * 4], b.shown[j * 4 + 1], b.shown[j * 4 + 2], b.shown[j * 4 + 3]); logQ(bq.multiply(bq2.copy(n.quaternion).invert()), b.off, j * 3); }
      else b.off[j * 3] = b.off[j * 3 + 1] = b.off[j * 3 + 2] = 0;
    }
    n.quaternion.premultiply(expQ(b.off[j * 3], b.off[j * 3 + 1], b.off[j * 3 + 2], bq));
    n.quaternion.toArray(b.shown, j * 4);
  }
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
function pose(inst: Inst, m: Model, p: LivePose, key?: string): void {
  const clipName = m.clips.has(p.move) ? p.move : 'walk';
  const second = p.move2 && p.w2 && m.clips.has(p.move2) && p.move2 !== clipName ? p.move2 : null;
  // the legs may be the move's own clip at another time (standing on the walk's first frame, stepping round on its legs)
  const legs = p.legs && (p.legs !== clipName || p.tl !== p.t) && m.clips.has(p.legs) ? p.legs : null;
  const w1 = 1 - (second ? p.w2! : 0);
  for (let j = 0; j < inst.nBones; j++) { inst.blendNodes[j].quaternion.fromArray(inst.rawQ, j * 4); inst.blendNodes[j].position.fromArray(inst.rawP, j * 3); }
  for (const d of inst.drops) d.rest.decompose(d.node.position, d.node.quaternion, d.node.scale);
  const show = p.props ?? m.meta.show;
  for (const c of inst.carriers) c.node.visible = !show || show.includes(c.name);
  // a held prop lets go early in the death and falls beside the body (dropProps): where it was when it let go
  const fall = p.move === 'death' && inst.drops.length ? Math.min(DROP_AT, p.t) : -1;
  if (fall >= 0) {
    play(inst, [[clipName, 1, fall]]);
    place(inst, m, p);
    if (inst.soft.length) softProps(inst, p.face, 0);
    placeGuard(inst, 0);
    inst.root.updateMatrixWorld(true);
    const toRoot = inst.root.matrixWorld.clone().invert();
    for (const d of inst.drops) DROP_FROM.set(d, toRoot.clone().multiply(d.node.matrixWorld));
  }
  // each playing clip at its own time and weight: walking under a move, the move drives the upper body and the legs
  // clip the hips and legs
  play(inst, [
    ...(legs ? [[clipName + ':upper', w1, p.t], [legs + ':lower', w1, p.tl ?? 0]] as const : [[clipName, w1, p.t]] as const),
    ...(second ? [[second, p.w2!, p.t2 ?? 0]] as const : []),
  ]);
  for (let j = 0; j < inst.nBones; j++) { inst.blendNodes[j].quaternion.toArray(inst.rawQ, j * 4); inst.blendNodes[j].position.toArray(inst.rawP, j * 3); }
  const sling = p.sling ?? (p.move === 'shoot' ? 1 : 0);
  pinGuardArm(inst, p.move === 'death' || p.move === 'block' || p.move === 'brace' || sling ? 0 : 1 - (p.guardUp ?? 0));
  if (p.turn && inst.hips?.parent) {   // the body turned about the vertical, in the hips' parent's frame
    inst.hips.parent.updateWorldMatrix(true, false);
    v1.set(0, 1, 0).applyQuaternion(inst.hips.parent.getWorldQuaternion(bq).invert());
    bq2.setFromAxisAngle(v1, (-p.turn * Math.PI) / 180);
    inst.hips.quaternion.premultiply(bq2); inst.hips.position.applyQuaternion(bq2);
  }
  const looping = !!m.meta.clips[clipName]?.stride;   // walk and run wrap round: their time going back is no cut
  blendPose(inst, key, p, 0, looping);
  place(inst, m, p);
  if (inst.soft.length) softProps(inst, p.face, p.grip ?? (inst.soft[0].firm.includes(clipName) ? 1 : 0), p.aim, p.slide, p.haft, p.arc);
  blendPose(inst, key, p, 1, looping);
  placeGuard(inst, p.guardUp ?? 0, sling);
  if (fall >= 0) dropProps(inst, p.t - fall);
}

/** Plays exactly these clips, each at its weight and time (update(0) applies them). */
function play(inst: Inst, on: readonly (readonly [string, number, number])[]): void {
  for (const [k, a] of inst.actions) {
    const c = on.find((x) => x[0] === k);
    if (!c || !c[1]) { if (a.isRunning()) a.stop(); continue; }
    if (!a.isRunning()) { a.reset(); a.play(); }
    a.setEffectiveWeight(c[1]);
    a.time = Math.min(Math.max(0, c[2]), a.getClip().duration - 1e-4);
  }
  inst.mixer.update(0);
}

/** The body's turn, its facing, the hips held over the feet, its flash and seat colours (after the clips are applied). */
function place(inst: Inst, m: Model, p: LivePose): void {
  const clipName = m.clips.has(p.move) ? p.move : 'walk';
  const y = p.turn === undefined ? m.meta.yaw[clipName] : undefined;   // a pose's own turn (at the hips) replaces the clip's
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
}

/** When a dying body's held props let go (s into the death clip), and how fast they fall (model units/s², 2 units ≈ 1 m). */
const DROP_AT = 0.25, GRAVITY = 16, GUARD_SLIDE = 0.45;
const DROP_FROM = new Map<Drop, THREE.Matrix4>();
const m1 = new THREE.Matrix4(), m2 = new THREE.Matrix4(), dp = new THREE.Vector3(), dq = new THREE.Quaternion(), ds = new THREE.Vector3();
/**
 * Each dropped prop, `dt` s after it let go: from where the hand held it (the body's frame, so it stays put while the
 * game moves the body), it falls under gravity and tips over to lie flat on the ground, its long side level, the
 * lowest point of its shape on the ground. Worked out from the clip time alone, so any frame can be drawn.
 */
function dropProps(inst: Inst, dt: number): void {
  inst.root.updateMatrixWorld(true);
  for (const d of inst.drops) {
    const from = DROP_FROM.get(d);
    if (!from) continue;
    from.decompose(dp, dq, ds);
    // the long side, in the body's frame: laid level (kept as it is if it already points straight up or down)
    const size = d.box.getSize(v1), long = size.x >= size.y && size.x >= size.z ? v2.set(1, 0, 0) : size.y >= size.z ? v2.set(0, 1, 0) : v2.set(0, 0, 1);
    const a = long.applyQuaternion(dq).normalize(), flat = v3.set(a.x, 0, a.z);
    const land = flat.lengthSq() > 1e-4 ? qa.setFromUnitVectors(a, flat.normalize()).multiply(dq) : qa.copy(dq);
    // resting height: the lowest corner of its shape, laid down, on the ground
    let lowest = Infinity;
    for (let c = 0; c < 8; c++) {
      v1.set(c & 1 ? d.box.max.x : d.box.min.x, c & 2 ? d.box.max.y : d.box.min.y, c & 4 ? d.box.max.z : d.box.min.z).multiply(ds).applyQuaternion(land);
      lowest = Math.min(lowest, v1.y);
    }
    const y0 = dp.y, y1 = -lowest, T = Math.max(0.15, Math.sqrt(Math.max(0, 2 * (y0 - y1)) / GRAVITY));
    const u = Math.min(1, dt / T);
    dp.y = y0 + (y1 - y0) * u * u;
    if (d.slide) {   // a guard, carried at his side, slides out as it falls so it lands clear of the body
      const r = Math.hypot(dp.x, dp.z) || 1, k = GUARD_SLIDE * ease(u);
      dp.x += (dp.x / r) * k; dp.z += (dp.z / r) * k;
    }
    dq.slerp(land, ease(Math.min(1, dt / (T * 0.9))));
    // body frame -> the carrier's parent's frame
    m1.compose(dp, dq, ds).premultiply(inst.root.matrixWorld);
    m2.copy(d.node.parent!.matrixWorld).invert().multiply(m1);
    m2.decompose(d.node.position, d.node.quaternion, d.node.scale);
    d.node.updateMatrixWorld(true);
  }
}

/**
 * How a conjured weapon is held (the user, 2026-11-19: "carried too close to the body, clips into the face"): its axis
 * leans `lean` forward and `side` outward (to the wielder's right) per unit of height instead of standing upright, and the
 * grip is moved `hold` ahead and `holdSide` of that outward, in model units, so a blade clears the beard and hat brim.
 */
const WEAPON_HOLD = { lean: 0.6, side: 0.25, hold: 0.14, holdSide: 0.5 };
/** A thrust's shaft is aimed along the facing, this much up (of its length). */
const AIM_UP = 0.12;
/** A two-hander's haft is leaned down (LivePose.haft) fully once the arm line is level, none from this sine above level (30°). */
const HAFT_LEVEL = 0.5;
/** A two-hander's haft never points steeper than this sine below level (40°). */
const HAFT_LOW = 0.65;
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), qp = new THREE.Quaternion(), qi = new THREE.Quaternion(), aimDir = new THREE.Vector3(), hS = new THREE.Vector3(), hT = new THREE.Vector3();
/**
 * render.py soft_props: each soft prop's main axis is turned from where the hand holds it back toward upright (leaning
 * a little toward the facing), keeping k of the hand's tilt, all of it as `grip` reaches 1 (a staff's blow); it turns
 * about the carrier's own origin, the palm.
 */
function softProps(inst: Inst, face: number, grip: number, aim?: number, slide = 0, haft?: number, arc?: readonly [number, number]): void {
  for (const s of inst.soft) {
    if (!s.node.visible) continue;
    s.node.quaternion.copy(s.rest);
    s.node.position.copy(s.restPos);
    s.node.updateMatrixWorld(true);
    const p = s.node.getWorldPosition(v1), a = s.axis.getWorldPosition(v2).sub(p).normalize();
    // a conjured weapon is held out from the body (WEAPON_HOLD): the staff stays upright at the side
    const car = inst.carriers.find((c) => c.node === s.node), held = !!car && car.held && car.name !== 'staff';
    const cs = Math.cos(face), sn = Math.sin(face), H = held ? WEAPON_HOLD : null, hs = car?.left ? -1 : 1;   // a weapon in the left hand is held out to the left
    // a thrust aims the shaft along the facing, whatever the hand's own tilt; `aim` 0..1 goes from the usual hold to
    // there, so a jab's shaft can be lifted back to the carry slowly (0 is exactly the hold without an aim)
    const want = v3.set(cs * (H ? H.lean : 0.12) - sn * (H ? H.side * hs : 0), 1, sn * (H ? H.lean : 0.12) + cs * (H ? H.side * hs : 0)).normalize();
    let w = aim ?? 0;
    if (w > 0) want.lerp(aimDir.set(cs, AIM_UP, sn).normalize(), w).normalize();   // (not v2: `a` is v2)
    // a two-handed swing: the haft out along the arms (LivePose.haft)
    if (arc && held) {   // a maul's swing on its own keys (LivePose.arc): along the facing, turned right by `sideways`
      const el = (arc[0] * Math.PI) / 180, sd = (arc[1] * Math.PI) / 180, ce = Math.cos(el), fx = Math.cos(sd), rx = Math.sin(sd);
      want.set(ce * (cs * fx - sn * rx), Math.sin(el), ce * (sn * fx + cs * rx)); w = 1;
    } else if (haft !== undefined && held && inst.arms && inst.hands) {
      inst.arms[0].getWorldPosition(hS); hS.add(inst.arms[1].getWorldPosition(hT)).multiplyScalar(0.5);
      inst.hands[0].getWorldPosition(hT); hT.add(inst.hands[1].getWorldPosition(aimDir)).multiplyScalar(0.5).sub(hS);
      // leaned down only as the arms come down past HAFT_LEVEL (sin of the angle above level): raised, it follows them
      if (hT.lengthSq() > 1e-8) {
        hT.normalize(); const k = Math.min(1, Math.max(0, (HAFT_LEVEL - hT.y) / HAFT_LEVEL)); hT.y -= haft * k * k * (3 - 2 * k); hT.normalize();
        // never steeper than HAFT_LOW below level: hands hanging low (a recovery) rest the head on the ground ahead, not through the feet
        if (hT.y < -HAFT_LOW) {
          const flat = Math.hypot(hT.x, hT.z), r = Math.sqrt(1 - HAFT_LOW * HAFT_LOW);
          if (flat > 1e-3) hT.set((hT.x / flat) * r, -HAFT_LOW, (hT.z / flat) * r); else hT.set(cs * r, -HAFT_LOW, sn * r);
        }
        want.copy(hT); w = 1;
      }
    }
    const turn = qa.setFromUnitVectors(a, want);
    qi.identity().slerp(turn, w + (1 - w) * (1 - s.k) * (1 - grip));
    // world rotation -> the carrier's local one
    s.node.getWorldQuaternion(qb);
    s.node.parent!.getWorldQuaternion(qp);
    s.node.quaternion.copy(qp.invert().multiply(qi).multiply(qb));
    s.node.updateMatrixWorld(true);
    if (H || slide) {   // and the grip itself a little ahead and out, fading as a blow takes the weapon over; a jab slides the shaft forward
      const k = H ? (1 - grip) * H.hold : 0, hsd = H ? H.holdSide : 0;
      s.node.getWorldPosition(v1).add(v2.set(cs * k - sn * k * hsd * hs + cs * slide, 0, sn * k + cs * k * hsd * hs + sn * slide));
      s.node.position.copy(s.node.parent!.worldToLocal(v1));
      s.node.updateMatrixWorld(true);
    }
  }
}

/** How much of the guard arm's own swing a carried guard takes out: the arm is turned this far toward its standing pose. */
const PIN = 0.85;
/**
 * A carried guard is placed by the body (placeGuard), so the arm that carries it must not swing free of it in a run or a
 * cast (the user, 2026-11-19: "shield arm should move less, pin to shield"). With a guard shown, the arm's bones are turned
 * from the clip toward the walk's first frame (the standing pose) by k of PIN; the other arm and the legs keep the clip,
 * so a cast is one-handed and a run still pumps one arm. Blocking, death and the guard's own clips leave the arm alone (k 0).
 */
function pinGuardArm(inst: Inst, k: number): void {
  if (k <= 0 || !inst.pin.stand.length || !inst.carriers.some((c) => !c.held && c.node.visible)) return;
  inst.pin.bones.forEach((b, j) => b.quaternion.slerp(inst.pin.stand[j], PIN * k));
}

const mA = new THREE.Matrix4(), mAT = new THREE.Matrix4(), mB = new THREE.Matrix4(), qw = new THREE.Quaternion();
const gUp = new THREE.Vector3(), gN = new THREE.Vector3(), gS = new THREE.Vector3(), gMid = new THREE.Vector3(), gO = new THREE.Vector3(), gF = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
/**
 * Where a guard sits, in torso lengths (hips to shoulders: this wizard is short-legged and big-headed, so hip heights put
 * it at his ear; the user, 2026-11-18), from his shoulders, so a clip that twists his torso turns the guard with it.
 * (The numbers are GUARD_PLACE's, which the Model Viewer's Weapons and guards section edits live.) Carried: carryUp above the hips, carryOut out past the left shoulder and carryAhead forward, its face turned
 * carryAngle from the front out to the side and its top leaning out by carryTilt. Raised: blockUp above the hips,
 * blockAhead in front of the shoulders (blockOut sideways, toward his left) plus blockSize of its own half height (a tower stands further out), square on.
 */
export const GUARD_PLACE = {
  carryUp: 0.31, carryOut: 1.2, carryAhead: 1, carryAngle: 2.5, carryTilt: 0.2,
  blockUp: 1.19, blockAhead: 1.52, blockOut: 1.64, blockSize: 0.89, blockYaw: 1.7,
};
/** A slung guard's middle: SLUNG_UP up from the hips and SLUNG_BACK back from the shoulders' middle, in torso lengths, plus its half thickness and SLUNG_WIDE of its half height (a wide guard clears the robe). */
const SLUNG_UP = 0.75, SLUNG_BACK = 0.72, SLUNG_WIDE = 0.06;
const qS = new THREE.Quaternion(), pS = new THREE.Vector3();
const gY = new THREE.Vector3(), qC = new THREE.Quaternion(), qB = new THREE.Quaternion(), gL = new THREE.Vector3(), gH = new THREE.Vector3(), pC = new THREE.Vector3(), pB = new THREE.Vector3();
/** The rotation that takes the guard's current (up, face) frame (mAT, mA's transpose) to (up, face), into `out`. */
function turnTo(out: THREE.Quaternion, up: THREE.Vector3, face: THREE.Vector3): THREE.Quaternion {
  gS.crossVectors(up, face);
  mB.makeBasis(up, face, gS);
  return out.setFromRotationMatrix(mB.multiply(mAT));
}
/**
 * Places each shown strapped guard (a soft prop off the forearm, with a face marker) by the body, not by the forearm's
 * every swing: carried at the side, or (by w, the block's ease) raised square in front of the chest. Its up is its soft
 * axis; its face is its face marker (the export's, from wizprops.py PROP_FACE). The arm's clip still moves the arm.
 */
function placeGuard(inst: Inst, w: number, sling = 0): void {
  const G = GUARD_PLACE;
  if (!inst.hips) return;
  for (const c of inst.carriers) {
    if (c.held || !c.node.visible) continue;
    const s = inst.soft.find((x) => x.node === c.node);
    if (!s || !c.face) continue;
    c.node.updateMatrixWorld(true);
    c.node.getWorldPosition(gO);
    gUp.copy(s.axis.getWorldPosition(v1)).sub(gO).normalize();
    c.node.localToWorld(gMid.copy(c.mid));
    // the marker's local position, Blender's Z-up axes in the carrier frame as written by the export; the guard's own
    // geometry came through the glTF Y-up conversion, so take the marker the same way: (x, y, z) -> (x, z, -y)
    const fp = c.face.position;
    gN.copy(c.node.localToWorld(v1.set(fp.x, fp.z, -fp.y))).sub(gO);
    gN.addScaledVector(gUp, -gN.dot(gUp));
    if (gN.lengthSq() < 1e-8) continue;
    gN.normalize();
    gS.crossVectors(gUp, gN);
    mA.makeBasis(gUp, gN, gS);
    mAT.copy(mA).transpose();
    // the body's frame, from the shoulders: left (the guard's side), forward, and the torso's length
    if (!inst.arms) continue;
    const lA = inst.arms[0].getWorldPosition(v3), rA = inst.arms[1].getWorldPosition(gL);
    const sy = (lA.y + rA.y) / 2, hips = inst.hips.getWorldPosition(gH), torso = Math.max(1e-4, sy - hips.y);
    const sx = (lA.x + rA.x) / 2, sz = (lA.z + rA.z) / 2;
    gL.sub(lA).negate(); gL.y = 0; gL.normalize();   // right shoulder to left, flat: his left
    gF.crossVectors(gL, WORLD_UP);                  // left x up = forward (left +X, up +Y: forward +Z)
    const lx = lA.x, lz = lA.z;
    const half = c.node.localToWorld(v2.copy(c.mid).add(c.axes[0])).distanceTo(gMid);   // its own half height
    // carried: out at the side, face turned out, top leaning out
    const upC = v1.copy(WORLD_UP).addScaledVector(gL, G.carryTilt).normalize();
    const faceC = v2.copy(gF).multiplyScalar(Math.cos(G.carryAngle)).addScaledVector(gL, Math.sin(G.carryAngle));
    faceC.addScaledVector(upC, -faceC.dot(upC)).normalize();
    turnTo(qC, upC, faceC);
    pC.set(lx, hips.y + G.carryUp * torso, lz).addScaledVector(gL, G.carryOut * torso).addScaledVector(gF, G.carryAhead * torso);
    // a two-handed weapon (or a bow drawn) takes the guard arm: the guard rides in the middle of the back, its face
    // turned out behind (sling 0..1), where the body hides it from most of the camera's angles
    if (sling > 0) {
      // flat on the back: the raised guard's square-on turn (blockYaw: turnTo's face is the frame's, not the guard's
      // normal) turned half round to face behind (the user, 2026-11-21: it "sits on the edge instead of flat")
      turnTo(qS, WORLD_UP, v2.copy(gF).applyAxisAngle(WORLD_UP, G.blockYaw + Math.PI));
      // out from the spine by its own half thickness too, so a thick or wide one doesn't sink into the robe (the user,
      // 2026-11-21: "too close to the center of the character. mirror buckler clips a lot")
      const thick = c.node.localToWorld(v1.copy(c.mid).add(c.axes[2])).distanceTo(gMid);
      pS.set(sx, hips.y + SLUNG_UP * torso, sz).addScaledVector(gF, -(SLUNG_BACK * torso + thick + SLUNG_WIDE * half));
      if (Number.isFinite(qS.w)) { qC.slerp(qS, sling); pC.lerp(pS, sling); }
    }
    // raised: square in front
    turnTo(qB, WORLD_UP, gY.copy(gF).applyAxisAngle(WORLD_UP, G.blockYaw));
    pB.set(sx, hips.y + G.blockUp * torso, sz).addScaledVector(gF, G.blockAhead * torso + G.blockSize * half).addScaledVector(gL, G.blockOut * torso);
    if (!Number.isFinite(qC.w) || !Number.isFinite(qB.w)) continue;
    qw.copy(qC).slerp(qB, w);
    pC.lerp(pB, w);
    // the carrier's new origin: the middle at its spot, the rest turned round it
    const pos = v1.copy(gO).sub(gMid).applyQuaternion(qw).add(pC);
    c.node.getWorldQuaternion(qa).premultiply(qw);
    c.node.parent!.getWorldQuaternion(qp).invert();
    c.node.quaternion.copy(qp.multiply(qa));
    c.node.position.copy(c.node.parent!.worldToLocal(pos));
    c.node.updateMatrixWorld(true);
  }
}

/** The archer's string: tip to the draw hand to tip, with an arrow nocked, while drawing and before the release. */
function stringOf(inst: Inst, m: Model, p: LivePose, stage: THREE.Group): void {
  const bw = inst.bow!;
  for (const x of bw.parts) stage.remove(x);
  if (inst.bowOf && !inst.bowOf.visible) return;
  const a = bw.tips[0].getWorldPosition(new THREE.Vector3()), b = bw.tips[1].getWorldPosition(new THREE.Vector3());
  const n0 = bw.nock.getWorldPosition(new THREE.Vector3()), g = bw.grip.getWorldPosition(new THREE.Vector3());
  const w0 = bw.fore.getWorldPosition(new THREE.Vector3()), w1 = bw.hand.getWorldPosition(new THREE.Vector3());
  const L = a.distanceTo(b), u = v1.subVectors(a, b).normalize().clone(), f = v2.subVectors(g, n0).normalize().clone();
  const rh = w1.clone().add(w1.clone().sub(w0).normalize().multiplyScalar(0.09 * L / 1.12));   // the palm
  const rel = rh.clone().sub(g), along = rel.dot(f), vert = rel.dot(u), lat = rel.clone().sub(f.clone().multiplyScalar(along)).sub(u.clone().multiplyScalar(vert)).length();
  const release = m.meta.release[p.move];
  const hooked = (p.move.startsWith('attack') || p.move === 'shoot') && along < -0.05 * L && lat < 0.3 * L && Math.abs(vert) < 0.3 * L && (release === undefined || p.t <= release);
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
/**
 * Where a caster's spells start: between its palms, leaning toward the hand further forward (the one doing the
 * casting), so a spell leaves the hands whatever they hold (the user, 2026-11-17: the staff's tip tied every spell to
 * the staff). World space, in v1.
 */
function castPoint(inst: Inst, m: Model): THREE.Vector3 {
  const reach = 0.09 * (m.meta.height ?? 1.98) / 1.98;   // the palm, just past the wrist (props.py GRIP)
  const palm = (h: THREE.Object3D, out: THREE.Vector3) => {
    const w = h.getWorldPosition(out), e = h.parent!.getWorldPosition(v3);
    return w.add(e.subVectors(w, e).normalize().multiplyScalar(reach));
  };
  const l = palm(inst.hands![0], v1), r = palm(inst.hands![1], v2);
  const zl = inst.root.worldToLocal(l.clone()).z, zr = inst.root.worldToLocal(r.clone()).z;   // the body faces local +Z
  return l.lerp(r, Math.min(1, Math.max(0, 0.5 + (zr - zl) / 0.5)));
}

/** Each live caster's hands last frame (art px from the feet), where its spells start (anchors tip and charge). */
const tips = new Map<string, [number, number]>();
type Held = Pick<Anchors, 'blade' | 'guard' | 'guardFrame'>;
/** Each body's shown conjured weapon (grip to tip) and guard (its middle) last frame, art px from the feet (Anchors.blade, .guard). */
const held = new Map<string, Held>();

/**
 * Where a body's shown arms are on screen this frame (art px from the feet, as `tips`): a prop in the hand that the
 * model doesn't show by default (the wizard's conjured weapon, not its staff) from grip to tip, and a guard by its middle.
 */
function heldOf(inst: Inst, m: Model, key: string, o: typeof SMALL, cam: THREE.Camera): void {
  const px = (w: THREE.Vector3): [number, number] => { const q = w.project(cam); return [(q.x + 1) / 2 * o.size - o.feet[0], (1 - q.y) / 2 * o.size - o.feet[1]]; };
  const out: Held = {};
  for (const c of inst.carriers) {
    if (!c.node.visible || m.meta.show?.includes(c.name)) continue;
    if (c.held && c.tip) out.blade = [px(c.node.localToWorld(v1.set(0, 0, 0))), px(c.node.localToWorld(v1.copy(c.tip)))];
    else if (!c.held) {
      const g = out.guard = px(c.node.localToWorld(v1.copy(c.mid)));
      const off = (a: THREE.Vector3): [number, number] => { const p = px(c.node.localToWorld(v1.copy(c.mid).add(a))); return [p[0] - g[0], p[1] - g[1]]; };
      // the normal's world direction against the camera's: 1 when the face looks straight at it
      const o0 = c.node.localToWorld(v2.copy(c.mid)), n = c.node.localToWorld(v3.copy(c.mid).add(c.axes[2])).sub(o0).normalize();
      // how far behind the body's middle it is, along the camera's view (model units): its effects go behind the body then
      const u = off(c.axes[0]), v = off(c.axes[1]);   // (before v1 is reused below)
      const dir = cam.getWorldDirection(v1), face = -n.dot(dir), mid = inst.hips ? inst.hips.getWorldPosition(gH) : o0;
      // in the ground plane: the guard rides higher than the hips, and the camera's downward tilt would eat its depth
      dir.y = 0; dir.normalize();
      const behind = v3.copy(o0).sub(mid).setY(0).dot(dir);   // (n is v3: read above)
      out.guardFrame = { u, v, face, behind };
    }
  }
  if (out.blade || out.guard) held.set(key, out); else held.delete(key);
}
const booked: Booking[] = [];
/**
 * The VFX Lab's two hooks (lab/vfx-lab): a clock for the pose blends and the shader's time instead of real time (so a
 * frame is a function of the sim's time), and a prefix for the per-body keys, so several views of several worlds don't
 * share one body's blend. The game sets neither.
 */
let liveClock: (() => number) | null = null, liveScope = '';
const liveNow = (): number => (liveClock ? liveClock() : performance.now() / 1000);
export function setLiveClock(clock: (() => number) | null): void { liveClock = clock; }
export function setLiveScope(scope: string): void { liveScope = scope; }
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
  const slot = slots[k], key = liveScope + slug + '|' + who, tip = tips.get(key);
  if (tip) anchors = { ...anchors, tip, charge: tip };
  const hd = held.get(key);
  if (hd || anchors.blade || anchors.guard) anchors = { ...anchors, blade: hd?.blade, guard: hd?.guard, guardFrame: hd?.guardFrame };
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
  fxTime.value = liveNow();
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
    pose(inst, m, b.pose, b.key);
    stage.add(inst.root);
    if (inst.bow) stringOf(inst, m, b.pose, stage);
    // the slot in the 4x target (GL's rows run bottom up)
    const size = b.slot.big ? BIG.size : SMALL.size;
    const x = b.slot.x * SUPER, y = (AH - b.slot.y - size) * SUPER, w = size * SUPER;
    hiRT.viewport.set(x, y, w, w); hiRT.scissor.set(x, y, w, w); hiRT.scissorTest = true;
    renderer.setRenderTarget(hiRT);
    const cam = b.slot.big ? g.camBig : g.camSmall;
    renderer.render(scene, cam);
    if (inst.hands && m.meta.casts) {   // a caster's hands, projected into the slot, as art px from the feet
      const o = b.slot.big ? BIG : SMALL, q = castPoint(inst, m).project(cam);
      tips.set(b.key, [Math.round((q.x + 1) / 2 * o.size - o.feet[0]), Math.round((1 - q.y) / 2 * o.size - o.feet[1])]);
    }
    heldOf(inst, m, b.key, b.slot.big ? BIG : SMALL, cam);
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

// ---- for dev tools (lab/models.ts, the model viewer) -------------------------------------------------------------------------------
export type LiveModel = Model;
export type LiveInst = Inst;
/** Every model the game can draw live. */
export const liveSlugs = (): string[] => [...META.keys()].filter((s) => URLS.has(s)).sort();
/** Is live drawing working here (WebGL2, not a software renderer, not ?live3d=0)? Known after the first liveFrame. */
export const liveWorks = (): boolean => LIVE3D_ON && !failed;
/** A model, once loaded (shared with the game's own cache); null if it can't be. */
export function liveModel(slug: string): Promise<LiveModel | null> {
  return new Promise((res) => {
    const tick = () => {
      const m = models.get(slug);
      if (m === 'failed') res(null);
      else if (m && m !== 'loading') res(m);
      else { model(slug); setTimeout(tick, 40); }
    };
    tick();
  });
}
/** A posable copy of a model: the game's (toon materials, for the pixel pass) or with its own materials (`original`). */
export const liveInstance = (slug: string, m: LiveModel, original: boolean): LiveInst => instance(slug, m, original);
/** Poses a copy exactly as the game does (the clip, its body turn, the hips held over the feet, the staff kept upright). */
export const livePoseInst = (inst: LiveInst, m: LiveModel, p: LivePose, blendKey?: string): void => pose(inst, m, p, blendKey);
/** The archer's string and nocked arrow for this pose, added to `stage` (removed again by the next call). */
export const liveString = (inst: LiveInst, m: LiveModel, p: LivePose, stage: THREE.Group): void => { if (inst.bow) stringOf(inst, m, p, stage); };
/** The game camera and light: elevation (radians), art px a unit, the squash on every body, the sun's place, the light levels. */
export const LIVE_VIEW = { elev: ELEV, ppu: PPU, squash: SQUASH, sun: new THREE.Vector3(-7, 12, 9), sunI: SUN, ambI: AMB } as const;
