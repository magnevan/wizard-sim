/**
 * The tuning panel (F2, or the Tune button): play, nudge a number, feel it, keep it.
 *
 * Every tunable in the sim, with the knobs that matter most pinned at the top, a search box, and
 * export / import. Writes go straight into the sim's config tables through tunables() and take
 * effect on the next tick; they persist in localStorage. The cheats live in the Tools panel
 * (tools-panel.ts, F3) and the meters in the Stats panel (stats-panel.ts, F4); the shell they share
 * is debug-panel.ts.
 */
import { ARCHETYPES, findTunable, overrides, tunables, tuningHash, hex, type Tunable } from '@wizard-sim/sim';
import { DebugPanel, h, panelSection } from './debug-panel';
import { exportText, parseOverrides, replaceTuning, saveTuning } from './tune-io';

/** The knobs that change how the game feels most, pinned at the top. */
const FEEL: [string, string][] = [
  ['runes.regen', 'Rune regen /s'], ['rhythm.windup', 'Wind-up s'], ['rhythm.windupPerRune', 'Wind-up per rune'], ['rhythm.recovery', 'Recovery s'],
  ['combat.channelRate', 'Channel rate'], ['body.walkSpeed', 'Walk speed'], ['body.castWalk', 'Walk while casting'], ['waves.lull', 'Wave lull s'],
];

interface Row { t: Tunable; el: HTMLElement; range: HTMLInputElement; num: HTMLInputElement; dot: HTMLButtonElement }
interface Section { group: string; det: HTMLDetailsElement; count: HTMLElement; rows: Row[]; wasOpen: boolean }

const decimals = (step: number): number => (step >= 1 ? 0 : Math.max(0, Math.ceil(-Math.log10(step) - 1e-9)));
const fmt = (v: number): string => String(Number(v.toFixed(6)));

export class TunePanel extends DebugPanel {
  private tuned = tuningHash() !== 0;
  private rows = new Map<string, Row[]>();
  private sections: Section[] = [];
  private el: Record<'hash' | 'export' | 'import' | 'msg', HTMLElement> | null = null;

  constructor(openNow = false) {
    super('right', 'F2', 'Tune', 'Tuning panel', 3);
    if (openNow) this.toggle();
  }

  /** For the Stats panel's flags. */
  flags(): string { return this.tuned ? '  tuned' : ''; }

  /**
   * Online play (netplay.ts): tuning goes through the match, so every peer changes it on the same
   * tick. The host proposes, everyone else reads.
   */
  gate: { online(): boolean; canTune(): boolean; propose(map: Record<string, number>): void } | null = null;
  private get online(): boolean { return !!this.gate?.online(); }

  /** Replace the whole tuning with `map`: here at once, or through the match when online. */
  private write(map: Record<string, number>): boolean {
    if (!this.online) { replaceTuning(map); this.changed(); return true; }
    if (!this.gate!.canTune()) { this.say('In a match only the host changes the tuning.'); this.changed(); return false; }
    this.gate!.propose(map);
    this.say('Sent to everyone: it applies in half a second.');
    return true;
  }

  private say(text: string): void { if (this.el) this.el.msg.textContent = text; }

  /** The match changed the tuning (the host's): show it, without saving it as this page's own. */
  refresh(): void { this.changed(undefined, false); }

  private setValue(t: Tunable, v: number): void {
    if (!Number.isFinite(v)) return;
    if (this.online) {
      const map = overrides();
      if (v === t.def) delete map[t.id]; else map[t.id] = v;
      this.write(map);
      return;
    }
    t.set(v);
    this.changed([t.id]);
  }

  /** After any tuning write: refresh those rows (or all), save, and update the hash and export. */
  private changed(ids?: string[], save = true): void {
    if (ids) for (const id of ids) for (const r of this.rows.get(id) ?? []) this.renderRow(r);
    else for (const rs of this.rows.values()) for (const r of rs) this.renderRow(r);
    if (save && !this.online) saveTuning();
    const hash = tuningHash();
    this.tuned = hash !== 0;
    if (!this.el) return;
    this.el.hash.textContent = this.tuned ? `tuning ${hex(hash)}` : 'defaults';
    this.el.hash.classList.toggle('on', this.tuned);
    (this.el.export as HTMLTextAreaElement).value = exportText();
    for (const s of this.sections) {
      const n = s.rows.filter((r) => r.t.get() !== r.t.def).length;
      s.count.textContent = n ? `${n} changed` : '';
    }
  }

  protected override onOpen(): void { this.changed(); }

  // ---- building ----

