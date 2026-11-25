/**
 * The spell effects in the game view: the effects kit (fx/) hosted on the court. For now only Fire: each seat's Fire
 * spray and the burning floor, in look B (painted Codex sheets, the chosen direction). Other spells draw nothing yet.
 *
 * The effects work in sim space (fx/from-sim.ts: sim (x, y) is three's (x, z), no offset) while the kit scene sits at
 * its own coordinates, the sim's origin at the room's toScene (scene-map.ts). Rather than move the kit (its stones,
 * decals and water are painted in world space), the effects are drawn with a second camera moved back by toScene
 * (FxStage.render's fxCamera), their lights sit in a group moved forward by it, and their ground heights are read at
 * the scene point (heightAt below).
 */
import * as THREE from 'three';
import { MAX_SEATS, type World } from '@wizard-sim/sim';
import { FireFloor, FireSpray, type FireSheets } from './fx/fire';
import { SurfGrid, sprays } from './fx/from-sim';
import { SpellLights } from './fx/lights';
import { FxStage } from './fx/stage';
import { sceneX, sceneZ } from './scene-map';

const fxUrls = import.meta.glob<string>('../../../../content/generated/fx/fire-*.png', { eager: true, query: '?url', import: 'default' });

export class Spells3D {
  readonly stage = new FxStage();
  readonly lights = new SpellLights();
  /** The lights' holder in the world scene, at the sim origin's scene point. */
  readonly lightRoot = new THREE.Group();
  /** The effects' camera: the world camera moved into sim space. */
  readonly fxCam = new THREE.PerspectiveCamera();
  private spraysBy: FireSpray[] = [];
  private grid: SurfGrid | null = null;
  private floor: FireFloor | null = null;

  /** `heightAt(x, z)`: the scene's ground height (u) at scene point x, z. */
  constructor(world: THREE.Scene, private heightAt: (x: number, z: number) => number) {
    this.lightRoot.add(this.lights.group);
    world.add(this.lightRoot);
  }

  /** Load the painted sheets (look B) and make the effects (they take the sheets as they're made). */
  async load(): Promise<void> {
    const loader = new THREE.TextureLoader();
    const sheet = (name: string) => {
      const url = Object.entries(fxUrls).find(([p]) => p.endsWith(`/${name}.png`))?.[1];
      return url ? loader.loadAsync(url).then((t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }).catch(() => null) : Promise.resolve(null);
    };
    const [wisps, tongues] = await Promise.all([sheet('fire-wisps'), sheet('fire-tongues')]);
    const sheets: FireSheets = { wisps, tongues };
    const simHeight = (x: number, z: number) => { const h = this.heightAt(sceneX(x), sceneZ(z)); return Number.isNaN(h) ? 0 : h; };
    for (let s = 0; s < MAX_SEATS; s++) {
      const f = new FireSpray('b', sheets, 11 + s * 17);
      f.fan.heightAt = simHeight;
      this.spraysBy.push(f); this.stage.scene.add(f.group);
    }
    this.grid = new SurfGrid(simHeight);
    this.floor = new FireFloor('b', sheets, this.grid, 23);
    this.stage.scene.add(this.floor.group);
  }

  /** After each shown step: the sprays' aim trails keep every tick. */
  afterStep(w: World): void {
    if (!this.spraysBy.length) return;
    const t = w.clock[0] / 60, all = sprays(w);
    for (let s = 0; s < MAX_SEATS; s++) this.spraysBy[s].update(t, all.find((p) => p.seat === s && p.kind === 'fire') ?? null, this.groundUnder(w, s), null);
  }

  /** Each frame, before render: effect time `t` (s). */
  frame(w: World, t: number): void {
    this.lightRoot.position.set(sceneX(0), 0, sceneZ(0));
    if (!this.grid || !this.floor) return;
    this.lights.begin();
    const all = sprays(w);
    for (let s = 0; s < MAX_SEATS; s++) this.spraysBy[s].update(t, all.find((p) => p.seat === s && p.kind === 'fire') ?? null, this.groundUnder(w, s), this.lights);
    this.grid.update(w);
    this.floor.update(t, this.lights);
    this.lights.end();
  }

  /** The world and the effects, tone-mapped to the screen. */
  render(renderer: THREE.WebGLRenderer, world: THREE.Scene, cam: THREE.PerspectiveCamera): void {
    this.fxCam.copy(cam);
    this.fxCam.position.x -= sceneX(0); this.fxCam.position.z -= sceneZ(0);
    this.fxCam.updateMatrixWorld();
    this.stage.render(renderer, world, cam, undefined, this.fxCam);
  }

  private groundUnder(w: World, s: number): number {
    const h = this.heightAt(sceneX(w.bodies.x[s]), sceneZ(w.bodies.y[s]));
    return Number.isNaN(h) ? 0 : h;
  }
}
