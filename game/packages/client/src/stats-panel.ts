/**
 * The stats panel (F4, or the Stats button): on the left edge, so it stays in view while the Tune or
 * Tools panel is open on the right. What the game is doing (tick, state hash, frame rate, renderer,
 * the view's counters, the tuning / cheat / network flags) and the meters (DPS, damage per spell,
 * runes per minute, time to kill, wave clear times). The shell is debug-panel.ts.
 *
 * The meters count every step, open or not (it's only an event tally); everything else is computed
 * a few times a second, and only while the panel is open (the state hash walks every byte).
 */
import { ARCHETYPES, KIND, type World } from '@wizard-sim/sim';
import { DebugPanel, esc, h, panelSection, renderFlags } from './debug-panel';
import { Meters } from './meters';

/** What main.ts knows about the running game: label / value rows, and the flags ("tuned", "paused", "net ..."). */
export interface StatsInfo { rows: [string, string][]; flags: string }

export class StatsPanel extends DebugPanel {
  readonly meters = new Meters(0);
  info: () => StatsInfo = () => ({ rows: [], flags: '' });
  private nextRender = 0;
  private frames: number[] = [];
  private el: Record<'game' | 'flags' | 'meters', HTMLElement> | null = null;

  constructor(private world: World, openNow = false) {
    super('left', 'F4', 'Stats', 'Stats and meters', 1);
    if (openNow) this.toggle();
  }

  /** After every sim step: count the meters. */
  afterStep(): void {
    const w = this.world;
    this.meters.step(w.clock[0], w.events, {
      castRunes: (seat) => w.seats.castLen[seat],
      isEnemy: (i) => w.bodies.kind[i] === KIND.enemy,
      encPhase: () => w.enc.state[0],
      waveNo: () => w.enc.state[1],
    });
  }

  /** Once per drawn frame: note the frame time; refresh a few times a second, and only while open. */
  frame(now: number): void {
    if (!this.isOpen) return;
    const f = this.frames;
    f.push(now);
    while (f.length && f[0] < now - 1000) f.shift();
    if (now < this.nextRender) return;
    this.nextRender = now + 250;
    this.render();
  }

  protected override onOpen(): void { this.nextRender = 0; this.frames.length = 0; }

  protected fill(root: HTMLDivElement): void {
    const flags = h('div', 'tune-flags');
    root.appendChild(flags);
    const game = h('div', 'tune-kv');
    panelSection('Game', true, root).appendChild(game);
    const meters = h('div', 'tune-meters');
    const ms = panelSection('Meters', true, root);
    const resetM = h('button', '', 'Reset meters');
    resetM.addEventListener('click', () => { this.meters.reset(); this.renderMeters(); });
    ms.append(meters, resetM);
    this.el = { game, flags, meters };
  }

  private render(): void {
    if (!this.el) return;
    const info = this.info(), f = this.frames;
    const fps = f.length > 1 ? ((f.length - 1) * 1000) / (f[f.length - 1] - f[0]) : 0;
    const rows: [string, string][] = [['fps', fps ? fps.toFixed(0) : '…'], ...info.rows];
    this.el.game.innerHTML = rows.map(([k, v]) => `<span>${esc(k)}</span><b>${esc(v)}</b>`).join('');
    renderFlags(this.el.flags, info.flags);
    this.renderMeters();
  }

  private renderMeters(): void {
    if (!this.el) return;
    const m = this.meters, n = (v: number, d = 0) => v.toFixed(d);
    const secs = m.elapsed(), mm = Math.floor(secs / 60), ss = Math.floor(secs % 60);
    let html = `<div class="tune-stats">
      <div><b>${n(m.dps(), 1)}</b><span>DPS (3 s)</span></div>
      <div><b>${n(m.totalDamage)}</b><span>damage</span></div>
      <div><b>${n(m.totalHeal)}</b><span>healing</span></div>
      <div><b>${n(m.runesPerMinute(), 1)}</b><span>runes / min</span></div>
      <div><b>${m.totalCasts}</b><span>casts</span></div>
      <div><b>${mm}:${String(ss).padStart(2, '0')}</b><span>sim time</span></div>
    </div>`;
    const rows = m.spellRows().slice(0, 14);
    if (rows.length) {
      html += '<table class="tune-tab"><tr><th>Spell</th><th>casts</th><th>dmg</th><th>heal</th><th title="damage per rune spent">/rune</th></tr>' +
        rows.map((r) => `<tr><td title="${esc(r.title)}">${esc(r.title)}</td><td>${r.casts}</td><td>${n(r.damage)}</td><td>${r.heal ? n(r.heal) : ''}</td><td>${r.runes ? n(r.damage / r.runes, 1) : ''}</td></tr>`).join('') +
        '</table>';
    } else html += '<div class="tune-hint">Cast something: spells show up here.</div>';
    const kills = [...m.kills.values()].sort((a, b) => a.arch - b.arch);
    if (kills.length) html += '<div class="tune-k">Time to kill (first hit to death)</div><div class="tune-chips">' +
      kills.map((k) => `<span>${esc(ARCHETYPES[k.arch]?.name ?? '?')} <b>${n(k.seconds / k.kills, 1)} s</b> ×${k.kills}</span>`).join('') + '</div>';
    if (m.waves.length) html += '<div class="tune-k">Wave clear time</div><div class="tune-chips">' +
      m.waves.slice(-8).map((w) => `<span>W${w.wave} <b>${n(w.seconds, 1)} s</b></span>`).join('') + '</div>';
    this.el.meters.innerHTML = html;
  }
}
