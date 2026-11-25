/**
 * The Earth family in 3D: the rock missile in flight and where it ends, built to the toon concepts the user picked on
 * 2026-11-25 (docs/reference/spell-concepts/earth/toon-rock-3.jpg; record: docs/explorations/2026-11-25-spell-concepts-tone.md).
 * The impact is earth-impact.ts; the rock's mesh and stone rock-mesh.ts.
 *
 * In flight, from the back to the front:
 *
 * 1. **The dust wake**: one tube of dust along the rock's line back toward the staff, thickening and sinking behind it,
 *    eroded by noise fixed in the world (dust-mesh.ts: no sprites), so it hangs where the rock passed and breaks into
 *    wisps as it ages. Ochre, darker than the court's floor, toon shaded.
 * 2. **Grit**: small stones dropping out of the wake to the floor.
 * 3. **The rock**: a seeded low-poly boulder, toon shaded with a dark rim, lit by the scene and casting its shadow,
 *    tumbling forward as it flies. It has no light of its own: its weight is its dark values.
 *
 * Size from the sim (earth-sheets.ts rockRadius): one rune about the sim's 0.3 u circle, growing with the damage's
 * n^rockExp as mass; more runes also a thicker, longer wake and more grit. While a seat charges a plain Earth Force,
 * the rock grows at its staff.
 *
 * The rock and its wake are pure functions of the clock and what was seen of the missile: where and when it left (its
 * flight is straight at a constant speed) and when it ended. Rollback: rewind() forgets what came after.
 *
 * Only plain Earth is drawn here (earth-sheets.ts plainRock). The rock, its stone material, the wake (with another
 * tint) and the impact take parameters so the carried-element missiles (the meteor, the frost comet, the charged
 * stone) can be built on them.
 */
import * as THREE from 'three';
import { EL, MAX_MISSILES, MAX_SEATS, PHASE, specOf, type World } from '@wizard-sim/sim';
import type { HeightAt } from './decal';
import { DustMesh, paramGrid } from './dust-mesh';
import { missileRunes, plainRock, rockRadius } from './earth-sheets';
import { EarthImpacts } from './earth-impact';
import { EarthStreaks, type StreakRock } from './earth-streaks';
import { rockGeometry, stoneMaterial } from './rock-mesh';

/** A rock's flight height over the floor at its middle (u): the staff's (standins.ts MISSILE_H). */
export const ROCK_H = 1.25;
/** Rocks drawn at once. */
const MAX_ROCKS = 8;
/** Rock shapes to pick from by seed. */
const SHAPES_N = 6;

/** What was seen of one rock: where and when it left, its velocity, its size, and when it ended. */
interface RockRec { slot: number; owner: number; t0: number; x0: number; z0: number; vx: number; vz: number; n: number; r: number; seed: number; end: number }

/** How long (s) the wake hangs where the rock passed, at n runes. */
const WAKE_LIFE = (n: number): number => 0.6 + 0.09 * n;

/**
 * The wake: a tube from just behind the rock back along its line, `uLen` long (as far as it has flown, or as far as the
 * wake lives), its radius growing and its middle sinking with the time since the rock passed there, wobbling a little.
 */
const WAKE = /* glsl */ `
uniform vec3 uHead; uniform vec2 uDir; uniform float uLen, uR, uSpeed, uSince, uLife;
void shape(vec2 q, out vec3 wp, out vec3 nrm, out float age) {
  float s = q.x * uLen, th = q.y * 6.2832;
  float a = (s / max(uSpeed, 0.1) + uSince) / uLife;
  age = max(clamp(a, 0.0, 1.0), smoothstep(0.82, 1.0, q.x));
  vec3 d = vec3(uDir.x, 0.0, uDir.y), side = vec3(-uDir.y, 0.0, uDir.x), up = vec3(0.0, 1.0, 0.0);
  float k = clamp(a, 0.0, 1.0);
  float rad = uR * (0.75 + 1.1 * sqrt(k)) * smoothstep(-0.2, 0.5, s) * (0.75 + 0.5 * vnoise3(vec3(s * 0.9, 1.3, uSeed * 0.01)));
  vec3 c = uHead - d * (s + uR * 0.8) - up * (0.2 * k * k) + side * (vnoise3(vec3(s * 0.6, 4.7, uSeed * 0.01)) - 0.5) * uR * k;
  nrm = side * cos(th) + up * sin(th);
  wp = c + (side * cos(th) + up * sin(th) * 0.8) * rad;
}`;

