/**
 * Hidden wizards, first pass (the port's decision 5): any piece of the scene between the camera and a local wizard
 * fades to a dither (three's alphaHash, so there's no sorting to get wrong) and comes back when the wizard steps out
 * from behind it. A piece is tested with rays from the camera to five points on the wizard (feet, middle, head, and a
 * little to each side), first against its box, then against its meshes.
 *
 * Its materials are cloned the first time it fades (kit pieces share theirs) and handed back once it's whole again.
 */
import * as THREE from 'three';
import type { Occluder } from './kit-scene';

/** How see-through a covering piece gets, and how fast it fades (per second). */
const FADED = 0.28, RATE = 6;
/** Sideways reach of the side rays (u): about a wizard's shoulders and staff. */
const SIDE = 0.9;

interface Fading { o: Occluder; a: number; mats: Map<THREE.Mesh, THREE.Material | THREE.Material[]> }

export class Fader {
  enabled = true;
  private fading = new Map<THREE.Object3D, Fading>();
  private rc = new THREE.Raycaster();
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private hit = new THREE.Vector3();
  private hits: THREE.Intersection[] = [];
  /** Pieces faded last frame (for the Stats panel). */
  count = 0;

  constructor(private occluders: readonly Occluder[]) {}

  /** Once a frame: `targets` are the local wizards' feet (scene u) and heights. */
  update(cam: THREE.Camera, targets: readonly { x: number; y: number; z: number; h: number }[], dt: number): void {
    const covering = new Set<Occluder>();
    if (this.enabled) {
      cam.getWorldPosition(this.from);
      const right = new THREE.Vector3(1, 0, 0);
      for (const t of targets) {
        const pts = [[0, 0.2], [0, t.h * 0.5], [0, t.h * 0.95], [-SIDE, t.h * 0.5], [SIDE, t.h * 0.5]];
        for (const [dx, dy] of pts) {
          this.to.set(t.x, t.y + dy, t.z).addScaledVector(right, dx);
          const far = this.dir.subVectors(this.to, this.from).length() - 0.3;
          this.dir.normalize();
          this.rc.set(this.from, this.dir); this.rc.far = far;
          for (const o of this.occluders) {
            if (covering.has(o) || !this.rc.ray.intersectBox(o.box, this.hit) || this.hit.distanceTo(this.from) > far) continue;
            this.hits.length = 0;
            this.rc.intersectObject(o.obj, true, this.hits);
            if (this.hits.length) covering.add(o);
          }
        }
      }
    }
    const k = Math.min(1, dt * RATE);
    for (const o of covering) if (!this.fading.has(o.obj)) this.fading.set(o.obj, this.start(o));
    let n = 0;
    for (const [obj, f] of this.fading) {
      const want = covering.has(f.o) ? FADED : 1;
      f.a += (want - f.a) * k;
      if (want === 1 && f.a > 0.98) { this.end(f); this.fading.delete(obj); continue; }
      for (const m of f.mats.keys()) for (const mt of Array.isArray(m.material) ? m.material : [m.material]) mt.opacity = f.a;
      n++;
    }
    this.count = n;
  }

  private start(o: Occluder): Fading {
    const mats = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const fade = (m: THREE.Material): THREE.Material => {
      const c = m.clone();
      // a kit material may carry a shader patch (decals, laid stones, triplanar stone): keep it on the clone
      c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey;
      c.alphaHash = true; c.transparent = false; c.opacity = 1;
      return c;
    };
    o.obj.traverse((x) => {
      const m = x as THREE.Mesh;
      if (!m.isMesh) return;
      mats.set(m, m.material);
      m.material = Array.isArray(m.material) ? m.material.map(fade) : fade(m.material);
    });
    return { o, a: 1, mats };
  }

  private end(f: Fading): void {
    for (const [m, orig] of f.mats) {
      for (const mt of Array.isArray(m.material) ? m.material : [m.material]) mt.dispose();
      m.material = orig;
    }
  }
}
