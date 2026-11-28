/**
 * The spell effects in the game view: the effects kit (fx/) hosted on the court. Fire's spray and its burning floor are
 * drawn in look B (painted Codex sheets, the chosen direction), the Arcane beam as fx/arcane.ts; every other spell, and everything else the sim makes
 * (walls, devices, wards, telegraphs, previews), draws as its stand-in (fx/standins.ts: the sim's hit shape in the
 * element's colour) until its family gets a real effect.
 *
 * The effects work in sim space (fx/from-sim.ts: sim (x, y) is three's (x, z), no offset) while the kit scene sits at
 * its own coordinates, the sim's origin at the room's toScene (scene-map.ts). Rather than move the kit (its stones,
 * decals and water are painted in world space), the effects are drawn with a second camera moved back by toScene
 * (FxStage.render's fxCamera), their lights sit in a group moved forward by it, and their ground heights are read at
 * the scene point (heightAt below).
 */
import * as THREE from 'three';
import { EL, MAX_SEATS, type World } from '@wizard-sim/sim';
import { ArcaneBeams } from './fx/arcane';
import { ColdNovas } from './fx/cold';
import { FireWaves } from './fx/fire-wave';
import { EarthFx } from './fx/earth';
import { FireFloor, FireSpray, type FireSheets } from './fx/fire';
import { SurfGrid, sprays } from './fx/from-sim';
import { SpellLights } from './fx/lights';
import { FxStage } from './fx/stage';
import { Standins } from './fx/standins';
import { BodyStatuses } from './fx/statuses';
import { ZoneFogs } from './fx/zone-fog';
import { WindupTells } from './fx/windup';
import { applyFxOff, fxOff } from './fx-off';
import { sceneX, sceneZ } from './scene-map';

const fxUrls = import.meta.glob<string>('../../../../content/generated/fx/fire-*.png', { eager: true, query: '?url', import: 'default' });

/** What the view hands each frame besides the world. */
export interface SpellFrame {
  /** How far toward the next step (0..1), for missiles in flight. */
  alpha?: number;
  /** The seat whose placement preview shows (-1: none). */
  localSeat?: number;
  /** The world camera (scene space): the effects' camera is made from it. */
  cam?: THREE.PerspectiveCamera;
  /** Where body i is drawn (sim u), when the view interpolates. */
  bodyAt?: (i: number) => [number, number];
  /** Where body i's spells leave its hands as drawn (sim x, height, sim y), or null: the spray's nozzle follows it. */
  castAt?: (i: number) => [number, number, number] | null;
}

export class Spells3D {
  readonly stage = new FxStage();
  readonly lights = new SpellLights();
  /** The lights' holder in the world scene, at the sim origin's scene point. */
  readonly lightRoot = new THREE.Group();
  /** The effects' camera: the world camera moved into sim space. */
  readonly fxCam = new THREE.PerspectiveCamera();
  /** Every other spell's stand-in (fx/standins.ts). */
  readonly standins = new Standins();
  /** The Frost ring (fx/cold.ts), unless the stand-ins draw it (standins.drawCold). */
  readonly cold = new ColdNovas();
  /** Freezing fog (Cold's Place, the sim's frost zones: fx/zone-fog.ts). */
  readonly fogs: ZoneFogs;
  /** The Fire ring and the Fire burst, one travelling wave (fx/fire-wave.ts), unless the stand-ins draw Fire (standins.drawFire). */
  readonly fireWaves = new FireWaves();
  /** Each seat's cast windup: motes drawn in to the hand (fx/windup.ts). */
  readonly windups = new WindupTells();
  private spraysBy: FireSpray[] = [];
  /** The Frost spray per seat: Fire's spray in frost (fx/fire.ts, element 'cold'). */
  private coldSprays: FireSpray[] = [];
  /** The effect time of the last frame (s), for the impact's jolt at render. */
  private shakeAt = 0;
  private grid: SurfGrid | null = null;
  private floor: FireFloor | null = null;
  /** Every Arcane beam (fx/arcane.ts); `.impact` picks its impact variant. */
  readonly arcane: ArcaneBeams;
  /** Plain Earth's rock in flight and its impact (fx/earth.ts); its stones sit in the world scene (lit, shadowed) under lightRoot. */
  readonly earth: EarthFx;
  /** What hangs off bodies with a status (fx/statuses.ts): flames, frost glints, sparks, drips. */
  readonly statuses: BodyStatuses;

