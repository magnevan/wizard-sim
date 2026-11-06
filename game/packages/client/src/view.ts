/**
 * The view reads the sim and never writes to it. It keeps last tick's positions so it can draw
 * between ticks (alpha in [0, 1)), which keeps motion smooth at any refresh rate while the sim
 * stays at a fixed 60 Hz. Sim events (zaps, bursts, hits) become short-lived cosmetic effects
 * that live only here (art/vfx.ts).
 *
 * The look is the Pixel Battlefield's: procedural rigs cached as frames (art/actors.ts), the
 * flagstone plaza (art/floor.ts), the gallery's spell effects drawn each frame into two field
 * canvases (under and over the actors), additive dithered lights, and the two-row rune HUD.
 *
 * Pixel-exactness: everything is laid out in whole art pixels and the root is scaled by an
 * integer with nearest filtering. Rendering into a low-res RenderTexture first would also snap
 * rotated or scaled sprites to the art grid, but in this setup that target's sprite never
 * reached the presented frame (tested on SwiftShader and D3D11). Nothing here rotates or
 * scales a sprite, so it isn't needed: rotation lives inside the Canvas2D effect drawing.
 */
import { Container, Graphics, Sprite } from 'pixi.js';
import {
  AI, ARCH, ARCHETYPES, ARENA, CAST_ID, KIND, MAX_BODIES, MAX_SEATS, PHASE,
  type SimEvent, type World,
} from '@wizard-sim/sim';
import { Camera, FY, PPU } from './camera';
import { ActorFrames, FEET_X, FEET_Y } from './art/actors';
import { Deaths } from './art/deaths';
import { FIELD, fitField, gx, gy } from './art/field';
import { FLOOR, floorTexture, surviveRuin } from './art/floor';
import { EdgeMarks } from './edge-marks';
import { Lights } from './art/lights';
import { stats } from './art/px';
import { newRigState, type RigKind, type RigState } from './art/rigs';
import { TAU, mod } from './art/util';
import { Vfx, type BodyView } from './art/vfx';
import { attackK, drawAttackFx } from './art/enemy-attacks';
import { StructureView, drawTelegraphs } from './view-structures';
import { Hud } from './hud';

const STRIDE: Record<RigKind, number> = { wizard: 10, goblin: 7, archer: 7, brute: 13, dummy: 10 };
/** Dusk on the lit layers (the floor has it baked in): a touch of blue. */
const AMBIENT = 0xe4e8ff;

export class WorldView {
  readonly camera = new Camera();
  /** Add this to the stage: the scene, and the HUD over it. */
  readonly root = new Container();
  /** The scene in art pixels, scaled by the camera's integer scale. */
  private scene = new Container();
  /** The rune HUD, wave strip and off-screen marks, at the screen's base scale. */
  private hudLayer = new Container();
  private edges = new EdgeMarks();
  readonly hud = new Hud(0);
  /** Online, the local player may sit in any seat: the HUD and the rune swirl follow it. */
  setLocalSeat(seat: number): void { this.hud.seat = seat; this.vfx.localSeat = seat; this.structs.localSeat = seat; this.isLocal = (s) => s === seat; }
  /** The seats played on this screen: a following camera frames their wizards. Offline, every seat (local co-op); online, just yours. */
  isLocal: (seat: number) => boolean = () => true;
  /** Painted for the Sanctum's and the Arena's play area; repainted at the first draw of a world with another (fitArena). */
  private floor = new Sprite(floorTexture(ARENA.w, ARENA.h));
  /** The play area the floor and effect canvases are painted for. */
  private arenaKey = `${ARENA.w}x${ARENA.h}x0`;
  private vfx = new Vfx();
  private sGround = new Graphics(); // structures' floor layer (view-structures.ts)
  private sOverlay = new Graphics();
  private actors = new Container();
  private lights = new Lights();
  private frames = new ActorFrames();
  private sprites: Sprite[] = [];
  private views: BodyView[] = [];
  private rig: RigState = newRigState();
  private structs: StructureView;
  private deaths: Deaths;
  private frame = 0;

