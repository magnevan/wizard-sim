/* Pixel Battlefield app: full-viewport canvas, integer pixel scale, loop, controls,
 * feedback answers.
 *
 * Answers live in the artifact's db, collection "answers", one doc per question id:
 * { mark, note, updatedAt } (the perspective answer also records the pixel scale in use).
 * Pass 1 used ids overall/camera/zoom/structures/runes/procedural; pass 2 used p2-*;
 * pass 3 used p3-*; pass 4 uses p4-*. Older docs are never written again.
 * Without a db they are kept in this browser only.
 *
 * URL params: ?t=<seconds> freezes a frame, ?chaos=0..1 (debug; fixed at 0.8 otherwise), ?scale=2|3|4, ?ui=0 hides chrome. */
(function () {
  'use strict';
  const PB = window.PB, LOOP = PB.LOOP;
  const qs = new URLSearchParams(location.search);
  const LS = 'pixel-battlefield';
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(LS + ':' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(LS + ':' + k, JSON.stringify(v)); } catch { /* storage blocked */ } },
  };
  if (qs.get('ui') === '0') document.body.classList.add('noui');

  let scale = parseInt(qs.get('scale') || ls.get('scale', 3), 10);
  if (!(scale >= 1 && scale <= 10)) scale = 3;            // 2/3/4 in the UI; others for debugging close-ups
  if (qs.has('cam')) { const [cx, cy] = qs.get('cam').split(',').map(Number); if (!isNaN(cx) && !isNaN(cy)) PB.MAP.CAMERA = { x: cx, y: cy, fixed: true }; }
  let chaos = qs.has('chaos') ? parseFloat(qs.get('chaos')) : 0.8;   // background mayhem; the slider was cut in pass 2
  chaos = Math.max(0, Math.min(1, isNaN(chaos) ? 0.8 : chaos));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let paused = qs.has('t') || reduced, pausedAt = qs.has('t') ? parseFloat(qs.get('t')) : 2.0, offset = 0;

  // ---------- canvas ----------
  const view = document.getElementById('view'), vctx = view.getContext('2d');
  let LW = 0, LH = 0, S = 1;
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.max(1, Math.round(innerWidth * dpr)), bh = Math.max(1, Math.round(innerHeight * dpr));
    if (view.width !== bw || view.height !== bh) { view.width = bw; view.height = bh; }
    S = Math.max(1, Math.round(scale * dpr)); PB.viewScale = scale;
    LW = Math.ceil(bw / S); LH = Math.ceil(bh / S);
    draw(true);
  }
  addEventListener('resize', resize);

  const now = () => performance.now() / 1000;
  const curT = () => (paused ? pausedAt : PB.mod(now() - offset, LOOP));
  let lastKey = '';
  const perf = qs.has('perf') ? { n: 0, sum: 0 } : null;
  function draw(force) {
    const t = curT(), key = `${t.toFixed(4)}|${chaos}|${LW}x${LH}|${S}`;
    if (!force && key === lastKey) return;
    lastKey = key;
    let res;
    const t0 = performance.now();
    try { res = PB.render(PB.scene(t, chaos), LW, LH); } catch (e) { console.error(e); return; }
    if (perf) { perf.n++; perf.sum += performance.now() - t0; if (perf.n % 30 === 0) console.log(`perf ${LW}x${LH}: ${(perf.sum / perf.n).toFixed(1)} ms/frame avg over ${perf.n}`); }
    vctx.imageSmoothingEnabled = false;
    vctx.drawImage(res.canvas, 0, 0, LW * S, LH * S);
    paintTime(t);
  }
  function loop() { if (!paused) draw(); requestAnimationFrame(loop); }

  // ---------- controls ----------
  const scaleBtns = [...document.querySelectorAll('#scale button')];
  const paintScale = () => scaleBtns.forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.s === scale)));
  scaleBtns.forEach((b) => b.addEventListener('click', () => { scale = +b.dataset.s; ls.set('scale', scale); paintScale(); resize(); }));
  paintScale();
  const pauseBtn = document.getElementById('pause'), scrub = document.getElementById('scrub'), tOut = document.getElementById('tOut');
  function setPaused(p) {
    if (p === paused) return;
    if (p) pausedAt = curT(); else offset = now() - pausedAt;
    paused = p; pauseBtn.textContent = p ? '▶' : '❚❚'; pauseBtn.setAttribute('aria-pressed', String(p)); pauseBtn.setAttribute('aria-label', p ? 'Play' : 'Pause');
  }
  pauseBtn.textContent = paused ? '▶' : '❚❚'; pauseBtn.setAttribute('aria-pressed', String(paused)); pauseBtn.setAttribute('aria-label', paused ? 'Play' : 'Pause');
  pauseBtn.addEventListener('click', () => setPaused(!paused));
  function seek(t) { pausedAt = PB.mod(t, LOOP); offset = now() - pausedAt; draw(true); }
  scrub.addEventListener('input', () => { setPaused(true); seek(scrub.value / 100); });
  function paintTime(t) { if (document.activeElement !== scrub) scrub.value = Math.round(t * 100); tOut.textContent = t.toFixed(1) + 's'; }
  addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('textarea, input')) return;
    if (e.key === ' ') { e.preventDefault(); setPaused(!paused); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { setPaused(true); seek(curT() + (e.key === 'ArrowRight' ? 1 : -1) / 30); }
    else if (e.key === 'f') toggleFs();
  });
  function toggleFs() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }
  document.getElementById('fs').addEventListener('click', toggleFs);

  // ---------- moments to jump to ----------
  const fireShots = PB._dbg.TSHOTS, waits = fireShots.filter((s) => s.fire - s.want > 0.3);
  const MOMENTS = [
    [0.62, 'Red queues arcane + fire'], [1.9, 'Fire beam (arcane carrying fire), west'], [Math.round((fireShots[1].fire - 0.15) * 100) / 100, 'Turret draws a fire rune from Red'],
    [2.45, 'Brute starts on the rock wall: cracks'], [2.2, 'Burning brute (on the body)'],
    [3.1, 'Chain lightning through wet goblins'], [4.6, 'Rock wall chipped and half broken'], [5.0, 'Puddle freezes into an ice sheet'],
    [6.84, 'Turret bolt: steam, shatter, frost cracks'], [7.3, 'Shield at its weakest (Gold low on runes)'], [7.5, 'First blow cracks the frost wall'],
    [Math.round((waits[waits.length - 1].want + 0.5) * 100) / 100, 'Red is dry: the turret waits'], [Math.round((waits[waits.length - 1].fire - 0.12) * 100) / 100, 'Red regenerates: the turret resumes'],
    [8.25, 'Second blow breaks through'], [8.66, 'Glyph trap goes off'],
    [9.82, 'Hammer meets the flanker (east)'], [10.5, 'Blue raises the stone arc'],
    [11.2, 'Frost creeps over it; shield refilled'], [11.7, 'Violet raises a fresh rock wall'],
  ].sort((a, b) => a[0] - b[0]);
  const mEl = document.getElementById('moments');
  for (const [t, label] of MOMENTS) {
    const b = document.createElement('button'); b.type = 'button';
    const bt = document.createElement('b'); bt.textContent = t.toFixed(1) + 's';
    b.append(bt, label);
    b.addEventListener('click', () => { setPaused(true); seek(t); });
    mEl.append(b);
  }

  // ---------- feedback ----------
  // Each pass uses new doc ids, so earlier answers (pass 1: overall, camera, ...; pass 2:
  // p2-*) stay untouched in the db.
  // Pass 4 asks p4-* questions (pass 4.1 adds p5-turret). Answers to every earlier id still load (and stay in the
  // db), they're just not shown.
  const QUESTIONS = [
    { id: 'p4-overall', q: 'Pass 4 overall, compared with pass 3', opts: [['better', 'Better', 'good'], ['same', 'About the same', 'mid'], ['worse', 'Worse', 'bad']] },
    { id: 'p4-perspective', q: 'Perspective: one steep 3/4 camera. Floor slabs are wider than tall with a dark front edge; columns, the turret plinth, trees and walls show big tops and shorter fronts; all shadows fall down-right. Does the angle agree everywhere now? (Your pixel scale is saved with the answer.)', opts: [['agrees', 'Agrees', 'good'], ['mostly', 'Something still off', 'mid'], ['worse', 'Worse', 'bad']] },
    { id: 'p4-hud', q: 'Rune HUD in two staggered rows like the keys: Q W E R (water, life, shield, cold) over A S D F G (lightning, arcane, sigil, fire, earth)', opts: [['good', 'Easy to map', 'good'], ['ok', 'OK', 'mid'], ['worse', 'Worse than one row', 'bad']] },
    { id: 'p4-turret', q: 'Turret drawing from its owner: no ammo of its own; every shot pulls a fire rune from Red (a mote flies over, Red’s F pips dip and refill). When the east crowd comes (about 7.1 s), Red runs dry and the turret waits as an ember until Red regenerates. Does the rule read?', opts: [['reads', 'Reads', 'good'], ['subtle', 'Too subtle', 'mid'], ['unclear', 'Can’t tell', 'bad']] },
    { id: 'p4-status', q: 'Status on bodies instead of icons: burning bodies flicker with embers, wet ones are darker with water running off, frozen ones are rimed inside the ice', opts: [['clear', 'Clear', 'good'], ['subtle', 'Too subtle', 'mid'], ['icons', 'Prefer icons', 'bad']] },
    { id: 'p4-beam', q: 'Payload look: Red’s beam (arcane carrying fire) is now a fire beam: beam shape, fire colours, flame licks. The same rule colours Violet’s hammer (earth + arcane: pink glow), Gold’s glyph (sigil + earth: earth tones) and the turret (sigil + fire)', opts: [['right', 'Reads right', 'good'], ['mixed', 'Partly', 'mid'], ['wrong', 'Not right', 'bad']] },
    { id: 'p5-turret', q: 'New turret design (pass 4.1): a hovering fire crystal over a carved dais, three runic violet plates orbiting it and a ring of runes turning on the ground. It swells as each rune from Red lands, kicks when it fires, and sinks to a dull ember with drooping plates while Red is dry. Does it read as a magical device?', opts: [['reads', 'Reads as magic', 'good'], ['busy', 'Too busy or too small', 'mid'], ['no', 'Doesn’t read', 'bad']] },
    { id: 'p4-other', q: 'Anything else', opts: [['good', 'Good', 'good'], ['mixed', 'Mixed', 'mid'], ['bad', 'Not working', 'bad']] },
  ];
  const answers = Object.assign({}, ls.get('answers', {}));
  const qEl = document.getElementById('questions'), rows = {};
  for (const Q of QUESTIONS) {
    const box = document.createElement('div'); box.className = 'q';
    const h = document.createElement('h3'); h.id = 'q-' + Q.id; h.textContent = Q.q;
    const seg = document.createElement('div'); seg.className = 'seg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-labelledby', h.id);
    for (const [v, label, tone] of Q.opts) {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.v = v; b.dataset.tone = tone; b.textContent = label;
      b.addEventListener('click', () => setAnswer(Q.id, { mark: answers[Q.id]?.mark === v ? null : v }));
      seg.append(b);
    }
    const ta = document.createElement('textarea'); ta.rows = 1; ta.placeholder = 'Note (optional)'; ta.setAttribute('aria-label', 'Note: ' + Q.q);
    let timer = null;
    ta.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => setAnswer(Q.id, { note: ta.value }), 900); });
    ta.addEventListener('blur', () => { clearTimeout(timer); if ((answers[Q.id]?.note || '') !== ta.value) setAnswer(Q.id, { note: ta.value }); });
    box.append(h, seg, ta); qEl.append(box);
    rows[Q.id] = { seg, ta };
  }
  function paint() {
    let n = 0;
    for (const Q of QUESTIONS) {
      const a = answers[Q.id] || {}, r = rows[Q.id];
      if (a.mark || a.note) n++;
      for (const b of r.seg.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === a.mark));
      if (document.activeElement !== r.ta && r.ta.value !== (a.note || '')) r.ta.value = a.note || '';
    }
    document.getElementById('fbCount').textContent = `${n}/${QUESTIONS.length}`;
  }
  const saveEl = document.getElementById('saveState');
  const saveState = (txt, warn) => { saveEl.textContent = txt; saveEl.classList.toggle('warn', !!warn); };
  let db = null;
  const chains = {};
  function setAnswer(id, patch) {
    answers[id] = Object.assign({ mark: null, note: '' }, answers[id], patch);
    ls.set('answers', answers); paint();
    if (!db) return;
    const body = { mark: answers[id].mark, note: answers[id].note, updatedAt: new Date().toISOString() };
    if (id === 'p4-perspective') body.scale = scale;
    saveState('Saving…');
    chains[id] = (chains[id] || Promise.resolve()).then(() => db.doc('answers/' + id).set(body))
      .then(() => saveState('All answers saved'))
      .catch((e) => saveState(e?.code === 'invalid_argument' ? 'You can view answers but not change them' : 'Couldn’t save. Your answer is kept in this browser.', true));
  }
  (async () => {
    const loadTimer = setTimeout(() => saveState('Can’t reach saved answers yet. Answers stay in this browser for now.', true), 10000);
    try { db = await window.claude?.use?.('db'); } catch { db = null; }
    if (!db) { clearTimeout(loadTimer); saveState('Answers are saved in this browser only'); return; }
    db.collection('answers').onSnapshot((snap) => {
      for (const d of snap.docs) { const v = d.data(); answers[d.id] = { mark: v.mark || null, note: v.note || '' }; }
      if (!snap.metadata.fromCache) { clearTimeout(loadTimer); if (!snap.metadata.hasPendingWrites) saveState('All answers saved'); }
      ls.set('answers', answers); paint();
    }, () => { clearTimeout(loadTimer); saveState('Saved answers are unavailable. Answers stay in this browser.', true); db = null; });
  })();
  paint();
  const panel = document.getElementById('panel'), tog = document.getElementById('fbToggle');
  const setPanel = (open) => { panel.hidden = !open; tog.setAttribute('aria-expanded', String(open)); ls.set('panel', open); };
  tog.addEventListener('click', () => setPanel(panel.hidden));
  setPanel(qs.has('panel') ? qs.get('panel') === '1' : ls.get('panel', false));

  resize();
  if (qs.has('skip')) PB.skip = Object.fromEntries(qs.get('skip').split(',').map((k) => [k, 1]));
  if (qs.has('bench')) {
    // ?bench=1: render 40 frames synchronously and report the mean (debug only)
    const tb = performance.now(); PB.world.build(); const tw = performance.now() - tb;
    PB.prof = {}; const t0 = performance.now(); for (let i = 0; i < 40; i++) PB.render(PB.scene(i * 0.3, chaos), LW, LH);
    document.body.dataset.bench = `${LW}x${LH} ${((performance.now() - t0) / 40).toFixed(1)}ms world ${tw.toFixed(0)}ms walls ${(PB.warmMs || 0).toFixed(0)}ms/${PB.walls.count()} ` + Object.entries(PB.prof).filter(([k]) => k[0] !== "_").map(([k, v]) => k + "=" + (v / 40).toFixed(1)).join(" "); PB.prof = null;
  }
  offset = now() - pausedAt;
  requestAnimationFrame(loop);
  document.fonts?.ready.then(() => draw(true));
})();
