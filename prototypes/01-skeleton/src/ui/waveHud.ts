import { GamepadController } from '../game/gamepad';
import type { Sim } from '../game/sim';
import { wavePlan } from '../rooms/waves';
import { ARCHETYPES } from '../world/archetypes';
import type { World } from '../world/world';
import type { Camera } from '../render/camera';
import { panel, text } from './draw';

const PHASE_COLOR = { lull: '#9fd3ff', wave: '#ff7a5a', breather: '#8ff09a' } as const;

/** Top-centre wave panel: number, phase, countdown, the coming mix, and the sealed-spell stat. */
export function drawWaveBanner(ctx: CanvasRenderingContext2D, w: number, world: World): void {
  const enc = world.encounter;
  if (!enc) return;
  const lines: [string, string][] = [];
  let title: string;
  let big = '';
  if (enc.phase === 'lull') {
    title = `WAVE ${enc.wave}  ·  LULL`;
    big = `${Math.ceil(Math.max(0, enc.timer))}s`;
    lines.push([wavePlan(enc.wave).groups.map((g) => `${ARCHETYPES[g.archetype].name} x${g.count}`).join('  ·  '), '#ffffff']);
    lines.push(['Portals are open. Prepare: runes, tripwires, orbitals, stored spells, walls.', '#a59fb5']);
  } else if (enc.phase === 'wave') {
    const left = world.entities.filter((e) => e.kind === 'enemy' && !e.removed).length + enc.portals.reduce((n, p) => n + p.left, 0);
    title = `WAVE ${enc.wave}`;
    big = `${left} left`;
    lines.push([`sealed spells fired so far: ${world.sealedFired - enc.firedAtLull}`, '#ffd98a']);
  } else {
    title = `WAVE ${enc.wave} CLEARED`;
    big = `${Math.ceil(Math.max(0, enc.timer))}s`;
    lines.push(['Breather: the fallen return.', '#a59fb5']);
  }
  const r = enc.last;
  if (r) {
    const what = r.wiped ? `Wave ${r.wave} wiped` : `Wave ${r.wave}`;
    lines.push([`${what}: ${r.sealedFired} sealed spell${r.sealedFired === 1 ? '' : 's'} released / triggered  ·  ${r.sealedInLull} sealed in the lull`, '#ffd98a']);
  }

  const pw = 520;
  const ph = 52 + lines.length * 18;
  const x = w / 2 - pw / 2;
  panel(ctx, x, 12, pw, ph);
  ctx.fillStyle = PHASE_COLOR[enc.phase];
  ctx.fillRect(x + 1, 13, pw - 2, 3);
  text(ctx, title, x + 16, 42, { size: 20, weight: 900, color: PHASE_COLOR[enc.phase] });
  text(ctx, big, x + pw - 16, 46, { size: 32, weight: 900, align: 'right', color: '#ffffff' });
  lines.forEach(([s, color], i) => text(ctx, s, x + 16, 66 + i * 18, { size: 12, weight: 600, color }));
}

export function drawJoinHint(ctx: CanvasRenderingContext2D, w: number, sim: Sim): void {
  if (sim.players.length >= 4) return;
  const pads = sim.players.some((p) => p.controller instanceof GamepadController);
  const msg = `${pads ? 'Another gamepad? ' : ''}Press any button on a gamepad to join  ·  K: dev ally`;
  text(ctx, msg, w - 16, 92, { size: 12, weight: 600, align: 'right', color: '#8a84a0' });
}

/** Off-screen portals: an arrow at the screen edge pointing at each one. */
export function drawPortalArrows(ctx: CanvasRenderingContext2D, w: number, h: number, world: World, camera: Camera): void {
  const enc = world.encounter;
  if (!enc) return;
  for (const p of enc.portals) {
    if (enc.phase !== 'lull' && p.left <= 0) continue;
    const s = camera.worldToScreen(p.pos);
    const m = 40;
    if (s.x > m && s.x < w - m && s.y > m && s.y < h - m) continue;
    const c = { x: w / 2, y: h / 2 };
    const d = { x: s.x - c.x, y: s.y - c.y };
    const k = Math.min((w / 2 - m) / Math.abs(d.x || 1e-6), (h / 2 - m) / Math.abs(d.y || 1e-6));
    const at = { x: c.x + d.x * k, y: c.y + d.y * k };
    const a = Math.atan2(d.y, d.x);
    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.rotate(a);
    ctx.fillStyle = ARCHETYPES[p.archetype].color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-8, -11);
    ctx.lineTo(-8, 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
