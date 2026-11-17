// Real-time 3D goblins through a pixel shader, beside the same goblin's baked sheet.
// Question: does the hooded raider drawn live look as good as its baked sprite while moving, turning and slowed,
// and how many fit in a frame?
//
// The live side copies tools/sprites-3d: the render's camera (orthographic, 20 degrees up, 16 px a unit), squash
// (1.15 wide, 0.92 tall) and light (upper left, toward the viewer), then pixelize.py's rules on the GPU: render at 4x,
// each art pixel takes the commonest colour of its 4x4 block, light banded into four tones per part (shadows lean blue,
// lights warm), and an ink outline outside the silhouette. Missing: pixelize's one-pixel seams between parts.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import clipsUrl from '../../../tools/sprites-3d/output/meshy-rig/clips.glb?url';
import walkUrl from '../../../tools/sprites-3d/output/meshy-rig/walking.glb?url';
import sheetUrl from '../../../game/content/assets/sprites/raider-hooded/sheet.png?url';
import sheetMeta from '../../../game/content/assets/sprites/raider-hooded/sheet.json';

// ---- knobs -------------------------------------------------------------------------------------------------------
const W = 400, H = 240, SCALE = 3;          // the game-pixel screen and its upscale
const SUPER = 4;                              // supersampling, as pixelize.py
const PPU = 16;                               // art px per world unit (render.py CANVAS / ortho_scale)
const ELEV = THREE.MathUtils.degToRad(20);    // camera height (roster.sh --elev=20)
const SQUASH = new THREE.Vector3(1.15, 0.92, 1.15);
const SUN = 2.5, AMB = 1.4;                   // light, tuned so the bands land as the baked render's do
const BANDS = [0.55, 0.85, 1.25];            // pixelize.py BANDS
// raw sRGB values: the passes write display colours straight through, so skip three's colour management here
const INK = new THREE.Color().setRGB(26 / 255, 18 / 255, 14 / 255, THREE.LinearSRGBColorSpace);
const DIRT = new THREE.Color().setHex(0x8a7454, THREE.LinearSRGBColorSpace);
const BLADE = { len: 0.42, wide: 0.12, thick: 0.04, along: 0.3 };   // a stand-in for the grafted Codex blade

const q = new URLSearchParams(location.search);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

interface Meta {
  cell: [number, number]; cols?: number; feet: [number, number]; fps: number;
  moves: Record<string, { row: number; n: number }>; attacks: { frames: number[]; hit: number }[];
}
const meta = sheetMeta as unknown as Meta;

// ---- renderer and passes -------------------------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W * SCALE, H * SCALE);
renderer.toneMapping = THREE.NoToneMapping;
renderer.info.autoReset = false;
$('wrap').append(renderer.domElement);
for (const s of $('cap').children) (s as HTMLElement).style.width = (W * SCALE) / 2 + 'px';

