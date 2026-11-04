// Research batch C: new offense / control / prep / movement shapes.
(function () {
  // ---------- local helpers ----------
  // Cubic bezier point.
  function bez(p, s) {
    const u = 1 - s;
    const a = u * u * u, b = 3 * u * u * s, c = 3 * u * s * s, d = s * s * s;
    return [a * p[0][0] + b * p[1][0] + c * p[2][0] + d * p[3][0], a * p[0][1] + b * p[1][1] + c * p[2][1] + d * p[3][1]];
  }
  // Screen shake offset that decays over `dur` seconds after an impact `age`.
  function shake(g, age, amp = 3, dur = 0.3) {
    if (age < 0 || age > dur) return;
    const k = amp * (1 - age / dur);
    g.ctx.translate(Math.sin(age * 90) * k, Math.cos(age * 70) * k);
  }
  // Soft smoke puffs that rise and fade, `age` seconds after spawning.
  function smoke(g, x, y, age, o = {}) {
    if (age < 0) return;
    const n = o.count || 7, life = o.life || 1.4;
    for (let i = 0; i < n; i++) {
      const p = age / (life * (0.7 + g.rand(o.seed || 1, i) * 0.3));
      if (p >= 1) continue;
      const a = g.rand(o.seed || 1, i, 2) * g.TAU, d = (o.r || 14) * (0.3 + p) * g.rand(o.seed || 1, i, 3);
      g.ctx.fillStyle = g.hexA(o.color || '#9a94a8', (1 - p) * 0.45);
      g.ctx.beginPath(); g.ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6 - p * 14, (o.size || 7) * (0.6 + p), 0, g.TAU); g.ctx.fill();
    }
  }
  // Ground scorch decal.
  function scorch(g, x, y, r, a) {
    if (a <= 0) return;
    g.ctx.fillStyle = `rgba(20,12,16,${0.5 * a})`;
    g.ctx.beginPath(); g.ctx.ellipse(x, y, r, r * 0.7, 0, 0, g.TAU); g.ctx.fill();
  }
  // A javelin: shaft from tail to tip with a bright head.
  function javelin(g, x1, y1, x2, y2, o = {}) {
    const { ctx } = g, a = o.alpha ?? 1;
    ctx.save(); ctx.globalAlpha = a; ctx.lineCap = 'round';
    ctx.strokeStyle = '#3a2416'; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = '#a77a4c'; ctx.lineWidth = 2.5; ctx.stroke();
    const ang = Math.atan2(y2 - y1, x2 - x1);
    ctx.fillStyle = '#e8e4f0'; ctx.beginPath();
    ctx.moveTo(x2 + Math.cos(ang) * 9, y2 + Math.sin(ang) * 9);
    ctx.lineTo(x2 + Math.cos(ang + 2.2) * 5, y2 + Math.sin(ang + 2.2) * 5);
    ctx.lineTo(x2 + Math.cos(ang - 2.2) * 5, y2 + Math.sin(ang - 2.2) * 5);
    ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(20,10,30,0.7)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    if (o.glow) g.glow(x2, y2, 10 + o.glow * 8, g.EL.earth, 0.6 * o.glow * a);
  }
  // A floating stone slab (rounded square). sink 0..1 lowers it into water.
  function slab(g, x, y, o = {}) {
    const { ctx } = g, sink = o.sink || 0, s = (o.scale || 1) * (1 - sink * 0.35), a = 1 - sink;
    if (a <= 0) return;
    const w = 30 * s, bob = Math.sin(g.t * 3 + x) * 1;
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(10,30,60,0.35)'; ctx.beginPath(); ctx.roundRect(x - w / 2 + 2, y - w / 2 + 4 + bob, w, w, 6); ctx.fill();
    ctx.fillStyle = '#8d869c'; ctx.beginPath(); ctx.roundRect(x - w / 2, y - w / 2 + bob, w, w, 6); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.roundRect(x - w / 2 + 3, y - w / 2 + 2 + bob, w - 6, w * 0.3, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(20,14,34,0.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(x - w / 2, y - w / 2 + bob, w, w, 6); ctx.stroke();
    ctx.strokeStyle = 'rgba(20,14,34,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - w * 0.2, y - w * 0.1 + bob); ctx.lineTo(x + w * 0.05, y + w * 0.15 + bob); ctx.lineTo(x + w * 0.25, y + w * 0.05 + bob); ctx.stroke();
    ctx.restore();
  }
  // Expanding ripple ring on water.
  function ripple(g, x, y, age, o = {}) {
    if (age < 0 || age > (o.life || 0.8)) return;
    const p = age / (o.life || 0.8);
    for (let k = 0; k < 2; k++) {
      const q = g.clamp(p - k * 0.25);
      if (q <= 0) continue;
      g.ctx.save(); g.ctx.strokeStyle = g.hexA('#e6f6ff', (1 - q) * 0.8); g.ctx.lineWidth = 1.5;
      g.ctx.beginPath(); g.ctx.ellipse(x, y, (o.r || 16) + q * 22, ((o.r || 16) + q * 22) * 0.6, 0, 0, g.TAU); g.ctx.stroke(); g.ctx.restore();
    }
  }

  // ---------- 1. Lobbed Shell ----------
  SG.register({
    id: 'lobbed-shell',
    name: 'Lobbed Shell',
    family: 'offense',
    status: 'new',
    oneLiner: 'Arc a heavy shell over walls and heads. A shadow on the ground marks where it lands.',
    situation: 'Enemies sheltering behind a wall, a shield-bearer, or your own frontline.',
    coop: 'Lob over a friend holding the line; the landing shadow tells them where not to stand.',
    source: 'Helldivers 2 mortar sentry and Worms-style artillery: indirect fire with visible flight time.',
    duration: 5.5,
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL, ACTOR } = g;
      const hx = 65, hy = 140, tx = 300, ty = 135;
      const fly0 = 1.4, fly1 = 2.7, hit = t - fly1;
      ctx.save(); shake(g, hit, 3.5, 0.35);
      scorch(g, tx, ty + 4, 30, hit > 0 ? 1 - seg(t, 4.3, 5.2) : 0);
      g.wall(198, 55, 16, 155);
      // landing marker + shadow
      const mark = seg(t, 0.7, 1.1) * (1 - seg(hit, 0, 0.1));
      if (mark > 0) {
        const p = seg(t, fly0, fly1);
        g.ring(tx, ty, 26, { color: EL.fire, alpha: 0.7 * mark, dash: [5, 4], width: 1.5 });
        ctx.fillStyle = `rgba(8,4,20,${(0.15 + 0.45 * p) * mark})`;
        ctx.beginPath(); ctx.ellipse(tx, ty + 3, 6 + 18 * p, (6 + 18 * p) * 0.55, 0, 0, g.TAU); ctx.fill();
      }
      // ally holding the line in front of the wall
      g.wizard(165, 128, { color: ACTOR.ally, facing: 0, tip: EL.shield, label: t < 2.4 ? 'ally' : null });
      g.bubble(178, 128, 16, { alpha: 0.6 });
      // enemies huddled behind the wall
      const foes = [[282, 117], [312, 133], [286, 153]];
      foes.forEach(([x, y], i) => {
        const a = g.angle(tx, ty, x, y), k = ease.out(seg(hit, 0, 0.35)) * 28;
        const hop = Math.sin(Math.PI * seg(hit, 0, 0.35)) * 8;
        g.enemy(x + Math.cos(a) * k, y + Math.sin(a) * k - hop, {
          r: 9, facing: Math.PI, hit: hit > 0 ? Math.max(0, 1 - hit * 3) : 0, hp: hit > 0 ? 0.25 : 1,
          status: hit > 0.2 && hit < 1.6 ? 'stunned' : [], dead: seg(t, 4.2 + i * 0.12, 4.7 + i * 0.12),
        });
        g.popup('-70', x + Math.cos(a) * k, y - 16 + Math.sin(a) * k, hit - 0.05 * i);
      });
      // hero
      g.wizard(hx, hy, { facing: -0.35, tip: EL.fire, casting: seg(t, 0.9, fly0) * (1 - seg(t, fly0, fly0 + 0.3)) });
      if (t > 0.6 && t < fly0 + 0.2) g.queue(hx, hy - 22, ['earth', 'fire']);
      // cursor glides to the target
      const ca = seg(t, 0.3, 0.6) * (1 - seg(t, fly0 + 0.2, fly0 + 0.5));
      if (ca > 0) { const cp = ease.inOut(seg(t, 0.4, 1.0)); g.cursor(lerp(230, tx, cp), lerp(80, ty, cp), { alpha: 0.9 * ca }); }
      // shell on its arc
      const p = seg(t, fly0, fly1);
      const at = (tt) => {
        const q = seg(tt, fly0, fly1), gx = lerp(hx + 14, tx, q), gy = lerp(hy - 6, ty, q), h = 4 * q * (1 - q) * 105;
        return [gx, gy - h, gy, h];
      };
      if (p > 0 && p < 1) {
        const [x, y, gy, h] = at(t);
        ctx.fillStyle = 'rgba(8,4,20,0.3)'; ctx.beginPath(); ctx.ellipse(x, gy + 3, 5, 2.5, 0, 0, g.TAU); ctx.fill();
        g.trail((tt) => at(tt).slice(0, 2), { color: '#c9c2d6', len: 0.3, width: 5, from: fly0 });
        const r = 5.5 + h / 105 * 6;
        g.glow(x, y, r * 2.2, EL.fire, 0.5);
        ctx.fillStyle = '#3a3448'; ctx.beginPath(); ctx.arc(x, y, r, 0, g.TAU); ctx.fill();
        ctx.strokeStyle = '#17121f'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.35, 0, g.TAU); ctx.fill();
        ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(x + r * 0.6, y - r * 0.6, 1.8, 0, g.TAU); ctx.fill();
      }
      g.explosion(tx, ty, hit, { color: EL.fire, r: 42, count: 34, colors: [EL.fire, '#ffd166', EL.earth] });
      smoke(g, tx, ty, hit - 0.2, { seed: 4, count: 9, r: 26, size: 9, life: 1.6 });
      ctx.restore();
    },
  });

  // ---------- 2. Curve Bolt ----------
  SG.register({
    id: 'curve-bolt',
    name: 'Curve Bolt',
    family: 'offense',
    status: 'new',
    oneLiner: 'A bolt that bends in flight. Aim beside your target and it hooks around cover.',
    situation: 'One enemy hiding behind a pillar, or a shield-bearer facing you.',
    coop: 'Two curve bolts from opposite sides pincer a shielded enemy: one draws the shield, one hooks behind.',
    source: 'Noita path modifiers (Spiral arc, Slithering path) that reshape a projectile in flight.',
    duration: 5.5,
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL } = g;
      const hx = 70, hy = 130, ex = 284, ey = 130;
      const P = [[88, 124], [190, -5], [375, 95], [ex + 2, ey - 3]];
      g.pillar(214, 130, 22);
      // straight shot fails
      const s1 = seg(t, 0.6, 1.0), splash = t - 1.0;
      if (s1 > 0 && s1 < 1) {
        const x = lerp(88, 190, s1);
        g.trail((tt) => [lerp(88, 190, seg(tt, 0.6, 1.0)), 130], { color: EL.arcane, len: 0.12, width: 4, from: 0.6 });
        g.orb(x, 130, 3.5, EL.arcane);
      }
      g.burst(190, 130, splash, { seed: 7, count: 14, color: EL.arcane, speed: 70, life: 0.4, size: 2, dir: Math.PI, spread: 2.2 });
      if (splash > 0 && splash < 0.9) g.label('blocked', 214, 96, { alpha: 1 - seg(splash, 0.6, 0.9), color: '#ff9fb0' });
      // curved preview + cursor beside the target
      const cur = seg(t, 1.3, 1.9);
      const pv = seg(t, 1.8, 2.3) * (1 - seg(t, 2.6, 3.0));
      if (pv > 0) {
        ctx.save(); ctx.strokeStyle = g.hexA('#ffffff', 0.5 * pv); ctx.lineWidth = 1.3; ctx.setLineDash([4, 4]); ctx.lineDashOffset = -t * 20;
        ctx.beginPath(); const n = Math.round(30 * seg(t, 1.8, 2.3));
        for (let i = 0; i <= n; i++) { const [x, y] = bez(P, i / 30); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke(); ctx.restore();
      }
      const ca = seg(t, 1.2, 1.4) * (1 - seg(t, 2.5, 2.8));
      if (ca > 0) { const cp = ease.inOut(cur); g.cursor(lerp(284, 250, cp), lerp(130, 48, cp), { alpha: ca }); }
      // hero
      const aimA = lerp(0, -0.9, ease.inOut(cur));
      const casting = Math.max(seg(t, 0.3, 0.6) * (1 - seg(t, 0.6, 0.8)), seg(t, 2.0, 2.4) * (1 - seg(t, 2.4, 2.7)));
      g.wizard(hx, hy, { facing: aimA, tip: EL.arcane, casting });
      // enemy with west-facing shield
      const hit = t - 3.4;
      const dead = seg(t, 4.0, 4.5);
      g.enemy(ex, ey, { r: 11, color: g.ACTOR.brute, facing: Math.PI, hit: hit > 0 ? Math.max(0, 1 - hit * 3) : 0, hp: hit > 0 ? 0.15 : 1, dead });
      if (dead < 1) {
        const flick = hit > 0 ? (Math.floor(t * 18) % 2 ? 0.3 : 0.9) : 1;
        ctx.save(); ctx.globalAlpha = (1 - dead) * flick; ctx.lineCap = 'round';
        ctx.strokeStyle = g.hexA(EL.shield, 0.35); ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(ex, ey, 17, Math.PI - 0.95, Math.PI + 0.95); ctx.stroke();
        ctx.strokeStyle = EL.shield; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
      }
      // curved bolt
      const s2 = seg(t, 2.4, 3.4);
      if (s2 > 0 && s2 < 1) {
        const f = (tt) => bez(P, ease.inOut(seg(tt, 2.4, 3.4)) * 0.4 + seg(tt, 2.4, 3.4) * 0.6);
        g.trail(f, { color: EL.arcane, len: 0.25, width: 5, from: 2.4 });
        const [x, y] = f(t); g.orb(x, y, 4, EL.arcane);
      }
      g.explosion(ex, ey, hit, { color: EL.arcane, r: 26 });
      g.popup('-80', ex, ey - 18, hit);
      if (hit > 0.1 && hit < 1.0) g.label('from behind!', ex, ey + 26, { alpha: 1 - seg(hit, 0.7, 1.0), color: EL.shield });
    },
  });

  // ---------- 3. Fault Line ----------
  SG.register({
    id: 'fault-line',
    name: 'Fault Line',
    family: 'control',
    status: 'new',
    oneLiner: 'Crack the ground in a line. Everything on it is hurled aside, and a stone ridge remains.',
    situation: 'A pack charging down an open lane. Split it and raise instant cover.',
    coop: 'The ridge is a wall your friend banks ricochet shots off, or hides behind.',
    source: "Dota 2 Earthshaker's Fissure: a damaging line that leaves impassable terrain.",
    duration: 6,
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL, ACTOR } = g;
      const hx = 60, hy = 130, LY = 130, X0 = 95, X1 = 345, c0 = 0.9, c1 = 1.7;
      const front = lerp(X0, X1, seg(t, c0, c1));
      const passT = (x) => c0 + (x - X0) / (X1 - X0) * (c1 - c0);
      const crumble = seg(t, 5.0, 5.5);
      // crack
      if (t > c0 && crumble < 1) {
        ctx.save(); ctx.strokeStyle = `rgba(20,12,10,${0.8 * (1 - crumble)})`; ctx.lineWidth = 3; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(X0, LY);
        for (let x = X0 + 10; x <= front; x += 10) ctx.lineTo(x, LY + (g.rand(x, 3) - 0.5) * 8);
        ctx.lineTo(front, LY); ctx.stroke(); ctx.restore();
      }
      // eruptions + ridge rocks
      for (let x = X0 + 6, i = 0; x <= X1 - 4; x += 12, i++) {
        const pt = passT(x);
        g.burst(x, LY, t - pt, { seed: i + 20, count: 6, color: EL.earth, speed: 70, life: 0.45, size: 2.5 });
        const rise = ease.back(seg(t, pt + 0.1, pt + 0.4)) * (1 - seg(t, 5.0 + i * 0.015, 5.3 + i * 0.015));
        if (rise > 0.02) g.rock(x, LY - 3 + (g.rand(i, 5) - 0.5) * 4, 9 * rise, { rot: g.rand(i, 6) * 3, color: g.mix(EL.earth, '#7a7290', 0.45) });
        g.burst(x, LY - 4, t - 5.1 - i * 0.015, { seed: i + 60, count: 4, color: EL.earth, speed: 40, life: 0.5, size: 2 });
      }
      // hero slams staff
      const slam = seg(t, 0.4, 0.8) * (1 - seg(t, 0.9, 1.3));
      g.wizard(hx, hy, { facing: 0, tip: EL.earth, casting: slam });
      if (t > 0.3 && t < 1.0) g.queue(hx, hy - 22, ['earth', 'earth']);
      g.ring(hx + 18, hy + 4, 30 * ease.out(seg(t, 0.8, 1.2)), { color: EL.earth, alpha: 1 - seg(t, 0.8, 1.2), width: 2 });
      // ally (ricochet caster)
      const ax = 70, ay = 50, bx = 209, by = 121;
      const shot = seg(t, 3.2, 3.6) * (1 - seg(t, 3.6, 3.8));
      g.wizard(ax, ay, { color: ACTOR.ally, facing: g.angle(ax, ay, bx, by), tip: EL.lightning, casting: shot });
      // pack
      const pack = [[300, 116, -1], [330, 116, -1], [360, 116, -1], [300, 144, 1], [330, 144, 1], [360, 144, 1]];
      let tgt = null;
      pack.forEach(([x0, y0, side], i) => {
        const th = (x0 + 186.25) / 334.5;
        const xh = x0 - 22 * th;
        const age = t - th;
        let x = x0 - 22 * Math.min(t, th), y = y0, hop = 0, hp = 1, hitF = 0;
        if (age > 0) {
          const q = seg(age, 0, 0.45);
          y = lerp(y0, y0 + side * (48 + g.rand(i, 2) * 14), ease.out(q));
          x = xh + (g.rand(i, 4) - 0.5) * 16 * q + Math.sin(t * 2 + i) * 3 * seg(age, 0.5, 1);
          hop = Math.sin(Math.PI * q) * 14; hp = 0.55; hitF = Math.max(0, 1 - age * 3);
        }
        const isT = i === 1;
        const thit = t - 3.8;
        g.enemy(x, y - hop, {
          r: 9, facing: Math.PI, hp: isT && thit > 0 ? 0 : hp, hit: isT && thit > 0 ? Math.max(0, 1 - thit * 3) : hitF,
          status: age > 0.3 && age < 1.3 ? 'stunned' : (isT && thit > 0 ? 'shocked' : []),
          dead: isT ? seg(t, 4.1, 4.5) : 0,
        });
        if (isT) tgt = [x, y];
      });
      // ricochet bolt off the ridge
      const rp = seg(t, 3.4, 3.8);
      if (rp > 0 && rp < 1 && tgt) {
        const pts = [[ax + 12, ay + 8], [bx, by], tgt];
        const f = (tt) => g.along(pts, seg(tt, 3.4, 3.8)).slice(0, 2);
        g.trail(f, { color: EL.lightning, len: 0.15, width: 4, from: 3.4 });
        const [x, y] = f(t); g.orb(x, y, 3.5, EL.lightning);
      }
      g.burst(bx, by, t - 3.4 - 0.4 * (g.dist(ax, ay, bx, by) / (g.dist(ax, ay, bx, by) + 115)), { seed: 9, count: 12, color: EL.lightning, speed: 60, life: 0.35, size: 2, dir: -Math.PI / 2, spread: 2.4 });
      if (tgt) { g.explosion(tgt[0], tgt[1], t - 3.8, { color: EL.lightning, r: 18 }); }
      if (t > 3.3 && t < 4.4) g.label('bank shot', 150, 88, { alpha: 1 - seg(t, 4.1, 4.4), color: EL.lightning });
    },
  });

  // ---------- 4. Sticky Beacon ----------
  SG.register({
    id: 'sticky-beacon',
    name: 'Sticky Beacon',
    family: 'preparation',
    status: 'new',
    oneLiner: 'Tag a big enemy with a beacon. Seconds later a sky lance strikes wherever it has wandered.',
    situation: 'One big, slow, dangerous enemy moving through a crowd you cannot isolate.',
    coop: "Everyone sees the beacon's countdown ring; the frontline steps away just before it lands.",
    source: 'Helldivers 2 stratagem beacons that stick to enemies, and Invoker\'s delayed Sun Strike.',
    duration: 5.5,
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL, ACTOR } = g;
      const hx = 65, hy = 130;
      const stick = 1.2, strike = 3.7, sa = t - strike;
      const bp = (tt) => { const q = seg(tt, 0, 5); return [lerp(325, 225, q), lerp(80, 175, q)]; };
      const [bx, by] = bp(Math.min(t, strike));
      ctx.save(); shake(g, sa, 4, 0.35);
      scorch(g, bx, by + 4, 34, sa > 0 ? 1 - seg(t, 4.6, 5.3) : 0);
      // light shaft gathering above the target
      const gather = seg(t, stick, strike);
      if (gather > 0 && sa < 0) {
        const w = 3 + gather * 9;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g.hexA('#fff3b0', 0.06 + 0.22 * gather * gather);
        ctx.fillRect(bx - w / 2, 0, w, by); ctx.restore();
      }
      // small blobs
      const smalls = [[255, 110], [335, 155], [200, 210], [290, 220]];
      smalls.forEach(([x, y], i) => {
        const wx = x + Math.sin(t * 1.3 + i * 2) * 8, wy = y + Math.cos(t * 1.1 + i) * 5;
        const a = g.angle(bx, by, wx, wy), d = g.dist(bx, by, wx, wy), near = d < 80;
        const k = near ? ease.out(seg(sa, 0, 0.35)) * (90 - d) * 0.6 : 0;
        g.enemy(wx + Math.cos(a) * k, wy + Math.sin(a) * k, {
          r: 8, facing: g.angle(wx, wy, hx, hy), hit: near && sa > 0 ? Math.max(0, 1 - sa * 3) : 0,
          hp: near && sa > 0 ? 0.4 : 1, status: near && sa > 0.2 && sa < 1.5 ? 'stunned' : [],
        });
      });
      // the frontline ally steps aside when the ring runs low
      const step = ease.inOut(seg(t, 2.7, 3.2));
      const ax = lerp(205, 145, step), ay = lerp(150, 200, step);
      g.wizard(ax, ay, { color: ACTOR.ally, facing: step > 0.1 && step < 0.9 ? 2.4 : g.angle(ax, ay, bx, by), tip: EL.ice });
      if (t > 2.7 && t < 3.4) g.label('move!', ax, ay - 20, { color: ACTOR.ally });
      // the big one
      const dead = seg(t, strike + 0.25, strike + 0.8);
      g.enemy(bx, by, { r: 20, color: ACTOR.brute, facing: g.angle(bx, by, ax, ay), hit: sa > 0 ? Math.max(0, 1 - sa * 2.5) : 0, hp: sa > 0 ? 0 : 1, dead });
      // countdown ring + beacon
      if (t > stick && sa < 0) {
        const rem = 1 - seg(t, stick, strike);
        ctx.save(); ctx.strokeStyle = g.hexA(EL.fire, 0.25); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(bx, by, 30, 0, g.TAU); ctx.stroke();
        ctx.strokeStyle = EL.fire; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(bx, by, 30, -Math.PI / 2, -Math.PI / 2 + g.TAU * rem); ctx.stroke(); ctx.restore();
        const n = Math.ceil(rem * 3);
        g.label(String(n), bx + 34, by - 26, { color: '#ffd166', size: 10 });
      }
      const tau = t - stick, on = tau < 0 || Math.sin(tau * 6 + tau * tau * 9) > 0;
      if (sa < 0) {
        let px, py;
        if (t < stick) {
          const q = seg(t, 0.6, stick), [tx2, ty2] = bp(stick);
          px = lerp(hx + 12, tx2 - 6, q); py = lerp(hy - 6, ty2 - 12, q) - Math.sin(Math.PI * q) * 50;
          if (q <= 0) px = null;
        } else { px = bx - 6; py = by - 12; }
        if (px != null) {
          ctx.fillStyle = '#2b2240'; ctx.beginPath(); ctx.arc(px, py, 4, 0, g.TAU); ctx.fill();
          ctx.fillStyle = on ? '#ff5d73' : '#6a3040'; ctx.beginPath(); ctx.arc(px, py, 2.4, 0, g.TAU); ctx.fill();
          if (on) g.glow(px, py, 10, '#ff5d73', 0.8);
        }
      }
      g.burst(bx - 6, by - 12, t - stick, { seed: 3, count: 8, color: '#ff5d73', speed: 40, life: 0.3, size: 1.5 });
      g.wizard(hx, hy, { facing: -0.35, tip: '#ff5d73', casting: seg(t, 0.3, 0.6) * (1 - seg(t, 0.6, 0.9)) });
      // the lance
      if (sa >= 0 && sa < 0.6) {
        const a = 1 - seg(sa, 0.15, 0.6), w = 26 * (1 - seg(sa, 0, 0.6) * 0.6);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g.hexA('#fff3b0', 0.55 * a); ctx.fillRect(bx - w, -10, w * 2, by + 10);
        ctx.fillStyle = g.hexA('#ffffff', 0.9 * a); ctx.fillRect(bx - w * 0.35, -10, w * 0.7, by + 10);
        ctx.restore();
      }
      g.explosion(bx, by, sa, { color: '#ffe08a', r: 48, colors: ['#ffffff', '#ffe08a', EL.fire], count: 36 });
      g.popup('-300', bx, by - 30, sa - 0.1, { size: 11 });
      ctx.restore();
    },
  });

  // ---------- 5. Pinning Javelin ----------
  SG.register({
    id: 'pinning-javelin',
    name: 'Pinning Javelin',
    family: 'control',
    status: 'new',
    oneLiner: 'Hurl a javelin that skewers the first enemy and carries it until it is pinned to a wall.',
    situation: 'A big enemy standing near a wall or pillar. Take it out of the fight for a while.',
    coop: 'A pinned brute is a sitting target for the beam caster or a melee ally.',
    source: "Dota 2 Mars' Spear of Mars: carries the first hero hit and stuns it against terrain.",
    duration: 5.5,
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL, ACTOR } = g;
      const hx = 70, hy = 130, WX = 352, R = 18;
      const t0 = 1.1, t1 = 1.4, t2 = 2.05, pin = t - t2;
      ctx.save(); shake(g, pin, 3.5, 0.3);
      g.wall(WX, 28, 16, 204);
      // brute position
      const carry = seg(t, t1, t2), free = ease.inOut(seg(t, 4.6, 5.1));
      const bx = carry > 0 ? lerp(215, WX - R, carry * carry * 0.5 + carry * 0.5) - free * 18 : 215;
      // dust streak along the carry path
      for (let k = 0; k < 9; k++) {
        const kt = t1 + (t2 - t1) * k / 9, kx = lerp(215, WX - R, (k / 9) * (k / 9) * 0.5 + (k / 9) * 0.5);
        smoke(g, kx - 10, 136, t - kt, { seed: k + 3, count: 3, r: 6, size: 5, life: 0.8, color: '#a8957c' });
      }
      // small blobs wander
      [[245, 68], [250, 196]].forEach(([x, y], i) => g.enemy(x + Math.sin(t * 1.4 + i * 3) * 10, y + Math.cos(t * 1.2 + i) * 6, { r: 8, facing: Math.PI }));
      // ally beams the pinned brute
      const ax = 135, ay = 52;
      const beamOn = seg(t, 2.5, 2.7) * (1 - seg(t, 4.0, 4.2));
      g.wizard(ax, ay, { color: ACTOR.ally, facing: g.angle(ax, ay, bx, 130), tip: EL.arcane, casting: beamOn });
      const hpBeam = 0.85 - 0.7 * seg(t, 2.6, 4.1);
      const stun = pin > 0 && t < 4.7;
      g.enemy(bx, 130, {
        r: R, color: ACTOR.brute, facing: Math.PI, hp: t > t1 ? hpBeam : 1,
        hit: Math.max(t > t1 && t < t1 + 0.35 ? 1 - (t - t1) * 3 : 0, beamOn > 0.5 ? 0.25 + Math.sin(t * 30) * 0.15 : 0),
        status: stun ? 'stunned' : [],
      });
      if (beamOn > 0) g.beam(ax + 12, ay + 10, bx - 8, 124, { color: EL.arcane, width: 5, alpha: beamOn });
      // javelin
      const jAlpha = 1 - seg(t, 4.4, 4.8);
      if (t < t0) {
        const wind = ease.out(seg(t, 0.4, t0));
        javelin(g, hx - 20 - wind * 8, hy - 10, hx + 22 - wind * 8, hy - 10, { glow: wind });
      } else if (t < t1) {
        const q = seg(t, t0, t1), tip = lerp(hx + 22, 215 - R + 4, q);
        g.trail((tt) => [lerp(hx + 22, 215 - R + 4, seg(tt, t0, t1)) - 20, hy - 4], { color: '#e8d6b8', len: 0.12, width: 3, from: t0 });
        javelin(g, tip - 44, lerp(hy - 10, hy - 2, q), tip, lerp(hy - 10, hy - 2, q), { glow: 0.6 });
      } else if (jAlpha > 0) {
        const tip = carry < 1 ? bx + R + 6 : WX + 6;
        javelin(g, tip - 50, 128, tip, 128, { alpha: jAlpha, glow: carry < 1 ? 0.5 : 0 });
      }
      g.burst(WX, 128, pin, { seed: 5, count: 16, colors: ['#9a92ac', EL.earth, '#ffffff'], speed: 90, life: 0.5, size: 2.5, dir: Math.PI, spread: 2.4 });
      if (pin > 0 && pin < 2.0) g.label('pinned', WX - R - 4, 88, { alpha: 1 - seg(pin, 1.6, 2.0), color: EL.shield });
      g.popup('-120', bx - 6, 166, t - 3.2);
      g.wizard(hx, hy, { facing: 0, tip: EL.earth, casting: seg(t, 0.4, t0) * (1 - seg(t, t0, t0 + 0.3)) });
      if (t > 0.3 && t < 1.3) g.queue(hx, hy - 24, ['earth', 'arcane']);
      ctx.restore();
    },
  });

  // ---------- 6. Surface Surge ----------
  SG.register({
    id: 'surface-surge',
    name: 'Surface Surge',
    family: 'offense',
    status: 'new',
    oneLiner: 'Touch a puddle, slick or grass patch and flood your element through all of it at once.',
    situation: 'Many enemies standing in one big connected surface, like a flooded floor.',
    coop: 'One player paints the floor with water; the other surges lightning through it from a safe edge.',
    source: "Divinity: Original Sin 2 electrified water surfaces, and Magicka's wet plus lightning.",
    duration: 5.5,
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL, ACTOR } = g;
      const T0 = 1.9, T1 = 2.6, fade = 1 - seg(t, 3.3, 4.2);
      const touch = [166, 106];
      const grow = ease.out(seg(t, 0.5, 1.5));
      const pools = [[205, 105, 42, 28], [255, 142, 58, 40], [306, 104, 40, 30], [232, 188, 48, 24], [314, 180, 36, 22], [178, 180, 34 * grow, 22 * grow]];
      const R = seg(t, T0, T1) * 210;
      const reach = (x, y) => g.dist(touch[0], touch[1], x, y);
      pools.forEach(([x, y, rx, ry]) => {
        if (rx < 1) return;
        const ch = t > T0 ? g.clamp((R - reach(x, y) + 30) / 40) * fade : 0;
        g.puddle(x, y, rx, ry, { charged: ch });
        if (ch > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g.hexA(EL.lightning, 0.25 * ch); ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, g.TAU); ctx.fill(); ctx.restore(); }
      });
      // surge links (a tree through the connected water)
      const nodes = { s: touch, a: [205, 105], b: [255, 142], c: [306, 104], d: [232, 188], e: [314, 180], f: [178, 180] };
      const links = [['s', 'a'], ['a', 'b'], ['a', 'c'], ['b', 'd'], ['b', 'e'], ['d', 'f'], ['c', 'e']];
      if (t > T0 && fade > 0) links.forEach(([p, q], i) => {
        const [x1, y1] = nodes[p], [x2, y2] = nodes[q];
        const d1 = reach(x1, y1), d2 = reach(x2, y2), L = d2 - d1;
        const k = g.clamp((R - d1) / Math.max(10, L));
        if (k <= 0) return;
        g.bolt(x1, y1, lerp(x1, x2, k), lerp(y1, y2, k), { seed: Math.floor(t * 18) + i * 7, width: 2.2, alpha: fade, jag: 8 });
      });
      // ally sprays water to connect a new pool
      const ax = 105, ay = 218, spr = seg(t, 0.4, 0.6) * (1 - seg(t, 1.4, 1.6));
      g.wizard(ax, ay, { color: ACTOR.ally, facing: g.angle(ax, ay, 178, 182), tip: EL.water, casting: spr });
      if (spr > 0) g.spray(ax + 14, ay - 8, g.angle(ax, ay, 178, 182), { color: EL.water, len: 70, count: Math.round(30 * spr), spread: 0.45 });
      // enemies
      const foes = [[205, 102], [250, 138], [304, 100], [232, 184], [314, 176]];
      foes.forEach(([x, y], i) => {
        const hitAt = T0 + (reach(x, y) / 210) * (T1 - T0), age = t - hitAt;
        const jit = age > 0 && age < 1.2 ? (g.rand(Math.floor(t * 20), i) - 0.5) * 3 : 0;
        g.enemy(x + jit, y, {
          r: 9, facing: g.angle(x, y, 150, 110), status: age > 0 && age < 1.4 ? ['wet', 'shocked'] : 'wet',
          hit: age > 0 ? Math.max(0, 1 - age * 2) : 0, hp: age > 0 ? 0.1 : 1, dead: seg(age, 1.3, 1.8),
        });
        g.popup('-90', x, y - 16, age);
      });
      // dry enemy outside the water
      g.enemy(362, 44, { r: 9, facing: Math.PI * 0.8 });
      if (t > 2.6 && t < 4.3) g.label('dry', 362, 26, { alpha: 1 - seg(t, 4.0, 4.3) });
      // hero touches the pool edge
      const hx = 140, hy = 104;
      const reachOut = seg(t, 1.5, 1.9) * (1 - seg(t, 2.8, 3.2));
      g.wizard(hx, hy, { facing: 0, tip: EL.lightning, casting: reachOut });
      if (t > 1.2 && t < 2.6) g.queue(hx, hy - 22, ['lightning']);
      g.burst(touch[0], touch[1], t - T0, { seed: 11, count: 16, color: EL.lightning, speed: 70, life: 0.4, size: 2 });
    },
  });

  // ---------- 7. Bellows Gust ----------
  SG.register({
    id: 'bellows-gust',
    name: 'Bellows Gust',
    family: 'control',
    status: 'new',
    oneLiner: 'A broad gust that carries clouds, flames and loose projectiles forward onto your enemies.',
    situation: 'A fire patch or poison cloud lies between you and the enemy. Push it onto them.',
    coop: "An ally's lingering cloud or flame wall becomes a moving weapon when you blow it forward.",
    source: "Spellbreak's wind gauntlet carrying other elements, and Breath of the Wild's wind spreading fire.",
    duration: 5.5,
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL, ACTOR } = g;
      const hx = 62, hy = 130;
      const gust = seg(t, 1.0, 1.2) * (1 - seg(t, 2.3, 2.7));
      const move = ease.inOut(seg(t, 1.1, 2.3));
      // grass that bends with the wind
      // sparse grass tufts across the floor; they lean as the gust passes
      ctx.strokeStyle = '#7fae55'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      const windAt = (x) => gust * g.clamp(1 - Math.abs(x - lerp(120, 360, move)) / 160);
      for (let i = 0; i < 26; i++) {
        const px = 100 + g.rand(i, 1) * 280, py = 40 + g.rand(i, 2) * 185;
        const lean = 0.5 + windAt(px) * 7 + Math.sin(t * 3 + i) * 0.4;
        for (let k = -1; k <= 1; k++) {
          ctx.beginPath(); ctx.moveTo(px + k * 2.5, py); ctx.lineTo(px + k * 3.5 + lean, py - 6 + Math.abs(lean) * 0.3); ctx.stroke();
        }
      }
      // ally who made the cloud
      g.wizard(78, 42, { color: ACTOR.ally2, facing: 0.5, tip: EL.poison });
      if (t < 1.5) g.label('ally cloud', 78, 22, { alpha: 1 - seg(t, 1.2, 1.5), color: ACTOR.ally2 });
      // blobs
      const cloudX = lerp(168, 300, move), cloudFade = 1 - seg(t, 3.7, 4.7);
      const foes = [[296, 90], [318, 118], [294, 148], [316, 176]];
      foes.forEach(([x, y], i) => {
        const inAt = 1.9 + i * 0.07, age = t - inAt;
        const dead = seg(age, 1.8 + i * 0.1, 2.3 + i * 0.1);
        const pois = seg(age, 0, 0.4);
        const flick = age > 0 && Math.sin(t * 14 + i * 2) > 0.6 ? 0.5 : 0;
        const wob = age > 0 ? Math.sin(t * 10 + i) * 2 : 0;
        g.enemy(x + wob, y, { r: 9, facing: Math.PI, color: g.mix(ACTOR.enemy, EL.poison, pois * 0.4), hit: flick, hp: age > 0 ? 1 - seg(age, 0, 1.8) : 1, dead });
        if (age > 0 && dead < 1) g.burst(x, y - 8, (age % 0.6), { seed: i + Math.floor(age / 0.6), count: 3, color: EL.poison, speed: 20, life: 0.6, size: 2, dir: -Math.PI / 2, spread: 1.2, gravity: -10 });
      });
      // poison cloud
      if (cloudFade > 0) for (let i = 0; i < 10; i++) {
        const ox = (g.rand(i, 1) - 0.5) * 60, oy = (g.rand(i, 2) - 0.5) * 60;
        const stretch = 1 + Math.sin(Math.PI * move) * 0.8 + seg(t, 2.3, 3.5) * 0.4;
        const lag = (g.rand(i, 3) - 0.5) * Math.sin(Math.PI * move) * 40;
        const x = cloudX + ox * stretch + lag + Math.sin(t * 1.5 + i) * 4;
        const y = 130 + oy * (1 + seg(t, 2.1, 3.5) * 0.7) + Math.cos(t * 1.3 + i) * 4;
        const r = (16 + g.rand(i, 4) * 10) * (1 + seg(t, 2.1, 3.5) * 0.3);
        ctx.fillStyle = g.hexA(g.mix(EL.poison, '#6b7a4a', g.rand(i, 5) * 0.6), 0.28 * cloudFade);
        ctx.beginPath(); ctx.arc(x, y, r, 0, g.TAU); ctx.fill();
      }
      // gust streaks
      if (gust > 0) for (let i = 0; i < 24; i++) {
        const ph = (t * 1.8 + g.rand(i, 7)) % 1, x = 85 + ph * 290;
        const y = hy + (g.rand(i, 8) - 0.5) * (20 + (x - 70) * 0.75);
        ctx.strokeStyle = g.hexA('#ffffff', 0.6 * gust * Math.sin(Math.PI * ph));
        ctx.lineWidth = 1.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 12, y - 3, x + 26, y); ctx.stroke();
      }
      g.wizard(hx, hy, { facing: 0, tip: EL.steam, casting: Math.max(seg(t, 0.5, 1.0) * 0.6, gust) });
      if (t > 0.4 && t < 1.4) g.queue(hx, hy - 22, ['steam', 'steam']);
    },
  });

  // ---------- 8. Stepping Slab ----------
  SG.register({
    id: 'stepping-slab',
    name: 'Stepping Slab',
    family: 'movement',
    status: 'new',
    oneLiner: 'Conjure floating stone slabs anywhere, even over water. Walk on them; ground enemies cannot follow.',
    situation: 'A melee horde and no escape route. Step out across a pond and fire back.',
    coop: 'Build a perch over water for your fragile ally; they cast from safety while you hold the shore.',
    source: "Deep Rock Galactic Engineer's Platform Gun; Zelda: Tears of the Kingdom builds.",
    duration: 5.5,
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL, ACTOR } = g;
      const PX = 248, PY = 130, PRX = 100, PRY = 76;
      g.puddle(PX, PY, PRX, PRY);
      const slabs = [[205, 130], [248, 130], [291, 130]];
      const hx0 = 120, hy0 = 130;
      // slabs fly out and land
      slabs.forEach(([x, y], i) => {
        const s0 = 0.5 + i * 0.2, land = s0 + 0.3, q = seg(t, s0, land);
        const sink = i < 2 ? seg(t, 4.3 + i * 0.15, 4.9 + i * 0.15) : 0;
        ripple(g, x, y, t - land, { r: 14 });
        ripple(g, x, y, t - 4.3 - i * 0.15, { r: 14, life: 0.9 });
        if (q <= 0) return;
        if (q < 1) {
          const px = lerp(hx0 + 10, x, q), py = lerp(hy0, y, q) - Math.sin(Math.PI * q) * 30;
          slab(g, px, py, { scale: 0.5 + 0.5 * q });
        } else slab(g, x, y, { sink });
        g.burst(x, y, t - land, { seed: i + 30, count: 10, color: '#cfeaff', speed: 50, life: 0.4, size: 2 });
      });
      // hero hops slab to slab
      const hops = [[1.3, [hx0, hy0], slabs[0]], [1.75, slabs[0], slabs[1]], [2.2, slabs[1], slabs[2]]];
      let hx = hx0, hy = hy0, lift = 0;
      for (const [st, a, b] of hops) {
        const q = seg(t, st, st + 0.35);
        if (t >= st) { hx = lerp(a[0], b[0], ease.inOut(q)); hy = lerp(a[1], b[1], q); lift = Math.sin(Math.PI * q); }
      }
      // horde closes in and stops at the shore
      const shore = (y) => PX - PRX * Math.sqrt(Math.max(0, 1 - ((y - PY) / PRY) ** 2)) - 11;
      const foes = [[-2, 92], [10, 120], [-12, 148], [4, 176]];
      const shots = [[2.9, 1], [3.5, 2]];
      foes.forEach(([x0, y], i) => {
        const sx = shore(y), x = Math.min(sx, x0 + 68 * t), stopped = x >= sx;
        const shot = shots.find(s => s[1] === i), hit = shot ? t - shot[0] - 0.3 : -1;
        const bob = stopped ? Math.abs(Math.sin(t * 7 + i)) * -3 : 0;
        g.enemy(x, y + bob, { r: 9, facing: g.angle(x, y, hx, hy), hit: hit > 0 ? Math.max(0, 1 - hit * 3) : 0, dead: seg(hit, 0.15, 0.5) });
        g.explosion(x, y, hit, { color: EL.fire, r: 20 });
        if (stopped && i === 3 && t > 2.6 && t < 4.2) g.label('?', x, y - 18, { alpha: 1 - seg(t, 3.9, 4.2) });
      });
      // hero (on top) and bolts
      const facing = t < 2.6 ? 0 : Math.PI;
      const castK = Math.max(seg(t, 2.7, 2.9) * (1 - seg(t, 2.9, 3.1)), seg(t, 3.3, 3.5) * (1 - seg(t, 3.5, 3.7)));
      g.wizard(hx, hy - lift * 12, { facing, tip: t < 2.6 ? EL.earth : EL.fire, casting: castK, scale: 1 + lift * 0.18 });
      if (t > 0.2 && t < 1.2) g.queue(hx0, hy0 - 22, ['earth', 'shield']);
      shots.forEach(([st, i]) => {
        const q = seg(t, st, st + 0.3); if (q <= 0 || q >= 1) return;
        const [x0, y] = foes[i], tx = shore(y), sx = slabs[2][0] - 14;
        const f = (tt) => { const k = seg(tt, st, st + 0.3); return [lerp(sx, tx, k), lerp(130, y, k)]; };
        g.trail(f, { color: EL.fire, len: 0.12, width: 4, from: st });
        const [x, yy] = f(t); g.orb(x, yy, 3.5, EL.fire);
      });
    },
  });
})();
