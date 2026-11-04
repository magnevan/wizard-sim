import { PLAYER } from '../config';
import { KEYBOARD_MODE_LABELS } from '../game/controllers';
import type { PlayerSlot } from '../game/players';
import type { Sim } from '../game/sim';
import type { Camera } from '../render/camera';
import { respawnBlocked } from '../rooms/waves';
import { ELEMENTS, type Element } from '../spells/elements';
import { QUEUE_MAX, type AddOutcome } from '../spells/queue';
import { pointAim } from '../spells/targeting';
import { rulesLabel } from '../spells/tree';
import type { CastMode } from '../spells/types';
import { ORBITAL_CAP, RUNE_CAP, runesOf } from '../spells/vessels';
import { STATUS_DEFS, type StatusId } from '../statuses/defs';
import type { Entity } from '../world/entity';
import { keyLabel, panel, text } from './draw';
import { drawJoinHint, drawPortalArrows, drawWaveBanner } from './waveHud';

const GEM_R = 25;
const GEM_GAP = 62;

const MODE_HINTS: [CastMode, string][] = [
  ['force', 'Force'],
  ['area', 'Area'],
  ['self', 'Self'],
  ['weapon', 'Weapon'],
  ['point', 'Point'],
];

export function describeOutcome(o: AddOutcome): string | null {
  const n = (e: Element) => ELEMENTS[e].name;
  switch (o.kind) {
    case 'queued':
      return null;
    case 'combined':
      return `${n(o.element)} + ${n(o.with)} = ${n(o.into)}`;
    case 'cancelled':
      return `${n(o.element)} cancels ${n(o.with)}`;
    case 'full':
      return 'Queue full';
  }
}

export function drawHud(ctx: CanvasRenderingContext2D, w: number, h: number, sim: Sim, camera?: Camera): void {
  const n = sim.players.length;
  sim.players.forEach((slot, i) => {
    const e = sim.world.get(slot.entityId);
    if (!e) return;
    if (camera && slot.controller.reticle && !e.downed) drawReticle(ctx, camera, e, slot.color);
    drawPlayerCard(ctx, e, slot.color, 16, 16 + i * 84, slot.index, sim);
    const cx = (w * (2 * i + 1)) / (2 * n);
    drawQueue(ctx, e, slot, cx, h - 92, Math.min(560, w / n - 16), sim);
    if (e.downed) {
      const msg = respawnBlocked(sim.world.encounter) ? `P${slot.index + 1} is down until the wave ends` : `P${slot.index + 1} respawning in ${Math.max(0, e.player!.respawnIn ?? 0).toFixed(1)}s`;
      text(ctx, msg, w / 2, h / 2 - 40 + i * 34, { size: 24, weight: 800, align: 'center', color: slot.color });
    }
  });
  drawRoomInfo(ctx, w, sim);
  drawWaveBanner(ctx, w, sim.world);
  drawJoinHint(ctx, w, sim);
  if (camera) drawPortalArrows(ctx, w, h, sim.world, camera);
}

/** Gamepad aim: a crosshair at the aim point, in the player's color. */
function drawReticle(ctx: CanvasRenderingContext2D, camera: Camera, e: Entity, color: string): void {
  const p = camera.worldToScreen(e.caster!.aim);
  const o = camera.worldToScreen(e.pos);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.moveTo(o.x, o.y);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    ctx.moveTo(p.x + dx * 7, p.y + dy * 7);
    ctx.lineTo(p.x + dx * 18, p.y + dy * 18);
  }
  ctx.stroke();
}

/** One line of vessel state: staff slot, runes, orbitals, loaded blow, conjured weapon. */
function vesselLine(e: Entity, sim: Sim): string {
  const c = e.caster!;
  const els = (xs: readonly Element[]) => xs.map((x) => ELEMENTS[x].glyph).join('');
  const parts = [
    `Staff ${c.staff ? `[${els(c.staff.elements)}]${c.staff.contingency ? ' contingency' : ''}` : '[ ]'}`,
    `Runes ${runesOf(sim.world, e.id).length}/${RUNE_CAP}`,
    `Orbitals ${c.orbitals.length}/${ORBITAL_CAP}`,
  ];
  if (c.loaded) parts.push(`Loaded [${els(c.loaded.elements)}]`);
  if (c.conjured) parts.push(`${c.conjured.kind === 'iceblade' ? 'Ice blade' : 'Whip'} ${Math.max(0, c.conjured.until - sim.world.time).toFixed(0)}s`);
  return parts.join('  ·  ');
}

