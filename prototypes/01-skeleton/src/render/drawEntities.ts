import { ELEMENTS } from '../spells/elements';
import type { StatusId } from '../statuses/defs';
import type { Entity } from '../world/entity';
import type { Particles } from './particles';
import { rand } from './particles';

const TAU = Math.PI * 2;

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
}

export function drawShadow(ctx: CanvasRenderingContext2D, e: Entity): void {
  const r = e.radius ?? 0.4;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(e.pos.x, e.pos.y + r * 0.75, r * 0.95, r * 0.4, 0, 0, TAU);
  ctx.fill();
}

export function drawEntity(ctx: CanvasRenderingContext2D, e: Entity, time: number): void {
  if (e.kind === 'wizard') drawWizard(ctx, e, time);
  else if (e.kind === 'dummy') drawDummy(ctx, e);
  if (e.hitFlash) {
    ctx.globalAlpha = Math.min(1, e.hitFlash / 0.12) * 0.7;
    ctx.fillStyle = '#ffffff';
    circle(ctx, e.pos.x, e.pos.y, e.radius ?? 0.4);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawWizard(ctx: CanvasRenderingContext2D, e: Entity, time: number): void {
  const r = e.radius!;
  const { x, y } = e.pos;
  const color = e.player?.color ?? '#4f8cff';
  const f = e.facing ?? 0;
  const c = e.caster;

  // Cast wind-up glow.
  const a = c?.active;
  if (a) {
    const col = a.spec.elements.length ? ELEMENTS[a.spec.elements[0]].color : '#ffffff';
    const k = a.phase === 'windup' ? Math.min(1, a.t / Math.max(0.01, a.spec.castTime)) : 1;
    ctx.strokeStyle = col;
    ctx.globalAlpha = a.phase === 'recovery' ? 0.25 : 0.6;
    ctx.lineWidth = 0.07;
    circle(ctx, x, y, r + 0.12 + 0.2 * k);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Ethereal: a see-through ghost of the wizard.
  const ghost = !!e.statuses?.ethereal;
  ctx.globalAlpha = ghost ? 0.32 + 0.08 * Math.sin(time * 9) : 1;

  // Robe.
  ctx.fillStyle = color;
  circle(ctx, x, y, r);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 0.06;
  ctx.stroke();
  // Hood, offset toward facing.
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  circle(ctx, x + Math.cos(f) * r * 0.25, y + Math.sin(f) * r * 0.25, r * 0.55);
  ctx.fill();

  // Staff, held on the right hand side, pointing along facing.
  const side = f + Math.PI / 2;
  const hx = x + Math.cos(side) * r * 0.7;
  const hy = y + Math.sin(side) * r * 0.7;
  const tx = hx + Math.cos(f) * r * 1.5;
  const ty = hy + Math.sin(f) * r * 1.5;
  ctx.strokeStyle = '#6b4a2b';
  ctx.lineWidth = 0.09;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(hx - Math.cos(f) * r * 0.4, hy - Math.sin(f) * r * 0.4);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  const q = c?.queue.elements ?? [];
  const tip = q.length ? ELEMENTS[q[q.length - 1]].color : '#e8e2ff';
  ctx.fillStyle = tip;
  ctx.shadowColor = tip;
  ctx.shadowBlur = q.length ? 12 : 4;
  circle(ctx, tx, ty, 0.12 + 0.02 * Math.sin(time * 8));
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

function drawDummy(ctx: CanvasRenderingContext2D, e: Entity): void {
  const r = e.radius!;
  const { x, y } = e.pos;
  const ally = e.team === 'player';
  // Post and crossbar.
  ctx.strokeStyle = '#6b4a2b';
  ctx.lineWidth = 0.12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - r * 1.1, y - r * 0.2);
  ctx.lineTo(x + r * 1.1, y - r * 0.2);
  ctx.stroke();
  // Straw body with target rings (enemy) or a green ally sash.
  ctx.fillStyle = '#d2b07a';
  circle(ctx, x, y, r);
  ctx.fill();
  ctx.strokeStyle = '#7a5a30';
  ctx.lineWidth = 0.05;
  ctx.stroke();
  if (ally) {
    ctx.strokeStyle = '#5ee26a';
    ctx.lineWidth = 0.12;
    circle(ctx, x, y, r * 0.75);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#c0392b';
    circle(ctx, x, y, r * 0.62);
    ctx.fill();
    ctx.fillStyle = '#f4e7d0';
    circle(ctx, x, y, r * 0.42);
    ctx.fill();
    ctx.fillStyle = '#c0392b';
    circle(ctx, x, y, r * 0.2);
    ctx.fill();
  }
}

/** Small HP bar above an entity (not drawn at full HP). */
export function drawHpBar(ctx: CanvasRenderingContext2D, e: Entity): void {
  if (e.hp === undefined || e.maxHp === undefined || e.hp >= e.maxHp) return;
  const r = e.radius ?? 0.4;
  const w = Math.max(0.9, r * 2);
  const x = e.pos.x - w / 2;
  const y = e.pos.y - r - 0.32;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x - 0.03, y - 0.03, w + 0.06, 0.16);
  ctx.fillStyle = e.team === 'enemy' ? '#e0525a' : '#5ee26a';
  ctx.fillRect(x, y, w * Math.max(0, e.hp / e.maxHp), 0.1);
}

/** Status visuals layered on top of the entity body. Also emits flame/drip particles. */
export function drawStatuses(ctx: CanvasRenderingContext2D, e: Entity, time: number, particles: Particles): void {
  const r = e.radius ?? 0.4;
  const { x, y } = e.pos;
  const s = e.statuses ?? {};
  const on = (id: StatusId) => !!s[id];

  if (e.ward) {
    ctx.strokeStyle = '#f3d36b';
    ctx.globalAlpha = 0.5 + 0.2 * Math.sin(time * 5);
    ctx.lineWidth = 0.07;
    ctx.setLineDash([0.25, 0.12]);
    ctx.lineDashOffset = time;
    circle(ctx, x, y, r + 0.28);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  if (on('wet')) {
    ctx.fillStyle = 'rgba(80,170,255,0.35)';
    circle(ctx, x, y, r);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,235,255,0.8)';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.75, Math.PI * 1.1, Math.PI * 1.6);
    ctx.stroke();
    if (Math.random() < 0.08) particles.emit({ pos: { x: x + rand(-r, r) * 0.7, y: y + r * 0.3 }, vel: { x: 0, y: 1.5 }, life: 0.4, color: '#4fb4ff', size: 0.05, shape: 'dot', drag: 0 });
  }
  if (on('chilled')) {
    ctx.strokeStyle = 'rgba(200,242,255,0.85)';
    ctx.lineWidth = 0.06;
    ctx.setLineDash([0.12, 0.1]);
    circle(ctx, x, y, r + 0.1);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (on('frozen')) {
    ctx.fillStyle = 'rgba(160,225,255,0.55)';
    ctx.strokeStyle = 'rgba(235,250,255,0.95)';
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6;
      const rr = r * 1.3;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - r * 0.6, y - r * 0.2);
    ctx.lineTo(x - r * 0.1, y - r * 0.7);
    ctx.stroke();
  }
  if (on('burning')) {
    for (let i = 0; i < 3; i++) {
      const fx = x + (i - 1) * r * 0.55;
      const h = r * (0.9 + 0.35 * Math.sin(time * 14 + i * 2.1 + e.id));
      ctx.fillStyle = i === 1 ? '#ffd23a' : '#ff7a1a';
      ctx.beginPath();
      ctx.moveTo(fx - r * 0.25, y - r * 0.1);
      ctx.quadraticCurveTo(fx, y - r * 0.1 - h * 1.3, fx + r * 0.25, y - r * 0.1);
      ctx.closePath();
      ctx.fill();
    }
    if (Math.random() < 0.3) particles.emit({ pos: { x: x + rand(-r, r) * 0.6, y: y - r }, vel: { x: rand(-0.3, 0.3), y: -1.6 }, life: 0.5, color: '#ff9a3a', size: 0.06, shape: 'dot', drag: 1 });
  }
  if (on('slowed')) {
    ctx.strokeStyle = 'rgba(140,123,181,0.8)';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.8, r, r * 0.35, 0, time * 3, time * 3 + Math.PI * 1.4);
    ctx.stroke();
  }
  if (on('ethereal')) {
    ctx.strokeStyle = '#b9f3ff';
    ctx.shadowColor = '#b9f3ff';
    ctx.shadowBlur = 10;
    ctx.globalAlpha = 0.7 + 0.3 * Math.sin(time * 7);
    ctx.lineWidth = 0.05;
    ctx.setLineDash([0.18, 0.12]);
    ctx.lineDashOffset = -time * 0.8;
    circle(ctx, x, y, r + 0.12);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    if (Math.random() < 0.35) particles.emit({ pos: { x: x + rand(-r, r), y: y + rand(-r, r) * 0.5 }, vel: { x: rand(-0.2, 0.2), y: -0.9 }, life: 0.7, color: '#d8fbff', size: rand(0.08, 0.16), shape: 'puff', drag: 0.5 });
  }
  if (on('haste')) {
    // Speed streaks trailing behind, sparks at the feet.
    const v = e.vel && (Math.abs(e.vel.x) + Math.abs(e.vel.y) > 0.5) ? Math.atan2(e.vel.y, e.vel.x) : (e.facing ?? 0);
    ctx.strokeStyle = '#c7a8ff';
    ctx.lineWidth = 0.05;
    ctx.globalAlpha = 0.75;
    for (let i = -1; i <= 1; i++) {
      const sx = x - Math.cos(v) * r * 0.9 + Math.cos(v + Math.PI / 2) * i * r * 0.5;
      const sy = y - Math.sin(v) * r * 0.9 + Math.sin(v + Math.PI / 2) * i * r * 0.5;
      const l = r * (0.7 + 0.3 * Math.sin(time * 20 + i * 2));
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - Math.cos(v) * l, sy - Math.sin(v) * l);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (Math.random() < 0.3) particles.emit({ pos: { x: x + rand(-r, r) * 0.8, y: y + r * 0.6 }, vel: { x: rand(-1, 1), y: rand(-1, 0) }, life: 0.25, color: '#e6d8ff', size: 0.05, shape: 'dot', drag: 2 });
  }
  if (on('glass')) {
    // Cracked pink glass glow.
    ctx.strokeStyle = '#ff7bb5';
    ctx.shadowColor = '#ff4f9b';
    ctx.shadowBlur = 8;
    ctx.lineWidth = 0.05;
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(time * 6);
    circle(ctx, x, y, r + 0.07);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - r * 0.7, y - r * 0.5);
    ctx.lineTo(x - r * 0.2, y - r * 0.1);
    ctx.lineTo(x - r * 0.35, y + r * 0.35);
    ctx.moveTo(x - r * 0.2, y - r * 0.1);
    ctx.lineTo(x + r * 0.3, y - r * 0.3);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
  if (on('stoneskin')) {
    // Rock plates around the body; fewer as the armor wears down.
    const plates = Math.max(2, Math.min(8, Math.ceil((e.armor ?? 0) / 10)));
    for (let i = 0; i < plates; i++) {
      const a = (i / 8) * TAU + 0.3;
      const px = x + Math.cos(a) * r * 0.95;
      const py = y + Math.sin(a) * r * 0.95;
      ctx.fillStyle = i % 2 ? '#9c6b3e' : '#b5895a';
      ctx.strokeStyle = '#4a3220';
      ctx.lineWidth = 0.03;
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const b = a + (k / 5) * TAU;
        const rr = r * (0.3 + 0.06 * ((k * 7 + i) % 3));
        if (k === 0) ctx.moveTo(px + Math.cos(b) * rr, py + Math.sin(b) * rr);
        else ctx.lineTo(px + Math.cos(b) * rr, py + Math.sin(b) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  if (on('stunned')) {
    ctx.fillStyle = '#fff27a';
    for (let i = 0; i < 3; i++) {
      const a = time * 4 + (i / 3) * TAU;
      circle(ctx, x + Math.cos(a) * r * 0.8, y - r * 1.2 + Math.sin(a) * r * 0.25, 0.07);
      ctx.fill();
    }
  }
}
