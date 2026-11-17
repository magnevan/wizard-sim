/**
 * People who live in a place: the drill yard's students and hired soldiers (tools/segments/01-opening/yard-level.py).
 * Client only, so they cost the sim nothing and never touch its determinism: each is a Marker in the room whose id is
 * x-<kind>-<act>-<palette>-<variant>-<facing in degrees>-<n>, drawn with the same rigs and frame cache as the bodies
 * and sorted with them. Acts: idle (breathing), drill (a spear thrust over and over), spar (sword blows, a step in and
 * out), cast (a student's staff raised and held out), walk (back and forth along the gravel walk).
 */
import { Container, Sprite } from 'pixi.js';
import type { RoomDef } from '@wizard-sim/sim';
import { ActorFrames, FEET_X, FEET_Y, type Frame } from './actors';
import { newRigState, type RigKind, type RigState } from './rigs';
import { gx, gy } from './field';
import { toU, toV } from '../iso-world';

const TAU = Math.PI * 2;
/** How a plan facing turns in the view (iso-world.ts FACE_TURN). */
const FACE_TURN = 1 / 8;
/** The walk: how far along it goes in plan units (east, a little north), and its pace. */
const WALK = { dx: 22, dy: -1.4, speed: 1.5, pause: 2.5 } as const;

interface Person { kind: RigKind; act: string; pal: number; variant: number; face: number; x: number; y: number; n: number; spr: Sprite; f: Frame | null }

const q16 = (rad: number): number => (Math.round((((rad / TAU) % 1) + 1) % 1 * 16) / 16) * TAU;

export class Extras {
  private people: Person[] = [];
  private def: RoomDef | null = null;
  private s: RigState = newRigState();

  constructor(private readonly layer: Container, private readonly frames: ActorFrames) {}

  /** The room's people, read once per room (def is the view's turned one: markers in view space). */
  private room(def: RoomDef): void {
    if (def === this.def) return;
    this.def = def;
    for (const p of this.people) p.spr.destroy();
    this.people = [];
    for (const m of def.markers) {
      const k = m.id.split('-');
      if (k[0] !== 'x' || k.length < 7) continue;
      const spr = new Sprite();
      this.layer.addChild(spr);
      this.people.push({ kind: k[1] === 'soldier' ? 'soldier' : 'wizard', act: k[2], pal: +k[3], variant: +k[4], face: ((+k[5] / 360 + FACE_TURN) % 1) * TAU, x: m.x, y: m.y, n: +k[6], spr, f: null });
    }
  }

  /** Lays them out for this frame. ct: seconds of real time (they're scenery, so they never wait on the sim). */
  draw(def: RoomDef, ct: number, fx0: number, fy0: number, tint: number): void {
    this.room(def);
    const s = this.s;
    for (const p of this.people) {
      Object.assign(s, newRigState());
      s.kind = p.kind; s.pal = p.pal; s.variant = p.variant; s.seed = p.n & 1;
      let x = p.x, y = p.y, face = p.face;
      const ph = ct + p.n * 0.37;
      s.idle = (Math.round((((ct * 2.6 + p.n) % TAU) / TAU) * 4) / 4) * TAU;
      if (p.act === 'drill') {
        const k = (ph % 1.8) / 1.8;
        s.atk = k < 0.7 ? k : -1;
      } else if (p.act === 'spar') {
        // two of them, taking turns: one swings while the other gives a step
        const side = p.face > Math.PI ? 1 : 0, k = ((ct + side * 1.1) % 2.2) / 2.2;
        s.atk = k < 0.55 ? k / 0.55 * 0.9 : -1;
        const step = Math.sin(((ct + side * 1.1) / 2.2) * TAU) * 0.25;
        x += Math.cos(face) * step; y += Math.sin(face) * step;
      } else if (p.act === 'cast') {
        const k = (ph % 3.2) / 3.2;
        s.prep = k > 0.15 && k < 0.6 ? 1 : 0; s.cast = k >= 0.6 && k < 0.78 ? 1 : 0;
      } else if (p.act === 'walk') {
        const du = toU(WALK.dx, WALK.dy), dv = toV(WALK.dx, WALK.dy), L = Math.hypot(du, dv), leg = L / WALK.speed, cyc = (leg + WALK.pause) * 2;
        const k = (ct + p.n * 3) % cyc, out = k < leg + WALK.pause;
        const along = out ? Math.min(1, k / leg) : Math.max(0, 1 - (k - leg - WALK.pause) / leg);
        const moving = out ? k < leg : k - leg - WALK.pause < leg;
        x += du * along; y += dv * along;
        face = Math.atan2(dv * (out ? 1 : -1), du * (out ? 1 : -1));
        if (moving) { s.spd = 1; s.ph = (Math.round((((ct * WALK.speed * 2.4) % TAU) / TAU) * 8) / 8) * TAU; }
      }
      s.face = q16(face);
      const fr = this.frames.get(s, !p.f);
      if (fr) p.f = fr;
      const spr = p.spr;
      spr.visible = !!p.f;
      if (!p.f) continue;
      const fx = Math.round(gx(x)), fy = Math.round(gy(y));
      spr.texture = p.f.tex; spr.tint = tint;
      spr.position.set(fx0 + fx - FEET_X, fy0 + fy - FEET_Y);
      spr.zIndex = fy * 128 + 127;
    }
  }

  /** Each one drawn this frame: its frame and its feet in field px (for the lighting's shadows). */
  each(fn: (f: Frame, fx: number, fy: number) => void, fx0: number, fy0: number): void {
    for (const p of this.people) if (p.f && p.spr.visible) fn(p.f, p.spr.position.x + FEET_X - fx0, p.spr.position.y + FEET_Y - fy0);
  }
}
