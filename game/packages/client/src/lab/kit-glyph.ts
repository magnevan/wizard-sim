/**
 * Glyph paths for the kit renderer (kit-render.ts): the compiler's `glyph.run` (tools/kit/compile.py, from a scene's
 * `glyph` object), drawn to size along its route, never a model. Lines of runes carved flush into the ground that carry
 * a well's power, as the battery's were in the pixel era (art/glyph-path.ts, feed-lines.ts; the user on the infirmary,
 * 2026-11-27: "rune carvings on the ground", "it should look like you can walk over it"; the look:
 * tools/infirmary-review/img/purif-2.jpg):
 * - a groove in the floor, its edges carved darker, two thin lines of light inside it and runes between them (the
 *   Codex-painted Life runes, textures/glyph-runes.png, sixteen in a 4 x 4 sheet, white on black, tinted here);
 * - round medallions with a sprouting leaf (textures/glyph-medallion.png) on its pads (free ends), bends and junctions;
 * - a soft spill of light on the floor beside it, and a slow swell of light running out from the run's start (on
 *   through a junction: the compiler's s0 is how far along the network a run starts);
 * - its brightness by state (lit 1, dim 0.35, dark 0), settable at run time (setGlyphState): as it falls, runes blink
 *   out one by one (each has its own threshold) and the lines fade, down to bare carving.
 * It lies a hair over the floor (LIFT) and drapes over kerbs (the compiler puts a vertical step at the kerb's line,
 * drawn a little out from its face, SIDE), and climbs a wall face as a vertical inlay where two points share x, y.
 * Every run in a scene is one mesh, one draw call (glyphScene); each run also gets an invisible copy for picking
 * (glyphPick), so the map editor can select it as a piece.
 * Coordinates as kit-render: three's x is the scene's x (u), z its y (u), y the height (u).
 */
import * as THREE from 'three';

/** A glyph.run as compiled: pts [x u, y u, z m]; nodes [x u, y u, z m, pad | bend | junction]; w u; col '#rrggbb'; state; s0 u. */
export type GlyphRun = { src?: string; pts: number[][]; nodes?: (number | string)[][]; w?: number; col?: string; state?: string; s0?: number };
export type GlyphState = 'lit' | 'dim' | 'dark';

/** u: the light's spill beside the groove, the lift over the floor, the offset out from a wall or kerb face; medallion diameters as shares of w; runs a scene can hold. */
export const GLYPH = { halo: 0.45, lift: 0.035, side: 0.07, pad: 2.1, bend: 1.55, junction: 1.75, max: 128, fade: 0.8, gain: 1.5 };
export const GLYPH_LEVEL: Record<GlyphState, number> = { lit: 1, dim: 0.35, dark: 0 };

// ---- the runs' brightness, by id: what the shader reads (LEVEL), eased toward TARGET each frame ----
const LEVEL = new Float32Array(GLYPH.max), TARGET = new Float32Array(GLYPH.max), FADE = new Float32Array(GLYPH.max).fill(GLYPH.fade);
const IDS = new Map<string, number>();
let lastT = -1;

/** The glyph runs built now, by id. */
export const glyphIds = (): string[] => [...IDS.keys()];
/**
 * Set a run's brightness by its scene id: a state (lit, dim, dark) or a level from 0 (bare carving) to 1 (lit), eased
 * there over `fade` seconds (0: at once). Returns false if no such run is built. For the game to relight lines one by one.
 */
export function setGlyphState(id: string, state: GlyphState | number, fade = GLYPH.fade): boolean {
  const i = IDS.get(id);
  if (i === undefined) return false;
  TARGET[i] = typeof state === 'number' ? Math.max(0, Math.min(1, state)) : GLYPH_LEVEL[state];
  FADE[i] = fade;
  if (fade <= 0) LEVEL[i] = TARGET[i];
  return true;
}
/** A run's brightness now (0 to 1), or undefined. */
export const glyphLevel = (id: string): number | undefined => { const i = IDS.get(id); return i === undefined ? undefined : LEVEL[i]; };
/** Advance the glyphs to time t (seconds): the pulse, and each run's brightness toward its target. Called by spinKit. */
export function stepGlyphs(t: number) {
  U.uTime.value = t;
  const dt = lastT < 0 ? 0 : Math.max(0, Math.min(0.25, t - lastT)); lastT = t;
  for (const i of IDS.values()) {
    const d = TARGET[i] - LEVEL[i];
    LEVEL[i] = Math.abs(d) < 1e-3 || FADE[i] <= 0 ? TARGET[i] : LEVEL[i] + d * Math.min(1, dt / (FADE[i] / 3));
  }
}

