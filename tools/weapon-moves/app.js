/* Weapon Moveset Review: builds the cards, runs the vignettes, stores ratings and answers.
 * URL params: ?t=<sec> freezes every vignette; ?only=a,b shows only those slugs;
 * ?scale=<n> forces the pixel scale; ?static=1 behaves like prefers-reduced-motion.
 * db: ratings/<slug> { mark: 'keep'|'maybe'|'cut'|null, note, updatedAt }
 *     answers/<question id> { choice, note, updatedAt }; answers/general { choice: null, note, updatedAt }
 * Without the db the page is read-only (ratings disabled). */
(function () {
  'use strict';
  const PB = window.PB, K = PB.K, WM = PB.WM, C = PB.WMC, ST = PB.stage, X = PB.px, $ = (id) => document.getElementById(id);
  const Q = new URLSearchParams(location.search);
  const FREEZE = Q.has('t') ? parseFloat(Q.get('t')) : null;
  const ONLY = Q.get('only') ? Q.get('only').split(',') : null;
  const STATIC = Q.get('static') === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const V = Object.fromEntries(PB.WMV.map((d) => [d.id, d]));
  const ELN = { water: 'Water', life: 'Life', shield: 'Shield', cold: 'Cold', lightning: 'Lightning', arcane: 'Arcane', earth: 'Earth', fire: 'Fire', sigil: 'Sigil' };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const recipe = (q, cast) => {
    const r = el('div', 'recipe');
    if (!q.length) { r.append(el('span', 'tag', 'No conjure: your staff')); return r; }
    r.append(el('span', 'cast', esc(cast) + ':'));
    q.forEach((e, i) => { if (i) r.append(el('span', 'plus', '+')); r.append(el('span', 'el', `<i class="dot" style="background:${X.EL[e][2]}"></i>${ELN[e]}`)); });
    return r;
  };

  // ---------- state + db ----------
  const ratings = {}, answers = {};
  let db = null, ready = false;
  const raters = [], askers = [];
  const setSave = (t, w) => { $('saveState').textContent = t; $('saveState').classList.toggle('warn', !!w); };
  const chains = {};
  function put(coll, id, body) {
    const store = coll === 'ratings' ? ratings : answers;
    store[id] = Object.assign({}, store[id], body);
    paint();
    if (!db) return;
    setSave('Saving…');
    const doc = coll === 'ratings' ? { mark: store[id].mark || null, note: store[id].note || '', updatedAt: new Date().toISOString() } : { choice: store[id].choice || null, note: store[id].note || '', updatedAt: new Date().toISOString() };
    const k = coll + '/' + id;
    chains[k] = (chains[k] || Promise.resolve()).then(() => db.doc(k).set(doc)).then(() => setSave('All saved')).catch(() => setSave('Couldn’t save that. Check your connection and try again.', true));
  }
  function noteBox(ta, get, set) {
    let timer;
    ta.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => set({ note: ta.value }), 900); });
    ta.addEventListener('blur', () => { clearTimeout(timer); if ((get()?.note || '') !== ta.value) set({ note: ta.value }); });
  }
  // a keep / maybe / cut row with a note
  function rater(id, label, compact) {
    const box = el('div', 'rate' + (compact ? ' compact' : ''));
    const seg = el('div', 'verdict'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Rate ' + label);
    for (const [v, l] of [['keep', '★ Keep'], ['maybe', '? Maybe'], ['cut', '✗ Cut']]) {
      const b = el('button', null, l); b.type = 'button'; b.dataset.v = v; b.disabled = true;
      b.addEventListener('click', () => put('ratings', id, { mark: ratings[id]?.mark === v ? null : v }));
      seg.append(b);
    }
    const ta = el('textarea'); ta.rows = 1; ta.id = 'note-' + id; ta.placeholder = 'Note (optional)'; ta.disabled = true; ta.setAttribute('aria-label', 'Note on ' + label);
    noteBox(ta, () => ratings[id], (p) => put('ratings', id, p));
    box.append(seg, ta);
    raters.push({ id, seg, ta, host: null });
    return box;
  }

  // ---------- vignettes ----------
  const screens = [];
  function screen(id, label) {
    const d = V[id];
    const s = el('div', 'screen'); s.tabIndex = 0; s.setAttribute('role', 'button'); s.setAttribute('aria-label', label + ' (click to pause)');
    const cv = document.createElement('canvas'); cv.width = d.w; cv.height = d.h; cv.setAttribute('aria-label', label);
    const ps = el('span', 'paused', 'PAUSED'); ps.hidden = true;
    s.append(cv, ps);
    const S = { d, s, cv, ctx: cv.getContext('2d', { willReadFrequently: true }), ps, visible: false, paused: STATIC, t0: performance.now() - Math.random() * 1000, last: -1, tShown: null };
    S.ctx.imageSmoothingEnabled = false;
    const toggle = () => { S.paused = !S.paused; S.ps.hidden = !S.paused; if (!S.paused) S.t0 = performance.now() - (S.tShown || 0) * 1000; };
    s.addEventListener('click', toggle);
    s.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    screens.push(S);
    return s;
  }
  function draw(S, t) {
    try { ST.render(S.ctx, S.d, t, K); S.tShown = t; }
    catch (e) { $('errs').textContent += `${S.d.id}: ${e.message}\n`; document.body.dataset.err = '1'; S.broken = true; }
  }
  function sizeAll() {
    for (const S of screens) {
      const w = S.s.clientWidth || S.d.w * 2, forced = parseInt(Q.get('scale'), 10);
      const k = forced || Math.floor(w / S.d.w);
      if (k >= 2) { S.cv.style.width = S.d.w * k + 'px'; S.cv.style.height = S.d.h * k + 'px'; }
      else { S.cv.style.width = '100%'; S.cv.style.height = 'auto'; }
    }
  }
  function tick(now) {
    for (const S of screens) {
      if (!S.visible || S.paused || S.broken || now - S.last < 32) continue;
      S.last = now;
      draw(S, (((now - S.t0) / 1000) % S.d.dur + S.d.dur) % S.d.dur);
    }
    requestAnimationFrame(tick);
  }
  const show = (id) => !ONLY || ONLY.includes(id);

  // ---------- build ----------
  // the control table in the header
  const GR = {
    strike: 'Your basic swing. Three in rhythm make a combo; the third hit is the weapon’s finisher.',
    thrust: 'Aimed and narrow, with a step forward. For reach and lining up.',
    heavy: 'Charge it like a Force charge, let go for a big blow. A full charge triggers the signature.',
    sweep: 'A full circle round you, for crowds. The move most likely to hit your partner.',
    send: 'The weapon goes to the cursor, thrown or planted. Shift+LMB calls it back.',
    defend: 'With a guard: hold to block, tap as a shot lands to parry. Weapon only: a short parry.',
  };
  const tb = $('grammar');
  for (const mv of WM.MOVE_IDS) {
    const M = WM.MOVES[mv];
    const tr = el('tr', null, `<th scope="row"><kbd>${esc(M.gesture.replace(' ×3', ''))}</kbd></th><td><b>${M.name}</b></td><td>${esc(GR[mv])}</td><td class="num">${M.uses}</td>`);
    tb.append(tr);
  }

  // weapons
  const wHost = $('weapons');
  for (const W of WM.WEAPONS) {
    if (!show('w-' + W.id) && !WM.MOVE_IDS.some((m) => show(`w-${W.id}-${m}`))) continue;
    const card = el('article', 'wcard'); card.id = 'w-' + W.id; card.dataset.rid = 'w-' + W.id;
    const head = el('div', 'whead');
    head.append(screen('w-' + W.id, W.name + ' held'));
    const info = el('div', 'winfo');
    info.append(el('h3', null, `${esc(W.name)} <span class="slug">w-${W.id}</span>`), recipe(W.q, 'Weapon'));
    info.append(el('dl', 'facts', `<div><dt>Signature</dt><dd>${esc(W.sig)}</dd></div><div><dt>Silhouette</dt><dd>${esc(W.silhouette)}</dd></div><div><dt>Feel</dt><dd>${esc(W.feel)}</dd></div><div><dt>Hands</dt><dd>${W.hands === 'two' ? '<b>Two-handed</b>: no guard' : 'One-handed: pairs with a guard'}</dd></div><div><dt>Reach</dt><dd class="num">${W.reach.toFixed(1)} units</dd></div>`));
    info.append(rater('w-' + W.id, W.name));
    head.append(info);
    card.append(head);
    const grid = el('div', 'mgrid');
    for (const mv of WM.MOVE_IDS) {
      const id = `w-${W.id}-${mv}`; if (!show(id)) continue;
      const M = WM.MOVES[mv], cell = el('div', 'mcell'); cell.id = id; cell.dataset.rid = id;
      cell.append(screen(id, `${W.name}: ${M.name}`));
      const cap = el('div', 'mcap');
      cap.append(el('h4', null, `${M.name} <kbd>${esc(M.gesture.replace(' ×3', ''))}</kbd><span class="uses" title="Uses spent">${M.uses ? M.uses + (M.uses > 1 ? ' uses' : ' use') : 'free'}</span>`));
      cap.append(el('p', null, esc(C.moves[W.id][mv])));
      cap.append(el('span', 'slug', id));
      cap.append(rater(id, `${W.name} ${M.name}`, true));
      cell.append(cap);
      grid.append(cell);
    }
    card.append(grid);
    wHost.append(card);
  }

  // guards
  const gHost = $('guards');
  for (const G of WM.GUARDS) {
    const id = 'g-' + G.id; if (!show(id)) continue;
    const card = el('article', 'card'); card.id = id; card.dataset.rid = id;
    card.append(screen(id, G.name + ' blocking'));
    const cap = el('div', 'cap');
    cap.append(el('h3', null, `${esc(G.name)} <span class="slug">${id}</span>`), recipe(G.q, 'Weapon'));
    cap.append(el('p', null, `<b>Block:</b> ${esc(G.block)}`));
    cap.append(el('p', 'small', `<b>Silhouette:</b> ${esc(G.silhouette)} · <b>Bash</b> (Shift+LMB, guard only): ${esc(G.bash)} · <b>HP:</b> ${esc(G.hp)}`));
    cap.append(rater(id, G.name));
    card.append(cap);
    gHost.append(card);
  }

  // both hands
  const dHost = $('duals');
  const DUAL = {
    'd-spear-bulwark': ['Frost spear + Bulwark', 'The tank build. Space holds the slab up and an arrow sticks in it; RMB thrusts, and the guard drops for the wind-up and recovery.'],
    'd-sword-ember': ['Flame sword + Ember targe', 'Block a club (the attacker catches fire on the thorns), then Shift+LMB for the combo. Block or swing, never both.'],
    'd-maul-over-buckler': ['Stone maul conjured over a Mirror buckler', 'The maul is two-handed, so conjuring it replaces the buckler. Neither is “slung on your back”.'],
  };
  for (const [id, [name, text]] of Object.entries(DUAL)) {
    if (!show(id)) continue;
    const card = el('article', 'card'); card.id = id; card.dataset.rid = id;
    card.append(screen(id, name));
    const cap = el('div', 'cap');
    cap.append(el('h3', null, `${esc(name)} <span class="slug">${id}</span>`), el('p', null, esc(text)), rater(id, name));
    card.append(cap);
    dHost.append(card);
  }
  if (show('d-hands-table')) {
    const card = el('article', 'card tablecard'); card.id = 'd-hands-table'; card.dataset.rid = 'd-hands-table';
    const cap = el('div', 'cap');
    cap.append(el('h3', null, `Which hands each weapon takes <span class="slug">d-hands-table</span>`));
    cap.append(el('div', 'tablewrap', `<table><thead><tr><th scope="col">Weapon</th><th scope="col">Hands</th><th scope="col">Guard hand</th></tr></thead><tbody>${C.hands.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</tbody></table>`));
    cap.append(el('p', 'small', 'Conjuring a weapon replaces your weapon, conjuring a guard replaces your guard, and neither touches the other, except where this table says. Any attack drops the guard for its wind-up and recovery.'));
    cap.append(rater('d-hands-table', 'the two-handed table'));
    card.append(cap);
    dHost.append(card);
  }

  // open questions with answer boxes next to the text
  const qHost = $('questions');
  for (const q of C.questions) {
    const row = el('article', 'qrow'); row.id = q.id;
    row.append(el('div', 'qtext', `<h3><span class="qn">Q${q.n}</span> ${esc(q.title)}</h3><p>${esc(q.text)}</p><span class="slug">answers/${q.id}</span>`));
    const side = el('div', 'qside');
    const ch = el('div', 'choices'); ch.setAttribute('role', 'group'); ch.setAttribute('aria-label', q.title);
    for (const [v, l, sub] of q.choices) {
      const b = el('button', null, `<b>${esc(l)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}`); b.type = 'button'; b.dataset.v = v; b.disabled = true;
      b.addEventListener('click', () => put('answers', q.id, { choice: answers[q.id]?.choice === v ? null : v }));
      ch.append(b);
    }
    const ta = el('textarea'); ta.rows = 2; ta.id = 'ans-' + q.id; ta.placeholder = 'Note (optional)'; ta.disabled = true; ta.setAttribute('aria-label', 'Note on ' + q.title);
    noteBox(ta, () => answers[q.id], (p) => put('answers', q.id, p));
    side.append(ch, el('p', 'hint', 'No answer means you accept the recommended option.'), ta);
    row.append(side);
    askers.push({ id: q.id, ch, ta });
    qHost.append(row);
  }
  const gen = $('general'); gen.disabled = true;
  noteBox(gen, () => answers.general, (p) => put('answers', 'general', p));

  function paint() {
    let n = 0;
    for (const R of raters) {
      const r = ratings[R.id] || {};
      if (r.mark) n++;
      const host = document.querySelector(`[data-rid="${R.id}"]`); if (host) host.dataset.mark = r.mark || '';
      for (const b of R.seg.children) { b.setAttribute('aria-pressed', String(b.dataset.v === r.mark)); b.disabled = !db; }
      R.ta.disabled = !db;
      if (document.activeElement !== R.ta && R.ta.value !== (r.note || '')) R.ta.value = r.note || '';
    }
    for (const A of askers) {
      const a = answers[A.id] || {};
      for (const b of A.ch.children) { b.setAttribute('aria-pressed', String(b.dataset.v === a.choice)); b.disabled = !db; }
      A.ta.disabled = !db;
      if (document.activeElement !== A.ta && A.ta.value !== (a.note || '')) A.ta.value = a.note || '';
    }
    gen.disabled = !db;
    if (document.activeElement !== gen && gen.value !== (answers.general?.note || '')) gen.value = answers.general?.note || '';
    $('tally').innerHTML = `<b>${n}</b> of ${raters.length} rated`;
  }

  sizeAll(); addEventListener('resize', sizeAll);
  const stillT = (d) => (d.still != null ? d.still : d.dur * 0.42);
  for (const S of screens) draw(S, FREEZE != null ? ((FREEZE % S.d.dur) + S.d.dur) % S.d.dur : stillT(S.d));
  if (FREEZE == null && !STATIC) {
    const io = new IntersectionObserver((es) => { for (const e of es) { const S = screens.find((x) => x.s === e.target); if (S) S.visible = e.isIntersecting; } }, { rootMargin: '80px' });
    for (const S of screens) io.observe(S.s);
    requestAnimationFrame(tick);
  } else for (const S of screens) { S.paused = true; S.ps.hidden = FREEZE != null || !STATIC; }
  setSave('Connecting to saved ratings…');
  paint();

  // ---------- the artifact db ----------
  (async () => {
    try { db = await window.claude?.use?.('db'); } catch { db = null; }
    if (!db) { setSave('Read-only here: ratings need the page’s saved-ratings store, which isn’t available in this view.', true); paint(); return; }
    paint();
    let got = 0;
    const timer = setTimeout(() => setSave('Saved ratings are slow to load. You can still rate; changes save when the connection returns.', true), 10000);
    const fail = () => { clearTimeout(timer); db = null; setSave('Saved ratings are unavailable, so the page is read-only. Reload to try again.', true); paint(); };
    const listen = (coll, store, map) => db.collection(coll).onSnapshot((snap) => {
      for (const d of snap.docs) store[d.id] = map(d.data());
      if (!snap.metadata.fromCache && ++got >= 2) { clearTimeout(timer); if (!snap.metadata.hasPendingWrites) setSave('All saved'); }
      paint();
    }, fail);
    listen('ratings', ratings, (x) => ({ mark: x.mark || null, note: x.note || '' }));
    listen('answers', answers, (x) => ({ choice: x.choice || null, note: x.note || '' }));
  })();
})();
