/**
 * The Sound Lab (dev server only: localhost:5187/?lab=fire). One element at a time, heard in the game
 * with its visuals. Each moment is a spell cut into the parts being judged (a flamethrower's catch, roar and
 * cut-off), and each part has its own takes: switch them while it plays, and play the whole spell or just
 * that part. Nothing plays until you ask, so you can write in peace, and while nothing plays your hands are
 * your own, to cast it yourself. Each take has its own mark and note, and each moment an overall one.
 *
 * The kits are local (vite.config.ts serves them on this machine only; they're never in a build). A part
 * whose kit entry has the reference's or today's layers too (KitLayer.set) offers them beside the takes.
 * Notes go through the dev server into content/audio/lab-notes.json, where Claude reads them.
 */
import { KIND, NO_INPUT, type PlayerInput, type World } from '@wizard-sim/sim';
import { demoInput, parseDemo, PERIOD, type Demo } from '../demo';
import { loadBaseline } from './baseline';
import type { GameAudio } from './game-audio';
import { useKit, type Kit, type KitLayer } from './kits';
import type { ElementName, Plan } from './recipes';

/** A part of a spell being judged: the kit entry it is (a role like `hold`, or a spell entry like `land:missile`) and how many takes it has. `other`: the entry has the reference's (or today's) layers too, under this name. */
interface Section { name: string; key: string; takes: number; other?: string }
/** `douse`: the dummies are put out as soon as they catch, so a hit isn't followed by the burn's own small hits every half second. `near`: your wizard is stood this far south of the nearest dummy as it starts, for spells that only reach what's close (the dummies stand in a row, so the others are well off to the side). */
interface Moment { id: string; name: string; spell: string; listen: string; sections: Section[]; near?: number; douse?: boolean }

const LABS: Readonly<Record<string, { el: ElementName; moments: Moment[] }>> = {
  // round 1 the Sigil way (tools/sfx/fire-1.json): three takes of each part, the reference to compare
  fire: {
    el: 'fire',
    moments: [
      // r3, settled unless it sounds wrong: catch, roar 1, and no cut-off (the roar dies away over 0.5 s instead)
      { id: 'flamethrower-r3', name: 'Flamethrower', spell: 'fire,fire,fire/force', listen: 'Your picks, now in the game: the catch, roar take 1, and no cut-off. The roar dies away over half a second as you let go. Play the whole spell and listen to the ending.',
        sections: [{ name: 'Catch', key: 'start', takes: 1 }, { name: 'Roar', key: 'hold', takes: 1 }] },
      // the ring is settled (take 3)
      // settled 2026-11-12: the fireball (charge 1, throw 3 with its echo, landing 3) and the beam (3)
      // settled 2026-11-12: On fire (round 8's take 2, 4 dB under the reference's level)
      // settled 2026-11-12: round 9's hit (3, also Fire on yourself), burst (1), eruption (1, for now) and floor (On fire's loop).
      // Fire's wall is never heard (walls are Shield spells): it goes with Shield's sounds
    ],
  },
  sigil: {
    el: 'sigil',
    moments: [
      // settled 2026-11-11 and out of the Lab: Haste's hum (hum 3) and the rune blop (take 1)
      // orbitals (sigil-12.json) came out on 2026-11-11: every take rejected, and circling stays silent. Its row can come back with
      // `near: 3.2` (an orb strikes within 1.6 u of a dummy's edge, and its ring starts due east)
    ],
  },
};

/** Your wizard with no statuses: not burning, wet, frozen, stunned or chilled. */
function calm(w: World): void {
  const b = w.bodies;
  b.burn[0] = b.burnPool[0] = b.wet[0] = b.frozen[0] = b.stun[0] = b.chill[0] = 0;
}

/** One take of a kit layer: its clips ending in n, else its first. A layer with only one clip keeps it. */
function pickTake(clips: readonly string[], n: number): readonly string[] {
  const these = clips.filter((c) => c.endsWith(`-${n}`));
  return these.length ? these : clips.slice(0, 1);
}

