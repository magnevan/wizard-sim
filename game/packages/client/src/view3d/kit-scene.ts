/**
 * The kit scene hosted in the game: the compiled court (tools/kit/compile.py court -> lab/kit-court.json), drawn by
 * lab/kit-render.ts with its fitted models, tiling textures and laid stones, plus what the game asks of it: the height
 * of the ground under a point, a cursor ray dropped onto the ground, and the pieces that can stand between the camera
 * and a wizard.
 *
 * The compiled scene is imported (a chunk of its own, about 0.5 MB, 80 kB gzipped), not fetched from the map editor's
 * server, so a build carries it. It's committed for that reason: CI never runs Python (the plan's decision 1 does the
 * same for the room). The pieces' sizes come from tools/kit/kit.json the same way.
 */
import * as THREE from 'three';
import kitJson from '../../../../../tools/kit/kit.json';
import { loadStones } from '../lab/kit-stones';
import { buildKit, groundPlane, loadKitArt, setKitPieces, type KitData, type KitPiece } from '../lab/kit-render';

/** Pieces a body stands on besides the floors: flights and steps. */
const WALKABLE_PIECE = /^(connector\.flight|edge\.steps|sweep\.steps)/;
/** Pieces never faded: lying on the ground (kerbs, decals, inlays) or too low to hide anyone. */
const NEVER_FADE = /^(edge\.kerb|sweep\.kerb|joint\.|setpiece\.plaza-(disc|inlay)|fall\.)/;
/** Height (u) under which a piece can't hide a standing wizard and isn't worth testing. */
const LOW = 1.2;

export interface Occluder { obj: THREE.Object3D; box: THREE.Box3 }

export class KitScene {
  readonly root = new THREE.Group();
  data!: KitData;
  /** What a cursor or a body lands on: the floors (water too) and the flights. */
  readonly walkable: THREE.Object3D[] = [];
  /** Everything that might stand between the camera and a wizard, with its box. */
  readonly occluders: Occluder[] = [];
  /** ms the load took, and the bytes of models and textures fetched for it (from the resource timings). */
  loadMs = 0;
  loadBytes = 0;
  private heights = new Map<number, number>();
  private ray = new THREE.Raycaster();

  /** Load the court and build it. `art` false draws the kit's placeholders only (fast, for checks). */
  async load(name: string, art = true): Promise<void> {
    const t0 = performance.now();
    setKitPieces((kitJson as unknown as { pieces: Record<string, KitPiece> }).pieces);
    const [mod] = await Promise.all([
      name === 'court' ? import('../lab/kit-court.json') : Promise.reject(new Error(`no compiled scene ${name}`)),
      art ? loadKitArt() : Promise.resolve(),
      loadStones(name),
    ]);
    this.data = (mod as unknown as { default: KitData }).default;
    const kit = buildKit(this.data);
    this.root.add(groundPlane(this.data), kit);
    this.index(kit);
    this.loadMs = performance.now() - t0;
    this.loadBytes = performance.getEntriesByType('resource').reduce((a, e) => a + ((e as PerformanceResourceTiming).transferSize || (e as PerformanceResourceTiming).encodedBodySize || 0), 0);
  }

  private index(kit: THREE.Group): void {
    kit.updateMatrixWorld(true);
    for (const o of kit.children) {
      if (o.userData.floor) { this.walkable.push(o); continue; }
      const inst = typeof o.userData.inst === 'number' ? this.data.instances[o.userData.inst] : undefined;
      if (inst && WALKABLE_PIECE.test(inst.p)) { this.walkable.push(o); continue; }
      if (inst && NEVER_FADE.test(inst.p)) continue;
      if (!o.visible) continue;
      const box = new THREE.Box3().setFromObject(o);
      if (box.isEmpty() || box.max.y - box.min.y < LOW) continue;
      this.occluders.push({ obj: o, box });
    }
  }

  /** The ground's height (u) under scene point (x, z): the highest floor or flight there; NaN off everything. Cached per 1/4 u. */
  heightAt(x: number, z: number): number {
    const k = Math.round(x * 4) * 8192 + Math.round(z * 4);
    let h = this.heights.get(k);
    if (h === undefined) {
      this.ray.set(new THREE.Vector3(Math.round(x * 4) / 4, 500, Math.round(z * 4) / 4), new THREE.Vector3(0, -1, 0));
      h = this.ray.intersectObjects(this.walkable, true)[0]?.point.y ?? NaN;
      if (this.heights.size > 200_000) this.heights.clear();
      this.heights.set(k, h);
    }
    return h;
  }

  /** Where a ray first meets the walkable ground, or null. */
  hitGround(ray: THREE.Ray): THREE.Vector3 | null {
    this.ray.ray.copy(ray);
    return this.ray.intersectObjects(this.walkable, true)[0]?.point ?? null;
  }
}