  /**
   * Rollback corrections, eased: when a rewind moves a remote body, it is drawn offset by the error
   * and slides to its true spot over ~100 ms instead of snapping. The sim never sees this.
   */
  private smoothX = new Float64Array(MAX_BODIES);
  private smoothY = new Float64Array(MAX_BODIES);
  private preX = new Float64Array(MAX_BODIES);
  private preY = new Float64Array(MAX_BODIES);
  notePreRewind(w: World): void { this.preX.set(w.bodies.x); this.preY.set(w.bodies.y); }
  notePostRewind(w: World, localSeat: number): void {
    const b = w.bodies;
    for (let i = 0; i < MAX_BODIES; i++) {
      if (i === localSeat || !b.kind[i]) continue;
      const dx = this.preX[i] - b.x[i], dy = this.preY[i] - b.y[i];
      if (dx * dx + dy * dy > 9) { this.smoothX[i] = 0; this.smoothY[i] = 0; continue; } // a real teleport: snap
      this.smoothX[i] += dx; this.smoothY[i] += dy;
    }
    // remote spells the replay started: shown from their first frame (art/vfx.ts), with the cast pose
    const t = w.clock[0] / 60;
    for (const e of this.vfx.postRewind(w, t)) this.castPose(w, e.who, t);
  }
  /** After each step the rollback replay runs (afterStep is skipped then): notes late remote spell starts. */
  replayStep(w: World): void { this.vfx.replayStep(w); }
  /** Late remote spells: fast-forwarded from their first frame (true), or popping in where they are (false). */
  get catchUp(): boolean { return this.vfx.catchUp; }
  set catchUp(on: boolean) { this.vfx.catchUp = on; }
  /** How many late remote spells were caught up (Network test). */
  get caught(): Readonly<{ missiles: number; channels: number; casts: number }> { return this.vfx.caught; }
  /** Where missile j is drawn (world units) at real time ct, s: for tests. */
  missileDrawnAt(w: World, j: number, ct: number): [number, number] { const p = this.vfx.missileAt(w, j, ct); return [p[0], p[1]]; }
  private castPose(w: World, who: number, t: number): void {
    const id = w.seats.castId[who];
    if (id === CAST_ID.force || id === CAST_ID.conjure) this.holdUntil[who] = t + 0.35;
  }
  private prevBX = new Float64Array(MAX_BODIES);
  private prevBY = new Float64Array(MAX_BODIES);
  private prevKind = new Uint8Array(MAX_BODIES);
  // cosmetic per-body state: walk phase, speed, hit flash (attack poses come straight from the sim's ai / aiT)
  private ph = new Float64Array(MAX_BODIES);
  private spd = new Float64Array(MAX_BODIES);
  private flashT = new Float64Array(MAX_BODIES).fill(-9);
  private flashSoft = new Uint8Array(MAX_BODIES);
  // per seat: eased poses (staff raised / staff forward) and how long a Force pose lingers
  private prepS = new Float64Array(MAX_SEATS);
  private castS = new Float64Array(MAX_SEATS);
  private holdUntil = new Float64Array(MAX_SEATS);

  constructor() {
    this.actors.sortableChildren = true;
    this.structs = new StructureView(this.actors);
    this.deaths = new Deaths(this.actors);
    this.scene.addChild(this.floor, this.structs.scorch.sprite, this.vfx.ground, this.sGround, this.actors, this.lights.layer, this.vfx.over, this.sOverlay);
    this.hudLayer.addChild(this.edges.g, this.hud.top, this.hud.sprite, this.hud.perks, this.hud.over);
    this.root.addChild(this.scene, this.hudLayer);
    for (let i = 0; i < MAX_BODIES; i++) {
      const s = new Sprite(); s.visible = false; s.tint = AMBIENT;
      this.actors.addChild(s); this.sprites.push(s);
      this.views.push({ on: false, x: 0, y: 0, a: null, rig: 'goblin', seat: i < MAX_SEATS ? i : -1, f: null });
    }
  }

  /** Hide the additive lights (?lights=0), for checking what they add. */
  get lightsOn(): boolean { return this.lights.layer.visible; }
  set lightsOn(on: boolean) { this.lights.layer.visible = on; }