/** The kit with each entry at its chosen take: 0 is the other set (KitLayer.set 'ref'), else take n of ours. Entries nobody chose play take 1. */
function kitAt(kit: Kit, take: (key: string) => number): Kit {
  const one = (key: string, ls: readonly KitLayer[]) => {
    const n = take(key);
    return ls.filter((l) => !l.set || (l.set === 'ref') === (n === 0)).map((l) => (l.set === 'ref' ? l : { ...l, clips: pickTake(l.clips, n || 1) }));
  };
  const all = (ls: Readonly<Record<string, readonly KitLayer[]>>) => Object.fromEntries(Object.entries(ls).map(([k, v]) => [k, one(k, v)]));
  const { spells, ...roles } = kit;
  return { ...all(roles), spells: all(spells ?? {}) };
}

/** The clips a kit entry plays, for hearing just that part. */
function clipsOf(kit: Kit, key: string): Set<string> {
  const ls = (kit as unknown as Record<string, readonly KitLayer[] | undefined>)[key] ?? kit.spells?.[key] ?? [];
  return new Set(ls.flatMap((l) => l.clips));
}

const CSS = `
#lab{position:fixed;top:12px;right:12px;width:350px;max-height:calc(100vh - 24px);overflow:auto;z-index:50;background:#14121bf2;color:#ece6d8;
  border:1px solid #4a4257;border-radius:8px;padding:12px;font:13px/1.4 system-ui,sans-serif}
#lab h2{margin:0 0 2px;font-size:15px}#lab p{margin:0 0 8px;color:#a9a1b5;font-size:12px}
#lab .row{display:flex;gap:4px;margin-bottom:6px;align-items:center}
#lab button{flex:1;background:#2a2535;color:inherit;border:1px solid #4a4257;border-radius:5px;padding:5px 6px;font:inherit;cursor:pointer}
#lab button:hover{background:#393246}#lab button.on{background:#d9772b;border-color:#f0a35e;color:#1b1209;font-weight:600}
#lab button:disabled{opacity:.4;cursor:default}
#lab .lbl{flex:0 0 auto;color:#a9a1b5;font-size:12px;min-width:74px}
#lab .m{border-top:1px solid #3a3346;padding:8px 0}#lab .m>button{width:100%;text-align:left;margin-bottom:4px}
#lab .m small{display:block;color:#a9a1b5;margin-bottom:6px}#lab .m .more{display:none}#lab .m.open .more{display:block}
#lab .sec{border-left:3px solid #4a4257;padding:4px 0 2px 8px;margin:8px 0}#lab .sec.solo{border-left-color:#d9772b}
#lab .sec h3{margin:0 0 5px;font-size:13px}
#lab .r b{display:block;font-size:12px;margin-bottom:3px}
#lab .marks{display:flex;gap:4px}#lab .marks button{font-size:12px;padding:3px}
#lab textarea{box-sizing:border-box;width:100%;height:40px;margin-top:4px;background:#0f0d14;color:inherit;border:1px solid #4a4257;border-radius:5px;padding:5px;font:inherit;resize:vertical}
#lab .saved{color:#8fc98f;font-size:11px;height:14px}`;

