import { CAMERA, PLAYER_COLORS } from '../config';
import { keyPresses, type InputSnapshot } from '../core/input';
import { Rng } from '../core/rng';
import type { Vec2 } from '../core/vec2';
import { Camera } from '../render/camera';
import { Renderer } from '../render/renderer';
import { createArena } from '../rooms/arena';
import type { Room } from '../rooms/room';
import { createSanctum } from '../rooms/sanctum';
import { ProposalAResolver } from '../spells/proposalA';
import { rulesLabel, type RuleSet } from '../spells/tree';
import { DefaultSpellRunner } from '../spells/runner';
import { drawHud } from '../ui/hud';
import { drawDebug, drawHelp } from '../ui/overlays';
import { spawnWizard } from '../world/spawn';
import { World } from '../world/world';
import { BotController } from './bot';
import type { PlayerController } from './controllers';
import { anyPressed, GamepadController, readPad } from './gamepad';
import type { PlayerSlot } from './players';
import { step, type Sim } from './sim';

export const ROOMS: Record<string, () => Room> = {
  sanctum: createSanctum,
  arena: createArena,
};

const MAX_PLAYERS = 4;
const PAD_SLOTS = 4;

const ROOM_KEYS: Record<string, string> = { Digit1: 'sanctum', Digit2: 'arena' };

export class Game {
  readonly camera = new Camera();
  readonly renderer: Renderer;
  readonly sim: Sim;
  ui = { help: false, debug: false };

  /** Proposal A spell tree (PlaceholderResolver is the old Magicka-like stand-in). F2 toggles A / A.1. */
  readonly resolver: ProposalAResolver;

  constructor(canvas: HTMLCanvasElement, roomId = 'sanctum', rules: RuleSet = 'a') {
    this.renderer = new Renderer(canvas, this.camera);
    const room = (ROOMS[roomId] ?? createSanctum)();
    this.resolver = new ProposalAResolver(rules);
    this.sim = {
      world: new World(room.width, room.height),
      room,
      players: [],
      resolver: this.resolver,
      runner: new DefaultSpellRunner(),
    };
    this.loadRoom(room);
  }

  /** F2: switch rule set A <-> A.1 at runtime (the HUD shows which one is live). */
  toggleRules(): void {
    this.resolver.rules = this.resolver.rules === 'a1' ? 'a' : 'a1';
    const p = this.sim.world.get(this.sim.players[0]?.entityId);
    if (p) this.sim.world.floater({ x: p.pos.x, y: p.pos.y - 1.6 }, `Rules: ${rulesLabel(this.resolver.rules)}`, '#ffd98a', true);
  }

  /** Co-op seam: add a local player driven by any controller (keyboard, gamepad, script). */
  addPlayer(controller: PlayerController): PlayerSlot {
    const used = new Set(this.sim.players.map((p) => p.index));
    let index = 0;
    while (used.has(index)) index++;
    const slot: PlayerSlot = { index, color: PLAYER_COLORS[index % PLAYER_COLORS.length], controller, entityId: -1, spawn: { x: 0, y: 0 } };
    this.sim.players.push(slot);
    this.spawnPlayer(slot);
    this.sim.players.sort((a, b) => a.index - b.index);
    if (index === 0) this.camera.center = { ...this.sim.world.get(slot.entityId)!.pos };
    return slot;
  }

  removePlayer(slot: PlayerSlot): void {
    const e = this.sim.world.get(slot.entityId);
    if (e) {
      this.sim.world.cue('poof', e.pos, slot.color);
      this.sim.world.remove(e);
    }
    this.sim.players = this.sim.players.filter((p) => p !== slot);
  }

  /** K: add / remove an AI wizard that follows player 1. */
  toggleBotAlly(): void {
    const bot = this.sim.players.find((p) => p.controller instanceof BotController && p.index > 0);
    if (bot) return this.removePlayer(bot);
    if (this.sim.players.length >= MAX_PLAYERS) return;
    this.addPlayer(new BotController((world) => world.get(this.sim.players[0]?.entityId)));
  }

  /** Any button on an unassigned gamepad joins a new local player. */
  private pollGamepadJoin(): void {
    if (this.sim.players.length >= MAX_PLAYERS) return;
    for (let i = 0; i < PAD_SLOTS; i++) {
      if (this.sim.players.some((p) => p.controller instanceof GamepadController && p.controller.padIndex === i)) continue;
      if (anyPressed(readPad(i))) this.addPlayer(new GamepadController(i));
    }
  }

  loadRoom(room: Room): void {
    const world = new World(room.width, room.height, new Rng(1234));
    this.sim.world = world;
    this.sim.room = room;
    room.build(world);
    for (const slot of this.sim.players) this.spawnPlayer(slot);
    const c = this.playersCenter();
    if (c) this.camera.center = c;
  }

  private spawnPlayer(slot: PlayerSlot): void {
    const pts = this.sim.room.spawnPoints;
    slot.spawn = { ...pts[Math.min(slot.index, pts.length - 1)] };
    slot.entityId = spawnWizard(this.sim.world, slot.spawn, slot.index, slot.color).id;
  }

  tick(input: InputSnapshot, dt: number): void {
    for (const code of keyPresses(input)) {
      if (code === 'KeyH' || code === 'F1') this.ui.help = !this.ui.help;
      else if (code === 'Backquote') this.ui.debug = !this.ui.debug;
      else if (code === 'Digit0') this.sim.room.reset?.(this.sim.world);
      else if (code === 'KeyK') this.toggleBotAlly();
      else if (code === 'F2') this.toggleRules();
      else if (ROOM_KEYS[code]) this.loadRoom(ROOMS[ROOM_KEYS[code]]());
    }
    this.pollGamepadJoin();
    this.camera.zoomBy(input.wheel);
    step(this.sim, input, dt);
  }

  render(frameDt: number, fps: number, ticks: number): void {
    const r = this.renderer;
    r.resize();
    const box = this.playersBox();
    if (box) {
      this.camera.frame(box.w, box.h, frameDt);
      this.camera.follow(box.center, frameDt);
    }
    r.drawWorld(this.sim.world, frameDt);
    r.screenSpace();
    const { viewW: w, viewH: h } = this.camera;
    drawHud(r.ctx, w, h, this.sim, this.camera);
    if (this.ui.debug) drawDebug(r.ctx, this.sim, fps, ticks, this.camera.zoom);
    if (this.ui.help) drawHelp(r.ctx, h, this.resolver.rules);
  }

  /** Bounding box of living players (and lull portals), with a margin: the camera frames it. */
  private playersBox(): { center: Vec2; w: number; h: number } | null {
    const alive = this.sim.players.map((p) => this.sim.world.get(p.entityId)).filter((e) => e && !e.downed);
    if (alive.length === 0) return null;
    const pts = alive.map((e) => e!.pos);
    // During the lull the camera pulls back to show the portals too (within the zoom limit).
    const enc = this.sim.world.encounter;
    if (enc?.phase === 'lull') pts.push(...enc.portals.map((p) => p.pos));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const m = CAMERA.frameMargin;
    return { center: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 + CAMERA.offsetY }, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m + CAMERA.offsetY * 2 };
  }

  private playersCenter(): Vec2 | null {
    return this.playersBox()?.center ?? null;
  }
}
