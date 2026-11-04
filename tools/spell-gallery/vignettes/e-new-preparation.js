// Builder E: research-sourced preparation / setup spells (all status 'new').
// Every draw is a pure function of t; shared local helpers live at the top.
(function () {
  const TAU = Math.PI * 2;

  // Linear walk between two points over [a,b] seconds with easing (default linear).
  function walk(g, t, a, b, x0, y0, x1, y1, e) {
    const p = (e || ((q) => q))(g.seg(t, a, b));
    return [g.lerp(x0, x1, p), g.lerp(y0, y1, p)];
  }

  // Small bump pulse 0..1..0 repeating `n` times over [a,b] (melee lunges, shakes).
  function pulses(g, t, a, b, n) {
    if (t < a || t > b) return 0;
    const ph = ((t - a) / (b - a)) * n % 1;
    return Math.sin(ph * Math.PI);
  }

  // Text glyph drawn in the arena (for digits / "!" inside icons).
  function glyph(g, text, x, y, color, size) {
    const { ctx } = g;
    ctx.save();
    ctx.font = `800 ${size || 10}px "Nunito Sans", system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = color || '#fff'; ctx.fillText(text, x, y + 0.5);
    ctx.restore();
  }

  // Scorch mark on the floor.
  function scorch(g, x, y, r, a) {
    if (a <= 0) return;
    const { ctx } = g;
    ctx.save();
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(20,12,10,${0.6 * a})`); grd.addColorStop(1, 'rgba(20,12,10,0)');
    ctx.fillStyle = grd; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.8, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // Spectral hound seen from above, facing f.
  function hound(g, x, y, f, o = {}) {
    const { ctx } = g, c = '#8ff3ff', a = o.alpha ?? 1, s = o.scale || 1;
    if (a <= 0) return;
    g.glow(x, y, 18 * s, c, 0.35 * a);
    ctx.save(); ctx.globalAlpha = a * 0.9; ctx.translate(x, y); ctx.rotate(f); ctx.scale(s, s);
    // tail wag
    const wag = Math.sin(g.t * 14) * 0.6;
    ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-8, 0); ctx.quadraticCurveTo(-13, wag * 4, -16, wag * 7); ctx.stroke();
    // body + head
    ctx.fillStyle = g.hexA(c, 0.75);
    ctx.beginPath(); ctx.ellipse(0, 0, 9, 5.5, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(9, 0, 4.6, 0, TAU); ctx.fill();
    // ears
    ctx.beginPath(); ctx.moveTo(8, -3); ctx.lineTo(5, -7.5); ctx.lineTo(10.5, -4.5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(8, 3); ctx.lineTo(5, 7.5); ctx.lineTo(10.5, 4.5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, 0, 9, 5.5, 0, 0, TAU); ctx.stroke();
    // eyes
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(11, -1.8, 1.1, 0, TAU); ctx.arc(11, 1.8, 1.1, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // Straw effigy (scarecrow) seen from above. o: { shake, sealed (0..1 glow color strength), sealColor, hp, alpha }
  function effigy(g, x, y, o = {}) {
    const { ctx } = g, sh = o.shake || 0;
    const sx = x + Math.sin(g.t * 60) * sh * 2.5;
    g.shadow(sx, y + 4, 12);
    ctx.save(); ctx.globalAlpha = o.alpha ?? 1;
    ctx.translate(sx, y); ctx.scale(o.scale ?? 1, o.scale ?? 1);
    ctx.fillStyle = '#7a5532'; ctx.strokeStyle = 'rgba(30,18,10,0.8)'; ctx.lineWidth = 1.2;
    ctx.fillRect(-2.5, -10, 5, 26); ctx.strokeRect(-2.5, -10, 5, 26);         // post
    ctx.fillStyle = '#d9b56a';
    ctx.fillRect(-15, -4, 30, 6); ctx.strokeRect(-15, -4, 30, 6);              // straw arms
    for (const sd of [-1, 1]) {                                                 // straw tufts
      ctx.strokeStyle = '#f0d58f';
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(sd * 15, -2 + i * 2); ctx.lineTo(sd * 19, -4 + i * 3); ctx.stroke(); }
    }
    ctx.fillStyle = '#e2c27a'; ctx.strokeStyle = 'rgba(30,18,10,0.8)';
    ctx.beginPath(); ctx.arc(0, -12, 7, 0, TAU); ctx.fill(); ctx.stroke();      // head
    ctx.strokeStyle = '#4a3020'; ctx.lineWidth = 1.2;                           // stitched X eyes
    for (const ex of [-2.6, 2.6]) { ctx.beginPath(); ctx.moveTo(ex - 1.3, -13.5); ctx.lineTo(ex + 1.3, -11); ctx.moveTo(ex + 1.3, -13.5); ctx.lineTo(ex - 1.3, -11); ctx.stroke(); }
    ctx.restore();
    if (o.sealed) {
      g.glow(sx, y, 16, o.sealColor || g.EL.cold, 0.7 * o.sealed);
      g.ring(sx, y - 1, 5 + Math.sin(g.t * 8) * 1, { color: o.sealColor || g.EL.cold, alpha: o.sealed, width: 1.5 });
    }
    if (o.hp != null && o.hp < 1) {
      ctx.fillStyle = 'rgba(10,6,20,0.7)'; ctx.fillRect(x - 12, y + 18, 24, 3);
      ctx.fillStyle = '#ffd166'; ctx.fillRect(x - 12, y + 18, 24 * g.clamp(o.hp), 3);
    }
  }

  // Red target mark that rotates over a target.
  function mark(g, x, y, r, a) {
    if (a <= 0) return;
    const { ctx } = g, c = '#ff5d73', rot = g.t * 2;
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = c;
    for (let i = 0; i < 4; i++) {
      const an = rot + i * Math.PI / 2, px = x + Math.cos(an) * r, py = y + Math.sin(an) * r;
      ctx.beginPath();
      ctx.moveTo(px - Math.cos(an) * 5, py - Math.sin(an) * 5);
      ctx.lineTo(px + Math.cos(an + 1.9) * 4, py + Math.sin(an + 1.9) * 4);
      ctx.lineTo(px + Math.cos(an - 1.9) * 4, py + Math.sin(an - 1.9) * 4);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // Ring of chain links around a pinned target.
  function chains(g, x, y, r, a) {
    if (a <= 0) return;
    const { ctx } = g;
    ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#d7dcea'; ctx.lineWidth = 1.6;
    const n = 10;
    for (let i = 0; i < n; i++) {
      const an = i / n * TAU + g.t * 0.5;
      ctx.save(); ctx.translate(x + Math.cos(an) * r, y + Math.sin(an) * r * 0.85); ctx.rotate(an + Math.PI / 2 + (i % 2) * 0.4);
      ctx.beginPath(); ctx.ellipse(0, 0, 3.6, 2, 0, 0, TAU); ctx.stroke(); ctx.restore();
    }
    ctx.restore();
  }

  // Countdown ring: remaining fraction shown as an arc that shrinks clockwise.
  function countdown(g, x, y, r, remain, color, a) {
    const { ctx } = g;
    ctx.save(); ctx.globalAlpha = a;
    ctx.strokeStyle = 'rgba(10,6,20,0.55)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    if (remain > 0.001) { ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * remain); ctx.stroke(); }
    ctx.restore();
  }

  // ------------------------------------------------------------------ 1
  SG.register({
    id: 'contingency',
    name: 'Contingency',
    family: 'preparation',
    status: 'new',
    oneLiner: 'Compose a spell and attach a condition, like "when I\'m hit". It fires itself, once.',
    situation: 'A melee rush you cannot dodge; your preloaded push fires the instant they reach you.',
    coop: 'Bind it to an ally ("when Mira drops below half") and your ward lands on her automatically.',
    source: 'Path of Exile: Cast when Damage Taken; Hearthstone: Mage secrets; D&D: Contingency',
    duration: 5.5,
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL, clamp } = g;
      const hx = 200, hy = 130, TRIG = 2.7;
      const fired = t >= TRIG;

      // Compose phase: gems appear, then fold into the trigger badge.
      const compose = seg(t, 0.4, 1.0) * (1 - seg(t, 1.1, 1.3));
      g.wizard(hx, hy, { facing: Math.PI / 2, tip: EL.arcane, casting: compose + (fired ? Math.max(0, 1 - (t - TRIG) * 3) : 0) });
      if (compose > 0) {
        const els = ['arcane', 'earth', 'shield'].slice(0, Math.ceil(seg(t, 0.4, 1.0) * 3 + 0.01));
        g.queue(hx, hy - 24, els, { alpha: compose });
      }

      // Enemies converge from four edges.
      const starts = [[22, 130], [378, 130], [200, 22], [200, 240]];
      const arrive = [TRIG, TRIG + 0.08, TRIG + 0.14, TRIG + 0.05];
      starts.forEach(([sx, sy], i) => {
        const an = g.angle(hx, hy, sx, sy);
        const stopR = 20 + (arrive[i] - TRIG) * 60;
        const p = ease.in(seg(t, 1.3, arrive[i]));
        let x = lerp(sx, hx + Math.cos(an) * stopR, p), y = lerp(sy, hy + Math.sin(an) * stopR, p);
        if (t > TRIG) {
          const k = ease.out(seg(t, TRIG, TRIG + 0.45));
          const r0 = g.dist(hx, hy, x, y);
          const r = lerp(r0, 105 - (i % 2) * 10, k);
          x = hx + Math.cos(an) * r; y = hy + Math.sin(an) * r;
        }
        const age = t - TRIG;
        g.enemy(x, y, {
          r: 10, color: i === 1 ? g.ACTOR.brute : g.ACTOR.enemy, facing: an + Math.PI,
          hit: age > 0 ? Math.max(0, 1 - age * 3) : 0,
          status: age > 0.3 ? 'stunned' : [], alpha: 1 - seg(t, 5.0, 5.4),
        });
      });

      // Push shockwave fired by the badge.
      const age = t - TRIG;
      if (age >= 0 && age < 0.8) {
        g.ring(hx, hy, 18 + 95 * ease.out(clamp(age / 0.5)), { color: EL.arcane, width: 6 * (1 - clamp(age / 0.6)), alpha: 1 - clamp(age / 0.7) });
        g.ring(hx, hy, 14 + 70 * ease.out(clamp(age / 0.5)), { color: EL.earth, width: 3 * (1 - clamp(age / 0.6)), alpha: 0.8 - clamp(age / 0.7) });
        g.burst(hx, hy, age, { seed: 11, count: 26, colors: [EL.arcane, EL.earth, '#ffffff'], speed: 160, life: 0.6, size: 2.5 });
      }

      // Trigger badge: orbits above the head, shows the condition icon.
      const bx = hx + Math.cos(t * 2.4) * 14, by = hy - 26 + Math.sin(t * 2.4) * 4;
      const appear = ease.back(seg(t, 1.1, 1.45));
      if (!fired && appear > 0) {
        const warn = seg(t, TRIG - 0.5, TRIG);       // tremble as enemies close in
        const jx = Math.sin(t * 70) * warn * 1.5;
        g.glow(bx + jx, by, 14, EL.shield, 0.5 + warn * 0.4);
        ctx.save(); ctx.translate(bx + jx, by); ctx.scale(appear, appear);
        ctx.fillStyle = 'rgba(16,10,30,0.9)'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.fill();
        ctx.strokeStyle = g.mix(EL.shield, '#ff5d73', warn); ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
        glyph(g, '!', bx + jx, by, g.mix(EL.shield, "#ff5d73", warn), 15 * appear);
        // the condition, spelled out once
        const la = seg(t, 1.4, 1.6) * (1 - seg(t, 2.3, 2.5));
        if (la > 0) g.label('if I get hit', hx, hy - 46, { alpha: la, color: EL.shield });
      }
      if (fired) {
        // flash where the badge was, then an empty socket remains
        g.glow(bx, by, 30 * (1 - clamp(age / 0.4)), '#ffffff', 1 - clamp(age / 0.4));
        g.ring(bx, by, 8, { color: '#ffffff', alpha: 0.25 + 0.1 * Math.sin(t * 6), width: 1.2, dash: [2, 3] });
        g.popup('auto!', hx, hy - 40, age * 0.8, { color: EL.shield, size: 10 });
      }
    },
  });

  // ------------------------------------------------------------------ 2
  SG.register({
    id: 'timed-sigil',
    name: 'Timed Sigil',
    family: 'preparation',
    status: 'new',
    oneLiner: 'Cast a spell into the ground with a fuse. A countdown ring shows exactly when it erupts.',
    situation: 'Enemies come through a known gap on a known beat; land the blast as they step through.',
    coop: 'Sync with an ally: their freeze lands, your sigil erupts on the frozen pack one beat later.',
    source: 'Noita: timer trigger modifiers; Warcraft 3: Flame Strike; Into the Breach telegraphs',
    duration: 6,
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL, clamp } = g;
      const hx = 70, hy = 130, sx = 205, sy = 130, R = 30;
      const LAND = 1.1, BOOM = 4.1;
      g.wall(262, 10, 14, 98); g.wall(262, 152, 14, 98);

      // Cast: orb lobs from staff into the ground.
      const cast = seg(t, 0.4, 0.8) * (1 - seg(t, 0.85, 1.1));
      g.cursor(sx, sy, { alpha: 0.8 * seg(t, 0.2, 0.4) * (1 - seg(t, 1.0, 1.3)) });
      const fp = seg(t, 0.8, LAND);
      if (fp > 0 && fp < 1) {
        const x = lerp(hx + 20, sx, fp), y = lerp(hy, sy, fp) - Math.sin(fp * Math.PI) * 30;
        g.orb(x, y, 4, EL.fire);
      }

      // Sigil with countdown, then eruption.
      const age = t - BOOM;
      if (t >= LAND && t < BOOM) {
        const remain = 1 - seg(t, LAND, BOOM);
        const urgency = seg(t, BOOM - 1, BOOM);
        g.rune(sx, sy, R - 6, { color: EL.fire, alpha: 0.7, spin: 0.4, armed: 0.4 + urgency * 0.6 * (0.5 + 0.5 * Math.sin(t * 30)) });
        countdown(g, sx, sy, R + 2, remain, g.mix('#ffd166', '#ff5d73', urgency), seg(t, LAND, LAND + 0.2));
        const n = Math.ceil(remain * 3);
        g.label(String(n), sx, sy - R - 14, { color: g.mix('#ffd166', '#ff5d73', urgency), size: 11 });
        g.burst(sx, sy, t - LAND, { seed: 4, count: 14, color: EL.fire, speed: 70, life: 0.4, size: 2 });
      }
      scorch(g, sx, sy, R + 4, age > 0 ? 1 - seg(t, 5.0, 5.8) : 0);
      if (age >= 0 && age < 1.2) {
        // fire pillar: rising flames + blast
        g.flames(sx, sy, R * 0.8, R * 0.6, { count: 26, size: 7, amount: 1 - seg(age, 0.4, 1.1) });
        g.explosion(sx, sy, age, { color: EL.fire, r: R + 12, count: 34, seed: 9 });
        g.burst(sx, sy, age, { seed: 5, count: 24, colors: [EL.fire, '#ffd166'], speed: 140, life: 0.9, size: 3.5, dir: -Math.PI / 2, spread: 0.9 });
      }

      // A single file of enemies marching left through the gap.
      const ys = [126, 135, 128, 131, 127];
      for (let i = 0; i < 5; i++) {
        const v = 72, x0 = 420 + i * 22;
        const walkX = (tt) => x0 - v * Math.max(0, tt - 1.0);
        let x = walkX(Math.min(t, BOOM));
        const inside = i < 3;
        let dead = 0, hit = 0;
        if (t > BOOM) {
          if (inside) { hit = Math.max(0, 1 - age * 3); dead = seg(t, BOOM + 0.15, BOOM + 0.5); }
          else { x += 26 * ease.out(seg(t, BOOM, BOOM + 0.4)); hit = Math.max(0, 0.6 - age * 2); }
        }
        if (x > 410) continue;
        const bob = t < BOOM ? Math.abs(Math.sin(t * 9 + i)) * 2 : 0;
        g.enemy(x, ys[i] - bob, { r: 9, facing: t > BOOM && !inside ? Math.PI * 0 : Math.PI, hit, dead, status: !inside && age > 0.2 ? 'stunned' : [] });
      }

      g.wizard(hx, hy, { facing: g.angle(hx, hy, sx, sy), tip: EL.fire, casting: cast });
    },
  });

  // ------------------------------------------------------------------ 3
  SG.register({
    id: 'spell-quiver',
    name: 'Spell Quiver',
    family: 'offense',
    status: 'new',
    oneLiner: 'Load the same spell into your staff again and again in calm moments, then fire every copy at once.',
    situation: 'A big brute appears after a lull; dump six stored bolts in one alpha strike.',
    coop: 'Two loaded quivers released on a shared call melt a boss during its guard window.',
    source: "Noita: wand loading and multicast; Dota 2: Invoker's banked spells",
    duration: 6,
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL, clamp } = g;
      const hx = 70, hy = 130, N = 6, FIRE = 3.6;
      const bx = 305, by = 130;
      const loadAt = (i) => 0.55 + i * 0.35;
      // staff tip (matches g.wizard geometry for facing 0)
      const tipX = hx + Math.cos(0.5) * 6 + 16, tipY = hy + Math.sin(0.5) * 6;

      // Brute lumbers in after the lull.
      const bp = ease.out(seg(t, 2.7, 3.4));
      const firstHit = FIRE + 0.5;
      const hits = Array.from({ length: N }, (_, i) => FIRE + i * 0.08 + 0.5);
      const nHit = hits.filter((h) => t >= h).length;
      const lastAge = nHit ? t - hits[nHit - 1] : -1;
      const dead = seg(t, hits[N - 1] + 0.15, hits[N - 1] + 0.5);
      g.enemy(lerp(430, bx, bp), by, { r: 24, color: g.ACTOR.brute, facing: Math.PI, hp: 1 - nHit / N, hit: lastAge >= 0 ? Math.max(0, 1 - lastAge * 4) : 0, dead });
      if (t > hits[N - 1]) g.explosion(bx, by, t - hits[N - 1], { color: EL.lightning, r: 36, seed: 21 });

      // Hero: a small cast pulse per load, a big one on release.
      let cast = 0;
      for (let i = 0; i < N; i++) cast = Math.max(cast, 1 - Math.abs(t - loadAt(i)) / 0.12);
      cast = Math.max(0, cast * 0.6, 1 - Math.abs(t - FIRE) / 0.25);
      g.wizard(hx, hy, { facing: 0, tip: EL.lightning, casting: cast });

      // Loaded pips orbit the staff tip.
      for (let i = 0; i < N; i++) {
        const la = t - loadAt(i);
        const launch = FIRE + i * 0.08;
        if (la < 0) continue;
        const an = i / N * TAU + t * 3;
        const px = tipX + Math.cos(an) * 12, py = tipY + Math.sin(an) * 12;
        if (t < launch) {
          const pop = ease.back(clamp(la / 0.2));
          g.orb(px, py, 3 * pop, EL.lightning);
          if (la < 0.3) g.ring(px, py, 3 + la * 30, { color: '#ffffff', alpha: 1 - la / 0.3, width: 1 });
        } else if (t < hits[i]) {
          // fly in a fan that converges on the brute
          const fn = (tt) => {
            const q = ease.in(seg(tt, launch, hits[i]));
            const off = (i - (N - 1) / 2) * 22;
            const cx = (tipX + bx) / 2, cy = by + off * 2.2;
            const x = (1 - q) * (1 - q) * px + 2 * (1 - q) * q * cx + q * q * (bx - 18);
            const y = (1 - q) * (1 - q) * py + 2 * (1 - q) * q * cy + q * q * (by + off * 0.3);
            return [x, y];
          };
          g.trail(fn, { color: EL.lightning, len: 0.12, width: 3, from: launch });
          const [x, y] = fn(t);
          g.orb(x, y, 3.2, EL.lightning);
        }
      }
      // spark at each impact
      for (let i = 0; i < N; i++) g.burst(bx - 18, by + (i - 2.5) * 6.6, t - hits[i], { seed: 30 + i, count: 8, color: EL.lightning, speed: 70, life: 0.35, size: 2 });

      // Counter: x1 .. x6 while loading.
      const loaded = [0, 1, 2, 3, 4, 5].filter((i) => t >= loadAt(i)).length;
      if (loaded && t < FIRE + 0.1) g.label('x' + loaded, hx, hy - 28, { color: EL.lightning, size: 10 });
      if (t >= FIRE && t < firstHit + 0.6) g.label('fire all!', hx, hy - 28, { color: '#ffd166', alpha: 1 - seg(t, firstHit + 0.3, firstHit + 0.6) });
    },
  });

  // ------------------------------------------------------------------ 4
  SG.register({
    id: 'payload-effigy',
    name: 'Payload Effigy',
    family: 'summon',
    status: 'new',
    oneLiner: "Raise a straw effigy enemies can't resist. Seal a spell inside; it goes off when they break it.",
    situation: 'An ally is downed in the open; the effigy pulls the pack away, then punishes them.',
    coop: 'One player builds the effigy, another seals their spell inside. The bait is a joint trap.',
    source: 'Path of Exile: Decoy Totem with Cast on Death; Orcs Must Die: decoys',
    duration: 6.2,
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL, clamp } = g;
      const hx = 70, hy = 95, ax = 105, ay = 200, fx = 285, fy = 95;
      const RISE = 0.9, SEAL = 1.35, LURE = 1.7, BREAK = 3.5;

      // Downed ally, revived at the end.
      const revive = seg(t, 5.0, 5.4);
      g.wizard(ax, ay, { color: g.mix(g.mix(g.ACTOR.ally, '#77708a', 0.6), g.ACTOR.ally, revive), facing: Math.PI * 0.75 - revive * 0.9, alpha: 0.75 + revive * 0.25 });
      if (t < 4.6) g.label('downed', ax, ay - 20, { alpha: 0.85 * (1 - seg(t, 4.3, 4.6)), color: '#ff9aa8' });
      if (t > 4.9) g.burst(ax, ay, t - 4.9, { seed: 8, count: 16, color: EL.life, speed: 50, life: 0.7, size: 2.2 });
      if (revive > 0) g.glow(ax, ay, 24, EL.life, 0.5 * (1 - seg(t, 5.4, 5.9)));

      // Effigy appears, gets a spell sealed in, then is battered.
      const brk = t >= BREAK;
      const rise = ease.back(seg(t, RISE, RISE + 0.35));
      const blows = pulses(g, t, 2.6, BREAK, 4);
      if (!brk && rise > 0) {
        effigy(g, fx, fy, { scale: rise * 1.35, sealed: seg(t, SEAL + 0.25, SEAL + 0.45), shake: blows, hp: t > 2.6 ? 1 - seg(t, 2.6, BREAK) : null });
      }
      // frost orb sinking into it
      const sp = seg(t, SEAL - 0.25, SEAL + 0.25);
      if (sp > 0 && sp < 1) g.orb(lerp(hx + 20, fx, sp), lerp(hy, fy, sp) - Math.sin(sp * Math.PI) * 26, 4, EL.cold);
      if (t > SEAL + 0.2 && t < LURE + 0.6) g.label('frost inside', fx, fy - 32, { color: EL.cold, alpha: seg(t, SEAL + 0.2, SEAL + 0.4) * (1 - seg(t, LURE + 0.4, LURE + 0.6)) });

      // Enemies: head for the downed ally, then turn to the effigy.
      const starts = [[400, 175], [410, 215], [395, 130], [420, 245]];
      const ring = [[fx + 26, fy + 6], [fx + 6, fy + 28], [fx + 24, fy - 18], [fx - 20, fy + 20]];
      const age = t - BREAK;
      starts.forEach(([sx, sy], i) => {
        const p1 = seg(t, 0.2, LURE);
        const mid = [lerp(sx, ax, 0.32 * p1), lerp(sy, ay, 0.32 * p1)];
        const midEnd = [lerp(sx, ax, 0.32), lerp(sy, ay, 0.32)];
        let x, y, face;
        if (t < LURE) { [x, y] = mid; face = g.angle(sx, sy, ax, ay); }
        else {
          const q = ease.inOut(seg(t, LURE + i * 0.08, 2.6));
          x = lerp(midEnd[0], ring[i][0], q); y = lerp(midEnd[1], ring[i][1], q);
          face = g.angle(x, y, fx, fy);
          const l = pulses(g, t + i * 0.1, 2.6, BREAK, 4) * 5;
          x += Math.cos(face) * l; y += Math.sin(face) * l;
          if (t > LURE && t < 2.3) g.label('!', x, y - 16, { color: '#ffd166', alpha: 1 - seg(t, 2.0, 2.3) });
        }
        if (t > 0.3 && t < LURE) g.aim(x, y, ax, ay, { color: '#ff5d73', alpha: 0.35 });
        if (t >= LURE && t < 2.6) g.aim(x, y, fx, fy, { color: '#ffd166', alpha: 0.45 });
        const frozen = age > 0.12;
        g.enemy(x, y, { r: 9, facing: face, status: frozen ? 'frozen' : [], hit: age > 0 ? Math.max(0, 1 - age * 3) : 0 });
      });

      // Break: splinters + frost nova.
      if (brk && age < 1.2) {
        g.burst(fx, fy, age, { seed: 14, count: 20, colors: ['#d9b56a', '#7a5532', '#f0d58f'], speed: 110, life: 0.7, size: 2.6 });
        g.ring(fx, fy, 70 * ease.out(clamp(age / 0.45)), { color: EL.cold, width: 5 * (1 - clamp(age / 0.6)), alpha: 1 - clamp(age / 0.8) });
        g.glow(fx, fy, 60, EL.cold, 0.7 * (1 - clamp(age / 0.6)));
        g.burst(fx, fy, age, { seed: 15, count: 22, colors: [EL.cold, '#ffffff'], speed: 150, life: 0.6, size: 2.2 });
      }
      if (brk) g.rock(fx, fy + 2, 4, { color: '#d9b56a', rot: 0.4 });

      // Hero: casts the effigy, then runs to the ally.
      const [wx, wy] = walk(g, t, 3.9, 4.9, hx, hy, ax - 22, ay - 18, ease.inOut);
      const cast = seg(t, 0.5, RISE) * (1 - seg(t, SEAL + 0.25, SEAL + 0.5));
      const face = t < 3.9 ? g.angle(hx, hy, fx, fy) : g.angle(wx, wy, ax, ay);
      g.cursor(fx, fy, { alpha: 0.8 * seg(t, 0.3, 0.5) * (1 - seg(t, 1.0, 1.3)) });
      g.wizard(wx, wy, { facing: face, tip: t < SEAL + 0.4 ? EL.cold : EL.life, casting: cast + (t > 4.9 ? 1 - seg(t, 5.3, 5.7) : 0) });
    },
  });

  // ------------------------------------------------------------------ 5
  SG.register({
    id: 'marked-hound',
    name: 'Marked Hound',
    family: 'summon',
    status: 'new',
    oneLiner: 'A spectral hound waits at your heel until you mark a target. Then it pounces and pins.',
    situation: 'A caster hides behind a wall of brutes; send the hound over them to pin it.',
    coop: 'Allies see your mark too. You pin the target, they deliver the burst.',
    source: 'WoW: Hunter Kill Command; Diablo IV: commanded golem; Pikmin: targeted throw',
    duration: 6,
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL, clamp } = g;
      const hx = 70, hy = 130, heelX = 92, heelY = 150;
      const cx = 340, cy = 130, ax = 185, ay = 30;
      const MARK = 1.15, LEAP = 1.4, LAND = 2.15, ZAP = 2.7, DIE = 2.95;

      // Wall of brutes facing the hero.
      for (const by of [85, 130, 175]) g.enemy(230, by, { r: 21, color: g.ACTOR.brute, facing: Math.PI });

      // Caster: charging glow, marked, pinned, zapped.
      const age = t - ZAP;
      const deadC = seg(t, DIE, DIE + 0.35);
      const pinned = t >= LAND;
      if (deadC < 1) {
        if (!pinned) g.glow(cx - 10, cy, 9 + Math.sin(t * 10) * 2, g.ACTOR.imp, 0.8);
        g.enemy(cx, cy, { r: 10, color: g.ACTOR.imp, facing: Math.PI, hit: age > 0 ? Math.max(0, 1 - age * 3) : 0, status: pinned && age < 0 ? 'stunned' : (age > 0 ? 'shocked' : []), dead: deadC, hp: age > 0 ? 0.1 : (pinned ? 0.9 : 1) });
        chains(g, cx, cy, 15, seg(t, LAND, LAND + 0.15) * (1 - deadC));
      }
      mark(g, cx, cy, 16 + Math.sin(t * 6) * 1.5, ease.back(seg(t, MARK, MARK + 0.2)) * (1 - deadC));
      if (t >= MARK && t < LEAP + 0.3) g.label('mark', cx, cy - 30, { color: '#ff5d73', alpha: 1 - seg(t, LEAP, LEAP + 0.3) });
      g.explosion(cx, cy, age - 0.25, { color: EL.lightning, r: 24, seed: 3 });

      // Cursor glides to the caster and clicks.
      const cp = ease.inOut(seg(t, 0.5, MARK - 0.1));
      const cAlpha = seg(t, 0.4, 0.55) * (1 - seg(t, MARK + 0.4, MARK + 0.6));
      g.cursor(lerp(hx + 40, cx, cp), lerp(hy - 30, cy, cp), { alpha: 0.9 * cAlpha, color: t > MARK - 0.05 ? '#ff5d73' : '#ffffff' });
      if (t > MARK - 0.05) g.ring(cx, cy, (t - MARK) * 60, { color: '#ff5d73', alpha: Math.max(0, 1 - (t - MARK) * 4), width: 2 });

      // Hound: waits, leaps in an arc over the brutes, pins, fades, reforms at heel.
      const lp = seg(t, LEAP, LAND);
      let hdx, hdy, hf = 0, ha = 1, hs = 1, hh = 0;
      if (t < LEAP) { hdx = heelX; hdy = heelY + Math.sin(t * 4) * 1; hf = t > MARK ? 0 : -0.3; }
      else if (t < LAND) {
        const q = ease.inOut(lp);
        hdx = lerp(heelX, cx - 4, q); hdy = lerp(heelY, cy, q); hh = Math.sin(q * Math.PI) * 70; hs = 1 + hh / 90;
        hf = g.angle(heelX, heelY, cx, cy);
      } else { hdx = cx - 4; hdy = cy; hf = 0; ha = 1 - seg(t, 3.4, 3.8); }
      if (t >= LEAP && t < LAND) {
        g.shadow(hdx, hdy, 8 * (1 - hh / 140));
        g.trail((tt) => { const q = ease.inOut(seg(tt, LEAP, LAND)); return [lerp(heelX, cx - 4, q), lerp(heelY, cy, q) - Math.sin(q * Math.PI) * 70]; }, { color: '#8ff3ff', len: 0.2, width: 5, from: LEAP });
      }
      if (t >= LAND) g.burst(cx, cy, t - LAND, { seed: 5, count: 14, color: '#8ff3ff', speed: 70, life: 0.4, size: 2 });
      hound(g, hdx, hdy - hh, hf, { alpha: ha, scale: hs * 1.25 });
      if (t > 3.9) hound(g, heelX, heelY, 0, { alpha: seg(t, 3.9, 4.5), scale: 1.25 });
      if (t >= LAND && t < ZAP) g.label('pinned', cx, cy - 30, { color: '#d7dcea', alpha: seg(t, LAND, LAND + 0.15) });

      // Ally delivers the burst.
      const zapA = between(t, ZAP, ZAP + 0.35) ? 1 : 0;
      g.wizard(ax, ay, { color: g.ACTOR.ally, facing: g.angle(ax, ay, cx, cy), tip: EL.lightning, casting: seg(t, ZAP - 0.4, ZAP) * (1 - seg(t, ZAP + 0.35, ZAP + 0.6)) });
      if (zapA) g.bolt(ax + 16, ay + 8, cx, cy, { seed: Math.floor(t * 25), width: 2.5, jag: 9 });

      g.wizard(hx, hy, { facing: t < 2.5 ? g.angle(hx, hy, cx, cy) : 0, tip: '#8ff3ff', casting: seg(t, MARK - 0.2, MARK) * (1 - seg(t, MARK + 0.1, MARK + 0.4)) });
      function between(tt, a, b) { return tt >= a && tt < b; }
    },
  });

  // ------------------------------------------------------------------ 6
  SG.register({
    id: 'tripwire',
    name: 'Tripwire',
    family: 'preparation',
    status: 'new',
    oneLiner: 'String a glowing thread between two pillars. The first enemy through sets it off along its whole length.',
    situation: 'A narrow pass between pillars where waves funnel through.',
    coop: 'Your thread stays inert for allies, but their stray spells can snap it.',
    source: 'Orcs Must Die: tripwires and arrow walls; Hitman: remote setups',
    duration: 6,
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL, clamp } = g;
      const px = 220, p1 = 52, p2 = 208, hx = 105, hy = 130;
      const STRING = 0.75, TRIP = 3.85;
      const age = t - TRIP;

      // Thread: draws pillar to pillar, hums, explodes in lightning.
      const draw = seg(t, STRING, STRING + 0.6);
      const fade = age > 0 ? 1 - seg(t, TRIP + 0.35, TRIP + 0.7) : 1;
      if (draw > 0 && fade > 0) {
        const yEnd = lerp(p1 + 14, p2 - 14, draw);
        const allyNear = Math.max(0, 1 - Math.abs(t - 2.15) / 0.3);
        const a = (0.6 + 0.15 * Math.sin(t * 7)) * fade * (1 - allyNear * 0.5);
        g.beam(px, p1 + 14, px, yEnd, { color: EL.lightning, width: 2, alpha: a });
        if (age < 0) {
          // idle sparks travelling along it
          for (let i = 0; i < 3; i++) {
            const q = (t * 0.6 + i / 3) % 1, sy = lerp(p1 + 14, p2 - 14, q);
            if (sy < yEnd) g.glow(px, sy, 5, '#ffffff', 0.7 * fade);
          }
        } else {
          for (let i = 0; i < 4; i++) {
            const y1 = lerp(p1 + 14, p2 - 14, i / 4), y2 = lerp(p1 + 14, p2 - 14, (i + 1) / 4);
            g.bolt(px, y1, px, y2, { seed: Math.floor(t * 30) + i, width: 2.5, jag: 7, alpha: fade });
          }
        }
      }
      g.pillar(px, p1, 14); g.pillar(px, p2, 14);

      // Ally strolls through: nothing happens.
      const [lx, ly] = walk(g, t, 1.55, 2.75, 330, 165, 140, 185);
      const allyA = 1 - seg(t, 2.75, 3.1);
      if (t > 1.45 && allyA > 0) g.wizard(lx, ly, { color: g.ACTOR.ally, facing: Math.PI, alpha: seg(t, 1.45, 1.6) * allyA });
      if (t > 1.95 && t < 2.8) g.label('ally: safe', px, ly - 22, { color: g.ACTOR.ally, alpha: seg(t, 1.95, 2.1) * (1 - seg(t, 2.6, 2.8)) });

      // Enemy file arriving through the pass.
      const ens = [[0, 130, 0], [1, 108, 24], [2, 158, 28], [3, 133, 56], [4, 186, 92]];
      const v = 132;
      for (const [i, y, lag] of ens) {
        const xAt = (tt) => 420 + lag - v * Math.max(0, tt - 2.4);
        let x = Math.max(xAt(Math.min(t, TRIP)), px + 9);
        const reach = i < 3;           // within the arc range
        let hit = 0, dead = 0, st = [];
        if (age > 0) {
          if (reach) { hit = Math.max(0, 1 - age * 3); dead = seg(t, TRIP + 0.25, TRIP + 0.55); st = 'shocked'; }
          else { x += 30 * ease.out(seg(t, TRIP, TRIP + 0.4)); st = age > 0.3 ? 'stunned' : []; }
          if (reach && age < 0.3) g.bolt(px, y, x, y, { seed: i + Math.floor(t * 30), width: 1.6, jag: 5 });
        }
        if (x > 410) continue;
        g.enemy(x, y, { r: 9, facing: Math.PI, hit, dead, status: st });
      }
      if (age > 0) g.glow(px, 130, 70, EL.lightning, 0.6 * (1 - clamp(age / 0.5)));
      if (age > 0 && age < 0.8) g.label('snap!', px, 30, { color: EL.lightning, alpha: 1 - seg(age, 0.5, 0.8) });

      // Hero strings the wire.
      const cast = seg(t, 0.35, STRING) * (1 - seg(t, STRING + 0.6, STRING + 0.9));
      g.wizard(hx, hy, { facing: g.angle(hx, hy, px, lerp(p1, p2, draw)), tip: EL.lightning, casting: cast });
      if (cast > 0.2 && draw < 1) g.aim(hx + 18, hy, px, lerp(p1 + 14, p2 - 14, draw), { color: EL.lightning, alpha: 0.5 });
    },
  });

  // ------------------------------------------------------------------ 7
  SG.register({
    id: 'detonation-lattice',
    name: 'Detonation Lattice',
    family: 'preparation',
    status: 'new',
    oneLiner: 'Seed inert runes anywhere. Nothing happens until you speak the word, then they all go off at once.',
    situation: 'A huge wave crowds into a killbox; wait for peak density, then detonate everything.',
    coop: 'Runes never trigger on touch, so allies walk the field safely until you call it.',
    source: 'Dota 2: Techies Remote Mines; Path of Exile: mines with Detonate Mines',
    duration: 6.5,
    floor: 'sand',
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL, clamp } = g;
      const hx = 55, hy = 130, WORD = 4.35, BOOM = 4.6;
      const runes = [[210, 85], [250, 135], [210, 185], [300, 100], [300, 170]];
      const throwAt = (i) => 0.45 + i * 0.22;
      const age = t - BOOM;

      // Scorch marks after.
      runes.forEach(([x, y]) => scorch(g, x, y, 30, age > 0 ? 1 - seg(t, 5.6, 6.3) : 0));

      // Runes: tossed in, sit dull and inert, flash on the word.
      runes.forEach(([x, y], i) => {
        const ta = throwAt(i), land = ta + 0.35;
        const fp = seg(t, ta, land);
        if (fp > 0 && fp < 1) g.orb(lerp(hx + 18, x, fp), lerp(hy, y, fp) - Math.sin(fp * Math.PI) * 40, 2.6, '#c9c2d8');
        if (t >= land && t < BOOM) {
          const flash = seg(t, WORD, BOOM);
          const thunk = ease.out(clamp((t - land) / 0.15));
          g.rune(x, y, 13 * thunk, { color: flash > 0 ? g.mix('#a7a0b8', '#ff5d73', flash) : '#a7a0b8', alpha: 0.55 + flash * 0.45, spin: flash > 0 ? 6 : 0, armed: flash });
          if (t - land < 0.3) g.ring(x, y, 13 + (t - land) * 40, { color: '#c9c2d8', alpha: 1 - (t - land) / 0.3, width: 1 });
        }
        if (age >= 0) {
          g.explosion(x, y, age - i * 0.03, { color: EL.fire, r: 34, seed: 40 + i, count: 22 });
          if (age < 0.6) g.flames(x, y, 18, 14, { count: 10, amount: 1 - age / 0.6 });
        }
      });

      // Ally strolls across the field unharmed.
      const [lx, ly] = walk(g, t, 1.4, 2.9, 185, 245, 335, 20);
      const la = seg(t, 1.3, 1.45) * (1 - seg(t, 2.8, 3.0));
      if (la > 0) g.wizard(lx, ly, { color: g.ACTOR.ally, facing: g.angle(185, 245, 335, 20), alpha: la });
      if (t > 1.8 && t < 2.8) g.label('inert', 250, 112, { color: '#c9c2d8', alpha: seg(t, 1.8, 1.95) * (1 - seg(t, 2.6, 2.8)) });

      // The crowd floods in, standing right on the runes. Nothing happens.
      const spots = [[228, 102], [268, 118], [238, 158], [196, 168], [288, 122], [318, 150], [282, 186], [326, 92], [196, 70]];
      spots.forEach(([x1, y1], i) => {
        const [x, y] = walk(g, t, 2.6 + i * 0.09, 3.9 + i * 0.07, 430 + (i % 3) * 14, y1, x1, y1, ease.out);
        const d = Math.min(...runes.map(([rx, ry]) => g.dist(rx, ry, x1, y1)));
        const ha = age - d / 300;
        g.enemy(x, y, { r: 9, color: i % 4 === 3 ? g.ACTOR.brute : g.ACTOR.enemy, facing: Math.PI, hit: ha > 0 ? Math.max(0, 1 - ha * 3) : 0, dead: seg(ha, 0.12, 0.45) });
      });

      // The command word.
      const raise = seg(t, WORD - 0.25, WORD) * (1 - seg(t, BOOM + 0.4, BOOM + 0.7));
      g.wizard(hx, hy, { facing: t < 2 ? 0 : -Math.PI / 2 * raise, tip: raise > 0 ? '#ff5d73' : '#c9c2d8', casting: Math.max(raise, ...runes.map((_, i) => 1 - Math.abs(t - throwAt(i)) / 0.12).map((v) => v * 0.5)) });
      if (t > WORD - 0.1 && t < BOOM + 0.8) g.label('"Detonate!"', hx + 10, hy - 30, { color: '#ff5d73', size: 10, alpha: 1 - seg(t, BOOM + 0.5, BOOM + 0.8) });
      if (t >= WORD && t < BOOM) runes.forEach(([x, y]) => g.aim(hx, hy - 10, x, y, { color: '#ff5d73', alpha: 0.35 }));
    },
  });

  // ------------------------------------------------------------------ 8
  SG.register({
    id: 'shatter-bulwark',
    name: 'Shatter Bulwark',
    family: 'control',
    status: 'new',
    oneLiner: "Raise a wall during the calm. When it's overrun, burst it outward into a storm of stone shards.",
    situation: 'A barricade is about to break under a horde; turn its collapse into your attack.',
    coop: 'The wall shelters allies first; burst it only when they are clear. Shards hit anyone.',
    source: 'Dungeon Defenders: barricades; Magicka: rock walls; original twist (wall as stored shrapnel)',
    duration: 6,
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL, clamp } = g;
      const hx = 75, hy = 135, wx = 180, wy = 70, ww = 16, wh = 125;
      const RAISE = 0.6, BURST = 3.55;
      const age = t - BURST;

      // Wall rises, cracks under the pile, then bursts.
      const grow = ease.back(seg(t, RAISE, RAISE + 0.45));
      if (t < BURST && grow > 0) {
        const h = wh * Math.min(1, grow), cy = wy + wh / 2;
        const shake = pulses(g, t, 2.3, BURST, 6) * seg(t, 2.3, 3.0);
        g.wall(wx + Math.sin(t * 50) * shake * 1.5, cy - h / 2, ww, h, { color: '#8a7f6e' });
        // cracks grow with damage
        const dmg = seg(t, 2.2, BURST - 0.1);
        ctx.save(); ctx.strokeStyle = 'rgba(25,15,10,0.85)'; ctx.lineWidth = 1.3;
        const nCr = Math.floor(dmg * 6);
        for (let i = 0; i < nCr; i++) {
          const y0 = wy + 12 + g.rand(i, 7) * (wh - 24);
          ctx.beginPath(); ctx.moveTo(wx + ww, y0);
          ctx.lineTo(wx + ww * 0.55, y0 + (g.rand(i, 8) - 0.5) * 10);
          ctx.lineTo(wx + ww * 0.2, y0 + (g.rand(i, 9) - 0.5) * 16);
          ctx.stroke();
        }
        ctx.restore();
        if (t > RAISE && t < RAISE + 0.6) g.burst(wx + ww / 2, cy, t - RAISE, { seed: 2, count: 18, color: EL.earth, speed: 90, life: 0.5, size: 2.4 });
        if (dmg > 0.7) g.glow(wx + ww / 2, cy, 40, EL.earth, 0.5 * seg(t, BURST - 0.5, BURST) * (0.6 + 0.4 * Math.sin(t * 30)));
      }
      // rubble left behind
      if (age > 0) {
        for (let i = 0; i < 9; i++) g.rock(wx + 4 + g.rand(i, 3) * 14, wy + 6 + i * 14 + g.rand(i, 4) * 6, 2.5 + g.rand(i, 5) * 2, { color: '#8a7f6e', rot: i });
      }

      // Horde piles against the wall.
      const slots = [[204, 88], [206, 120], [204, 154], [206, 182], [226, 104], [228, 140], [230, 172]];
      slots.forEach(([x1, y1], i) => {
        let [x, y] = walk(g, t, 1.2 + i * 0.12, 2.3 + i * 0.1, 430, y1 + (g.rand(i, 2) - 0.5) * 30, x1, y1, ease.out);
        x -= pulses(g, t + i * 0.13, 2.4, BURST, 5) * 3;
        let hit = 0, dead = 0, st = [];
        if (age > 0) {
          const k = ease.out(seg(t, BURST, BURST + 0.45));
          const push = (i === 6 ? 90 : 140) - (i % 2) * 20;
          x += push * k; y += (y1 - 135) * 0.3 * k;
          hit = Math.max(0, 1 - age * 3);
          if (i !== 6) dead = seg(t, BURST + 0.3, BURST + 0.6); else st = age > 0.4 ? 'stunned' : [];
        }
        g.enemy(x, y, { r: 9.5, color: i % 3 === 1 ? g.ACTOR.brute : g.ACTOR.enemy, facing: Math.PI, hit, dead, status: st });
      });

      // Stone shards burst outward in a cone.
      if (age > 0 && age < 0.9) {
        for (let i = 0; i < 26; i++) {
          const sy = wy + g.rand(i, 1) * wh, an = (g.rand(i, 2) - 0.5) * 1.1 + (sy - 132) * 0.004;
          const sp = 380 * (0.55 + g.rand(i, 3) * 0.45), d = sp * age * (1 - age * 0.45);
          const x = wx + ww / 2 + Math.cos(an) * d, y = sy + Math.sin(an) * d;
          if (x > 395) continue;
          ctx.save(); ctx.globalAlpha = 1 - seg(age, 0.6, 0.9); g.rock(x, y, 3 + g.rand(i, 4) * 3, { color: '#a89a84', rot: age * 12 + i }); ctx.restore();
        }
        g.burst(wx + ww / 2, 132, age, { seed: 6, count: 20, color: '#c8bba4', speed: 160, life: 0.6, size: 3, dir: 0, spread: 1.6 });
        g.glow(wx + 20, 132, 80, EL.earth, 0.6 * (1 - clamp(age / 0.4)));
      }

      // Ally shelters behind the wall.
      g.wizard(130, 82, { color: g.ACTOR.ally, facing: 0 });
      // Hero raises, then snaps the wall.
      const cast = Math.max(seg(t, 0.25, RAISE) * (1 - seg(t, RAISE + 0.3, RAISE + 0.6)), seg(t, BURST - 0.4, BURST) * (1 - seg(t, BURST + 0.3, BURST + 0.6)));
      g.wizard(hx, hy, { facing: 0, tip: EL.earth, casting: cast });
      if (t > BURST - 0.35 && t < BURST + 0.6) g.label('burst!', hx, hy - 28, { color: EL.earth, alpha: 1 - seg(t, BURST + 0.3, BURST + 0.6) });
    },
  });
})();