const U = {
  uTime: { value: 0 }, uLevel: { value: LEVEL as unknown as number[] },
  uRunes: { value: null as THREE.Texture | null }, uMedal: { value: null as THREE.Texture | null }, uTex: { value: 0 },
};

const VERT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  #include <fog_pars_vertex>
  uniform float uLevel[${GLYPH.max}];
  attribute vec4 aG;      // s along the network (u), kind (0 strip, 1 medallion), run, half width (u: groove or disc)
  attribute vec3 aCol;
  attribute vec2 aL;      // where in it (u): strip (0, across), medallion (x, y) from its centre
  varying vec4 vG; varying vec3 vCol; varying vec2 vL; varying float vB;
  void main() {
    vG = aG; vCol = aCol; vL = aL; vB = uLevel[int(aG.z + 0.5)];
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
    #include <fog_vertex>
  }`;

const FRAG = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  #include <fog_pars_fragment>
  uniform float uTime, uTex;
  uniform sampler2D uRunes, uMedal;
  varying vec4 vG; varying vec3 vCol; varying vec2 vL; varying float vB;
  float gHash(float n) { return fract(sin(n * 127.1 + 31.7) * 43758.5453); }
  // a rune's strokes, 0..1: from the painted sheet, or a plain diamond without it
  float rune(float k, vec2 q) {
    if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) return 0.0;
    if (uTex < 0.5) { float d = abs(q.x - 0.5) + abs(q.y - 0.5); return smoothstep(0.06, 0.02, abs(d - 0.3)); }
    vec2 cell = vec2(mod(k, 4.0), floor(k / 4.0));
    return smoothstep(0.25, 0.6, texture2D(uRunes, (cell + q) / 4.0).r);
  }
  void main() {
    #include <logdepthbuf_fragment>
    float s = vG.x, hw = vG.w, run = vG.z, B = vB;
    // the swell running out from the start: slow, long, a broad bright crest
    float swell = pow(0.5 + 0.5 * sin(6.2832 * (s / 16.0 - uTime * 0.2)), 5.0);
    float pulse = 0.78 + 0.5 * swell;
    float carve = 0.0, glow = 0.0, halo = 0.0;
    if (vG.y < 0.5) {
      float d = abs(vL.y), a = d / hw;
      if (a <= 1.0) {
        // the groove: carved darker toward its edges; a faint fill of light inside when lit
        carve = 0.12 + 0.42 * smoothstep(0.82, 0.97, a) * (1.0 - smoothstep(0.97, 1.0, a) * 0.5);
        glow = 0.07 * B * pulse * (1.0 - smoothstep(0.6, 0.8, a));
        // two thin lines of light
        float line = 1.0 - smoothstep(0.012, 0.03, abs(d - hw * 0.78));
        glow = max(glow, line * smoothstep(0.0, 0.25, B) * (0.45 + 0.35 * B) * pulse);
        carve = max(carve, line * 0.75);
        // runes between them, each with its own threshold: as the level falls they blink out one by one
        float stp = hw * 1.75, k = floor(s / stp), f = fract(s / stp);
        float sz = hw * 1.45;
        vec2 q = vec2((f - 0.5) * stp / sz + 0.5, 0.5 - vL.y / sz);   // (upright on a run heading east)
        float id = floor(gHash(k + run * 17.0) * 16.0);
        float m = rune(id, q);
        float th = 0.08 + 0.84 * gHash(k * 3.17 + run * 5.3);
        float on = smoothstep(th - 0.03, th + 0.03, B + 0.05 * sin(uTime * 11.0 + k * 7.3) * step(abs(B - th), 0.12));
        glow = max(glow, m * on * pulse * (0.75 + 0.25 * B));
        carve = max(carve, m * 0.85);
      } else {
        halo = B * 0.28 * pulse * exp(-(d - hw) / ${GLYPH.halo.toFixed(2)} * 3.2);
      }
    } else {
      float r = length(vL) / hw;
      if (r <= 1.0) {
        carve = 0.16 + 0.45 * smoothstep(0.9, 1.0, r);
        vec2 q = vL / hw * 0.5 + 0.5;
        float m = uTex > 0.5 ? smoothstep(0.25, 0.6, texture2D(uMedal, q).r) : smoothstep(0.08, 0.03, abs(r - 0.8));
        glow = max(0.12 * B * pulse, m * smoothstep(0.0, 0.2, B) * (0.6 + 0.4 * B) * pulse * 1.05);
        carve = max(carve, m * 0.85);
      } else {
        halo = B * 0.34 * pulse * exp(-(r - 1.0) * hw / ${GLYPH.halo.toFixed(2)} * 3.0);
      }
    }
    glow = clamp(glow, 0.0, 1.0);
    // premultiplied: the carving darkens what's under it, the light adds to it
    vec3 dark = vec3(0.05, 0.045, 0.04);
    float cover = carve * (1.0 - 0.7 * glow);
    vec3 light = vCol * glow * ${GLYPH.gain.toFixed(2)} + vec3(0.9, 1.0, 0.8) * pow(glow, 4.0) * 0.12 + vCol * halo * 0.9;
    if (cover < 0.004 && max(light.r, max(light.g, light.b)) < 0.004) discard;
    gl_FragColor = vec4(dark * cover + light, cover);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

let MAT: THREE.ShaderMaterial | undefined;
/** The one material every glyph run draws with; `runes` and `medal` the painted sheets (white on black), if loaded. */
export function glyphMaterial(runes?: THREE.Texture, medal?: THREE.Texture): THREE.ShaderMaterial {
  U.uRunes.value = runes ?? null; U.uMedal.value = medal ?? null; U.uTex.value = runes && medal ? 1 : 0;
  return (MAT ??= new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.merge([THREE.UniformsLib.fog]), ...U }, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide, premultipliedAlpha: true,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
}

type V3 = THREE.Vector3;
/** Builds the vertices of one run or more. */
class Buf {
  p: number[] = []; g: number[] = []; c: number[] = []; l: number[] = []; idx: number[] = []; tail: number[] = [];
  v(p: V3, s: number, kind: number, run: number, hw: number, col: THREE.Color, lx: number, ly: number) {
    this.p.push(p.x, p.y, p.z); this.g.push(s, kind, run, hw); this.c.push(col.r, col.g, col.b); this.l.push(lx, ly);
    return this.p.length / 3 - 1;
  }
  build(): THREE.BufferGeometry | null {
    const idx = [...this.idx, ...this.tail];   // the medallions last, so they lie over the strips
    if (!idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('aG', new THREE.Float32BufferAttribute(this.g, 4));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aL', new THREE.Float32BufferAttribute(this.l, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }
}

const UP = new THREE.Vector3(0, 1, 0);
/** A medallion's radius (u) on a run of width w. */
const medR = (kind: string, w: number) => (w * (kind === 'pad' ? GLYPH.pad : kind === 'junction' ? GLYPH.junction : GLYPH.bend)) / 2;
/** Every run's medallions, as places the strips stop short of (three's coordinates, radius u). */
function medallions(runs: GlyphRun[], yOf: (m: number) => number): [V3, number][] {
  return runs.flatMap((r) => (r.nodes ?? []).map((nd) => [new THREE.Vector3(Number(nd[0]), yOf(Number(nd[2])), Number(nd[1])), medR(String(nd[3]), r.w ?? 0.9)] as [V3, number]));
}

/**
 * Lay one run into b: the strip (halo included, or only the groove: `pickOnly`) and its medallions. The strip stops
 * under each medallion in `cuts` (its own and those of runs joining it), so a medallion's sprout lies on bare carving.
 */
function layRun(b: Buf, run: GlyphRun, yOf: (m: number) => number, index: number, pickOnly = false, cuts: [V3, number][] = []) {
  const P = run.pts.map(([x, y, z]) => new THREE.Vector3(x, yOf(z), y));
  if (P.length < 2) return;
  const w = run.w ?? 0.9, hw = w / 2, W = pickOnly ? hw : hw + GLYPH.halo, s0 = run.s0 ?? 0;
  const col = new THREE.Color(run.col ?? '#7ee05a');
  const n = P.length;
  // each segment's level heading (unit, in x-z), or null where it climbs straight up or down
  const H: (THREE.Vector2 | null)[] = [];
  for (let i = 0; i + 1 < n; i++) {
    const h = new THREE.Vector2(P[i + 1].x - P[i].x, P[i + 1].z - P[i].z);
    H.push(h.length() > 1e-4 ? h.normalize() : null);
  }
  const near = (i: number): THREE.Vector2 => {   // the nearest level heading to segment i
    for (let k = 0; k < H.length; k++) for (const j of [i - k, i + k]) if (H[j]) return H[j]!;
    return new THREE.Vector2(1, 0);
  };
  // a climbing segment's face: it looks back the way the run came onto it (going up) or on the way it leaves (going down)
  const faceOf = (j: number): THREE.Vector3 => {
    const h = (j > 0 && H[j - 1]) || (j + 1 < H.length && H[j + 1]) || near(j), sgn = P[j + 1].y < P[j].y ? 1 : -1;
    return new THREE.Vector3(h.x * sgn, 0, h.y * sgn);
  };
  let s = s0;
  const L: number[] = [], A: V3[] = [], O: V3[] = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) s += P[i].distanceTo(P[i - 1]);
    L.push(s);
    const hin = i > 0 ? H[i - 1] : null, hout = i < n - 1 ? H[i] : null;
    let across: V3;
    if (hin && hout) {   // a mitred corner
      const m = hin.clone().add(hout);
      const mm = m.length() > 1e-4 ? m.normalize() : hin.clone();
      const k = 1 / Math.max(0.5, mm.dot(hin));
      across = new THREE.Vector3(-mm.y * k, 0, mm.x * k);
    } else {
      const h = hin ?? hout ?? near(i);
      across = new THREE.Vector3(-h.y, 0, h.x);
    }
    A.push(across);
    // lift: up off a floor, out from a face (both at a fold between them)
    const off = new THREE.Vector3();
    if (hin || hout) off.addScaledVector(UP, GLYPH.lift);
    if (i > 0 && !hin) off.addScaledVector(faceOf(i - 1), GLYPH.side);
    if (i < n - 1 && !hout && !(i > 0 && !hin)) off.addScaledVector(faceOf(i), GLYPH.side);
    O.push(off);
  }
  // the strip, segment by segment, less the stretches under medallions; whole joints share their (mitred) vertices
  const pair = (p: V3, across: V3, off: V3, sAt: number) => {
    const c = p.clone().add(off);
    return [b.v(c.clone().addScaledVector(across, -W), sAt, 0, index, hw, col, 0, -W), b.v(c.clone().addScaledVector(across, W), sAt, 0, index, hw, col, 0, W)];
  };
  const joint = P.map((p, i) => pair(p, A[i], O[i], L[i]));
  for (let i = 0; i + 1 < n; i++) {
    const a = P[i], d = P[i + 1].clone().sub(a), len = d.length();
    if (len < 1e-5) continue;
    d.divideScalar(len);
    const gone: [number, number][] = [];
    for (const [c, r] of cuts) {
      const rr = r * 0.88, t = c.clone().sub(a).dot(d), dist = a.clone().addScaledVector(d, t).distanceTo(c);
      if (dist < rr) { const h = Math.sqrt(rr * rr - dist * dist); if (t + h > 0 && t - h < len) gone.push([t - h, t + h]); }
    }
    gone.sort((x, y) => x[0] - y[0]);
    const keep: [number, number][] = [];
    let from = 0;
    for (const [g0, g1] of gone) { if (g0 > from) keep.push([from, Math.min(g0, len)]); from = Math.max(from, g1); }
    if (from < len) keep.push([from, len]);
    const h = H[i] ?? near(i), plain = new THREE.Vector3(-h.y, 0, h.x);
    const at = (t: number) => {
      if (t <= 1e-6) return joint[i];
      if (t >= len - 1e-6) return joint[i + 1];
      return pair(a.clone().addScaledVector(d, t), plain, O[i].clone().lerp(O[i + 1], t / len), L[i] + t);
    };
    for (const [t0, t1] of keep) {
      if (t1 - t0 < 1e-3) continue;
      const p0 = at(t0), p1 = at(t1);
      b.idx.push(p0[0], p1[0], p1[1], p0[0], p1[1], p0[1]);
    }
  }
  // the medallions: on the floor, or on the wall face where an end climbs one
  for (const nd of run.nodes ?? []) {
    const [x, y, z, kind] = nd as [number, number, number, string];
    const at = new THREE.Vector3(x, yOf(z), y);
    const R = medR(kind, w);
    const RW = pickOnly ? R : R + GLYPH.halo;
    let nrm = UP.clone(), ax = new THREE.Vector3(1, 0, 0);
    // which point of the run it is on (nearest), for its pulse and its face
    let best = 0, bd = Infinity;
    P.forEach((p, i) => { const dd = p.distanceTo(at); if (dd < bd) { bd = dd; best = i; } });
    const sAt = L[best];
    const seg = best === 0 ? 0 : best === n - 1 ? n - 2 : -1;
    if (seg >= 0 && !H[seg] && bd < 0.05) {   // an end on a wall face: the medallion stands on it
      nrm = faceOf(seg); ax = new THREE.Vector3(nrm.z, 0, -nrm.x);   // (its sprout upright)
    }
    const bx = new THREE.Vector3().crossVectors(nrm, ax).normalize();
    const c = at.clone().addScaledVector(nrm, nrm.y > 0.5 ? GLYPH.lift * 1.4 : GLYPH.side * 1.2);
    const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => b.v(c.clone().addScaledVector(ax, u * RW).addScaledVector(bx, v * RW), sAt, 1, index, R, col, u * RW, v * RW));
    b.tail.push(q[0], q[2], q[1], q[0], q[3], q[2]);
  }
}

/** Every glyph run of a scene as one mesh (one draw call), its runs' brightness reset to their states; null without runs. */
export function glyphScene(runs: (GlyphRun & { src?: string })[], yOf: (m: number) => number, mat: THREE.Material): THREE.Mesh | null {
  IDS.clear();
  const b = new Buf();
  const cuts = medallions(runs, yOf);
  runs.slice(0, GLYPH.max).forEach((r, i) => {
    if (r.src) IDS.set(r.src, i);
    LEVEL[i] = TARGET[i] = GLYPH_LEVEL[(r.state ?? 'lit') as GlyphState] ?? 1;
    layRun(b, r, yOf, i, false, cuts);
  });
  const g = b.build();
  if (!g) return null;
  const m = new THREE.Mesh(g, mat);
  m.raycast = () => undefined;   // picked by each run's own copy (glyphPick)
  m.renderOrder = 1;             // over the floors and their decals
  m.frustumCulled = false;
  m.userData.noFade = true;
  return m;
}

const PICK = new THREE.MeshBasicMaterial({ color: 0x7ee05a });
/** One run's groove and medallions, hidden, for picking and the editor's selection (the glyphs draw in glyphScene's mesh). */
export function glyphPick(run: GlyphRun, yOf: (m: number) => number): THREE.Group {
  const g = new THREE.Group(), b = new Buf();
  layRun(b, run, yOf, 0, true);
  const geo = b.build();
  if (geo) { const m = new THREE.Mesh(geo, PICK); m.visible = false; g.add(m); }
  return g;
}