  resize(screenW: number, screenH: number, forcedScale?: number): void {
    this.camera.fit(screenW, screenH, forcedScale);
    this.scene.scale.set(this.camera.scale);
    this.hudLayer.scale.set(this.camera.base);
  }

  /** Call right before each sim step, so the view can interpolate from here to the new state. */
  beforeStep(w: World): void {
    this.prevBX.set(w.bodies.x); this.prevBY.set(w.bodies.y); this.prevKind.set(w.bodies.kind);
    this.vfx.noteBefore(w);
  }

  /** Call right after each sim step with its events. */
  afterStep(w: World): void {
    const b = w.bodies, s = w.seats, t = w.clock[0] / 60;
    for (const e of w.events) {
      this.hud.onEvent(e.kind, e.who, e.look, e.text, t);
      if ((e.kind === 'hit' && (e.amount ?? 0) > 0) && e.who >= 0) {
        this.flashSoft[e.who] = t - this.flashT[e.who] < 0.35 ? 1 : 0;
        this.flashT[e.who] = t;
      }
      // Blink is instant: no sliding between the two spots
      if (e.kind === 'blink' && e.who >= 0) { this.prevBX[e.who] = b.x[e.who]; this.prevBY[e.who] = b.y[e.who]; }
      if (e.kind === 'fizzle' && e.text === 'dies' && e.who >= 0) this.onDeath(w, e, t);
      if (e.kind === 'cast' && e.who >= 0 && e.who < MAX_SEATS) {
        this.castPose(w, e.who, t);
        for (let k = 0; k < s.castLen[e.who]; k++) if (e.who === this.hud.seat) this.hud.spent(s.castQueue[e.who * 5 + k], t);
      }
    }
    for (let i = 0; i < MAX_BODIES; i++) {
      if (!b.kind[i]) continue;
      if (this.prevKind[i] !== b.kind[i]) { this.prevBX[i] = b.x[i]; this.prevBY[i] = b.y[i]; this.ph[i] = 0; this.flashT[i] = -9; }
      const d = Math.hypot(b.x[i] - this.prevBX[i], b.y[i] - this.prevBY[i]);
      this.spd[i] += (d * 60 / 4.2 - this.spd[i]) * 0.3;
      this.ph[i] += (d * PPU / STRIDE[this.rigOf(w, i)]) * Math.PI;
    }
    // eased poses: staff raised while gathering, Area and Place; held out level for Force
    for (let i = 0; i < MAX_SEATS; i++) {
      const ph = s.phase[i], id = s.castId[i];
      const force = id === CAST_ID.force || id === CAST_ID.conjure;
      const cast = ph === PHASE.channel || (force && ph === PHASE.recover) || t < this.holdUntil[i] ? 1 : 0;
      const prep = !cast && (ph === PHASE.windup || ph === PHASE.charge || s.queueLen[i] > 0 || (!force && ph === PHASE.recover)) ? 1 : 0;
      this.castS[i] += (cast - this.castS[i]) * 0.35;
      this.prepS[i] += (prep - this.prepS[i]) * 0.3;
    }
    this.structs.afterStep(w, t, this.vfx.skip);
    this.vfx.afterStep(w, t);
  }

  /** An enemy died this step: its death plays from the rig state it had (its slot is already empty). */
  private onDeath(w: World, e: SimEvent, t: number): void {
    const i = e.who, b = w.bodies;
    const s = this.rigState(w, i, t, this.lastCt);
    this.deaths.add({ ...s, x: Math.round(gx(b.x[i])), y: Math.round(gy(b.y[i])), z: 0 }, {
      el: e.el ?? 0, mix: e.mix ?? 0, shape: e.shape ?? 0, status: e.status ?? 0, dirX: e.x2 ?? 0, dirY: e.y2 ?? 0,
      overkill: Math.max(0, e.amount ?? 0) / Math.max(1, b.maxHp[i]), arch: e.look ?? 0,
    }, i, e.tick);
  }

  private rigOf(w: World, i: number): RigKind {
    const k = w.bodies.kind[i];
    if (k === KIND.wizard || k === KIND.double) return 'wizard';
    if (k === KIND.dummy) return 'dummy';
    const a = w.bodies.arch[i];
    return a === ARCH.brute ? 'brute' : a === ARCH.caster ? 'archer' : 'goblin';
  }

