(function () {
  const C = window.SpellTreeC;
  const $ = (id) => document.getElementById(id);
  const state = { queue: ['sigil', 'fire', 'earth'], cast: 'place', drag: false, onAlly: false, event: '', overlay: [] };
  const CAST_NAME = Object.fromEntries(C.CASTS.map((c) => [c[0], c[1]]));
  const ROW_HINT = {
    shield: 'Shield in the queue: barriers (alone: a mirror)', sigil: 'Sigil in the queue: devices that bind a Sigil rune (alone: blink, motes, lens, Double, wand)', earth: 'Earth, no Shield, Sigil or Ligil', arcane: 'Arcane, none of the above', life: 'Life, no Shield or Sigil: support spells; the others lend their shape',
    ice: 'Ice (Water + Cold make one rune), none of the above: shards', lightning: 'Lightning, none of the above', water: 'only spray elements, mostly Water', fire: 'only spray elements, mostly Fire', cold: 'only spray elements, mostly Cold',
  };

  // ---------- animated canvases ----------
  const live = new Map(); // canvas -> () => [spell, queue]
  const visible = new Set();
  const io = new IntersectionObserver((es) => { for (const e of es) e.isIntersecting ? visible.add(e.target) : visible.delete(e.target); });
  function animate(canvas, get) { live.set(canvas, get); io.observe(canvas); }
  function fit(c) {
    const r = c.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * d)), h = Math.max(1, Math.round(r.height * d));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  }
  let last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (now - last < 33) return; last = now;
    const t = now / 1000;
    for (const c of visible) {
      if (!c.isConnected) { visible.delete(c); live.delete(c); continue; }
      const get = live.get(c); if (!get) continue;
      fit(c); const [s, q] = get();
      window.drawSpell(c.getContext('2d'), c.width, c.height, t, s, q);
    }
  }
  requestAnimationFrame(frame);

  // ---------- composer ----------
  // Laid out like the keys: Q W E R on top, A S D F G below, each opposite under its partner.
  for (const [i, e] of C.BASE.entries()) {
    const el = C.ELEMENTS[e];
    const b = document.createElement('button'); b.type = 'button'; b.className = 'el'; b.style.setProperty('--c', el.color);
    b.innerHTML = `<i></i>${el.name}<kbd>${el.key}</kbd>`;
    b.addEventListener('click', () => add(e));
    $('pad').append(b);
    if (i === 3) { const gap = document.createElement('span'); gap.setAttribute('aria-hidden', 'true'); $('pad').append(gap); }
  }
  for (const [id, name, key, hint] of C.CASTS) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'seg'; b.dataset.c = id;
    b.innerHTML = `${name}<small>${key}</small>`; b.title = hint;
    b.addEventListener('click', () => { state.cast = id; render(); });
    $('casts').append(b);
  }
  $('drag').addEventListener('click', () => { state.drag = !state.drag; render(); });
  $('ally').addEventListener('click', () => { state.onAlly = !state.onAlly; render(); });
  $('clear').addEventListener('click', () => { state.queue = []; state.event = ''; render(); });
  function add(e) { const r = C.addElement(state.queue, e); state.queue = r.queue; state.event = r.event || ''; render(); }
  document.addEventListener('keydown', (ev) => {
    if (ev.target.closest('textarea, input')) return;
    const k = ev.key.toUpperCase();
    const e = C.BASE.find((x) => C.ELEMENTS[x].key === k);
    if (e && !ev.ctrlKey && !ev.metaKey) { add(e); ev.preventDefault(); return; }
    if (/^[1-9]$/.test(ev.key) && +ev.key <= C.CASTS.length) { state.cast = C.CASTS[+ev.key - 1][0]; render(); return; }
    if (ev.key === ' ') { state.drag = !state.drag; render(); ev.preventDefault(); return; }
    if (k === 'T') { state.onAlly = !state.onAlly; render(); return; }
    if (ev.key === 'Escape' || ev.key === 'Backspace') { state.queue = []; state.event = ''; render(); }
  });

  const current = () => C.resolve(state.queue, state.cast, { drag: state.drag, onAlly: state.onAlly });
  animate($('stage'), () => [current(), state.queue]);
  // keep the stage animating even when scrolled away is pointless; observer handles it.

  function recipe(q, cast, o = {}) {
    return `${CAST_NAME[cast]}${o.drag ? ' (drag)' : ''}${o.onAlly ? ' (on ally)' : ''}: ${q.map((e) => C.ELEMENTS[e].name).join(' + ') || 'nothing'}`;
  }
  const cellId = (s) => s.id.replace('/', '-');

  function render() {
    const s = current();
    const dom = C.dominant(state.queue);
    let domMarked = false;
    $('queue').replaceChildren(...Array.from({ length: C.MAX }, (_, i) => {
      const d = document.createElement('div'); const e = state.queue[i];
      d.className = 'slot' + (e ? ' full' : '');
      if (e === dom && state.cast !== 'self' && !domMarked) { d.classList.add('dom'); domMarked = true; }
      if (e) { d.style.setProperty('--c', C.ELEMENTS[e].color); d.title = C.ELEMENTS[e].name; }
      return d;
    }));
    $('event').textContent = state.event;
    for (const b of $('casts').children) b.setAttribute('aria-pressed', String(b.dataset.c === state.cast));
    $('drag').setAttribute('aria-pressed', String(state.drag));
    $('drag').disabled = state.cast !== 'place' || !['shield', 'sigil'].includes(dom);
    $('ally').setAttribute('aria-pressed', String(state.onAlly));
    $('ally').disabled = state.cast !== 'self';

    const sp = $('spell'); sp.replaceChildren();
    const form = document.createElement('div'); form.className = 'form';
    form.textContent = [s.formName, CAST_NAME[state.cast], s.drag ? 'dragged' : ''].filter(Boolean).join(' · ');
    const h = document.createElement('h3'); h.textContent = s.title;
    const p = document.createElement('p'); p.textContent = s.text;
    sp.append(form, h, p);
    if (s.payload.length || s.mix.length) {
      const ul = document.createElement('ul'); ul.className = 'pl';
      for (const x of s.payload) {
        const li = document.createElement('li'); li.style.setProperty('--c', C.ELEMENTS[x.el].color);
        const i = document.createElement('i'); const b = document.createElement('b'); b.textContent = `${x.trait}${x.n > 1 ? ` ×${x.n}` : ''}`;
        li.append(i, b, ' ', x.text); ul.append(li);
      }
      for (const m of s.mix) { // water + fire or water + cold: a mixed effect, not a new element
        const li = document.createElement('li'); li.style.setProperty('--c', mixBg(m.els));
        const i = document.createElement('i'); const b = document.createElement('b'); b.textContent = m.trait;
        li.append(i, b, ' ', m.text); ul.append(li);
      }
      sp.append(ul);
    }
    if (state.drag && state.cast === 'place' && !s.drag && s.id !== 'none') { const v = document.createElement('div'); v.className = 'note'; v.textContent = s.id === 'sigil/place' ? 'A waypoint is a point, so dragging a pure Sigil Place changes nothing. Add an element for a line glyph.' : 'Dragging only changes Shield and Sigil. Whether a drag should draw any spell as a line is still open (see the lines question).'; sp.append(v); }
    if (s.cost) { const c = document.createElement('div'); c.className = 'cost ' + s.cost.kind; const b = document.createElement('b'); b.textContent = s.cost.title; c.append(b, ' ', s.cost.text); sp.append(c); }
    const rec = document.createElement('div'); rec.className = 'recipe'; rec.textContent = recipe(state.queue, state.cast, state);
    sp.append(rec);
    if (s.id !== 'none') sp.append(rateBox(cellId(s), `${s.formName || 'Self'} × ${CAST_NAME[state.cast]}`));

    renderGrid();
  }

  // ---------- grid ----------
  for (const e of C.BASE) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.e = e; b.style.setProperty('--c', C.ELEMENTS[e].color);
    b.innerHTML = `<i></i>${C.ELEMENTS[e].name}`; b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      state.overlay = state.overlay.includes(e) ? state.overlay.filter((x) => x !== e) : state.overlay.concat(e).slice(-3);
      for (const c of $('overlay').querySelectorAll('.chip')) c.setAttribute('aria-pressed', String(state.overlay.includes(c.dataset.e)));
      renderGrid();
    });
    $('overlay').append(b);
  }
  const seed = (f) => [f];
  function cellQueue(f) {
    let q = seed(f), why = '';
    for (const e of state.overlay) {
      const r = C.addElement(q, e);
      if (r.kind === 'combine') { q = r.queue; why = why || r.event; continue; } // Water + Cold make Ice
      if (r.queue.length <= q.length) { why = `${C.ELEMENTS[e].name}: ${r.event ? r.event.toLowerCase() : 'no room'}`; continue; }
      if (r.queue.length === q.length && r.event) { why = r.event; }
      q = r.queue;
    }
    if (C.dominant(q) !== f) why = why || `${C.ELEMENTS[C.dominant(q)].name} takes over the form`;
    if (!q.includes(f)) why = why || 'the form element was cancelled';
    return [q, why];
  }
  const gridCells = [];
  function buildGrid() {
    const t = $('atlas');
    const head = document.createElement('tr');
    const th0 = document.createElement('th'); th0.className = 'rowh'; th0.textContent = 'Form ↓ / Cast →'; head.append(th0);
    for (const [, name, key, hint] of C.CASTS) { const th = document.createElement('th'); th.innerHTML = `${name}<small>${key} · ${hint}</small>`; head.append(th); }
    t.append(head);
    for (const f of C.FORMS) {
      const tr = document.createElement('tr');
      const rh = document.createElement('td'); rh.className = 'rowh';
      rh.innerHTML = `<span class="dotl" style="--c:${C.ELEMENTS[f].color}"></span><b>${C.ELEMENTS[f].name}</b><small>${C.FORM_NAME[f]} · ${ROW_HINT[f]}</small>`;
      tr.append(rh);
      for (const [cast] of C.CASTS) {
        const td = document.createElement('td');
        const b = document.createElement('button'); b.type = 'button'; b.className = 'cellb';
        const cv = document.createElement('canvas');
        const lab = document.createElement('span'); const nm = document.createElement('b'); nm.style.fontWeight = '700'; const mk = document.createElement('i'); mk.className = 'mk'; lab.append(nm, mk);
        const why = document.createElement('div'); why.className = 'why';
        b.append(cv, lab, why); td.append(b); tr.append(td);
        const cell = { f, cast, b, nm, mk, why, q: seed(f), s: null };
        animate(cv, () => [cell.s, cell.q]);
        b.addEventListener('click', () => { Object.assign(state, { queue: cell.q.slice(), cast, drag: false, event: recipe(cell.q, cast) }); render(); $('stage').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
        gridCells.push(cell);
      }
      t.append(tr);
    }
  }
  function renderGrid() {
    const cur = current();
    for (const cell of gridCells) {
      const [q, why] = cellQueue(cell.f);
      cell.q = q; cell.s = C.resolve(q, cell.cast, {});
      cell.nm.textContent = cell.s.title;
      cell.why.textContent = why;
      cell.b.classList.toggle('off', !!why);
      cell.b.classList.toggle('current', cur.id === cell.s.id && state.cast === cell.cast);
      const m = ratings[cellId(cell.s)]?.mark;
      cell.mk.className = 'mk ' + (m || ''); cell.mk.textContent = m ? { keep: '★', maybe: '?', cut: '✗' }[m] : '';
      cell.b.title = recipe(q, cell.cast);
    }
  }

  // ---------- legends ----------
  function mixBg(els) { return `linear-gradient(90deg, ${C.ELEMENTS[els[0]].color} 50%, ${C.ELEMENTS[els[1]].color} 50%)`; }
  const FORM_ONLY = ['shield', 'sigil'];
  for (const e of C.ALL.filter((x) => !FORM_ONLY.includes(x))) {
    const P = C.PAYLOAD[e];
    const d = document.createElement('div'); d.className = 'card';
    const sh = C.SHAPE[e], ln = C.LIFE_LEND[e];
    d.innerHTML = `<div class="k">${P.trait}${sh ? ' · shape: ' + sh[0] : ''}</div><h4><i style="--c:${C.ELEMENTS[e].color}"></i>${C.ELEMENTS[e].name}</h4>`;
    const p = document.createElement('p'); p.textContent = `Whatever it hits ${P.hit}.${sh ? ` If it leads the shape, the spell ${sh[1]}.` : ''} ${P.why}`; d.append(p);
    if (ln) { const q = document.createElement('p'); q.textContent = `In a Life spell: ${ln[0]}. ${ln[1]}`; q.style.marginTop = '6px'; d.append(q); }
    $('payloads').append(d);
  }
  for (const m of C.MIX) {
    const d = document.createElement('div'); d.className = 'card';
    d.innerHTML = `<div class="k">${m.trait} · a mix</div><h4><i style="background:${mixBg(m.els)}"></i>Water + ${C.ELEMENTS[m.els[1]].name}</h4>`;
    const p = document.createElement('p'); p.textContent = `Both stay in the queue and both add their trait. Together, whatever it touches also ${m.hit}.`; d.append(p);
    $('payloads').append(d);
  }
  const FORM_CARDS = [
    ['shield', 'Barrier', 'Never a payload: Shield always takes the form and makes something defensive in the world (wave, ring, arc or wall, ward, shield in hand). It costs upkeep while it stands. Alone it is a mirror that turns their magic back. It never stacks.'],
    ['sigil', 'Device', 'Never a payload: Sigil always takes the form and manifests something in the world (turret, orbitals, glyph, aura, weapon). Each one binds a Sigil rune. Glyphs and orbitals are paid once; a turret draws each shot from your pool. Alone it shapes your own magic: a lens, rune motes, a waypoint, a Double, a sculpting wand. It never stacks, and Shield and Sigil cancel.'],
  ];
  for (const [e, k, text] of FORM_CARDS) {
    const d = document.createElement('div'); d.className = 'card';
    d.innerHTML = `<div class="k">${k}</div><h4><i style="--c:${C.ELEMENTS[e].color}"></i>${C.ELEMENTS[e].name}</h4><p>${text}</p>`;
    $('payloads').append(d);
  }
  // Self: Sigil auras (one per element) and the Double, then stacking with Earth as the material,
  // then Shield wards and a plain self-cast for contrast.
  const selfCards = [['Sigil', C.DOUBLE[0], 'a copy of you that enemies target. It repeats your spells at half power from its own spot, each repeat paid with half that spell\'s runes (no runes, no repeat)', ['sigil']]]
    .concat(C.ALL.filter((x) => !FORM_ONLY.includes(x)).map((e) => [`Sigil + ${C.ELEMENTS[e].name}`, ...C.AURA[e], ['sigil', e]]))
    .concat([
      ['Sigil + Earth + Fire', 'Burning bulldoze', 'earth is the material, so fire coats the bulldoze: whoever you shove catches fire', ['sigil', 'earth', 'fire']],
      ['Shield', 'Ward', 'a bubble that reflects the next few shots: Shield alone is a mirror', ['shield']],
      ['Shield + Fire', 'Ward', 'a bubble that resists fire. Without earth, each element is its own resistance', ['shield', 'fire']],
      ['Shield + Earth', 'Stone armour', 'stone around you that resists physical hits', ['shield', 'earth']],
      ['Shield + Earth + Fire', 'Stone armour coated in fire', 'resists physical hits and fire, and melee attackers catch fire', ['shield', 'earth', 'fire']],
      ['Life alone', 'Heal', 'no Shield or Sigil: the element simply hits you, as in Magicka', ['life']],
    ]);
  for (const [k, name, text, q] of selfCards) {
    const d = document.createElement('div'); d.className = 'card';
    d.innerHTML = `<div class="k">Self · ${k}</div><h4><i style="--c:${C.ELEMENTS[q[q.length - 1]].color}"></i>${name}</h4>`;
    const p = document.createElement('p'); p.textContent = text.replace(/\{W\}/g, 'You').replace(/\{w\}/g, 'you').replace(/\{s\}/g, 'your').replace(/^./, (c) => c.toUpperCase()).replace(/([^.])$/, '$1.'); d.append(p);
    const cv = document.createElement('canvas'); d.append(cv);
    const s = C.resolve(q, 'self', {}); animate(cv, () => [s, q]);
    $('buffs').append(d);
  }

  // ---------- structures ----------
  for (const [name, q, cast, o, how] of C.STRUCTURES) {
    const s = C.resolve(q, cast, o);
    const d = document.createElement('button'); d.type = 'button'; d.className = 'card scard';
    const k = document.createElement('div'); k.className = 'k'; k.textContent = recipe(q, cast, o);
    const h = document.createElement('h4'); h.textContent = name;
    const p = document.createElement('p'); p.textContent = how;
    const cv = document.createElement('canvas'); animate(cv, () => [s, q]);
    const tag = document.createElement('span'); tag.className = 'ctag ' + s.cost.kind; tag.textContent = s.cost.title;
    d.append(k, h, cv, p, tag);
    d.addEventListener('click', () => { Object.assign(state, { queue: q.slice(), cast, drag: !!o.drag, onAlly: false, event: `${name}: ${recipe(q, cast, o)}` }); render(); $('stage').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    $('structs').append(d);
  }
  for (const [kind, [title, text]] of Object.entries(C.COST)) {
    const d = document.createElement('div'); const b = document.createElement('b'); b.className = 'ctag ' + kind; b.textContent = title; d.append(b, ' ', text); $('costs').append(d);
  }

  // ---------- leaves ----------
  for (const [name, mark, q, cast, o] of C.LEAVES) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'lchip';
    const s = document.createElement('span'); s.className = 's' + (mark === '?' ? ' qm' : mark === 'new' ? ' nw' : ''); s.textContent = mark === 'new' ? '+' : mark;
    b.append(s, name); b.title = recipe(q, cast, o);
    b.addEventListener('click', () => { Object.assign(state, { queue: q.slice(), cast, drag: !!o.drag, onAlly: !!o.onAlly, event: `${name}: ${recipe(q, cast, o)}` }); render(); $('stage').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    $('leaves').append(b);
  }
  for (const [name, mark, why] of C.DROPPED) {
    const d = document.createElement('div'); const b = document.createElement('b'); b.textContent = `${mark} ${name}: `; d.append(b, why); $('dropped').append(d);
  }

  // ---------- collisions ----------
  const COLL = [
    ['Shield + element, Force', 'Elemental mines (unverified)', 'Elemental barrier, and Seal + Point also made glyphs: two "mine" ideas', 'An elemental wave that sweeps forward. Mines and glyphs are one thing now: Sigil + Place.', false],
    ['Seal + any cast', '—', 'C v3: hold Ctrl to store the spell (turret, orbitals, glyph, staff slot). A modifier chord, and odd Shield vessels (sentinel, shield orbitals)', 'Seal is gone. Sigil is an element: + Force a turret, + Area orbitals, + Place a glyph (drag for a line glyph). Each binds a Sigil rune. Shield + Sigil cancel, so no Shield devices.', true],
    ['Sigil + Sigil', '—', 'Atlas v6: more Sigil made bigger devices and longer buffs', 'Cancel, like Shield + Shield. A Sigil specialist keeps more devices (a deeper pool binds more), not bigger ones.', true],
    ['Self without Shield (e.g. Fire)', 'The element hits you (fire burns you)', 'A: elemental ward. A.1 and C v3: one buff per element', 'As in Magicka again: the element hits you (Life heals, Water douses). Auras moved to Sigil + Self, wards stay with Shield + Self.', false],
    ['Shield + Earth + Fire on yourself', 'Physical and fire resistance: it just does both (unverified)', 'Atlas v6: two resistances side by side', 'Earth is the material: stone armour coated in fire. It resists both, and melee attackers catch fire. The same rule shapes Sigil auras (a burning bulldoze).', false],
    ['Weapon without Shield or Sigil', 'Imbued swing', 'C v3: every element conjured its own weapon', 'An imbued swing again. Sigil conjures offensive weapons (maul, hook, sword…), Shield defensive ones (Bulwark, Buckler).', false],
    ['Water + Fire, Water + Cold', 'Combine into Steam and Ice (unverified)', 'Steam and Ice as elements, with their own forms and cancels', 'Nothing combines. Both stay in the queue and the spell gains steam effects (scald, mist) or ice effects (freeze solid, brittle). Water can no longer hide inside steam next to lightning.', true],
    ['Earth + Arcane on an enemy', '—', 'A: Yank. A.1: Geyser. What you clicked on changed the spell', 'Gone. No spell depends on what the cursor touches, except Self picking an ally.', true],
    ['Point just beside an ally', '—', 'Stoneskin on the ally becomes a Geyser on the ground', 'Self snaps to an ally near the cursor, otherwise lands on you. A miss is harmless.', true],
    ['Life in a damage spell', 'Life heals, damage hurts (unverified)', '"Attuned": spares allies, which clashes with Life meaning heal', 'Life just heals what it touches. Ally-safe damage moved to the Sigil sculpting wand: while you hold it, your spells spare allies.', true],
    ['Shield + Life at a spot', '—', 'Lantern (cannot die below 1 HP), a special case', 'A healing curtain (arc or drawn wall). No special case.', false],
    ['Shield inside a stored spell', '—', 'Contingency: fires itself when you are hit (hidden rule)', 'No auto-triggers, and no stored spells: preparing a spell is deferred to its own mechanism.', true],
    ['Place without dragging', '—', 'C v3: a dome at the cursor', 'With Shield, an arc of wall around you facing the cursor: the quick wall. With Sigil, a glyph. Other forms ignore the drag (lines are still open).', false],
    ['Release', '—', 'Sets off sealed spells and also shatters your walls', 'Still one key: it fires turrets\' last shot, flings orbitals, sets off glyphs, teleports you to a waypoint and shatters rock walls. With a waypoint and a trap glyph both down, one press does both. Flagged as a question.', false],
    ['Holding Area', 'Area is instant', 'Hold = sustain (Sustained Circle)', 'Hold = place at the cursor. A placed Life spring lingers, which covers Sustained Circle.', false],
  ];
  const ct = $('coll');
  ct.innerHTML = '<tr><th>Input</th><th>Magicka</th><th>Earlier (A, A.1, C v3)</th><th>Proposal C now</th></tr>';
  for (const [inp, m, a, c, bad] of COLL) {
    const tr = document.createElement('tr');
    for (const [i, x] of [inp, m, a, c].entries()) { const td = document.createElement('td'); td.textContent = x; if (i === 2) td.className = bad ? 'bad' : 'ok'; tr.append(td); }
    ct.append(tr);
  }

  // ---------- overnight drafts (2026-11-04): element effects, Shield, Life ----------
  // Proposals only: nothing here changes rules-c.js. Reasoning: docs/explorations/2026-11-04-overnight-drafts.md.
  const mk = (tag, cls, text) => { const x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; };
  const withBold = (el, s) => { // **bold** spans in short draft strings
    s.split(/(\*\*[^*]+\*\*)/).forEach((part) => { if (part.startsWith('**')) el.append(mk('b', null, part.slice(2, -2))); else if (part) el.append(part); });
    return el;
  };
  // [element, Magicka (unverified), [status now, draft], [shape now, draft], [interactions now, draft]]; draft null = unchanged
  const FX = [
    ['water', 'Wets and pushes. Wet targets take more lightning; a wet caster who casts lightning shocks themselves. Douses burning.',
      ['Wet', null], ['Push (shove)', null],
      ['wet + lightning jumps further · wet + cold freezes (mix) · fire dries wet · puts out burning (self-cast only)', 'as now, plus **a wet caster who casts lightning shocks themselves** and **water puts out burning in every spell**']],
    ['life', 'Heals whatever it touches, friend or foe. Hurts the undead (unverified). Cancels Arcane.',
      ['none (an instant heal)', 'none; open: Regenerating'], ['none', null],
      ['none (only cancels Arcane in the queue)', '**on a structure, Life mends the structure** (see part 3)']],
    ['cold', 'Slows, stacks to frozen; frozen shatters from a heavy hit. Puts out burning.',
      ['Chilled → Frozen', null], ['none', '**Shatter**: on impact, or when its structure breaks, the spell splits into ice shards (brings back Ricochet Bolt ★ and Ice Shrapnel ★)'],
      ['frozen + heavy hit shatters · puts out burning (self-cast only)', 'as now, plus **cold puts out burning in every spell**']],
    ['lightning', 'Damage that arcs between targets; worse on the wet. A stun? (the user remembers one; unverified)',
      ['Shocked (damage only)', '**Stunned**: a short interrupt that breaks a cast or wind-up; you can still walk'], ['Chain', null],
      ['wet carries it further', 'as now, plus **earth grounds it: chains don\'t jump through or over rock walls**']],
    ['arcane', 'Raw damage, the beam. Makes rocks and ice explode on impact. In a beam it extended duration? (the user\'s memory; unverified)',
      ['none', '**Exposed**: for a moment wards and resistances don\'t count, and structures take extra'], ['Burst (the unique one)', null],
      ['ignores most wards (one-sided)', '**arcane breaks barriers and wards**, as a status others can use']],
    ['earth', 'The rock; knockdown; rock walls with Shield; earthquake. Grounds lightning.',
      ['Knocked down', null], ['Weight', '**It becomes the body** (the material). Earth is never a payload in practice: it is always the form or the material'],
      ['the heavy hit that shatters the frozen · cancels lightning in the queue', 'as now, plus grounds lightning in the world']],
    ['fire', 'Burning, damage over time. Dries the wet. Spreads to grass and oil.',
      ['Burning', null], ['none', 'none (E2 would add a burning Trail; not recommended)'],
      ['dries wet · spreads in the world', 'as now, plus **fire thaws the chilled and frozen**']],
  ];
  {
    const t = $('fx');
    t.innerHTML = '<tr><th>Element</th><th>Magicka (unverified)</th><th>(a) Status</th><th>(b) Shape change</th><th>(c) Interactions</th></tr>';
    for (const [e, mg, ...cols] of FX) {
      const tr = document.createElement('tr');
      const td0 = mk('td'); const n = mk('span', 'eln'); const dot = mk('i'); n.style.setProperty('--c', C.ELEMENTS[e].color); n.append(dot, C.ELEMENTS[e].name); td0.append(n); tr.append(td0);
      const tdm = mk('td', 'mg'); tdm.append(mk('i', null, mg)); tr.append(tdm);
      for (const [now, draft] of cols) {
        const td = mk('td'); td.append(mk('span', 'now', now));
        td.append(draft ? withBold(mk('span', 'new'), draft) : mk('span', 'new same', 'unchanged'));
        tr.append(td);
      }
      t.append(tr);
    }
    for (const f of [
      '**Shape changes:** four elements bend the spell (water, lightning, arcane, earth). Fire, cold and life don\'t. Arcane\'s burst is the only one that makes a new area where the spell lands.',
      '**Statuses:** Arcane and Life have none. Three statuses mean "out of action" (frozen, knocked down, and the stun you remember). Draft: frozen = rooted and brittle, knocked down = drops what it was casting, stunned = interrupted but can walk.',
      '**Interactions:** Arcane and Life interact with nothing. Cold puts out fire but fire doesn\'t thaw ice. Water and cold put out burning only in the self-cast text.',
      '**Earth is never really a payload.** It outranks every form but Shield and Sigil, so it is always the form (a rock) or the material (a rock wall, stone orbital, stone armour). Its "Weight" trait is never applied as a payload. The material rule and the payload table already agree.',
    ]) $('fxFind').append(withBold(mk('div'), f));
  }
  // Interaction matrix: rows = status on the target, columns = the element that hits it next.
  {
    const cols = ['water', 'cold', 'lightning', 'arcane', 'earth', 'fire', 'life'];
    const ROWS = [
      ['Wet', ['wetter', '**frozen**', 'more damage, jumps further', '', '', 'dried', '']],
      ['Burning', ['**put out**', '**put out**', '', '', '', 'hotter', 'healed, still burning']],
      ['Chilled / Frozen', ['frozen (if chilled)', 'more', '', '', '**shatters**', '**thawed**', 'healed, still frozen']],
      ['Stunned (draft)', ['', '', 'longer', '', '', '', '']],
      ['Knocked down', ['shoved along the ground', '', '', '', '', '', '']],
      ['Exposed (draft)', ['', '', '', '', '', '', 'wards don\'t count, so everything lands']],
    ];
    const t = $('fxm');
    const head = document.createElement('tr'); head.append(mk('th', null, 'On the target ↓ / hits it →'));
    for (const e of cols) { const th = mk('th'); const i = mk('i'); i.style.setProperty('--c', C.ELEMENTS[e].color); th.append(i, C.ELEMENTS[e].name); head.append(th); }
    t.append(head);
    for (const [st, cells] of ROWS) {
      const tr = document.createElement('tr'); tr.append(mk('td', null, st));
      for (const c of cells) { const td = mk('td', c ? '' : 'e'); if (c) withBold(td, c); else td.textContent = '—'; tr.append(td); }
      t.append(tr);
    }
  }
  // Draft cards: [key, title, recommended (true / 'alt' / false), [[label, text, cls]], fade strip?]
  function draftCard(host, [k, title, rec, rows, fade]) {
    const d = mk('div', 'card dcard' + (rec === true ? ' rec' : ''));
    const kk = mk('div', 'k'); kk.append(mk('span', null, k));
    if (rec) kk.append(mk('span', 'rtag' + (rec === 'alt' ? ' alt' : ''), rec === 'alt' ? 'Fallback' : 'Claude\'s pick'));
    d.append(kk, mk('h4', null, title));
    if (fade) d.append(fadeStrip(fade));
    const dl = mk('dl');
    for (const [label, text, cls] of rows) { if (label) dl.append(mk('dt', null, label)); dl.append(withBold(mk('dd', cls || ''), text)); }
    d.append(dl); host.append(d);
  }
  // A fade strip: three moments, each [runes 'f'/'b'/'e'/'l' (full, bound, empty, floor), walls 'w'/'wc'/'r'/'rc'/'x' + opacity, caption]
  function fadeStrip(moments) {
    const g = mk('div', 'fade');
    for (const [runes, walls, cap] of moments) {
      const m = mk('div'); const r = mk('div', 'runes');
      for (const ch of runes) r.append(mk('i', { f: 'f', b: 'b', e: '', l: 'f fl' }[ch]));
      const w = mk('div', 'walls');
      for (const [kind, op] of walls) { const s = mk('span', { w: '', wc: 'crack', r: 'rock', rc: 'rock crack', x: 'gone' }[kind]); s.style.opacity = op; w.append(s); }
      m.append(r, w, mk('small', null, cap)); g.append(m);
    }
    return g;
  }
  for (const c of [
    ['E1', 'Keep it: fire, cold and life are status elements', false, [
      ['What changes', 'Nothing. Four elements bend the spell, three only leave a status.'],
      ['In the hands', 'Fire and cold are the reliable, readable tools; arcane and lightning are the showy ones. It matches the thin spray rows being the simple, fast tools.'],
      ['Cost', 'Stacking fire is just bigger numbers. Cold shows nothing until the target freezes.', 'dcost']]],
    ['E2', 'One shape change each', false, [
      ['What changes', '**Cold: Shatter** (splits into shards on impact; brings back Ricochet Bolt ★ and Ice Shrapnel ★). **Fire: Trail** (burning ground along its path). **Life: Linger** (whoever it touches regenerates).'],
      ['In the hands', 'Every element visibly bends the spell. The language gets richer.'],
      ['Cost', 'A rock with arcane, cold and fire would burst, shatter and leave a trail at once. Fire\'s trail overlaps the Fire patch and burning grass, and covers the floor. Needs the stacking rule S2.', 'dcost']]],
    ['E3', 'Payloads are statuses only; shape belongs to the form', false, [
      ['What changes', 'Arcane\'s burst becomes **Unstable** (bursts on the next heavy hit or on death). Lightning\'s chain becomes **Charged** (arcs on a moment later).'],
      ['In the hands', 'The cleanest rule ("a payload is what it leaves on them"), and new combos: mark with arcane, set off with a rock.'],
      ['Cost', 'Loses the instant explosion you called unique. Arcane becomes a set-up, not a payoff.', 'dcost']]],
    ['Mix', 'Claude\'s pick: E2 for Cold only', true, [
      ['What changes', 'Cold gets **Shatter**. Fire and Life stay status elements for now. Five shape-changers (water push, cold shatter, lightning chain, arcane burst, earth as the body) and two status elements (fire, life).'],
      ['Why', 'Shatter is cheap, already implied by "frozen shatters", and brings back two ★ spells. Fire\'s trail overlaps too much; Life is part 3.', 'dgain']]],
  ]) draftCard($('fxFix'), c);
  for (const c of [
    ['S1', 'Additive (now)', false, [
      ['Rule', 'Every rune adds its trait at full strength. A repeat makes it stronger; a new element adds a new trait.'],
      ['Cost', 'With E2, a four-payload spell has four statuses and up to three shape changes. Hard to read.', 'dcost']]],
    ['S2', 'Many statuses, one shape', true, [
      ['Rule', 'Every payload adds its status, but only the **leading payload** (most runes; ties by form priority) bends the shape. A rock with arcane and cold bursts or shatters, depending on which you put more of.'],
      ['In the hands', '"What I put most of decides how it lands": another lever you control by counting runes.', 'dgain'],
      ['Cost', 'A second shape element only adds its status. It still changes the spell, so the inert audit stays at 0.', 'dcost']]],
    ['S3', 'Split like auras', false, [
      ['Rule', 'Several payload kinds share the power, each weaker.'],
      ['Cost', 'Punishes mixing twice: runes already make mixing cost several pools.', 'dcost']]],
    ['Reading', 'A mix is an interaction inside one spell', true, [
      ['Reading', 'Water + cold freezes because the spell wets, then chills, in the same instant. Water + fire scalds because fire dries the wet into steam. The two mixes are the interaction matrix firing inside one cast, not special cases. Fire + cold and water + lightning cancel because their interaction destroys one of them.'],
      ['Cost', 'None in the rules; only how the Atlas explains it.', 'dgain']]],
  ]) draftCard($('fxStack'), c);

  // Shield models. Fade strips: full pool → running low → at the reserve floor (first rune).
  for (const c of [
    ['Model A', 'Endurance: barriers drink from your Shield pool', true, [
      ['How it costs', 'Every energy barrier and every ward is paid by the **Shield pool only**; the coating elements are paid once at cast. Upkeep = a small idle drain per standing barrier + a drain per hit absorbed. (Say regen 0.3/s and 0.1/s per idle wall: three idle walls break even, and archer fire runs you down.) Earth walls stay stuff: paid once, no drain.'],
      ['The ward', 'A barrier on your body, so it takes all the focused fire: **twice a wall\'s idle drain, and every reflected or resisted hit costs Shield.** Under heavy fire it lasts seconds. One ward per caster: Ward toss on an ally means none for you.'],
      ['Fading', 'All your barriers are drawn at the opacity of your Shield pool above the floor, so they fade **together**. An ally reads "their shields are thin" as "they are low". Hits add cracks.'],
      ['Reserve floor', 'Drain stops at the floor (say 1 rune). There, your **oldest** barrier breaks first. The floor rune is your emergency quick wall or ward.'],
      ['The specialist', 'An anchor: drops idle walls when a wave ends, raises the ward just as the volley lands, tosses it onto the focused ally. A deeper pool soaks a whole wave.', 'dgain'],
      ['Pillars', '1 timing is skill · 3 Ward toss is a real gift · 4 honest visible limit · 7 earth walls reward preparing; energy walls can\'t be stockpiled for free.', 'dgain'],
      ['Cost', 'The Shield pool becomes a second health bar. Hit-driven drain can empty you at the worst moment (the floor softens it). "How many walls can I hold?" has no fixed answer.', 'dcost']],
    [['fffff', [['w', 1], ['w', 1], ['r', 1]], 'Full pool: both energy walls solid. The rock wall is stuff.'], ['ffeee', [['wc', .55], ['wc', .55], ['rc', 1]], 'Running low: both fade together.'], ['leeee', [['x', 1], ['w', .18], ['rc', 1]], 'At the floor: the oldest breaks; the last one is a ghost.']]],
    ['Model B', 'Bind like Sigil; hits crack the bound rune', false, [
      ['How it costs', 'Each barrier or ward **binds one Shield rune**; no idle drain. The bound rune is the barrier\'s health: hits crack it, and when it breaks the rune regenerates from empty.'],
      ['Decided rule', '**Reverses "Shield keeps upkeep over time, Sigil binds."** Listed for the symmetry, not recommended.', 'dcost'],
      ['The ward', 'Binds a rune like a wall. To make it costly it would bind two, which breaks the one-rune rule.'],
      ['Fading', 'Per barrier (its own cracks), not per caster. Allies see which wall will go, not that you are low. Half of what you asked for.'],
      ['The specialist', 'Keeps more barriers at once, which is what the Sigil specialist does with devices. The roles blur.'],
      ['Cost', 'Barriers built in a lull are free to keep (turtling). The reserve floor plays no part. Gain: the simplest HUD, and no drain spikes.', 'dcost']],
    [['bbfff', [['w', 1], ['w', 1], ['r', 1]], 'Two walls bind two runes; the other three are free to cast.'], ['bbfff', [['wc', .4], ['w', 1], ['rc', 1]], 'Each wall fades on its own as it is hit.'], ['ebfff', [['x', 1], ['w', 1], ['rc', 1]], 'The cracked wall broke; its rune regrows from empty.']]],
    ['Model C', 'Pay for the work done, by material', false, [
      ['How it costs', 'Energy barriers are **free while idle**; every hit absorbed costs Shield, and a ward pays double per hit. **Earth walls reserve their Earth runes** while standing and give them back as they crumble or when you let them go (your earlier idea).'],
      ['Gain', 'Answers the open cap on stuff: your Earth pool is how much wall you can keep up.', 'dgain'],
      ['Fading', 'Energy barriers fade with the Shield pool, as in A. Earth walls don\'t fade; they crack.'],
      ['The specialist', 'An efficient absorber.'],
      ['Cost', 'Three cost modalities to learn (consume, reserve, bind). A builder with Earth reserved can\'t throw rocks. Idle energy walls are free, so turtling as in B.', 'dcost']],
    [['fffff', [['w', 1], ['r', 1], ['r', 1]], 'Idle: no drain. Two rock walls hold back two Earth runes.'], ['fffee', [['wc', .6], ['rc', 1], ['r', 1]], 'Archers: hits drain Shield, the wall fades.'], ['leeee', [['x', 1], ['rc', 1], ['x', 1]], 'A rock wall fell and gave back its Earth runes.']]],
    ['Option', 'From C, on top of A: earth walls reserve Earth', 'alt', [
      ['What', 'Keep Model A, but standing earth walls reserve their Earth runes (returned as they crumble). It closes the open cap on stuff.'],
      ['Cost', 'It changes how building feels: walls up means fewer rocks to throw. A separate question (f-shield-earth).', 'dcost']]],
  ]) draftCard($('shModels'), c);

  // Life review table: [spell, recipe, now, problem, bad?]
  {
    const LIFE = [
      ['Life beam', 'Life · Force', 'Sustained beam; heals whatever it touches. Sustain cost.', 'Fine. The most skilled heal: aim, angle, upkeep. An enemy in the way gets healed (an aiming mistake).', false],
      ['Healing ring', 'Life · Area', 'Heals everyone around you, enemies included.', 'In a scrum it heals the enemy beside your ally. Magicka\'s oldest complaint (unverified).', true],
      ['Healing spring', 'Life · Place', 'A lingering patch; heals whoever stands in it.', 'Enemies standing in it heal too. Otherwise good (place it behind the line).', true],
      ['Healing swing', 'Life · Weapon', 'One imbued swing that heals.', 'Odd but harmless; overlaps the Mending rod.', false],
      ['Mend (payload)', 'Life + anything it doesn\'t lead', 'The spell heals what it hits, along with its other effects.', 'Self-defeating: a rock that heals the enemy it hits, a healing earthquake, a beam that heals and burns.', true],
      ['Healing orbitals ★', 'Sigil + Life · Area', 'Orbs heal the first hurt ally that comes close.', 'Fine alone. With Fire, each orb heals your ally and sets them alight.', true],
      ['Life beam turret', 'Sigil + Life · Force', 'Auto-beams the nearest hurt ally.', 'With Fire, it burns the ally it heals.', true],
      ['Life glyph', 'Sigil + Life · Place', 'Goes off when someone steps on it, healing them.', 'An enemy can step on it: a heal trap is mostly a gift to them.', true],
      ['Mending rod', 'Sigil + Life · Weapon', 'A conjured rod whose hits heal.', 'Fine, and funny.', false],
      ['Regeneration', 'Sigil + Life · Self', 'You heal over time.', 'Called an aura, but it only affects you; every other aura affects those around you.', true],
      ['Heal', 'Life · Self (or ally)', 'Heals you; hold to heal over time.', 'Magicka\'s self-heal spam (unverified). Runes cap it by the Life pool, which mostly solves it.', false],
      ['Elemental wave + Life', 'Shield + Life · Force', 'Everyone it passes is healed, enemies too.', 'Heals the enemy line it sweeps through.', true],
      ['Curtain arc / ring + Life', 'Shield + Life · Place, Area', 'Crossing it heals.', 'Enemies walk through your healing wall and are healed.', true],
      ['Ward + Life', 'Shield + Life · Self', '"A bubble that resists life."', 'Nonsense: nobody attacks with life.', true],
      ['Stone armour coated in life', 'Shield + Earth + Life · Self', 'Melee attackers are healed.', 'Self-defeating.', true],
      ['Mending bulldoze', 'Sigil + Earth + Life · Self', 'Whoever you shove is healed (enemies too).', 'Self-defeating: you mostly shove enemies.', true],
      ['Life cancels Arcane', 'queue', 'Opposites, as in Magicka.', 'Fine: "Arcane harms, Life mends" stays a clean pair.', false],
    ];
    const t = $('lifeT');
    t.innerHTML = '<tr><th>Spell</th><th>Recipe</th><th>What it does now</th><th>Problem</th></tr>';
    for (const [n, r, now, prob, bad] of LIFE) {
      const tr = document.createElement('tr');
      tr.append(mk('td', null, n), mk('td', null, r), mk('td', null, now), mk('td', bad ? 'bad' : 'ok', prob));
      t.append(tr);
    }
  }
  for (const c of [
    ['L1', 'Magicka\'s rule, tidied', 'alt', [
      ['Rule', 'Life heals whatever it touches, friend or foe (the decided rule stays). Life in a damage spell still heals what it hits: accepted as a mistake, like Hurt on yourself.'],
      ['Fixes only the nonsense', '**On a structure, Life mends the structure:** a Life curtain regenerates (less upkeep), coated stone armour mends itself, and Shield + Life on yourself is a **Mending ward** (heals you slowly while it holds). The bulldoze heals you per shove, not them. Life devices aim at hurt allies; the Life glyph goes off only for allies.'],
      ['In the hands', 'As in Magicka: healing well is about aim. Keep the ring out of the scrum.'],
      ['Cost', 'About 190 "oops" spells stay in the language. Pillar 2 says spells are words; these words mean mistake.', 'dcost']]],
    ['L2', 'Life knows friends', false, [
      ['Rule', '**Changes the decided rule** "Life just heals what it touches." Life heals allies and passes through enemies. In a damage spell, it heals the allies it touches; they still take the rest.'],
      ['In the hands', 'Heals become easy and safe: throw them into the scrum without thinking.'],
      ['Cost', 'The comedy and the skill of aiming a heal are gone. It edges back to the retired "Life makes a spell ally-safe": one Life rune softens friendly fire from anything, which undermines pillar 3. Still muddled in damage spells.', 'dcost']]],
    ['L3', 'Life leads: a spell with Life is a support spell', true, [
      ['Rule', '**Life outranks Earth** (just under Shield and Sigil), so no damage spell ever carries Life; inside a Sigil device Life leads too. **The other elements lend their shape, never their harm:**'],
      ['Support dialect', 'Lightning: the heal **jumps ally to ally**. Cold: it **splits into shards** that each find an ally (needs Shatter). Water: a **rescue nudge** that also puts out burning. Earth: a **lobbed heal-stone** that bursts (earth is the material). Fire: no shape, so it **thaws and dries** the ally. Arcane: cancels.'],
      ['Inside Shield', 'Shield still outranks Life, so there Life **mends the structure** (as in L1).'],
      ['In the hands', 'Green always helps. Chain heal through the backline, a heal-stone over a wall, a turret that hops between allies. Support gets its own words in the same grammar.', 'dgain'],
      ['Cost', '**An exception to proposal C\'s core rule** ("one trait per element, the same in every form"): inside a Life spell, elements mean shape, not harm. Changes the form priority. The healing rock is gone.', 'dcost']]],
  ]) draftCard($('lifeD'), c);
  for (const c of [
    ['(a)', 'Everyone it touches', false, [['', 'As decided, and as in Magicka. Aim is the skill; healing an enemy is friendly-fire comedy.']]],
    ['(b)', 'Allies only', false, [['', 'That is L2. Safe and easy; loses the aiming skill and the comedy. Changes a decided rule.']]],
    ['(c)', 'Everyone, but the sculpting wand spares enemies', true, [['', 'While you hold the Sigil wand your spells "only do what you mean": your harm spares allies and **your heals spare enemies**. Keeps the decided rule and the comedy, and uses a tool that already exists.']]],
    ['All', 'Smaller calls, any direction', false, [
      ['Regeneration', 'Becomes a true aura: you and those around you regenerate slowly (under (a), enemies beside you too).'],
      ['Self-heal', 'Tap spends a Life rune for a burst; hold channels as sustain (Life regen debt), moving slowly. Your heal rate is your Life regen: a Life specialist is the healer.'],
      ['Auto-heals', 'Spring = a zone placed ahead of time. Orbitals = reactive. Turret = ranged, each heal drawn from your Life runes. Glyph = allies only, a heal on a fallback line. All prepaid and finite, so none is a free heal-bot.']]],
  ]) draftCard($('lifeWho'), c);

  // ---------- saving: questions (answers) and cell ratings (cells) ----------
  const answers = {}, ratings = {};
  const LS = 'spell-atlas-v1';
  try { const x = JSON.parse(localStorage.getItem(LS) || '{}'); Object.assign(answers, x.answers || {}); Object.assign(ratings, x.ratings || {}); } catch { /* storage blocked */ }
  const setSave = (t, w) => { $('saveState').textContent = t; $('saveState').classList.toggle('warn', !!w); };
  let db = null; const chains = {};
  function persist(coll, id, store, patch) {
    store[id] = Object.assign({ mark: null, note: '' }, store[id], patch);
    try { localStorage.setItem(LS, JSON.stringify({ answers, ratings })); } catch { /* storage blocked */ }
    paint();
    if (!db) return;
    setSave('Saving…');
    const body = { mark: store[id].mark, note: store[id].note, updatedAt: new Date().toISOString() };
    const k = coll + '/' + id;
    chains[k] = (chains[k] || Promise.resolve()).then(() => db.doc(k).set(body))
      .then(() => setSave('Everything saved'))
      .catch(() => setSave('Couldn’t save. It is kept in this browser.', true));
  }
  function verdict(get, set) {
    const seg = document.createElement('div'); seg.className = 'verdict';
    for (const [v, l] of [['keep', '★ Keep'], ['maybe', '? Maybe'], ['cut', '✗ Cut']]) {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.v = v; b.textContent = l;
      b.setAttribute('aria-pressed', String(get()?.mark === v));
      b.addEventListener('click', () => set({ mark: get()?.mark === v ? null : v }));
      seg.append(b);
    }
    return seg;
  }
  function noteBox(get, set, placeholder) {
    const ta = document.createElement('textarea'); ta.rows = 2; ta.placeholder = placeholder; ta.value = get()?.note || '';
    let timer;
    ta.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => set({ note: ta.value }), 900); });
    ta.addEventListener('blur', () => { clearTimeout(timer); if ((get()?.note || '') !== ta.value) set({ note: ta.value }); });
    return ta;
  }
  function rateBox(id, label) {
    const wrap = document.createElement('div'); wrap.style.display = 'grid'; wrap.style.gap = '6px';
    const l = document.createElement('div'); l.className = 'label'; l.style.margin = '6px 0 0'; l.textContent = `Rate this cell: ${label}`;
    const get = () => ratings[id]; const set = (patch) => persist('cells', id, ratings, patch);
    wrap.append(l, verdict(get, set), noteBox(get, set, 'Note on this cell (optional)'));
    wrap.dataset.rate = id;
    return wrap;
  }
  const QUESTIONS = [
    // Overnight drafts (2026-11-04): shown inside the drafts section, not in "What do you think?"
    ['f-effects-table', 'Status / shape change / interactions as the structure', 'Each element owns one status, at most one shape change, and interactions with other statuses. Is this the right way to think about payload effects? Anything the table gets wrong about Magicka?', true],
    ['f-shape-gaps', 'Shape-change gaps: E1, E2, E3, or Cold only?', 'Fire, cold and life don\'t bend the spell. E1 keeps it (status elements). E2 gives each one (Cold Shatter, Fire Trail, Life Linger). E3 turns burst and chain into statuses. Claude\'s pick: E2 for Cold only (Shatter brings back Ricochet Bolt and Ice Shrapnel). Keep = Claude\'s pick; say which otherwise.', true],
    ['f-statuses', 'The draft statuses and interactions', 'Lightning stuns (a short interrupt; you can still walk). Arcane exposes (wards and resistances don\'t count for a moment, structures take extra). Fire thaws the frozen. Water and cold put out burning in every spell. Earth grounds lightning chains in the world. A wet caster who casts lightning shocks themselves. Keep, or which to cut?', true],
    ['f-stacking', 'Stacking: one shape per spell (S2)', '2× Fire is depth (a hotter burn), Fire + Lightning is breadth (a burn plus a chain); both cost two runes. S2: every payload adds its status, but only the leading payload (most runes) bends the shape. Plus: a mix (scald, freeze) is just an interaction inside one spell, not a special rule.', true],
    ['f-shield-model', 'Shield\'s cost: Model A (endurance)?', 'A: every energy barrier and ward drinks from your Shield pool (idle drain + per hit); elements paid once; earth walls stay stuff. B: Shield binds like Sigil (reverses the decided split). C: free while idle, pay per hit, earth walls reserve Earth. Keep = A.', true],
    ['f-shield-self-cost', 'The ward gets a real cost', 'The ward is a barrier on your body, so it takes all the focused fire: twice a wall\'s idle drain, and every reflected or resisted hit costs Shield. Under heavy fire it lasts seconds. One ward per caster: Ward toss onto an ally means none for you.', true],
    ['f-shield-fade', 'Shields fade with your pool; the oldest breaks at the floor', 'All your barriers are drawn at the opacity of your Shield pool above the reserve floor, so they fade together and allies read it as "they are low". At the floor (say 1 rune), drain stops and your oldest barrier breaks first. The floor rune is always there for an emergency wall or ward.', true],
    ['f-shield-earth', 'Should earth walls reserve their Earth runes?', 'Optional, from Model C: a standing earth wall holds back the Earth runes it was made of, and gives them back as it crumbles or when you let it go. It answers the open cap on stuff, but walls up means fewer rocks to throw.', true],
    ['f-life-direction', 'Life: L3 (Life leads)?', 'L1: Magicka\'s rule, fix only the nonsense cells. L2: Life heals allies only (changes the decided rule). L3: Life outranks Earth, so it never rides in a damage spell; inside a Life spell the other elements lend their shape, never their harm (chain heal, heal-stone, rescue nudge). Keep = L3; say if you prefer L1 or L2.', true],
    ['f-life-payload', 'Life never harms; on a structure it mends the structure', 'Today 195 of 678 spells heal and harm at once (a healing rock, a turret that burns the ally it heals). Under L3 Life never rides in a damage spell. In a Shield structure, Life mends the structure itself: a regenerating curtain, self-mending stone armour, and Shield + Life on yourself becomes a Mending ward instead of "resists life".', true],
    ['f-life-enemies', 'Who does Life heal?', '(a) Everyone it touches (decided, Magicka). (b) Allies only. (c) Everyone, but while you hold the sculpting wand your heals spare enemies, just as your harm spares allies. Claude\'s pick: (c). Keep = (c).', true],
    ['f-other', 'Anything else on the overnight drafts?', 'Regeneration as a true aura, the self-heal tap/hold split, the jobs of the four auto-heals, or anything that felt off.', false],
    ['g-look', 'The form picks the shape, the carried element picks the look', 'Your call, the Magicka way: Arcane + Fire is a Fire beam, Earth + Fire a Fireball, Lightning + Fire a Flame arc, Earth + Water + Cold an Ice boulder. Applies to the Earth, Arcane and Lightning forms; the most numerous carried element sets the look. Life keeps its healing look until the Life review. Do the new names read right?', true],
    ['g-shards', 'Water + Cold as Force = Ice shards', 'Your note on the freezing spray: as Force the mix changes shape into a volley of jagged shards that pierce and chill, freezing only when enough land. The other casts keep their freezing effect (Freezing splash, Ice sheet). Right strength?', true],
    ['d-sigil', 'Sigil as Shield\'s opposite?', 'Shield makes barriers, Sigil manifests things: + Force a turret casting the other elements\' Force spell, + Area orbitals, + Place a glyph (drag: a line glyph), + Self an aura, + Weapon a conjured weapon. Shield and Sigil cancel, and neither stacks. Does the pair feel right in the hands?', true],
    ['e-bind', 'Bind as Sigil\'s cost', 'Every Sigil spell binds one Sigil rune until it goes off, breaks or runs out, so your Sigil pool is how many devices you can keep. Glyphs and orbitals are paid once at cast. A turret (your correction) never runs out on its own: each shot draws from your pool, and it stalls only when you run dry. Shield keeps upkeep over time (endurance); Sigil binds (count). Does it read in the cost tags?', true],
    ['e-null-sigil', 'The pure Sigil set', 'Sigil alone shapes your own magic, the way Shield alone turns theirs around: a Lens (Force: spells through it come out amplified), Rune motes (Area: each cast spends one and refunds part of a rune), a Waypoint glyph (Place: Release teleports you to it), a Double (Self) and a Sculpting wand (Weapon: your spells spare allies). Keep, swap any?', true],
    ['e-double', 'The Double as the Sigil self-cast', 'You liked the idea; this is the costed version. A conjured copy of you appears beside you, and enemies target it. It repeats each spell you cast at half power from its own spot (a crossfire), but not for free: each repeat draws half that spell\'s rune cost from your pool, and if you can\'t cover it, the copy skips that spell. It binds a Sigil rune while it exists. It should be as strong as the reflect ward. Alternatives welcome.', true],
    ['e-auras', 'The aura list', 'Sigil + Self affects those around you and never boosts your spells: Fire aura (burns), Frost aura (slows), Mist aura (wets enemies, douses allies), Regeneration (you heal over time), Bulldoze (shove what you walk into), Haste, Glass cannon (more damage, but easily knocked down). Water mixes become Steam veil and Freezing mist.', true],
    ['e-stack', 'Earth is the material when stacking', 'Wards: Shield + Earth is stone armour; add Fire and it is coated in fire (resists physical and fire, melee attackers catch fire). Auras: Earth makes a Bulldoze, and the other elements coat each shove (a burning bulldoze). Without Earth, each element adds its own resistance or aura, each weaker. Less boring than "it just does both"?', true],
    ['d-sigil-name', 'A better name for Sigil?', '"Sigil" is a working name for the device element. Anything that says "offensive thing I put in the world"?', false],
    ['d-water-mix', 'Steam and ice as effects, not elements', 'Water + fire stay separate in the queue, and the spell scalds and leaves a sight-blocking mist (Scalding spray, Steam cloud). Water + cold freezes the soaked solid and makes them brittle (Freezing spray, Ice sheet). Does it read well without dedicated elements?', true],
    ['d-shove', 'Shield + Force = a forward wave', 'Your call: a wave sweeps forward along your aim and breaks, hitting everyone it passes. Water is a Tidal wave (soak a crowd), Earth a Fault line (knock everyone down), other elements an elemental wave, Shield alone a shove wave. It is a one-off and does not stay. It also gives Tidal Wave and Fault Line a home.', true],
    ['d-arc', 'Place without a drag = an arc around you', 'The new quick wall: let go of Place without dragging and an arc rises around you, centred on you and facing the cursor, at a default length. It replaces the dome. Dragging still draws a wall, and curving the drag bends it.', true],
    ['d-plain', 'Self and Weapon without Shield or Sigil work as in Magicka', 'My call, following your note: plain elements on yourself just hit you (Life heals, Water douses, Fire burns), and a plain Weapon cast is one imbued swing. Conjured weapons and buffs now need Sigil (or Shield). Keep, or give the plain casts something more?', true],
    ['c-overall', 'Form × cast + payload as the core rule?', 'The strongest element picks the form, the cast picks where it goes, every other element adds its one trait. Every element always does something.', true],
    ['c-self-snap', 'Self + cursor on an ally', 'Replaces Point on an ally. Self casts snap to an ally near the cursor, otherwise they land on you. The ally gets a ring before you cast.', true],
    ['c-place', 'Hold Area to place at the cursor', 'Replaces Point on the ground. Tap Area = around you, hold = a reticle at the cursor, let go to cast there (Geyser, Flood, Strike, glyphs).', true],
    ['c-lines', 'Where should lines live?', 'The tap-Weapon column (Tidal Wave, Fault Line, fire line, frost line…) is removed. Lines should come from the elements, the way Arcane or Life makes a beam. Which element, or should dragging a Place draw any spell as a line?', false],
    ['c-buffs', 'Self buffs are now auras', 'The old buffs (Empower, Riptide, Vigor, Frostbite, Heavy hand, Frost edge) are gone; Haste, Glass cannon and Fire aura stay. Spells get stronger by adding runes, never by a buff. Rate the new list under "The aura list". Anything you miss from the old one?', true],
    ['c-lens', 'Beams through a structure pick up its elements', 'Still true for Shield curtains (put a fire curtain in front of your arcane beam). The pure Sigil Lens is the other half: it amplifies anything cast through it instead of adding elements. Both, or just one?', true],
    ['c-ally-safe', 'Ally-safe damage: the sculpting wand', 'Answered by the Sigil + Weapon wand: while you hold it, your spells spare allies, at the cost of your Weapon cast and a bound Sigil rune. Attuned Blast lives there now. Confirm, or should it be cheaper or a Magick?', true],
    ['c-release', 'Release does a lot now: one key or two?', 'One key means "set off everything I prepared": turrets\' last shot, orbitals, glyphs, rock walls, and now teleporting to your waypoint. With a waypoint and a trap glyph down, one press does both. Two keys means you can keep a wall, or stay put, while setting off glyphs.', false],
    ['c-thin', 'Spray rows are thin', 'Cold only takes the form with no Shield, Sigil, Earth, Arcane, Life or Lightning, and Fire cancels it; Water now adds a Freeze mix instead of turning it into Ice. Fine, or should sprays carry more?', false],
    ['c-other', 'Anything else?', 'Cells you loved or hated, or rules that felt wrong.', false],
  ];
  const qEls = {};
  function qCard(id, title, hint, hasVerdict) {
    const card = document.createElement('div'); card.className = 'q';
    const p = document.createElement('p'); p.textContent = title;
    const s = document.createElement('small'); s.textContent = hint;
    card.append(p, s);
    const get = () => answers[id]; const set = (patch) => persist('answers', id, answers, patch);
    let seg = null; if (hasVerdict) { seg = verdict(get, set); card.append(seg); }
    const ta = noteBox(get, set, 'Your answer'); card.append(ta);
    qEls[id] = { seg, ta };
    return card;
  }
  // The f-* questions were answered in the 2026-11-04 review (unanswered ones = Claude's pick); they are no longer shown.
  for (const [id, title, hint, hasVerdict] of QUESTIONS) if (!id.startsWith('f-')) $('qs').append(qCard(id, title, hint, hasVerdict));

  // ---------- what the 2026-11-04 review decided, each open question beside its item ----------
  // [title, from, text, question?: [id, title, hint, hasVerdict]]
  const DECIDED = [
    ['Life leads: a spell with Life in it is a support spell', 'L3 · your pick',
      'Life outranks Earth (only Shield and Sigil beat it), so no damage spell carries Life. The other elements lend their shape: Lightning a Chain heal (ally to ally), Cold Healing shards, Water a Rescue spray (nudges allies out of danger, puts out burning), Earth a lobbed Heal-stone, and Fire a Healing spray (your note: a cone; the plain Life Force stays a beam). Life devices heal (a Healing spray turret, healing-shard orbitals), and the Life glyph goes off only for allies.',
      ['h-life-shapes', 'The support dialect: do the names and shapes read?', 'Chain heal, Healing shards, Rescue spray, Heal-stone, Healing spray. Keep, or rename / reshape any?', true]],
    ['Shield + Life makes healing zones', 'your note',
      'You didn\'t agree with the "mends the structure" idea: a Life curtain, ring or wave is a healing zone that heals whoever crosses or stands in it. Shield + Life on yourself is a Mending ward (heals you slowly while it holds), and stone armour coated in Life heals you, not your attackers. The Mending bulldoze heals you a little per shove.', null],
    ['Who Life heals: everyone, but the sculpting wand spares enemies', '(c) · Claude\'s pick',
      'Life still heals whoever it touches. While you hold the sculpting wand, your spells do only what you mean: harm spares allies, heals spare enemies. It covers the Healing ring and, for consistency (your answer), the Healing spring too: a spring placed while you hold the wand spares enemies.', null],
    ['Life + Weapon: a one-off with reach, or a long-lasting touch', 'your note',
      'Plain Life + Weapon is the Healing palm: one push of healing that reaches an ally a few steps ahead, no swing. Sigil + Life + Weapon conjures Healing hands: glowing hands that heal an ally for as long as you keep contact, short reach, long-lasting. No healing swords (your flavour note).', null],
    ['Regeneration is a true aura; self-heal taps or channels', 'Claude\'s pick',
      'Regeneration heals you and everyone close by (enemies too, unless you hold the wand). Life on yourself: tap for a one-rune burst, hold to channel as sustain while moving slowly. The four auto-heals have separate jobs (spring placed ahead, orbitals reactive, turret ranged and paid per heal, glyph allies only).', null],
    ['Shield is endurance: barriers and the ward drain your Shield pool', 'Model A · your pick',
      'Every energy barrier and the ward drain your Shield pool: a low trickle while idle (your note: keep it low), more for every hit absorbed. The coating elements are paid once. All your shields fade together as your pool runs down; at the reserve floor the oldest breaks first. The ward drains twice a wall\'s idle rate, and you hold one at a time (tossing it to an ally means none for you). Earth walls stay stuff: paid once, no drain, and they don\'t reserve Earth runes for now (you agreed: first see in a prototype whether stone walls get spammed).', null],
    ['Each element: one status, and four bend the spell', 'E2 for Cold, S2 · Claude\'s picks',
      'Statuses: Water soaks (and puts out burning), Fire burns (and dries, and thaws), Cold chills to frozen (and puts out burning), Lightning shocks and stuns briefly (you can still walk), Arcane exposes (wards and resistances stop counting for a moment), Earth knocks down. Shape changes: Water pushes, Cold shatters into flying shards, Lightning chains, Arcane bursts. Only the element you put most of bends the shape; the others add their status. Rock grounds lightning: chains don\'t jump through rock walls. A wet caster who casts lightning shocks themselves.', null],
    ['Sigil alone: the Lens is placed, and Force is a Blink', 'your note · Claude\'s reading',
      'You suggested swapping: placing the lens at the cursor is more intuitive, and a teleport needn\'t be a glyph. So Sigil + Place alone is the Lens, and Sigil + Force alone is Blink: you blink a short way along your aim, instantly, and your Sigil rune is held a moment so you can\'t chain blinks. The waypoint glyph is gone. You confirmed: Blink is just a teleport, as in the original, no waypoint.', null],
    ['Arcane on yourself attunes you', 'your answer',
      'Plain Arcane on yourself is no longer just Hurt: it runs raw magic through you, stings, and your runes regenerate faster for a moment (Attune), a breather between waves. The other plain elements keep their Magicka effects: Life heals, Water douses, Fire dries you off.', null],
  ];
  for (const [title, from, text, q] of DECIDED) {
    const row = mk('div', 'row' + (q ? '' : ' solo'));
    const left = mk('div'); const h = mk('h4', null, title); h.append(mk('span', 'from', from)); left.append(h, mk('p', null, text));
    row.append(left);
    if (q) row.append(qCard(...q));
    $('decList').append(row);
  }
  function paint() {
    for (const [id, { seg, ta }] of Object.entries(qEls)) {
      const a = answers[id] || {};
      if (document.activeElement !== ta && ta.value !== (a.note || '')) ta.value = a.note || '';
      if (seg) for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.v === a.mark));
    }
    const box = document.querySelector('[data-rate]');
    if (box) {
      const r = ratings[box.dataset.rate] || {};
      for (const b of box.querySelector('.verdict').children) b.setAttribute('aria-pressed', String(b.dataset.v === r.mark));
      const ta = box.querySelector('textarea'); if (document.activeElement !== ta && ta.value !== (r.note || '')) ta.value = r.note || '';
    }
    for (const cell of gridCells) {
      if (!cell.s) continue;
      const m = ratings[cellId(cell.s)]?.mark;
      cell.mk.className = 'mk ' + (m || ''); cell.mk.textContent = m ? { keep: '★', maybe: '?', cut: '✗' }[m] : '';
    }
  }
  (async () => {
    const t = setTimeout(() => setSave('Can’t reach saved answers yet. They stay in this browser for now.', true), 10000);
    try { db = await window.claude?.use?.('db'); } catch { db = null; }
    if (!db) { clearTimeout(t); setSave('Saved in this browser only'); return; }
    let ready = 0;
    const onSnap = (store) => (snap) => {
      for (const d of snap.docs) { const x = d.data(); store[d.id] = { mark: x.mark || null, note: x.note || '' }; }
      if (!snap.metadata.fromCache && ++ready >= 2) { clearTimeout(t); if (!snap.metadata.hasPendingWrites) setSave('Everything saved'); }
      paint();
    };
    const fail = () => { clearTimeout(t); db = null; setSave('Saved answers are unavailable. They stay in this browser.', true); };
    db.collection('answers').onSnapshot(onSnap(answers), fail);
    db.collection('cells').onSnapshot(onSnap(ratings), fail);
  })();

  buildGrid();
  render(); paint();
})();
