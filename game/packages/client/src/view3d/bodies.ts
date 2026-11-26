/**
 * The characters in the 3D view (the port to 3D, decision 2: docs/explorations/2026-11-25-port-3d-plan.md): every live
 * body is a pooled copy of its model standing in the scene, lit by the scene's sun, with no pixel pass. Posed by
 * art/model-pose.ts from the pose art/live-pose.ts picks for the body's rig state (bodies-track.ts), the same choices
 * the pixel view makes: facing, walk and run by the distance walked, turn steps, blows on their move sets, casts,
 * blocking, attacks with their contact frame on the game's hit, a downed wizard lying in the knock-down. The seat's
 * colours, the status tint and the white hit flash are material settings (model-pose.ts litLook). A warband body that
 * dies plays the knock-down where it fell, its weapon dropped beside it, lies still, then sinks into the ground.
 *
 * Bodies with no model (the imp, the straw goblin, dummies, brambles, sacks, the yard's soldiers and students) and
 * bodies whose model is still loading stand as a neutral grey capsule of about their size.
 *
 * Use: `new Bodies3D(parent)`, then each frame `update(world, alpha, now, toScene)`. A loop that steps the sim calls
 * beforeStep and afterStep round each shown step (as the GameView interface does); without them, update notices each
 * new tick itself, taking it as one step. No Pixi.
 */
import * as THREE from 'three';
import { KIND, MAX_BODIES, type World } from '@wizard-sim/sim';
import type { RigKind, RigState } from '../art/rigs';
import { fxTime, instance, litLook, liveMeta, liveNow, model, pose, scopedKey, stringOf, type Inst, type LivePose, type Model } from '../art/model-pose';
import { livePose, statusTint } from '../art/live-pose';
import { BodyTrack, modelOf, type Fallen } from './bodies-track';

/**
 * World units per model unit: the pixel game's proportions (17 art px a model unit against 16 a world unit), so a body
 * stands as tall against the sim's radii and ranges as it did there. A goblin is 2.1 u (1.26 m at the kit's 0.6 m a
 * unit), the wizard 2.7 u (1.6 m).
 */
export const BODY_SCALE = 17 / 16;
/** A fallen body lies still this long after its knock-down, then sinks out of sight over DEATH_SINK s. */
const DEATH_HOLD = 1.6, DEATH_SINK = 0.8;
/** A Double: its owner's wizard, tinted violet (the pixel view also makes it see-through). */
const DOUBLE_TINT = 0xd8b4ff;
/** A stand-in's height (u) by rig, for bodies with no model. */
const STAND_IN_H: Record<RigKind, number> = { wizard: 2.7, goblin: 1.8, archer: 2.1, brute: 3.8, dummy: 2.4, bramble: 1.6, sack: 1.4, soldier: 3.0 };

/** One body as drawn: its holder (placed on the ground at the body's spot), and either a posed model or a stand-in. */
interface Shown { holder: THREE.Group; slug: string | null; inst: Inst | null; stand: THREE.Mesh | null }
interface Fall extends Fallen { slug: string; t0: number; shown: Shown }

/**
 * How white a hit flashes a body (bodies-track.ts sets the level): a fresh hit 16 then 9 over its first 0.1 s, a hit
 * landing again within 0.35 s (a beam or spray held on it) 4 for 0.08 s. The pixel game flashes every one of them, so
 * a held channel flickers its target; the models used to flash only the first.
 */
// a falling fade, not a solid white blink (the user on the rock, round 2: "blinks in and out in too much of a static manner")
// a held spray or beam re-hits every few ticks: those repeat hits (level 4) only glimmer, or the rim never goes out
const flashLevel = (f: number): number => (f >= 16 ? 0.85 : f >= 9 ? 0.45 : f >= 4 ? 0.08 : 0);

export class Bodies3D {
  /** Everything this draws, under the parent the view gave. */
  readonly group = new THREE.Group();
  private track = new BodyTrack();
  private shown: (Shown | null)[] = new Array(MAX_BODIES).fill(null);
  /** Spare copies of each model, by slug, to give the next body that needs one. */
  private spare = new Map<string, Inst[]>();
  private falls: Fall[] = [];
  private standGeo = new THREE.CapsuleGeometry(0.5, 1, 4, 12);
  private standMats = new Set<THREE.MeshStandardMaterial>();
  private scale: number;

