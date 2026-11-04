// Wishlist vignettes, batch A: geyser, tidal wave, trap rune, primed orbitals,
// attuned blast, stored spell, clone.
(function () {
  // ---------- local helpers ----------
  // Parabolic hop from (x0,y0) to (x1,y1) peaking `h` units up. Returns [x, y(lifted), groundY].
  function toss(x0, y0, x1, y1, h, p) {
    const gy = y0 + (y1 - y0) * p;
    return [x0 + (x1 - x0) * p, gy - h * 4 * p * (1 - p), gy];
  }
  // A small ground shadow that stays put while something flies above it.
  function groundShadow(g, x, y, r, a = 1) {
    g.ctx.save(); g.ctx.globalAlpha = a; g.shadow(x, y, r); g.ctx.restore();
  }
  // Rotating sigil drawn over an actor (attunement / mark).
  function sigil(g, x, y, r, color, a) {
    const { ctx, TAU } = g;
    ctx.save(); ctx.translate(x, y); ctx.rotate(g.t * 2);
    ctx.strokeStyle = g.hexA(color, a); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const an = i * TAU / 4;
      ctx.beginPath(); ctx.moveTo(Math.cos(an) * r, Math.sin(an) * r);
      ctx.lineTo(Math.cos(an + 0.4) * (r + 4), Math.sin(an + 0.4) * (r + 4)); ctx.stroke();
    }
    ctx.restore();
    g.glow(x, y, r * 1.6, color, 0.35 * a);
  }
  // Partial progress ring (clock style) from 12 o'clock.
  function arcProgress(g, x, y, r, p, color, a = 0.9, w = 3) {
    const { ctx } = g;
    ctx.save(); ctx.strokeStyle = g.hexA(color, a); ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + p * g.TAU); ctx.stroke(); ctx.restore();
  }
  // Ghostly wizard: translucent with a cold halo.
  function ghost(g, x, y, o) {
    g.glow(x, y, 20, g.EL.cold, 0.35 * (o.alpha ?? 1));
    g.wizard(x, y, Object.assign({}, o, { color: g.mix(g.ACTOR.hero, '#cdf3ff', 0.55), alpha: 0.6 * (o.alpha ?? 1) }));
    g.ring(x, y, 11, { color: g.EL.cold, alpha: 0.6 * (o.alpha ?? 1), width: 1.2, dash: [3, 3] });
  }

  // ---------- 1. Geyser ----------
  SG.register({
    id: 'geyser',
    name: 'Geyser',
    family: 'offense',
    status: 'starred',
    oneLiner: 'Pick a spot with your cursor; after a short rumble the ground erupts and tosses everything there.',
    situation: 'A pack of enemies bunches up at range, or guards a chokepoint you cannot reach.',
    coop: 'An ally pulls enemies together, then you erupt under the clump.',
    source: 'Your wishlist (like rock + arcane in Magicka)',
    duration: 5.5,
    floor: 'sand',
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL, TAU, rand } = g;
      const hx = 62, hy = 150, tx = 292, ty = 136, E = 1.9;
      const foes = [[272, 120, 0], [308, 122, 1], [282, 152, 0], [314, 152, 2]];

      // Cursor glides from the hero to the clump, then locks.
      const cp = ease.inOut(seg(t, 0.4, 1.05));
      const cx = lerp(150, tx, cp), cy = lerp(160, ty, cp);
      const tel = seg(t, 1.2, 1.5), live = t >= 1.2 && t < E;

      // Telegraph: dusty zone, growing cracks, jittering pebbles.
      if (live) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 22);
        g.zone(tx, ty, 38 * ease.out(tel), { color: EL.earth, alpha: 0.18 + pulse * 0.12, edge: 0.9 });
        ctx.save(); ctx.strokeStyle = 'rgba(40,24,12,0.8)'; ctx.lineWidth = 1.5;
        for (let i = 0; i < 7; i++) {
          const a = i / 7 * TAU + rand(i, 4) * 0.5, l = 30 * seg(t, 1.25, E);
          ctx.beginPath(); ctx.moveTo(tx, ty);
          ctx.lineTo(tx + Math.cos(a) * l * 0.5 + 3, ty + Math.sin(a) * l * 0.5 - 2);
          ctx.lineTo(tx + Math.cos(a) * l, ty + Math.sin(a) * l * 0.8); ctx.stroke();
        }
        ctx.restore();
        for (let i = 0; i < 6; i++) {
          const a = rand(i, 9) * TAU, d = 8 + rand(i, 3) * 24;
          g.rock(tx + Math.cos(a) * d, ty + Math.sin(a) * d * 0.8 - Math.abs(Math.sin(t * 30 + i)) * 3, 2.2, { rot: t * 8 + i });
        }
        g.glow(tx, ty, 26, EL.arcane, 0.25 + pulse * 0.25);
      }

      // Hero with queue rock + arcane.
      const els = [];
      if (between(t, 0.35, 1.25)) els.push('earth');
      if (between(t, 0.65, 1.25)) els.push('arcane');
      g.wizard(hx, hy, { facing: g.angle(hx, hy, tx, ty), tip: EL.arcane, casting: seg(t, 0.8, 1.2) * (1 - seg(t, 1.2, 1.5)) });
      if (els.length) g.queue(hx, hy - 22, els);

      // Enemies: idle, then tossed outward and up.
      foes.forEach(([x, y, k], i) => {
        const col = k === 1 ? g.ACTOR.brute : k === 2 ? g.ACTOR.imp : g.ACTOR.enemy;
        const lt = E + i * 0.04, fp = seg(t, lt, lt + 0.95);
        const out = g.angle(tx, ty, x, y);
        const ex = x + Math.cos(out) * 34, ey = y + Math.sin(out) * 22;
        const sway = Math.sin(t * 3 + i) * 2;
        if (t < lt) {
          g.enemy(x + sway, y, { color: col, facing: Math.PI, r: k === 1 ? 11 : 9 });
        } else {
          const [px, py, gy] = toss(x, y, ex, ey, 70, ease.out(fp) * 0.5 + fp * 0.5);
          if (fp < 1) groundShadow(g, px, gy, 7, 0.8);
          const land = t - (lt + 0.95);
          g.enemy(px, py, { color: col, facing: Math.PI + t * 8 * (1 - fp), r: k === 1 ? 11 : 9, hit: Math.max(0, 1 - (t - lt) * 3), hp: 0.35, status: land > 0 && land < 1.8 ? 'stunned' : [] });
          g.burst(ex, ey + 4, land, { seed: i + 20, count: 10, color: EL.earth, speed: 40, life: 0.4, size: 2 });
          g.popup('-60', ex, ey - 18, land);
        }
      });

      // Eruption column.
      const up = ease.out(seg(t, E, E + 0.22)), down = seg(t, E + 0.9, E + 1.4);
      if (t >= E && down < 1) {
        const h = 120 * up * (1 - ease.in(down)), w = 30 * (1 - down * 0.6);
        g.explosion(tx, ty, t - E, { color: EL.arcane, r: 44, colors: [EL.arcane, EL.earth, '#ffffff'] });
        ctx.save(); ctx.globalAlpha = 1 - down * 0.7;
        const grd = ctx.createLinearGradient(0, ty, 0, ty - h);
        grd.addColorStop(0, g.hexA(EL.earth, 0.95)); grd.addColorStop(0.45, g.hexA(EL.arcane, 0.9)); grd.addColorStop(1, 'rgba(255,255,255,0.95)');
        ctx.fillStyle = grd; ctx.beginPath(); ctx.moveTo(tx - w / 2, ty);
        for (let k = 1; k <= 8; k++) { const q = k / 8; ctx.lineTo(tx - w / 2 * (1 - q * 0.45) + Math.sin(t * 30 + k) * 2, ty - h * q); }
        ctx.arc(tx, ty - h, w * 0.3, Math.PI, 0);
        for (let k = 8; k >= 0; k--) { const q = k / 8; ctx.lineTo(tx + w / 2 * (1 - q * 0.45) + Math.sin(t * 27 + k) * 2, ty - h * q); }
        ctx.closePath(); ctx.fill(); ctx.restore();
        g.burst(tx, ty - h, t - E - 0.1, { seed: 5, count: 26, colors: [EL.arcane, '#ffffff', EL.earth], speed: 70, life: 0.9, size: 3, gravity: 140 });
        // Flying rock debris.
        for (let i = 0; i < 6; i++) {
          const a = rand(i, 11) * TAU, rp = seg(t, E, E + 0.8 + rand(i, 2) * 0.3);
          if (rp > 0 && rp < 1) {
            const [rx, ry] = toss(tx, ty, tx + Math.cos(a) * 60, ty + Math.sin(a) * 40, 90, rp);
            g.rock(rx, ry, 3.5, { rot: t * 10 + i });
          }
        }
      }
      if (t < 2.2) g.cursor(cx, cy, { alpha: 0.9 * (1 - seg(t, 1.9, 2.2)) });
      function between(t, a, b) { return t >= a && t < b; }
    },
  });

  // ---------- 2. Tidal wave ----------
  SG.register({
    id: 'tidal-wave',
    name: 'Tidal Wave',
    family: 'offense',
    status: 'starred',
    oneLiner: 'A wide wall of water rolls forward, shoving back everything in its path and soaking it.',
    situation: 'A line of enemies charges you at once and there is nowhere to run.',
    coop: 'Soaked enemies are primed for an ally\'s lightning or frost.',
    source: 'Your wishlist (a Magick in Magicka)',
    duration: 6,
    floor: 'sand',
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL } = g;
      const hx = 48, hy = 130, C = 1.8;
      const F = lerp(80, 338, ease.out(seg(t, C, C + 1.8)));
      const wa = (t >= C ? 1 : 0) * (1 - seg(t, C + 1.5, C + 2.2));
      const ys = [44, 87, 130, 173, 216];

      // Puddles left in the wave's wake.
      [[150, 70], [200, 180], [250, 110], [300, 200], [320, 60]].forEach(([px, py], i) => {
        const a = seg(F, px, px + 30) * (1 - seg(t, 5.0, 5.8));
        if (a > 0) { ctx.save(); ctx.globalAlpha = a * 0.8; g.puddle(px, py, 16 + i % 2 * 6, 7); ctx.restore(); }
      });

      // Enemies march in, get shoved back by the wave front.
      ys.forEach((y, i) => {
        const off = g.rand(i, 2) * 18;
        const ax = lerp(362 + off, 250 + off, seg(t, 0.2, 2.4));
        const pushed = t >= C && F + 14 > ax;
        const x = pushed ? Math.min(366, Math.max(ax, F + 14)) : ax;
        const hitT = C + 1.8 * (1 - Math.sqrt(1 - (ax - 94) / 258)) ; // approx time front reached
        const age = t - hitT;
        const col = i === 2 ? g.ACTOR.brute : g.ACTOR.enemy;
        g.enemy(x, y + (pushed && wa > 0 ? Math.sin(t * 20 + i) * 2 : Math.sin(t * 8 + i) * 1.5), {
          color: col, r: i === 2 ? 11 : 9, facing: Math.PI,
          status: pushed ? (t < 4.6 ? ['wet', 'stunned'] : 'wet') : [],
          hit: pushed ? Math.max(0, 1 - age * 4) : 0,
        });
      });

      // The wave: a translucent body behind a foaming crest.
      if (wa > 0) {
        ctx.save(); ctx.globalAlpha = wa;
        const grd = ctx.createLinearGradient(F - 80, 0, F, 0);
        grd.addColorStop(0, g.hexA(EL.water, 0)); grd.addColorStop(0.7, g.hexA(EL.water, 0.45)); grd.addColorStop(1, g.hexA(EL.water, 0.85));
        ctx.fillStyle = grd; ctx.beginPath();
        const crest = (y) => F + Math.cos((y - 130) / 110) * 10 - 10 + Math.sin(y * 0.09 + t * 9) * 4;
        ctx.moveTo(F - 80, 26);
        for (let y = 26; y <= 234; y += 8) ctx.lineTo(crest(y), y);
        ctx.lineTo(F - 80, 234); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
        ctx.beginPath();
        for (let y = 26; y <= 234; y += 8) y === 26 ? ctx.moveTo(crest(y), y) : ctx.lineTo(crest(y), y);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.5; ctx.beginPath();
        for (let y = 30; y <= 230; y += 8) y === 30 ? ctx.moveTo(crest(y) - 18, y) : ctx.lineTo(crest(y) - 18 + Math.sin(y * 0.2 + t * 6) * 3, y);
        ctx.stroke();
        ctx.restore();
        for (let i = 0; i < 4; i++) g.spray(F - 6, 50 + i * 54, 0, { color: '#ffffff', spread: 1.4, len: 18, count: 8, size: 2, alpha: 0.7 * wa });
      }

      // Hero: three water gems, then a heave forward.
      const els = [];
      if (t >= 0.5 && t < C) els.push('water');
      if (t >= 0.8 && t < C) els.push('water');
      if (t >= 1.1 && t < C) els.push('water');
      g.wizard(hx, hy, { facing: 0, tip: EL.water, casting: seg(t, 1.2, C) * (1 - seg(t, C, C + 0.4)) });
      if (els.length) g.queue(hx, hy - 22, els);
      g.burst(hx + 20, hy, t - C, { seed: 7, count: 18, color: EL.water, speed: 80, life: 0.5, dir: 0, spread: 2.5 });
    },
  });

  // ---------- 3. Trap rune ----------
  SG.register({
    id: 'trap-rune',
    name: 'Trap Rune',
    family: 'preparation',
    status: 'starred',
    oneLiner: 'Draw a rune on the floor. It arms after a moment, then blows when an enemy steps inside its ring.',
    situation: 'A quiet moment before a wave, with a doorway or path the enemies must take.',
    coop: 'An ally lures or pushes enemies across the rune you laid.',
    source: 'Your wishlist (fixes Magicka\'s self-detonating mines)',
    duration: 7,
    floor: 'stone',
    draw(g, t) {
      const { seg, ease, lerp, EL } = g;
      const rx = 180, ry = 132, TR = 36;
      const ARM0 = 1.0, ARM1 = 2.6, TRIG = 4.55, BOOM = 4.75;
      const placed = seg(t, 0.5, 1.0);
      const armed = t >= ARM1;

      // Trigger ring + rune.
      if (placed > 0 && t < BOOM) {
        const flash = t >= TRIG ? 0.5 + 0.5 * Math.sin(t * 60) : 0;
        g.ring(rx, ry, TR, { color: armed ? EL.fire : '#b8b2cc', alpha: (armed ? 0.6 : 0.35) * placed + flash * 0.4, width: 1.5, dash: [5, 4] });
        g.rune(rx, ry, 15 * ease.back(placed), { color: armed ? EL.fire : '#9a94b0', alpha: (armed ? 0.95 : 0.55) * placed, spin: armed ? 1.2 : 0.3, armed: armed ? 0.6 + flash : 0 });
        if (t < ARM1) arcProgress(g, rx, ry, TR, seg(t, ARM0, ARM1), EL.shield, 0.85 * placed, 2.5);
        if (t >= ARM0 && t < ARM1) g.label('arming', rx, ry - TR - 10, { color: '#d8d4e8' });
        if (t >= ARM1 && t < ARM1 + 0.9) g.label('armed', rx, ry - TR - 10, { color: EL.fire });
        g.burst(rx, ry, t - ARM1, { seed: 3, count: 14, color: EL.fire, speed: 50, life: 0.4, size: 2 });
      }

      // Hero: places rune at their feet, then steps back out of the ring while it arms.
      const back = ease.inOut(seg(t, 1.1, 2.1));
      const hx = lerp(154, 66, back), hy = 136;
      g.wizard(hx, hy, { facing: back > 0 && back < 1 ? Math.PI : 0, tip: EL.fire, casting: seg(t, 0.3, 0.6) * (1 - seg(t, 0.9, 1.1)) });
      if (t >= 0.25 && t < 1.0) g.queue(hx, hy - 22, t < 0.5 ? ['fire'] : ['fire', 'earth']);

      // Enemies walk in from the right; the leader trips the ring.
      for (let i = 0; i < 3; i++) {
        const walkX = 400 + i * 24 - 120 * (Math.min(t, BOOM) - 3.0);
        const y = ry + [-8, 10, -2][i];
        if (t < 3.0) continue;
        const col = i === 1 ? g.ACTOR.brute : g.ACTOR.enemy;
        if (t < BOOM) {
          g.enemy(walkX, y + Math.sin(t * 14 + i) * 1.5, { color: col, r: i === 1 ? 11 : 9, facing: Math.PI, status: t >= TRIG && i === 0 ? 'stunned' : [] });
          if (i === 0 && t >= TRIG) g.label('!', walkX, y - 20, { color: EL.fire });
        } else {
          const out = g.angle(rx, ry, walkX, y);
          const fp = seg(t, BOOM, BOOM + 0.7);
          const [px, py, gy] = toss(walkX, y, walkX + Math.cos(out) * 50, y + Math.sin(out) * 30, 50, ease.out(fp));
          if (fp < 1) groundShadow(g, px, gy, 7, 0.7);
          g.enemy(px, py, { color: col, r: i === 1 ? 11 : 9, facing: Math.PI + t * 10 * (1 - fp), status: 'burning', hit: Math.max(0, 1 - (t - BOOM) * 3), dead: seg(t, BOOM + 1.0, BOOM + 1.5) });
          g.popup('-120', px, py - 16, t - BOOM - 0.3);
        }
      }
      g.explosion(rx, ry, t - BOOM, { color: EL.fire, r: 70, count: 40 });
      g.flames(rx, ry, 40 * (1 - seg(t, BOOM, BOOM + 1.6)), 20 * (1 - seg(t, BOOM, BOOM + 1.6)), { amount: t > BOOM ? 1 - seg(t, BOOM + 0.6, BOOM + 1.6) : 0 });
    },
  });

  // ---------- 4. Primed orbitals ----------
  SG.register({
    id: 'primed-orbitals',
    name: 'Primed Orbitals',
    family: 'preparation',
    status: 'maybe',
    oneLiner: 'During downtime, gather stones one by one to circle you. When the fight starts, fling them all.',
    situation: 'A lull before a known fight, like the moment before you open a door.',
    coop: 'Two players stockpile in calm, then unload a combined volley together.',
    source: 'Your wishlist (orbiting stones + seekers, as prep)',
    duration: 6.5,
    floor: 'meadow',
    draw(g, t) {
      const { seg, ease, lerp, EL, TAU } = g;
      const hx = 112, hy = 140, N = 5, OR = 30, W = 2.4;
      const spawn = (i) => 0.5 + i * 0.45;
      const L = (i) => 4.35 + i * 0.1, FL = 0.3;
      const targets = [[300, 92], [322, 142], [296, 192]];
      const foeIn = (j) => ease.out(seg(t, 2.9 + j * 0.15, 4.0 + j * 0.15));
      const foePos = (j) => [lerp(420, targets[j][0], foeIn(j)), targets[j][1]];
      const hitsOn = (j) => [0, 1, 2, 3, 4].filter(i => i % 3 === j).map(i => L(i) + FL);

      const count = [0, 1, 2, 3, 4].filter(i => t >= spawn(i) && t < L(i)).length;
      g.wizard(hx, hy, { facing: t > 3.6 ? g.angle(hx, hy, 310, 142) : 0.4, tip: EL.earth, casting: count && t < 3 ? 0.4 + 0.3 * Math.sin(t * 6) : t > 4.1 && t < 4.9 ? 1 : 0 });
      if (t >= 0.5 && t < 2.8) g.queue(hx + 22, hy - 46, ['earth'], { alpha: 0.5 + 0.5 * Math.sin(t * 13.9) ** 2 });
      if (count > 0) g.label('x' + count, hx, hy - 46, { color: EL.earth });

      // Enemies arrive late.
      for (let j = 0; j < 3; j++) {
        if (t < 2.9) continue;
        const [x, y] = foePos(j), hits = hitsOn(j);
        const nHit = hits.filter(h => t >= h).length, last = hits.filter(h => t >= h).pop();
        const age = last != null ? t - last : -1;
        const kb = nHit * 8 + (age >= 0 ? (1 - ease.out(seg(age, 0, 0.2))) * 0 : 0);
        const dead = nHit >= hits.length ? seg(t, hits[hits.length - 1] + 0.4, hits[hits.length - 1] + 0.9) : 0;
        g.enemy(x + kb, y, { color: j === 1 ? g.ACTOR.brute : g.ACTOR.enemy, r: j === 1 ? 11 : 9, facing: Math.PI, hit: age >= 0 ? Math.max(0, 1 - age * 4) : 0, hp: 1 - nHit / hits.length, status: nHit ? 'stunned' : [], dead });
        hits.forEach((h, k) => { g.burst(x, y, t - h, { seed: j * 5 + k, count: 10, color: EL.earth, speed: 60, life: 0.4, size: 2.2 }); g.popup('-40', x, y - 18 - k * 4, t - h); });
      }
      if (t >= 3.7 && t < 4.6) g.cursor(310, 142, { alpha: 0.9 * (1 - seg(t, 4.4, 4.6)) });

      // Stones: rise from the ground, join the orbit, then fly at targets.
      for (let i = 0; i < N; i++) {
        const s = spawn(i); if (t < s) continue;
        const a = t * W + i * TAU / N;
        const grow = ease.back(seg(t, s, s + 0.3));
        const orb = (tt) => [hx + Math.cos(tt * W + i * TAU / N) * OR * lerp(0.4, 1, ease.out(seg(tt, s, s + 0.3))), hy + Math.sin(tt * W + i * TAU / N) * OR * 0.8 * lerp(0.4, 1, ease.out(seg(tt, s, s + 0.3))) - 6];
        g.burst(hx + Math.cos(a) * 10, hy + Math.sin(a) * 8, t - s, { seed: i + 40, count: 8, color: EL.earth, speed: 30, life: 0.35, size: 1.8 });
        if (t < L(i)) {
          const [x, y] = orb(t);
          g.rock(x, y, 6 * grow, { rot: t * 4 + i });
        } else if (t < L(i) + FL) {
          const [ox, oy] = orb(L(i));
          const [tx, ty] = foePos(i % 3);
          const fp = seg(t, L(i), L(i) + FL);
          const pos = (tt) => { const q = seg(tt, L(i), L(i) + FL); return toss(ox, oy, tx, ty, 18, ease.in(q)); };
          g.trail((tt) => pos(tt).slice(0, 2), { color: EL.earth, len: 0.12, width: 5, from: L(i) });
          const [x, y] = pos(t);
          g.rock(x, y, 6, { rot: t * 20 });
        }
      }
      if (t < 2.9) g.label('calm', 200, 30, { color: '#d8f0c8', alpha: seg(t, 0.4, 0.8) * (1 - seg(t, 2.6, 2.9)) });
    },
  });

  // ---------- 5. Attuned blast ----------
  SG.register({
    id: 'attuned-blast',
    name: 'Attuned Blast',
    family: 'offense',
    status: 'starred',
    oneLiner: 'Add an attunement gem and mark allies; your explosion then rips through enemies and leaves them untouched.',
    situation: 'Your ally is surrounded and a normal blast would hit them too.',
    coop: 'The surrounded ally holds still and trusts you to drop the blast on them.',
    source: 'Your wishlist',
    duration: 6.5,
    floor: 'stone',
    draw(g, t) {
      const { seg, ease, lerp, EL, TAU } = g;
      const hx = 58, hy = 150, ax = 272, ay = 132, B = 3.0;
      const markP = seg(t, 1.7, 2.1);

      // Gems: fire, earth, then the extra attunement gem.
      const els = [];
      if (t >= 0.45 && t < 2.5) els.push('fire');
      if (t >= 0.75 && t < 2.5) els.push('earth');
      if (t >= 1.25 && t < 2.5) els.push('shield');
      g.wizard(hx, hy, { facing: g.angle(hx, hy, ax, ay), tip: t < 2.2 ? EL.shield : EL.fire, casting: seg(t, 1.4, 1.7) * (1 - seg(t, 2.1, 2.3)) + seg(t, 2.3, 2.5) * (1 - seg(t, 2.5, 2.7)) });
      if (els.length) {
        g.queue(hx, hy - 24, els);
        if (els.length === 3) { g.glow(hx + 9, hy - 24, 10, EL.shield, 0.6 + 0.3 * Math.sin(t * 12)); g.label('+attune', hx + 9, hy - 40, { color: EL.shield }); }
      }
      // Marking beam.
      if (t >= 1.5 && t < 2.2) g.aim(hx + 14, hy - 4, ax, ay, { color: EL.shield, alpha: 0.8 * (1 - seg(t, 2.0, 2.2)) });

      // Enemies ring the ally.
      [0.2, 1.75, 3.0, 4.4].forEach((an, i) => {
        const x = ax + Math.cos(an) * 36, y = ay + Math.sin(an) * 30;
        const col = i === 2 ? g.ACTOR.brute : i === 3 ? g.ACTOR.imp : g.ACTOR.enemy;
        if (t < B) {
          g.enemy(x + Math.cos(an) * Math.sin(t * 5 + i) * 1.5, y, { color: col, r: i === 2 ? 11 : 9, facing: an + Math.PI });
        } else {
          const fp = seg(t, B, B + 0.7);
          const [px, py, gy] = toss(x, y, x + Math.cos(an) * 46, y + Math.sin(an) * 34, 40, ease.out(fp));
          if (fp < 1) groundShadow(g, px, gy, 7, 0.7);
          g.enemy(px, py, { color: col, r: i === 2 ? 11 : 9, facing: an + Math.PI + t * 9 * (1 - fp), status: 'burning', hit: Math.max(0, 1 - (t - B) * 3), dead: seg(t, B + 1.1, B + 1.6) });
          g.popup('-120', px, py - 16, t - B - 0.25);
        }
      });

      // Ally in the middle.
      g.wizard(ax, ay, { color: g.ACTOR.ally, facing: Math.PI, alpha: 1 });
      if (t < 1.7) g.label('ally', ax, ay + 50, { color: g.ACTOR.ally });
      if (markP > 0) sigil(g, ax, ay, 14 * ease.back(markP), EL.shield, markP * (1 - seg(t, 4.8, 5.6)));
      g.burst(ax, ay, t - 1.7, { seed: 9, count: 12, color: EL.shield, speed: 40, life: 0.4, size: 2 });

      // Fireball lob.
      const fp = seg(t, 2.45, B);
      if (fp > 0 && fp < 1) {
        const pos = (tt) => toss(hx + 14, hy - 4, ax, ay, 40, seg(tt, 2.45, B)).slice(0, 2);
        g.trail(pos, { color: EL.fire, len: 0.15, width: 5, from: 2.45 });
        g.orb(...pos(t), 5, EL.fire);
      }
      // Blast, with a clean hole where the marked ally stands.
      g.explosion(ax, ay, t - B, { color: EL.fire, r: 80, count: 44 });
      if (t >= B && t < B + 1.0) {
        const a = 1 - seg(t, B + 0.6, B + 1.0);
        g.bubble(ax, ay, 17, { color: EL.shield, alpha: a, hit: Math.max(0, 1 - (t - B) * 3) });
      }
      g.popup('safe', ax, ay - 26, (t - B - 0.2) * 0.7, { color: EL.shield });
    },
  });

  // ---------- 6. Stored spell ----------
  SG.register({
    id: 'stored-spell',
    name: 'Stored Spell',
    family: 'preparation',
    status: 'user',
    oneLiner: 'Compose a long combo while it is calm and bank it. Later, release it in an instant.',
    situation: 'You know a rush is coming and will not have time to type five elements.',
    coop: 'Banked spells let the team sync a burst on one exact moment.',
    source: 'Your idea',
    duration: 7,
    floor: 'stone',
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL } = g;
      const hx = 78, hy = 142, R = 4.75;
      const combo = ['fire', 'arcane', 'earth', 'lightning', 'fire'];
      const add = (i) => 0.5 + i * 0.45, BANK = 2.75;
      const sx = hx + 22, sy = hy - 30; // slot icon

      g.wizard(hx, hy, { facing: 0, tip: t >= R && t < R + 0.5 ? EL.arcane : '#ffffff', casting: t < BANK ? 0.3 + 0.2 * Math.sin(t * 5) : t >= R && t < R + 0.4 ? 1 : 0 });

      // Slow compose: gems tick in one by one with a timer bar.
      if (t >= 0.4 && t < BANK + 0.5) {
        const n = combo.filter((_, i) => t >= add(i)).length;
        const fly = seg(t, BANK, BANK + 0.45);
        if (fly === 0) {
          g.queue(hx, hy - 26, combo.slice(0, n));
          g.label('slow compose', hx, hy - 42, { color: '#d8d4e8' });
          ctx.fillStyle = 'rgba(10,6,20,0.6)'; ctx.fillRect(hx - 24, hy + 15, 48, 4);
          ctx.fillStyle = EL.shield; ctx.fillRect(hx - 24, hy + 15, 48 * seg(t, 0.5, BANK), 4);
        } else {
          combo.forEach((e, i) => {
            const x0 = hx + (i - 2) * 9, y0 = hy - 26, q = ease.in(fly);
            g.orb(lerp(x0, sx, q), lerp(y0, sy, q), 3 * (1 - q * 0.5), EL[e]);
          });
        }
      }
      // Slot icon near the hero.
      if (t >= BANK + 0.3) {
        const full = t < R, pop = ease.back(seg(t, BANK + 0.3, BANK + 0.6));
        const s = 11 * (full ? pop : 1 + seg(t, R, R + 0.3) * 0.4);
        ctx.save(); ctx.globalAlpha = full ? 1 : 1 - seg(t, R + 0.2, R + 0.8);
        ctx.fillStyle = 'rgba(12,8,26,0.85)'; ctx.strokeStyle = full ? EL.shield : '#6d6680'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(sx - s, sy - s, s * 2, s * 2, 3); ctx.fill(); ctx.stroke();
        if (full) {
          combo.forEach((e, i) => { const a = t * 3 + i * g.TAU / 5; ctx.fillStyle = EL[e]; ctx.beginPath(); ctx.arc(sx + Math.cos(a) * s * 0.5, sy + Math.sin(a) * s * 0.5, 2, 0, g.TAU); ctx.fill(); });
        }
        ctx.restore();
        if (full) g.glow(sx, sy, 16, EL.shield, 0.4 + 0.2 * Math.sin(t * 6));
        if (t >= BANK + 0.4 && t < 4.0) g.label('stored', sx, sy - 18, { color: EL.shield });
      }

      // Enemies rush in fast.
      const ys = [118, 144, 170];
      const hit = t - R - 0.05;
      ys.forEach((y, i) => {
        if (t < 3.7) return;
        const rush = seg(Math.min(t, R), 3.75 + i * 0.08, R);
        const x = lerp(420 + i * 16, 190 + i * 18, ease.in(rush) * 0.3 + rush * 0.7);
        if (t < R) {
          for (let k = 1; k <= 3; k++) { ctx.fillStyle = 'rgba(255,255,255,' + (0.2 - k * 0.05) + ')'; ctx.beginPath(); ctx.arc(x + k * 9, y, 7 - k, 0, g.TAU); ctx.fill(); }
          g.enemy(x, y + Math.sin(t * 22 + i) * 2, { color: i === 1 ? g.ACTOR.brute : g.ACTOR.enemy, r: i === 1 ? 11 : 9, facing: Math.PI });
        } else {
          const fp = seg(t, R, R + 0.6);
          const [px, py, gy] = toss(x, y, x + 70 + i * 10, y + (i - 1) * 18, 30, ease.out(fp));
          if (fp < 1) groundShadow(g, px, gy, 7, 0.7);
          g.enemy(px, py, { color: i === 1 ? g.ACTOR.brute : g.ACTOR.enemy, r: i === 1 ? 11 : 9, facing: Math.PI + t * 9 * (1 - fp), status: ['burning', 'shocked'], hit: Math.max(0, 1 - hit * 3), dead: seg(t, R + 1.0, R + 1.5) });
          g.popup('-200', px, py - 16, hit - 0.2);
        }
      });

      // Instant release: a big fire-arcane beam with lightning laced through.
      if (t >= R && t < R + 0.55) {
        const a = 1 - seg(t, R + 0.35, R + 0.55);
        g.beam(hx + 16, hy - 2, 390, hy, { color: EL.arcane, width: 12, alpha: a });
        g.beam(hx + 16, hy - 2, 390, hy, { color: EL.fire, width: 6, alpha: a });
        for (let k = 0; k < 2; k++) g.bolt(hx + 16, hy - 2, 380, hy + (k ? 26 : -26), { seed: Math.floor(t * 20) + k, alpha: a });
      }
      g.burst(hx + 16, hy, t - R, { seed: 4, count: 20, colors: [EL.fire, EL.arcane, '#fff'], speed: 90, life: 0.5, dir: 0, spread: 1.6 });
      g.popup('instant!', hx, hy - 52, (t - R) * 0.8, { color: EL.fire, size: 11 });
    },
  });

  // ---------- 7. Clone ----------
  SG.register({
    id: 'clone',
    name: 'Clone',
    family: 'summon',
    status: 'user',
    oneLiner: 'Leave your body safe and play as a fragile ghost copy. If it dies, you snap back unharmed.',
    situation: 'A lever, a scout or a risky grab sits deep inside enemy territory.',
    coop: 'Your team guards your empty body while your clone runs the errand.',
    source: 'Your idea',
    duration: 7,
    floor: 'stone',
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL } = g;
      const bx0 = 64, by = 192;
      // Layout: a dividing wall, an upper danger lane, a gate blocking the lower lane.
      g.wall(118, 122, 290, 12);
      g.wall(0, 0, 400, 10);
      const open = ease.inOut(seg(t, 2.65, 3.1));
      const gh = 106 * (1 - open);
      if (gh > 1) g.wall(232, 134, 12, gh, { color: '#7d6a58' });
      g.ring(238, 140, 3, { color: '#888', alpha: 0.6 });
      // Lever on the wall.
      const lx = 344, ly = 118, la = lerp(-0.9, 0.9, ease.back(seg(t, 2.4, 2.7)));
      ctx.save(); ctx.strokeStyle = '#3a3040'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(lx, ly + 2); ctx.lineTo(lx + Math.sin(la) * 13, ly + 2 - Math.cos(la) * 13); ctx.stroke();
      ctx.fillStyle = t >= 2.6 ? EL.life : '#ff5d73'; ctx.beginPath(); ctx.arc(lx + Math.sin(la) * 13, ly + 2 - Math.cos(la) * 13, 3.5, 0, g.TAU); ctx.fill(); ctx.restore();

      // Clone path through the upper lane.
      const path = [[bx0 + 12, by - 6], [86, 84], [210, 70], [lx - 4, 96]];
      const run = ease.inOut(seg(t, 0.9, 2.35));
      const [cx, cy, ca] = g.along(path, run);
      const DIE = 3.4;
      const cloneA = seg(t, 0.5, 0.9);

      // Body walks through the opened gate at the end.
      const walk = ease.inOut(seg(t, 4.7, 6.2));
      const bx = lerp(bx0, 300, walk);
      const awake = seg(t, 3.85, 4.1);
      g.wizard(bx, by, { facing: walk > 0 ? 0 : -0.8, alpha: 0.45 + 0.55 * (t < 0.5 ? 1 : awake), tip: awake > 0 || t < 0.5 ? EL.cold : null });
      if (t >= 0.9 && t < DIE) g.aim(bx, by, cx, cy, { color: EL.cold, alpha: 0.35 });
      if (t >= 1.3 && t < 3.85) g.label('body', bx, by - 22, { color: '#d8d4e8' });
      g.ring(bx, by, 14 + seg(t, 3.85, 4.3) * 16, { color: EL.cold, alpha: t > 3.85 ? 1 - seg(t, 3.85, 4.3) : 0, width: 2 });
      g.popup('unharmed', bx, by - 22, (t - 3.95) * 0.7, { color: EL.life });

      // Enemies guarding the lane, turn to face the clone and shoot it.
      const foes = [[250, 44, g.ACTOR.imp], [292, 98, g.ACTOR.brute]];
      foes.forEach(([x, y, col], i) => {
        const f = t > 1.4 && t < DIE ? g.angle(x, y, cx, cy) : Math.PI;
        g.enemy(x, y, { color: col, r: i ? 11 : 9, facing: f, status: t > 1.6 && t < 2.4 ? [] : [] });
        if (t > 1.5 && t < 2.6) g.label('!', x, y - 18, { color: '#ff5d73' });
        const st = 2.85 + i * 0.15, fp = seg(t, st, st + 0.3);
        if (fp > 0 && fp < 1) g.orb(lerp(x, cx, fp), lerp(y, cy, fp), 3.5, col === g.ACTOR.imp ? EL.arcane : EL.fire);
      });

      // The clone.
      if (t >= 0.5 && t < DIE) {
        const hitF = (t > 3.15 ? 1 : 0) * (0.5 + 0.5 * Math.sin(t * 50));
        const ox = lerp(bx0, cx, cloneA), oy = lerp(by, cy, cloneA);
        if (run > 0 && run < 1) g.trail((tt) => g.along(path, ease.inOut(seg(tt, 0.9, 2.35))).slice(0, 2), { color: EL.cold, len: 0.2, width: 5, from: 0.9 });
        ghost(g, ox, oy, { facing: run > 0 && run < 1 ? ca : -0.4, alpha: cloneA * (1 - hitF * 0.5), tip: EL.cold, casting: t > 2.35 && t < 2.7 ? 1 : 0 });
        if (t >= 0.8 && t < 1.8) g.label('clone', ox, oy - 22, { color: EL.cold });
      }
      g.burst(cx, cy, t - DIE, { seed: 12, count: 26, colors: [EL.cold, '#ffffff', g.ACTOR.hero], speed: 80, life: 0.6, size: 2.6 });
      // Spirit snaps back to the body.
      const back = seg(t, DIE + 0.1, 3.9);
      if (back > 0 && back < 1) {
        const pos = (tt) => { const q = ease.in(seg(tt, DIE + 0.1, 3.9)); return toss(cx, cy, bx0, by, 30, q).slice(0, 2); };
        g.trail(pos, { color: EL.cold, len: 0.15, width: 4, from: DIE + 0.1 });
        g.orb(...pos(t), 3.5, EL.cold);
      }
    },
  });
})();
