/* Spell VFX gallery: cards, captions from rules-c.js, the animation loop and ratings.
 * URL params: ?t=<sec> freezes every vignette at that time; ?only=a,b shows only those
 * slugs; ?group=<id> one group; ?scale=<n> forces the pixel scale; ?static=1 behaves like
 * prefers-reduced-motion; ?bench=1 times one render of each vignette (body[data-bench]). */
(function () {
  'use strict';
  const PB = window.PB, R = window.SpellTreeC, K = PB.K, ST = PB.stage, $ = (id) => document.getElementById(id);
  const Q = new URLSearchParams(location.search);
  const FREEZE = Q.has('t') ? parseFloat(Q.get('t')) : null;
  const ONLY = Q.get('only') ? Q.get('only').split(',') : null;
  const GROUP = Q.get('group');
  const STATIC = Q.get('static') === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Vignettes with `fresh: 'new' | 'reworked'` changed since the last rating round. They are
  // shown first, in their own section, with a badge; ?fresh=0 puts them back in their groups.
  const FRESH = Q.get('fresh') !== '0';
  const sectionOf = (d) => (FRESH && d.fresh ? 'changed' : d.group);
  const GROUPS = [
    ['changed', 'New and reworked', 'Changed in this pass, since your last ratings: new slugs are new visuals (old ratings stay on the old slugs), reworked ones kept their slug. Your earlier rating, if any, still shows on a reworked card.'],
    ['forms', 'Forms', 'Seven plain elements, each as Force (from you, along your aim), Area (around you) and Place (at the cursor).'],
    ['payload', 'Payloads and mixes', 'Every element that is not the form adds one trait. Water with fire scalds and leaves mist; water with cold freezes.'],
    ['shield', 'Shield barriers', 'Shield takes the form and builds: walls you draw, a quick arc, a ring, a forward wave, wards on yourself.'],
    ['life', 'Life: support spells', 'Life leads every spell it is in (except Shield and Sigil ones): the other elements lend it their shape, never their harm.'],
    ['sigil', 'Sigil devices', 'Sigil (violet) makes things in the world: turrets, orbitals, glyphs, a lens, a blink, a double, a wand.'],
    ['aura', 'Sigil auras', 'Sigil on yourself is an aura: it affects whoever is around you and never boosts your own spells.'],
    ['deaths', 'Deaths: goblin', 'A trial: one base death per enemy plus an element overlay, driven only by what the game knows at the kill (element, how the hit was delivered, direction, statuses, overkill). Frozen shatters; a scald steams; earth splits into boulder (missile) and quake (burst); fire, cold, lightning and arcane have their own; everything else, water included, uses the base. Each card says whether it is the base plus an overlay, or a bespoke death that replaces the body. Playful poofs, no gore.'],
  ];
  const CASTN = { force: 'Force', area: 'Area', place: 'Place', self: 'Self', conjure: 'Weapon' };

  let list = PB.VFX.slice();
  if (ONLY) list = list.filter((d) => ONLY.includes(d.id));
  if (GROUP) list = list.filter((d) => d.group === GROUP || (GROUP === 'changed' && d.fresh));
  // within the changed section: new ones first, then reworked, each in page order
  const ord = (d) => (d.fresh === 'new' ? 0 : 1);

  // legend
  for (const [k, e] of Object.entries(R.ELEMENTS)) { const s = document.createElement('span'); s.innerHTML = `<i class="dot" style="background:${e.color}"></i>`; s.append(e.name); $('legend').append(s); }

  // ---------- ratings ----------
  const ratings = {}, answers = {};
  const LS = 'spell-vfx-v1';
  try { const x = JSON.parse(localStorage.getItem(LS) || '{}'); Object.assign(ratings, x.ratings || {}); Object.assign(answers, x.answers || {}); } catch { /* storage blocked */ }
  const setSave = (t, w) => { $('saveState').textContent = t; $('saveState').classList.toggle('warn', !!w); };
  let db = null; const chains = {};
  function persist(coll, id, store, patch) {
    store[id] = Object.assign({ mark: null, note: '' }, store[id], patch);
    try { localStorage.setItem(LS, JSON.stringify({ ratings, answers })); } catch { /* storage blocked */ }
    paint();
    if (!db) return;
    setSave('Saving…');
    const body = { mark: store[id].mark || null, note: store[id].note || '', updatedAt: new Date().toISOString() };
    const k = coll + '/' + id;
    chains[k] = (chains[k] || Promise.resolve()).then(() => db.doc(k).set(body))
      .then(() => setSave('All saved'))
      .catch(() => setSave('Couldn’t save. Kept in this browser.', true));
  }
  function noteBox(ta, get, set) {
    ta.value = get()?.note || '';
    let timer;
    ta.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => set({ note: ta.value }), 900); });
    ta.addEventListener('blur', () => { clearTimeout(timer); if ((get()?.note || '') !== ta.value) set({ note: ta.value }); });
  }

  // ---------- cards ----------
  const cards = [];
  const elChip = (e, n) => { const s = document.createElement('span'); s.className = 'el'; s.innerHTML = `<i class="dot" style="background:${R.ELEMENTS[e].color}"></i>`; s.append(R.ELEMENTS[e].name + (n > 1 ? ' ×' + n : '')); return s; };
  function caption(d) {
    const r = R.resolve(d.q, d.cast, d.opts || {});
    const firstSentence = (s) => { const m = s.match(/^.*?[.!?](\s|$)/); return m ? m[0].trim() : s; };
    return { title: d.title || r.title, line: d.line || firstSentence(r.text), r };
  }
  function build() {
    const host = $('groups');
    for (const [gid, gname, gdesc] of GROUPS) {
      let items = list.filter((d) => sectionOf(d) === gid);
      if (gid === 'changed') items = items.map((d, i) => [d, i]).sort((a, b) => ord(a[0]) - ord(b[0]) || a[1] - b[1]).map((x) => x[0]);
      if (!items.length) continue;
      const sec = document.createElement('section'); sec.className = 'group'; sec.dataset.group = gid;
      const h = document.createElement('h2'); h.textContent = gname; const sm = document.createElement('small'); sm.textContent = gdesc; h.append(sm);
      const grid = document.createElement('div'); grid.className = 'grid';
      sec.append(h, grid); host.append(sec);
      for (const d of items) grid.append(card(d));
    }
  }
  function card(d) {
    const { title, line, r } = caption(d);
    const el = document.createElement('article'); el.className = 'card'; el.id = d.id; el.dataset.group = d.group;
    const scr = document.createElement('div'); scr.className = 'screen'; scr.tabIndex = 0; scr.setAttribute('role', 'button');
    const cv = document.createElement('canvas'); cv.width = ST.W; cv.height = ST.H; cv.setAttribute('aria-label', `${title}: ${line}`);
    const ps = document.createElement('span'); ps.className = 'paused'; ps.textContent = 'PAUSED'; ps.hidden = true;
    scr.append(cv, ps);
    const cap = document.createElement('div'); cap.className = 'cap';
    const h = document.createElement('h3'); h.textContent = title;
    if (d.fresh) { const b = document.createElement('span'); b.className = 'badge ' + d.fresh; b.textContent = d.fresh === 'new' ? 'New' : 'Reworked'; h.append(b); }
    const slug = document.createElement('span'); slug.className = 'slug'; slug.textContent = d.id; h.append(slug);
    const p = document.createElement('p'); p.textContent = line;
    const rec = document.createElement('div'); rec.className = 'recipe';
    const cs = document.createElement('span'); cs.className = 'cast'; cs.textContent = CASTN[d.cast] + (d.opts && d.opts.drag ? ' (drag)' : '') + (d.opts && d.opts.onAlly ? ' (on ally)' : '') + ':'; rec.append(cs);
    const counts = []; for (const e of d.q) { const f = counts.find((x) => x[0] === e); if (f) f[1]++; else counts.push([e, 1]); }
    counts.forEach(([e, n], i) => { if (i) { const pl = document.createElement('span'); pl.className = 'plus'; pl.textContent = '+'; rec.append(pl); } rec.append(elChip(e, n)); });
    const traits = [...r.payload.map((x) => x.trait), ...r.mix.map((x) => x.trait)];
    // a support spell (Life leads, or a Sigil device led by Life): the other elements lend their
    // shape and never their harm, so the tag says that instead of listing harmful traits
    const support = r.form === 'life' || r.sub === 'life';
    if (d.cast !== 'self' && support && r.payload.some((x) => x.el !== 'life')) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = 'Lends its shape: ' + r.payload.filter((x) => x.el !== 'life').map((x) => R.ELEMENTS[x.el].name).join(', ') + ' (never harms)'; rec.append(t); }
    else if (d.cast !== 'self' && !support && traits.length && !d.event) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = 'Payload: ' + [...new Set(traits)].join(', '); rec.append(t); }
    if (r.cost) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = r.cost.title; t.title = r.cost.text; rec.append(t); }
    // death trial cards: how the death is built, and the death event that drives it
    if (d.approach) { const t = document.createElement('span'); t.className = 'tag approach' + (d.approach === 'bespoke' ? ' bespoke' : ''); t.textContent = d.approach; rec.append(t); }
    if (d.event) { const t = document.createElement('span'); t.className = 'tag'; const st = Object.entries(d.event.statuses || {}).filter(([, v]) => v).map(([k]) => k); t.textContent = 'Death event: ' + d.event.element + (d.event.mix ? ' (' + d.event.mix + ')' : '') + (d.event.delivery ? ' ' + d.event.delivery : '') + ', ' + (st.length ? st.join(', ') : 'no status') + ', overkill ' + d.event.overkill; rec.append(t); }
    const rate = document.createElement('div'); rate.className = 'rate';
    const seg = document.createElement('div'); seg.className = 'verdict'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Rate ' + title);
    const get = () => ratings[d.id], set = (patch) => persist('ratings', d.id, ratings, patch);
    for (const [v, l] of [['keep', '★ Keep'], ['maybe', '? Maybe'], ['cut', '✗ Cut']]) {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.v = v; b.textContent = l;
      b.addEventListener('click', () => set({ mark: get()?.mark === v ? null : v }));
      seg.append(b);
    }
    const ta = document.createElement('textarea'); ta.rows = 1; ta.id = 'note-' + d.id; ta.placeholder = 'Note (optional)'; ta.setAttribute('aria-label', 'Note on ' + title);
    noteBox(ta, get, set);
    rate.append(seg, ta);
    cap.append(h, p, rec, rate);
    el.append(scr, cap);
    const C = { d, el, cv, ctx: cv.getContext('2d', { willReadFrequently: true }), seg, ta, ps, visible: false, paused: STATIC, t0: performance.now() - Math.random() * 1000, last: -1, tShown: null };
    C.ctx.imageSmoothingEnabled = false;
    scr.addEventListener('click', () => toggle(C));
    scr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(C); } });
    cards.push(C);
    return el;
  }
  function toggle(C) { C.paused = !C.paused; C.ps.hidden = !C.paused; if (!C.paused) C.t0 = performance.now() - (C.tShown || 0) * 1000; }

  // ---------- rendering ----------
  const stillT = (d) => (d.still != null ? d.still : d.dur * 0.42);
  function draw(C, t) {
    try { ST.render(C.ctx, C.d, t, K); C.tShown = t; }
    catch (e) { $('errs').textContent += `${C.d.id}: ${e.message}\n`; document.body.dataset.err = '1'; C.broken = true; console.error(e); }
  }
  function sizeAll() {
    for (const C of cards) {
      const w = C.el.clientWidth || 560, forced = parseInt(Q.get('scale'), 10);
      const s = forced || Math.floor(w / ST.W);
      if (s >= 2) { C.cv.style.width = ST.W * s + 'px'; C.cv.style.height = ST.H * s + 'px'; }
      else { C.cv.style.width = '100%'; C.cv.style.height = 'auto'; }
    }
  }
  function tick(now) {
    for (const C of cards) {
      if (!C.visible || C.paused || C.broken) continue;
      if (now - C.last < 32) continue;          // about 30 fps is plenty for pixel art
      C.last = now;
      draw(C, (((now - C.t0) / 1000) % C.d.dur + C.d.dur) % C.d.dur);
    }
    requestAnimationFrame(tick);
  }

  // ---------- filters and tally ----------
  let filter = 'all';
  const matches = (C, f) => f === 'all' || (f === 'unrated' ? !ratings[C.d.id]?.mark : f === 'changed' ? !!C.d.fresh : C.d.group === f);
  function buildFilters() {
    const opts = [['all', 'All'], ...GROUPS.filter(([g]) => list.some((d) => (g === 'changed' ? d.fresh : d.group === g))).map(([g, n]) => [g, g === 'changed' ? 'Changed' : n]), ['unrated', 'Unrated']];
    for (const [id, name] of opts) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.f = id;
      b.append(name); const n = document.createElement('span'); n.className = 'n'; b.append(n);
      b.addEventListener('click', () => { filter = id; applyFilter(); });
      $('filters').append(b);
    }
  }
  function applyFilter() {
    for (const b of $('filters').children) b.setAttribute('aria-pressed', String(b.dataset.f === filter));
    for (const C of cards) C.el.hidden = !matches(C, filter);
    for (const sec of document.querySelectorAll('section.group')) sec.hidden = ![...sec.querySelectorAll('.card')].some((x) => !x.hidden);
  }
  function paint() {
    let n = 0;
    for (const C of cards) {
      const r = ratings[C.d.id] || {};
      if (r.mark) n++;
      C.el.dataset.mark = r.mark || '';
      for (const b of C.seg.children) b.setAttribute('aria-pressed', String(b.dataset.v === r.mark));
      if (document.activeElement !== C.ta && C.ta.value !== (r.note || '')) C.ta.value = r.note || '';
    }
    $('tally').innerHTML = `<b>${n}</b> of ${cards.length} rated`;
    for (const b of $('filters').children) {
      const f = b.dataset.f, k = cards.filter((C) => matches(C, f)).length;
      b.querySelector('.n').textContent = k;
    }
    const g = $('general'); if (document.activeElement !== g && g.value !== (answers.general?.note || '')) g.value = answers.general?.note || '';
    if (filter === 'unrated') applyFilter();
  }

  build(); buildFilters(); applyFilter();
  noteBox($('general'), () => answers.general, (patch) => persist('answers', 'general', answers, patch));
  sizeAll(); addEventListener('resize', sizeAll);
  // every card shows its still frame at rest (and in the screenshot pass)
  const tb = performance.now(), bench = {};
  for (const C of cards) { const a = performance.now(); draw(C, FREEZE != null ? ((FREEZE % C.d.dur) + C.d.dur) % C.d.dur : stillT(C.d)); bench[C.d.id] = +(performance.now() - a).toFixed(2); }
  if (Q.get('bench') === '1') {
    // steady state: 12 frames of each vignette spread over its loop (ground already cached)
    const avg = {}; let sum = 0, worst = ['', 0];
    for (const C of cards) { const a = performance.now(); for (let k = 0; k < 12; k++) draw(C, C.d.dur * (k + 0.5) / 12); const ms = (performance.now() - a) / 12; avg[C.d.id] = +ms.toFixed(2); sum += ms; if (ms > worst[1]) worst = [C.d.id, +ms.toFixed(2)]; }
    document.body.dataset.bench = JSON.stringify({ firstPass: +(performance.now() - tb).toFixed(1), firstEach: bench, meanFrameMs: +(sum / cards.length).toFixed(2), worst, avg });
    for (const C of cards) draw(C, FREEZE != null ? ((FREEZE % C.d.dur) + C.d.dur) % C.d.dur : stillT(C.d));
  }
  if (FREEZE == null && !STATIC) {
    const io = new IntersectionObserver((es) => { for (const e of es) { const C = cards.find((x) => x.el === e.target); if (C) C.visible = e.isIntersecting; } }, { rootMargin: '80px' });
    for (const C of cards) io.observe(C.el);
    requestAnimationFrame(tick);
  } else for (const C of cards) { C.paused = true; C.ps.hidden = FREEZE != null || !STATIC ? true : false; }
  paint();

  // ---------- the artifact db ----------
  (async () => {
    const timer = setTimeout(() => setSave('Can’t reach saved ratings yet. They stay in this browser for now.', true), 10000);
    try { db = await window.claude?.use?.('db'); } catch { db = null; }
    if (!db) { clearTimeout(timer); setSave('Saved in this browser only'); return; }
    let ready = 0;
    const onSnap = (store) => (snap) => {
      for (const d of snap.docs) { const x = d.data(); store[d.id] = { mark: x.mark || null, note: x.note || '' }; }
      if (!snap.metadata.fromCache && ++ready >= 2) { clearTimeout(timer); if (!snap.metadata.hasPendingWrites) setSave('All saved'); }
      paint();
    };
    const fail = () => { clearTimeout(timer); db = null; setSave('Saved ratings are unavailable. They stay in this browser.', true); };
    db.collection('ratings').onSnapshot(onSnap(ratings), fail);
    db.collection('answers').onSnapshot(onSnap(answers), fail);
  })();
})();