  /**
   * Lays the scene out for this frame; the caller renders the stage. now is real time in ms: every
   * purely cosmetic animation (swirls, orbits, bobbing, flicker, fire, auras, shimmer, particle drift)
   * runs on it, so nothing freezes while the sim waits on the network or is paused. What stands for
   * sim state (positions, wind-ups, ages of sim events) stays on sim time and interpolation.
   */
  draw(w: World, alpha: number, now = performance.now()): void {
    this.frame++;
    const b = w.bodies, t = (w.clock[0] + alpha) / 60, cam = this.camera, ct = now / 1000;
    const dt = this.lastCt ? ct - this.lastCt : 0;
    this.lastCt = ct;
    this.fitArena(w);
    this.aim(w, alpha, dt);
    // a death's or a brute slam's screen shake (last frame's, in whole art px): cosmetic only
    const sh = Math.max(this.deaths.shake, this.atkShake), sx = sh > 0.3 ? Math.round(Math.sin(ct * 83) * sh) : 0, sy = sh > 0.3 ? Math.round(Math.cos(ct * 71) * sh * 0.6) : 0;
    this.scene.scale.set(cam.scale);
    this.scene.position.set(sx * cam.scale + cam.subX(), sy * cam.scale + cam.subY());
    // how long the sim has stood still (capped): lets sim-driven loops (orbitals) carry on smoothly
    if (t !== this.lastSimT) { this.lastSimT = t; this.stillSince = ct; }
    const lead = Math.min(0.5, ct - this.stillSince);
    const ox = cam.originX(), oy = cam.originY(), fx0 = ox - FIELD.OX, fy0 = oy - FIELD.OY;
    this.floor.position.set(ox - FLOOR.OX, oy - FLOOR.OY);
    this.vfx.ground.position.set(fx0, fy0); this.vfx.over.position.set(fx0, fy0); this.structs.scorch.sprite.position.set(fx0, fy0);
    // the wave banner: over the arena's north edge, or near the top of the view when that is off screen
    this.vfx.bannerX = Math.round(cam.w / 2 - fx0);
    this.vfx.bannerY = Math.round(Math.max(FIELD.OY - (w.dims.h / 2) * PPU * FY + 22, (28 * cam.base) / cam.scale + 10 - fy0));
    this.frames.begin();

    for (let i = 0; i < MAX_BODIES; i++) {
      const spr = this.sprites[i], v = this.views[i];
      if (!b.kind[i]) { spr.visible = false; v.on = false; continue; }
      this.smoothX[i] *= 0.82; this.smoothY[i] *= 0.82; // the eased rollback correction fades each frame
      const x = this.prevBX[i] + (b.x[i] - this.prevBX[i]) * alpha + this.smoothX[i], y = this.prevBY[i] + (b.y[i] - this.prevBY[i]) * alpha + this.smoothY[i];
      const fx = Math.round(gx(x)), fy = Math.round(gy(y));
      const s = this.rigState(w, i, t, ct);
      // past the paint budget a body keeps its last frame; one that has none yet is painted anyway
      const fr = this.frames.get(s, !v.a);
      if (fr) { spr.texture = fr.tex; v.a = fr.a; v.f = fr; }
      spr.visible = !!v.a;
      const dbl = b.kind[i] === KIND.double;
      spr.alpha = dbl ? 0.62 + 0.08 * Math.sin(ct * 5) : 1;
      spr.tint = dbl ? 0xd8b4ff : AMBIENT;
      spr.position.set(fx0 + fx - FEET_X, fy0 + fy - FEET_Y);
      spr.zIndex = fy * 128 + i;
      v.on = true; v.x = fx; v.y = fy; v.rig = s.kind;
    }

    const ax = (x: number) => ox + Math.round(x * PPU), ay = (y: number) => cam.toArtY(y);
    drawTelegraphs(w, { ground: this.sGround.clear(), overlay: this.sOverlay.clear(), ax, ay }, Math.round(ct * 60));

    this.lights.begin();
    stats.fills = 0;
    const t0 = performance.now();
    const light = (x: number, y: number, r: number, col: string, a: number) => this.lights.add(fx0 + x, fy0 + y, r, col, a);
    this.vfx.draw(w, t, this.views, light, (g, o) => { this.structs.draw(w, t, ct, lead, g, o, this.views, light, fx0, fy0); this.deaths.draw(g, o, ct, light, fx0, fy0); this.atkShake = drawAttackFx(w, this.views, g, o, light, alpha, ct); }, ct);
    this.lights.end();
    this.fxMs = this.fxMs * 0.9 + (performance.now() - t0) * 0.1;
    this.hud.draw(w, t, cam.hudW, cam.hudH);
    this.edges.draw(w, cam, ct, (i) => this.drawnAt(i, w, alpha));
    this.frames.upload();
  }

