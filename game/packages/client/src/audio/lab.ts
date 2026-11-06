/**
 * The Sound Lab (dev server only: localhost:5187/?lab=fire). One element at a time, heard in the game
 * with its visuals: pick a moment and your wizard casts it at the dummy on a loop, then switch what you
 * hear while you watch. Stop, and you have your hands back in the Sanctum.
 *
 * Before is what the game plays today, New is the kit being built (kits.ts). Reference is a local
 * comparison the dev server offers if it's on this machine (vite.config.ts): it's never in a build.
 * Notes go through the dev server into content/audio/lab-notes.json, where Claude reads them.
 */
import { NO_INPUT, type PlayerInput, type World } from '@wizard-sim/sim';
import { demoInput, parseDemo, type Demo } from '../demo';
import type { GameAudio } from './game-audio';
import { FIRE_KIT, useKit, type Kit } from './kits';
import type { ElementName } from './recipes';

interface Moment { id: string; name: string; spell: string; listen: string }

const LABS: Readonly<Record<string, { el: ElementName; kit: Kit; moments: Moment[] }>> = {
  fire: {
    el: 'fire', kit: FIRE_KIT,
    moments: [
      { id: 'flamethrower', name: 'Flamethrower', spell: 'fire,fire,fire/force', listen: 'The catch, the held roar, and the dying breath when it stops.' },
      { id: 'ring', name: 'Fire ring', spell: 'fire,fire/area', listen: 'One big bloom of flame around you.' },
      { id: 'fireball', name: 'Fireball', spell: 'earth,fire,fire/force', listen: 'The throw, then the landing.' },
      { id: 'beam', name: 'Fire beam', spell: 'arcane,fire/force', listen: 'A steady line of flame, thinner than the flamethrower.' },
      { id: 'burning', name: 'On fire', spell: 'fire/self', listen: 'A body burning: it should sit under everything else.' },
    ],
  },
};

const CSS = `
#lab{position:fixed;top:12px;right:12px;width:310px;max-height:calc(100vh - 24px);overflow:auto;z-index:50;background:#14121bf2;color:#ece6d8;
  border:1px solid #4a4257;border-radius:8px;padding:12px;font:13px/1.4 system-ui,sans-serif}
#lab h2{margin:0 0 2px;font-size:15px}#lab p{margin:0 0 8px;color:#a9a1b5;font-size:12px}
#lab .sets,#lab .marks{display:flex;gap:4px}#lab .sets{margin-bottom:8px}
#lab button{flex:1;background:#2a2535;color:inherit;border:1px solid #4a4257;border-radius:5px;padding:5px 6px;font:inherit;cursor:pointer}
#lab button:hover{background:#393246}#lab button.on{background:#d9772b;border-color:#f0a35e;color:#1b1209;font-weight:600}
#lab button:disabled{opacity:.4;cursor:default}
#lab .m{border-top:1px solid #3a3346;padding:8px 0}#lab .m>button{width:100%;text-align:left;margin-bottom:4px}
#lab .m small{display:block;color:#a9a1b5;margin-bottom:5px}#lab .m .more{display:none}#lab .m.open .more{display:block}
#lab .marks button{font-size:12px;padding:3px}
#lab textarea{box-sizing:border-box;width:100%;height:52px;margin-top:5px;background:#0f0d14;color:inherit;border:1px solid #4a4257;border-radius:5px;padding:5px;font:inherit;resize:vertical}
#lab .saved{color:#8fc98f;font-size:11px;height:14px}`;

