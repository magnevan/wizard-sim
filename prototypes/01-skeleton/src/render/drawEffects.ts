import { add, fromAngle, scale, type Vec2 } from '../core/vec2';
import { ELEMENTS, type Element } from '../spells/elements';
import type { EffectState } from '../spells/types';
import type { Entity } from '../world/entity';
import type { World } from '../world/world';
import { rand, type Particles } from './particles';

const TAU = Math.PI * 2;

function colorsOf(elements: readonly Element[]): string[] {
  const unique = [...new Set(elements)];
  return unique.length ? unique.map((e) => ELEMENTS[e].color) : ['#f2ece0'];
}

/** Ground-level effects drawn under bodies: zones, telegraphs, fronts. */
export function drawGroundEffect(ctx: CanvasRenderingContext2D, e: Entity, time: number, particles: Particles): void {
  const eff = e.effect!;
  const cols = colorsOf(eff.elements);
  if (eff.spec.kind === 'zone') drawZone(ctx, e, eff, cols, time);
  else if (eff.spec.kind === 'burst' && eff.age < (eff.spec.delay ?? 0)) drawTelegraph(ctx, e, eff, cols, particles);
  else if (eff.spec.kind === 'front') drawFront(ctx, e, eff, cols, particles);
}

function drawZone(ctx: CanvasRenderingContext2D, e: Entity, eff: EffectState, cols: string[], time: number): void {
  if (eff.spec.kind !== 'zone') return;
  const lantern = eff.spec.style === 'lantern';
  const col = lantern ? '#ffe08a' : cols[0];
  const fade = Math.min(1, (eff.spec.duration - eff.age) / 0.5, (eff.age + 0.05) / 0.15);
  if (lantern) {
    const g = ctx.createRadialGradient(e.pos.x, e.pos.y, 0.1, e.pos.x, e.pos.y, eff.spec.radius);
    g.addColorStop(0, 'rgba(255,236,160,0.55)');
    g.addColorStop(1, 'rgba(255,224,138,0.05)');
    ctx.globalAlpha = fade;
    ctx.fillStyle = g;
  } else {
    ctx.globalAlpha = 0.2 * fade;
    ctx.fillStyle = col;
  }
  ctx.beginPath();
  ctx.arc(e.pos.x, e.pos.y, eff.spec.radius, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.55 * fade;
  ctx.strokeStyle = col;
  ctx.lineWidth = 0.06;
  ctx.setLineDash([0.4, 0.25]);
  ctx.lineDashOffset = -time;
  ctx.stroke();
  ctx.setLineDash([]);
  if (lantern) {
    // The lantern itself, hovering.
    ctx.globalAlpha = fade;
    ctx.fillStyle = '#fff6c8';
    ctx.shadowColor = '#ffe08a';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(e.pos.x, e.pos.y - 0.6, 0.22, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}

/** Point spells with a delay: a rumble circle that fills before the eruption. */
function drawTelegraph(ctx: CanvasRenderingContext2D, e: Entity, eff: EffectState, cols: string[], particles: Particles): void {
  if (eff.spec.kind !== 'burst') return;
  const k = eff.age / (eff.spec.delay ?? 1);
  const r = eff.spec.radius;
  const jitter = eff.spec.style === 'geyser' ? rand(-0.04, 0.04) : 0;
  const { x, y } = { x: e.pos.x + jitter, y: e.pos.y };
  ctx.globalAlpha = 0.18 + 0.25 * k;
  ctx.fillStyle = cols[0];
  ctx.beginPath();
  ctx.arc(x, y, r * k, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = cols[0];
  ctx.lineWidth = 0.08;
  ctx.setLineDash([0.3, 0.2]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  // Cracks radiating out.
  ctx.lineWidth = 0.05;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + e.id;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * r * k, y + Math.sin(a) * r * k);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (eff.spec.style === 'strike') {
    // Gathering cloud above.
    particles.emit({ pos: { x: x + rand(-r, r), y: y - 2.5 + rand(-0.3, 0.3) }, vel: { x: 0, y: 0 }, life: 0.25, color: '#6a5a8a', size: 0.3, shape: 'puff' });
  } else if (Math.random() < 0.5) {
    particles.emit({ pos: { x: x + rand(-r, r) * 0.7, y: y + rand(-r, r) * 0.7 }, vel: { x: 0, y: -1 }, life: 0.3, color: cols[0], size: 0.06, shape: 'dot' });
  }
}

function drawFront(ctx: CanvasRenderingContext2D, e: Entity, eff: EffectState, cols: string[], particles: Particles): void {
  if (eff.spec.kind !== 'front') return;
  const spec = eff.spec;
  const side = { x: -eff.dir.y, y: eff.dir.x };
  const half = spec.width / 2;
  const a = add(e.pos, scale(side, -half));
  const b = add(e.pos, scale(side, half));
  // Trail along the traveled path.
  const trailStart = add(eff.start, scale(eff.dir, Math.max(0, eff.traveled - (spec.style === 'wave' ? 1.6 : 4))));
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = cols[0];
  ctx.beginPath();
  ctx.moveTo(trailStart.x + side.x * half * 0.6, trailStart.y + side.y * half * 0.6);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(a.x, a.y);
  ctx.lineTo(trailStart.x - side.x * half * 0.6, trailStart.y - side.y * half * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  if (spec.style === 'wave') {
    // Curling crest.
    ctx.strokeStyle = '#bfe6ff';
    ctx.lineWidth = 0.32;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 10; i++) {
      const s = -half + (spec.width * i) / 10;
      const bulge = 0.35 * Math.cos((s / half) * (Math.PI / 2));
      const p = add(add(e.pos, scale(side, s)), scale(eff.dir, bulge));
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.strokeStyle = cols[0];
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.6;
    ctx.stroke();
    ctx.globalAlpha = 1;
    for (let i = 0; i < 3; i++) {
      const p = add(e.pos, scale(side, rand(-half, half)));
      particles.emit({ pos: p, vel: add(scale(eff.dir, spec.speed * 0.6), { x: 0, y: rand(-1.5, -0.5) }), life: 0.35, color: '#e3f4ff', size: rand(0.06, 0.12), shape: 'dot' });
    }
    return;
  }
  ctx.strokeStyle = cols[0];
  ctx.lineWidth = spec.style === 'fault' ? 0.2 : 0.14;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  if (spec.style === 'fault') {
    // Jagged crack along the path.
    ctx.strokeStyle = '#2a1a0c';
    ctx.lineWidth = 0.08;
    ctx.beginPath();
    const n = Math.max(2, Math.floor(eff.traveled / 0.5));
    for (let i = 0; i <= n; i++) {
      const p = add(eff.start, scale(eff.dir, (eff.traveled * i) / n));
      const off = i % 2 ? 0.15 : -0.15;
      ctx.lineTo(p.x + side.x * off, p.y + side.y * off);
    }
    ctx.stroke();
    particles.emit({ pos: add(e.pos, scale(side, rand(-half, half))), vel: { x: rand(-0.5, 0.5), y: rand(-2.5, -1) }, life: 0.4, color: '#b07a45', size: rand(0.06, 0.12), shape: 'dot' });
  } else {
    particles.emit({ pos: add(e.pos, scale(side, rand(-half, half))), vel: { x: 0, y: -1 }, life: 0.35, color: cols[Math.floor(Math.random() * cols.length)], size: 0.08, shape: 'dot' });
  }
}

/** Airborne effects drawn above bodies. Sprays and beams also emit particles. */
export function drawEffect(ctx: CanvasRenderingContext2D, e: Entity, world: World, particles: Particles): void {
  const eff = e.effect!;
  const cols = colorsOf(eff.elements);
  switch (eff.spec.kind) {
    case 'projectile':
      drawProjectile(ctx, e, eff, cols, particles);
      break;
    case 'beam':
      drawBeam(ctx, eff, cols, particles);
      break;
    case 'spray':
      drawSpray(ctx, e, eff, cols, world, particles);
      break;
    case 'burst':
      if (eff.age >= (eff.spec.delay ?? 0)) drawBurst(ctx, e, eff, cols, particles);
      break;
    case 'swing':
      drawSwing(ctx, e, eff, cols);
      break;
    case 'arc':
      drawArc(ctx, eff, particles);
      break;
    case 'tether':
      drawTether(ctx, e, eff, world);
      break;
  }
}

function drawProjectile(ctx: CanvasRenderingContext2D, e: Entity, eff: EffectState, cols: string[], particles: Particles): void {
  const r = e.radius!;
  const isRock = eff.elements.includes('earth');
  if (eff.spec.style === 'hex') {
    // Enemy caster bolt: a sickly green orb with a dark core and a trail.
    particles.emit({ pos: { ...e.pos }, vel: { x: rand(-0.4, 0.4), y: rand(-0.4, 0.4) }, life: 0.45, color: '#9cff6b', size: r * 0.7, shape: 'puff', drag: 1 });
    ctx.fillStyle = '#9cff6b';
    ctx.shadowColor = '#9cff6b';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(e.pos.x, e.pos.y, r, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#16220f';
    ctx.beginPath();
    ctx.arc(e.pos.x, e.pos.y, r * 0.45, 0, TAU);
    ctx.fill();
    return;
  }
  particles.emit({ pos: { ...e.pos }, vel: { x: rand(-0.3, 0.3), y: rand(-0.3, 0.3) }, life: 0.3, color: cols[cols.length - 1], size: r * 0.6, shape: 'dot' });
  if (eff.pierce) {
    ctx.strokeStyle = '#ffd98a';
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    ctx.arc(e.pos.x, e.pos.y, r + 0.12, 0, TAU);
    ctx.stroke();
  }
  if (isRock) {
    ctx.fillStyle = ELEMENTS.earth.color;
    ctx.strokeStyle = '#5a3a1c';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + eff.age * 6;
      const rr = r * (0.85 + 0.15 * Math.sin(i * 2.3));
      ctx.lineTo(e.pos.x + Math.cos(a) * rr, e.pos.y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    // Shard: elongated diamond along flight direction.
    const a = Math.atan2(eff.dir.y, eff.dir.x);
    ctx.save();
    ctx.translate(e.pos.x, e.pos.y);
    ctx.rotate(a);
    ctx.fillStyle = cols[0];
    ctx.beginPath();
    ctx.moveTo(r * 2.2, 0);
    ctx.lineTo(0, r * 0.8);
    ctx.lineTo(-r * 1.4, 0);
    ctx.lineTo(0, -r * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function strokePath(ctx: CanvasRenderingContext2D, path: Vec2[]): void {
  ctx.beginPath();
  path.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
}

function drawBeam(ctx: CanvasRenderingContext2D, eff: EffectState, cols: string[], particles: Particles): void {
  if (eff.spec.kind !== 'beam' || !eff.path || eff.path.length < 2) return;
  const w0 = eff.spec.width * (1 + 0.15 * Math.sin(eff.age * 30));
  const path = eff.path;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Each segment after a lens is drawn wider (boost).
  for (let s = 0; s < path.length - 1; s++) {
    const seg = [path[s], path[s + 1]];
    const w = s === 0 ? w0 : w0 * (eff.boost ?? 1);
    ctx.shadowBlur = 16;
    cols.forEach((c, i) => {
      ctx.shadowColor = c;
      ctx.strokeStyle = c;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = w * (1.6 - (i / cols.length) * 0.8);
      strokePath(ctx, seg);
    });
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = w * 0.35;
    strokePath(ctx, seg);
  }
  const end = path[path.length - 1];
  ctx.fillStyle = cols[0];
  ctx.beginPath();
  ctx.arc(end.x, end.y, w0 * 1.3 * (eff.boost ?? 1), 0, TAU);
  ctx.fill();
  if (Math.random() < 0.6) particles.burst(end, cols[Math.floor(Math.random() * cols.length)], 1, 3, 0.06, 0.3);
}

function drawSpray(ctx: CanvasRenderingContext2D, e: Entity, eff: EffectState, cols: string[], world: World, particles: Particles): void {
  if (eff.spec.kind !== 'spray') return;
  const owner = world.get(eff.ownerId);
  const facing = Math.atan2(eff.dir.y, eff.dir.x);
  const range = eff.reach;
  const half = eff.spec.halfAngle;
  // Faint cone so the hit area reads clearly.
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = cols[0];
  ctx.beginPath();
  ctx.moveTo(e.pos.x, e.pos.y);
  ctx.arc(e.pos.x, e.pos.y, range, facing - half, facing + half);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  const start = add(e.pos, fromAngle(facing, (owner?.radius ?? 0) + 0.15));
  for (let i = 0; i < 4; i++) {
    const a = facing + rand(-half, half) * 0.9;
    const speed = range * rand(2.2, 3.2);
    const steam = eff.elements.includes('steam');
    particles.emit({
      pos: { ...start },
      vel: fromAngle(a, speed),
      life: range / speed,
      color: cols[Math.floor(Math.random() * cols.length)],
      size: steam ? rand(0.12, 0.22) : rand(0.06, 0.12),
      shape: steam ? 'puff' : 'dot',
      drag: 0,
    });
  }
}

function drawBurst(ctx: CanvasRenderingContext2D, e: Entity, eff: EffectState, cols: string[], particles: Particles): void {
  if (eff.spec.kind !== 'burst') return;
  const t = eff.age - (eff.spec.delay ?? 0);
  const fade = t <= eff.spec.duration ? 1 : Math.max(0, 1 - (t - eff.spec.duration) / 0.25);
  const r = Math.max(0.01, eff.reach);
  const style = eff.spec.style;
  if (style === 'strike' && t < 0.15) {
    // Bolt from above.
    ctx.strokeStyle = '#f3ecff';
    ctx.shadowColor = '#b48cff';
    ctx.shadowBlur = 20;
    ctx.lineWidth = 0.14;
    ctx.beginPath();
    let x = e.pos.x + rand(-0.3, 0.3);
    ctx.moveTo(x, e.pos.y - 9);
    for (let y = e.pos.y - 8; y < e.pos.y; y += 1) {
      x = e.pos.x + rand(-0.35, 0.35);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(e.pos.x, e.pos.y);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  if ((style === 'geyser' || style === 'spikes') && t < eff.spec.duration) {
    // Column / spikes erupting.
    for (let i = 0; i < 3; i++) {
      const a = rand(0, TAU);
      const d = rand(0, r);
      particles.emit({ pos: { x: e.pos.x + Math.cos(a) * d, y: e.pos.y + Math.sin(a) * d }, vel: { x: rand(-1, 1), y: rand(-6, -3) }, life: 0.5, color: cols[i % cols.length], size: rand(0.1, 0.2), shape: style === 'geyser' ? 'puff' : 'dot', drag: 1.5 });
    }
    if (style === 'spikes') {
      ctx.fillStyle = cols[0];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU + e.id;
        const px = e.pos.x + Math.cos(a) * r * 0.6;
        const py = e.pos.y + Math.sin(a) * r * 0.6;
        ctx.beginPath();
        ctx.moveTo(px - 0.15, py);
        ctx.lineTo(px, py - 0.8 * fade);
        ctx.lineTo(px + 0.15, py);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 0.18 * fade;
  ctx.fillStyle = cols[0];
  ctx.beginPath();
  ctx.arc(e.pos.x, e.pos.y, r, 0, TAU);
  ctx.fill();
  cols.forEach((c, i) => {
    ctx.globalAlpha = 0.9 * fade;
    ctx.strokeStyle = c;
    ctx.lineWidth = 0.18;
    ctx.beginPath();
    ctx.arc(e.pos.x, e.pos.y, Math.max(0.01, r - i * 0.22), 0, TAU);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

function drawSwing(ctx: CanvasRenderingContext2D, e: Entity, eff: EffectState, cols: string[]): void {
  if (eff.spec.kind !== 'swing') return;
  const facing = Math.atan2(eff.dir.y, eff.dir.x);
  const k = Math.min(1, eff.age / 0.12);
  const half = eff.spec.halfAngle;
  ctx.globalAlpha = 0.85 * (1 - eff.age / 0.22);
  ctx.strokeStyle = eff.elements.length ? cols[0] : '#f2ece0';
  ctx.lineWidth = eff.spec.style === 'whip' ? 0.1 : 0.22;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(e.pos.x, e.pos.y, eff.spec.range * 0.85, facing - half, facing - half + 2 * half * k);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawArc(ctx: CanvasRenderingContext2D, eff: EffectState, particles: Particles): void {
  const path = eff.path;
  if (!path || path.length < 2) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [w, col, blur] of [[0.18, '#b48cff', 14], [0.06, '#f6f0ff', 0]] as const) {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.shadowColor = '#b48cff';
    ctx.shadowBlur = blur;
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      // Zig-zag between links.
      for (let j = 1; j < 5; j++) {
        const t = j / 5;
        ctx.lineTo(a.x + (b.x - a.x) * t + rand(-0.18, 0.18), a.y + (b.y - a.y) * t + rand(-0.18, 0.18));
      }
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  if (Math.random() < 0.5) particles.burst(path[path.length - 1], '#d9c4ff', 2, 3, 0.05, 0.25);
}

function drawTether(ctx: CanvasRenderingContext2D, e: Entity, eff: EffectState, world: World): void {
  const owner = world.get(eff.ownerId);
  if (!owner) return;
  ctx.strokeStyle = '#ff4f8b';
  ctx.shadowColor = '#ff4f8b';
  ctx.shadowBlur = 12;
  ctx.lineWidth = 0.1;
  ctx.setLineDash([0.25, 0.12]);
  ctx.lineDashOffset = eff.age * 6;
  ctx.beginPath();
  ctx.moveTo(owner.pos.x, owner.pos.y);
  ctx.lineTo(e.pos.x, e.pos.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
}