  /** `heightAt(x, z)`: the scene's ground height (u) at scene point x, z. */
  constructor(world: THREE.Scene, private heightAt: (x: number, z: number) => number) {
    this.lightRoot.add(this.lights.group);
    world.add(this.lightRoot);
    this.standins.ground = (x, y) => this.simHeight(x, y);
    this.stage.scene.add(this.standins.group);
    this.arcane = new ArcaneBeams((x, z) => this.simHeight(x, z));
    this.stage.scene.add(this.arcane.group);
    this.stage.distort.add(this.arcane.haze);
    this.cold.heightAt = (x, y) => this.simHeight(x, y);
    this.stage.scene.add(this.cold.group);
    this.fireWaves.heightAt = (x, y) => this.simHeight(x, y);
    this.stage.scene.add(this.fireWaves.group);
    this.stage.scene.add(this.windups.group);
    this.earth = new EarthFx((x, z) => this.simHeight(x, z));
    this.lightRoot.add(this.earth.meshes);
    this.stage.scene.add(this.earth.group);
    this.statuses = new BodyStatuses((x, z) => this.simHeight(x, z));
    this.stage.scene.add(this.statuses.group);
    this.fogs = new ZoneFogs((x, z) => this.simHeight(x, z));
    this.stage.scene.add(this.fogs.group);
    // the whole effects' names for ?fxoff= (view3d/fx-off.ts)
    this.cold.group.name = 'cold'; this.fireWaves.group.name = 'wave'; this.windups.group.name = 'windup'; this.arcane.group.name = 'arcane';
    this.arcane.haze.name = 'arcane.haze'; this.earth.group.name = 'earth'; this.earth.meshes.name = 'earth.rocks'; this.statuses.group.name = 'statuses';
    this.standins.group.name = 'standins';
  }

  /** The floor's height (u) under sim point (x, z); 0 off the scene. */
  private simHeight(x: number, z: number): number { const h = this.heightAt(sceneX(x), sceneZ(z)); return Number.isNaN(h) ? 0 : h; }

  /** Load the painted sheets (look B) and make the effects (they take the sheets as they're made). */
  async load(): Promise<void> {
    const loader = new THREE.TextureLoader();
    const sheet = (name: string) => {
      const url = Object.entries(fxUrls).find(([p]) => p.endsWith(`/${name}.png`))?.[1];
      return url ? loader.loadAsync(url).then((t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }).catch(() => null) : Promise.resolve(null);
    };
    const [wisps, tongues] = await Promise.all([sheet('fire-wisps'), sheet('fire-tongues')]);
    const sheets: FireSheets = { wisps, tongues };
    const simHeight = (x: number, z: number) => this.simHeight(x, z);
    for (let s = 0; s < MAX_SEATS; s++) {
      const f = new FireSpray('b', sheets, 11 + s * 17);
      f.group.name = 'spray';
      f.fan.heightAt = simHeight;
      this.spraysBy.push(f); this.stage.scene.add(f.group);
      const c = new FireSpray('b', sheets, 13 + s * 19, 'cold');
      c.group.name = 'spray.cold';
      c.fan.heightAt = simHeight;
      this.coldSprays.push(c); this.stage.scene.add(c.group);
    }
    this.grid = new SurfGrid(simHeight);
    this.floor = new FireFloor('b', sheets, this.grid, 23);
    this.floor.group.name = 'floor';
    this.stage.scene.add(this.floor.group);
  }

  /** After each shown step: the sprays' aim trails keep every tick, and the step's events become stand-ins. */
  afterStep(w: World): void {
    this.standins.afterStep(w);
    // the beams' trails keep every tick too, so sparks fly from where the beam was even in a frozen frame
    if (!this.standins.drawArcane) this.arcane.update(w, w.clock[0] / 60, null);
    this.cold.afterStep(w);
    this.fireWaves.afterStep(w);
    this.earth.afterStep(w);
    if (!this.spraysBy.length) return;
    const t = w.clock[0] / 60, all = sprays(w);
    for (let s = 0; s < MAX_SEATS; s++) {
      this.spraysBy[s].update(t, all.find((p) => p.seat === s && p.kind === 'fire') ?? null, this.groundUnder(w, s), null);
      this.coldSprays[s].update(t, all.find((p) => p.seat === s && p.kind === 'cold') ?? null, this.groundUnder(w, s), null);
    }
  }

  /** After a replayed step (rollback): its events, once each. */
  replayStep(w: World): void { this.standins.afterStep(w); this.cold.afterStep(w); this.fireWaves.afterStep(w); this.earth.afterStep(w); }

  /** A rewind put the world back to its tick: what came after is dropped (the replay brings it back). */
  rewind(w: World): void { this.standins.rewind(w.clock[0]); this.cold.rewind(w.clock[0]); this.fireWaves.rewind(w.clock[0]); this.earth.rewind(w); }