/** The switchable kinds of sound around the spell, by the director's group: rune blips and steps start off, so what you hear is the spell. */
type Extra = 'runes' | 'other';
const EXTRAS: readonly [Extra, string][] = [['runes', 'Rune sounds'], ['other', 'Steps and the rest']];
const SPELL_GROUPS = new Set(['cast', 'chan', 'charge', 'flight', 'aura', 'orbit', 'hit', 'zap', 'orbstrike', 'impact', 'burst', 'floorfire', 'burn']);
const extraOf = (group: string): Extra | null => (group === 'ui' ? 'runes' : SPELL_GROUPS.has(group) ? null : 'other');
/** The Now playing line's names. */
const SAYS: readonly [RegExp, string][] = [
  [/^queue:/, 'rune'], [/^kit:aura/, 'aura loop'], [/^kit:orbstrike/, 'orb strike'], [/^kit:hold|^hold:/, 'held loop'], [/^kit:stop/, 'dying breath'], [/^kit:charge|^charge/, 'charge'], [/^kit:flight|^flight/, 'in flight'],
  [/^kit:land|^impact|^hit/, 'hit'], [/^kit:ground|^floorfire/, 'burning ground'], [/^kit:burn|^burn/, 'burning body'], [/^kit:|^(spray|beam|missile|nova|force|self|place):/, 'cast'],
];
const MARKS = ['Right', 'Close', 'Wrong'];

export class SoundLab {
  private demo: Demo | null = null;
  private tick = 0;
  /** Stop after one cycle, rather than looping. */
  private once = false;
  /** What's playing, for its buttons: called with nothing when it stops. */
  private played: (() => void) | null = null;
  /** Take away what the last moment left standing: a turret would go on firing over the next one. */
  private clear = false;
  /** Where the open moment stands your wizard, once, as it starts playing. */
  private near: number | null = null;
  private douse = false;
  private stand = false;
  private ref: Kit | null = null;
  private lab: typeof LABS[string];
  private notes: Record<string, { mark?: string; note?: string }> = {};
  /** Each kit entry's chosen take: 0 is the other set (reference or today). */
  private takes = new Map<string, number>();
  /** The kit entry being heard on its own, or null for the whole spell. */
  private solo: string | null = null;
  /** What the loops playing were started for (takes and solo), so they restart only when it changes. */
  private heard = '';
  private soloClips = new Set<string>();
  private extras: Record<Extra, boolean> = { runes: false, other: false };
  private recent: { name: string; at: number }[] = [];
  private loops = new Map<string, string>();
  private now: HTMLElement | null = null;
  private status: HTMLElement | null = null;
  /** Redraws the open moment's buttons after a change. */
  private redraw: (() => void) | null = null;

  constructor(private audio: GameAudio, name: string) {
    this.lab = LABS[name] ?? LABS.fire;
    const d = audio.director;
    d.hear = (k) => { const x = extraOf(k); return this.solo !== null || !x || this.extras[x]; };
    d.hearPlan = (p: Plan) => this.solo === null || p.layers.some((l) => this.soloClips.has(l.clip));
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
    for (let k = 0; k < 9; k++) w.seats.runes[k] = 5;
    w.bodies.hp[0] = 100;
    if (this.clear) { w.devices.type.fill(0); w.devices.chan.fill(0); w.seats.aura.fill(0); this.clear = false; }
    // a single play ends with the wizard put out, so the burn's loop ends with it and the next play starts from quiet
    if (this.once && this.tick >= PERIOD) { this.stop(); calm(w); }
    if (!this.demo) return null;
    if (this.douse) for (let i = 1; i < w.bodies.burn.length; i++) w.bodies.burn[i] = 0;
    // every play starts the same: still burning or wet from the last one, a Fire cast on yourself only dries you,
    // or carries on a fire that's already going
    if (this.stand) calm(w);
    if (this.stand && this.near !== null) {
      this.stand = false;
      const b = w.bodies;
      let d = -1;
      for (let i = 0; i < b.kind.length; i++) if (b.kind[i] === KIND.dummy && (d < 0 || Math.hypot(b.x[i] - b.x[0], b.y[i] - b.y[0]) < Math.hypot(b.x[d] - b.x[0], b.y[d] - b.y[0]))) d = i;
      if (d >= 0) { b.x[0] = b.x[d]; b.y[0] = b.y[d] + this.near; }
    }
    this.stand = false;
    return demoInput(w, this.tick++, 0, this.demo) ?? NO_INPUT;
  }