type Set = 'before' | 'new' | 'reference';
type Part = 'spell' | 'hits' | 'burning' | 'other';
const PARTS: readonly [Part, string][] = [['spell', 'Spell'], ['hits', 'Hits'], ['burning', 'Burning'], ['other', 'Runes, steps']];
/** Every kind of sound the fire moments make, by the part it's switched with. Anything unlisted is "other". */
const PART_OF: Readonly<Record<string, Part>> = { cast: 'spell', chan: 'spell', charge: 'spell', flight: 'spell', hit: 'hits', impact: 'hits', burst: 'hits', floorfire: 'burning', burn: 'burning' };
/** The Now playing line's names. */
const SAYS: readonly [RegExp, string][] = [
  [/^kit:hold|^hold:/, 'held loop'], [/^kit:stop/, 'dying breath'], [/^kit:charge|^charge/, 'charge'], [/^kit:flight|^flight/, 'in flight'],
  [/^kit:land|^impact|^hit/, 'hit'], [/^kit:ground|^floorfire/, 'burning ground'], [/^kit:burn|^burn/, 'burning body'], [/^kit:|^(spray|beam|missile|nova|force|self|place):/, 'cast'],
];
const MARKS = ['Right', 'Close', 'Wrong'];

export class SoundLab {
  private demo: Demo | null = null;
  private tick = 0;
  private set: Set = 'new';
  private ref: Kit | null = null;
  private lab: typeof LABS[string];
  private notes: Record<string, { mark?: string; note?: string }> = {};
  private setButtons = new Map<Set, HTMLButtonElement>();
  /** Which parts are on. Rune blips, footsteps and the like start off, so what you compare is the spell. */
  private parts: Record<Part, boolean> = { spell: true, hits: true, burning: true, other: false };
  private recent: { name: string; at: number }[] = [];
  private loops = new Map<string, string>();
  private now: HTMLElement | null = null;

  constructor(private audio: GameAudio, name: string) {
    this.lab = LABS[name] ?? LABS.fire;
    useKit(this.lab.el, this.lab.kit);
    const d = audio.director;
    d.hear = (k) => this.parts[PART_OF[k] ?? 'other'];
    d.punches = false;
    d.onPlan = (name, looped, id) => {
      const say = SAYS.find(([re]) => re.test(name))?.[1] ?? name;
      if (!looped) this.recent.push({ name: say, at: performance.now() });
      else if (name && id) this.loops.set(id, say);
      else if (id) this.loops.delete(id);
    };
    setInterval(() => this.showNow(), 150);
    void this.boot();
  }

  /** Seat 0's input while a moment plays. Off a loop like this nothing should wear out, so runes and health are topped up. */
  input(w: World): PlayerInput | null {
    if (!this.demo) return null;
    for (let k = 0; k < 9; k++) w.seats.runes[k] = 5;
    w.bodies.hp[0] = 100;
    return demoInput(w, this.tick++, 0, this.demo) ?? NO_INPUT;
  }

  private showNow(): void {
    if (!this.now) return;
    const t = performance.now();
    this.recent = this.recent.filter((r) => t - r.at < 900);
    const names = [...new Set([...this.loops.values(), ...this.recent.map((r) => r.name)])];
    this.now.textContent = `Now playing: ${names.join(', ') || 'nothing'}`;
  }

  private async boot(): Promise<void> {
    try { this.notes = await (await fetch('/__lab/notes')).json(); } catch { /* none yet */ }
    this.build();
    await this.loadReference();
  }

  /** The local comparison, if this machine has one. Its clips are loaded straight into the engine. */
  private async loadReference(): Promise<void> {
    try {
      const r = await fetch(`/__ref/${this.lab.el}-kit.json`);
      if (!r.ok) return;
      const kit = await r.json() as Kit;
      for (let tries = 0; !this.audio.engine && tries < 100; tries++) await new Promise((f) => setTimeout(f, 100));
      const e = this.audio.engine;
      if (!e) return;
      const all = Object.values(kit).flat();
      await Promise.all([...new Set(all.flatMap((l) => l.clips))].map(async (id) => {
        const b = await e.ctx.decodeAudioData(await (await fetch(`/__ref/spells/${id.replace('mk-', 'w')}.wav`)).arrayBuffer());
        e.addClip(id, b, all.some((l) => l.loop && l.clips.includes(id)));
      }));
      this.ref = kit;
      const b = this.setButtons.get('reference');
      if (b) { b.disabled = false; b.title = ''; }
    } catch { /* it stays greyed out */ }
  }

