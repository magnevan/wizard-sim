import type { Sim } from '../game/sim';
import { ELEMENTS, TYPEABLE_ELEMENTS } from '../spells/elements';
import { rulesLabel, type RuleSet } from '../spells/tree';
import { keyLabel, panel, text } from './draw';

const CONTROLS: [string, string][] = [
  ['Hold LMB', 'Walk toward cursor'],
  ['RMB', 'Force cast (hold for beams / sprays)'],
  ['Shift + RMB', 'Area cast'],
  ['Space / MMB', 'Self cast'],
  ['Shift + LMB', 'Weapon cast (swing + ground line)'],
  ['Ctrl+RMB / M4 / G', 'Point cast at cursor (on a body: targets it)'],
  ['C', 'Arm / disarm Seal: next cast goes in a vessel'],
  ['V', 'Release all sealed spells, shatter your walls'],
  ['Esc', 'Clear queue (casting also clears it)'],
  ['1 / 2', 'Sanctum / Arena'],
  ['0', 'Reset dummies'],
  ['K', 'Dev ally: AI wizard that follows P1'],
  ['F2', 'Toggle rule set A / A.1 (also ?rules=a1)'],
  ['Wheel', 'Zoom'],
  ['H / F1', 'Toggle this help'],
  ['` (backtick)', 'Debug overlay'],
];

const PAD: [string, string][] = [
  ['Any button', 'Join as the next player'],
  ['Left stick', 'Move'],
  ['Right stick', 'Aim (reticle; tilt = distance)'],
  ['A B X Y', 'Water  Life  Shield  Cold'],
  ['LB + A B X Y', 'Lightning  Arcane  Earth  Fire'],
  ['RT', 'Force cast (hold to channel)'],
  ['LT', 'Area cast'],
  ['RB', 'Self cast'],
  ['LB + RT', 'Weapon cast'],
  ['LB + LT', 'Point cast at the reticle'],
  ['D-pad up / down', 'Seal / Release'],
  ['Back / View', 'Clear queue'],
];

const ARENA = [
  'Lull (portals show the next wave + countdown): prepare.',
  'Wave: 2-3 archetypes. Downed players are out until it ends.',
  'Breather (3 s): the fallen return. HUD: sealed spells fired.',
  'Swarmer, Brute (slam), Shieldbearer (go around: bounce',
  'shards, Point casts, flank), Caster (back line), Grabber',
  '(Yank the ally or hurt it), Fire imp (water / cold).',
];

const A1 = [
  'Self: Shield+Arcane Ethereal, Lightning Haste, Arcane+Fire',
  'Glass cannon, Earth Stoneskin, Water Cleanse.',
  'Point on an ally = your Self spell on them. Shield on an',
  'enemy = Cage. Yank only with Arcane alone.',
];

export function drawHelp(ctx: CanvasRenderingContext2D, h: number, rules: RuleSet = 'a'): void {
  const pw = 900;
  const ph = 120 + CONTROLS.length * 22 + 110;
  // Left side, under the player card, so the wizard stays visible.
  const x = 16;
  const y = Math.max(16, Math.min(100, h - ph - 16));
  panel(ctx, x, y, pw, ph, 0.9);
  text(ctx, 'Controls', x + 24, y + 36, { size: 22, weight: 800 });
  text(ctx, 'Every keypress queues. Cast time belongs to the spell, not your fingers.', x + 24, y + 58, { size: 12, color: '#a59fb5' });

  CONTROLS.forEach(([k, d], i) => {
    const ly = y + 90 + i * 22;
    text(ctx, k, x + 24, ly, { size: 13, weight: 800, color: '#ffd98a' });
    text(ctx, d, x + 170, ly, { size: 13 });
  });

  const ey = y + 100 + CONTROLS.length * 22;
  text(ctx, 'Elements', x + 24, ey + 6, { size: 15, weight: 800 });
  TYPEABLE_ELEMENTS.forEach((el, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const ex = x + 24 + col * 108;
    const ry = ey + 34 + row * 30;
    const def = ELEMENTS[el];
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(ex + 10, ry - 4, 10, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, keyLabel(def.key!), ex + 10, ry, { size: 12, weight: 900, align: 'center', color: '#0d0b12' });
    text(ctx, def.name, ex + 26, ry, { size: 13 });
  });

  const gx = x + 520;
  text(ctx, 'Gamepad (P2+)', gx, y + 36, { size: 18, weight: 800 });
  PAD.forEach(([k, d], i) => {
    const ly = y + 66 + i * 21;
    text(ctx, k, gx, ly, { size: 12, weight: 800, color: '#ffd98a' });
    text(ctx, d, gx + 118, ly, { size: 12 });
  });
  const ay = y + 90 + PAD.length * 21;
  text(ctx, 'Arena (2)', gx, ay, { size: 15, weight: 800 });
  ARENA.forEach((l, i) => text(ctx, l, gx, ay + 22 + i * 18, { size: 12, color: '#d8d2e6' }));
  const ry = ay + 34 + ARENA.length * 18;
  text(ctx, `Rule set: ${rulesLabel(rules)} (F2)`, gx, ry, { size: 15, weight: 800, color: rules === 'a1' ? '#ffd98a' : '#ffffff' });
  A1.forEach((l, i) => text(ctx, l, gx, ry + 20 + i * 17, { size: 12, color: rules === 'a1' ? '#d8d2e6' : '#7d768e' }));
}

export function drawDebug(ctx: CanvasRenderingContext2D, sim: Sim, fps: number, ticks: number, zoom: number): void {
  const w = sim.world;
  const lines = [
    `fps ${fps.toFixed(0)}   ticks ${ticks}`,
    `entities ${w.entities.length}   effects ${w.entities.filter((e) => e.effect).length}`,
    `t ${w.time.toFixed(2)}s   zoom ${zoom.toFixed(2)}`,
    `room ${sim.room.id}   players ${sim.players.map((p) => p.controller.label).join(', ')}`,
  ];
  const y = 16 + sim.players.length * 84;
  panel(ctx, 16, y, 300, lines.length * 17 + 14);
  lines.forEach((l, i) => text(ctx, l, 26, y + 22 + i * 17, { size: 12, color: '#9fe3a8' }));
}
