/**
 * Hidden wizards, first pass (the port's decision 5): a piece of the scene standing between the camera and a local
 * wizard gets a hole dithered through it, a soft circle round the wizard on screen, and closes again when the wizard
 * steps out from behind it. Only fragments nearer the camera than the wizard are cut, so the ground and whatever stands
 * behind stay whole. (A first try faded the whole piece instead: a 26 u hall turned to noise and the wizard was lost in
 * it, see shots/port-3d/view/wall-fade-whole.png.)
 *
 * A piece is found by rays from the camera to five points on the wizard (feet, middle, head, a little to each side),
 * tested against its box, then its meshes. Its materials are cloned the first time it's cut (kit pieces share theirs),
 * the clone's shader gets the cut, and the originals are handed back once the hole has closed.
 */
import * as THREE from 'three';
import type { Occluder } from './kit-scene';

/** How fast a hole opens and closes (per second). */
const RATE = 6;
/** Sideways reach of the side rays (u): about a wizard's shoulders and staff. */
const SIDE = 0.9;
/** The hole's radius, in wizard heights on screen. */
const HOLE = 1.1;
/** At most this many holes (local wizards). */
const MAX_CUTS = 4;

/** Shared by every cut material: each hole's centre (device px), radius (px) and the wizard's depth (0..1). */
const CUT = {
  cutN: { value: 0 },
  cutP: { value: Array.from({ length: MAX_CUTS }, () => new THREE.Vector4()) },
};

const CUT_DECL = `
uniform int cutN; uniform vec4 cutP[${MAX_CUTS}]; uniform float cutK;
const float BAYER[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);`;
const CUT_FRAG = `
  for (int i = 0; i < ${MAX_CUTS}; i++) {
    if (i >= cutN) break;
    vec4 c = cutP[i];
    if (gl_FragCoord.z >= c.w) continue;            // behind the wizard: whole
    float r = length(gl_FragCoord.xy - c.xy) / max(1.0, c.z * cutK);
    if (r >= 1.0) continue;
    float keep = mix(0.15, 1.0, smoothstep(0.55, 1.0, r));   // mostly open in the middle, closing toward the rim
    ivec2 q = ivec2(mod(gl_FragCoord.xy, 4.0));
    if (keep < (BAYER[q.x + q.y * 4] + 0.5) / 16.0) discard;
  }`;

interface Cutting { o: Occluder; k: { value: number }; mats: Map<THREE.Mesh, THREE.Material | THREE.Material[]> }

export class Fader {
  enabled = true;
  private cutting = new Map<THREE.Object3D, Cutting>();
  private rc = new THREE.Raycaster();
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private hit = new THREE.Vector3();
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();
  private hits: THREE.Intersection[] = [];
  /** Pieces cut last frame (for the Stats panel). */
  count = 0;

  constructor(private occluders: readonly Occluder[]) {}

  /**
   * Once a frame, before rendering: `targets` are the local wizards' feet (scene u) and heights; `size` the drawing
   * buffer in device px.
   */
  update(cam: THREE.Camera, targets: readonly { x: number; y: number; z: number; h: number }[], dt: number, size: THREE.Vector2): void {
    const covering = new Set<Occluder>();
    cam.getWorldPosition(this.from);
    CUT.cutN.value = 0;
    if (this.enabled) {
      const right = new THREE.Vector3(1, 0, 0);
      for (const t of targets) {
        for (const [dx, dy] of [[0, 0.2], [0, t.h * 0.5], [0, t.h * 0.95], [-SIDE, t.h * 0.5], [SIDE, t.h * 0.5]]) {
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
        // the hole: round the wizard's middle, sized by its height on screen, cutting only what's nearer than its front
        if (CUT.cutN.value >= MAX_CUTS) continue;
        this.a.set(t.x, t.y, t.z).project(cam); this.b.set(t.x, t.y + t.h, t.z).project(cam);
        const px = (v: THREE.Vector3) => [(v.x + 1) / 2 * size.x, (v.y + 1) / 2 * size.y];
        const [fx, fy] = px(this.a), [hx, hy] = px(this.b), tall = Math.hypot(hx - fx, hy - fy);
        this.a.set(t.x, t.y + t.h * 0.5, t.z + 0.6).project(cam);   // depth of the wizard's front
        CUT.cutP.value[CUT.cutN.value++].set((fx + hx) / 2, (fy + hy) / 2, tall * HOLE, this.a.z * 0.5 + 0.5);
      }
    }
    const k = Math.min(1, dt * RATE);
    for (const o of covering) if (!this.cutting.has(o.obj)) this.cutting.set(o.obj, this.start(o));
    let n = 0;
    for (const [obj, f] of this.cutting) {
      f.k.value += ((covering.has(f.o) ? 1 : 0) - f.k.value) * k;
      if (!covering.has(f.o) && f.k.value < 0.03) { this.end(f); this.cutting.delete(obj); continue; }
      n++;
    }
    this.count = n;
  }

  private start(o: Occluder): Cutting {
    const mats = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>(), k = { value: 0 };
    const cut = (m: THREE.Material): THREE.Material => {
      const c = m.clone(), prev = m.onBeforeCompile, key = m.customProgramCacheKey.bind(m);
      // a kit material may carry a shader patch of its own (decals, laid stones, triplanar stone): run it first
      c.onBeforeCompile = (sh, r) => {
        prev.call(m, sh, r);
        Object.assign(sh.uniforms, CUT, { cutK: k });
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>${CUT_DECL}`)
          .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>${CUT_FRAG}`);
      };
      c.customProgramCacheKey = () => `${key()}|cut`;
      return c;
    };
    o.obj.traverse((x) => {
      const m = x as THREE.Mesh;
      if (!m.isMesh) return;
      mats.set(m, m.material);
      m.material = Array.isArray(m.material) ? m.material.map(cut) : cut(m.material);
    });
    o.cut?.(true);   // a batched piece: drawn on its own (with these materials) while it's cut (kit-batch.ts)
    return { o, k, mats };
  }

  private end(f: Cutting): void {
    for (const [m, orig] of f.mats) {
      for (const mt of Array.isArray(m.material) ? m.material : [m.material]) mt.dispose();
      m.material = orig;
    }
    f.o.cut?.(false);
  }
}