  /** Repaints the floor and resizes the effect canvases when the world's play area changes (a survive world is bigger). */
  private fitArena(w: World): void {
    const d = w.dims, key = `${d.w}x${d.h}x${w.run ? 1 : 0}`;
    if (key === this.arenaKey) return;
    this.arenaKey = key;
    if (fitField(d.w, d.h)) { this.vfx.resize(); this.structs.scorch.resize(); }
    const old = this.floor.texture;
    this.floor.texture = floorTexture(d.w, d.h, w.run ? surviveRuin : undefined);
    old?.destroy(true);
    this.camera.reset();
  }

  /** Where body i is drawn this frame (interpolated), world units. */
  private drawnAt(i: number, w: World, alpha: number): [number, number] {
    const b = w.bodies;
    return [this.prevBX[i] + (b.x[i] - this.prevBX[i]) * alpha, this.prevBY[i] + (b.y[i] - this.prevBY[i]) * alpha];
  }

  /**
   * Points the camera at this screen's own wizards: the local seats' living ones (their middle, for
   * local co-op), or the downed ones if none is up, in every room. Other players' wizards don't pull
   * it: they get an arrow at the edge of the view (edge-marks.ts). With no local wizard at all, it
   * frames everyone. Several local seats share the screen (camera.ts `shared`).
   */
  private aim(w: World, alpha: number, dt: number): void {
    const b = w.bodies, up: { x: number; y: number }[] = [], down: { x: number; y: number }[] = [], all: { x: number; y: number }[] = [];
    for (let s = 0; s < MAX_SEATS; s++) {
      if (b.kind[s] !== KIND.wizard) continue;
      const [x, y] = this.drawnAt(s, w, alpha), p = { x, y };
      all.push(p);
      if (this.isLocal(s)) (b.downed[s] ? down : up).push(p);
    }
    const mine = up.length + down.length;
    this.camera.follow(w.dims.w, w.dims.h, mine ? (up.length ? up : down) : all, mine !== 1, dt);
  }

  private fxMs = 0;
  private atkShake = 0;
  private lastCt = 0;
  private lastSimT = -1;
  private stillSince = 0;
  /** For the debug line: the effects' cost and the actor frame cache. */
  debug(): string { return `fx ${(stats.fills / 1000).toFixed(1)}k fills ${this.fxMs.toFixed(1)}ms  frames ${this.frames.size} (${this.frames.painted} painted)  deaths ${this.deaths.count}  view ${this.camera.w}x${this.camera.h}${this.camera.following ? ' follow' : ''}`; }

  private ownerOf(w: World, i: number): number {
    for (let k = 0; k < MAX_SEATS; k++) if (w.seats.double[k] === i) return k;
    return 0;
  }