function drawPlayerCard(ctx: CanvasRenderingContext2D, e: Entity, color: string, x: number, y: number, index: number, sim: Sim): void {
  const bw = 300;
  panel(ctx, x, y, bw + 20, 74);
  text(ctx, vesselLine(e, sim), x + 10, y + 66, { size: 11, weight: 600, color: '#ffd98a' });
  text(ctx, `P${index + 1}`, x + 10, y + 20, { size: 14, weight: 800, color });
  const hp = Math.max(0, e.hp ?? 0);
  const max = e.maxHp ?? PLAYER.hp;
  ctx.fillStyle = '#2a2433';
  ctx.fillRect(x + 40, y + 9, bw - 30, 14);
  ctx.fillStyle = hp / max > 0.3 ? '#5ee26a' : '#e0525a';
  ctx.fillRect(x + 40, y + 9, (bw - 30) * (hp / max), 14);
  text(ctx, `${Math.ceil(hp)} / ${max}`, x + 40 + (bw - 30) / 2, y + 20, { size: 11, weight: 700, align: 'center', color: '#0d0b12' });

  // Status chips.
  let cx = x + 10;
  const ids = Object.keys(e.statuses ?? {}) as StatusId[];
  if (e.ward) cx += chip(ctx, 'Ward', '#f3d36b', cx, y + 32) + 6;
  for (const id of ids) {
    const s = e.statuses![id]!;
    const label = STATUS_DEFS[id].buff ? `${STATUS_DEFS[id].label}${id === 'stoneskin' ? ` ${Math.ceil(e.armor ?? 0)}` : ''} ${Math.ceil(s.remaining)}s` : STATUS_DEFS[id].label;
    cx += chip(ctx, label, STATUS_DEFS[id].color, cx, y + 32) + 6;
  }
  if (!ids.length && !e.ward) text(ctx, 'no statuses', cx, y + 44, { size: 11, color: '#6f6880' });
}

function chip(ctx: CanvasRenderingContext2D, label: string, color: string, x: number, y: number): number {
  ctx.font = `700 11px system-ui, sans-serif`;
  const w = ctx.measureText(label).width + 12;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  ctx.roundRect(x, y, w, 16, 8);
  ctx.fill();
  ctx.globalAlpha = 1;
  text(ctx, label, x + 6, y + 12, { size: 11, weight: 700, color });
  return w;
}

