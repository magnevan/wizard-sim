(function () {
  const A = window.SpellTreeA;
  const MODES = [
    ['force', 'Force', 'from you'], ['area', 'Area', 'around you'], ['self', 'Self', 'on you'],
    ['weapon', 'Weapon', 'swing & line'], ['point', 'Point', 'at cursor'],
  ];
  const TARGETS = [['ground', 'Ground'], ['ally', 'An ally'], ['enemy', 'An enemy']];
  const state = { queue: ['earth', 'arcane'], mode: 'point', seal: false, target: 'ground', event: '', variant: 'a' };
  const $ = (id) => document.getElementById(id);

  // ---------- composer ----------
  for (const e of A.BASE) {
    const el = A.ELEMENTS[e];
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'el'; b.style.setProperty('--c', el.color);
    b.innerHTML = `<i></i>${el.name}<kbd>${el.key}</kbd>`;
    b.addEventListener('click', () => add(e));
    $('pad').append(b);
  }
  for (const [m, label, hint] of MODES) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'seg' + (m === 'point' ? ' new' : ''); b.dataset.m = m;
    b.innerHTML = `${label}<small>${hint}</small>${m === 'point' ? '<span class="tag-new">NEW</span>' : ''}`;
    b.addEventListener('click', () => { state.mode = m; render(); });
    $('modes').append(b);
  }
  for (const [t, label] of TARGETS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'seg'; b.dataset.t = t; b.textContent = label;
    b.addEventListener('click', () => { state.target = t; render(); });
    $('targets').append(b);
  }
  for (const b of document.querySelectorAll('#variant button')) {
    b.addEventListener('click', () => { state.variant = b.dataset.v; render(); });
  }
  $('seal').addEventListener('click', () => { state.seal = !state.seal; render(); });
  $('clear').addEventListener('click', () => { state.queue = []; state.event = ''; render(); });

  function add(e) { const r = A.addElement(state.queue, e); state.queue = r.queue; state.event = r.event || ''; render(); }

  document.addEventListener('keydown', (ev) => {
    if (ev.target.closest('textarea, input')) return;
    const k = ev.key.toUpperCase();
    const e = A.BASE.find((x) => A.ELEMENTS[x].key === k);
    if (e && !ev.ctrlKey && !ev.metaKey) { add(e); ev.preventDefault(); return; }
    if (/^[1-5]$/.test(ev.key)) { state.mode = MODES[+ev.key - 1][0]; render(); return; }
    if (ev.key === ' ') { state.seal = !state.seal; render(); ev.preventDefault(); return; }
    if (ev.key === 'Escape' || ev.key === 'Backspace') { state.queue = []; state.event = ''; render(); }
  });

  // ---------- render ----------
  function describeRecipe(q, mode, o) {
    const els = q.map((e) => A.ELEMENTS[e].name).join(' + ') || 'nothing';
    const m = MODES.find((x) => x[0] === mode)[1];
    return `${o.seal ? 'Seal + ' : ''}${m}${mode === 'point' && o.target && o.target !== 'ground' ? ` on ${o.target}` : ''}: ${els}`;
  }
  function render() {
    // queue
    $('queue').replaceChildren(...Array.from({ length: A.MAX }, (_, i) => {
      const d = document.createElement('div'); const e = state.queue[i];
      d.className = 'slot' + (e ? ' full' : '');
      if (e) { d.style.setProperty('--c', A.ELEMENTS[e].color); d.title = A.ELEMENTS[e].name; d.textContent = A.ELEMENTS[e].combined ? A.ELEMENTS[e].name : ''; }
      return d;
    }));
    $('event').textContent = state.event;
    for (const b of $('modes').children) b.setAttribute('aria-pressed', String(b.dataset.m === state.mode));
    $('targetWrap').hidden = state.mode !== 'point';
    for (const b of $('targets').children) b.setAttribute('aria-pressed', String(b.dataset.t === state.target));
    $('seal').setAttribute('aria-pressed', String(state.seal));
    for (const b of document.querySelectorAll('#variant button')) b.setAttribute('aria-pressed', String(b.dataset.v === state.variant));
    $('variantNote').hidden = state.variant !== 'a1';

    const opts = { seal: state.seal, target: state.target, variant: state.variant };
    const r = A.resolve(state.queue, state.mode, opts);
    const sp = $('spell'); sp.replaceChildren();
    const form = document.createElement('div'); form.className = 'form'; form.textContent = (state.seal ? 'sealed · ' : '') + r.form;
    const h = document.createElement('h3'); h.textContent = r.title;
    const p = document.createElement('p'); p.textContent = r.text;
    const leaf = document.createElement('div');
    leaf.className = 'leaf' + (r.leaf ? '' : ' none');
    leaf.textContent = r.leaf ? `Your spell: ${r.leaf}` : 'Not on your list yet: a leaf the tree implies';
    const pow = document.createElement('div'); pow.className = 'power'; pow.title = 'Power (elements used)';
    for (let i = 0; i < A.MAX; i++) { const s = document.createElement('i'); if (i < r.power) s.className = 'on'; pow.append(s); }
    const rec = document.createElement('div'); rec.className = 'recipe'; rec.textContent = describeRecipe(state.queue, state.mode, opts);
    sp.append(form, h, p, leaf);
    if (r.notes.length) { const ul = document.createElement('ul'); ul.className = 'notes'; for (const n of r.notes) { const li = document.createElement('li'); li.textContent = n; ul.append(li); } sp.append(ul); }
    sp.append(pow, rec);

    // all combinations for this queue
    const all = $('all'); all.replaceChildren();
    for (const seal of [false, true]) for (const [m, label] of MODES) {
      const o = { seal, target: state.target, variant: state.variant };
      const x = A.resolve(state.queue, m, o);
      const c = document.createElement('button'); c.type = 'button'; c.className = 'cell' + (m === state.mode && seal === state.seal ? ' current' : '');
      const mm = document.createElement('span'); mm.className = 'm'; mm.textContent = (seal ? 'Seal + ' : '') + label;
      const b = document.createElement('b'); b.textContent = x.title;
      const t = document.createElement('span'); t.textContent = x.text;
      c.append(mm, b, t);
      if (x.leaf) { const l = document.createElement('span'); l.className = 'lf'; l.textContent = '★ ' + x.leaf; c.append(l); }
      c.addEventListener('click', () => { state.mode = m; state.seal = seal; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
      all.append(c);
    }
  }

  // ---------- leaves ----------
  for (const [name, mark, q, mode, o] of A.RECIPES) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'lchip';
    b.innerHTML = `<span class="s ${mark === '?' ? 'qm' : ''}">${mark}</span>`; b.append(name);
    b.title = describeRecipe(q, mode, o);
    b.addEventListener('click', () => {
      Object.assign(state, { queue: q.slice(), mode, seal: !!o.seal, target: o.target || 'ground', event: describeRecipe(q, mode, o) });
      render(); window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    $('leaves').append(b);
  }

  // ---------- questions (saved to db) ----------
  const QUESTIONS = [
    ['proposal-a', 'Overall: does "Magicka plus Point and Seal/Release" feel like the right direction?', 'Rate it, and say what feels off.', true],
    ['q-point-binding', 'Point cast binding', 'Mouse button 4, Ctrl+Right click, or a key? On gamepad, a trigger with a reticle.'],
    ['q-seal-keys', 'Seal and Release: two keys or one?', 'For example, tap to seal and hold to release.'],
    ['q-auto-triggers', 'Auto-triggers from elements', 'Shield in a stored spell = fires when you are hit. Life + Shield in a rune = effigy. Elegant, or too hidden?'],
    ['q-wind', 'Wind as a ninth element?', 'For gusts and pushing clouds and surfaces. It would need an opposite.'],
    ['q-attuned', 'Life makes a spell spare allies', 'A good rule, or should ally safety be its own verb?'],
    ['q-vessels', 'How many vessel slots to start?', 'For example 1 staff slot, 3 runes, 5 orbitals.'],
    ['q-a1', 'Rule set A.1: better or worse than A?', 'Point on an ally casts your Self spell on them, Self gains enchantments (haste, stoneskin, ethereal…), Shield on an enemy is a Cage, Yank needs Arcane alone.'],
    ['q-other', 'Anything else?', 'Spells you found here that you liked, or rules that felt wrong.'],
  ];
  const answers = {};
  const LS = 'spell-tree-answers';
  try { Object.assign(answers, JSON.parse(localStorage.getItem(LS) || '{}')); } catch { /* storage blocked */ }
  const saveEl = $('saveState');
  const setSave = (t, w) => { saveEl.textContent = t; saveEl.classList.toggle('warn', !!w); };
  let db = null; const chains = {};
  const els = {};
  for (const [id, title, hint, verdict] of QUESTIONS) {
    const card = document.createElement('div'); card.className = 'q';
    const p = document.createElement('p'); p.textContent = title;
    const s = document.createElement('small'); s.textContent = hint;
    card.append(p, s);
    let seg = null;
    if (verdict) {
      seg = document.createElement('div'); seg.className = 'verdict';
      for (const [v, l] of [['keep', '★ Keep'], ['maybe', '? Maybe'], ['cut', '✗ Cut']]) {
        const b = document.createElement('button'); b.type = 'button'; b.dataset.v = v; b.textContent = l; b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', () => save(id, { mark: answers[id]?.mark === v ? null : v }));
        seg.append(b);
      }
      card.append(seg);
    }
    const ta = document.createElement('textarea'); ta.id = 'a-' + id; ta.rows = 2; ta.placeholder = 'Your answer';
    let timer;
    ta.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => save(id, { note: ta.value }), 900); });
    ta.addEventListener('blur', () => { clearTimeout(timer); if ((answers[id]?.note || '') !== ta.value) save(id, { note: ta.value }); });
    card.append(ta);
    els[id] = { ta, seg };
    $('qs').append(card);
  }
  function paint() {
    for (const [id, { ta, seg }] of Object.entries(els)) {
      const a = answers[id] || {};
      if (document.activeElement !== ta && ta.value !== (a.note || '')) ta.value = a.note || '';
      if (seg) for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.v === a.mark));
    }
  }
  function save(id, patch) {
    answers[id] = Object.assign({ mark: null, note: '' }, answers[id], patch);
    try { localStorage.setItem(LS, JSON.stringify(answers)); } catch { /* storage blocked */ }
    paint();
    if (!db) return;
    setSave('Saving…');
    const body = { mark: answers[id].mark, note: answers[id].note, updatedAt: new Date().toISOString() };
    chains[id] = (chains[id] || Promise.resolve()).then(() => db.doc('answers/' + id).set(body))
      .then(() => setSave('All answers saved'))
      .catch(() => setSave('Couldn’t save. Your answer is kept in this browser.', true));
  }
  (async () => {
    const t = setTimeout(() => setSave('Can’t reach saved answers yet. Answers stay in this browser for now.', true), 10000);
    try { db = await window.claude?.use?.('db'); } catch { db = null; }
    if (!db) { clearTimeout(t); setSave('Answers are saved in this browser only'); return; }
    db.collection('answers').onSnapshot((snap) => {
      for (const d of snap.docs) { const x = d.data(); answers[d.id] = { mark: x.mark || null, note: x.note || '' }; }
      if (!snap.metadata.fromCache) { clearTimeout(t); if (!snap.metadata.hasPendingWrites) setSave('All answers saved'); }
      paint();
    }, () => { clearTimeout(t); db = null; setSave('Saved answers are unavailable. Answers stay in this browser.', true); });
  })();

  render(); paint();
})();