  constructor(parent: THREE.Object3D, opts: { scale?: number } = {}) {
    this.scale = opts.scale ?? BODY_SCALE;
    this.group.name = 'bodies';
    parent.add(this.group);
    this.track.onFall = (f) => this.onFall(f);
  }

  /** Call right before each shown sim step (interpolation runs from these positions). */
  beforeStep(real: World): void { this.track.beforeStep(real); }
  /** Call right after each shown sim step: its hits, blows, casts and deaths. */
  afterStep(real: World): void { this.track.afterStep(real); }

  /**
   * Poses and places every body for this frame. `alpha` is how far toward the next step, `now` real time (ms),
   * `toScene` turns a sim ground point into the scene position of the ground there.
   */
  update(real: World, alpha: number, now: number, toScene: (x: number, y: number) => THREE.Vector3): void {
    this.track.observe(real);
    const b = real.bodies, t = this.track.simTime(real, alpha), ct = now / 1000;
    fxTime.value = liveNow();
    for (let i = 0; i < MAX_BODIES; i++) {
      if (!b.kind[i]) { this.release(i); continue; }
      const s = this.track.rigState(real, i, t, ct);
      const slug = modelOf(s), m = slug ? model(slug) : null;
      const sh = this.take(i, m ? slug : null, s.kind, b.r[i]);
      const x = this.track.prevX[i] + (b.x[i] - this.track.prevX[i]) * alpha, y = this.track.prevY[i] + (b.y[i] - this.track.prevY[i]) * alpha;
      sh.holder.position.copy(toScene(x, y));
      sh.holder.updateMatrixWorld(true);
      const tint = b.kind[i] === KIND.double ? DOUBLE_TINT : 0xffffff;
      if (sh.inst && m && slug) this.poseInst(sh, m, livePose(slug, s, i), scopedKey('3d|' + slug + '|' + i), statusTint(s), tint, s.flash);
      else this.poseStand(sh, s, statusTint(s), tint);
    }
    this.drawFalls(ct, toScene);
  }