function drawQueue(ctx: CanvasRenderingContext2D, e: Entity, slot: PlayerSlot, cx: number, cy: number, pw: number, sim: Sim): void {
  const c = e.caster!;
  const q = c.queue.elements;
  const t = sim.world.time;
  const gap = Math.min(GEM_GAP, (pw - 220) / (QUEUE_MAX - 1));
  const left = cx - ((QUEUE_MAX - 1) * gap) / 2;
  const labels = slot.controller.modeLabels ?? KEYBOARD_MODE_LABELS;
  const hint = pw < 520 ? 11 : 13;

  panel(ctx, cx - pw / 2, cy - GEM_R - 14, pw, GEM_R * 2 + 74);
  ctx.fillStyle = slot.color;
  ctx.fillRect(cx - pw / 2 + 1, cy - GEM_R - 13, pw - 2, 3);

  if (c.sealArmed) {
    const bx = cx - pw / 2;
    ctx.fillStyle = '#ffd98a';
    ctx.beginPath();
    ctx.roundRect(bx + 10, cy - 12, 92, 24, 6);
    ctx.fill();
    text(ctx, 'SEAL armed', bx + 56, cy + 5, { size: 13, weight: 900, align: 'center', color: '#1a1408' });
  }

  for (let i = 0; i < QUEUE_MAX; i++) {
    const x = left + i * gap;
    const el = q[i];
    ctx.beginPath();
    ctx.arc(x, cy, GEM_R, 0, Math.PI * 2);
    if (el) {
      const col = ELEMENTS[el].color;
      const grad = ctx.createRadialGradient(x - 8, cy - 8, 3, x, cy, GEM_R);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.25, col);
      grad.addColorStop(1, shade(col));
      ctx.fillStyle = grad;
      ctx.shadowColor = col;
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.shadowBlur = 0;
      text(ctx, ELEMENTS[el].glyph, x, cy + 1, { size: 18, weight: 900, align: 'center', baseline: 'middle', color: 'rgba(10,8,16,0.85)' });
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // Feedback on the last keypress (combine / cancel / full), fading out.
  const lo = c.lastOutcome;
  const msg = lo && t - lo.at < 1.2 ? describeOutcome(lo.outcome) : null;
  if (msg) {
    ctx.globalAlpha = Math.min(1, 1.2 - (t - lo!.at));
    text(ctx, msg, cx, cy - GEM_R - 24, { size: 16, weight: 800, align: 'center', color: lo!.outcome.kind === 'combined' ? '#ffffff' : '#ffb0b0' });
    ctx.globalAlpha = 1;
  }

  // Active cast + wind-up bar.
  const a = c.active;
  if (a) {
    const charging = a.phase === 'charge' && a.spec.charge;
    const k = a.phase === 'windup' ? Math.min(1, a.t / Math.max(0.01, a.spec.castTime)) : charging ? Math.min(1, a.t / a.spec.charge!.maxTime) : 1;
    const bw = 180;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(cx - bw / 2, cy - GEM_R - 50, bw, 5);
    ctx.fillStyle = a.phase === 'recovery' ? '#8a8499' : charging ? (k >= 1 ? '#ffd98a' : '#d9b98a') : '#ffffff';
    ctx.fillRect(cx - bw / 2, cy - GEM_R - 50, bw * k, 5);
    const suffix = a.phase === 'channel' ? ' (hold)' : charging ? (k >= 1 ? ' FULL - release!' : ' (charging)') : '';
    text(ctx, `${a.spec.name}${suffix}`, cx, cy - GEM_R - 56, { size: 13, weight: 700, align: 'center' });
  }

  // What each cast mode would produce with the current queue (Point: with what's under the cursor).
  const y = cy + GEM_R + 22;
  if (q.length === 0 && !c.sealArmed) {
    const keys = Object.values(ELEMENTS).filter((d) => d.key).map((d) => keyLabel(d.key!)).join(' ');
    const idle = slot.controller.idleHint ?? `Type elements: ${keys}   ·   H for help`;
    text(ctx, idle, cx, y, { size: hint, align: 'center', color: '#a59fb5' });
  } else {
    const target = pointAim(e, c.aim, sim.world.entities).target;
    const conjured = c.conjured?.kind ?? null;
    const parts = MODE_HINTS.map(([mode, label]) => {
      const key = labels[mode];
      const name = sim.resolver.resolve(q, mode, { seal: c.sealArmed, target, conjured })?.name ?? '-';
      return c.sealArmed ? `${key}: Seal+${label}: ${name}` : `${key}: ${name}${mode === 'point' && target !== 'ground' && !name.endsWith('(on ally)') ? ` (${target})` : ''}`;
    });
    const color = c.sealArmed ? '#ffd98a' : '#d8d2e6';
    text(ctx, parts.slice(0, 3).join('    '), cx, y, { size: hint, align: 'center', color });
    text(ctx, parts.slice(3).join('    '), cx, y + 18, { size: hint, align: 'center', color });
  }
}

function drawRoomInfo(ctx: CanvasRenderingContext2D, w: number, sim: Sim): void {
  const status = sim.room.status?.(sim.world) ?? '';
  const pw = Math.max(250, status.length * 7 + 30) + 96;
  panel(ctx, w - pw - 16, 16, pw, 58);
  text(ctx, sim.room.name, w - 30, 38, { size: 18, weight: 800, align: 'right' });
  text(ctx, status, w - 30, 60, { size: 12, align: 'right', color: '#bdb6cc' });
  text(ctx, '1 Sanctum · 2 Arena · K ally', w - pw - 2, 38, { size: 11, color: '#7d768e' });
  // Active rule set (F2 toggles).
  const a1 = sim.resolver.rules === 'a1';
  text(ctx, `Rules ${rulesLabel(sim.resolver.rules)} · F2`, w - pw - 2, 61, { size: 13, weight: 900, color: a1 ? '#ffd98a' : '#bdb6cc' });
}

/** Darken a #rrggbb color for gem edges. */
function shade(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * 0.45);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