  private play(spell: string, once: boolean, solo: string | null, done: () => void): void {
    this.stop();
    this.solo = solo;
    this.demo = parseDemo(spell);
    this.once = once;
    this.tick = 0;
    this.stand = true;
    this.played = done;
    this.apply();
  }

  private stop(): void {
    this.demo = null;
    this.played?.();
    this.played = null;
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
    const kits = await loadBaseline(this.audio);
    this.ref = kits?.[this.lab.el] ?? null;
    if (this.status) this.status.textContent = this.ref ? '' : 'The local kits are not on this machine, so there is nothing to compare.';
    this.apply();
  }

  /** The element's kit at the chosen takes, and what "just this part" lets through. */
  private apply(): void {
    if (!this.ref) return;
    const kit = kitAt(this.ref, (k) => this.takes.get(k) ?? 1);
    useKit(this.lab.el, kit);
    this.soloClips = this.solo === null ? new Set() : clipsOf(kit, this.solo);
    // a loop already going would carry on as the old take; but restarting one that hasn't changed is heard as a new start
    const was = this.heard;
    this.heard = `${JSON.stringify([...this.takes])}|${this.solo}`;
    if (was !== this.heard) this.audio.director.restartLoops();
    this.redraw?.();
  }

  private save(key: string, saved: HTMLElement): void {
    void fetch('/__lab/notes', { method: 'POST', body: JSON.stringify({ id: key, ...this.notes[key] }) })
      .then((r) => { saved.textContent = r.ok ? 'Saved' : 'Not saved: is the dev server running?'; })
      .catch(() => { saved.textContent = 'Not saved: is the dev server running?'; });
  }

  /** A mark and a note, kept under `key`. Saves as you type. */
  private rating(parent: HTMLElement, key: string, label: string, hint: string): HTMLElement {
    const n = (this.notes[key] ??= {});
    const box = document.createElement('div'); box.className = 'r';
    const name = document.createElement('b'); name.textContent = label;
    const marks = document.createElement('div'); marks.className = 'marks';
    const t = document.createElement('textarea'); t.placeholder = hint; t.value = n.note ?? '';
    const saved = document.createElement('div'); saved.className = 'saved';
    const mb = MARKS.map((m) => {
      const b = document.createElement('button'); b.textContent = m;
      b.classList.toggle('on', n.mark === m);
      b.onclick = () => { n.mark = n.mark === m ? undefined : m; for (const x of mb) x.classList.toggle('on', x.textContent === n.mark); this.save(key, saved); };
      marks.appendChild(b);
      return b;
    });
    let wait = 0;
    const write = () => { window.clearTimeout(wait); if ((n.note ?? '') !== t.value) { n.note = t.value; this.save(key, saved); } };
    t.oninput = () => { saved.textContent = ''; window.clearTimeout(wait); wait = window.setTimeout(write, 700); };
    t.onblur = write;
    box.append(name, marks, t, saved);
    parent.appendChild(box);
    return box;
  }