  /** Frees what this made (its materials, the stand-ins) and takes it out of the scene. */
  dispose(): void {
    this.group.removeFromParent();
    const done = new Set<THREE.Material>();
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (!done.has(mat)) { done.add(mat); mat.dispose(); }
    });
    for (const pool of this.spare.values()) for (const inst of pool) inst.root.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.isMesh) (mesh.material as THREE.Material).dispose(); });
    for (const mat of this.standMats) mat.dispose();
    this.standGeo.dispose();
    this.shown.fill(null); this.spare.clear(); this.falls = [];
  }

  /** Body i's holder, with a model copy of `slug` (null: a stand-in), reusing what it had if it still fits. */
  private take(i: number, slug: string | null, kind: RigKind, r: number): Shown {
    let sh = this.shown[i];
    if (sh && sh.slug !== slug) { this.release(i); sh = null; }
    if (!sh) {
      sh = { holder: new THREE.Group(), slug, inst: null, stand: null };
      if (slug) sh.inst = this.copyOf(slug);
      if (sh.inst) sh.holder.add(sh.inst.root);
      else sh.stand = this.standIn(kind, r);
      if (sh.stand) sh.holder.add(sh.stand);
      this.group.add(sh.holder);
      this.shown[i] = sh;
    }
    return sh;
  }

  /** Body i is gone: its model copy goes back to the spares. */
  private release(i: number): void {
    const sh = this.shown[i];
    if (!sh) return;
    this.free(sh);
    this.shown[i] = null;
  }
  private free(sh: Shown): void {
    sh.holder.removeFromParent();
    if (sh.inst && sh.slug) {
      sh.inst.root.removeFromParent();
      for (const p of sh.inst.bow?.parts ?? []) p.removeFromParent();
      let pool = this.spare.get(sh.slug);
      if (!pool) this.spare.set(sh.slug, (pool = []));
      pool.push(sh.inst);
    }
    if (sh.stand) {
      const mat = sh.stand.material as THREE.MeshStandardMaterial;
      mat.dispose(); this.standMats.delete(mat);
    }
  }

  /** A posable copy of a model, lit by the scene: a spare one, or a new one. */
  private copyOf(slug: string): Inst | null {
    const pool = this.spare.get(slug);
    if (pool?.length) return pool.pop()!;
    const m = model(slug);
    if (!m) return null;
    const inst = instance(slug, m, litLook);
    inst.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    for (const p of inst.bow?.parts ?? []) { p.castShadow = true; p.receiveShadow = true; }
    return inst;
  }

  /** A neutral grey capsule of about the body's size (its sim radius across, its rig's height), feet on the ground. */
  private standIn(kind: RigKind, r: number): THREE.Mesh {
    const mat = new THREE.MeshStandardMaterial({ color: 0x9a968e, roughness: 0.85 });
    this.standMats.add(mat);
    const mesh = new THREE.Mesh(this.standGeo, mat);
    const h = STAND_IN_H[kind], w = Math.max(0.3, Math.min(r * 2, h * 0.6));
    mesh.scale.set(w, h / 2, w);   // the capsule is 1 wide and 2 tall (radius 0.5, length 1)
    mesh.position.y = h / 2;
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.standIn = kind;
    return mesh;
  }

  private poseInst(sh: Shown, m: Model, p: LivePose, key: string, status: number, tint: number, flash = 0): void {
    const inst = sh.inst!;
    sh.holder.scale.setScalar(this.scale);
    sh.holder.updateMatrixWorld(true);
    pose(inst, m, p, key);
    inst.flash.value = flashLevel(flash);
    inst.tint.value.setHex(status).multiply(new THREE.Color(tint));
    if (inst.bow) stringOf(inst, m, p, sh.holder);
  }

  private poseStand(sh: Shown, s: RigState, status: number, tint: number): void {
    const mat = sh.stand!.material as THREE.MeshStandardMaterial;
    mat.color.setHex(0x9a968e).multiply(new THREE.Color(status)).multiply(new THREE.Color(tint));
    mat.emissive.setScalar(flashLevel(s.flash));
    sh.stand!.rotation.z = s.dead ? Math.PI / 2 * Math.min(1, s.dead) : 0;
    sh.stand!.position.y = s.dead ? sh.stand!.scale.x / 2 : sh.stand!.scale.y;
  }

  /** A warband body died: it plays the knock-down where it fell, if it has a model (a stand-in just goes). */
  private onFall(f: Fallen): void {
    const slug = modelOf(f.s);
    if (!slug || !model(slug)) return;
    // rollback: a tick shown twice (or a corrected one) must not play the same death again
    if (this.falls.some((d) => d.who === f.who && Math.abs(d.tick - f.tick) < 90)) return;
    const inst = this.copyOf(slug);
    if (!inst) return;
    const holder = new THREE.Group(); holder.add(inst.root); this.group.add(holder);
    this.falls.push({ ...f, slug, t0: NaN, shown: { holder, slug, inst, stand: null } });
  }

  private drawFalls(ct: number, toScene: (x: number, y: number) => THREE.Vector3): void {
    for (const d of this.falls.slice()) {
      if (Number.isNaN(d.t0)) d.t0 = ct;
      const td = ct - d.t0, m = model(d.slug)!, play = liveMeta(d.slug)?.clips.death?.duration ?? 2;
      if (td > play + DEATH_HOLD + DEATH_SINK || td < 0) { this.free(d.shown); this.falls.splice(this.falls.indexOf(d), 1); continue; }
      const sink = Math.max(0, td - play - DEATH_HOLD) / DEATH_SINK;
      const at = toScene(d.x, d.y);
      d.shown.holder.position.set(at.x, at.y - sink * sink * 1.2 * this.scale, at.z);
      d.shown.holder.updateMatrixWorld(true);
      this.poseInst(d.shown, m, { move: 'death', t: Math.min(td, play), face: d.face, flash: false }, scopedKey('3d|fall|' + d.who), statusTint(d.s), 0xffffff);
    }
  }
}