const rt = (w: number, h: number, depth: boolean) => {
  // half float: alpha carries each live goblin's depth rank (0.5 + rank / 512), which 8 bits can't hold
  const t = new THREE.WebGLRenderTarget(w, h, { depthBuffer: depth, type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  t.texture.colorSpace = THREE.NoColorSpace;
  return t;
};
const hiRT = rt(W * SUPER, H * SUPER, true), lowRT = rt(W, H, false), finalRT = rt(W, H, false);

const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quad = (frag: string, uniforms: Record<string, THREE.IUniform>) => {
  const m = new THREE.ShaderMaterial({
    uniforms, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: frag,
  });
  const s = new THREE.Scene(); s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m));
  return s;
};
// each art pixel: the commonest colour of its 4x4 block, if at least half the block is covered
const resolve = quad(`
  uniform sampler2D tHi; uniform vec2 hiSize;
  void main() {
    ivec2 p = ivec2(gl_FragCoord.xy) * ${SUPER};
    vec4 c[${SUPER * SUPER}]; int cover = 0;
    for (int j = 0; j < ${SUPER}; j++) for (int i = 0; i < ${SUPER}; i++) {
      vec4 s = texelFetch(tHi, p + ivec2(i, j), 0); c[j * ${SUPER} + i] = s; if (s.a > 0.5) cover++;
    }
    if (cover * 2 < ${SUPER * SUPER}) { gl_FragColor = vec4(0.0); return; }
    int best = -1, bestN = 0;
    for (int a = 0; a < ${SUPER * SUPER}; a++) {
      if (c[a].a <= 0.5) continue;
      int n = 0;
      for (int b = 0; b < ${SUPER * SUPER}; b++) if (c[b].a > 0.5 && abs(c[a].a - c[b].a) < 0.5 / 512.0 && all(lessThan(abs(c[a].rgb - c[b].rgb), vec3(1.5 / 32.0)))) n++;
      if (n > bestN) { bestN = n; best = a; }
    }
    // the mean of the winning group, as pixelize.py averages its commonest part, so texture noise doesn't speckle
    vec4 w = vec4(0.0); for (int a = 0; a < ${SUPER * SUPER}; a++) if (a == best) w = c[a];
    vec3 sum = vec3(0.0); float m = 0.0;
    for (int b = 0; b < ${SUPER * SUPER}; b++) if (c[b].a > 0.5 && abs(w.a - c[b].a) < 0.5 / 512.0 && all(lessThan(abs(w.rgb - c[b].rgb), vec3(1.5 / 32.0)))) { sum += c[b].rgb; m += 1.0; }
    gl_FragColor = vec4(sum / max(m, 1.0), w.a);
  }`, { tHi: { value: hiRT.texture }, hiSize: { value: new THREE.Vector2(W * SUPER, H * SUPER) } });
// the ink goes outside each goblin's shape, as pixelize.py, and over whoever stands behind it, as overlapping
// sprites do: a pixel is inked when a 4-neighbour belongs to a goblin in front of it (a higher rank; empty is -1)
const outline = quad(`
  uniform sampler2D tLow; uniform vec3 ink;
  float rankOf(vec4 c) { return c.a > 0.25 ? floor((c.a - 0.5) * 512.0 + 0.5) : -1.0; }
  void main() {
    ivec2 p = ivec2(gl_FragCoord.xy);
    vec4 c = texelFetch(tLow, p, 0); float r = rankOf(c);
    float n = max(max(rankOf(texelFetch(tLow, p + ivec2(1, 0), 0)), rankOf(texelFetch(tLow, p - ivec2(1, 0), 0))),
                  max(rankOf(texelFetch(tLow, p + ivec2(0, 1), 0)), rankOf(texelFetch(tLow, p - ivec2(0, 1), 0))));
    gl_FragColor = n > r ? vec4(ink, 1.0) : r >= 0.0 ? vec4(c.rgb, 1.0) : vec4(0.0);
  }`, { tLow: { value: lowRT.texture }, ink: { value: INK } });
const blit = quad(`
  uniform sampler2D tFinal; uniform sampler2D tLow; uniform vec3 dirt; uniform float debug; varying vec2 vUv;
  void main() {
    vec4 c = texture2D(tFinal, vUv); gl_FragColor = vec4(c.a > 0.5 ? c.rgb : dirt, 1.0);
    if (debug > 0.5) { float a = texture2D(tLow, vUv).a; float r = (a - 0.5) * 512.0; if (a > 0.25) gl_FragColor = vec4(fract(r * 0.137), fract(r * 0.311), fract(r * 0.071), 1.0); }
  }`,
  { tFinal: { value: finalRT.texture }, tLow: { value: lowRT.texture }, dirt: { value: DIRT }, debug: { value: new URLSearchParams(location.search).get('debug') === 'rank' ? 1 : 0 } });

// ---- the toon material: pixelize.py's four tones per part, on the GPU ----------------------------------------------
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
function toon(m: THREE.MeshLambertMaterial): THREE.MeshLambertMaterial {
  const rank = { value: 0 }; m.userData.rank = rank;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.rank = rank;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float rank;\n' + TONE_GLSL)
      .replace('#include <opaque_fragment>', `
        vec3 albedo = toSrgb(diffuseColor.rgb);
        float ratio = lumaOf(toSrgb(outgoingLight)) / max(lumaOf(albedo), 0.03);
        int lv = ratio < ${BANDS[0]} ? 0 : ratio < ${BANDS[1]} ? 1 : ratio < ${BANDS[2]} ? 2 : 3;
        outgoingLight = toneOf(albedo, lv);
        #include <opaque_fragment>
        gl_FragColor.a = 0.5 + rank / 512.0;   // after opaque_fragment, which sets an opaque material's alpha to 1`);
  };
  return m;
}

