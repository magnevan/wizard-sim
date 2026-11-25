/**
 * The kit scene hosted in the game: a room's compiled scene (tools/kit/compile.py <scene> -> lab/kit-<scene>.json; the
 * court, the practice ground), drawn by
 * lab/kit-render.ts with its fitted models, tiling textures and laid stones, plus what the game asks of it: the height
 * of the ground under a point, a cursor ray dropped onto the ground, and the pieces that can stand between the camera
 * and a wizard.
 *
 * The compiled scene is imported (a chunk of its own, about 0.5 MB, 80 kB gzipped), not fetched from the map editor's
 * server, so a build carries it. It's committed for that reason: CI never runs Python (the plan's decision 1 does the
 * same for the room). The pieces' sizes come from tools/kit/kit.json the same way.
 *
 * Weight (step 6): a room loads only the art its scene uses and the rooms before it haven't (kit-assets.ts), and once
 * built its static pieces are drawn in batches (kit-batch.ts); the pieces themselves stay, hidden, for raycasts and
 * fading.
 */
import * as THREE from 'three';
import kitJson from '../../../../../tools/kit/kit.json';
import { loadStones } from '../lab/kit-stones';
import { buildKit, disposeKit, groundPlane, loadKitArt, setKitPieces, useKitArt, type KitData, type KitPiece } from '../lab/kit-render';
import { optOn } from '../dev-options';
import { KIT_URLS, kitArt } from './kit-assets';
import { batchKit, type KitBatch } from './kit-batch';

/** Pieces a body stands on besides the floors: flights and steps. */
const WALKABLE_PIECE = /^(connector\.flight|edge\.steps|sweep\.steps)/;
/** Pieces never faded: lying on the ground (kerbs, decals, inlays) or too low to hide anyone. */
const NEVER_FADE = /^(edge\.kerb|sweep\.kerb|joint\.|setpiece\.plaza-(disc|inlay)|fall\.)/;
/** Height (u) under which a piece can't hide a standing wizard and isn't worth testing. */
const LOW = 1.2;

/**
 * The compiled scenes, by room id: a room made from a kit scene (tools/kit/room.py) draws the scene it was made from.
 * (The build reads these imports to ship each scene's art: vite.config.ts kitGameArt.)
 */
const SCENES: Record<string, () => Promise<unknown>> = {
  court: () => import('../lab/kit-court.json'),
  practice: () => import('../lab/kit-practice.json'),
};

/** Is there a compiled scene for this room? */
export const hasScene = (room: string): boolean => Object.prototype.hasOwnProperty.call(SCENES, room);

/** A piece that can hide a wizard: its box, and (when batched) how to show it on its own while fade.ts cuts it. */
export interface Occluder { obj: THREE.Object3D; box: THREE.Box3; cut?: (on: boolean) => void }

export class KitScene {
  readonly root = new THREE.Group();
  data!: KitData;
  /** What a cursor or a body lands on: the floors (water too) and the flights. */
  readonly walkable: THREE.Object3D[] = [];
  /** Everything that might stand between the camera and a wizard, with its box. */
  readonly occluders: Occluder[] = [];
  /** The batches drawing the static pieces (null with ?kitbatch=0). */
  batch: KitBatch | null = null;
  /** ms the load took, the page's time (performance.now) when it was done, and the bytes fetched by then (resource timings). */
  loadMs = 0;
  loadedAt = 0;
  loadBytes = 0;
  /** The scene built now ('' before the first load). */
  name = '';
  private heights = new Map<number, number>();
  private ray = new THREE.Raycaster();
  /** The art loads so far, in order (each loads only what the ones before didn't). */
  private art: Promise<void> = Promise.resolve();

  /**
   * Load a room's scene and build it in place of the one before. `art` false draws the kit's placeholders only (fast,
   * for checks). The art comes per scene, what it uses and no earlier scene did; ?kitall=1 loads every original at the
   * first load instead (dev server only: the build ships the scenes' art only), and ?kitbatch=0 leaves the pieces
   * unbatched, to compare.
   */
  async load(name: string, art = true): Promise<void> {
    const t0 = performance.now();
    if (!hasScene(name)) throw new Error(`no compiled scene ${name}`);
    const pieces = (kitJson as unknown as { pieces: Record<string, KitPiece> }).pieces;
    setKitPieces(pieces);
    const stones = loadStones(name);
    const mod = await SCENES[name]();
    const data = (mod as unknown as { default: KitData }).default;
    if (art) {
      const all = optOn('kitall');
      this.art = this.art.then(() => { useKitArt(all ? null : { urls: KIT_URLS, ...kitArt(data, pieces) }); return loadKitArt(); });
    }
    await Promise.all([art ? this.art : Promise.resolve(), stones]);
    this.clear();
    this.name = name;
    this.data = data;
    const kit = buildKit(this.data);
    this.root.add(groundPlane(this.data), kit);
    this.index(kit);
    if (optOn('kitbatch')) {
      const b = (this.batch = batchKit(kit));
      this.root.add(b.group);
      for (const o of this.occluders) o.cut = (on) => b.cut(o.obj, on);
    }
    this.loadedAt = performance.now();
    this.loadMs = this.loadedAt - t0;
    this.loadBytes = performance.getEntriesByType('resource').reduce((a, e) => a + ((e as PerformanceResourceTiming).transferSize || (e as PerformanceResourceTiming).encodedBodySize || 0), 0);
  }

  /** Take the built scene down, disposing its own geometry (the fitted models' shared geometry is kept). */
  private clear(): void {
    this.batch?.dispose();
    this.batch = null;
    for (const o of [...this.root.children]) { this.root.remove(o); disposeKit(o); }
    this.walkable.length = 0; this.occluders.length = 0; this.heights.clear();
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
