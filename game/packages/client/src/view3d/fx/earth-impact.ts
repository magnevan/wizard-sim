/**
 * A rock's impact (the Earth family): the rock breaking where it ends, built again after the user found the painted
 * one (docs/reference/spell-concepts/earth/toon-impact-2.jpg) "a little weird". It has no light of its own, so its weight
 * comes from dark values, the stone and the dust:
 *
 * 1. **Shards**: the rock's own stone (the same toon mesh, lit by the scene) breaking into a few big chunks that barely
 *    move and many small ones flung out and up, carried on the way the rock flew, falling, landing and sinking away.
 *    They are the rock's colour, never the floor's: chunks of floor standing up would read as the Earthquake.
 * 2. **Dust** (eroded meshes, dust-mesh.ts: no sprites): a low ring of ochre dust rolling outward and thinning away,
 *    a dark lump thrown up and forward at the centre, and from four runes a fast thin shock ring running out ahead.
 * 3. **Cracks**: a star of dark cracks on the floor (painted, earth-cracks.png), running out in a blink, left a couple of
 *    seconds and fading; at five runes a dark crater in the middle.
 * 4. **A shake**: `shake(t)`, a short jolt of the view, bigger with more runes (the host moves its camera by it).
 *
 * Everything is a pure function of the time since the impact and its seed, so a frozen moment and a rollback draw the
 * same. Runes: more and bigger shards, a wider ring, longer cracks; four a shock ring, five a crater.
 */
import * as THREE from 'three';
import { GroundDecal, type HeightAt } from './decal';
import { DustMesh, paramGrid } from './dust-mesh';
import { EARTH_TEX } from './earth-sheets';
import { rockGeometry, stoneMaterial } from './rock-mesh';

/** One impact: when (s, the effect clock), where (sim x, z; the rock's height y), which way it flew, its size. */
export interface Impact {
  t: number; x: number; z: number; y: number; ux: number; uz: number; n: number; r: number; seed: number; key: string;
  /** A charged rock passing through a body it hit (the sim's pierce): chips and a burst of dust in the air, no floor marks. */
  pass?: boolean;
}

/** How long an impact draws (s): the cracks are last to go. */
export const IMPACT_LIFE = 3.4;
/** Impacts drawn at once (the oldest beyond this go first). */
const MAX_IMPACTS = 6;
/** Shard instances (all impacts together). */
const SHARD_CAP = 6 * 40;
/** A small hash in 0..1 (the shards' properties). */
const h01 = (a: number, b: number, c = 0): number => { const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - Math.floor(s); };

const GRAV = 22;
/** Shards an impact throws at n runes: a few big chunks of the rock, and many small ones. */
// half the small chips of round 2 (Codex: the aftermath spread wider than the collision); the big chunks stay
const shardCount = (n: number): number => 7 + 2 * n;
const BIG = 3;

/**
 * The dust ring: a torus rolling out along the floor from where the rock broke (its ring radius and its tube growing as
 * it slows), pushed a little the way the rock flew, its tube thicker in places (noise), eroded away by dust-mesh.ts.
 * The shock ring at four and five runes is the same shape, thin and fast.
 */
const RING = /* glsl */ `
uniform vec3 uC; uniform vec2 uDir; uniform float uR, uT, uLife, uTube, uRate, uR0;
void shape(vec2 q, out vec3 wp, out vec3 nrm, out float age) {
  float th = q.x * 6.2832, ph = q.y * 6.2832, go = 1.0 - exp(-uT * uRate);
  vec3 rd = vec3(cos(th), 0.0, sin(th)), up = vec3(0.0, 1.0, 0.0);
  float R = uR * (uR0 + (1.0 - uR0) * go);
  float tube = uTube * (0.45 + 0.75 * sqrt(go)) * (0.6 + 0.8 * vnoise3(vec3(rd.xz * 2.2, uSeed * 0.01)));
  vec3 c = uC + rd * R + vec3(uDir.x, 0.0, uDir.y) * uR * 0.3 * go + up * tube * 0.8;
  nrm = rd * cos(ph) + up * sin(ph);
  wp = c + vec3(nrm.x, nrm.y * 1.25, nrm.z) * tube;
  age = clamp(uT / uLife, 0.0, 1.0);
}`;

