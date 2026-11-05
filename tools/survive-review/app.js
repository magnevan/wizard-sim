/* Survive Review: builds the page from copy.js (PB.SR), runs the scenes (scenes.js, PB.SRV), stores
 * ratings and answers. Same scheme as tools/weapon-moves/app.js.
 * URL params: ?t=<sec> freezes every scene; ?scale=<n> forces the pixel scale; ?static=1 behaves like
 * prefers-reduced-motion.
 * db: ratings/<slug> { mark: 'keep'|'maybe'|'cut'|null, note, updatedAt }
 *     answers/<question id> { choice, note, updatedAt }; answers/general { choice: null, note, updatedAt }
 * Without the db the page is read-only (ratings disabled). */
(function () {
  'use strict';
  const PB = window.PB, SR = PB.SR, V = PB.SRV, ST = PB.stage, X = PB.px, $ = (id) => document.getElementById(id);
  const Q = new URLSearchParams(location.search);
  const FREEZE = Q.has('t') ? parseFloat(Q.get('t')) : null;
  const STATIC = Q.get('static') === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  // ---------- state + db ----------
  const ratings = {}, answers = {};
  let db = null;
  const raters = [], askers = [];
  const setSave = (t, w) => { $('saveState').textContent = t; $('saveState').classList.toggle('warn', !!w); };
  const chains = {};
  function put(coll, id, body) {
    const store = coll === 'ratings' ? ratings : answers;
    store[id] = Object.assign({}, store[id], body);
    paint();
    if (!db) return;
    setSave('Saving…');
    const now = new Date().toISOString();
    const doc = coll === 'ratings' ? { mark: store[id].mark || null, note: store[id].note || '', updatedAt: now } : { choice: store[id].choice || null, note: store[id].note || '', updatedAt: now };
    const k = coll + '/' + id;
    chains[k] = (chains[k] || Promise.resolve()).then(() => db.doc(k).set(doc)).then(() => setSave('All saved')).catch(() => setSave('Couldn’t save that. Check your connection and try again.', true));
  }
  function noteBox(ta, get, set) {
    let timer;
    ta.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => set({ note: ta.value }), 900); });
    ta.addEventListener('blur', () => { clearTimeout(timer); if ((get()?.note || '') !== ta.value) set({ note: ta.value }); });
  }
  function rater(id, label) {
    const box = el('div', 'rate');
    const seg = el('div', 'verdict'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Rate ' + label);
    for (const [v, l] of [['keep', '★ Keep'], ['maybe', '? Maybe'], ['cut', '✗ Cut']]) {
      const b = el('button', null, l); b.type = 'button'; b.dataset.v = v; b.disabled = true;
      b.addEventListener('click', () => put('ratings', id, { mark: ratings[id]?.mark === v ? null : v }));
      seg.append(b);
    }
    const ta = el('textarea'); ta.rows = 1; ta.id = 'note-' + id; ta.placeholder = 'Note (optional)'; ta.disabled = true; ta.setAttribute('aria-label', 'Note on ' + label);
    noteBox(ta, () => ratings[id], (p) => put('ratings', id, p));
    box.append(seg, ta);
    raters.push({ id, seg, ta });
    return box;
  }

  // ---------- scenes ----------
  const screens = [];
  function screen(d, label) {
    const s = el('div', 'screen'); s.tabIndex = 0; s.setAttribute('role', 'button'); s.setAttribute('aria-label', label + ' (click to pause)');
    const cv = document.createElement('canvas'); cv.width = d.w; cv.height = d.h; cv.setAttribute('aria-label', label);
    const ps = el('span', 'paused', 'PAUSED'); ps.hidden = true;
    s.append(cv, ps);
    const S = { d, s, cv, ctx: cv.getContext('2d', { willReadFrequently: true }), ps, visible: false, paused: STATIC, t0: performance.now(), last: -1, tShown: null };
    S.ctx.imageSmoothingEnabled = false;
    const toggle = () => { S.paused = !S.paused; S.ps.hidden = !S.paused; if (!S.paused) S.t0 = performance.now() - (S.tShown || 0) * 1000; };
    s.addEventListener('click', toggle);
    s.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    screens.push(S);
    return s;
  }
  const loopItems = [];
  function draw(S, t) {
    try {
      if (S.d.map) { S.d.draw(S.ctx, t); const ph = S.d.phaseAt(t); for (const li of loopItems) li.classList.toggle('on', li.dataset.ph === ph); }
      else ST.render(S.ctx, S.d, t, PB.K);
      S.tShown = t;
    } catch (e) { $('errs').textContent += `${S.d.id}: ${e.message}\n`; document.body.dataset.err = '1'; S.broken = true; }
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

  // a power-up's glyph as the altar shows it: a dark tile, a rim in its colour, the glyph lit
  function glyphCanvas(p) {
    const cv = document.createElement('canvas'); cv.width = 13; cv.height = 13;
    const c = cv.getContext('2d'), R = X.EL[p.ramp] || X.EL.sigil;
    X.rect(c, 0, 0, 13, 13, '#0a0810'); X.rect(c, 1, 1, 11, 11, '#1a1726'); X.rect(c, 0, 0, 13, 1, R[3] || R[2]); X.rect(c, 0, 12, 13, 1, R[4] || R[3]);
    X.fs(c, R[3] || R[2]); for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) if (p.glyph[j][i] === '#') c.fillRect(3 + i, 4 + j, 1, 1);
    X.fs(c, R[1]); for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) if (p.glyph[j][i] === '#') c.fillRect(3 + i, 3 + j, 1, 1);
    cv.setAttribute('aria-label', p.name + ' glyph');
    return cv;
  }
  const capText = (p) => (p.status !== 'built' ? '' : p.slug === 'pu-echo' ? 'One wave; can be picked again' : p.cap === 1 ? 'Once per run' : `Stacks ×${p.cap}`);

  // ---------- build ----------
  // the map and the loop
  $('mapHost').append(screen(V.arena, 'The Survive arena from above, through one loop'));
  for (const [id, name, time, text] of SR.LOOP) {
    const li = el('li', null, `<b>${esc(name)}</b><span class="num">${esc(time)}</span><p>${esc(text)}</p>`); li.dataset.ph = id;
    loopItems.push(li); $('loop').append(li);
  }
  $('pickHost').append(screen(V.pick, 'The pick: three altars, two players'));
  for (const [n, mix, q] of SR.WAVES) $('waves').append(el('tr', null, `<td class="num">${n}</td><td>${esc(mix)}</td><td class="q">${esc(q)}</td>`));

  // power-up cards (Rally and Echo first and wide, with their scenes)
  const order = [...SR.PERKS.filter((p) => p.scene).reverse(), ...SR.PERKS.filter((p) => !p.scene)];
  for (const p of order) {
    const card = el('article', 'pu' + (p.scene ? ' wide' : '') + (p.status === 'designed' ? ' designed' : p.status === 'cut' ? ' cut' : '')); card.id = p.slug; card.dataset.rid = p.slug;
    if (p.scene) card.append(screen(V[p.scene], p.name + ' in play'));
    const main = el('div');
    const head = el('div', 'puhead');
    const gb = el('div', 'glyphbox'); gb.append(glyphCanvas(p));
    const ht = el('div');
    ht.append(el('h3', null, esc(p.name)), el('p', 'rule', esc(p.rule)));
    head.append(gb, ht);
    const body = el('div', 'pubody');
    body.append(el('div', 'meta', `<span class="badge ${p.status}">${({ built: 'Built', designed: 'Designed', cut: 'Cut', default: 'Everyone has it' })[p.status] || p.status}</span>${capText(p) ? `<span class="badge cap">${esc(capText(p))}</span>` : ''}${p.flag ? `<span class="badge flag">${esc(p.flag)}</span>` : ''}<span class="slug">${p.slug}</span>`));
    body.append(el('dl', null, `<div><dt>What it does</dt><dd class="does">${esc(p.does)}</dd></div><div><dt>What your partner sees</dt><dd>${esc(p.sees)}</dd></div><div><dt>The cost</dt><dd>${esc(p.cost)}</dd></div><div><dt>Pillars</dt><dd>${esc(p.pillar)}</dd></div>`));
    if (p.glyphNote) body.append(el('p', 'note', esc(p.glyphNote)));
    if (p.scene === 'rally') body.append(el('p', 'note', 'The scene: P1 walks into the dashed ring and starts to fill it; a goblin’s hit empties it (the break rule in Q10). P1 burns the goblin down, stands again for the full 3 s, and P2 gets up in a column of Life light with 40% health.'));
    if (p.scene === 'echo') body.append(el('p', 'note', 'The scene: the Double appears at the pick. Both goblins head for it, not for you. It repeats each of your bolts at half power (Q11), takes a hit, and fades when the wave is cleared (Q12).'));
    body.append(rater(p.slug, p.name));
    main.append(head, body);
    card.append(main);
    $(p.status === 'designed' ? 'designed' : 'built').append(card);
  }
  for (const [name, why] of SR.DROPPED) $('dropped').append(el('li', null, `<b>${esc(name)}:</b> ${esc(why)}`));

  // questions, with answer boxes next to the text
  $('decided').innerHTML = SR.DECIDED.map(([n, t]) => `<div><b>${esc(n)}</b> ${esc(t)}</div>`).join('');
  for (const q of SR.QUESTIONS) {
    const row = el('article', 'qrow' + (q.id === 'q-pillar1' ? ' vision' : '')); row.id = q.id;
    const rec = q.choices.find((c) => c[3].includes('rec')), built = q.choices.find((c) => c[3].includes('built'));
    row.append(el('div', 'qtext', `<h3><span class="qn">${esc(q.n)}</span> ${esc(q.title)}</h3><p>${esc(q.text)}</p><p><b>Recommended:</b> ${esc(rec[1])}. <b>Built now:</b> ${esc(built ? built[1] : 'none')}.</p><span class="slug">answers/${q.id}</span>`));
    const side = el('div', 'qside');
    const ch = el('div', 'choices'); ch.setAttribute('role', 'group'); ch.setAttribute('aria-label', q.title);
    for (const [v, l, sub, flags] of q.choices) {
      const tags = (flags.includes('rec') ? '<span class="tag rec">Recommended</span>' : '') + (flags.includes('built') ? '<span class="tag built">Built now</span>' : '');
      const b = el('button', null, `<b>${esc(l)}</b>${tags ? `<span class="tags">${tags}</span>` : ''}${sub ? `<small>${esc(sub)}</small>` : ''}`); b.type = 'button'; b.dataset.v = v; b.disabled = true;
      b.addEventListener('click', () => put('answers', q.id, { choice: answers[q.id]?.choice === v ? null : v }));
      ch.append(b);
    }
    const ta = el('textarea'); ta.rows = 2; ta.id = 'ans-' + q.id; ta.placeholder = 'Note (optional)'; ta.disabled = true; ta.setAttribute('aria-label', 'Note on ' + q.title);
    noteBox(ta, () => answers[q.id], (p) => put('answers', q.id, p));
    side.append(ch, el('p', 'hint', 'No answer means you accept the recommended option.'), ta);
    row.append(side);
    askers.push({ id: q.id, ch, ta });
    $('questions').append(row);
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
    let a = 0;
    for (const A of askers) {
      const ans = answers[A.id] || {};
      if (ans.choice) a++;
      for (const b of A.ch.children) { b.setAttribute('aria-pressed', String(b.dataset.v === ans.choice)); b.disabled = !db; }
      A.ta.disabled = !db;
      if (document.activeElement !== A.ta && A.ta.value !== (ans.note || '')) A.ta.value = ans.note || '';
    }
    gen.disabled = !db;
    if (document.activeElement !== gen && gen.value !== (answers.general?.note || '')) gen.value = answers.general?.note || '';
    $('tally').innerHTML = `<b>${n}</b> of ${raters.length} rated · <b>${a}</b> of ${askers.length} answered`;
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