  /** The quantized rig state of body i: what its cached frame is keyed by. */
  private rigState(w: World, i: number, t: number, ct: number): RigState {
    const b = w.bodies, s = this.rig, kind = this.rigOf(w, i), arch = b.arch[i];
    s.kind = kind; s.seed = i & 1; s.variant = 0; s.pal = 0;
    s.punch = -1; s.smash = -1; s.draw = 0; s.atk = -1; s.hold = 0; s.prep = 0; s.cast = 0; s.vx = 0; s.vy = 0;
    // a Double is its owner's wizard (drawn translucent and violet-tinted by the sprite)
    const owner = b.kind[i] === KIND.double ? this.ownerOf(w, i) : i;
    if (kind === 'wizard') s.pal = owner % 4;
    else if (b.kind[i] === KIND.enemy || b.kind[i] === KIND.none) { // none: an enemy that just died (onDeath)
      if (arch === ARCH.shieldbearer) { s.pal = 5; s.variant = 5; }
      else if (arch === ARCH.grabber) { s.pal = 4; s.variant = 4; }
      else if (arch === ARCH.imp) { s.pal = 3; s.variant = 3; }
      else { s.pal = i % 3; s.variant = kind === 'goblin' ? i % 3 : 0; }
    }
    // facing in 16 directions; the dummy faces the camera
    s.face = kind === 'dummy' ? Math.PI / 2 : (Math.round(b.face[i] * 16) / 16) * TAU;
    const sp = this.spd[i];
    s.spd = sp < 0.15 ? 0 : sp < 0.6 ? 0.5 : 1;
    s.ph = s.spd ? (Math.round(mod(this.ph[i], TAU) / TAU * 8) / 8) * TAU : 0;
    s.idle = (Math.round(mod(ct * 2.6 + i, TAU) / TAU * 4) / 4) * TAU;
    if (kind === 'wizard' && s.spd) {
      const vx = (b.x[i] - this.prevBX[i]) * 60 * PPU;
      s.vx = vx > 25 ? 60 : vx < -25 ? -60 : 0;
    }
    if (owner < MAX_SEATS) { s.prep = Math.round(this.prepS[owner] * 2) / 2; s.cast = Math.round(this.castS[owner] * 2) / 2; }
    // hit: a squash and a white flash, soft while a beam keeps hitting
    const fa = t - this.flashT[i];
    s.flash = fa < 0 ? 0 : this.flashSoft[i] ? (fa < 0.08 ? 4 : 0) : fa < 0.05 ? 16 : fa < 0.1 ? 9 : fa < 0.18 ? 4 : 0;
    s.sq = fa >= 0 && fa < 0.15 ? (kind === 'dummy' ? (fa < 0.07 ? 0.3 : -0.3) : 0.3) : 0;
    // statuses
    s.dead = b.downed[i] ? 1 : b.down[i] > 0 ? 0.7 : 0;
    s.burn = b.burn[i] > 0 ? (b.burn[i] < 20 ? 0.5 : 1) : 0;
    s.burnF = s.burn ? Math.floor(ct * 16) % 4 : 0;
    s.wet = b.wet[i] > 0 ? (b.wet[i] < 30 ? 0.5 : 1) : 0;
    s.wetF = s.wet ? Math.floor(ct * 9) % 6 : 0;
    s.frozen = b.frozen[i] > 0 ? (b.frozen[i] < 12 ? 0.67 : Math.min(1, Math.ceil(Math.max(0, 150 - b.frozen[i]) / 6) / 3 || 0.34)) : 0;
    s.chill = Math.round(Math.min(1, b.chill[i] / 3) * 3) / 3;
    s.shock = b.stun[i] > 0 ? Math.floor(ct * 26) % 2 : 0;
    if (b.heldBy[i] >= 0) s.sq = Math.floor(ct * 12) % 2 ? 0.2 : -0.2; // struggling in a grab
    // enemy attack poses, from the sim's attack state (art/enemy-attacks.ts)
    if (b.kind[i] === KIND.enemy) {
      const k = attackK(w, i);
      if (kind === 'brute') s.smash = k;
      else if (kind === 'archer') {
        const A = ARCHETYPES[arch];
        if (b.ai[i] === AI.windup) s.draw = Math.round(Math.min(1, b.aiT[i] / Math.max(1, A.windup * 60)) * 4) / 4;
        s.atk = k;
      } else {
        s.atk = k;
        // goblin-sized bodies crouch into the wind-up and stretch into the blow (it reads from any side)
        if (k >= 0 && s.flash === 0) s.sq = k < 0.5 ? Math.round(k * 4) / 10 : k <= 0.6 ? -0.2 : 0;
      }
      if (arch === ARCH.grabber) {
        if (b.ai[i] === AI.dash) s.spd = 1;
        if (b.ai[i] === AI.grab && b.holding[i] >= 0) { s.atk = -1; s.hold = Math.floor(ct * 6) % 2 ? 2 : 1; }
      }
    }
    return s;
  }
}
