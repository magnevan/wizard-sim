// Surfaces (floor), runes (floor), conjured walls, lenses, effigies and orbitals.

import { ELEMENTS, type Element } from '../spells/elements';
import { orbitalPos, runeArmed } from '../spells/vessels';
import type { Entity } from '../world/entity';
import type { World } from '../world/world';
import { rand, type Particles } from './particles';

const TAU = Math.PI * 2;

const colorsOf = (els: readonly Element[]) => (els.length ? [...new Set(els)].map((e) => ELEMENTS[e].color) : ['#f2ece0']);

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
}

/** Wobbly blob so surfaces don't look like perfect circles. */
function blob(ctx: CanvasRenderingContext2D, e: Entity, r: number): void {
  ctx.beginPath();
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * TAU;
    const rr = r * (0.9 + 0.1 * Math.sin(a * 3 + e.id * 1.7));
    const x = e.pos.x + Math.cos(a) * rr;
    const y = e.pos.y + Math.sin(a) * rr * 0.8;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function drawSurface(ctx: CanvasRenderingContext2D, e: Entity, particles: Particles): void {
  const s = e.surface!;
  const r = s.radius;
  switch (s.type) {
    case 'puddle':
      ctx.fillStyle = 'rgba(52,130,220,0.45)';
      blob(ctx, e, r);
      ctx.fill();
      ctx.strokeStyle = 'rgba(150,210,255,0.55)';
      ctx.lineWidth = 0.05;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(200,235,255,0.35)';
      ctx.beginPath();
      ctx.ellipse(e.pos.x - r * 0.25, e.pos.y - r * 0.2, r * 0.35, r * 0.12, 0, 0, TAU);
      ctx.stroke();
      break;
    case 'ice':
      ctx.fillStyle = 'rgba(200,240,255,0.55)';
      blob(ctx, e, r);
      ctx.fill();
      ctx.strokeStyle = 'rgba(240,252,255,0.9)';
      ctx.lineWidth = 0.05;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(e.pos.x - r * 0.5, e.pos.y - r * 0.1);
      ctx.lineTo(e.pos.x + r * 0.1, e.pos.y + r * 0.25);
      ctx.lineTo(e.pos.x + r * 0.45, e.pos.y - r * 0.2);
      ctx.stroke();
      break;
    case 'grass':
    case 'burning': {
      const burning = s.type === 'burning';
      ctx.fillStyle = burning ? 'rgba(90,50,20,0.6)' : 'rgba(70,130,50,0.55)';
      blob(ctx, e, r);
      ctx.fill();
      ctx.strokeStyle = burning ? '#ff9a3a' : '#8fd06a';
      ctx.lineWidth = 0.05;
      for (let i = 0; i < 14; i++) {
        const a = i * 2.4 + e.id;
        const d = r * 0.8 * ((i * 0.37) % 1);
        const x = e.pos.x + Math.cos(a) * d;
        const y = e.pos.y + Math.sin(a) * d * 0.8;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 0.05, y - 0.25);
        ctx.stroke();
      }
      if (burning && Math.random() < 0.7) {
        const a = rand(0, TAU);
        const d = rand(0, r * 0.85);
        particles.emit({ pos: { x: e.pos.x + Math.cos(a) * d, y: e.pos.y + Math.sin(a) * d * 0.8 }, vel: { x: rand(-0.2, 0.2), y: rand(-2, -1) }, life: 0.6, color: Math.random() < 0.5 ? '#ffd23a' : '#ff7a1a', size: rand(0.08, 0.16), shape: 'dot', drag: 1 });
      }
      break;
    }
  }
  if (s.surge > 0) {
    // Surface Surge: crackling lines over the whole puddle.
    ctx.strokeStyle = '#e6d8ff';
    ctx.shadowColor = '#b48cff';
    ctx.shadowBlur = 12;
    ctx.lineWidth = 0.07;
    ctx.globalAlpha = Math.min(1, s.surge / 0.25);
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      let a = rand(0, TAU);
      ctx.moveTo(e.pos.x + Math.cos(a) * r * 0.1, e.pos.y + Math.sin(a) * r * 0.1);
      for (let j = 1; j <= 4; j++) {
        a += rand(-0.7, 0.7);
        ctx.lineTo(e.pos.x + Math.cos(a) * r * (j / 4) * 0.95, e.pos.y + Math.sin(a) * r * (j / 4) * 0.75);
      }
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
  if (s.steamCd > 0.5 && Math.random() < 0.5) {
    particles.emit({ pos: { x: e.pos.x + rand(-r, r) * 0.7, y: e.pos.y + rand(-r, r) * 0.5 }, vel: { x: rand(-0.3, 0.3), y: rand(-1.2, -0.5) }, life: 0.9, color: '#eef3f7', size: rand(0.2, 0.35), shape: 'puff' });
  }
}

/** Runes on the floor: dashed trigger radius, an arming ring that closes over RUNE_ARM_TIME. */
export function drawRune(ctx: CanvasRenderingContext2D, e: Entity, time: number): void {
  const r = e.rune!;
  if (r.shape === 'effigy') return;
  const cols = colorsOf(r.elements);
  const armed = runeArmed(r, time);
  const k = Math.min(1, 1 - (r.armAt - time) / 0.8);
  ctx.lineWidth = 0.07;
  if (r.shape === 'line' && r.end) {
    ctx.strokeStyle = cols[0];
    ctx.globalAlpha = armed ? 0.75 + 0.2 * Math.sin(time * 6) : 0.35;
    ctx.setLineDash([0.3, 0.18]);
    ctx.lineDashOffset = -time * 2;
    ctx.lineWidth = 0.12;
    ctx.beginPath();
    ctx.moveTo(e.pos.x, e.pos.y);
    ctx.lineTo(r.end.x, r.end.y);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const p of [e.pos, r.end]) {
      ctx.fillStyle = cols[0];
      circle(ctx, p.x, p.y, 0.16);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return;
  }
  // Trigger radius.
  ctx.strokeStyle = cols[0];
  ctx.globalAlpha = armed ? 0.5 : 0.25;
  ctx.setLineDash([0.18, 0.14]);
  ctx.lineDashOffset = time;
  circle(ctx, e.pos.x, e.pos.y, r.radius);
  ctx.stroke();
  ctx.setLineDash([]);
  // Glyph: two rotated triangles, element colors.
  ctx.globalAlpha = armed ? 0.85 + 0.15 * Math.sin(time * 5) : 0.45;
  cols.forEach((c, i) => {
    ctx.strokeStyle = c;
    ctx.beginPath();
    for (let j = 0; j <= 3; j++) {
      const a = (j / 3) * TAU + i * (Math.PI / 3) + time * 0.6;
      const x = e.pos.x + Math.cos(a) * r.radius * 0.6;
      const y = e.pos.y + Math.sin(a) * r.radius * 0.6;
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  });
  // Arming ring closes, then glows.
  ctx.strokeStyle = armed ? '#ffffff' : '#ffd98a';
  ctx.lineWidth = 0.09;
  ctx.globalAlpha = armed ? 0.6 : 0.9;
  ctx.beginPath();
  ctx.arc(e.pos.x, e.pos.y, r.radius * 0.85, -Math.PI / 2, -Math.PI / 2 + TAU * k);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

const WALL_LOOK: Record<string, { fill: string; edge: string; top: string }> = {
  rock: { fill: '#6e4f33', edge: '#3a2716', top: '#a77b52' },
  ridge: { fill: '#5e4630', edge: '#2e2012', top: '#8a6a48' },
  ice: { fill: 'rgba(150,215,245,0.85)', edge: '#e8fbff', top: 'rgba(220,248,255,0.95)' },
  shield: { fill: 'rgba(243,211,107,0.25)', edge: '#f3d36b', top: 'rgba(255,240,180,0.6)' },
  elemental: { fill: 'rgba(255,255,255,0.15)', edge: '#ffffff', top: 'rgba(255,255,255,0.35)' },
};

export function drawWall(ctx: CanvasRenderingContext2D, e: Entity, world: World): void {
  const w = e.wall!;
  const look = WALL_LOOK[w.material];
  const left = e.expiresAt !== undefined ? e.expiresAt - world.time : 9;
  ctx.globalAlpha = Math.min(1, left / 0.4);
  ctx.lineCap = 'round';
  const tint = w.material === 'elemental' ? colorsOf(w.elements)[0] : null;
  // Body, then a lighter "top" offset upward for height.
  ctx.strokeStyle = look.edge;
  ctx.lineWidth = w.half * 2 + 0.08;
  line(ctx, w.a.x, w.a.y, w.b.x, w.b.y);
  ctx.strokeStyle = tint ?? look.fill;
  ctx.lineWidth = w.half * 2;
  line(ctx, w.a.x, w.a.y, w.b.x, w.b.y);
  const lift = w.material === 'shield' || w.material === 'elemental' ? 0 : 0.28;
  ctx.strokeStyle = look.top;
  ctx.lineWidth = w.half * 1.3;
  line(ctx, w.a.x, w.a.y - lift, w.b.x, w.b.y - lift);
  if (w.material === 'rock' || w.material === 'ridge' || w.material === 'ice') {
    // Chunks along the top so it reads as stone / ice blocks.
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    const n = Math.max(2, Math.round(len / 0.45));
    ctx.fillStyle = look.edge;
    ctx.globalAlpha *= 0.55;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const r = w.half * (0.35 + 0.2 * Math.sin(i * 2.7 + e.id));
      ctx.beginPath();
      ctx.arc(w.a.x + (w.b.x - w.a.x) * t, w.a.y + (w.b.y - w.a.y) * t - lift, r, 0, TAU);
      ctx.fill();
    }
  }
  if (w.material === 'shield' || w.material === 'elemental') {
    ctx.shadowColor = tint ?? '#f3d36b';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = tint ?? '#fff0b0';
    ctx.lineWidth = 0.05;
    line(ctx, w.a.x, w.a.y, w.b.x, w.b.y);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

export function drawLens(ctx: CanvasRenderingContext2D, e: Entity, time: number): void {
  const r = e.radius ?? 0.7;
  const { x, y } = e.pos;
  const active = time - e.lens!.primarySeenAt < 0.1;
  ctx.save();
  ctx.translate(x, y - 0.25 + 0.06 * Math.sin(time * 2.5));
  ctx.rotate(time * 0.5);
  ctx.fillStyle = active ? 'rgba(255,140,200,0.35)' : 'rgba(255,79,139,0.18)';
  ctx.strokeStyle = '#ffb3d1';
  ctx.lineWidth = 0.06;
  ctx.shadowColor = '#ff4f8b';
  ctx.shadowBlur = active ? 18 : 8;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#f3d36b';
  circle(ctx, 0, 0, r * 0.55);
  ctx.stroke();
  ctx.restore();
  ctx.shadowBlur = 0;
}

export function drawEffigy(ctx: CanvasRenderingContext2D, e: Entity, time: number): void {
  const r = e.radius!;
  const { x, y } = e.pos;
  const cols = colorsOf(e.rune?.elements ?? []);
  // Stone guardian with a glowing core in the sealed element colors.
  ctx.fillStyle = '#8b8296';
  ctx.strokeStyle = '#3b3545';
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  ctx.moveTo(x - r, y + r * 0.6);
  ctx.lineTo(x - r * 0.7, y - r * 0.9);
  ctx.lineTo(x, y - r * 1.4);
  ctx.lineTo(x + r * 0.7, y - r * 0.9);
  ctx.lineTo(x + r, y + r * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = cols[0];
  ctx.shadowColor = cols[0];
  ctx.shadowBlur = 12;
  circle(ctx, x, y - r * 0.4, r * (0.3 + 0.05 * Math.sin(time * 6)));
  ctx.fill();
  ctx.shadowBlur = 0;
  // Taunt marker.
  ctx.strokeStyle = 'rgba(255,90,90,0.6)';
  ctx.setLineDash([0.15, 0.1]);
  circle(ctx, x, y, r + 0.3 + 0.05 * Math.sin(time * 4));
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Sealed charges circling a caster, plus a staff glow for the stored spell. */
export function drawVessels(ctx: CanvasRenderingContext2D, e: Entity, time: number): void {
  const c = e.caster;
  if (!c) return;
  const n = c.orbitals.length;
  c.orbitals.forEach((o, i) => {
    const p = orbitalPos(e.pos, i, n, time);
    const cols = colorsOf(o.elements);
    ctx.fillStyle = cols[i % cols.length];
    ctx.shadowColor = cols[0];
    ctx.shadowBlur = 10;
    if (o.orbit === 'ward') {
      ctx.strokeStyle = '#f3d36b';
      ctx.lineWidth = 0.06;
      circle(ctx, p.x, p.y, 0.2);
      ctx.stroke();
    } else {
      circle(ctx, p.x, p.y, 0.15);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  });
  const ringed = (els: readonly Element[], radius: number, dash: number[]) => {
    ctx.strokeStyle = colorsOf(els)[0];
    ctx.lineWidth = 0.05;
    ctx.globalAlpha = 0.7;
    ctx.setLineDash(dash);
    ctx.lineDashOffset = -time;
    circle(ctx, e.pos.x, e.pos.y, radius);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  };
  if (c.staff) ringed(c.staff.elements, (e.radius ?? 0.45) + 0.45, c.staff.contingency ? [0.08, 0.08] : [0.3, 0.15]);
  if (c.sealArmed) {
    ctx.strokeStyle = '#ffd98a';
    ctx.lineWidth = 0.05;
    ctx.globalAlpha = 0.6 + 0.3 * Math.sin(time * 8);
    for (let i = 0; i < 4; i++) {
      const a = time * 1.5 + (i / 4) * TAU;
      ctx.beginPath();
      ctx.arc(e.pos.x, e.pos.y, (e.radius ?? 0.45) + 0.6, a, a + 0.8);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

/** A.1 Cage: a golden bubble with a hex lattice and a countdown arc. */
export function drawCage(ctx: CanvasRenderingContext2D, e: Entity, time: number): void {
  const c = e.cage!;
  const R = e.radius ?? 1;
  const { x, y } = e.pos;
  const total = Math.max(0.01, (e.expiresAt ?? time) - c.createdAt);
  const left = Math.max(0, Math.min(1, ((e.expiresAt ?? time) - time) / total));
  const grad = ctx.createRadialGradient(x - R * 0.3, y - R * 0.35, R * 0.1, x, y, R);
  grad.addColorStop(0, 'rgba(255,248,220,0.28)');
  grad.addColorStop(0.75, 'rgba(255,224,138,0.12)');
  grad.addColorStop(1, 'rgba(255,224,138,0.35)');
  ctx.fillStyle = grad;
  circle(ctx, x, y, R);
  ctx.fill();
  // Lattice: short hex bars on the rim, drifting slowly.
  ctx.strokeStyle = 'rgba(255,232,160,0.55)';
  ctx.lineWidth = 0.035;
  for (let ring = 0; ring < 2; ring++) {
    const rr = R * (ring ? 0.62 : 0.9);
    const n = ring ? 8 : 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + time * (ring ? -0.4 : 0.25);
      ctx.beginPath();
      ctx.arc(x, y, rr, a, a + (TAU / n) * 0.55);
      ctx.stroke();
    }
  }
  // Rim, flickering in the last half second.
  const flicker = left * total < 0.5 ? 0.4 + 0.6 * Math.abs(Math.sin(time * 18)) : 1;
  ctx.globalAlpha = flicker;
  ctx.strokeStyle = '#ffe08a';
  ctx.shadowColor = '#ffe08a';
  ctx.shadowBlur = 10;
  ctx.lineWidth = 0.08;
  circle(ctx, x, y, R);
  ctx.stroke();
  ctx.shadowBlur = 0;
  // Countdown arc.
  ctx.strokeStyle = '#fff6d0';
  ctx.lineWidth = 0.12;
  ctx.beginPath();
  ctx.arc(x, y, R + 0.18, -Math.PI / 2, -Math.PI / 2 + TAU * left);
  ctx.stroke();
  ctx.globalAlpha = 1;
}
