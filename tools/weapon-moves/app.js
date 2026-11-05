/* Weapon Moveset Review: builds the cards, runs the vignettes, stores ratings and answers.
 * URL params: ?t=<sec> freezes every vignette; ?only=a,b shows only those slugs;
 * ?scale=<n> forces the pixel scale; ?static=1 behaves like prefers-reduced-motion.
 * db: ratings/<slug> { mark: 'keep'|'maybe'|'cut'|null, note, updatedAt }
 *     answers/<question id> { choice, note, updatedAt }; answers/general { choice: null, note, updatedAt }
 * Earlier notes: a round-3 slug shows its round-2 doc (WM.PREV3) read-only beside it; a -v2 slug
 * from round 2 shows its round-1 doc (the same slug without -v2). Cards changed in round 3 are
 * built in the Round 3 section at the top, the rest below. 
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
  // the v2 control table in the header
  const tb = $('grammar');
  for (const [g, mv, by, text, uses] of C.grammar) {
    tb.append(el('tr', null, `<th scope="row"><kbd>${esc(g)}</kbd></th><td><b>${esc(mv)}</b></td><td><span class="by by-${by}">${by === 'weapon' ? 'Weapon' : 'Guard'}</span></td><td>${esc(text)}</td><td class="num">${esc(uses)}</td>`));
  }

  // round-1 notes, read-only, next to the round-2 item they were about
  const priors = [];
  const MARKL = { keep: '★ Keep', maybe: '? Maybe', cut: '✗ Cut' };
  function prior(id) {
    const box = el('div', 'prior'); box.hidden = true;
    priors.push({ prev: WM.prevSlug(id), box, label: WM.isR3(id) ? 'Round 2' : 'Round 1' });
    return box;
  }
  const isNew = (id) => WM.isR3(id) || id.includes('-v2');
  const badge = (id, keptText) => (WM.isR3(id) ? '<span class="badge new r3">New in round 3</span>' : id.includes('-v2') ? '<span class="badge new">Changed in round 2</span>' : `<span class="badge kept">${keptText}</span>`);

  // weapons: card + Strike / Heavy / Special
  const SLOT_KEY = { strike: 'RMB tap', heavy: 'RMB hold', special: 'Shift+RMB' };
  const USES = (W, s) => (s === 'strike' ? '1 use' : s === 'heavy' ? (W.id === 'life' ? '1 use/s' : '2 uses') : W.id === 'life' || W.id === 'arcane' ? '1 use/s' : '2 uses');
  const SPECIAL_NAME = { cold: 'Javelin', arcane: 'Siphon', life: 'Mend' };
  const SPECIAL_KEY = { arcane: 'Shift+RMB hold', life: 'Shift+RMB hold' };
  const HEAVY_NAME = { life: 'Healing link', cold: 'Impaling dash', arcane: 'Charged bolt', fire: 'Fire wave', earth: 'Directed quake' };
  const r3Host = $('round3');
  const changedIn3 = (ids) => Object.values(ids).some(WM.isR3);
  function buildWeapon(W, wHost) {
    const ids = WM.CUR[W.id], r3 = changedIn3(ids);
    if (!show(ids.card) && !['strike', 'heavy', 'special'].some((s) => show(ids[s]))) return;
    const card = el('article', 'wcard'); card.id = ids.card; card.dataset.rid = ids.card;
    const head = el('div', 'whead');
    head.append(screen(ids.card, W.name + ' held'));
    const info = el('div', 'winfo');
    info.append(el('h3', null, `${esc(W.name)} <span class="slug">${ids.card}</span>${WM.isR3(ids.card) ? '<span class="badge new r3">New in round 3</span>' : isNew(ids.card) ? '<span class="badge new">New in round 2</span>' : ''}`), recipe(W.q, 'Weapon'));
    info.append(el('p', 'changed', r3 ? `<b>Round 3:</b> ${esc(C.changed3[W.id])}` : `<b>Round 2:</b> ${esc(C.changed[W.id])}`));
    info.append(el('dl', 'facts', `<div><dt>Signature</dt><dd>${esc(W.sig)}</dd></div><div><dt>Silhouette</dt><dd>${esc(W.silhouette)}</dd></div><div><dt>Feel</dt><dd>${esc(W.feel)}</dd></div><div><dt>Reach</dt><dd class="num">${W.reach.toFixed(1)} units</dd></div><div><dt>Hands</dt><dd>One-handed: pairs with any guard. About 30 uses.</dd></div>`));
    if (isNew(ids.card)) info.append(prior(ids.card));
    info.append(rater(ids.card, W.name));
    head.append(info);
    card.append(head);
    const grid = el('div', 'mgrid');
    for (const s of ['strike', 'heavy', 'special']) {
      const id = ids[s]; if (!show(id)) continue;
      const name = s === 'strike' ? 'Strike' : s === 'heavy' ? `Heavy${HEAVY_NAME[W.id] ? ': ' + HEAVY_NAME[W.id] : ''}` : `Special: ${SPECIAL_NAME[W.id] || 'Sweep'}`;
      const cell = el('div', 'mcell'); cell.id = id; cell.dataset.rid = id;
      cell.append(screen(id, `${W.name}: ${name}`));
      const cap = el('div', 'mcap');
      cap.append(el('h4', null, `${esc(name)} <kbd>${s === 'special' && SPECIAL_KEY[W.id] ? SPECIAL_KEY[W.id] : SLOT_KEY[s]}</kbd><span class="uses" title="Uses spent">${USES(W, s)}</span>`));
      cap.append(el('p', null, esc(C.moves[id] || '')));
      cap.append(el('div', 'meta', `${badge(id, 'Kept from round 1')}<span class="slug">${id}</span>`));
      if (isNew(id)) cap.append(prior(id));
      cap.append(rater(id, `${W.name} ${name}`, true));
      cell.append(cap);
      grid.append(cell);
    }
    card.append(grid);
    (r3 ? r3Host : wHost).append(card);
  }
  for (const W of WM.WEAPONS) buildWeapon(W, $('weapons'));

  // guards: card (passive, resistances) + Defend + Retreat
  const gHost = $('guards');
  for (const G of WM.GUARDS) {
    const gs = WM.GSLUG[G.id], cid = gs.card, dId = gs.defend, rId = gs.retreat, r3 = changedIn3(gs);
    if (![cid, dId, rId].some(show)) continue;
    const fx = C.guardFx[G.id];
    const card = el('article', 'wcard gcard'); card.id = cid; card.dataset.rid = cid;
    const info = el('div', 'ginfo');
    info.append(el('h3', null, `${esc(G.name)} <span class="slug">${cid}</span>${WM.isR3(cid) ? '<span class="badge new r3">New in round 3</span>' : ''}`), recipe(G.q, 'Weapon'));
    if (r3) info.append(el('p', 'changed', `<b>Round 3:</b> ${esc(C.changedG3[G.id])}`));
    info.append(el('dl', 'facts', `<div><dt>Passive: ${esc(G.passiveName)}</dt><dd>${esc(G.passive)}</dd></div><div><dt>Trade-off</dt><dd>${esc(G.cost)}</dd></div><div><dt>Silhouette</dt><dd>${esc(G.silhouette)} · HP ${esc(G.hp)}</dd></div>`));
    const cells = G.res.map((v) => `<td class="num${v.startsWith('−') ? ' weak' : v ? ' strong' : ''}">${v ? esc(v) : '<span class="nil">·</span>'}</td>`).join('');
    info.append(el('div', 'tablewrap restable', `<table><caption>Resistances while carried</caption><thead><tr>${WM.RES_COLS.map((c) => `<th scope="col">${c}</th>`).join('')}</tr></thead><tbody><tr>${cells}</tr></tbody></table>`));
    if (WM.isR3(cid)) info.append(prior(cid));
    info.append(rater(cid, G.name + ' as a whole'));
    card.append(info);
    const grid = el('div', 'ggrid');
    const part = (id, title, key, lines, cap0) => {
      if (!show(id)) return;
      const cell = el('div', 'mcell'); cell.id = id; cell.dataset.rid = id;
      cell.append(screen(id, `${G.name}: ${title}`));
      const cap = el('div', 'mcap');
      cap.append(el('h4', null, `${esc(title)} <kbd>${key}</kbd><span class="uses">free</span>`));
      cap.append(el('p', null, lines));
      cap.append(el('p', 'small', '<b>On screen:</b> ' + esc(C.guardFx3[id] || cap0)));
      cap.append(el('div', 'meta', `${badge(id, 'From round 2')}<span class="slug">${id}</span>`));
      if (WM.isR3(id)) cap.append(prior(id));
      cap.append(rater(id, `${G.name} ${title}`, true));
      cell.append(cap); grid.append(cell);
    };
    part(dId, 'Defend', 'Space', `<b>Block:</b> ${esc(G.block)} <b>Parry:</b> ${esc(G.parry)}`, fx[0]);
    part(rId, `Retreat: ${G.retreatName}`, 'Shift+LMB', esc(G.retreat), fx[1]);
    card.append(grid);
    (r3 ? r3Host : gHost).append(card);
  }

  // open questions with answer boxes next to the text
  const askRow = (q, qHost) => {
    const row = el('article', 'qrow'); row.id = q.id;
    row.append(el('div', 'qtext', `<h3><span class="qn">${typeof q.n === "number" ? "Q" + q.n : q.n}</span> ${esc(q.title)}</h3>${q.round === 4 ? '<span class="badge new r4">New in round 4</span>' : q.round === 3 ? '<span class="badge new r3">New in round 3</span>' : '<span class="badge kept">Round 2, answered</span>'}<p>${esc(q.text)}</p><span class="slug">answers/${q.id}</span>`));
    const side = el('div', 'qside');
    const ch = el('div', 'choices'); ch.setAttribute('role', 'group'); ch.setAttribute('aria-label', q.title);
    for (const [v, l, sub] of q.choices) {
      const b = el('button', null, `<b>${esc(l)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}`); b.type = 'button'; b.dataset.v = v; b.disabled = true;
      b.addEventListener('click', () => put('answers', q.id, { choice: answers[q.id]?.choice === v ? null : v }));
      ch.append(b);
    }
    const ta = el('textarea'); ta.rows = 2; ta.id = 'ans-' + q.id; ta.placeholder = 'Note (optional)'; ta.disabled = true; ta.setAttribute('aria-label', 'Note on ' + q.title);
    noteBox(ta, () => answers[q.id], (p) => put('answers', q.id, p));
    if (q.suggest) side.append(el('p', 'suggest', `<b>My suggestion:</b> ${esc(q.suggest)}`));
    if (q.choices.length) side.append(ch);
    side.append(el('p', 'hint', q.choices.length ? 'No answer means you accept the recommended option.' : 'No answer means you accept the suggestion.'), ta);
    row.append(side);
    askers.push({ id: q.id, ch, ta });
    qHost.append(row);
  };
  for (const q of C.questions) askRow(q, $('questions'));
  for (const q of C.mixQuestions) askRow(q, $('mixq'));
  // the pairings: an icon pair (lead + carried colours), the effect, and a rating per row
  const chip = (e) => `<i class="px" style="background:${X.EL[e][2]};box-shadow:inset 0 -3px 0 ${X.EL[e][4] || X.EL[e][3]}, inset 0 3px 0 ${X.EL[e][1]}" title="${ELN[e]}"></i>`;
  // [id, label, lead element, carried, text, reply?]; reply = an answer to the user's earlier note on this row
  function pairRow([id, lead, le, carried, text, reply], host) {
    const row = el('article', 'pairrow'); row.id = id; row.dataset.rid = id;
    const lhs = el('div', 'ptext');
    const lab = lead;
    lhs.append(el('div', 'picons', id === 'mix-weak' ? ['fire', 'cold', 'water', 'lightning'].map(chip).join('') : chip(le) + '<span class="plus">+</span>' + carried.map(chip).join('')));
    lhs.append(el('div', null, `<b>${esc(lab)}</b><p>${esc(text)}</p>${reply ? `<p class="reply"><span class="badge new r4">Round 4</span> ${esc(reply)}</p>` : ''}<span class="slug">${id}</span>`));
    row.append(lhs, rater(id, lab, true));
    host.append(row);
  }
  for (const p of C.mixPairs) pairRow(p, $('mixpairs'));

  // Round 4: the Arcane guard redesign: one card (Capacitor), its Lance and the Fire variant,
  // the q-prism question, and three more rated mixing rows
  (function buildRound4() {
    const R4 = C.round4, host = $('round4');
    if (!host) return;
    $('r4since').textContent = R4.since;
    const cd = R4.card, ids = [cd.id, ...R4.moves.map((m) => m.id)];
    if (ids.some(show)) {
      const card = el('article', 'wcard gcard'); card.id = cd.id; card.dataset.rid = cd.id;
      const info = el('div', 'ginfo');
      info.append(el('h3', null, `${esc(cd.name)} <span class="slug">${cd.id}</span><span class="badge new r4">New in round 4</span>`), recipe(['shield', 'arcane'], 'Weapon'));
      info.append(el('dl', 'facts', `<div><dt>Capacitor</dt><dd>${esc(cd.what)}</dd></div><div><dt>Numbers</dt><dd>${esc(cd.numbers)}</dd></div><div><dt>What your partner sees</dt><dd>${esc(cd.partner)}</dd></div><div><dt>Cost</dt><dd>${esc(cd.cost)}</dd></div>`));
      const pb = el('div', 'prior'); pb.hidden = true; priors.push({ prev: 'g-prism-v3', box: pb, label: 'Round 3' }); info.append(pb);
      info.append(rater(cd.id, cd.name));
      card.append(info);
      const grid = el('div', 'mgrid');
      if (show(cd.id)) {
        const cell = el('div', 'mcell');
        cell.append(screen(cd.id, 'Prism v4: charge, then the Lance'));
        const cap = el('div', 'mcap');
        cap.append(el('h4', null, 'Block, store, release <kbd>Space hold, then let go</kbd><span class="uses">free</span>'));
        cap.append(el('p', 'small', '<b>On screen:</b> ' + esc(cd.fx)));
        cap.append(el('div', 'meta', `<span class="badge new r4">New in round 4</span><span class="slug">${cd.id} (rated with the card above)</span>`));
        cell.append(cap); grid.append(cell);
      }
      for (const m of R4.moves) {
        if (!show(m.id)) continue;
        const cell = el('div', 'mcell'); cell.id = m.id; cell.dataset.rid = m.id;
        cell.append(screen(m.id, `Prism: ${m.title}`));
        const cap = el('div', 'mcap');
        cap.append(el('h4', null, `${esc(m.title)} <kbd>${esc(m.key)}</kbd>`));
        cap.append(el('p', null, esc(m.text)));
        cap.append(el('p', 'small', '<b>On screen:</b> ' + esc(m.fx)));
        cap.append(el('div', 'meta', `<span class="badge new r4">New in round 4</span><span class="slug">${m.id}</span>`));
        cap.append(rater(m.id, `Prism ${m.title}`, true));
        cell.append(cap); grid.append(cell);
      }
      card.append(grid);
      host.append(card);
    }
    askRow(R4.question, $('r4q'));
    for (const p of R4.pairs) pairRow(p, $('r4pairs'));
  })();
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
    for (const P of priors) {
      const r = ratings[P.prev];
      if (!r || (!r.mark && !r.note)) { P.box.hidden = true; continue; }
      P.box.hidden = false;
      P.box.innerHTML = `<span class="plabel">${P.label} <span class="slug">${esc(P.prev)}</span></span>${r.mark ? `<b class="pm pm-${r.mark}">${MARKL[r.mark]}</b>` : ''}${r.note ? `<q>${esc(r.note)}</q>` : ''}`;
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