// ---- scenes ----------------------------------------------------------------------------------------------------------
const scene3d = new THREE.Scene();
const sun = new THREE.DirectionalLight(0xffffff, SUN); sun.position.set(-7, 12, 9); scene3d.add(sun, sun.target);
scene3d.add(new THREE.AmbientLight(new THREE.Color(1, 0.95, 0.88), AMB));
const cam = new THREE.OrthographicCamera(-W / 2 / PPU, W / 2 / PPU, H / 2 / PPU, -H / 2 / PPU, 0.1, 100);
cam.position.set(0, Math.sin(ELEV), Math.cos(ELEV)).multiplyScalar(40); cam.lookAt(0, 0, 0);
cam.updateMatrixWorld();

const spriteScene = new THREE.Scene();
const pixCam = new THREE.OrthographicCamera(0, W, 0, -H, -1, 1);   // art pixels, y down as negative

// screen position (art px, y down) of a ground point
const toPx = (v: THREE.Vector3) => { const p = v.clone().project(cam); return [(p.x + 1) / 2 * W, (1 - p.y) / 2 * H]; };

// ---- assets ----------------------------------------------------------------------------------------------------------
const loader = new GLTFLoader();
const [gClips, gWalk] = await Promise.all([loader.loadAsync(clipsUrl), loader.loadAsync(walkUrl)]);
const clipOf = (g: { animations: THREE.AnimationClip[] }, key: string) => {
  const c = g.animations.find((a) => a.name.toLowerCase().includes(key));
  if (!c) throw new Error('no clip ' + key + ' in ' + g.animations.map((a) => a.name).join(', '));
  return c;
};
const WALK = clipOf(gWalk, 'walk'), SLASH = clipOf(gClips, 'left_slash');
const template = gClips.scene;
template.traverse((o) => {
  const m = o as THREE.Mesh;
  if (!m.isMesh) return;
  const src = m.material as THREE.MeshStandardMaterial;
  m.material = toon(new THREE.MeshLambertMaterial({ map: src.map, color: src.color }));
  m.frustumCulled = false;
});
// normalise as render.py: 1.98 units tall, feet centred on the origin
template.updateMatrixWorld(true);
const box = new THREE.Box3().setFromObject(template, true);
const k = 1.98 / (box.max.y - box.min.y);
const centre = box.getCenter(new THREE.Vector3());
const bladeMat = toon(new THREE.MeshLambertMaterial({ color: new THREE.Color(0.62, 0.64, 0.66) }));

const tex = await new THREE.TextureLoader().loadAsync(sheetUrl);
tex.colorSpace = THREE.NoColorSpace; tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
const [cw, ch] = meta.cell, cols = meta.cols ?? 1e9;
const sheetW = tex.image.width, sheetH = tex.image.height;

// ---- goblins: a live one and a baked one per slot --------------------------------------------------------------------
interface Gob { mats: THREE.MeshLambertMaterial[]; py: number; live: THREE.Group; mixer: THREE.AnimationMixer; walk: THREE.AnimationAction; slash: THREE.AnimationAction; sprite: THREE.Mesh; tex: THREE.Texture; ofs: number }
const gobs: Gob[] = [];
function makeGob(i: number): Gob {
  const inner = SkeletonUtils.clone(template);
  inner.scale.set(k * SQUASH.x, k * SQUASH.y, k * SQUASH.z);
  inner.position.set(-centre.x * k * SQUASH.x, -box.min.y * k * SQUASH.y, -centre.z * k * SQUASH.z);
  const live = new THREE.Group(); live.add(inner); scene3d.add(live);
  const mats: THREE.MeshLambertMaterial[] = [];
  inner.traverse((o) => {   // own materials, so each goblin carries its own depth rank
    const m = o as THREE.Mesh;
    if (m.isMesh) { const c = toon((m.material as THREE.MeshLambertMaterial).clone()); m.material = c; mats.push(c); }
  });
  const hand = inner.getObjectByName('RightHand');
  if (hand) {
    live.updateMatrixWorld(true);
    const s = hand.getWorldScale(new THREE.Vector3());
    const bm = toon(bladeMat.clone()); mats.push(bm);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(BLADE.thick, BLADE.len, BLADE.wide), bm);
    blade.scale.set(1 / s.x, 1 / s.y, 1 / s.z);
    blade.position.set(0, BLADE.along / s.y, 0);
    hand.add(blade);
  }
  const mixer = new THREE.AnimationMixer(inner);
  const walk = mixer.clipAction(WALK), slash = mixer.clipAction(SLASH);
  const t = tex.clone(); t.needsUpdate = true;
  t.repeat.set(cw / sheetW, ch / sheetH);
  const sprite = new THREE.Mesh(new THREE.PlaneGeometry(cw, ch), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthTest: false }));
  spriteScene.add(sprite);
  return { mats, py: 0, live, mixer, walk, slash, sprite, tex: t, ofs: (i * 0.37) % 1 };
}
function setCount(n: number) {
  while (gobs.length < n) gobs.push(makeGob(gobs.length));
  gobs.forEach((g, i) => { g.live.visible = i < n && show3d; g.sprite.visible = i < n; });
}

