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
 *
 * The posing itself (models, clips, blends, props, guards, the materials' shared shader parts) is art/model-pose.ts,
 * shared with the 3D view's bodies (view3d/bodies.ts); this file is the pixel path: the atlas, the pixelize shader,
 * slot booking and the Pixi texture.
 */
import * as THREE from 'three';
import { Rectangle, Texture } from 'pixi.js';
import { CELL_H, CELL_W, FEET_X, FEET_Y, type Anchors } from './rigs';
import type { Frame } from './actors';
import { opt } from '../dev-options';
import {
  FX_FRAG, FX_GLSL, SEAT_FRAG, TONE_GLSL, castPoint, fxTime, instance, liveNow, model, pose, scopedKey, stringOf,
  type BodyUniforms, type Inst, type LivePose, type Look, type Model,
} from './model-pose';

export {
  GUARD_PLACE, liveMeta, liveModel, liveSlugs, setLiveClock, setLiveScope,
  type LivePose, type ModelMeta,
} from './model-pose';

/** Art px of standing height per model unit, measured against the baked sheets (35 px for a 1.98-unit goblin). */
export const PX_PER_UNIT = 17;

/** ?live3d=0 turns it off; ?live3d=1 keeps it on even on a software renderer (which otherwise gets the sheets). */
const LIVE3D_Q = opt('live3d');
/** On unless ?live3d=0 (and only in a browser). */
export const LIVE3D_ON = typeof document !== 'undefined' && LIVE3D_Q !== '0';

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

/**
 * The pixel path's look (model-pose.ts Look): each material writes the two layers, each part's flat colour (sRGB) and
 * the light against it. A hit flash turns the whole body white.
 */
const toon: Look = (src, u: BodyUniforms, fxMode, infused) => {
  const m = new THREE.MeshLambertMaterial({ map: src.map, color: src.color, emissive: src.emissive, emissiveMap: src.emissiveMap });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.fxMode = { value: fxMode };
    sh.uniforms.infMode = infused ? u.infuse : { value: 0 };
    sh.uniforms.infHead = { value: infused ? 1 : 0 };
    sh.uniforms.fxTime = fxTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFx;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFx = position;');
    sh.uniforms.flash = u.flash;
    sh.uniforms.seatOn = u.seat.on;
    sh.uniforms.seatMain = u.seat.main;
    sh.uniforms.seatTrim = u.seat.trim;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float flash; uniform float seatOn; uniform vec3 seatMain; uniform vec3 seatTrim;\nuniform int fxMode; uniform float fxTime; varying vec3 vFx; uniform int infMode; uniform float infHead;\nlayout(location = 1) out highp vec4 gRatio;\n' + TONE_GLSL + FX_GLSL)
      .replace('#include <opaque_fragment>', `
        vec3 albedo = toSrgb(diffuseColor.rgb);
        float ratio = lumaOf(toSrgb(outgoingLight)) / max(lumaOf(albedo), 0.03);
        ${SEAT_FRAG}
        ${FX_FRAG}
        #include <opaque_fragment>
        gl_FragColor = vec4(mix(albedo, vec3(1.0), flash), 1.0);
        gRatio = vec4(mix(ratio, 1.0, flash) * 0.4, 0.0, 0.0, 1.0);`);
  };
  return m;
};

/** The atlas's posable copies of each model, by slug: the i-th body of a slug in a draw takes the i-th. */
const pools = new Map<string, Inst[]>();
/** A pixel-path copy of a model: toon materials (or the model's own, for the Model Viewer), squashed as the bake was. */
function pixelInstance(slug: string, m: Model, look: Look = toon): Inst {
  const inst = instance(slug, m, look);
  inst.root.scale.copy(SQUASH);
  return inst;
}
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), gH = new THREE.Vector3();

// ---- booking and flushing --------------------------------------------------------------------------------------------------------
interface Booking { slug: string; slot: Slot; pose: LivePose; key: string }

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
  const slot = slots[k], key = scopedKey(slug + '|' + who), tip = tips.get(key);
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
    const m = model(b.slug)!;
    const i = n.get(b.slug) ?? 0; n.set(b.slug, i + 1);
    let pool = pools.get(b.slug);
    if (!pool) pools.set(b.slug, (pool = []));
    const inst = pool[i] ?? (pool[i] = pixelInstance(b.slug, m));
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
/** Is live drawing working here (WebGL2, not a software renderer, not ?live3d=0)? Known after the first liveFrame. */
export const liveWorks = (): boolean => LIVE3D_ON && !failed;
/** A posable copy of a model: the game's (toon materials, for the pixel pass, squashed) or with its own materials (`original`). */
export const liveInstance = (slug: string, m: LiveModel, original: boolean): LiveInst => pixelInstance(slug, m, original ? 'original' : toon);
/** Poses a copy exactly as the game does (the clip, its body turn, the hips held over the feet, the staff kept upright). */
export const livePoseInst = (inst: LiveInst, m: LiveModel, p: LivePose, blendKey?: string): void => pose(inst, m, p, blendKey);
/** The archer's string and nocked arrow for this pose, added to `stage` (removed again by the next call). */
export const liveString = (inst: LiveInst, m: LiveModel, p: LivePose, stage: THREE.Group): void => { if (inst.bow) stringOf(inst, m, p, stage); };
/** The game camera and light: elevation (radians), art px a unit, the squash on every body, the sun's place, the light levels. */
export const LIVE_VIEW = { elev: ELEV, ppu: PPU, squash: SQUASH, sun: new THREE.Vector3(-7, 12, 9), sunI: SUN, ambI: AMB } as const;