  protected fill(root: HTMLDivElement): void {
    const hash = h('span', 'tune-hash');
    this.titleEl!.appendChild(hash);
    // shown at the top, where an online refusal is seen
    const msg = h('div', 'tune-msg');
    root.appendChild(msg);
    const exp = h('textarea', 'tune-io'); exp.readOnly = true; exp.rows = 4;
    const imp = h('textarea', 'tune-io'); imp.rows = 3; imp.placeholder = 'Paste a tuning: {"runes.regen": 0.5}';
    this.el = { hash, export: exp, import: imp, msg };

    // Feel: the few knobs that matter most, pinned
    const feelIds = [...FEEL, ...ARCHETYPES.filter((a) => a.id !== 'none').map((a): [string, string] => [`enemy.${a.id}.speed`, `${a.name} speed`])];
    const feel = this.section('Feel', true, root);
    for (const [id, text] of feelIds) { const t = findTunable(id); if (t) feel.rows.push(this.row(t, feel.det, text, false)); }
    this.sections.push(feel);

    // Save & share
    const share = panelSection('Save & share', false, root);
    const copy = h('button', '', 'Copy');
    copy.addEventListener('click', () => {
      const done = () => { msg.textContent = 'Copied.'; };
      const fallback = () => { exp.focus(); exp.select(); msg.textContent = 'Selected: press Ctrl+C.'; };
      try { void navigator.clipboard.writeText(exp.value).then(done, fallback); } catch { fallback(); }
    });
    const apply = h('button', '', 'Apply');
    apply.addEventListener('click', () => {
      const p = parseOverrides(imp.value);
      if (!p.ok) { msg.textContent = p.error; return; }
      const unknown = Object.keys(p.map).filter((id) => !findTunable(id));
      if (!this.write(p.map)) return;
      if (!this.online) msg.textContent = `Applied ${Object.keys(p.map).length - unknown.length} values.` + (unknown.length ? ` Unknown: ${unknown.join(', ')}` : '');
    });
    const resetAll = h('button', 'warn', 'Reset all');
    resetAll.addEventListener('click', () => { if (this.write({}) && !this.online) msg.textContent = 'Back to the defaults.'; });
    share.append(h('div', 'tune-k', 'Export (what differs from the defaults)'), exp, copy,
      h('div', 'tune-k', 'Import (replaces the current tuning)'), imp, apply, resetAll);

    // every tunable, by group, with a search box
    const search = h('input', 'tune-search'); search.type = 'search'; search.placeholder = 'Search tunables (id or label)';
    search.addEventListener('input', () => this.filter(search.value));
    root.appendChild(search);
    const byGroup = new Map<string, Section>();
    for (const t of tunables()) {
      let s = byGroup.get(t.group);
      if (!s) { s = this.section(t.group, false, root); byGroup.set(t.group, s); this.sections.push(s); }
      s.rows.push(this.row(t, s.det, t.label, true));
    }
  }

  private section(group: string, open: boolean, parent: HTMLElement): Section {
    const det = h('details', 'tune-sec'); det.open = open;
    const sum = h('summary', '', group), count = h('span', 'tune-count');
    sum.appendChild(count); det.appendChild(sum);
    parent.appendChild(det);
    return { group, det, count, rows: [], wasOpen: open };
  }

  /** One knob: label, slider, number, reset dot. Feel rows keep the help in the tooltip, to stay short. */
  private row(t: Tunable, parent: HTMLElement, text: string, helpText: boolean): Row {
    const el = h('div', 'tune-row');
    const label = h('span', 'tune-label', text);
    label.title = `${t.id}  (default ${fmt(t.def)})${t.help ? '\n' + t.help : ''}`;
    const dot = h('button', 'tune-dot'); dot.title = `Reset to ${fmt(t.def)}`;
    const num = h('input', 'tune-num'); num.type = 'number'; num.step = String(t.step);
    const range = h('input', 'tune-range'); range.type = 'range';
    range.min = String(t.min); range.max = String(t.max); range.step = String(t.step);
    el.append(label, range, num, dot);
    if (t.help && helpText) el.appendChild(h('div', 'tune-help', t.help));
    const dec = decimals(t.step);
    range.addEventListener('input', () => this.setValue(t, Number(Number(range.value).toFixed(dec))));
    num.addEventListener('change', () => { if (num.value.trim() !== '') this.setValue(t, Number(num.value)); else this.renderRow(r); });
    dot.addEventListener('click', () => this.setValue(t, t.def));
    parent.appendChild(el);
    const r: Row = { t, el, range, num, dot };
    const list = this.rows.get(t.id) ?? [];
    list.push(r); this.rows.set(t.id, list);
    return r;
  }

  private filter(q: string): void {
    const s = q.trim().toLowerCase();
    for (const sec of this.sections) {
      let any = false;
      for (const r of sec.rows) {
        const hit = !s || r.t.id.toLowerCase().includes(s) || r.t.label.toLowerCase().includes(s);
        r.el.style.display = hit ? '' : 'none';
        any ||= hit;
      }
      sec.det.style.display = any ? '' : 'none';
      // while searching, matches show open; clearing the search restores what was open before
      if (s) { if (!sec.det.dataset.searching) { sec.wasOpen = sec.det.open; sec.det.dataset.searching = '1'; } sec.det.open = true; }
      else if (sec.det.dataset.searching) { sec.det.open = sec.wasOpen; delete sec.det.dataset.searching; }
    }
  }

  private renderRow(r: Row): void {
    const v = r.t.get(), changed = v !== r.t.def;
    r.range.value = String(v);
    if (document.activeElement !== r.num) r.num.value = fmt(v);
    r.el.classList.toggle('chg', changed);
    r.dot.style.visibility = changed ? 'visible' : 'hidden';
  }
}