/** The burst: one lump of dark dust thrown up and forward where the rock broke, swelling and thinning. */
const BLOB = /* glsl */ `
uniform vec3 uC; uniform vec2 uDir; uniform float uR, uT, uLife, uB;
void shape(vec2 q, out vec3 wp, out vec3 nrm, out float age) {
  float th = q.x * 6.2832, ph = (q.y - 0.5) * 3.14159, go = 1.0 - exp(-uT * 4.0);
  nrm = vec3(cos(ph) * cos(th), sin(ph), cos(ph) * sin(th));
  float rad = uB * (0.5 + 0.7 * go) * (0.8 + 0.4 * vnoise3(nrm * 1.7 + uSeed * 0.01));
  vec3 c = uC + vec3(uDir.x, 0.0, uDir.y) * uR * 0.35 * go + vec3(0.0, 0.45 * go, 0.0);
  wp = c + vec3(nrm.x, nrm.y * 0.85, nrm.z) * rad;
  age = clamp(uT / uLife, 0.0, 1.0);
}`;

/** One impact's dust meshes. */
interface DustSet { ring: DustMesh; shock: DustMesh; blob: DustMesh }

/** The cracks: a painted star (earth-cracks.png, its cell and turn by seed), drawn dark, running out, then fading. */
const CRACKS = /* glsl */ `
uniform sampler2D uCracks; uniform float uHasCracks;
uniform vec4 uC0;   // x, z, crack radius, age (s)
uniform vec4 uC1;   // cell (0..3), turn (rad), n, 0
float crackAt(vec2 q) {
  if (uHasCracks < 0.5) {
    float a = atan(q.y, q.x), r = length(q), k = 8.0, f = fract(a / 6.2832 * k + 0.15 * sin(r * 9.0 + uC1.x));
    return smoothstep(0.08 * (1.0 - r), 0.0, abs(f - 0.5) / k * 6.2832 * r) * step(r, 0.9);
  }
  vec2 u = clamp(q * 0.5 + 0.5, 0.0, 1.0);
  float cx = mod(uC1.x, 2.0), cy = floor(uC1.x / 2.0);
  return texture(uCracks, vec2((cx + u.x) / 2.0, 1.0 - (cy + 1.0 - u.y) / 2.0)).r;
}
vec4 decal(vec3 wp) {
  vec2 d = wp.xz - uC0.xy; float R = uC0.z, t = uC0.w;
  float cs = cos(uC1.y), sn = sin(uC1.y);
  vec2 q = vec2(cs * d.x - sn * d.y, sn * d.x + cs * d.y) / R;
  float r = length(q);
  if (r > 1.25) return vec4(0.0);
  float fade = 1.0 - smoothstep(2.2, 3.2, t);
  // the star runs out in a blink
  float reach = smoothstep(0.0, 0.12, t) * 1.05;
  float c = smoothstep(0.35, 0.7, crackAt(q)) * step(r, reach) * fade;
  // a scuffed, dusty bruise round it, gone sooner; at five runes a dark crater in the middle
  float bruise = (1.0 - smoothstep(0.2, 1.15, r)) * 0.28 * (1.0 - smoothstep(0.8, 2.4, t)) * smoothstep(0.0, 0.05, t);
  float crater = uC1.z >= 5.0 ? (1.0 - smoothstep(0.18, 0.3, r)) * 0.55 * fade * smoothstep(0.0, 0.08, t) : 0.0;
  float a = max(c * 0.88, max(bruise, crater));
  vec3 col = c > bruise ? vec3(0.012, 0.008, 0.006) : vec3(0.05, 0.03, 0.015);
  return vec4(col * a, a);
}`;

export class EarthImpacts {
  /** Shards and other meshes: in the world scene (lit by the sun and the spell lights, casting shadows). */
  readonly meshes = new THREE.Group();
  /** Dust and cracks: in the effects scene. */
  readonly group = new THREE.Group();
  private list: Impact[] = [];
  private shards: THREE.InstancedMesh;
  private dust: DustSet[] = [];
  private cracks: GroundDecal[] = [];
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private v = new THREE.Vector3(); private s = new THREE.Vector3();

