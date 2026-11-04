/* Gallery UI: cards, filters, the animation loop, and ratings.
 * Ratings live in the artifact's db (collection "ratings", one doc per spell id:
 * { mark: 'keep'|'maybe'|'cut'|null, note: string, updatedAt }) so Claude can
 * read them back. Without db they fall back to this browser's localStorage. */
(function () {
  const FAMILIES = ['offense', 'control', 'preparation', 'support', 'enchant', 'weapon', 'summon', 'movement'];
  const FAMILY_LABEL = { offense: 'Offense', control: 'Control', preparation: 'Preparation', support: 'Support', enchant: 'Enchant', weapon: 'Weapon', summon: 'Summon', movement: 'Movement' };
  const BADGE = { starred: '★ Your wishlist', maybe: '? Your wishlist', user: 'Your idea', new: 'New idea', tree: 'From the spell tree', magick: 'Co-op Magick' };
  const MARKS = [['keep', '★', 'Keep'], ['maybe', '?', 'Maybe'], ['cut', '✗', 'Cut']];
  const LS_KEY = 'spell-gallery-ratings';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const spells = SG.registry.slice().sort((a, b) =>
    FAMILIES.indexOf(a.family) - FAMILIES.indexOf(b.family) || a.name.localeCompare(b.name));
  const isWishlist = (v) => !['new', 'tree', 'magick'].includes(v.status);
  const isMagick = (v) => v.status === 'magick';
  const isTree = (v) => v.status === 'tree';

  const ratings = {};        // id -> { mark, note }
  let db = null;
  const state = { group: 'all', family: null };

  // ---------- local fallback ----------
  function lsLoad() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; } }
  function lsSave() { try { localStorage.setItem(LS_KEY, JSON.stringify(ratings)); } catch { /* storage blocked */ } }
  Object.assign(ratings, lsLoad());

  // ---------- filters ----------
  const filtersEl = document.getElementById('filters');
  function chip(label, pressed, onClick, opts = {}) {
    const b = document.createElement('button');
    b.className = 'chip'; b.type = 'button'; b.setAttribute('aria-pressed', pressed);
    if (opts.color) { b.style.setProperty('--c', opts.color); b.insertAdjacentHTML('afterbegin', '<span class="dot"></span>'); }
    b.append(label);
    if (opts.count != null) { const n = document.createElement('span'); n.className = 'n'; n.textContent = opts.count; b.append(n); }
    b.addEventListener('click', onClick);
    return b;
  }
  function renderFilters() {
    filtersEl.replaceChildren();
    const unrated = spells.filter((v) => !ratings[v.id]?.mark).length;
    for (const [key, label, n] of [['all', 'All', spells.length], ['wishlist', 'Your wishlist', spells.filter(isWishlist).length], ['new', 'New ideas', spells.filter((v) => v.status === 'new').length], ['tree', 'Spell tree', spells.filter(isTree).length], ['magick', 'Co-op Magicks', spells.filter(isMagick).length], ['unrated', 'Unrated', unrated]]) {
      filtersEl.append(chip(label, state.group === key, () => { state.group = key; applyFilters(); }, { count: n }));
    }
    const sep = document.createElement('span'); sep.className = 'sep'; filtersEl.append(sep);
    for (const f of FAMILIES) {
      const n = spells.filter((v) => v.family === f).length;
      if (!n) continue;
      filtersEl.append(chip(FAMILY_LABEL[f], state.family === f, () => { state.family = state.family === f ? null : f; applyFilters(); }, { color: `var(--f-${f})`, count: n }));
    }
  }
  function visible(v) {
    if (state.family && v.family !== state.family) return false;
    if (state.group === 'wishlist') return isWishlist(v);
    if (state.group === 'new') return v.status === 'new';
    if (state.group === 'tree') return isTree(v);
    if (state.group === 'magick') return isMagick(v);
    if (state.group === 'unrated') return !ratings[v.id]?.mark;
    return true;
  }
  function applyFilters() {
    renderFilters();
    for (const sec of document.querySelectorAll('section.group')) {
      let shown = 0;
      for (const card of sec.querySelectorAll('.card')) {
        const on = visible(cards[card.dataset.id].v);
        card.hidden = !on; shown += on;
      }
      sec.hidden = shown === 0;
    }
    document.getElementById('none').hidden = !!document.querySelector('section.group:not([hidden])');
  }

  // ---------- cards ----------
  const main = document.getElementById('main');
  const cards = {};
  const groups = [
    { key: 'tree', title: 'Implied by the spell tree', blurb: 'Round 3. Spells nobody proposed that fall out of proposal A (Point, Seal and Release). The recipe is on each card.', filter: isTree },
    { key: 'magick', title: 'Co-op Magicks', blurb: 'Round 3. Special spells that need two casters: one opens the Magick, the other joins by casting the same sequence.', filter: isMagick },
    { key: 'wishlist', title: 'From your wishlist', blurb: 'Your starred and maybe spells, plus your own round 1 ideas, in motion.', filter: isWishlist },
    { key: 'new', title: 'New ideas', blurb: 'Round 2. Borrowed from other games and reshaped for this one. The source is on each card.', filter: (v) => v.status === 'new' },
  ];
  for (const gr of groups) {
    const list = spells.filter(gr.filter);
    if (!list.length) continue;
    const sec = document.createElement('section'); sec.className = 'group';
    sec.innerHTML = `<header><h2></h2><p></p></header><div class="grid"></div>`;
    sec.querySelector('h2').textContent = gr.title;
    sec.querySelector('p').textContent = gr.blurb;
    const grid = sec.querySelector('.grid');
    for (const v of list) grid.append(makeCard(v));
    main.append(sec);
  }
  const none = document.createElement('p'); none.id = 'none'; none.className = 'empty'; none.hidden = true;
  none.textContent = 'No spells match these filters. Choose All to see every card.';
  main.append(none);

  function makeCard(v) {
    const el = document.createElement('article');
    el.className = 'card'; el.dataset.id = v.id;
    el.style.setProperty('--c', `var(--f-${v.family})`);
    el.innerHTML = `
      <div class="stage" role="button" tabindex="0" aria-label="Pause or play the ${v.name} scene">
        <canvas width="800" height="520"></canvas>
        <span class="badge ${v.status}"></span>
        <div class="paused"><span>▶</span></div>
        <div class="scrub"></div>
      </div>
      <div class="body">
        <div class="title-row"><h3></h3><span class="fam"></span></div>
        <p class="one"></p>
        <dl></dl>
      </div>
      <div class="rate">
        <div class="seg" role="group" aria-label="Rate ${v.name}"></div>
        <textarea id="note-${v.id}" rows="1" placeholder="Add a note (optional)"></textarea>
      </div>`;
    el.querySelector('.badge').textContent = BADGE[v.status] || 'New idea';
    el.querySelector('h3').textContent = v.name;
    el.querySelector('.fam').textContent = FAMILY_LABEL[v.family] || v.family;
    el.querySelector('.one').textContent = v.oneLiner;
    const dl = el.querySelector('dl');
    for (const [k, val] of [['Best when', v.situation], ['Co-op', v.coop], ['Source', v.source]]) {
      if (!val) continue;
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = val;
      dl.append(dt, dd);
    }
    const seg = el.querySelector('.seg');
    for (const [val, icon, label] of MARKS) {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.v = val; b.setAttribute('aria-pressed', 'false');
      b.innerHTML = `<span aria-hidden="true">${icon}</span>`; b.append(label);
      b.addEventListener('click', () => {
        const cur = ratings[v.id]?.mark;
        setRating(v.id, { mark: cur === val ? null : val });
      });
      seg.append(b);
    }
    const ta = el.querySelector('textarea');
    let timer = null;
    ta.addEventListener('input', () => { autosize(ta); clearTimeout(timer); timer = setTimeout(() => setRating(v.id, { note: ta.value }), 900); });
    ta.addEventListener('blur', () => { clearTimeout(timer); if ((ratings[v.id]?.note || '') !== ta.value) setRating(v.id, { note: ta.value }); });

    const stage = el.querySelector('.stage');
    const card = { v, el, canvas: el.querySelector('canvas'), stage, scrub: el.querySelector('.scrub'), ta, offset: 0, paused: reduced, pausedAt: v.duration * 0.55, onScreen: false };
    stage.classList.toggle('is-paused', card.paused);
    const toggle = () => {
      const now = performance.now() / 1000;
      if (card.paused) { card.offset = now - card.pausedAt; card.paused = false; }
      else { card.pausedAt = ((now - card.offset) % v.duration + v.duration) % v.duration; card.paused = true; }
      stage.classList.toggle('is-paused', card.paused);
      draw(card, now);
    };
    stage.addEventListener('click', toggle);
    stage.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } });
    cards[v.id] = card;
    // Stagger start times so neighbours don't pulse in sync.
    card.offset = -v.duration * ((spells.indexOf(v) * 0.37) % 1);
    return el;
  }
  function autosize(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, 180) + 'px'; }

  function paintRating(id) {
    const c = cards[id]; if (!c) return;
    const r = ratings[id] || {};
    c.el.dataset.mark = r.mark || '';
    for (const b of c.el.querySelectorAll('.seg button')) b.setAttribute('aria-pressed', String(b.dataset.v === r.mark));
    if (document.activeElement !== c.ta && c.ta.value !== (r.note || '')) { c.ta.value = r.note || ''; autosize(c.ta); }
  }
  function paintProgress() {
    const n = spells.length;
    const cnt = { keep: 0, maybe: 0, cut: 0 };
    for (const v of spells) { const m = ratings[v.id]?.mark; if (m) cnt[m]++; }
    const rated = cnt.keep + cnt.maybe + cnt.cut;
    document.querySelector('.bar .k').style.width = (cnt.keep / n * 100) + '%';
    document.querySelector('.bar .m').style.width = (cnt.maybe / n * 100) + '%';
    document.querySelector('.bar .c').style.width = (cnt.cut / n * 100) + '%';
    document.getElementById('count').textContent = `${rated} of ${n} rated · ${cnt.keep} keep · ${cnt.maybe} maybe · ${cnt.cut} cut`;
  }
  function paintAll() { for (const v of spells) paintRating(v.id); paintProgress(); }

  // ---------- saving ----------
  const saveEl = document.getElementById('saveState');
  function saveState(text, warn) { saveEl.textContent = text; saveEl.classList.toggle('warn', !!warn); }
  const chains = {};
  function setRating(id, patch) {
    ratings[id] = Object.assign({ mark: null, note: '' }, ratings[id], patch);
    lsSave(); paintRating(id); paintProgress();
    renderFilters(); // refresh counts; cards stay put until the filter is chosen again
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
      lsSave(); paintAll(); renderFilters();
    }, () => { clearTimeout(loadTimer); saveState('Saved ratings are unavailable. Ratings stay in this browser.', true); db = null; });
  })();

  // ---------- animation ----------
  function draw(card, now) {
    const v = card.v;
    const t = card.paused ? card.pausedAt : ((now - card.offset) % v.duration + v.duration) % v.duration;
    SG.renderFrame(card.canvas, v, t);
    card.scrub.style.width = (t / v.duration * 100) + '%';
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const c = cards[e.target.closest('.card').dataset.id];
      c.onScreen = e.isIntersecting;
      if (c.onScreen) draw(c, performance.now() / 1000);
    }
  }, { rootMargin: '120px' });
  for (const c of Object.values(cards)) { io.observe(c.stage); draw(c, performance.now() / 1000); }
  function loop() {
    const now = performance.now() / 1000;
    for (const c of Object.values(cards)) if (c.onScreen && !c.paused && !c.el.hidden) draw(c, now);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  document.fonts?.ready.then(() => { for (const c of Object.values(cards)) draw(c, performance.now() / 1000); });

  renderFilters(); paintAll();
})();