// ---- state and UI ------------------------------------------------------------------------------------------------------
let mode = q.get('mode') ?? 'walk', speed = Number(q.get('speed') ?? 1), count = Number(q.get('n') ?? 12), snap = q.get('snap') !== '0', show3d = q.get('live') !== '0';
let fixedT = q.has('t') ? Number(q.get('t')) : null;
// for captures: hold the clock at a time (scripts drive it to film a move frame by frame)
(window as unknown as { __setT: (t: number) => void }).__setT = (t) => { fixedT = t; };
const ui = { mode: $<HTMLSelectElement>('mode'), speed: $<HTMLInputElement>('speed'), count: $<HTMLInputElement>('count'), snap: $<HTMLInputElement>('snap'), show3d: $<HTMLInputElement>('show3d') };
ui.mode.value = mode; ui.speed.value = String(speed); ui.count.value = String(count); ui.snap.checked = snap; ui.show3d.checked = show3d;
const syncUi = () => {
  mode = ui.mode.value; speed = Number(ui.speed.value); count = Number(ui.count.value); snap = ui.snap.checked; show3d = ui.show3d.checked;
  $('speedv').textContent = speed.toFixed(2); $('countv').textContent = String(count); setCount(count);
};
for (const e of Object.values(ui)) e.addEventListener('input', syncUi);
syncUi();

const DIR8 = (a: number) => ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
function spriteCell(g: Gob, move: string, f: number, a: number, px: number, py: number) {
  const m = meta.moves[move], d = DIR8(a), col = f % cols, band = Math.floor(f / cols);
  g.tex.offset.set((col * cw) / sheetW, 1 - ((m.row + d + 8 * band + 1) * ch) / sheetH);
  const [fx, fy] = meta.feet;
  g.sprite.position.set(Math.round(px - fx) + cw / 2, -(Math.round(py - fy) + ch / 2), 0);
  g.sprite.renderOrder = py;
}

