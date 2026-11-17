/**
 * The tuning panel (F2, or the Tune button): play, nudge a number, feel it, keep it.
 *
 * Every tunable in the sim, with the knobs that matter most pinned at the top, a search box, and
 * export / import. Writes go straight into the sim's config tables through tunables() and take
 * effect on the next tick; they persist in localStorage. The cheats live in the Tools panel
 * (tools-panel.ts, F3) and the meters in the Stats panel (stats-panel.ts, F4); the shell they share
 * is debug-panel.ts.
 *
 * "URL options" lists every ?key=value the page reads (dev-options.ts), as controls that rewrite the
 * address in place: the panel and the URL are two ways to set the same thing.
 */
import { ARCHETYPES, findTunable, overrides, tunables, tuningHash, hex, type Tunable } from '@wizard-sim/sim';
import { DebugPanel, h, panelSection } from './debug-panel';
import { exportText, parseOverrides, replaceTuning, saveTuning } from './tune-io';
import { OPTIONS, changedSinceBoot, onOption, opt, optOn, setOpt, type DevOption, type OptionGroup, type OptionKey } from './dev-options';

/** The knobs that change how the game feels most, pinned at the top. */
const FEEL: [string, string][] = [
  ['runes.regen', 'Rune regen /s'], ['rhythm.windup', 'Wind-up s'], ['rhythm.windupPerRune', 'Wind-up per rune'], ['rhythm.recovery', 'Recovery s'],
  ['combat.channelRate', 'Channel rate'], ['body.walkSpeed', 'Walk speed'], ['body.castWalk', 'Walk while casting'], ['waves.lull', 'Wave lull s'],
];

interface Row { t: Tunable; el: HTMLElement; range: HTMLInputElement; num: HTMLInputElement; dot: HTMLButtonElement }
interface Section { group: string; det: HTMLDetailsElement; count: HTMLElement; rows: Row[]; wasOpen: boolean }
/** One URL option's row. */
interface OptRow { o: DevOption; el: HTMLElement; render(): void }

const decimals = (step: number): number => (step >= 1 ? 0 : Math.max(0, Math.ceil(-Math.log10(step) - 1e-9)));
const fmt = (v: number): string => String(Number(v.toFixed(6)));

export class TunePanel extends DebugPanel {
  private tuned = tuningHash() !== 0;
  private rows = new Map<string, Row[]>();
  private sections: Section[] = [];
  private el: Record<'hash' | 'export' | 'import' | 'msg', HTMLElement> | null = null;
  private opts: { det: HTMLDetailsElement; count: HTMLElement; reload: HTMLElement; rows: OptRow[]; heads: Map<OptionGroup, HTMLElement>; wasOpen: boolean } | null = null;

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

  protected override onOpen(): void { this.changed(); this.renderOptions(); }

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

    this.optionsSection(root);

    // every tunable, by group, with a search box (it finds URL options too)
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
    this.filterOptions(s);
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

  // ---- URL options (dev-options.ts) ----

  /** Every URL option, by group: a control each, its ?key, and its help. */
  private optionsSection(root: HTMLElement): void {
    const det = h('details', 'tune-sec');
    const count = h('span', 'tune-count');
    const sum = h('summary', '', 'URL options'); sum.appendChild(count); det.appendChild(sum);
    root.appendChild(det);
    const body = h('div', 'tune-body'); det.appendChild(body);
    body.appendChild(h('div', 'tune-hint', 'The same as ?key=value in the address: a change here rewrites it, so a reload keeps it and the address is a link to it. Keys marked ↻ apply on a reload.'));
    const line = h('div', 'tune-line');
    const copy = h('button', '', 'Copy link');
    copy.addEventListener('click', () => {
      try { void navigator.clipboard.writeText(location.href); copy.textContent = 'Copied'; } catch { /* no clipboard */ }
      setTimeout(() => { copy.textContent = 'Copy link'; }, 1200);
    });
    const reload = h('button', 'warn', 'Reload to apply');
    reload.addEventListener('click', () => location.reload());
    line.append(copy, reload);
    body.appendChild(line);
    const heads = new Map<OptionGroup, HTMLElement>();
    const rows: OptRow[] = [];
    for (const o of OPTIONS as readonly DevOption[]) {
      if (!heads.has(o.group)) { const hd = h('div', 'tune-k tune-opt-head', o.group); heads.set(o.group, hd); body.appendChild(hd); }
      rows.push(this.optRow(o, body));
    }
    this.opts = { det, count, reload, rows, heads, wasOpen: false };
    // set from elsewhere too (the Esc menu, the Academy's O and I keys): show it
    for (const r of rows) onOption(r.o.key as OptionKey, () => this.renderOptions());
    this.renderOptions();
  }

