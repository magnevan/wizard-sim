// Enemy bodies, their wind-up telegraphs (ground layer) and wave portals.

import { add, angleOf, dist, fromAngle, normalize, sub } from '../core/vec2';
import type { Encounter } from '../rooms/waves';
import { ARCHETYPES } from '../world/archetypes';
import type { EnemyAi, Entity } from '../world/entity';
import type { World } from '../world/world';

const TAU = Math.PI * 2;

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
}

const aiOf = (e: Entity): EnemyAi | null => (e.ai?.kind === 'enemy' ? e.ai : null);

/** Warning shapes on the floor while an enemy winds up (0.6-1.2 s). */
export function drawEnemyTelegraph(ctx: CanvasRenderingContext2D, e: Entity, time: number): void {
  const ai = aiOf(e);
  if (!ai) return;
  const def = ARCHETYPES[ai.archetype];
  const k = Math.min(1, ai.t / def.windup);
  const { x, y } = e.pos;
  const f = e.facing ?? 0;
  const r = e.radius ?? 0.4;

  if (ai.state === 'grab') {
    ctx.strokeStyle = 'rgba(127,232,224,0.8)';
    ctx.lineWidth = 0.08;
    ctx.setLineDash([0.15, 0.1]);
    circle(ctx, x, y, r + 0.3 + 0.05 * Math.sin(time * 12));
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }
  if (ai.state !== 'windup') return;

  switch (def.attack) {
    case 'melee':
      ctx.fillStyle = `rgba(255,60,60,${0.15 + 0.4 * k})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, r + def.reach + 0.45, f - 0.75, f + 0.75);
      ctx.closePath();
      ctx.fill();
      break;
    case 'slam': {
      const at = ai.lock ?? e.pos;
      const R = def.slamRadius!;
      ctx.fillStyle = `rgba(255,70,40,${0.1 + 0.15 * k})`;
      circle(ctx, at.x, at.y, R);
      ctx.fill();
      ctx.fillStyle = `rgba(255,90,50,${0.25 + 0.3 * k})`;
      circle(ctx, at.x, at.y, R * k);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,120,80,${0.6 + 0.4 * Math.abs(Math.sin(time * 14))})`;
      ctx.lineWidth = 0.09;
      circle(ctx, at.x, at.y, R);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,120,80,0.35)';
      ctx.lineWidth = 0.06;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(at.x, at.y);
      ctx.stroke();
      break;
    }
    case 'bolt': {
      const at = ai.lock ?? e.pos;
      const dir = normalize(sub(at, e.pos));
      const end = add(e.pos, { x: dir.x * Math.min(def.bolt!.range, dist(at, e.pos) + 2), y: dir.y * Math.min(def.bolt!.range, dist(at, e.pos) + 2) });
      ctx.strokeStyle = `rgba(156,255,107,${0.25 + 0.55 * k})`;
      ctx.lineWidth = 0.05 + 0.08 * k;
      ctx.setLineDash([0.3, 0.2]);
      ctx.lineDashOffset = -time * 3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case 'grab': {
      const at = ai.lock ?? e.pos;
      const a = angleOf(sub(at, e.pos));
      const L = def.grab!.dashSpeed * def.grab!.dashTime;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillStyle = 'rgba(127,232,224,0.12)';
      ctx.fillRect(0, -0.45, L, 0.9);
      ctx.fillStyle = `rgba(127,232,224,${0.25 + 0.45 * k})`;
      ctx.fillRect(0, -0.45, L * k, 0.9);
      ctx.beginPath();
      ctx.moveTo(L, -0.7);
      ctx.lineTo(L + 0.8, 0);
      ctx.lineTo(L, 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
  }
}

export function drawEnemy(ctx: CanvasRenderingContext2D, e: Entity, time: number): void {
  const ai = aiOf(e);
  if (!ai) return;
  const def = ARCHETYPES[ai.archetype];
  const r = e.radius!;
  const { x, y } = e.pos;
  const f = e.facing ?? 0;
  const k = ai.state === 'windup' ? Math.min(1, ai.t / def.windup) : 0;
  const side = (s: number, d: number, along = 0) => ({ x: x + Math.cos(f + Math.PI / 2) * s * d + Math.cos(f) * along, y: y + Math.sin(f + Math.PI / 2) * s * d + Math.sin(f) * along });

  switch (ai.archetype) {
    case 'brute':
      // Fists, raised while winding up the slam.
      for (const s of [-1, 1]) {
        const p = side(s, r * 0.95, r * (0.35 - 0.4 * k));
        ctx.fillStyle = '#5e2c1c';
        circle(ctx, p.x, p.y - k * 0.5, r * 0.38);
        ctx.fill();
      }
      body(ctx, x, y, r, def.color, '#3a170c');
      for (const s of [-1, 1]) {
        const hx = x + s * r * 0.55;
        const hy = y - r * 0.55;
        ctx.fillStyle = '#e8d8b0';
        ctx.beginPath();
        ctx.moveTo(hx - 0.12, hy + 0.05);
        ctx.lineTo(hx + s * 0.28, hy - r * 0.6);
        ctx.lineTo(hx + 0.12, hy + 0.05);
        ctx.fill();
      }
      eyes(ctx, x, y, r * 0.7, f, '#ffcc66');
      break;
    case 'shieldbearer': {
      body(ctx, x, y, r, def.color, '#232c40');
      eyes(ctx, x, y, r, f, '#ffffff');
      const flash = time - (e.blockedAt ?? -9) < 0.15;
      const arc = def.shield!.halfArc;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#2a2a2a';
      ctx.lineWidth = 0.34;
      ctx.beginPath();
      ctx.arc(x, y, r + 0.2, f - arc, f + arc);
      ctx.stroke();
      ctx.strokeStyle = flash ? '#ffffff' : '#d9c27a';
      ctx.lineWidth = 0.24;
      ctx.beginPath();
      ctx.arc(x, y, r + 0.2, f - arc, f + arc);
      ctx.stroke();
      if (ai.state === 'windup') {
        ctx.strokeStyle = `rgba(255,80,60,${k})`;
        ctx.lineWidth = 0.08;
        ctx.beginPath();
        ctx.arc(x, y, r + 0.42, f - arc, f + arc);
        ctx.stroke();
      }
      break;
    }
    case 'caster': {
      // Hooded robe with a glowing orb that swells during the wind-up.
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.moveTo(x, y - r * 1.5);
      ctx.quadraticCurveTo(x + r * 1.2, y, x + r, y + r * 0.8);
      ctx.lineTo(x - r, y + r * 0.8);
      ctx.quadraticCurveTo(x - r * 1.2, y, x, y - r * 1.5);
      ctx.fill();
      ctx.strokeStyle = '#1d3a26';
      ctx.lineWidth = 0.05;
      ctx.stroke();
      ctx.fillStyle = '#0d1a10';
      circle(ctx, x, y - r * 0.35, r * 0.45);
      ctx.fill();
      ctx.fillStyle = '#9cff6b';
      for (const s of [-1, 1]) {
        circle(ctx, x + s * r * 0.17, y - r * 0.4, r * 0.09);
        ctx.fill();
      }
      const orb = add(e.pos, fromAngle(f, r + 0.25));
      ctx.fillStyle = '#9cff6b';
      ctx.shadowColor = '#9cff6b';
      ctx.shadowBlur = 10;
      circle(ctx, orb.x, orb.y, 0.1 + 0.2 * k);
      ctx.fill();
      ctx.shadowBlur = 0;
      break;
    }
    case 'grabber': {
      const reach = ai.state === 'grab' ? 0.55 : ai.state === 'dash' ? 1.0 : 0.45 + 0.35 * k;
      ctx.strokeStyle = '#1c4f4b';
      ctx.lineWidth = 0.14;
      ctx.lineCap = 'round';
      for (const s of [-1, 1]) {
        const a = side(s, r * 0.7);
        const b = side(s, ai.state === 'grab' ? r * 0.35 : r * 0.9, r + reach);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.fillStyle = '#7fe8e0';
        circle(ctx, b.x, b.y, 0.11);
        ctx.fill();
      }
      body(ctx, x, y, r, def.color, '#123b38');
      eyes(ctx, x, y, r, f, '#e0fffb');
      break;
    }
    case 'imp': {
      for (let i = 0; i < 3; i++) {
        const fx = x + (i - 1) * r * 0.5;
        const h = r * (1.1 + 0.4 * Math.sin(time * 16 + i * 2 + e.id));
        ctx.fillStyle = i === 1 ? '#ffd23a' : '#ff7a1a';
        ctx.beginPath();
        ctx.moveTo(fx - r * 0.3, y - r * 0.3);
        ctx.quadraticCurveTo(fx, y - r * 0.3 - h, fx + r * 0.3, y - r * 0.3);
        ctx.fill();
      }
      body(ctx, x, y, r, def.color, '#7a2408');
      eyes(ctx, x, y, r, f, '#fff4b0');
      break;
    }
    default: {
      // Swarmer: a wobbling blob.
      const wob = Math.sin(time * 9 + e.id) * 0.07;
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.ellipse(x, y, r * (1 + wob), r * (1 - wob), 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#4a1a30';
      ctx.lineWidth = 0.05;
      ctx.stroke();
      eyes(ctx, x, y, r, f, '#ffffff');
    }
  }
}

function body(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, edge: string): void {
  ctx.fillStyle = fill;
  circle(ctx, x, y, r);
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 0.07;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  circle(ctx, x - r * 0.3, y - r * 0.35, r * 0.3);
  ctx.fill();
}

function eyes(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, f: number, white: string): void {
  for (const s of [-1, 1]) {
    const ex = x + Math.cos(f) * r * 0.35 + Math.cos(f + Math.PI / 2) * s * r * 0.33;
    const ey = y + Math.sin(f) * r * 0.35 + Math.sin(f + Math.PI / 2) * s * r * 0.33 - r * 0.1;
    ctx.fillStyle = white;
    circle(ctx, ex, ey, r * 0.2);
    ctx.fill();
    ctx.fillStyle = '#140a0c';
    circle(ctx, ex + Math.cos(f) * r * 0.08, ey + Math.sin(f) * r * 0.08, r * 0.1);
    ctx.fill();
  }
}

/** Portals: visible through the whole lull (with a countdown), then they spill the wave. */
export function drawPortals(ctx: CanvasRenderingContext2D, enc: Encounter, time: number): void {
  for (const p of enc.portals) {
    if (enc.phase !== 'lull' && p.left <= 0) continue;
    const def = ARCHETYPES[p.archetype];
    const { x, y } = p.pos;
    const R = 1.1 + 0.15 * Math.sin(time * 4);
    const g = ctx.createRadialGradient(x, y, 0.1, x, y, R + 0.4);
    g.addColorStop(0, 'rgba(10,6,20,0.95)');
    g.addColorStop(0.6, def.color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    circle(ctx, x, y, R + 0.4);
    ctx.fill();
    ctx.strokeStyle = '#c9a6ff';
    ctx.lineWidth = 0.07;
    for (let i = 0; i < 3; i++) {
      const a = time * 1.8 + (i * TAU) / 3;
      ctx.beginPath();
      ctx.arc(x, y, R * 0.75, a, a + 1.2);
      ctx.stroke();
    }
    if (enc.phase === 'lull') {
      // Countdown ring: fills as the wave approaches.
      const left = Math.max(0, enc.timer);
      ctx.strokeStyle = left < 3 ? '#ff6a4a' : '#ffd98a';
      ctx.lineWidth = 0.12;
      ctx.beginPath();
      ctx.arc(x, y, R + 0.45, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, left / 10));
      ctx.stroke();
    }
    ctx.font = '800 0.5px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 0.12;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    const label = `${def.name} x${p.left}${enc.phase === 'lull' ? `  ${Math.ceil(Math.max(0, enc.timer))}s` : ''}`;
    ctx.strokeText(label, x, y - R - 0.75);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, x, y - R - 0.75);
  }
}

/** Ring around a player held by a grabber. */
export function drawGrabbed(ctx: CanvasRenderingContext2D, world: World, e: Entity, time: number): void {
  const g = world.get(e.grabbedBy);
  if (!g) return;
  ctx.strokeStyle = '#7fe8e0';
  ctx.lineWidth = 0.1;
  ctx.beginPath();
  ctx.moveTo(g.pos.x, g.pos.y);
  ctx.lineTo(e.pos.x, e.pos.y);
  ctx.stroke();
  ctx.setLineDash([0.12, 0.1]);
  ctx.lineDashOffset = time * 2;
  circle(ctx, e.pos.x, e.pos.y, (e.radius ?? 0.4) + 0.25);
  ctx.stroke();
  ctx.setLineDash([]);
}