let T = 0, last = performance.now();
const frameMs: number[] = [], cpuMs: number[] = [];
function update(dt: number) {
  T = fixedT ?? T + dt * speed;
  const n = count, colsN = Math.max(1, Math.ceil(Math.sqrt(n * 1.6)));
  const rows = Math.ceil(n / colsN);
  const xs = Math.min(1.6, (W / 2 / PPU - 1.5) / colsN), zs = Math.min(3.2, (H / PPU - 3) / Math.sin(ELEV) / Math.max(1, rows));
  const atk = meta.attacks[0], aFps = meta.fps, aDur = atk.frames.length / aFps, aT0 = atk.frames[0] / aFps;
  for (let i = 0; i < n; i++) {
    const g = gobs[i];
    const gx = (i % colsN - (colsN - 1) / 2) * xs, gz = (Math.floor(i / colsN) - (rows - 1) / 2) * zs;
    let x = gx, z = gz, a = 0, move = 'walk', f = 0, ct = 0;
    const t = T + g.ofs * 3;
    if (mode === 'walk') {
      const th = g.ofs * 6.28 + t * 0.8, r = Math.min(1.0, xs * 0.4);
      x += Math.cos(th) * r; z += Math.sin(th) * r; a = th + Math.PI / 2;
      ct = t % WALK.duration; f = Math.floor((ct / WALK.duration) * meta.moves.walk.n);
    } else if (mode === 'turn') {
      a = t * 0.6 + g.ofs * 6.28;
      ct = t % WALK.duration; f = Math.floor((ct / WALK.duration) * meta.moves.walk.n);
    } else {
      move = 'attack0'; a = (i % 16) * (Math.PI / 8);
      const tt = t % aDur; ct = aT0 + tt; f = Math.min(atk.frames.length - 1, Math.floor(tt * aFps));
    }
    // the live goblin, on the left half
    const lx = x - W / 4 / PPU;
    g.live.position.set(lx, 0, z);
    g.live.rotation.y = Math.PI / 2 - a;
    if (snap) {   // whole art pixels on screen, as a sprite would stand
      const [px, py] = toPx(g.live.position);
      g.live.position.x += (Math.round(px) - px) / PPU;
      g.live.position.z += (Math.round(py) - py) / (PPU * Math.sin(ELEV));
    }
    g.walk.enabled = move === 'walk'; g.slash.enabled = move !== 'walk';
    (move === 'walk' ? g.walk : g.slash).play();
    (move === 'walk' ? g.walk : g.slash).weight = 1;
    g.mixer.setTime(ct);
    g.py = toPx(g.live.position)[1];
    // the baked one, on the right half, at the same ground point
    const [px, py] = toPx(new THREE.Vector3(x + W / 4 / PPU, 0, z));
    spriteCell(g, move, f, a, px, py);
  }
}
function rankLive() {   // nearer the camera (lower on screen) ranks higher, for the outline pass
  const vis = gobs.slice(0, count).sort((p, q) => p.py - q.py);
  vis.forEach((g, r) => { for (const m of g.mats) (m.userData.rank as { value: number }).value = r + 1; });
}
function render() {
  rankLive();
  renderer.info.reset();
  renderer.autoClear = true;
  renderer.setRenderTarget(hiRT); renderer.setClearColor(0x000000, 0); renderer.clear();
  if (show3d) renderer.render(scene3d, cam);
  renderer.setRenderTarget(lowRT); renderer.render(resolve, quadCam);
  renderer.setRenderTarget(finalRT); renderer.render(outline, quadCam);
  renderer.autoClear = false; renderer.render(spriteScene, pixCam); renderer.autoClear = true;
  renderer.setRenderTarget(null); renderer.render(blit, quadCam);
}

// ?bench=1: 2 s to settle, 4 s measured, the result in the title (scripts/bench.mjs reads it)
const bench = q.has('bench') ? { start: performance.now(), done: false } : null;
function loop() {
  const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
  frameMs.push(dt * 1000); if (frameMs.length > 120) frameMs.shift();
  const c0 = performance.now(); update(dt); render(); const c1 = performance.now();
  cpuMs.push(c1 - c0); if (cpuMs.length > 120) cpuMs.shift();
  const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const fps = 1000 / avg(frameMs);
  $('stats').textContent = `${fps.toFixed(0)} fps · ${avg(frameMs).toFixed(1)} ms a frame (${avg(cpuMs).toFixed(1)} ms to submit) · ${renderer.info.render.triangles.toLocaleString()} triangles · ${renderer.info.render.calls} draw calls`;
  if (bench && !bench.done) {
    const el = now - bench.start;
    if (el > 2000 && el < 2100) { frameMs.length = 0; cpuMs.length = 0; }
    if (el > 6000) {
      bench.done = true;
      const sorted = [...frameMs].sort((a, b) => a - b);
      document.title = 'BENCH ' + JSON.stringify({ n: count, mode, live: show3d, fps: +fps.toFixed(1), ms: +avg(frameMs).toFixed(2), p95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2), submit: +avg(cpuMs).toFixed(2), tris: renderer.info.render.triangles, calls: renderer.info.render.calls, gpu: gpuName() });
    }
  }
  requestAnimationFrame(loop);
}
function gpuName(): string {
  const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
}
(window as unknown as { __ready: boolean }).__ready = true;
loop();