  /** Each frame, before render: effect time `t` (s). */
  frame(w: World, t: number, o: SpellFrame = {}): void {
    this.lightRoot.position.set(sceneX(0), 0, sceneZ(0));
    if (o.cam) this.syncCam(o.cam);
    this.lights.begin();
    // Fire as its stand-in too (look B hidden): the lab's ?standins=all
    const fireB = !this.standins.drawFire;
    for (const f of this.spraysBy) f.group.visible &&= fireB;
    for (const c of this.coldSprays) c.group.visible &&= !this.standins.drawCold;
    if (this.floor) this.floor.group.visible &&= fireB;
    if (this.grid && this.floor && fireB) {
      const all = sprays(w);
      for (let s = 0; s < MAX_SEATS; s++) {
        this.spraysBy[s].update(t, all.find((p) => p.seat === s && p.kind === 'fire') ?? null, this.groundUnder(w, s), this.lights, o.castAt?.(s) ?? null);
        this.coldSprays[s].update(t, all.find((p) => p.seat === s && p.kind === 'cold') ?? null, this.groundUnder(w, s), this.lights, o.castAt?.(s) ?? null);
      }
      this.grid.update(w);
      this.floor.update(t, this.lights);
    }
    // the Arcane beam as its stand-in too: the lab's ?standins=all
    this.arcane.group.visible = this.arcane.haze.visible = !this.standins.drawArcane;
    if (this.arcane.group.visible) this.arcane.update(w, t, this.lights);
    this.cold.group.visible = !this.standins.drawCold;
    if (this.cold.group.visible) this.cold.update(t, this.lights);
    this.fogs.group.visible = !this.standins.drawCold;
    if (this.fogs.group.visible) this.fogs.update(w, t, (x, z) => this.simHeight(x, z), this.lights);
    this.fireWaves.group.visible = fireB;
    if (fireB) this.fireWaves.update(t, this.lights);
    this.earth.meshes.visible = this.earth.group.visible = !this.standins.drawEarth;
    if (!this.standins.drawEarth) { this.earth.update(w, t, o.alpha ?? 0, (i) => o.bodyAt?.(i) ?? [w.bodies.x[i], w.bodies.y[i]]); this.shakeAt = t + (o.alpha ?? 0) / 60; }
    // Burn's flare: the caster's flames surge up for a moment as the spell goes off, then settle into Burning; Chill's
    // (below 0): its frost bursts out round the caster
    const now = w.clock[0] + (o.alpha ?? 0);
    const pulse = (a: number, len: number): number => (a < 0.06 ? a / 0.06 : Math.max(0, 1 - (a - 0.06) / len));
    const flare = (i: number): number => {
      if (i >= MAX_SEATS) return 0;
      const f = pulse(this.standins.selfAge(i, now, EL.fire), 0.3);
      return f > 0 ? f : -pulse(this.standins.selfAge(i, now, EL.cold), 0.5);
    };
    this.statuses.update(w, t, (i) => o.bodyAt?.(i) ?? [w.bodies.x[i], w.bodies.y[i]], this.lights, flare);
    this.windups.update(w, o.alpha ?? 0, (i) => o.bodyAt?.(i) ?? [w.bodies.x[i], w.bodies.y[i]], (x, y) => this.simHeight(x, y));
    this.standins.draw(w, { t, alpha: o.alpha ?? 0, localSeat: o.localSeat ?? -1, cam: this.fxCam, lights: this.lights, bodyAt: o.bodyAt });
    if (fxOff('lights')) this.lights.begin();
    this.lights.end();
    applyFxOff([this.stage.scene, this.stage.distort, this.lightRoot]);
  }

  private syncCam(cam: THREE.PerspectiveCamera): void {
    this.fxCam.copy(cam);
    this.fxCam.position.x -= sceneX(0); this.fxCam.position.z -= sceneZ(0);
    this.fxCam.updateMatrixWorld();
  }

  /** The world and the effects, tone-mapped to the screen (or into `box` of it: FxStage.render). */
  render(renderer: THREE.WebGLRenderer, world: THREE.Scene, cam: THREE.PerspectiveCamera, box?: { x: number; y: number; w: number; h: number }): void {
    // a rock's impact jolts the view for a moment (fx/earth-impact.ts shake), then the camera is put back
    const jolt = this.standins.drawEarth ? null : this.earth.shake(this.shakeAt);
    if (jolt) cam.position.add(jolt);
    this.syncCam(cam);
    this.stage.render(renderer, world, cam, box, this.fxCam);
    if (jolt) { cam.position.sub(jolt); cam.updateMatrixWorld(); this.syncCam(cam); }
  }

  /** Forget every remembered event and the floor's burn ages (a lab drawing another world with the same effects). */
  reset(): void { this.standins.rewind(-1); this.cold.reset(); this.fogs.reset(); this.fireWaves.reset(); this.earth.reset(); this.floor?.reset(); }

  /**
   * After each step, when the host doesn't draw every step (a lab stepping a world on to a frozen moment): the fire
   * floor notes which cells lit and went out this tick, as a game frame would, so a frame drawn later shows each cell at
   * its true age (flaring, burning, charring) rather than all of it found burning at once.
   */
  watchFloor(w: World): void {
    if (!this.grid || !this.floor || this.standins.drawFire) return;
    this.grid.update(w);
    this.floor.update(w.clock[0] / 60, null);
  }

  private groundUnder(w: World, s: number): number { return this.simHeight(w.bodies.x[s], w.bodies.y[s]); }
}