  /** One option: label, control (checkbox, list or text), its key, and its help underneath. */
  private optRow(o: DevOption, parent: HTMLElement): OptRow {
    const key = o.key as OptionKey;
    const el = h('div', 'tune-opt');
    const label = h('span', 'tune-label', o.label);
    label.title = `?${key}=\n${o.help}`;
    const code = h('code', 'tune-opt-key', `${key}${o.live ? '' : ' ↻'}`);
    code.title = o.live ? 'Applies at once' : 'Applies on a reload';
    let control: HTMLElement;
    let render: () => void;
    if (o.kind === 'flag') {
      const box = h('input'); box.type = 'checkbox';
      box.addEventListener('change', () => setOpt(key, o.defaultOn ? (box.checked ? null : '0') : (box.checked ? '1' : null)));
      control = box;
      render = () => { box.checked = optOn(key); };
    } else if (o.kind === 'choice') {
      const sel = h('select');
      sel.appendChild(new Option('(default)', ''));
      for (const c of o.choices?.() ?? []) sel.appendChild(new Option(c, c));
      sel.addEventListener('change', () => setOpt(key, sel.value || null));
      control = sel;
      render = () => {
        const v = opt(key) ?? '';
        // a value the list doesn't know (typed into the address): show it anyway
        if (v && ![...sel.options].some((x) => x.value === v)) sel.appendChild(new Option(v, v));
        sel.value = v;
      };
    } else {
      const inp = h('input', 'tune-num tune-opt-text'); inp.type = 'text';
      inp.addEventListener('change', () => setOpt(key, inp.value.trim() || null));
      control = inp;
      render = () => { if (document.activeElement !== inp) inp.value = opt(key) ?? ''; };
    }
    el.append(label, control, code, h('div', 'tune-help', o.help + (o.devOnly ? ' (dev server only)' : '')));
    parent.appendChild(el);
    return { o, el, render: () => { render(); el.classList.toggle('chg', opt(key) !== null); } };
  }

  private renderOptions(): void {
    if (!this.opts) return;
    for (const r of this.opts.rows) r.render();
    const set = this.opts.rows.filter((r) => opt(r.o.key as OptionKey) !== null).length;
    this.opts.count.textContent = set ? `${set} set` : '';
    const stale = this.opts.rows.filter((r) => !r.o.live && changedSinceBoot(r.o.key as OptionKey));
    this.opts.reload.style.display = stale.length ? '' : 'none';
    this.opts.reload.title = 'Changed: ' + stale.map((r) => r.o.key).join(', ');
  }

  private filterOptions(s: string): void {
    const p = this.opts;
    if (!p) return;
    const shown = new Set<OptionGroup>();
    for (const r of p.rows) {
      const hit = !s || r.o.key.toLowerCase().includes(s) || r.o.label.toLowerCase().includes(s) || r.o.help.toLowerCase().includes(s);
      r.el.style.display = hit ? '' : 'none';
      if (hit) shown.add(r.o.group);
    }
    for (const [g, hd] of p.heads) hd.style.display = shown.has(g) ? '' : 'none';
    p.det.style.display = shown.size ? '' : 'none';
    if (s) { if (!p.det.dataset.searching) { p.wasOpen = p.det.open; p.det.dataset.searching = '1'; } p.det.open = true; }
    else if (p.det.dataset.searching) { p.det.open = p.wasOpen; delete p.det.dataset.searching; }
  }
}
