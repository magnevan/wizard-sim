/* Art Style Explorer UI: cards, chaos slider, pause, animation loop, ratings.
 * Ratings live in the artifact's db (collection "ratings", one doc per style id:
 * { mark: 'keep'|'maybe'|'cut'|null, note, updatedAt }) so Claude can read them back.
 * Without db they fall back to this browser's localStorage.
 *
 * Debug: ?style=<id>&t=<seconds>[&chaos=0..100] renders one frozen frame of one style.
 *        ?t=<seconds> freezes every card at that time. */
(function () {
  const MARKS = [['keep', '★', 'Keep'], ['maybe', '?', 'Maybe'], ['cut', '✗', 'Cut']];
  const NOTES = [['read', 'Readability in chaos'], ['tone', 'Fits the tone'], ['cost', 'Cost for a small team']];
  const LS_KEY = 'art-style-explorer-ratings';
  const LS_CHAOS = 'art-style-explorer-chaos';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const qs = new URLSearchParams(location.search);
  const debugT = qs.has('t') ? parseFloat(qs.get('t')) : null;
  const solo = qs.get('style');

  const styles = AS.styles;
  const ratings = {};
  let db = null;
  let chaos = 0.5;
  try { const c = parseFloat(localStorage.getItem(LS_CHAOS)); if (!isNaN(c)) chaos = c; } catch { /* storage blocked */ }
  if (qs.has('chaos')) chaos = parseFloat(qs.get('chaos')) / 100;
  let allPaused = reduced || debugT != null;
  let fontsReady = false;

  function lsLoad() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; } }
  function lsSave() { try { localStorage.setItem(LS_KEY, JSON.stringify(ratings)); } catch { /* storage blocked */ } }
  Object.assign(ratings, lsLoad());

  // ---------- cards ----------
  // Round 2 (variants of the round-1 survivors) is shown first, grouped by family;
  // round 1 follows, with the user's verdicts on it.
  const grid = document.getElementById('grid');
  const grid1 = document.getElementById('grid1') || grid;
  const cards = {};
  const FAMILY = ['toon', 'pixel', 'glow'];
  const ordered = styles.filter((s) => s.round === 2).sort((a, b) => FAMILY.indexOf(a.family) - FAMILY.indexOf(b.family))
    .concat(styles.filter((s) => s.round !== 2));
  ordered.forEach((st, idx) => {
    if (solo && st.id !== solo) return;
    (st.round === 2 ? grid : grid1).append(makeCard(st, idx));
  });
  if (solo) document.body.classList.add('solo');

  function makeCard(st, idx) {
    const el = document.createElement('article');
    el.className = 'card'; el.dataset.id = st.id;
    el.innerHTML = `
      <div class="stage" role="button" tabindex="0">
        <canvas width="640" height="400"></canvas>
        <span class="num"></span>
        <div class="paused"><span>▶</span></div>
        <div class="scrub"></div>
      </div>
      <div class="body">
        <div class="title-row"><h2></h2><div class="refs"></div></div>
        <p class="feel"></p>
        <dl></dl>
      </div>
      <div class="rate">
        <div class="seg" role="group"></div>
        <textarea rows="1" placeholder="Add a note (optional)"></textarea>
      </div>`;
    const stage = el.querySelector('.stage');
    stage.setAttribute('aria-label', `Pause or play the ${st.name} scene`);
    el.querySelector('.num').textContent = String(idx + 1).padStart(2, '0');
    el.querySelector('h2').textContent = st.name;
    const refs = el.querySelector('.refs');
    for (const r of st.refs) { const s = document.createElement('span'); s.textContent = r; refs.append(s); }
    el.querySelector('.feel').textContent = st.feel;
    const dl = el.querySelector('dl');
    for (const [k, label] of NOTES) {
      const row = document.createElement('div');
      const dt = document.createElement('dt'); dt.textContent = label;
      const dd = document.createElement('dd');
      const [verdict, rest] = st.notes[k];
      const b = document.createElement('b'); b.textContent = verdict + '. ';
      dd.append(b, rest);
      row.append(dt, dd); dl.append(row);
    }
    const seg = el.querySelector('.seg');
    seg.setAttribute('aria-label', `Rate ${st.name}`);
    for (const [val, icon, label] of MARKS) {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.v = val; b.setAttribute('aria-pressed', 'false');
      b.innerHTML = `<span aria-hidden="true">${icon}</span>`; b.append(label);
      b.addEventListener('click', () => setRating(st.id, { mark: ratings[st.id]?.mark === val ? null : val }));
      seg.append(b);
    }
    const ta = el.querySelector('textarea');
    ta.setAttribute('aria-label', `Note on ${st.name}`);
    let timer = null;
    ta.addEventListener('input', () => { autosize(ta); clearTimeout(timer); timer = setTimeout(() => setRating(st.id, { note: ta.value }), 900); });
    ta.addEventListener('blur', () => { clearTimeout(timer); if ((ratings[st.id]?.note || '') !== ta.value) setRating(st.id, { note: ta.value }); });

    const canvas = el.querySelector('canvas');
    const card = { st, el, canvas, ctx: canvas.getContext('2d'), stage, scrub: el.querySelector('.scrub'), ta,
      offset: -AS.LOOP * ((idx * 0.37) % 1), paused: false, pausedAt: debugT ?? 2.8, onScreen: !!solo, scale: 1 };
    const toggle = () => {
      const now = performance.now() / 1000;
      if (isPaused(card)) {
        card.offset = now - card.pausedAt; card.paused = false;
        if (allPaused) { allPaused = false; for (const c of Object.values(cards)) if (c !== card) { c.paused = true; } paintPauseBtn(); }
      } else { card.pausedAt = curT(card, now); card.paused = true; }
      paintPaused(card); draw(card, now);
    };
    stage.addEventListener('click', toggle);
    stage.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } });
    cards[st.id] = card;
    return el;
  }
  function autosize(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, 180) + 'px'; }

  // ---------- canvas sizing ----------
  function sizeCanvas(card) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = card.stage.clientWidth || 640;
    let w = Math.max(320, Math.min(1280, Math.round(cssW * dpr)));
    if (card.st.pixelWidth) w = card.st.pixelWidth * Math.max(1, Math.round(w / card.st.pixelWidth));
    const h = Math.round(w * 400 / 640);
    if (card.canvas.width !== w || card.canvas.height !== h) { card.canvas.width = w; card.canvas.height = h; }
    card.scale = w / 640;
  }
  const ro = new ResizeObserver(() => { for (const c of Object.values(cards)) { sizeCanvas(c); draw(c, performance.now() / 1000); } });
  for (const c of Object.values(cards)) { sizeCanvas(c); ro.observe(c.stage); }

  // ---------- animation ----------
  const isPaused = (c) => allPaused || c.paused;
  const curT = (c, now) => isPaused(c) ? c.pausedAt : AS.mod(now - c.offset, AS.LOOP);
  function paintPaused(c) { c.stage.classList.toggle('is-paused', isPaused(c) && debugT == null); }
  function draw(card, now) {
    let t = curT(card, now);
    if (card.st.fps) t = Math.floor(t * card.st.fps) / card.st.fps;
    // Low-fps styles (stop motion) only redraw when their frame actually changes.
    const key = `${t}|${chaos}|${card.canvas.width}|${fontsReady}`;
    if (card.st.fps && key === card.lastKey) return;
    card.lastKey = key;
    const S = AS.scene(t, chaos);
    const ctx = card.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.setTransform(card.scale, 0, 0, card.scale, 0, 0);
    try { card.st.render(ctx, S, card.scale); } catch (e) { console.error(card.st.id, e); }
    card.scrub.style.width = (t / AS.LOOP * 100) + '%';
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const c = cards[e.target.closest('.card').dataset.id];
      c.onScreen = e.isIntersecting;
      if (c.onScreen) draw(c, performance.now() / 1000);
    }
  }, { rootMargin: '100px' });
  for (const c of Object.values(cards)) { io.observe(c.stage); paintPaused(c); draw(c, performance.now() / 1000); }
  function loop() {
    const now = performance.now() / 1000;
    for (const c of Object.values(cards)) if (c.onScreen && !isPaused(c)) draw(c, now);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  const redrawAll = () => { for (const c of Object.values(cards)) draw(c, performance.now() / 1000); };
  document.fonts?.ready.then(() => { fontsReady = true; redrawAll(); });

  // ---------- controls ----------
  const chaosEl = document.getElementById('chaos'), chaosOut = document.getElementById('chaosOut');
  chaosEl.value = Math.round(chaos * 100); chaosOut.textContent = chaosEl.value + '%';
  chaosEl.addEventListener('input', () => {
    chaos = chaosEl.value / 100; chaosOut.textContent = chaosEl.value + '%';
    try { localStorage.setItem(LS_CHAOS, String(chaos)); } catch { /* storage blocked */ }
    redrawAll();
  });
  const pauseBtn = document.getElementById('pauseAll');
  function paintPauseBtn() {
    pauseBtn.setAttribute('aria-pressed', String(allPaused));
    pauseBtn.textContent = allPaused ? '▶ Play all' : '❚❚ Pause all';
    for (const c of Object.values(cards)) paintPaused(c);
  }
  pauseBtn.addEventListener('click', () => {
    const now = performance.now() / 1000;
    if (allPaused) {
      allPaused = false;
      for (const c of Object.values(cards)) { c.offset = now - c.pausedAt; c.paused = false; }
    } else {
      for (const c of Object.values(cards)) if (!c.paused) c.pausedAt = curT(c, now);
      allPaused = true;
    }
    paintPauseBtn(); redrawAll();
  });
  paintPauseBtn();

  // ---------- ratings ----------
  function paintRating(id) {
    const c = cards[id]; if (!c) return;
    const r = ratings[id] || {};
    c.el.dataset.mark = r.mark || '';
    for (const b of c.el.querySelectorAll('.seg button')) b.setAttribute('aria-pressed', String(b.dataset.v === r.mark));
    if (document.activeElement !== c.ta && c.ta.value !== (r.note || '')) { c.ta.value = r.note || ''; autosize(c.ta); }
  }
  function paintCount() {
    const cnt = { keep: 0, maybe: 0, cut: 0 };
    for (const st of styles) { const m = ratings[st.id]?.mark; if (m) cnt[m]++; }
    const n = cnt.keep + cnt.maybe + cnt.cut;
    document.getElementById('count').textContent = `${n} of ${styles.length} rated · ${cnt.keep} keep · ${cnt.maybe} maybe · ${cnt.cut} cut`;
  }
  function paintAll() { for (const st of styles) paintRating(st.id); paintCount(); }

  const saveEl = document.getElementById('saveState');
  function saveState(text, warn) { saveEl.textContent = text; saveEl.classList.toggle('warn', !!warn); }
  const chains = {};
  function setRating(id, patch) {
    ratings[id] = Object.assign({ mark: null, note: '' }, ratings[id], patch);
    lsSave(); paintRating(id); paintCount();
    if (!db) return;
    const body = { mark: ratings[id].mark, note: ratings[id].note, updatedAt: new Date().toISOString() };
    saveState('Saving…');
    chains[id] = (chains[id] || Promise.resolve()).then(() => db.doc('ratings/' + id).set(body))
      .then(() => saveState('All ratings saved'))
      .catch((e) => saveState(e?.code === 'invalid_argument' ? 'You can view ratings but not change them' : 'Couldn’t save. Your rating is kept in this browser.', true));
  }

  (async () => {
    const loadTimer = setTimeout(() => saveState('Can’t reach saved ratings yet. Ratings stay in this browser for now.', true), 10000);
    try { db = await window.claude?.use?.('db'); } catch { db = null; }
    if (!db) { clearTimeout(loadTimer); saveState('Ratings are saved in this browser only'); return; }
    db.collection('ratings').onSnapshot((snap) => {
      for (const d of snap.docs) {
        const data = d.data();
        ratings[d.id] = { mark: data.mark || null, note: data.note || '' };
      }
      if (!snap.metadata.fromCache) { clearTimeout(loadTimer); if (!snap.metadata.hasPendingWrites) saveState('All ratings saved'); }
      lsSave(); paintAll();
    }, () => { clearTimeout(loadTimer); saveState('Saved ratings are unavailable. Ratings stay in this browser.', true); db = null; });
  })();

  paintAll();
})();