  private build(): void {
    const style = document.createElement('style');
    style.textContent = CSS;
    const root = document.createElement('div');
    root.id = 'lab';
    // typing a note mustn't cast runes, and a click here mustn't cast a spell
    for (const ev of ['keydown', 'keyup']) root.addEventListener(ev, (e) => { if ((e.target as HTMLElement).tagName === 'TEXTAREA') e.stopPropagation(); });
    for (const ev of ['pointerdown', 'pointerup']) root.addEventListener(ev, (e) => e.stopPropagation());
    // and a button keeps no focus, so the keys go back to the game
    root.addEventListener('click', (e) => { if ((e.target as HTMLElement).tagName === 'BUTTON') (e.target as HTMLElement).blur(); });
    const el = (tag: string, text = '', parent: HTMLElement = root, cls = '') => { const n = document.createElement(tag); n.textContent = text; if (cls) n.className = cls; parent.appendChild(n); return n; };
    const button = (text: string, parent: HTMLElement) => el('button', text, parent) as HTMLButtonElement;
    el('h2', `Sound Lab: ${this.lab.el}`);
    el('p', 'Open a moment. Play the whole spell, or just the part you are judging, and switch that part\'s takes while it plays. With nothing playing, your keys cast as usual.');
    this.status = el('p');
    const extras = el('div', '', root, 'row');
    el('span', 'Also hear:', extras, 'lbl');
    for (const [k, label] of EXTRAS) {
      const b = button(label, extras);
      b.onclick = () => { this.extras[k] = !this.extras[k]; b.classList.toggle('on', this.extras[k]); if (k === 'other') this.audio.director.punches = this.extras[k]; };
    }
    this.now = el('p', 'Now playing: nothing');
    const rows: HTMLElement[] = [];
    for (const m of this.lab.moments) {
      const key = `${this.lab.el}/${m.id}`;
      const row = el('div', '', root, 'm'); rows.push(row);
      const open = button(m.name, row);
      const more = el('div', '', row, 'more');
      el('small', m.listen, more);
      // every play button, to light the one playing
      const plays: [HTMLButtonElement, string | null, boolean][] = [];
      const idle = () => { for (const [b] of plays) b.classList.remove('on'); };
      const player = (parent: HTMLElement, label: string, solo: string | null) => {
        const line = el('div', '', parent, 'row');
        el('span', label, line, 'lbl');
        for (const [text, once] of [['Once', true], ['Loop', false]] as const) {
          const b = button(text, line);
          plays.push([b, solo, once]);
          b.onclick = () => { this.play(m.spell, once, solo, idle); b.classList.add('on'); };
        }
        button('Stop', line).onclick = () => { this.stop(); this.clear = true; };
      };
      player(more, 'Whole spell', null);
      const draws: (() => void)[] = [];
      for (const s of m.sections) {
        const sec = el('div', '', more, 'sec');
        el('h3', m.sections.length > 1 || s.takes > 1 ? s.name : `${s.name} (one take)`, sec);
        player(sec, `Just the ${s.name.toLowerCase()}`, s.key);
        const choices: [number, string][] = [...Array.from({ length: s.takes }, (_, i): [number, string] => [i + 1, `Take ${i + 1}`]), ...(s.other ? [[0, s.other] as [number, string]] : [])];
        const pick = el('div', '', sec, 'row');
        const picks = choices.length > 1 ? choices.map(([n, label]) => { const b = button(label, pick); b.onclick = () => { this.takes.set(s.key, n); this.apply(); }; return [n, b] as const; }) : [];
        if (!picks.length) pick.remove();
        // one note per take, the chosen one shown, so a note is plainly about what you're hearing
        const boxes = choices.map(([n, label]) => {
          const b = this.rating(sec, `${key}/${s.key}/${n ? `take${n}` : 'other'}`, choices.length > 1 ? `${s.name}, ${label}` : s.name, `${label}: what is off, in your own words`);
          return [n, b] as const;
        });
        draws.push(() => {
          const n = this.takes.get(s.key) ?? 1;
          for (const [k, b] of picks) b.classList.toggle('on', k === n);
          for (const [k, b] of boxes) b.style.display = k === n || boxes.length === 1 ? '' : 'none';
          sec.classList.toggle('solo', this.solo === s.key && !!this.demo);
        });
      }
      this.rating(more, key, 'Overall', 'The spell as a whole');
      const draw = () => { for (const d of draws) d(); };
      open.onclick = () => {
        const was = row.classList.contains('open');
        this.stop();
        this.clear = true;
        for (const r of rows) { r.classList.remove('open'); r.querySelector('button')!.classList.remove('on'); }
        if (!was) { row.classList.add('open'); open.classList.add('on'); }
        this.near = was ? null : m.near ?? null;
        this.douse = !was && !!m.douse;
        this.redraw = was ? null : draw;
        draw();
      };
    }
    document.body.append(style, root);
  }
}