  constructor(private heightAt: HeightAt) {
    this.shards = new THREE.InstancedMesh(rockGeometry(71, 0, [1, 0.7, 0.85], 3), stoneMaterial(0.55), SHARD_CAP);
    this.shards.castShadow = true; this.shards.frustumCulled = false; this.shards.count = 0;
    this.meshes.add(this.shards);
    const torus = paramGrid(40, 10), ball = paramGrid(20, 12);
    const ringU = () => ({ uC: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector2() }, uR: { value: 1 }, uT: { value: 0 }, uLife: { value: 1 }, uTube: { value: 0.3 }, uRate: { value: 5.5 }, uR0: { value: 0.2 } });
    for (let i = 0; i < MAX_IMPACTS; i++) {
      const set: DustSet = {
        ring: new DustMesh(RING, torus, ringU(), { freq: 2.1, body: 0.04, order: 2 }),
        shock: new DustMesh(RING, torus, ringU(), { freq: 2.2, order: 2 }),
        blob: new DustMesh(BLOB, ball, { uC: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector2() }, uR: { value: 1 }, uT: { value: 0 }, uLife: { value: 0.9 }, uB: { value: 0.5 } }, { dark: 0.7, freq: 2.4, body: 0.06, order: 3 }),
      };
      this.dust.push(set);
      this.group.add(set.ring.mesh, set.shock.mesh, set.blob.mesh);
    }
    for (let i = 0; i < MAX_IMPACTS; i++) {
      const d = new GroundDecal({ look: CRACKS, step: 0.25, order: -1, uniforms: { uCracks: { value: EARTH_TEX.cracks }, uHasCracks: { value: EARTH_TEX.cracks ? 1 : 0 }, uC0: { value: new THREE.Vector4() }, uC1: { value: new THREE.Vector4() } } }, heightAt);
      this.cracks.push(d); this.group.add(d.mesh);
    }
  }

  /** A new impact (once per key: a replayed step's comes again with the same key). */
  add(i: Impact): void {
    if (this.list.some((o) => o.key === i.key)) return;
    this.list.push(i);
  }

  /** Impacts from the last `within` s before t (the flash's moment of contact). */
  recent(t: number, within: number): readonly Impact[] { return this.list.filter((i) => t - i.t >= 0 && t - i.t < within); }

  /** Drop impacts after time t (a rewind: the replay makes them again), or all with t < 0. */
  rewind(t: number): void { this.list = t < 0 ? [] : this.list.filter((i) => i.t <= t + 1e-6); }

  /** The view's jolt at time t: a small offset (u) to move the camera by, from every fresh impact. */
  shake(t: number): THREE.Vector3 {
    const o = new THREE.Vector3();
    for (const i of this.list) {
      const a = t - i.t;
      if (a < 0 || a > 0.32) continue;
      const amp = 0.022 * Math.pow(i.n, 1.3) * Math.pow(1 - a / 0.32, 2) * (i.pass ? 0.4 : 1);
      o.x += amp * Math.sin(a * 95 + i.seed); o.y += amp * 0.6 * Math.sin(a * 120 + i.seed * 2.1); o.z += amp * Math.cos(a * 83 + i.seed * 0.7);
    }
    return o;
  }

  /** Draw at effect time t. */
  update(t: number): void {
    this.list = this.list.filter((i) => t - i.t < IMPACT_LIFE && i.t <= t + 1e-6);
    const shown = this.list.slice(-MAX_IMPACTS);
    let k = 0;
    for (let s = 0; s < MAX_IMPACTS; s++) {
      const i = shown[s], dc = this.cracks[s], D = this.dust[s];
      if (!i) { dc.mesh.visible = D.ring.mesh.visible = D.shock.mesh.visible = D.blob.mesh.visible = false; continue; }
      const age = t - i.t, g = this.heightAt(i.x, i.z), R = 0.7 + 0.25 * i.n + i.r;
      this.dustAt(D, i, age, g, R);
      // cracks
      const cr = 0.75 + 0.28 * i.n + i.r;
      (dc.u.uC0.value as THREE.Vector4).set(i.x, i.z, cr, age);
      (dc.u.uC1.value as THREE.Vector4).set(Math.floor(h01(i.seed, 1) * 4), h01(i.seed, 2) * Math.PI * 2, i.n, 0);
      if (i.pass) dc.cover(null); else dc.cover({ x0: i.x - cr * 1.3, z0: i.z - cr * 1.3, x1: i.x + cr * 1.3, z1: i.z + cr * 1.3 });
      k = this.drawShards(i, age, g, k);
    }
    this.shards.count = k;
    this.shards.instanceMatrix.needsUpdate = true;
    this.group.visible = this.meshes.visible = shown.length > 0;
  }

  /** Impact i's dust at `age` s: the ring on the floor (not for a pass-through), the burst, the shock ring from four runes. */
  private dustAt(D: DustSet, i: Impact, age: number, g: number, R: number): void {
    const set = (d: DustMesh, on: boolean, life: number, o: Record<string, number>, y: number): void => {
      d.mesh.visible = on && age < life;
      if (!d.mesh.visible) return;
      const u = d.u;
      (u.uC.value as THREE.Vector3).set(i.x, y, i.z); (u.uDir.value as THREE.Vector2).set(i.ux, i.uz);
      u.uT.value = age; u.uLife.value = life; u.uR.value = R; u.uSeed.value = i.seed % 997; u.uSalt.value = (i.seed % 61) * 1.7; u.uClock.value = age;
      for (const [k, v] of Object.entries(o)) u[k].value = v;
    };
    set(D.ring, !i.pass, 1.5 + 0.08 * i.n, { uTube: 0.22 + 0.04 * i.n, uRate: 5.5, uR0: 0.2 }, g);
    set(D.shock, !i.pass && i.n >= 4, 0.5, { uTube: 0.1, uRate: 7, uR0: 0.4 }, g);
    D.shock.u.uR.value = R * 2;
    set(D.blob, true, 0.85, { uB: i.r * 0.7 + 0.18 }, i.pass ? i.y : (i.y + g) * 0.5);
  }

  /** The rock's shards at `age` s after impact i, from instance k; returns the next free instance. */
  private drawShards(i: Impact, age: number, g: number, k: number): number {
    const count = i.pass ? 4 + 2 * i.n : shardCount(i.n);
    for (let s = 0; s < count && k < SHARD_CAP; s++) {
      const big = !i.pass && s < BIG, sd = i.seed + s * 13;
      const a = h01(sd, 1) * Math.PI * 2, fwd = big ? 0.6 + h01(sd, 2) : 1.5 + 3 * h01(sd, 2);
      const sp = big ? 0.6 + 1.2 * h01(sd, 3) : (2.2 + 4.5 * h01(sd, 3)) * (0.85 + 0.08 * i.n);
      const vx = Math.cos(a) * sp + i.ux * fwd, vz = Math.sin(a) * sp + i.uz * fwd, vy = big ? 1 + 2 * h01(sd, 4) : 2.5 + 5 * h01(sd, 4);
      const size = big ? i.r * (0.42 + 0.14 * h01(sd, 5)) : i.r * (0.13 + 0.17 * h01(sd, 5)) + 0.03;
      const y0 = Math.max(g + size, i.y);
      // flight until it lands (y0 + vy t - G t²/2 = floor + size), then a short skid, then it sinks away
      const land = (vy + Math.sqrt(vy * vy + 2 * GRAV * (y0 - g - size * 0.6))) / GRAV;
      const tf = Math.min(age, land), skid = Math.max(0, age - land), slide = (1 - Math.exp(-skid * 6)) / 6 * 0.35;
      const x = i.x + vx * (tf + slide), z = i.z + vz * (tf + slide);
      const y = age < land ? y0 + vy * tf - 0.5 * GRAV * tf * tf : g + size * 0.6;
      const life = land + (big ? 0.9 : 0.35) + 0.4 * h01(sd, 6);
      if (age > life + 0.45) continue;
      const shrink = 1 - Math.min(1, Math.max(0, (age - life) / 0.45));
      const spin = (big ? 3 : 9 + 8 * h01(sd, 7)) * tf;
      this.e.set(h01(sd, 8) * 6.28 + spin, h01(sd, 9) * 6.28, h01(sd, 10) * 6.28 + spin * 0.6);
      this.q.setFromEuler(this.e);
      this.s.set(size * (0.8 + 0.5 * h01(sd, 11)), size * (0.7 + 0.4 * h01(sd, 12)), size).multiplyScalar(shrink);
      this.m.compose(this.v.set(x, y - (1 - shrink) * size * 0.5, z), this.q, this.s);
      this.shards.setMatrixAt(k++, this.m);
    }
    return k;
  }

  dispose(): void { this.shards.geometry.dispose(); (this.shards.material as THREE.Material).dispose(); for (const d of this.dust) { d.ring.dispose(); d.shock.dispose(); d.blob.dispose(); } for (const d of this.cracks) d.dispose(); }
}