  private choose(s: Set): void {
    this.set = s;
    useKit(this.lab.el, s === 'before' ? null : s === 'new' ? this.lab.kit : this.ref);
    for (const [k, b] of this.setButtons) b.classList.toggle('on', k === s);
    this.audio.director.restartLoops(); // or a loop already going would carry on as the old set
  }

  private save(id: string, saved: HTMLElement): void {
    void fetch('/__lab/notes', { method: 'POST', body: JSON.stringify({ id: `${this.lab.el}/${id}`, ...this.notes[`${this.lab.el}/${id}`] }) })
      .then((r) => { saved.textContent = r.ok ? 'Saved' : 'Not saved: is the dev server running?'; })
      .catch(() => { saved.textContent = 'Not saved: is the dev server running?'; });
  }

  private build(): void {
    const style = document.createElement('style');
    style.textContent = CSS;
    const root = document.createElement('div');
    root.id = 'lab';
    // typing a note mustn't cast runes
    for (const ev of ['keydown', 'keyup', 'pointerdown', 'pointerup']) root.addEventListener(ev, (e) => e.stopPropagation());
    const el = (tag: string, text = '', parent: HTMLElement = root) => { const n = document.createElement(tag); n.textContent = text; parent.appendChild(n); return n; };
    el('h2', `Sound Lab: ${this.lab.el}`);
    el('p', 'Pick a moment, then switch sets while it plays. Pick it again to stop and play yourself.');
    const sets = el('div'); sets.className = 'sets';
    for (const [k, label] of [['before', 'Before'], ['new', 'New'], ['reference', 'Reference']] as [Set, string][]) {
      const b = el('button', label, sets) as HTMLButtonElement;
      b.classList.toggle('on', k === this.set);
      if (k === 'reference') { b.disabled = true; b.title = 'Local only, and not on this machine'; }
      b.onclick = () => this.choose(k);
      this.setButtons.set(k, b);
    }
    el('p', 'Hear only:').style.margin = '0 0 3px';
    const parts = el('div'); parts.className = 'sets';
    for (const [k, label] of PARTS) {
      const b = el('button', label, parts) as HTMLButtonElement;
      b.classList.toggle('on', this.parts[k]);
      b.onclick = () => {
        this.parts[k] = !this.parts[k];
        b.classList.toggle('on', this.parts[k]);
        if (k === 'other') this.audio.director.punches = this.parts[k];
      };
    }
    this.now = el('p', 'Now playing: nothing');
    const rows: HTMLElement[] = [];
    for (const m of this.lab.moments) {
      const key = `${this.lab.el}/${m.id}`, n = (this.notes[key] ??= {});
      const row = el('div'); row.className = 'm'; rows.push(row);
      const go = el('button', `▶ ${m.name}`, row) as HTMLButtonElement;
      const more = el('div', '', row); more.className = 'more';
      el('small', m.listen, more);
      const marks = el('div', '', more); marks.className = 'marks';
      const saved = document.createElement('div'); saved.className = 'saved';
      const mb = MARKS.map((label) => {
        const b = el('button', label, marks) as HTMLButtonElement;
        b.classList.toggle('on', n.mark === label);
        b.onclick = () => { n.mark = n.mark === label ? undefined : label; for (const x of mb) x.classList.toggle('on', x.textContent === n.mark); this.save(m.id, saved); };
        return b;
      });
      const t = el('textarea', '', more) as HTMLTextAreaElement;
      t.placeholder = 'What is off, in your own words';
      t.value = n.note ?? '';
      t.oninput = () => { saved.textContent = ''; };
      t.onblur = () => { if ((n.note ?? '') !== t.value) { n.note = t.value; this.save(m.id, saved); } };
      more.appendChild(saved);
      go.onclick = () => {
        const was = row.classList.contains('open');
        for (const r of rows) { r.classList.remove('open'); r.querySelector('button')!.classList.remove('on'); }
        this.demo = was ? null : parseDemo(m.spell);
        this.tick = 0;
        if (!was) { row.classList.add('open'); go.classList.add('on'); }
      };
    }
    document.body.append(style, root);
  }
}
