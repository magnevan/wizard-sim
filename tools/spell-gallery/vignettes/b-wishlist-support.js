// Wishlist support set: ward toss, yank, prism, sustained circle, grand ritual, ethereal shift.
(function () {
  // ---------- local helpers ----------
  // Point along a lobbed arc: ground position plus a height that peaks mid-flight.
  function lob(x1, y1, x2, y2, p, h) {
    const gx = x1 + (x2 - x1) * p, gy = y1 + (y2 - y1) * p;
    return [gx, gy - Math.sin(Math.PI * p) * h, gx, gy];
  }
  // Red danger telegraph on the ground: outline plus a fill that grows with p.
  function telegraph(g, x, y, r, p, a = 1) {
    if (p <= 0 || a <= 0) return;
    const { ctx } = g, c = '#ff5d73';
    ctx.save();
    ctx.fillStyle = g.hexA(c, 0.12 * a); ctx.beginPath(); ctx.arc(x, y, r, 0, g.TAU); ctx.fill();
    ctx.fillStyle = g.hexA(c, 0.28 * a); ctx.beginPath(); ctx.arc(x, y, r * g.clamp(p), 0, g.TAU); ctx.fill();
    ctx.strokeStyle = g.hexA(c, 0.85 * a); ctx.lineWidth = 1.6; ctx.setLineDash([6, 4]); ctx.lineDashOffset = -g.t * 15;
    ctx.beginPath(); ctx.arc(x, y, r, 0, g.TAU); ctx.stroke();
    ctx.restore();
  }
  // Last time (<= t) a repeating action fired, starting at t0, with interval chosen by fn(time).
  function lastFire(t, t0, intervalFn) {
    if (t < t0) return -99;
    let ft = t0;
    for (let i = 0; i < 60; i++) { const nx = ft + intervalFn(ft); if (nx > t) break; ft = nx; }
    return ft;
  }
  // A floating crystal prism. build 0..1 grows it in; power 0..1 brightens it.
  function prism(g, x, y, build, power, color) {
    if (build <= 0) return;
    const { ctx, TAU } = g, s = 13 * g.ease.back(g.clamp(build)), bob = Math.sin(g.t * 3) * 2;
    g.rune(x, y + 6, 20, { color: g.EL.arcane, alpha: 0.5 * build, spin: 0.8 });
    g.shadow(x, y + 6, 8 * build);
    if (power > 0) g.glow(x, y + bob, 30 + power * 12, color, 0.35 + power * 0.4);
    ctx.save(); ctx.translate(x, y - 6 + bob); ctx.rotate(Math.sin(g.t * 1.3) * 0.25);
    const pts = [[0, -s * 1.3], [s * 0.85, 0], [0, s * 1.1], [-s * 0.85, 0]];
    ctx.fillStyle = g.hexA(g.mix('#cfe8ff', color, power * 0.4), 0.85);
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.3; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.moveTo(0, -s * 1.3); ctx.lineTo(-s * 0.85, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = g.hexA('#7f9cc8', 0.8); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-s * 0.85, 0); ctx.lineTo(s * 0.85, 0); ctx.moveTo(0, -s * 1.3); ctx.lineTo(0, s * 1.1); ctx.stroke();
    ctx.restore();
  }
  // A ritual candle; lit 0..1, snuffed adds smoke.
  function candle(g, x, y, lit, o = {}) {
    const { ctx } = g;
    g.shadow(x, y + 4, 4);
    ctx.fillStyle = '#efe6cf'; ctx.fillRect(x - 3, y - 8, 6, 12);
    ctx.strokeStyle = 'rgba(30,18,10,0.7)'; ctx.lineWidth = 1; ctx.strokeRect(x - 3, y - 8, 6, 12);
    if (lit > 0) {
      const fl = 1 + Math.sin(g.t * 23 + x) * 0.15;
      g.glow(x, y - 12, 16 * lit, g.EL.fire, 0.7 * lit);
      ctx.fillStyle = g.hexA('#ffd166', lit);
      ctx.beginPath(); ctx.ellipse(x, y - 13, 2.6 * lit, 5 * lit * fl, 0, 0, g.TAU); ctx.fill();
      ctx.fillStyle = g.hexA('#ffffff', lit);
      ctx.beginPath(); ctx.arc(x, y - 12, 1.1 * lit, 0, g.TAU); ctx.fill();
    }
    if (o.smokeAge != null && o.smokeAge >= 0 && o.smokeAge < 1.6) {
      for (let i = 0; i < 6; i++) {
        const ph = (o.smokeAge * 0.8 + i * 0.17) % 1, a = (1 - ph) * (1 - o.smokeAge / 1.6);
        ctx.fillStyle = g.hexA('#9a94a8', a * 0.6);
        ctx.beginPath(); ctx.arc(x + Math.sin(ph * 6 + i) * 4, y - 12 - ph * 22, 2 + ph * 4, 0, g.TAU); ctx.fill();
      }
    }
  }
  // Brute's raised fist (drawn on top of the brute body).
  function fist(g, x, y, r) {
    const { ctx } = g;
    ctx.fillStyle = g.mix(g.ACTOR.brute, '#1a1030', 0.2);
    ctx.beginPath(); ctx.arc(x, y, r, 0, g.TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(20,10,30,0.8)'; ctx.lineWidth = 1.5; ctx.stroke();
  }

  // ---------- 1. Ward Toss ----------
  SG.register({
    id: 'ward-toss',
    name: 'Ward Toss',
    family: 'support',
    status: 'starred',
    oneLiner: 'Lob a shield bubble that lands on an ally, or on any spot you choose.',
    situation: 'A friend is pinned in the open and a volley is already on its way.',
    coop: 'You cover the frontliner from the back row so they can keep pushing.',
    source: 'Your wishlist',
    duration: 5,
    draw(g, t) {
      const { seg, ease, EL, ACTOR } = g;
      const hx = 70, hy = 190, ax = 240, ay = 120;
      const imps = [[355, 55], [362, 190]];
      const shots = [[1.75, 0], [1.95, 1], [2.2, 0], [2.45, 1], [2.75, 0]];
      const land = 1.55, wardEnd = 4.1;
      const wardA = 1 - seg(t, wardEnd - 0.4, wardEnd);

      // imps wind up and fire
      imps.forEach(([x, y], i) => {
        const charge = seg(t, 0.7, 1.7) * (1 - seg(t, 2.9, 3.3));
        if (charge > 0) g.glow(x - 12, y, 10 + charge * 6, EL.arcane, 0.5 * charge);
        g.aim(x - 12, y, ax, ay, { color: '#ff5d73', alpha: 0.5 * seg(t, 0.7, 1.0) * (1 - seg(t, 1.6, 1.8)) });
        g.enemy(x, y, { color: ACTOR.imp, r: 10, facing: g.angle(x, y, ax, ay) });
      });
      // the ally
      const flinch = seg(t, 1.5, 1.7) * (1 - seg(t, 3.0, 3.4));
      g.wizard(ax, ay, { color: ACTOR.ally, facing: g.lerp(Math.PI * 0.85, 0, flinch), label: t < 1.4 ? 'ally' : null });

      // the bubble
      if (t > land && wardA > 0) {
        const grow = ease.back(seg(t, land, land + 0.35));
        let hit = 0;
        for (const [st] of shots) { const age = t - (st + 0.35); if (age >= 0 && age < 0.3) hit = Math.max(hit, 1 - age / 0.3); }
        g.bubble(ax, ay, 24 * grow, { alpha: wardA, hit });
        g.burst(ax, ay + 6, t - land, { seed: 4, count: 16, color: EL.shield, speed: 70, life: 0.5, size: 2 });
      }
      // projectiles splash on the bubble
      for (const [st, w] of shots) {
        const [sx, sy] = imps[w];
        const a = g.angle(ax, ay, sx, sy), ix = ax + Math.cos(a) * 24, iy = ay + Math.sin(a) * 24;
        const p = seg(t, st, st + 0.35);
        if (p > 0 && p < 1) {
          const f = (tt) => { const q = seg(tt, st, st + 0.35); return [g.lerp(sx - 12, ix, q), g.lerp(sy, iy, q)]; };
          g.trail(f, { color: EL.arcane, len: 0.12, width: 3, from: st });
          const [x, y] = f(t); g.orb(x, y, 4.2, EL.arcane);
        }
        g.burst(ix, iy, t - st - 0.35, { seed: st * 10, count: 12, colors: [EL.arcane, EL.shield, '#ffffff'], speed: 70, life: 0.4, size: 2, dir: a, spread: 2.2 });
      }
      g.popup('blocked', ax, ay - 34, (t - 2.1) * 0.7, { color: EL.shield });

      // hero aims and lobs
      const cast = seg(t, 0.6, 1.0) * (1 - seg(t, 1.1, 1.4));
      g.wizard(hx, hy, { facing: g.angle(hx, hy, ax, ay), tip: EL.shield, casting: cast });
      const cp = ease.inOut(seg(t, 0.3, 0.9));
      const ca = seg(t, 0.2, 0.4) * (1 - seg(t, 1.7, 2.0));
      if (ca > 0) g.cursor(g.lerp(hx + 60, ax, cp), g.lerp(hy - 10, ay, cp), { alpha: 0.85 * ca });
      const lp = seg(t, 1.0, land);
      if (lp > 0 && lp < 1) {
        const f = (tt) => lob(hx + 10, hy - 8, ax, ay, seg(tt, 1.0, land), 75);
        const [x, y, sx, sy] = f(t);
        g.shadow(sx, sy, 4);
        g.trail((tt) => f(tt).slice(0, 2), { color: EL.shield, len: 0.18, width: 4, from: 1.0 });
        g.orb(x, y, 5, EL.shield);
      }
    },
  });

  // ---------- 2. Yank ----------
  SG.register({
    id: 'yank',
    name: 'Yank',
    family: 'movement',
    status: 'starred',
    oneLiner: 'Snap a tether onto an ally and pull them to your side.',
    situation: 'A friend is surrounded, or standing right where something huge is about to land.',
    coop: 'Rescue the reckless one. Or yank them across a gap they could not cross alone.',
    source: 'Your wishlist, a cousin of Magicka\'s Teleport',
    duration: 5,
    draw(g, t) {
      const { seg, ease, EL, ACTOR, ctx } = g;
      const hx = 70, hy = 135, ax0 = 275, ay0 = 125, ax1 = 112, ay1 = 132;
      const snap = 1.45, pull0 = 1.6, pull1 = 2.15, impact = 2.7;
      const pp = ease.inOut(seg(t, pull0, pull1));
      const ax = g.lerp(ax0, ax1, pp), ay = g.lerp(ay0, ay1, pp) - Math.sin(Math.PI * pp) * 10;

      // telegraph and falling boulder
      const tp = seg(t, 0.4, impact);
      telegraph(g, ax0, ay0, 46, tp, 1 - seg(t, impact, impact + 0.1));
      const foes = [[248, 92], [312, 108], [300, 160], [242, 160]];
      const crushed = t > impact;
      foes.forEach(([x, y], i) => {
        const f = g.angle(x, y, ax, ay);
        g.enemy(x, y, { r: 10, facing: crushed ? g.angle(x, y, ax0, ay0) : f, dead: seg(t, impact, impact + 0.35), hit: crushed ? 1 : 0 });
      });
      // dust trail of the pull
      if (t > pull0 && t < pull1 + 0.5) g.burst(ax, ay + 6, (t - pull0) % 0.2, { seed: Math.floor((t - pull0) / 0.2), count: 6, color: EL.earth, speed: 30, life: 0.3, size: 2 });

      // ally
      const scared = seg(t, 0.4, 0.8);
      g.wizard(ax, ay, { color: ACTOR.ally, facing: pp > 0 ? Math.PI : g.lerp(-0.3, Math.PI * 0.5, Math.sin(t * 9) * 0.5 + 0.5) * scared, label: t < 1.3 ? 'ally' : null });

      // hero + tether
      const cast = seg(t, 1.0, 1.3) * (1 - seg(t, pull1, pull1 + 0.3));
      g.wizard(hx, hy, { facing: g.angle(hx, hy, ax, ay), tip: EL.arcane, casting: cast });
      const ca = seg(t, 0.5, 0.7) * (1 - seg(t, snap, snap + 0.2));
      if (ca > 0) { const cp = ease.inOut(seg(t, 0.6, 1.1)); g.cursor(g.lerp(170, ax0, cp), g.lerp(80, ay0, cp), { alpha: ca }); }
      const shoot = seg(t, 1.2, snap), tetherA = 1 - seg(t, pull1 + 0.1, pull1 + 0.35);
      if (shoot > 0 && tetherA > 0) {
        const sx = hx + 20, sy = hy - 2;
        const ex = g.lerp(sx, ax, shoot), ey = g.lerp(sy, ay, shoot);
        // slack before snap, taut while pulling
        const slack = (1 - seg(t, snap, snap + 0.12)) * 12;
        ctx.save(); ctx.globalAlpha = tetherA; ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        for (const [w, c] of [[7, g.hexA(EL.arcane, 0.3)], [2.5, EL.arcane], [1, '#ffffff']]) {
          ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(sx, sy);
          ctx.quadraticCurveTo((sx + ex) / 2, (sy + ey) / 2 + slack, ex, ey); ctx.stroke();
        }
        ctx.restore();
        g.orb(ex, ey, 3, EL.arcane, { alpha: tetherA });
      }
      if (t > snap) g.ring(ax0, ay0, 10 + (t - snap) * 50, { color: EL.arcane, alpha: Math.max(0, 1 - (t - snap) * 3), width: 2 });

      // boulder falls, smashes the crowd
      const fall = seg(t, impact - 0.45, impact);
      if (fall > 0 && fall < 1) {
        const r = 14 + fall * 10;
        g.shadow(ax0, ay0, 8 + fall * 14);
        g.rock(ax0, ay0 - (1 - ease.in(fall)) * 140, r, { rot: t * 4 });
      }
      if (t > impact) {
        ctx.save(); ctx.globalAlpha = 1 - seg(t, 3.9, 4.4);
        g.rock(ax0, ay0, 22, { rot: 0.4 });
        ctx.restore();
        g.ring(ax0, ay0, 30 + seg(t, impact, impact + 0.5) * 30, { color: EL.earth, alpha: 1 - seg(t, impact, impact + 0.5), width: 4 });
        g.burst(ax0, ay0, t - impact, { seed: 7, count: 30, colors: [EL.earth, '#ffffff', '#8a7556'], speed: 140, life: 0.7, size: 3 });
      }
      g.popup('safe!', ax1, ay1 - 26, (t - impact - 0.2) * 0.7, { color: EL.life });
    },
  });

  // ---------- 3. Prism ----------
  SG.register({
    id: 'prism',
    name: 'Prism',
    family: 'support',
    status: 'starred',
    oneLiner: 'Place a floating prism. Beams fired into it come out stronger, and two beams merge into one.',
    situation: 'A lull before a big push. Build it, then fight around it.',
    coop: 'Two players beam into it; the first caster steers the merged beam.',
    source: 'Your wishlist',
    duration: 7,
    draw(g, t) {
      const { seg, ease, EL, ACTOR } = g;
      const px = 185, py = 132, hx = 60, hy = 195, ax = 62, ay = 68;
      const merged = g.mix(EL.arcane, EL.water, 0.5);
      const build = seg(t, 0.55, 1.2);
      const hb0 = 1.5, join = 2.7, off = 5.6;
      const heroOn = t > hb0 && t < off, allyOn = t > join && t < off;
      const mp = seg(t, join, join + 0.3) * (allyOn ? 1 : 0);
      // beam steering angle out of the prism
      let ang = 0;
      if (t > 3.2) ang = g.lerp(0, -0.42, ease.inOut(seg(t, 3.2, 3.8)));
      if (t > 3.8) ang = g.lerp(-0.42, 0.45, ease.inOut(seg(t, 3.8, 4.9)));
      const foes = [
        { x: 340, y: 135, r: 17, color: ACTOR.brute, die: 3.0 },
        { x: 335, y: 66, r: 10, die: 3.75 },
        { x: 328, y: 203, r: 10, die: 4.85 },
      ];
      // enemies
      for (const e of foes) {
        let hp = 1;
        if (e.r > 12) hp = t < hb0 + 0.1 ? 1 : g.lerp(1, 0.55, seg(t, hb0 + 0.1, join)) * (1 - seg(t, join + 0.1, e.die));
        const hitNow = heroOn && Math.abs(g.angle(px, py, e.x, e.y) - ang) < 0.12 && t < e.die;
        g.enemy(e.x, e.y, { r: e.r, color: e.color, facing: Math.PI, hp: e.r > 12 ? hp : null, hit: hitNow ? 0.5 + Math.sin(t * 40) * 0.3 : 0, status: hitNow ? 'burning' : [], dead: seg(t, e.die, e.die + 0.35) });
        g.explosion(e.x, e.y, t - e.die, { color: heroOn ? merged : EL.arcane, r: e.r + 10, seed: e.y });
      }
      // beams in
      if (heroOn) g.beam(hx + 14, hy - 10, px, py - 6, { color: EL.arcane, width: 4 });
      if (allyOn) g.beam(ax + 14, ay + 8, px, py - 6, { color: EL.water, width: 4 * seg(t, join, join + 0.15) });
      // beam out: thicker, merged color after the ally joins
      if (heroOn) {
        const w = g.lerp(7, 14, mp), col = g.mix(EL.arcane, merged, mp), len = 230;
        g.beam(px + Math.cos(ang) * 10, py - 6 + Math.sin(ang) * 10, px + Math.cos(ang) * len, py - 6 + Math.sin(ang) * len, { color: col, width: w * seg(t, hb0, hb0 + 0.15) });
      }
      prism(g, px, py, build, heroOn ? 0.5 + mp * 0.5 : 0, heroOn ? g.mix(EL.arcane, merged, mp) : '#cfe8ff');
      if (t > join && t < join + 0.6) g.ring(px, py - 6, 14 + (t - join) * 80, { color: merged, alpha: 1 - (t - join) / 0.6, width: 3 });

      // casters
      const aimA = heroOn ? ang : 0;
      g.wizard(hx, hy, { facing: g.angle(hx, hy, px, py), tip: EL.arcane, casting: heroOn ? 1 : seg(t, 0.4, 0.8) * (1 - seg(t, 1.1, 1.4)), label: t > 3.1 && t < 5.2 ? 'steers' : null });
      g.wizard(ax, ay, { color: ACTOR.ally, facing: g.angle(ax, ay, px, py), tip: EL.water, casting: allyOn ? 1 : 0, label: t > 1.6 && t < 2.6 ? 'ally' : null });
      // hero cursor: first on the prism spot, then steering the beam
      if (t < 1.3) g.cursor(g.lerp(120, px, ease.inOut(seg(t, 0.2, 0.55))), py - 4, { alpha: seg(t, 0.15, 0.3) * (1 - seg(t, 1.0, 1.3)) });
      else if (heroOn) g.cursor(px + Math.cos(aimA) * 115, py - 6 + Math.sin(aimA) * 115, { alpha: 0.9 * seg(t, 2.9, 3.1) * (1 - seg(t, 5.0, 5.3)) });
      if (t > join + 0.2 && t < join + 1.4) g.label('merged', px + 40, py - 44, { color: merged, alpha: seg(t, join + 0.2, join + 0.4) * (1 - seg(t, join + 1.1, join + 1.4)) });
    },
  });

  // ---------- 4. Sustained Circle ----------
  SG.register({
    id: 'sustained-circle',
    name: 'Sustained Circle',
    family: 'support',
    status: 'starred',
    oneLiner: 'Channel a circle that hastes and protects every ally standing inside it.',
    situation: 'Your team holds a choke point and you want them fighting at full tilt.',
    coop: 'You stand still and keep it up; your friends do the damage.',
    source: 'Your wishlist',
    duration: 6,
    draw(g, t) {
      const { seg, ease, EL, ACTOR, ctx } = g;
      const cx = 200, cy = 132, R = 82;
      const on = seg(t, 0.7, 1.2) * (1 - seg(t, 5.2, 5.5));
      const inside = (x, y) => on > 0.5 && g.dist(x, y, cx, cy) < R;
      // circle
      if (on > 0) {
        g.zone(cx, cy, R * ease.out(on), { color: EL.shield, alpha: 0.16 * on, edge: 0.85 * on });
        for (let i = 0; i < 2; i++) { const ph = ((t - 0.7) * 0.9 + i * 0.5) % 1; if (t > 0.9) g.ring(cx, cy, 14 + ph * (R - 14), { color: EL.shield, alpha: (1 - ph) * 0.45 * on, width: 1.5 }); }
      }
      // hero, rooted and channeling at the center
      g.rune(cx, cy, 16, { color: EL.shield, alpha: 0.8 * on, spin: 1.2 });
      g.wizard(cx, cy, { facing: -Math.PI / 2, tip: EL.shield, casting: on });

      // allies: A holds right, B steps out to the left later
      const bOut = ease.inOut(seg(t, 3.5, 4.0));
      const allies = [
        { x: 248, y: 104, col: ACTOR.ally, foe: [345, 82] },
        { x: g.lerp(160, 92, bOut), y: g.lerp(165, 190, bOut), col: ACTOR.ally2, foe: [36, 150] },
      ];
      const foes = [[345, 82, 0], [36, 150, 1], [350, 190, 2]];
      foes.forEach(([x, y, i]) => g.enemy(x, y, { r: 11, color: i === 1 ? ACTOR.brute : ACTOR.enemy, facing: g.angle(x, y, cx, cy), hit: 0 }));
      allies.forEach((a, i) => {
        const buffed = (tt) => {
          const x = i === 1 ? g.lerp(160, 92, ease.inOut(seg(tt, 3.5, 4.0))) : a.x;
          const y = i === 1 ? g.lerp(165, 190, ease.inOut(seg(tt, 3.5, 4.0))) : a.y;
          return seg(tt, 0.7, 1.2) * (1 - seg(tt, 5.2, 5.5)) > 0.5 && g.dist(x, y, cx, cy) < R;
        };
        const b = buffed(t);
        const [fx, fy] = a.foe;
        const lf = lastFire(t, 0.3 + i * 0.2, (tt) => buffed(tt) ? 0.26 : 0.8);
        const age = t - lf;
        if (b) {
          g.glow(a.x, a.y, 18, EL.shield, 0.45);
          // haste streaks
          for (let k = 0; k < 3; k++) { const ph = (t * 3 + k / 3) % 1; ctx.strokeStyle = g.hexA(EL.shield, (1 - ph) * 0.8); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(a.x - 12 + k * 3, a.y + 12 - ph * 16); ctx.lineTo(a.x - 12 + k * 3, a.y + 6 - ph * 16); ctx.stroke(); }
        }
        g.wizard(a.x, a.y, { color: a.col, facing: g.angle(a.x, a.y, fx, fy), tip: EL.lightning, casting: age < 0.12 ? 1 : 0 });
        if (age < 0.12 && t < 5.4) g.bolt(a.x + Math.cos(g.angle(a.x, a.y, fx, fy)) * 18, a.y + Math.sin(g.angle(a.x, a.y, fx, fy)) * 18, fx, fy, { seed: Math.floor(lf * 10), width: 1.8 });
        g.burst(fx, fy, age, { seed: lf * 7, count: 8, color: EL.lightning, speed: 50, life: 0.25, size: 1.8 });
        // incoming hits: softened inside, full outside
        const hits = i === 0 ? [2.4, 4.6] : [2.6, 4.55];
        for (const ht of hits) {
          const ha = t - ht, src = i === 0 ? [350, 190] : [36, 150];
          const p = seg(t, ht - 0.35, ht);
          if (p > 0 && p < 1) g.rock(g.lerp(src[0], a.x, p), g.lerp(src[1], a.y, p) - Math.sin(Math.PI * p) * 20, 4, { rot: t * 8 });
          if (ha >= 0 && ha < 1) {
            const soft = buffed(ht);
            if (soft) g.bubble(a.x, a.y, 15, { alpha: 1 - ha * 2 > 0 ? 1 - ha * 2 : 0, hit: Math.max(0, 1 - ha * 4) });
            else g.glow(a.x, a.y, 20, '#ff5d73', Math.max(0, 0.9 - ha * 2));
            g.popup(soft ? '-2' : '-12', a.x + 6, a.y - 20, ha, { color: soft ? EL.shield : '#ff5d73', size: soft ? 9 : 11 });
          }
        }
      });
      if (on > 0.5 && t > 1.3 && t < 3.2) g.label('haste + ward', cx, cy - R - 8, { color: EL.shield, alpha: seg(t, 1.3, 1.5) * (1 - seg(t, 2.9, 3.2)) });
      if (t > 4.0 && t < 5.2) g.label('outside', allies[1].x, allies[1].y + 20, { alpha: seg(t, 4.0, 4.2) * (1 - seg(t, 5.0, 5.2)) });
    },
  });

  // ---------- 5. Grand Ritual ----------
  SG.register({
    id: 'grand-ritual',
    name: 'Grand Ritual',
    family: 'offense',
    status: 'starred',
    oneLiner: 'Root yourself and plant three candles. The finale is as strong as the candles left lit.',
    situation: 'A lull before a siege wave: time to set up a fight-ending strike.',
    coop: 'Allies guard you and the candles; every flame saved is shared credit.',
    source: 'Your wishlist, plus Warcraft 3 channeled ultimates (Starfall, Blizzard)',
    duration: 7,
    draw(g, t) {
      const { seg, ease, EL, ACTOR, ctx } = g;
      const cx = 200, cy = 128, full = 175, actual = 125, blast = 5.0;
      const cands = [[132, 70], [268, 70], [200, 212]];
      const snuff = 3.05;
      const litOf = (i) => seg(t, 0.4 + i * 0.25, 0.6 + i * 0.25) * (i === 2 ? 1 - seg(t, snuff, snuff + 0.1) : 1) * (1 - seg(t, blast + 0.1, blast + 0.4));
      const chan = seg(t, 1.1, blast) * (1 - seg(t, blast, blast + 0.1));

      // links candle -> caster
      cands.forEach(([x, y], i) => {
        const l = litOf(i);
        if (t > 0.5 && t < blast + 0.3) {
          ctx.save(); ctx.strokeStyle = l > 0.5 ? g.hexA(EL.fire, 0.35 + chan * 0.4) : 'rgba(40,30,60,0.6)'; ctx.lineWidth = l > 0.5 ? 2 : 1.5;
          ctx.setLineDash(l > 0.5 ? [] : [3, 4]); ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(cx, cy); ctx.stroke(); ctx.restore();
          if (l > 0.5 && chan > 0) { const ph = (t * 1.5 + i * 0.3) % 1; g.orb(g.lerp(x, cx, ph), g.lerp(y - 6, cy, ph), 2, EL.fire); }
        }
      });
      // ritual circle + power gauge
      g.rune(cx, cy, 30, { color: EL.fire, alpha: 0.5 + chan * 0.4, spin: 0.3 + chan * 2, armed: chan });
      if (chan > 0) {
        const nLit = cands.filter((_, i) => litOf(i) > 0.5).length;
        for (let i = 0; i < 3; i++) {
          const a0 = -Math.PI / 2 + i * g.TAU / 3 + 0.08, a1 = a0 + g.TAU / 3 - 0.16;
          ctx.save(); ctx.lineWidth = 4; ctx.lineCap = 'round';
          ctx.strokeStyle = i < nLit ? g.hexA('#ffd166', 0.9) : 'rgba(40,30,60,0.7)';
          ctx.beginPath(); ctx.arc(cx, cy, 38, a0, g.lerp(a0, a1, chan)); ctx.stroke(); ctx.restore();
        }
      }
      // candles
      cands.forEach(([x, y], i) => candle(g, x, y, litOf(i), { smokeAge: i === 2 ? t - snuff : null }));
      if (t > snuff && t < snuff + 1.3) g.label('snuffed', 200, 238, { color: '#ff5d73', alpha: 1 - seg(t, snuff + 1.0, snuff + 1.3) });

      // enemies
      const e1 = { x: g.lerp(12, 100, seg(t, 0.9, 2.2)), y: g.lerp(38, 62, seg(t, 0.9, 2.2)) };
      const e2p = seg(t, 1.3, snuff), e2q = seg(t, snuff + 0.2, blast);
      const e2 = { x: g.lerp(g.lerp(392, 218, e2p), 214, e2q), y: g.lerp(g.lerp(250, 218, e2p), 178, e2q) };
      const e3 = { x: g.lerp(395, 298, seg(t, 2.0, 4.8)), y: g.lerp(18, 66, seg(t, 2.0, 4.8)) };
      const e4 = { x: g.lerp(400, 362, seg(t, 2.4, 4.9)), y: g.lerp(236, 206, seg(t, 2.4, 4.9)) };
      const zap = 2.15;
      g.enemy(e1.x, e1.y, { r: 10, facing: 0.3, dead: seg(t, zap + 0.05, zap + 0.4), hit: t > zap ? 1 : 0 });
      const deadB = seg(t, blast + 0.15, blast + 0.5);
      g.enemy(e2.x, e2.y, { r: 10, facing: g.angle(e2.x, e2.y, cx, cy), dead: deadB, hit: t > blast ? 1 : 0 });
      g.enemy(e3.x, e3.y, { r: 10, facing: g.angle(e3.x, e3.y, cx, cy), dead: deadB, hit: t > blast ? 1 : 0 });
      g.enemy(e4.x, e4.y, { r: 10, facing: g.angle(e4.x, e4.y, cx, cy), status: t > blast + 0.3 ? 'stunned' : [] });

      // ally guard zaps e1
      const gx = 112, gy = 112;
      g.wizard(gx, gy, { color: ACTOR.ally, facing: t < 2.6 ? g.angle(gx, gy, e1.x, e1.y) : g.angle(gx, gy, e2.x, e2.y), tip: EL.lightning, casting: seg(t, 1.7, 2.05) * (1 - seg(t, 2.3, 2.5)) });
      if (t > zap - 0.05 && t < zap + 0.25) g.bolt(gx + 6, gy - 14, e1.x, e1.y, { width: 2.2 });
      g.explosion(e1.x, e1.y, t - zap, { color: EL.lightning, r: 16, seed: 2 });

      // caster
      g.wizard(cx, cy, { facing: -Math.PI / 2, tip: EL.fire, casting: chan, label: t > 0.5 && t < 1.4 ? 'rooted' : null });
      if (chan > 0) g.sparks(cx, cy - 22, { r: 8 + chan * 8, color: EL.fire, count: 2 });

      // finale: meteor shower inside the reduced radius; dashed ring shows the full size it could have been
      const fa = t - blast;
      if (fa > -0.6 && fa < 1.3) {
        g.ring(cx, cy, full, { color: '#ffffff', alpha: 0.35 * seg(fa, -0.6, -0.2) * (1 - seg(fa, 0.9, 1.3)), dash: [5, 6], width: 1.5 });
        const metas = [[300, 66], [214, 178], [158, 188], [258, 124], [236, 44]];
        metas.forEach(([mx, my], i) => {
          const at = i * 0.07, mp = seg(fa, -0.35 + at, at);
          if (mp > 0 && mp < 1) { const sx = mx + 70, sy = my - 160; g.trail((tt) => [g.lerp(sx, mx, seg(tt - blast, -0.35 + at, at)), g.lerp(sy, my, seg(tt - blast, -0.35 + at, at))], { color: EL.fire, len: 0.12, width: 5 }); g.orb(g.lerp(sx, mx, mp), g.lerp(sy, my, mp), 5, EL.fire); }
          g.explosion(mx, my, fa - at, { r: 28, seed: i + 5 });
        });
        g.glow(cx, cy, actual * ease.out(seg(fa, 0, 0.4)), EL.fire, 0.5 * (1 - seg(fa, 0.2, 1.0)));
        g.ring(cx, cy, actual * ease.out(seg(fa, 0, 0.4)), { color: EL.fire, alpha: 1 - seg(fa, 0.4, 1.1), width: 4 });
        if (fa > 0.1) g.label('2 / 3 power', cx, cy - 46, { color: '#ffd166', alpha: 1 - seg(fa, 1.0, 1.3) });
      }
    },
  });

  // ---------- 6. Ethereal Shift ----------
  SG.register({
    id: 'ethereal-shift',
    name: 'Ethereal Shift',
    family: 'enchant',
    status: 'user',
    oneLiner: 'Turn yourself or an ally ghostly: attacks pass through, but you cannot attack either.',
    situation: 'A big hit is coming and there is no time to dodge.',
    coop: 'Ghost the ally about to be crushed, then let them punish the whiff.',
    source: 'Your idea (enchantments: plane shift)',
    duration: 5.6,
    draw(g, t) {
      const { seg, ease, EL, ACTOR, ctx } = g;
      const hx = 70, hy = 190, ax = 228, ay = 128;
      const ghost0 = 1.95, ghost1 = 3.6, slam = 2.45, counter = 3.85;
      const ghost = seg(t, ghost0, ghost0 + 0.15) * (1 - seg(t, ghost1, ghost1 + 0.15));
      // brute: walks in, winds up, slams, staggers
      const bx = g.lerp(345, 290, ease.out(seg(t, 0.3, 1.2))), by = g.lerp(100, 116, seg(t, 0.3, 1.2));
      const wind = seg(t, 1.2, 2.2), down = seg(t, slam - 0.15, slam);
      const deadB = seg(t, counter + 0.6, counter + 1.0);
      telegraph(g, ax, ay, 30, seg(t, 1.2, slam), 1 - seg(t, slam, slam + 0.1));
      const sh = t > slam && t < slam + 0.3 ? Math.sin(t * 90) * 2 : 0;
      g.enemy(bx + sh, by, { r: 20, color: ACTOR.brute, facing: g.angle(bx, by, ax, ay), status: t > slam + 0.4 && t < counter + 0.6 ? 'stunned' : [], hit: t > counter + 0.3 ? Math.max(0, 1 - (t - counter - 0.3) * 2) : 0, hp: t > counter + 0.3 ? 0.1 : 1, dead: deadB });
      if (deadB < 1) {
        // fist: raised behind, then crashes onto the ally's spot
        const fa = g.angle(bx, by, ax, ay);
        const rx = bx + Math.cos(fa + 1.2) * 20, ry = by + Math.sin(fa + 1.2) * 20 - wind * 16;
        const fx = g.lerp(rx, ax + 4, ease.in(down)), fy = g.lerp(ry, ay - 2, ease.in(down));
        const back = seg(t, slam + 0.6, slam + 1.1);
        fist(g, g.lerp(fx, bx + Math.cos(fa) * 20, back), g.lerp(fy, by + Math.sin(fa) * 20, back), 8 + wind * 3);
      }
      if (t > slam) {
        g.ring(ax, ay, 12 + seg(t, slam, slam + 0.45) * 40, { color: EL.earth, alpha: 1 - seg(t, slam, slam + 0.45), width: 4 });
        g.burst(ax, ay, t - slam, { seed: 9, count: 22, colors: [EL.earth, '#ffffff'], speed: 110, life: 0.6, size: 2.5 });
      }
      g.popup('passes through', ax, ay - 30, (t - slam - 0.1) * 0.75, { color: EL.steam });

      // ally: solid -> ghost -> solid, then counterattacks
      ctx.save();
      if (ghost > 0) {
        g.glow(ax, ay, 22, EL.steam, 0.35 * ghost);
        for (let i = 0; i < 3; i++) { const ph = (t * 1.2 + i / 3) % 1; ctx.fillStyle = g.hexA(EL.steam, (1 - ph) * 0.5 * ghost); ctx.beginPath(); ctx.arc(ax + Math.sin(ph * 7 + i) * 8, ay - ph * 20, 2.5, 0, g.TAU); ctx.fill(); }
      }
      const wob = ghost * Math.sin(t * 9) * 2;
      if (ghost > 0) g.ring(ax + wob, ay, 13, { color: EL.steam, alpha: 0.8 * ghost, dash: [3, 3], width: 1.5 });
      g.wizard(ax + wob, ay, { color: g.mix(ACTOR.ally, EL.steam, ghost * 0.7), alpha: 1 - ghost * 0.6, facing: g.angle(ax, ay, bx, by), tip: t > counter - 0.2 ? EL.fire : null, casting: seg(t, counter - 0.2, counter) * (1 - seg(t, counter + 0.7, counter + 0.9)), label: t < 1.4 ? 'ally' : null });
      ctx.restore();
      if (ghost > 0.5 && t > 2.9 && t < ghost1) {
        g.label('can\'t attack', ax, ay + 24, { color: EL.steam, alpha: seg(t, 2.9, 3.05) });
      }
      if (t > ghost1 && t < ghost1 + 0.4) g.ring(ax, ay, 10 + (t - ghost1) * 50, { color: '#ffffff', alpha: 1 - (t - ghost1) / 0.4 });
      // counter: fire spray into the staggered brute
      if (t > counter && t < counter + 0.7) g.spray(ax + 14, ay - 2, g.angle(ax, ay, bx, by), { color: EL.fire, spread: 0.35, len: g.dist(ax, ay, bx, by), count: 30, size: 3.5 });
      g.explosion(bx, by, t - counter - 0.6, { r: 30, seed: 4 });

      // hero casts the shift
      const cast = seg(t, 1.35, 1.7) * (1 - seg(t, 1.9, 2.2));
      g.wizard(hx, hy, { facing: g.angle(hx, hy, ax, ay), tip: EL.steam, casting: cast });
      const ca = seg(t, 0.9, 1.1) * (1 - seg(t, ghost0, ghost0 + 0.2));
      if (ca > 0) g.cursor(ax, ay, { alpha: ca });
      const wp = seg(t, 1.6, ghost0);
      if (wp > 0 && wp < 1) {
        const f = (tt) => { const q = seg(tt, 1.6, ghost0); return [g.lerp(hx + 14, ax, q), g.lerp(hy - 8, ay, q) + Math.sin(q * 9) * 6]; };
        g.trail(f, { color: EL.steam, len: 0.2, width: 4, from: 1.6 });
        const [x, y] = f(t); g.orb(x, y, 4, EL.steam);
      }
      if (t > ghost0 && t < ghost0 + 0.4) g.ring(ax, ay, 10 + (t - ghost0) * 40, { color: EL.steam, alpha: 1 - (t - ghost0) / 0.4 });
    },
  });
})();