export class EarthFx {
  /** Rocks and stones: in the world scene (lit, shadowed), at the sim's origin. */
  readonly meshes = new THREE.Group();
  /** Dust and cracks: in the effects scene. */
  readonly group = new THREE.Group();
  readonly impacts: EarthImpacts;
  private recs: RockRec[] = [];
  private bySlot = new Map<number, RockRec>();
  private rocks: THREE.Mesh[] = [];
  private shapes: THREE.BufferGeometry[];
  private grit: THREE.InstancedMesh;
  private wakes: DustMesh[] = [];
  /** The air streaks behind each rock and the white flash where it hits (earth-streaks.ts). */
  private streaks = new EarthStreaks();
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private q2 = new THREE.Quaternion(); private ax = new THREE.Vector3(); private v = new THREE.Vector3(); private s = new THREE.Vector3();

  constructor(private heightAt: HeightAt) {
    const mat = stoneMaterial(0.6);
    const shapes = (this.shapes = Array.from({ length: SHAPES_N }, (_, i) => rockGeometry(1000 + i * 37, 1)));
    for (let i = 0; i < MAX_ROCKS + MAX_SEATS; i++) {
      const r = new THREE.Mesh(shapes[i % SHAPES_N], mat);
      r.castShadow = true; r.visible = false;
      this.rocks.push(r); this.meshes.add(r);
    }
    this.grit = new THREE.InstancedMesh(rockGeometry(5, 0, [1, 0.8, 0.9], 2), stoneMaterial(0.5), 160);
    this.grit.frustumCulled = false; this.grit.count = 0;
    this.meshes.add(this.grit);
    const tube = paramGrid(48, 14);
    for (let i = 0; i < MAX_ROCKS; i++) {
      const d = new DustMesh(WAKE, tube, { uHead: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector2(1, 0) }, uLen: { value: 1 }, uR: { value: 0.3 }, uSpeed: { value: 20 }, uSince: { value: 0 }, uLife: { value: 1 } }, { freq: 2.3, body: 0.02, order: 1 });
      this.wakes.push(d); this.group.add(d.mesh);
    }
    this.impacts = new EarthImpacts(heightAt);
    this.group.add(this.impacts.group);
    this.group.add(this.streaks.group);
    this.meshes.add(this.impacts.meshes);
  }

  /** The rock's centre height over sim point (x, z) for a rock of radius r. */
  private flightY(x: number, z: number, r: number): number { return this.heightAt(x, z) + Math.max(ROCK_H, r + 0.2); }

  /** After each sim step, shown or replayed: rocks seen leaving, and ending (their impacts). */
  afterStep(w: World): void {
    const m = w.missiles, tick = w.clock[0], t = tick / 60;
    // a missile ends with a 'fizzle' where it stopped: the live rock of that owner nearest it
    for (const e of w.events) {
      if (e.kind !== 'fizzle') continue;
      let best: RockRec | null = null, bd = 2.5;
      for (const r of this.recs) {
        if (r.end !== Infinity || r.owner !== e.who) continue;
        const d = Math.hypot(r.x0 + r.vx * (t - r.t0) - e.x, r.z0 + r.vz * (t - r.t0) - e.y);
        if (d < bd) { bd = d; best = r; }
      }
      if (!best) continue;
      best.end = t;
      const sp = Math.hypot(best.vx, best.vz) || 1;
      this.impacts.add({ t, x: e.x, z: e.y, y: this.flightY(e.x, e.y, best.r), ux: best.vx / sp, uz: best.vz / sp, n: best.n, r: best.r, seed: best.seed, key: `${tick}:${best.slot}` });
    }
    // a charged rock goes through what it hits (effects.ts: pierce): a 'hit' on a body where a live rock is passing
    for (const e of w.events) {
      if (e.kind !== 'hit' || e.dot || !(e.amount ?? 0)) continue;
      for (const r of this.recs) {
        if (r.end !== Infinity || e.who === r.owner) continue;
        const x = r.x0 + r.vx * (t - r.t0), z = r.z0 + r.vz * (t - r.t0);
        if (Math.hypot(x - e.x, z - e.y) > 1.3) continue;
        const sp = Math.hypot(r.vx, r.vz) || 1;
        this.impacts.add({ t, x, z, y: this.flightY(x, z, r.r), ux: r.vx / sp, uz: r.vz / sp, n: r.n, r: r.r, seed: r.seed + e.who * 17, key: `${tick}:${r.slot}:${e.who}`, pass: true });
      }
    }
    for (let j = 0; j < MAX_MISSILES; j++) {
      const r = this.bySlot.get(j);
      const live = m.alive[j] && !m.wait[j] && plainRock(w, j);
      if (!live) {
        if (r) { if (r.end === Infinity) r.end = t; this.bySlot.delete(j); }
        continue;
      }
      // the same rock if it's on the line seen (a mirror ward turning it back starts a new one)
      if (r && r.end === Infinity && r.owner === m.owner[j] && Math.hypot(r.x0 + r.vx * (t - r.t0) - m.x[j], r.z0 + r.vz * (t - r.t0) - m.y[j]) < 0.3) continue;
      if (r && r.end === Infinity) r.end = t;
      const n = missileRunes(w, j);
      const rec: RockRec = { slot: j, owner: m.owner[j], t0: t, x0: m.x[j], z0: m.y[j], vx: m.vx[j], vz: m.vy[j], n, r: rockRadius(n, m.scale[j]), seed: (tick * 7 + j * 31) % 100003, end: Infinity };
      this.recs.push(rec); this.bySlot.set(j, rec);
    }
  }

  /** A rewind to w's tick: what was seen after it goes (the replay sees it again). */
  rewind(w: World): void {
    const t = w.clock[0] / 60;
    this.recs = this.recs.filter((r) => r.t0 <= t + 1e-6);
    for (const r of this.recs) if (r.end > t + 1e-6) r.end = Infinity;
    this.bySlot.clear();
    for (const r of this.recs) if (r.end === Infinity) this.bySlot.set(r.slot, r);
    this.impacts.rewind(t);
  }

  /** Forget everything (a lab drawing another world). */
  reset(): void { this.recs = []; this.bySlot.clear(); this.impacts.rewind(-1); }

  /** The view's jolt at time t (u). */
  shake(t: number): THREE.Vector3 { return this.impacts.shake(t); }

  /** Draw at effect time t (s; the sim's clock), `alpha` of the way to the next step. */
  update(w: World, t: number, alpha: number, at: (i: number) => [number, number]): void {
    const td = t + alpha / 60;
    this.recs = this.recs.filter((r) => r.end === Infinity || td - r.end < WAKE_LIFE(5) + 0.1);
    const shown = this.recs.slice(-MAX_ROCKS);
    let ri = 0, gi = 0;
    for (let s = 0; s < MAX_ROCKS; s++) {
      const r = shown[s], wk = this.wakes[s];
      wk.mesh.visible = !!r;
      if (!r) continue;
      const tt = Math.min(td, r.end) - r.t0;
      this.wakeAt(wk, r, td);
      if (td < r.end && tt >= 0) ri = this.drawRock(r, tt, ri);
      gi = this.drawGrit(r, td - r.t0, gi);
    }
    // a plain Earth Force charging: the rock growing at the staff
    const ss = w.seats;
    for (let i = 0; i < MAX_SEATS; i++) {
      if (!ss.active[i] || !w.bodies.kind[i] || ss.phase[i] !== PHASE.charge) continue;
      const spec = specOf(w, i);
      if (spec.form !== EL.earth || (spec.look && spec.look !== EL.earth) || spec.heal || spec.shape !== 'missile' || Array.from(spec.counts).some((c, e) => c > 0 && e !== EL.earth - 1)) continue;
      const [x, z] = at(i), a = Math.atan2(ss.aimY[i], ss.aimX[i]), k = Math.min(1, ss.chanTicks[i] / 60);
      const n = Math.max(1, Math.min(5, spec.formN || 1)), R = rockRadius(n, 0.5 + 0.5 * k);
      const px = x + Math.cos(a) * (0.55 + R), pz = z + Math.sin(a) * (0.55 + R);
      const mesh = this.rocks[ri++];
      this.q.setFromAxisAngle(this.ax.set(0, 1, 0), td * 2.2 + i).multiply(this.q2.setFromAxisAngle(this.ax.set(1, 0, 0), Math.sin(td * 3) * 0.4));
      mesh.position.set(px, this.flightY(px, pz, R), pz); mesh.quaternion.copy(this.q); mesh.scale.setScalar(R * (0.4 + 0.6 * k));
      mesh.visible = true;
    }
    for (let i = ri; i < this.rocks.length; i++) this.rocks[i].visible = false;
    this.grit.count = gi; this.grit.instanceMatrix.needsUpdate = true;
    this.impacts.update(td);
    const flying: StreakRock[] = [];
    for (const r of shown) if (r && td < r.end + 0.02) { const y = this.flightY(r.x0, r.z0, r.r); flying.push({ x0: r.x0, y, z0: r.z0, t0: r.t0, vx: r.vx, vz: r.vz, r: r.r, end: r.end === Infinity ? 1e9 : r.end }); }
    this.streaks.update(td, flying, this.impacts.recent(td, 0.12).map((i) => ({ x: i.x, y: i.y, z: i.z, t: i.t, r: i.r, ux: i.ux, uz: i.uz })));
  }

  /** Rock r's wake at time td: from where the rock is (or ended) back along its line. */
  private wakeAt(wk: DustMesh, r: RockRec, td: number): void {
    const life = WAKE_LIFE(r.n), sp = Math.hypot(r.vx, r.vz) || 1, tt = Math.max(0, Math.min(td, r.end) - r.t0);
    const since = r.end === Infinity ? 0 : Math.max(0, td - r.end);
    wk.mesh.visible = tt > 0.02 && since < life;
    if (!wk.mesh.visible) return;
    const x = r.x0 + r.vx * tt, z = r.z0 + r.vz * tt, u = wk.u;
    (u.uHead.value as THREE.Vector3).set(x, this.flightY(x, z, r.r), z); (u.uDir.value as THREE.Vector2).set(r.vx / sp, r.vz / sp);
    // a short trail of dust behind the rock, not a tube back to the staff (the user: "reads like a textured tube")
    u.uLen.value = Math.min(sp * tt, 1.0 + 0.35 * r.n); u.uR.value = r.r * (0.9 + 0.08 * r.n); u.uSpeed.value = sp; u.uSince.value = since; u.uLife.value = life;
    u.uSeed.value = r.seed % 997; u.uSalt.value = (r.seed % 53) * 2.3; u.uClock.value = td - r.t0;
  }

  /** Rock r, tt s into its flight, on mesh ri; returns the next free mesh. */
  private drawRock(r: RockRec, tt: number, ri: number): number {
    if (ri >= this.rocks.length) return ri;
    const mesh = this.rocks[ri];
    mesh.geometry = this.shapes[r.seed % SHAPES_N];
    const x = r.x0 + r.vx * tt, z = r.z0 + r.vz * tt, sp = Math.hypot(r.vx, r.vz) || 1, d = sp * tt;
    // tumbling forward over its own axis (rolling through the air, a turn about every three of its widths), with a slow wobble
    this.ax.set(r.vz / sp, 0, -r.vx / sp);
    this.q.setFromAxisAngle(this.ax, -d / (r.r * 3.2) - 0.6 * (r.seed % 10));
    this.q2.setFromAxisAngle(this.ax.set(Math.sin(r.seed), 0.6, Math.cos(r.seed)).normalize(), tt * 2.1 + r.seed);
    mesh.quaternion.copy(this.q).multiply(this.q2);
    mesh.position.set(x, this.flightY(x, z, r.r), z);
    mesh.scale.setScalar(r.r);
    mesh.visible = true;
    return ri + 1;
  }

  /** Grit dropping from rock r's wake, `age` s after it left; returns the next free instance. */
  private drawGrit(r: RockRec, age: number, gi: number): number {
    const rate = 10 + 5 * r.n, life = 0.5, end = r.end === Infinity ? Infinity : r.end - r.t0;
    const k1 = Math.floor(age * rate), sp = Math.hypot(r.vx, r.vz) || 1;
    for (let k = Math.max(0, Math.floor((age - life) * rate)); k <= k1 && gi < 160; k++) {
      const ts = k / rate, a = age - ts;
      if (ts > end || a < 0 || a > life) continue;
      const h = (q: number) => { const s = Math.sin((r.seed + k * 7.31) * 12.9898 + q * 78.233) * 43758.5453; return s - Math.floor(s); };
      const side = (h(1) - 0.5) * r.r * 1.6;
      const x = r.x0 + r.vx * ts - (r.vx / sp) * r.r - (r.vz / sp) * side + (r.vx / sp) * a * sp * 0.05, z = r.z0 + r.vz * ts - (r.vz / sp) * r.r + (r.vx / sp) * side + (r.vz / sp) * a * sp * 0.05;
      const g = this.heightAt(x, z), y = this.flightY(x, z, r.r) - r.r * 0.5 - 0.5 * 22 * a * a;
      if (y < g) continue;
      const size = (0.035 + 0.04 * h(2)) * (0.8 + 0.1 * r.n);
      this.q.setFromAxisAngle(this.ax.set(h(3) - 0.5, h(4) - 0.5, h(5) - 0.5).normalize(), a * 12 + h(6) * 6);
      this.m.compose(this.v.set(x, y, z), this.q, this.s.setScalar(size));
      this.grit.setMatrixAt(gi++, this.m);
    }
    return gi;
  }

  dispose(): void {
    for (const g of this.shapes) g.dispose();
    (this.rocks[0].material as THREE.Material).dispose();
    this.grit.geometry.dispose(); (this.grit.material as THREE.Material).dispose();
    for (const w of this.wakes) w.dispose(); this.impacts.dispose(); this.streaks.dispose();
  }
}
