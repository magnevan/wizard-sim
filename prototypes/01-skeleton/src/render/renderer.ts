import { damageColor } from '../spells/elements';
import { dummyDps } from '../world/dummy';
import type { Entity } from '../world/entity';
import type { World } from '../world/world';
import type { Camera } from './camera';
import { drawEffect, drawGroundEffect } from './drawEffects';
import { drawEnemy, drawEnemyTelegraph, drawGrabbed, drawPortals } from './drawEnemies';
import { drawEntity, drawHpBar, drawShadow, drawStatuses } from './drawEntities';
import { drawCage, drawEffigy, drawLens, drawRune, drawSurface, drawVessels, drawWall } from './drawStructures';
import { drawFloor, drawWalls } from './drawWorld';
import { Particles } from './particles';

/**
 * Canvas2D renderer. World-space passes draw in world units (the canvas
 * transform does the scaling); text is drawn in screen space for crispness.
 */
export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  readonly particles = new Particles();
  private dpr = 1;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly camera: Camera,
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  /** Match the backing store to the CSS size and device pixel ratio. */
  resize(): void {
    this.dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(w * this.dpr) || this.canvas.height !== Math.round(h * this.dpr)) {
      this.canvas.width = Math.round(w * this.dpr);
      this.canvas.height = Math.round(h * this.dpr);
    }
    this.camera.resize(w, h);
  }

  /** Reset to screen space (CSS pixels). */
  screenSpace(): void {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private worldSpace(): void {
    const c = this.camera;
    const s = c.ppu * this.dpr;
    this.ctx.setTransform(s, 0, 0, s, this.dpr * (c.viewW / 2 - c.center.x * c.ppu), this.dpr * (c.viewH / 2 - c.center.y * c.ppu));
  }

  drawWorld(world: World, frameDt: number): void {
    const { ctx } = this;
    for (const fx of world.fx) this.particles.cue(fx);
    world.fx = [];
    this.particles.update(frameDt);

    this.screenSpace();
    ctx.fillStyle = '#14121a';
    ctx.fillRect(0, 0, this.camera.viewW, this.camera.viewH);

    this.worldSpace();
    drawFloor(ctx, world);
    const visible = world.entities.filter((e) => !e.downed && !e.removed);
    for (const e of visible) if (e.surface) drawSurface(ctx, e, this.particles);
    if (world.encounter) drawPortals(ctx, world.encounter, world.time);
    for (const e of visible) if (e.rune) drawRune(ctx, e, world.time);
    for (const e of visible) if (e.effect) drawGroundEffect(ctx, e, world.time, this.particles);
    drawWalls(ctx, world);
    for (const e of visible) if (e.wall) drawWall(ctx, e, world);

    for (const e of visible) if (e.kind === 'enemy') drawEnemyTelegraph(ctx, e, world.time);
    const bodies = visible.filter((e) => e.kind === 'wizard' || e.kind === 'enemy' || e.kind === 'dummy' || e.kind === 'effigy').sort((a, b) => a.pos.y - b.pos.y);
    for (const e of bodies) drawShadow(ctx, e);
    for (const e of bodies) {
      if (e.kind === 'effigy') drawEffigy(ctx, e, world.time);
      else if (e.kind === 'enemy') drawEnemy(ctx, e, world.time);
      else drawEntity(ctx, e, world.time);
      if (e.grabbedBy !== undefined) drawGrabbed(ctx, world, e, world.time);
      drawStatuses(ctx, e, world.time, this.particles);
      if (!e.dummy) drawHpBar(ctx, e);
      drawVessels(ctx, e, world.time);
    }
    for (const e of visible) if (e.lens) drawLens(ctx, e, world.time);
    for (const e of visible) if (e.cage) drawCage(ctx, e, world.time);
    for (const e of visible) if (e.effect) drawEffect(ctx, e, world, this.particles);
    this.particles.draw(ctx);

    this.screenSpace();
    for (const e of bodies) if (e.dummy) this.drawDummyReadout(world, e);
    this.drawFloaters(world);
  }

  private drawFloaters(world: World): void {
    const { ctx } = this;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const f of world.floaters) {
      const p = this.camera.worldToScreen(f.pos);
      const t = f.age / f.life;
      const pop = t < 0.15 ? 1 + (0.15 - t) * 3 : 1;
      const size = Math.round((f.big ? 22 : 16) * pop);
      ctx.globalAlpha = t > 0.7 ? (1 - t) / 0.3 : 1;
      ctx.font = `800 ${size}px system-ui, sans-serif`;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = 4;
      ctx.strokeText(f.text, p.x, p.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }

  private drawDummyReadout(world: World, e: Entity): void {
    const d = e.dummy!;
    const { ctx } = this;
    const p = this.camera.worldToScreen({ x: e.pos.x, y: e.pos.y + (e.radius ?? 0.5) + 0.25 });
    const dps = dummyDps(world, d);
    const lines: [string, string][] = [[d.label, e.team === 'player' ? '#8ff09a' : '#e9e3f5']];
    lines.push([`DPS ${dps.toFixed(1)}`, dps > 0 ? '#ffffff' : '#8a8499']);
    if (d.lastHit) lines.push([`last ${d.lastHit.amount.toFixed(1)}`, damageColor(d.lastHit.type)]);

    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const w = 74;
    ctx.fillStyle = 'rgba(10,8,16,0.6)';
    ctx.fillRect(p.x - w / 2, p.y, w, lines.length * 14 + 4);
    lines.forEach(([text, color], i) => {
      ctx.fillStyle = color;
      ctx.fillText(text, p.x, p.y + 3 + i * 14);
    });
  }
}
