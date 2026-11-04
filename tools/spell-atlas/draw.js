/* Tiny top-down diagrams for any proposal C spell. drawSpell(ctx, w, h, t, spell, queue)
 * draws one looping frame. The caster is on the left, an ally above, enemies on the right.
 * Shapes come from the cast and form; payload elements show up as coloured particles. */
(function () {
  const C = window.SpellTreeC;
  const TAU = Math.PI * 2;
  const LOOP = 2.6;
  const col = (e) => C.ELEMENTS[e].color;
  const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
  const clamp01 = (k) => Math.min(1, Math.max(0, k));

  function drawSpell(g, w, h, t, s, queue) {
    const p = (t % LOOP) / LOOP;
    const S = Math.min(w / 220, h / 130); // scale everything from a 220×130 layout
    const P = (x, y) => [x * w, y * h];
    const me = P(0.18, 0.62), ally = P(0.3, 0.2), foes = [P(0.74, 0.42), P(0.84, 0.72), P(0.62, 0.78)], cur = P(0.72, 0.52);
    const main = s.form ? col(s.form) : (queue[0] ? col(queue[0]) : '#888');
    const pay = s.payload.map((x) => col(x.el));
    const accents = pay.length ? pay : [main];
    const earthy = s.payload.some((x) => x.el === 'earth');

    g.clearRect(0, 0, w, h);
    // ground
    g.fillStyle = '#1b1733'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(190,175,255,.05)'; g.lineWidth = 1;
    for (let x = 0; x < w; x += 18 * S) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }

    const dot = (x, y, r, c, a = 1) => { g.globalAlpha = a; g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.globalAlpha = 1; };
    const ring = (x, y, r, c, lw, a = 1) => { g.globalAlpha = a; g.strokeStyle = c; g.lineWidth = lw; g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU); g.stroke(); g.globalAlpha = 1; };
    const sparks = (x, y, k, r, n = 7) => { for (let i = 0; i < n; i++) { const a = rnd(i) * TAU, d = r * (0.3 + 0.7 * k) * (0.5 + rnd(i + 9) / 2); dot(x + Math.cos(a) * d, y + Math.sin(a) * d, 2.2 * S * (1 - k * 0.6), accents[i % accents.length], 1 - k * 0.7); } };
    const glow = (c, b) => { g.shadowColor = c; g.shadowBlur = b * S; };
    const noGlow = () => { g.shadowBlur = 0; };
    const foe = (x, y) => { dot(x, y, 7 * S, '#e2566b'); dot(x - 2 * S, y - 2 * S, 2 * S, '#ffd1d8'); };
    const zigzag = (a, b, seed, amp) => { g.beginPath(); g.moveTo(a[0], a[1]); for (let i = 1; i < 7; i++) { const k = i / 7; g.lineTo(lerp(a[0], b[0], k) + (rnd(i + seed + Math.floor(t * 14)) - 0.5) * amp, lerp(a[1], b[1], k) + (rnd(i * 3 + seed + Math.floor(t * 14)) - 0.5) * amp); } g.lineTo(b[0], b[1]); g.stroke(); };
    // a stone block centred at (x, y), long side across angle a
    const block = (x, y, a, len, hh, c) => { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = c; g.fillRect(-hh / 2, -len / 2, hh, len); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(-hh / 2, -len / 2, 2 * S, len); g.restore(); };

    // bodies (spells that move or add a body draw their own)
    const pulled = s.id === 'sigil/conjure' && s.sub === 'arcane';
    const shoved = s.id === 'shield/force';
    const foe0 = pulled ? [lerp(foes[0][0], me[0] + 40 * S, ease((p - 0.55) / 0.3)), lerp(foes[0][1], me[1], ease((p - 0.55) / 0.3))] : foes[0];
    for (const f of [shoved ? null : foe0, foes[1], foes[2]]) if (f) foe(f[0], f[1]);
    dot(ally[0], ally[1], 7 * S, '#5fe07a', 0.9); ring(ally[0], ally[1], 9.5 * S, '#5fe07a', 1.2 * S, 0.5);
    // staff toward the aim
    const aim = Math.atan2(cur[1] - me[1], cur[0] - me[0]);
    const blinkTo = [me[0] + Math.cos(aim) * 62 * S, me[1] + Math.sin(aim) * 62 * S];
    const blink = s.id === 'sigil/force' && !s.sub && p > 0.4 && p < 0.92; // Blink: you are further along your aim now
    const body = blink ? blinkTo : me;
    dot(body[0], body[1], 8 * S, '#a98bff'); ring(body[0], body[1], 10.5 * S, '#f1ecff', 1.2 * S, 0.4);
    const along = (d, side = 0) => [me[0] + Math.cos(aim) * d - Math.sin(aim) * side, me[1] + Math.sin(aim) * d + Math.cos(aim) * side];
    if (!blink) { g.strokeStyle = '#d9c9a0'; g.lineWidth = 2 * S; g.beginPath(); g.moveTo(me[0], me[1]); g.lineTo(me[0] + Math.cos(aim) * 15 * S, me[1] + Math.sin(aim) * 15 * S); g.stroke(); }
    const tip = [me[0] + Math.cos(aim) * 16 * S, me[1] + Math.sin(aim) * 16 * S];

    if (s.id === 'none') return;

    switch (s.cast) {
      case 'force': return force();
      case 'area': return area();
      case 'place': return place();
      case 'self': return self();
      case 'conjure': return conjure();
    }

    function force() {
      const f = s.form;
      if (f === 'shield') return shovingWall();
      if (f === 'sigil') return s.sub ? turret() : blinkFx();
      if (f === 'earth') {
        const charge = Math.min(1, p / 0.4), fly = ease((p - 0.4) / 0.3);
        if (p < 0.4) { dot(tip[0], tip[1], (3 + 5 * charge) * S, col('earth')); ring(tip[0], tip[1], 10 * charge * S, '#fff', 1 * S, 0.4); return; }
        const x = lerp(tip[0], foes[0][0], fly), y = lerp(tip[1], foes[0][1], fly);
        if (p < 0.7) { dot(x, y, 8 * S, col('earth')); for (const [i, c] of pay.entries()) dot(x - (6 + i * 5) * S, y + (i - 1) * 3 * S, 3 * S, c, 0.8); }
        else sparks(foes[0][0], foes[0][1], (p - 0.7) / 0.3, 30 * S, 10);
        return;
      }
      if (f === 'arcane' || f === 'life') return beam(tip, foes[0], main);
      if (f === 'lightning') {
        const hops = [tip, foes[0], foes[1], foes[2]].slice(0, 2 + Math.min(2, s.payload.length));
        glow(main, 12); g.strokeStyle = main; g.lineWidth = 2.2 * S;
        for (let j = 0; j < hops.length - 1; j++) zigzag(hops[j], hops[j + 1], j * 7, 14 * S);
        noGlow(); if (pay.length) sparks(foes[0][0], foes[0][1], (p * 3) % 1, 14 * S, 5);
        return;
      }
      spray(tip, aim, 120 * S, main);
    }

    function beam(a, b, c) {
      const wob = 1 + 0.25 * Math.sin(t * 22);
      glow(c, 14); g.strokeStyle = c; g.lineWidth = 5 * S * wob; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); noGlow();
      for (let i = 0; i < pay.length * 3; i++) { const k = ((p * 3 + i / (pay.length * 3)) % 1); dot(lerp(a[0], b[0], k), lerp(a[1], b[1], k) + Math.sin(i + t * 9) * 3 * S, 2.4 * S, pay[i % pay.length]); }
      sparks(b[0], b[1], (p * 4) % 1, 14 * S, 5);
    }
    function spray(from, ang, reach, c) {
      const mist = s.mix && s.mix.some((m) => m.trait === 'Scald');
      for (let i = 0; i < 26; i++) {
        const k = ((p * 2.2 + rnd(i)) % 1), a = ang + (rnd(i + 3) - 0.5) * 0.7 * k * 1.4, d = k * reach;
        dot(from[0] + Math.cos(a) * d, from[1] + Math.sin(a) * d, (2 + 4 * k) * S, i % 3 === 0 && pay.length ? pay[i % pay.length] : c, 0.85 - 0.6 * k);
      }
      if (mist) for (let i = 0; i < 8; i++) { const a = ang + (rnd(i + 40) - 0.5) * 0.9, d = reach * (0.55 + 0.4 * rnd(i + 41)); dot(from[0] + Math.cos(a) * d, from[1] + Math.sin(a) * d, (9 + 4 * Math.sin(t * 2 + i)) * S, '#e4e9f2', 0.13); }
    }

    // Shield + Force: a wave rises in front of you, sweeps forward carrying a body, then breaks.
    function shovingWall() {
      const rise = ease(p / 0.12), sweep = ease((p - 0.12) / 0.55), d = lerp(26, 120, sweep) * S;
      const half = 28 * S, fade = 1 - clamp01((p - 0.67) / 0.2);
      const fd = Math.max(72 * S, d + 10 * S); // the enemy in its path is carried along by the wave
      const fp = along(fd, -4 * S); foe(fp[0], fp[1]);
      if (p > 0.2 && p < 0.75) for (let i = 0; i < 7; i++) { const q = along(d - (6 + i * 5) * S, (rnd(i + Math.floor(t * 10)) - 0.5) * 2 * half); dot(q[0], q[1], 1.8 * S, accents[i % accents.length], 0.55); }
      if (fade > 0) { g.globalAlpha = fade; wallAcross(along(d), half, rise); g.globalAlpha = 1; }
      if (p > 0.67) sparks(fp[0], fp[1], (p - 0.67) / 0.33, 18 * S, 6);
    }
    function wallAcross(c, half, k) {
      const a = aim + Math.PI / 2;
      const A = [c[0] + Math.cos(a) * half, c[1] + Math.sin(a) * half], B = [c[0] - Math.cos(a) * half, c[1] - Math.sin(a) * half];
      if (earthy) { for (let i = 0; i < 4; i++) { const q = (i + 0.5) / 4; block(lerp(A[0], B[0], q), lerp(A[1], B[1], q), aim, 10 * S, 9 * S * k, col('earth')); } }
      else { glow(main, 10); g.strokeStyle = s.payload.length ? accents[Math.floor(p * 6) % accents.length] : main; g.lineWidth = 4.5 * S; g.globalAlpha = 0.9 * k; g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke(); g.globalAlpha = 1; noGlow(); }
      for (let i = 0; i < pay.length * 3; i++) { const q = rnd(i + Math.floor(t * 4)); dot(lerp(A[0], B[0], q), lerp(A[1], B[1], q), 2 * S, pay[i % pay.length], 0.9 * k); }
    }

    // Sigil alone + Force: Blink. You vanish and reappear a short way along your aim.
    function blinkFx() {
      const sc = col('sigil');
      if (p < 0.4) { const k = p / 0.4; ring(me[0], me[1], (16 - 8 * k) * S, sc, 2 * S, k); return; }
      const k = clamp01((p - 0.4) / 0.3);
      ring(me[0], me[1], (8 + 16 * ease(k)) * S, sc, 2 * S, 1 - k);
      for (let i = 0; i < 9; i++) { const q = clamp01(k * 1.6 - i * 0.06); dot(lerp(me[0], blinkTo[0], q), lerp(me[1], blinkTo[1], q) - Math.sin(q * Math.PI) * 6 * S, 1.6 * S, i % 2 ? sc : '#f1ecff', 1 - k); }
      glow(sc, 14); ring(blinkTo[0], blinkTo[1], (8 + 14 * ease(k)) * S, '#f1ecff', 2 * S, 1 - k); noGlow();
    }
    // Sigil alone + Place: a lens at the cursor. A small bolt goes in, a big one comes out.
    function lens() {
      const at = cur, sc = col('sigil');
      g.save(); g.translate(at[0], at[1]); g.rotate(aim); glow(sc, 12);
      g.fillStyle = sc; g.globalAlpha = 0.16; g.beginPath(); g.ellipse(0, 0, 4.5 * S, 16 * S, 0, 0, TAU); g.fill();
      g.strokeStyle = sc; g.lineWidth = 2.2 * S; g.globalAlpha = 0.9; g.stroke();
      g.globalAlpha = 0.5; g.lineWidth = 1 * S; g.beginPath(); g.ellipse(0, 0, 2 * S, 11 * S, 0, 0, TAU); g.stroke();
      g.restore(); g.globalAlpha = 1; noGlow();
      const q = (p * 1.25) % 1, hit = foes[0];
      if (q < 0.35) { const k = q / 0.35; dot(lerp(tip[0], at[0], k), lerp(tip[1], at[1], k), 2.4 * S, '#f1ecff'); return; }
      if (q < 0.8) {
        const k = (q - 0.35) / 0.45, x = lerp(at[0], hit[0], k), y = lerp(at[1], hit[1], k);
        glow(sc, 14); dot(x, y, (3 + 4 * Math.min(1, k * 4)) * S, '#f1ecff'); noGlow(); ring(x, y, 9 * S, sc, 1.4 * S, 0.7);
        if (k < 0.25) ring(at[0], at[1], (10 + 30 * k) * S, sc, 1.5 * S, 1 - k * 4);
        return;
      }
      sparks(hit[0], hit[1], (q - 0.8) / 0.2, 30 * S, 12);
    }

    // Sigil + Force: a turret ahead of you that keeps casting the Force spell of the other elements.
    function turret() {
      const at = along(46 * S, -18 * S), sub = s.sub, sc = sub ? col(sub) : col('sigil');
      const head = [at[0], at[1] - 6 * S];
      g.fillStyle = '#3a3550'; g.fillRect(at[0] - 6 * S, at[1] - 2 * S, 12 * S, 12 * S);
      g.fillStyle = col('sigil'); g.globalAlpha = 0.8; g.fillRect(at[0] - 6 * S, at[1] - 2 * S, 12 * S, 2.5 * S); g.globalAlpha = 1;
      ring(at[0], at[1] + 10 * S, 9 * S, col('sigil'), 1 * S, 0.35);
      glow(sc, 10); dot(head[0], head[1], 5 * S + Math.sin(t * 6) * 0.8 * S, sc); noGlow();
      if (sub === 'arcane') return beam(head, foes[0], sc);
      if (sub === 'life') return beam(head, ally, sc);
      if (sub === 'lightning') { glow(sc, 12); g.strokeStyle = sc; g.lineWidth = 2 * S; zigzag(head, foes[0], 3, 12 * S); if (pay.length > 1) zigzag(foes[0], foes[1], 9, 12 * S); noGlow(); return; }
      if (['water', 'fire', 'cold'].includes(sub)) return spray(head, Math.atan2(foes[0][1] - head[1], foes[0][0] - head[0]), 95 * S, sc);
      // bolts (sparks, or rocks with Earth), one every half loop
      for (const [j, target] of [[0, foes[0]], [1, foes[1]]]) {
        const q = (p * 2 - j * 0.5 + 2) % 1, x = lerp(head[0], target[0], ease(q)), y = lerp(head[1], target[1], ease(q));
        if (q < 0.8) { dot(x, y, (sub === 'earth' ? 5 : 3) * S, sc); for (const [i, c] of pay.entries()) dot(x - (5 + i * 4) * S, y - (2 + i) * S, 2 * S, c, 0.85); }
        else sparks(target[0], target[1], (q - 0.8) / 0.2, 16 * S, 6);
      }
    }

    function area() {
      const f = s.form;
      if (f === 'shield') {
        // one continuous ring, closing as it rises
        const k = ease(p / 0.3);
        if (earthy) { for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; block(me[0] + Math.cos(a) * 34 * S, me[1] + Math.sin(a) * 34 * S, a, 13.5 * S, 8 * S * k, col('earth')); } }
        else { glow(main, 10); ring(me[0], me[1], 34 * S, main, 4 * S, 0.9 * k); noGlow(); }
        for (let i = 0; i < pay.length * 5; i++) { const a = (i / (pay.length * 5)) * TAU + t * 0.6; dot(me[0] + Math.cos(a) * 34 * S, me[1] + Math.sin(a) * 34 * S, 2 * S, pay[i % pay.length], 0.9); }
        return;
      }
      if (f === 'sigil') return s.sub ? orbitals() : motes();
      const k = ease((p % 0.6) / 0.6), r = k * 70 * S;
      if (f === 'earth') { for (let j = 0; j < 3; j++) ring(me[0], me[1], r - j * 9 * S, col('earth'), 4 * S, (1 - k) * (1 - j * 0.25)); }
      else if (f === 'lightning') { glow(main, 10); g.strokeStyle = main; g.lineWidth = 2 * S; for (const fo of [ally, ...foes]) { if (Math.hypot(fo[0] - me[0], fo[1] - me[1]) > 110 * S) continue; zigzag(me, fo, 5, 12 * S); } noGlow(); }
      else ring(me[0], me[1], r, main, 7 * S * (1 - k) + 1, 0.9 - 0.6 * k);
      for (let i = 0; i < pay.length * 6; i++) { const a = (i / (pay.length * 6)) * TAU + 0.3; dot(me[0] + Math.cos(a) * r * 0.9, me[1] + Math.sin(a) * r * 0.9, 2.2 * S, pay[i % pay.length], 1 - k); }
    }

    // Sigil + Area: orbs circle you; one peels off to strike the enemy that came close.
    function orbitals() {
      const n = Math.max(3, queue.length), els = s.payload.length ? s.payload.map((x) => x.el) : ['sigil'];
      const target = s.sub === 'life' ? ally : foes[2], fly = ease((p - 0.45) / 0.25);
      ring(me[0], me[1], 24 * S, col('sigil'), 1 * S, 0.25);
      for (let i = 0; i < n; i++) {
        const a = t * 2 + (i / n) * TAU; let x = me[0] + Math.cos(a) * 24 * S, y = me[1] + Math.sin(a) * 24 * S;
        const c = col(els[i % els.length]);
        if (i === 0 && p > 0.45) { if (p > 0.7) { sparks(target[0], target[1], (p - 0.7) / 0.3, 20 * S, 8); continue; } x = lerp(x, target[0], fly); y = lerp(y, target[1], fly); }
        glow(c, 8); dot(x, y, 4 * S, c); noGlow(); ring(x, y, 5.5 * S, col('sigil'), 0.8 * S, 0.7);
      }
    }

    // Sigil alone + Area: rune motes. You cast; one mote flies into you and part of a rune comes back.
    function motes() {
      const sc = col('sigil');
      ring(me[0], me[1], 24 * S, sc, 1 * S, 0.25);
      if (p > 0.25 && p < 0.6) { const k = (p - 0.25) / 0.35; dot(lerp(tip[0], foes[0][0], k), lerp(tip[1], foes[0][1], k), 2.6 * S, '#f1ecff'); }
      else if (p >= 0.6 && p < 0.8) sparks(foes[0][0], foes[0][1], (p - 0.6) / 0.2, 14 * S, 5);
      for (let i = 0; i < 3; i++) {
        const a = t * 1.6 + (i / 3) * TAU; let x = me[0] + Math.cos(a) * 24 * S, y = me[1] + Math.sin(a) * 24 * S;
        if (i === 0 && p > 0.3) { if (p > 0.5) continue; const k = ease((p - 0.3) / 0.2); x = lerp(x, me[0], k); y = lerp(y, me[1], k); }
        glow(sc, 8); dot(x, y, 3.6 * S, sc); noGlow(); ring(x, y, 5.5 * S, '#f1ecff', 0.8 * S, 0.5);
      }
      // a rune pip by you fills part-way: part of one rune comes back, never a whole one
      const pip = [me[0] + 16 * S, me[1] - 17 * S], fill = clamp01((p - 0.5) / 0.15) * (1 - clamp01((p - 0.9) / 0.1));
      ring(pip[0], pip[1], 5 * S, '#f1ecff', 1 * S, 0.6);
      if (fill > 0) { glow(sc, 10); g.fillStyle = sc; g.beginPath(); g.moveTo(pip[0], pip[1]); g.arc(pip[0], pip[1], 4 * S, -Math.PI / 2, -Math.PI / 2 + TAU * 0.4 * fill); g.closePath(); g.fill(); noGlow(); }
    }

    function place() {
      const f = s.form;
      if (f === 'shield') return s.drag ? drawnWall() : arcWall();
      if (f === 'sigil') return !s.sub ? lens() : s.drag ? lineGlyph() : glyph();
      const tele = Math.min(1, p / 0.35);
      // reticle while held
      if (p < 0.35) { ring(cur[0], cur[1], 22 * S, '#f1ecff', 1.2 * S, 0.6); g.setLineDash([3 * S, 3 * S]); g.strokeStyle = 'rgba(241,236,255,.35)'; g.lineWidth = 1 * S; g.beginPath(); g.moveTo(tip[0], tip[1]); g.lineTo(cur[0], cur[1]); g.stroke(); g.setLineDash([]); ring(cur[0], cur[1], 22 * S * tele, main, 2 * S, 0.7); return; }
      const k = (p - 0.35) / 0.65;
      if (f === 'lightning') {
        if (k < 0.3) { glow(main, 16); g.strokeStyle = main; g.lineWidth = 3 * S; g.beginPath(); g.moveTo(cur[0] + 10 * S, 0); for (let i = 1; i < 6; i++) g.lineTo(cur[0] + (rnd(i + Math.floor(t * 20)) - 0.5) * 16 * S, cur[1] * i / 6); g.lineTo(cur[0], cur[1]); g.stroke(); noGlow(); }
        sparks(cur[0], cur[1], k, 30 * S, 10); return;
      }
      if (['water', 'fire', 'cold', 'life'].includes(f)) {
        const frozen = s.mix && s.mix.some((m) => m.trait === 'Freeze'), mist = s.mix && s.mix.some((m) => m.trait === 'Scald');
        g.globalAlpha = 0.45 * (1 - Math.max(0, k - 0.8) * 5); g.fillStyle = frozen ? '#cdf3ff' : main;
        g.beginPath(); g.ellipse(cur[0], cur[1], 30 * S * ease(k * 3), 18 * S * ease(k * 3), 0, 0, TAU); g.fill(); g.globalAlpha = 1;
        if (frozen) { g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 1 * S; for (let i = 0; i < 5; i++) { const a = rnd(i + 20) * TAU; g.beginPath(); g.moveTo(cur[0], cur[1]); g.lineTo(cur[0] + Math.cos(a) * 26 * S * ease(k * 3), cur[1] + Math.sin(a) * 15 * S * ease(k * 3)); g.stroke(); } }
        for (let i = 0; i < 6 + pay.length * 3; i++) { const a = rnd(i) * TAU, d = rnd(i + 4) * 24 * S; dot(cur[0] + Math.cos(a) * d, cur[1] + Math.sin(a) * d * 0.6 - ((t * 20 + i * 7) % 12) * S, 1.8 * S, i < 6 ? '#fff' : pay[i % pay.length], 0.5); }
        if (mist) for (let i = 0; i < 6; i++) dot(cur[0] + (rnd(i + 50) - 0.5) * 50 * S, cur[1] - 6 * S + (rnd(i + 51) - 0.5) * 26 * S, 12 * S, '#e4e9f2', 0.16 * ease(k * 3));
        return;
      }
      // eruption: earth, arcane
      const kk = ease(k / 0.4);
      if (k < 0.4) { for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; g.strokeStyle = main; g.lineWidth = 6 * S; g.beginPath(); g.moveTo(cur[0], cur[1]); g.lineTo(cur[0] + Math.cos(a) * 26 * S * kk, cur[1] + Math.sin(a) * 26 * S * kk - (f === 'earth' ? 10 * S * kk : 0)); g.stroke(); } }
      ring(cur[0], cur[1], 30 * S * kk, main, 3 * S, 1 - k);
      sparks(cur[0], cur[1], k, 40 * S, 12);
    }

    // Shield + Place with no drag: an arc of wall around you, facing the cursor. The quick wall.
    function arcWall() {
      const R = 30 * S, span = 0.95;
      if (p < 0.15) { ring(cur[0], cur[1], 8 * S * (1 - p / 0.15) + 2 * S, '#f1ecff', 1.2 * S, 0.7); return; }
      const k = ease((p - 0.15) / 0.2);
      if (earthy) { for (let i = 0; i < 6; i++) { const a = aim - span + (i + 0.5) * (2 * span / 6); block(me[0] + Math.cos(a) * R, me[1] + Math.sin(a) * R, a, 10.5 * S, 8 * S * k, col('earth')); } }
      else { glow(main, 10); g.strokeStyle = s.payload.length ? accents[Math.floor(p * 6) % accents.length] : main; g.lineWidth = 4.5 * S; g.globalAlpha = 0.9 * k; g.beginPath(); g.arc(me[0], me[1], R, aim - span, aim + span); g.stroke(); g.globalAlpha = 1; noGlow(); }
      for (let i = 0; i < pay.length * 4; i++) { const a = aim - span + 2 * span * rnd(i + Math.floor(t * 4)); dot(me[0] + Math.cos(a) * (R + 4 * S), me[1] + Math.sin(a) * (R + 4 * S), 2 * S, pay[i % pay.length], 0.9 * k); }
      // an enemy shot stops at the arc
      const q = (p * 2) % 1, stop = Math.hypot(foes[0][0] - me[0], foes[0][1] - me[1]) - R - 4 * S;
      const a0 = Math.atan2(foes[0][1] - me[1], foes[0][0] - me[0]);
      const d = Math.hypot(foes[0][0] - me[0], foes[0][1] - me[1]) - stop * ease(q);
      dot(me[0] + Math.cos(a0) * d, me[1] + Math.sin(a0) * d, 2.4 * S, '#ffd1d8', q > 0.9 ? (1 - q) * 10 : 1);
    }

    // Shield + Place, dragged: press at A, drag a gentle curve to B, let go; the wall rises along it.
    function drawnWall() {
      const A = P(0.52, 0.2), B = P(0.58, 0.88), M = P(0.66, 0.52);
      const at = (q) => [(1 - q) * (1 - q) * A[0] + 2 * (1 - q) * q * M[0] + q * q * B[0], (1 - q) * (1 - q) * A[1] + 2 * (1 - q) * q * M[1] + q * q * B[1]];
      const drag = ease(p / 0.4);
      if (p < 0.4) {
        ring(A[0], A[1], 5 * S, '#f1ecff', 1.4 * S, 0.8);
        g.setLineDash([4 * S, 3 * S]); g.strokeStyle = 'rgba(241,236,255,.7)'; g.lineWidth = 1.4 * S;
        g.beginPath(); g.moveTo(A[0], A[1]); for (let i = 1; i <= 20; i++) { const q = at(drag * i / 20); g.lineTo(q[0], q[1]); } g.stroke(); g.setLineDash([]);
        const e = at(drag); dot(e[0], e[1], 3 * S, '#f1ecff');
        return;
      }
      const k = ease((p - 0.4) / 0.2), n = 8;
      if (earthy) {
        for (let i = 0; i < n; i++) { const q = (i + 0.5) / n, c = at(q), c2 = at(Math.min(1, q + 0.01)); block(c[0], c[1], Math.atan2(c2[1] - c[1], c2[0] - c[0]) - Math.PI / 2, 10.5 * S, 10 * S * k, col('earth')); }
      } else {
        glow(main, 12); g.strokeStyle = main; g.lineWidth = 5 * S; g.globalAlpha = 0.85 * k;
        g.beginPath(); g.moveTo(A[0], A[1]); g.quadraticCurveTo(M[0], M[1], B[0], B[1]); g.stroke(); g.globalAlpha = 1; noGlow();
      }
      for (let i = 0; i < pay.length * 4; i++) { const c = at(rnd(i + Math.floor(t * 4))); dot(c[0] + 4 * S, c[1], 2 * S, pay[i % pay.length], 0.9); }
      // a shot from the enemies stops at the wall
      const stopAt = at(0.4), q = (p * 2) % 1;
      dot(lerp(foes[0][0], stopAt[0] + 7 * S, q), lerp(foes[0][1], stopAt[1], q), 2.4 * S, '#ffd1d8');
    }

    // a glyph: a ring with a turning triangle inside, dim until armed
    function rune(x, y, r, armed) {
      const c = col('sigil');
      ring(x, y, r, c, 1.6 * S, 0.35 + 0.55 * armed);
      g.save(); g.translate(x, y); g.rotate(t * 0.8); g.globalAlpha = 0.3 + 0.6 * armed; g.strokeStyle = c; g.lineWidth = 1.2 * S;
      g.beginPath(); for (let i = 0; i <= 3; i++) { const a = (i / 3) * TAU - Math.PI / 2; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7); } g.stroke(); g.restore(); g.globalAlpha = 1;
      const els = s.payload.map((x) => x.el);
      for (let j = 0; j < els.length; j++) { const a = -t + j * (TAU / els.length); dot(x + Math.cos(a) * r, y + Math.sin(a) * r, 1.8 * S, col(els[j]), 0.5 + 0.5 * armed); }
    }
    // Sigil + Place: a trap at the cursor. An enemy walks onto it and it goes off.
    function glyph() {
      const armed = clamp01((p - 0.2) / 0.2), walk = ease((p - 0.35) / 0.35), boom = (p - 0.7) / 0.3;
      if (p < 0.7) { rune(cur[0], cur[1], 11 * S, armed); const f = [lerp(foes[1][0] + 30 * S, cur[0] + 3 * S, walk), lerp(foes[1][1], cur[1], walk)]; foe(f[0], f[1]); return; }
      const c = s.sub ? col(s.sub) : col('sigil');
      ring(cur[0], cur[1], 32 * S * ease(boom), c, 4 * S, 1 - boom);
      if (s.sub === 'earth') for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU, kk = ease(boom / 0.4); g.strokeStyle = c; g.lineWidth = 5 * S; g.globalAlpha = 1 - boom; g.beginPath(); g.moveTo(cur[0], cur[1]); g.lineTo(cur[0] + Math.cos(a) * 22 * S * kk, cur[1] + Math.sin(a) * 22 * S * kk - 8 * S * kk); g.stroke(); g.globalAlpha = 1; }
      sparks(cur[0], cur[1], boom, 36 * S, 12);
    }
    // Sigil + Place, dragged: a line glyph. Whatever crosses it sets off the whole line.
    function lineGlyph() {
      const A = P(0.5, 0.18), B = P(0.56, 0.9), drag = ease(p / 0.3);
      const E = [lerp(A[0], B[0], drag), lerp(A[1], B[1], drag)];
      const cross = ease((p - 0.35) / 0.3), fire = p > 0.65 ? (p - 0.65) / 0.35 : 0;
      const c = s.sub ? col(s.sub) : col('sigil');
      g.setLineDash([5 * S, 3 * S]); g.strokeStyle = col('sigil'); g.lineWidth = 1.8 * S; g.globalAlpha = 0.85;
      g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(E[0], E[1]); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
      for (let i = 0; i < 6; i++) { const q = (i + 0.5) / 6; if (q > drag) break; ring(lerp(A[0], B[0], q), lerp(A[1], B[1], q), 2.6 * S, col('sigil'), 1 * S, 0.8); }
      if (p < 0.3) { dot(E[0], E[1], 3 * S, '#f1ecff'); return; }
      const fy = lerp(A[1], B[1], 0.6), fx = lerp(foes[0][0] + 10 * S, lerp(A[0], B[0], 0.6) - 4 * S, cross);
      if (!fire) { foe(fx, fy); return; }
      glow(c, 14); g.strokeStyle = c; g.lineWidth = 5 * S * (1 - fire) + 1; g.globalAlpha = 1 - fire;
      if (s.sub === 'lightning') zigzag(A, B, 2, 10 * S); else { g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke(); }
      g.globalAlpha = 1; noGlow();
      for (let i = 0; i < 5; i++) { const q = (i + 0.5) / 5; sparks(lerp(A[0], B[0], q), lerp(A[1], B[1], q), fire, 14 * S, 4); }
    }

    function self() {
      const target = s.onAlly ? ally : me;
      if (s.onAlly) {
        const k = Math.min(1, p / 0.3);
        if (p < 0.3) { dot(lerp(tip[0], ally[0], ease(k)), lerp(tip[1], ally[1], ease(k)) - Math.sin(k * Math.PI) * 14 * S, 4 * S, main); return; }
      }
      if (s.form === 'shield') {
        const els = s.payload.map((x) => x.el);
        if (els.includes('earth')) return stoneArmour(target, els.filter((e) => e !== 'earth'));
        g.globalAlpha = 0.22; g.fillStyle = col('shield'); g.beginPath(); g.arc(target[0], target[1], 16 * S, 0, TAU); g.fill(); g.globalAlpha = 1; ring(target[0], target[1], 16 * S, col('shield'), 2 * S, 0.9);
        for (const [i, c] of pay.entries()) { const r = (20 + i * 4) * S; ring(target[0], target[1], r, c, 1.6 * S, 0.55); }
        return;
      }
      if (s.form === 'sigil') {
        if (!s.payload.length) return double(target);
        // a turning rune ring marks the aura; each element draws its own effect around you
        g.save(); g.translate(target[0], target[1]); g.rotate(t * 1.5); g.setLineDash([4 * S, 3 * S]); g.strokeStyle = col('sigil'); g.lineWidth = 1.8 * S; g.globalAlpha = 0.9;
        g.beginPath(); g.arc(0, 0, 13 * S, 0, TAU); g.stroke(); g.setLineDash([]); g.restore(); g.globalAlpha = 1;
        const els = s.payload.map((x) => x.el);
        if (els.includes('earth')) return bulldoze(target, els.filter((e) => e !== 'earth'));
        return auras(target, els);
      }
      // no Shield or Sigil: the elements land on the target
      const els = s.payload.map((x) => x.el);
      for (let i = 0; i < 14; i++) { const k = (p * 1.6 + rnd(i)) % 1, a = rnd(i + 3) * TAU, d = (1 - ease(k)) * 26 * S; dot(target[0] + Math.cos(a) * d, target[1] + Math.sin(a) * d, 2.4 * S, col(els[i % els.length]), 0.4 + 0.6 * k); }
      ring(target[0], target[1], 12 * S + 3 * S * Math.sin(t * 6), main, 2 * S, 0.6);
    }

    // Shield + Earth on yourself: stone armour; other elements coat it and hit whoever strikes you in melee.
    function stoneArmour(target, coats) {
      for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU + 0.2; block(target[0] + Math.cos(a) * 15 * S, target[1] + Math.sin(a) * 15 * S, a, 9 * S, 6 * S, col('earth')); }
      for (const [i, e] of coats.entries()) for (let j = 0; j < 8; j++) {
        const a = (j / 8) * TAU + t * (1 + i * 0.4) + i, r = (20 + i * 3) * S;
        dot(target[0] + Math.cos(a) * r, target[1] + Math.sin(a) * r - (e === 'fire' ? ((t * 18 + j * 5) % 7) * S : 0), 2.2 * S, col(e), 0.8);
      }
      // a melee attacker steps in, hits the stone and gets the coating
      const q = (p * 1.2) % 1, d = q < 0.45 ? lerp(52, 25, ease(q / 0.45)) : lerp(25, 44, ease((q - 0.45) / 0.4));
      const f = [target[0] + d * S, target[1] + 4 * S]; foe(f[0], f[1]);
      if (q > 0.45 && q < 0.85) {
        const k = (q - 0.45) / 0.4, cs = coats.length ? coats.map(col) : ['#ffd1d8'];
        for (let i = 0; i < 8; i++) { const a = rnd(i) * TAU, r = (4 + 10 * k) * S; dot(f[0] + Math.cos(a) * r, f[1] + Math.sin(a) * r, 2 * S, cs[i % cs.length], 1 - k); }
      }
    }

    // Sigil alone on yourself: a Double. A see-through copy appears beside you and both cast, a crossfire.
    function double(target) {
      const sc = col('sigil'), tw = [target[0] + 22 * S, target[1] + 24 * S], form = clamp01(p / 0.25);
      dot(tw[0], tw[1], 8 * S, '#a98bff', 0.4 * form);
      g.setLineDash([3 * S, 2 * S]); ring(tw[0], tw[1], 10.5 * S, sc, 1.4 * S, 0.9 * form); g.setLineDash([]);
      if (p < 0.25) { g.globalAlpha = 1 - form; g.strokeStyle = sc; g.lineWidth = 1 * S; g.beginPath(); g.moveTo(target[0], target[1]); g.lineTo(tw[0], tw[1]); g.stroke(); g.globalAlpha = 1; return; }
      // an enemy shot goes for the copy, not you
      const eq = clamp01((p - 0.25) / 0.45);
      if (eq < 1) dot(lerp(foes[2][0], tw[0] + 8 * S, eq), lerp(foes[2][1], tw[1], eq), 2.4 * S, '#ffd1d8');
      // you cast; the copy repeats it at half power, paying half its runes
      const k = clamp01((p - 0.35) / 0.4), hit = foes[0];
      if (k > 0 && k < 1) {
        glow(sc, 8); dot(lerp(target[0], hit[0], k), lerp(target[1], hit[1], k), 3.6 * S, '#f1ecff'); noGlow();
        const k2 = clamp01((p - 0.42) / 0.4); if (k2 > 0 && k2 < 1) dot(lerp(tw[0], hit[0], k2), lerp(tw[1], hit[1], k2), 2.2 * S, '#f1ecff', 0.7);
      }
      if (p > 0.75) sparks(hit[0], hit[1], (p - 0.75) / 0.25, 24 * S, 9);
    }

    // Sigil + elements on yourself: auras that affect those near you (one near enemy shows it).
    function auras(target, els) {
      const near = [target[0] + 36 * S, target[1] + 10 * S], R = 28 * S;
      if (els.some((e) => ['fire', 'cold', 'water'].includes(e))) foe(near[0], near[1]);
      for (const [i, e] of els.entries()) {
        const c = col(e), r = R - i * 3 * S;
        if (e === 'fire') { for (let j = 0; j < 12; j++) { const a = (j / 12) * TAU + t; dot(target[0] + Math.cos(a) * r, target[1] + Math.sin(a) * r - ((t * 18 + j * 5) % 8) * S, 2.6 * S, c, 0.75); } for (let j = 0; j < 3; j++) dot(near[0] + (rnd(j) - 0.5) * 8 * S, near[1] - 6 * S - ((t * 16 + j * 5) % 8) * S, 2 * S, c, 0.8); }
        else if (e === 'cold') { ring(target[0], target[1], r, c, 1.2 * S, 0.4); for (let j = 0; j < 10; j++) { const a = (j / 10) * TAU - t * 0.5; dot(target[0] + Math.cos(a) * r, target[1] + Math.sin(a) * r, 1.8 * S, '#ffffff', 0.7); } ring(near[0], near[1], 9 * S, c, 2 * S, 0.8); }
        else if (e === 'water') { for (let j = 0; j < 8; j++) { const a = (j / 8) * TAU + t * 0.3; dot(target[0] + Math.cos(a) * r * 0.9, target[1] + Math.sin(a) * r * 0.9, 8 * S, '#cfe6ff', 0.12); } for (let j = 0; j < 3; j++) dot(near[0] + (j - 1) * 4 * S, near[1] + 4 * S + ((t * 14 + j * 4) % 8) * S, 1.6 * S, c, 0.9); }
        else if (e === 'life') { for (let j = 0; j < 4; j++) { const k = (p * 1.5 + j / 4) % 1, x = target[0] + (rnd(j + 3) - 0.5) * 22 * S, y = target[1] + 4 * S - k * 26 * S; g.globalAlpha = 1 - k; g.fillStyle = c; g.fillRect(x - 3 * S, y - 1 * S, 6 * S, 2 * S); g.fillRect(x - 1 * S, y - 3 * S, 2 * S, 6 * S); g.globalAlpha = 1; } }
        else if (e === 'lightning') { g.strokeStyle = c; g.lineWidth = 1.4 * S; for (let j = 0; j < 4; j++) { const y = target[1] + (j - 1.5) * 5 * S, k = (t * 3 + j * 0.3) % 1; g.globalAlpha = 1 - k; g.beginPath(); g.moveTo(target[0] - (12 + 6 * k) * S, y); g.lineTo(target[0] - (24 + 14 * k) * S, y); g.stroke(); } g.globalAlpha = 1; }
        else if (e === 'arcane') { ring(target[0], target[1], (16 + Math.sin(t * 6) * 2) * S, c, 2 * S, 0.8); g.strokeStyle = '#ffffff'; g.lineWidth = 1 * S; g.globalAlpha = 0.6; g.beginPath(); g.moveTo(target[0] - 4 * S, target[1] - 6 * S); g.lineTo(target[0] + 1 * S, target[1] - 1 * S); g.lineTo(target[0] - 2 * S, target[1] + 3 * S); g.lineTo(target[0] + 4 * S, target[1] + 7 * S); g.stroke(); g.globalAlpha = 1; }
      }
      const steam = s.mix.some((m) => m.els.includes('fire')), freeze = s.mix.some((m) => m.els.includes('cold'));
      if (steam) for (let j = 0; j < 6; j++) dot(target[0] + (rnd(j + 60) - 0.5) * 50 * S, target[1] + (rnd(j + 61) - 0.5) * 40 * S, 11 * S, '#e4e9f2', 0.14);
      if (freeze) { g.fillStyle = '#cdf3ff'; g.globalAlpha = 0.5; g.fillRect(near[0] - 9 * S, near[1] - 9 * S, 18 * S, 18 * S); g.globalAlpha = 1; }
    }

    // Sigil + Earth on yourself: Bulldoze. An enemy in your way is shoved and tips over; coats ride on the shove.
    function bulldoze(target, coats) {
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + t * 1.2; block(target[0] + Math.cos(a) * 17 * S, target[1] + Math.sin(a) * 17 * S, a, 6 * S, 5 * S, col('earth')); }
      const k = ease(clamp01((p - 0.15) / 0.45)), d = lerp(18, 50, k), f = [target[0] + d * S, target[1] + k * 6 * S];
      for (let i = 0; i < 5; i++) { const q = rnd(i + Math.floor(t * 8)); dot(lerp(target[0] + 12 * S, f[0], q), f[1] + 6 * S + (rnd(i + 3) - 0.5) * 6 * S, 1.8 * S, col('earth'), 0.6 * (1 - k * 0.5)); }
      g.save(); g.translate(f[0], f[1]); g.rotate(k * 1.3); g.fillStyle = '#e2566b'; g.beginPath(); g.ellipse(0, 0, 7 * S, 7 * S * (1 - 0.35 * k), 0, 0, TAU); g.fill(); g.restore();
      for (const [i, e] of coats.entries()) for (let j = 0; j < 4; j++) { const a = rnd(j + i * 7) * TAU, r = (6 + 6 * rnd(j + 2)) * S; dot(f[0] + Math.cos(a) * r, f[1] + Math.sin(a) * r - (e === 'fire' ? ((t * 16 + j * 4) % 6) * S : 0), 2 * S, col(e), 0.85); }
    }

    function conjure() {
      const f = s.form;
      if (f !== 'shield' && f !== 'sigil') return imbuedSwing();
      const form = Math.min(1, p / 0.3);
      const swing = p < 0.3 ? 0 : Math.sin(((p - 0.3) / 0.7) * Math.PI * 2);
      const kind = f === 'shield' ? (earthy ? 'tower' : 'buckler') : (s.sub || 'wand');
      const c = f === 'sigil' && s.sub ? col(s.sub) : main;
      const a = aim + swing * (f === 'shield' ? 0.25 : kind === 'wand' ? 0.15 : 0.9);
      g.save(); g.translate(me[0], me[1]); g.rotate(a); g.globalAlpha = 0.3 + 0.7 * form;
      g.fillStyle = c; g.strokeStyle = c; g.lineCap = 'round';
      switch (kind) {
        case 'tower': g.fillStyle = col('earth'); g.fillRect(12 * S, -15 * S, 8 * S, 30 * S); g.fillStyle = main; g.fillRect(12 * S, -15 * S, 2 * S, 30 * S); break;
        case 'buckler': g.lineWidth = 3 * S; g.beginPath(); g.arc(6 * S, 0, 12 * S, -0.9, 0.9); g.stroke(); break;
        case 'earth': g.lineWidth = 3 * S; g.beginPath(); g.moveTo(8 * S, 0); g.lineTo(34 * S, 0); g.stroke(); g.fillRect(30 * S, -7 * S, 10 * S, 14 * S); break;
        case 'arcane': { g.lineWidth = 2 * S; g.setLineDash([3 * S, 2 * S]); const reach = p > 0.3 && p < 0.6 ? lerp(10, 110, (p - 0.3) / 0.3) : p >= 0.6 ? lerp(110, 30, ease((p - 0.6) / 0.3)) : 10; g.beginPath(); g.moveTo(8 * S, 0); g.lineTo(reach * S, 0); g.stroke(); g.setLineDash([]); g.beginPath(); g.arc(reach * S, 0, 4 * S, -1.2, 1.2); g.stroke(); break; }
        case 'lightning': { g.lineWidth = 2 * S; g.beginPath(); g.moveTo(8 * S, 0); for (let i = 1; i < 12; i++) g.lineTo((8 + i * 6) * S, Math.sin(i * 0.9 + t * 14) * 4 * S); g.stroke(); break; }
        case 'life': g.lineWidth = 3 * S; g.beginPath(); g.moveTo(8 * S, 0); g.lineTo(32 * S, 0); g.stroke(); dot(34 * S, 0, 4 * S, c); break;
        case 'wand': g.strokeStyle = '#efe3c4'; g.lineWidth = 1.6 * S; g.beginPath(); g.moveTo(8 * S, 0); g.lineTo(28 * S, 0); g.stroke(); glow(c, 10); dot(30 * S, 0, 3 * S, c); noGlow(); g.globalAlpha = 0.3 + 0.7 * form; break;
        case 'cold': g.lineWidth = 2.4 * S; g.beginPath(); g.moveTo(8 * S, 0); g.lineTo(50 * S, 0); g.stroke(); g.beginPath(); g.moveTo(50 * S, -3 * S); g.lineTo(58 * S, 0); g.lineTo(50 * S, 3 * S); g.fill(); break;
        default: g.lineWidth = 3 * S; g.beginPath(); g.moveTo(8 * S, 0); g.lineTo(40 * S, 0); g.stroke(); g.beginPath(); g.moveTo(40 * S, -4 * S); g.lineTo(48 * S, 0); g.lineTo(40 * S, 4 * S); g.fill();
      }
      if (f === 'sigil') { g.strokeStyle = col('sigil'); g.lineWidth = 1 * S; g.globalAlpha = 0.8; g.beginPath(); g.arc(10 * S, 0, 4 * S, 0, TAU); g.stroke(); }
      g.globalAlpha = 1;
      for (const [i, pc] of pay.entries()) dot((16 + i * 7) * S, -6 * S, 2.4 * S, pc);
      g.restore();
      if (f === 'shield') { // a shot from the enemies bounces off the shield
        const q = (p * 2) % 1, sh = along(20 * S), d = Math.hypot(foes[0][0] - sh[0], foes[0][1] - sh[1]);
        dot(lerp(foes[0][0], sh[0], Math.min(1, q * 2)), lerp(foes[0][1], sh[1], Math.min(1, q * 2)), 2.4 * S, '#ffd1d8', q < 0.5 ? 1 : 0);
        if (q >= 0.5 && d) dot(lerp(sh[0], foes[0][0], (q - 0.5) * 2), lerp(sh[1], foes[0][1], (q - 0.5) * 2), 2.4 * S, earthy ? '#ffd1d8' : main, earthy ? 0 : 1);
        return;
      }
      if (kind === 'wand') { // a blast that lands on an enemy and an ally: the ally is spared
        const B = P(0.52, 0.31), k = clamp01((p - 0.3) / 0.2);
        if (p > 0.3 && p < 0.5) dot(lerp(tip[0], B[0], k), lerp(tip[1], B[1], k), 3 * S, col('fire'));
        if (p >= 0.5) {
          const kb = (p - 0.5) / 0.5;
          ring(B[0], B[1], 58 * S * ease(kb), col('fire'), 4 * S * (1 - kb) + 0.5, 0.8 * (1 - kb));
          if (kb > 0.3) sparks(foes[0][0], foes[0][1], (kb - 0.3) / 0.7, 18 * S, 7);
          glow(col('sigil'), 10); ring(ally[0], ally[1], 12 * S, col('sigil'), 2 * S, 0.9 * (1 - Math.max(0, kb - 0.7) / 0.3)); noGlow();
        }
        return;
      }
      if (p > 0.3 && s.sub !== 'arcane') { g.strokeStyle = c; g.globalAlpha = 0.25; g.lineWidth = 6 * S; g.beginPath(); g.arc(me[0], me[1], 36 * S, aim - 0.9, aim + 0.9); g.stroke(); g.globalAlpha = 1; }
    }

    // Weapon without Shield or Sigil: one staff swing imbued with the queue, as in Magicka.
    function imbuedSwing() {
      const k = ease((p - 0.1) / 0.3), a0 = aim - 1.3, a = a0 + k * 2.6, R = 24 * S;
      const cs = [main, ...pay];
      for (let i = 0; i < 16; i++) {
        const q = i / 16, aa = lerp(a0, a, q);
        if (k <= 0) break;
        dot(me[0] + Math.cos(aa) * R, me[1] + Math.sin(aa) * R, (1.5 + 2 * q) * S, cs[i % cs.length], (p < 0.75 ? 0.9 : (1 - p) * 3.6) * q);
      }
      g.strokeStyle = '#d9c9a0'; g.lineWidth = 2.4 * S; g.beginPath(); g.moveTo(me[0], me[1]); g.lineTo(me[0] + Math.cos(a) * R, me[1] + Math.sin(a) * R); g.stroke();
      glow(main, 8); dot(me[0] + Math.cos(a) * R, me[1] + Math.sin(a) * R, 3.2 * S, main); noGlow();
    }
  }

  window.drawSpell = drawSpell;
  window.DRAW_LOOP = LOOP;
})();
