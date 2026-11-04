// Spell tree leaves (docs/explorations/2026-11-03-spell-tree.md, section 4):
// combinations the tree implies that nobody proposed yet. Each card shows its recipe.
(function () {
  // ---------- local helpers ----------
  // Parabolic hop from (x0,y0) to (x1,y1) peaking `h` units up. Returns [x, y(lifted), groundY].
  function toss(x0, y0, x1, y1, h, p) {
    const gy = y0 + (y1 - y0) * p;
    return [x0 + (x1 - x0) * p, gy - h * 4 * p * (1 - p), gy];
  }
  function groundShadow(g, x, y, r, a = 1) {
    g.ctx.save(); g.ctx.globalAlpha = a; g.shadow(x, y, r); g.ctx.restore();
  }
  // Small HP bar (for allies; enemies have their own in g.enemy).
  function hpBar(g, x, y, hp, o = {}) {
    const { ctx } = g, w = o.w || 20;
    ctx.save(); ctx.globalAlpha = o.alpha ?? 1;
    ctx.fillStyle = 'rgba(10,6,20,0.75)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
    ctx.fillStyle = o.color || '#5fe07a'; ctx.fillRect(x - w / 2, y, w * g.clamp(hp), 3);
    ctx.restore();
  }
  // Little green plus signs rising from a healed body, `age` s after the heal.
  function healPlus(g, x, y, age, seed = 0) {
    if (age < 0 || age > 1) return;
    const { ctx } = g;
    for (let i = 0; i < 5; i++) {
      const p = g.clamp((age - i * 0.06) / 0.8); if (p <= 0 || p >= 1) continue;
      const px = x + (g.rand(seed, i) - 0.5) * 22, py = y + 4 - p * 26, s = 3;
      ctx.fillStyle = g.hexA(g.EL.life, 1 - p);
      ctx.fillRect(px - s, py - 1, s * 2, 2); ctx.fillRect(px - 1, py - s, 2, s * 2);
    }
  }
  // A label visible during [t0,t1) with a quick fade in and out.
  function tag(g, text, x, y, t0, t1, color, size) {
    const t = g.t; if (t < t0 || t >= t1) return;
    g.label(text, x, y, { color, size, alpha: g.seg(t, t0, t0 + 0.12) * (1 - g.seg(t, t1 - 0.2, t1)) });
  }
  // Where the wizard's staff tip is (matches g.wizard).
  function staffTip(x, y, f, cast = 0) {
    const sx = x + Math.cos(f + 0.5) * 6, sy = y + Math.sin(f + 0.5) * 6;
    return [sx + Math.cos(f) * (16 + cast * 3), sy + Math.sin(f) * (16 + cast * 3)];
  }
  // Triangle-wave fold: a coordinate bouncing between lo and hi.
  function fold(v, lo, hi) {
    const L = hi - lo, m = (((v - lo) % (2 * L)) + 2 * L) % (2 * L);
    return lo + (m < L ? m : 2 * L - m);
  }
  // Camera shake offset after an impact at time t0.
  function shake(g, t0, amp = 3, dur = 0.35) {
    const t = g.t; if (t < t0 || t > t0 + dur) return [0, 0];
    const k = 1 - (t - t0) / dur;
    return [Math.sin(t * 97) * amp * k, Math.cos(t * 83) * amp * k];
  }
  // A curved shield plate on an orbit around (cx,cy).
  function plate(g, cx, cy, r, ang, a = 1, flash = 0) {
    const { ctx, EL } = g;
    const px = cx + Math.cos(ang) * r, py = cy + Math.sin(ang) * r * 0.85;
    g.glow(px, py, 12, EL.shield, 0.45 * a + flash * 0.5);
    ctx.save(); ctx.lineCap = 'round';
    ctx.translate(px, py); ctx.rotate(ang);
    ctx.strokeStyle = g.hexA(EL.shield, 0.35 * a); ctx.lineWidth = 9;
    ctx.beginPath(); ctx.arc(-r * 0.4, 0, r * 0.4 + 2, -0.75, 0.75); ctx.stroke();
    ctx.strokeStyle = g.hexA(g.mix(EL.shield, '#ffffff', flash), 0.95 * a); ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
    return [px, py];
  }
  // A glass lens standing on the ground.
  function lensShape(g, x, y, s, a, hot = 0) {
    const { ctx, EL } = g;
    if (s <= 0) return;
    g.glow(x, y, 30 * s, EL.arcane, (0.25 + hot * 0.5) * a);
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(8,4,20,0.3)'; ctx.beginPath(); ctx.ellipse(x + 3, y + 26 * s, 9 * s, 3, 0, 0, g.TAU); ctx.fill();
    const grd = ctx.createLinearGradient(x - 7 * s, 0, x + 7 * s, 0);
    grd.addColorStop(0, g.hexA(EL.arcane, 0.25)); grd.addColorStop(0.5, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, g.hexA(EL.arcane, 0.25));
    ctx.fillStyle = grd; ctx.beginPath(); ctx.ellipse(x, y, 7 * s, 25 * s, 0, 0, g.TAU); ctx.fill();
    ctx.strokeStyle = g.hexA(EL.shield, 0.95); ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.2;
    const sh = Math.sin(g.t * 3) * 6 * s;
    ctx.beginPath(); ctx.moveTo(x - 2 * s, y - 14 * s + sh); ctx.lineTo(x - 2 * s, y - 6 * s + sh); ctx.stroke();
    ctx.restore();
  }
  // A treasure chest (goal marker).
  function chest(g, x, y) {
    const { ctx } = g;
    g.shadow(x, y + 2, 10);
    ctx.fillStyle = '#7a4a26'; ctx.fillRect(x - 11, y - 7, 22, 14);
    ctx.fillStyle = '#9a6234'; ctx.fillRect(x - 11, y - 9, 22, 6);
    ctx.fillStyle = '#ffd166'; ctx.fillRect(x - 11, y - 4, 22, 2); ctx.fillRect(x - 2, y - 5, 4, 5);
    ctx.strokeStyle = 'rgba(20,10,30,0.7)'; ctx.lineWidth = 1.2; ctx.strokeRect(x - 11, y - 9, 22, 16);
    g.glow(x, y, 18, '#ffd166', 0.25 + 0.1 * Math.sin(g.t * 4));
  }

  // ---------- 1. Puddle rune ----------
  SG.register({
    id: 'puddle-rune',
    name: 'Puddle Rune',
    family: 'preparation',
    status: 'tree',
    oneLiner: 'Seal water into a rune on the floor. When an enemy steps on it, the area floods.',
    situation: 'A calm moment before a wave walks down a known path.',
    coop: 'You lay the flood, an ally lights it up with lightning through every enemy in it.',
    source: 'Spell tree: Seal + Point + Water',
    duration: 7,
    floor: 'stone',
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL } = g;
      const hx = 62, hy = 112, rx = 236, ry = 128, TRIG = 3.45, ZAP = 4.5;
      const ax = 78, ay = 204;

      // Flood (under everything).
      const fl = ease.out(seg(t, TRIG, TRIG + 0.5)), fade = seg(t, 6.1, 6.8);
      const charged = t >= ZAP + 0.15 ? 1 - seg(t, ZAP + 1.3, ZAP + 1.7) : 0;
      if (fl > 0 && fade < 1) {
        ctx.save(); ctx.globalAlpha = 1 - fade;
        g.puddle(rx + 12, ry + 2, 104 * fl, 66 * fl, { charged });
        g.puddle(rx - 70, ry + 30, 26 * fl, 12 * fl, { charged });
        ctx.restore();
        if (charged > 0) g.glow(rx + 12, ry + 2, 110, EL.lightning, 0.35 * charged);
      }
      g.burst(rx, ry, t - TRIG, { seed: 8, count: 26, colors: [EL.water, '#ffffff'], speed: 120, life: 0.6, size: 2.6 });

      // Rune: laid during the calm.
      const placed = seg(t, 1.25, 1.6);
      if (placed > 0 && t < TRIG + 0.05) {
        g.rune(rx, ry, 17 * ease.back(placed), { color: EL.water, alpha: 0.9 * placed, spin: 0.6, armed: 0.5 + 0.3 * Math.sin(t * 5) });
      }
      g.burst(rx, ry, t - 1.25, { seed: 2, count: 12, color: EL.water, speed: 40, life: 0.4, size: 2 });

      // Hero: water gem, seal, point at the floor.
      const cp = ease.inOut(seg(t, 0.5, 1.1));
      const cx = lerp(120, rx, cp), cy = lerp(130, ry, cp);
      const hf = g.angle(hx, hy, rx, ry);
      g.wizard(hx, hy, { facing: hf, tip: EL.water, casting: seg(t, 0.9, 1.2) * (1 - seg(t, 1.3, 1.6)) });
      if (t >= 0.4 && t < 1.3) g.queue(hx, hy - 22, ['water']);
      tag(g, 'seal + point', hx, hy - 38, 0.75, 1.9, EL.water);
      if (t >= 0.5 && t < 1.8) g.cursor(cx, cy, { alpha: 0.9 * (1 - seg(t, 1.5, 1.8)) });
      const sp = seg(t, 1.0, 1.25);
      if (sp > 0 && sp < 1) {
        const [tx0, ty0] = staffTip(hx, hy, hf, 1);
        const [px, py] = toss(tx0, ty0, rx, ry, 30, sp);
        g.orb(px, py, 4, EL.water);
      }
      tag(g, 'calm', 200, 24, 0.3, 2.4, '#d8d4e8');

      // Ally waits with lightning.
      const af = g.angle(ax, ay, 168, 150);
      g.wizard(ax, ay, { color: g.ACTOR.ally, facing: af, tip: t > 3.8 ? EL.lightning : null, casting: seg(t, 4.1, ZAP) * (1 - seg(t, ZAP + 0.4, ZAP + 0.7)) });
      tag(g, 'ally', ax, ay + 20, 0.3, 2.2, g.ACTOR.ally);
      if (t >= 3.8 && t < ZAP) g.queue(ax, ay - 22, ['lightning']);
      if (t >= ZAP && t < ZAP + 0.5) {
        const [bx, by] = staffTip(ax, ay, af, 1);
        g.bolt(bx, by, 168, 150, { width: 2.5, alpha: 1 - seg(t, ZAP + 0.3, ZAP + 0.5) });
      }

      // Enemies march in and the leader trips the rune.
      const offs = [[0, -2], [34, -30], [38, 26]];
      offs.forEach(([ox, oy], i) => {
        if (t < 2.3) return;
        const tt = Math.min(t, TRIG);
        let x = 410 + ox - 160 * (tt - 2.3) * (i ? 0.98 : 1);
        if (t > TRIG) x -= 12 * seg(t, TRIG, ZAP);
        const y = ry + oy;
        const col = i === 1 ? g.ACTOR.brute : g.ACTOR.enemy, r = i === 1 ? 11 : 9;
        const zapped = t >= ZAP + 0.15 + i * 0.08, za = t - (ZAP + 0.15 + i * 0.08);
        const st = zapped ? ['wet', 'shocked'] : t >= TRIG ? ['wet', 'slowed'] : [];
        g.enemy(x + (zapped ? Math.sin(t * 60) * 1.5 : 0), y + Math.sin(t * 12 + i) * (t < TRIG ? 1.5 : 0.5), {
          color: col, r, facing: Math.PI, status: st,
          hit: zapped ? Math.max(0, 1 - za * 3) : 0, hp: zapped ? 1 - seg(za, 0, 0.6) : 1,
          dead: zapped ? seg(za, 0.9, 1.4) : 0,
        });
        if (zapped) g.popup('-90', x, y - 18, za - 0.1);
      });
      tag(g, 'stepped on!', rx, ry - 52, TRIG - 0.05, TRIG + 0.9, EL.water);
      tag(g, 'surge!', rx + 12, ry - 52, ZAP + 0.15, ZAP + 1.2, EL.lightning, 11);
    },
  });

  // ---------- 2. Healing orbitals ----------
  SG.register({
    id: 'healing-orbitals',
    name: 'Healing Orbitals',
    family: 'support',
    status: 'tree',
    oneLiner: 'Seal life motes to circle you. Release sends one to each hurt ally nearby.',
    situation: 'Your team is scattered and hurt, and you cannot run to each of them.',
    coop: 'Stock heals between fights, then patch everyone up in one press.',
    source: 'Spell tree: Seal + Area + Life, then Release',
    duration: 6.5,
    floor: 'meadow',
    draw(g, t) {
      const { seg, ease, lerp, EL, TAU } = g;
      const hx = 138, hy = 136, N = 3, OR = 24, W = 2.6, R = 3.2, FL = 0.5;
      const spawn = (i) => 0.5 + i * 0.55;
      const L = (i) => R + i * 0.09;
      const allies = [[262, 62, g.ACTOR.ally, 0.3], [292, 200, g.ACTOR.ally2, 0.4], [56, 210, g.ACTOR.ally, 0.25]];
      const foes = [[318, 88, g.ACTOR.enemy], [344, 164, g.ACTOR.brute]];
      const hitT = (i) => L(i) + FL;

      // Enemies (hurt too, but they get nothing).
      foes.forEach(([x, y, col], j) => {
        const tgt = allies[j];
        g.enemy(x + Math.sin(t * 4 + j) * 1.5, y, { color: col, r: j ? 11 : 9, facing: g.angle(x, y, tgt[0], tgt[1]), hp: 0.5 });
        tag(g, 'no heal', x, y - 24, hitT(j) + 0.1, hitT(j) + 1.4, '#b8b2cc');
      });

      // Allies with HP bars.
      allies.forEach(([x, y, col, hp0], i) => {
        const hp = lerp(hp0, 1, ease.out(seg(t, hitT(i), hitT(i) + 0.45)));
        g.wizard(x, y, { color: col, facing: g.angle(x, y, hx, hy) });
        hpBar(g, x, y - 22, hp);
        healPlus(g, x, y - 6, t - hitT(i), i);
        g.ring(x, y, 12 + seg(t, hitT(i), hitT(i) + 0.4) * 14, { color: EL.life, alpha: t >= hitT(i) ? 1 - seg(t, hitT(i), hitT(i) + 0.4) : 0, width: 2 });
        g.popup('+60', x, y - 30, t - hitT(i) - 0.1, { color: EL.life });
      });
      tag(g, 'hurt allies', 262, 40, 0.3, 1.8, '#d8f0c8');

      // Hero gathers motes.
      const count = [0, 1, 2].filter(i => t >= spawn(i) && t < L(i)).length;
      g.wizard(hx, hy, { facing: t > 2.9 ? 0 : 0.6, tip: EL.life, casting: count && t < 2.4 ? 0.4 + 0.3 * Math.sin(t * 6) : t > R - 0.15 && t < R + 0.4 ? 1 : 0 });
      if (t >= 0.4 && t < 2.3) g.queue(hx, hy - 24, ['life'], { alpha: 0.5 + 0.5 * Math.sin(t * 11.4) ** 2 });
      if (t >= 0.5 && t < R) g.label('seal x' + count, hx, hy - 42, { color: EL.life });
      tag(g, 'release', hx, hy - 42, R, R + 0.9, '#ffffff');

      for (let i = 0; i < N; i++) {
        const s = spawn(i); if (t < s) continue;
        const orb = (tt) => {
          const k = lerp(0.3, 1, ease.out(seg(tt, s, s + 0.3)));
          const a = tt * W + i * TAU / N;
          return [hx + Math.cos(a) * OR * k, hy + Math.sin(a) * OR * 0.8 * k - 4];
        };
        g.burst(hx, hy, t - s, { seed: i + 30, count: 8, color: EL.life, speed: 30, life: 0.35, size: 1.8 });
        if (t < L(i)) {
          const [x, y] = orb(t);
          g.orb(x, y, 3.8 * ease.back(seg(t, s, s + 0.3)), EL.life);
        } else if (t < hitT(i)) {
          const [ox, oy] = orb(L(i)), [tx, ty] = allies[i];
          const pos = (tt) => toss(ox, oy, tx, ty, 26, ease.inOut(seg(tt, L(i), hitT(i)))).slice(0, 2);
          g.trail(pos, { color: EL.life, len: 0.15, width: 4, from: L(i) });
          g.orb(...pos(t), 4, EL.life);
        }
      }
    },
  });

  // ---------- 3. Shield plates ----------
  SG.register({
    id: 'shield-plates',
    name: 'Shield Plates',
    family: 'support',
    status: 'tree',
    oneLiner: 'Sealed wards orbit you and block shots. Release throws one onto each nearby ally as a bubble.',
    situation: 'You are tanking fire now, and your team is about to be.',
    coop: 'Soak the opening volley yourself, then hand the protection out to the team.',
    source: 'Spell tree: Seal + Area + Shield, then Release',
    duration: 7,
    floor: 'stone',
    draw(g, t) {
      const { seg, ease, lerp, EL, TAU } = g;
      const hx = 118, hy = 134, N = 3, OR = 27, W = 2.0, R = 3.75, FL = 0.45;
      const spawn = (i) => 0.5 + i * 0.45;
      const L = (i) => R + i * 0.08;
      const allies = [[214, 52, g.ACTOR.ally], [232, 214, g.ACTOR.ally2], [48, 214, g.ACTOR.ally]];
      const foes = [[352, 96, g.ACTOR.imp], [356, 176, g.ACTOR.enemy]];
      const landT = (i) => L(i) + FL;

      // Plates.
      const count = [0, 1, 2].filter(i => t >= spawn(i) && t < L(i)).length;
      const shots1 = [2.0, 2.45, 2.9];
      const blockFlash = shots1.reduce((m, s) => { const age = t - (s + 0.42); return age >= 0 && age < 0.3 ? Math.max(m, 1 - age / 0.3) : m; }, 0);
      for (let i = 0; i < N; i++) {
        const s = spawn(i); if (t < s) continue;
        const ang = (tt) => tt * W + i * TAU / N;
        const k = ease.back(seg(t, s, s + 0.3));
        if (t < L(i)) plate(g, hx, hy, OR * Math.max(0.3, k), ang(t), 1, blockFlash);
        else if (t < landT(i)) {
          const ox = hx + Math.cos(ang(L(i))) * OR, oy = hy + Math.sin(ang(L(i))) * OR * 0.85;
          const [tx, ty] = allies[i];
          const pos = (tt) => toss(ox, oy, tx, ty, 24, ease.inOut(seg(tt, L(i), landT(i)))).slice(0, 2);
          g.trail(pos, { color: EL.shield, len: 0.15, width: 5, from: L(i) });
          g.orb(...pos(t), 4.5, EL.shield);
        }
        g.burst(hx, hy, t - s, { seed: i + 50, count: 8, color: EL.shield, speed: 35, life: 0.35, size: 1.8 });
      }

      // Hero.
      g.wizard(hx, hy, { facing: t < 3.5 ? 0 : g.angle(hx, hy, 214, 52), tip: EL.shield, casting: count && t < 1.8 ? 0.4 + 0.3 * Math.sin(t * 6) : t > R - 0.15 && t < R + 0.4 ? 1 : 0 });
      if (t >= 0.4 && t < 1.7) g.queue(hx, hy - 42, ['shield'], { alpha: 0.5 + 0.5 * Math.sin(t * 11) ** 2 });
      if (t >= 0.5 && t < R) g.label('seal x' + count, hx, hy - 56 + (t < 1.7 ? 0 : 14), { color: EL.shield });
      tag(g, 'release', hx, hy - 50, R, R + 0.9, '#ffffff');

      // Allies; bubbles appear on landing.
      allies.forEach(([x, y, col], i) => {
        g.wizard(x, y, { color: col, facing: Math.atan2(140 - y, 300 - x) });
        const bp = seg(t, landT(i), landT(i) + 0.3), fadeB = seg(t, 6.2, 6.7);
        if (bp > 0 && fadeB < 1) {
          const shotHit = i < 2 ? t - (4.85 + i * 0.25 + 0.42) : -1;
          g.bubble(x, y, 17 * ease.back(bp), { alpha: 1 - fadeB, hit: shotHit >= 0 && shotHit < 0.35 ? 1 - shotHit / 0.35 : 0 });
        }
        g.burst(x, y, t - landT(i), { seed: i + 60, count: 12, color: EL.shield, speed: 50, life: 0.4, size: 2 });
      });

      // Enemies shoot the hero (blocked by plates), later the allies (blocked by bubbles).
      foes.forEach(([x, y, col], j) => g.enemy(x + Math.sin(t * 3 + j) * 1.5, y, { color: col, r: 9, facing: g.angle(x, y, hx, hy) }));
      const shot = (s, from, tx, ty, stopR, c) => {
        const fp = seg(t, s, s + 0.42); if (fp <= 0) return;
        const [fx, fy] = foes[from];
        const d = g.dist(fx, fy, tx, ty), ex = tx + (fx - tx) / d * stopR, ey = ty + (fy - ty) / d * stopR;
        if (fp < 1) {
          const pos = (tt) => { const q = seg(tt, s, s + 0.42); return [lerp(fx, ex, q), lerp(fy, ey, q)]; };
          g.trail(pos, { color: c, len: 0.1, width: 3, from: s });
          g.orb(...pos(t), 3.5, c);
        }
        g.burst(ex, ey, t - s - 0.42, { seed: s * 10, count: 10, colors: [EL.shield, '#ffffff'], speed: 50, life: 0.35, size: 2 });
      };
      shots1.forEach((s, k) => shot(s, k % 2, hx, hy, OR + 4, k % 2 ? EL.fire : EL.arcane));
      tag(g, 'blocked', hx + 50, hy - 26, 2.45, 3.5, EL.shield);
      shot(4.85, 0, allies[0][0], allies[0][1], 18, EL.arcane);
      shot(5.1, 1, allies[1][0], allies[1][1], 18, EL.fire);
    },
  });

  // ---------- 4. Frost bridge ----------
  SG.register({
    id: 'frost-bridge',
    name: 'Frost Bridge',
    family: 'movement',
    status: 'tree',
    oneLiner: 'Point frost at water and it freezes into ice you can walk across.',
    situation: 'A pond cuts off the path, and enemies are on your heels.',
    coop: 'Freeze a crossing for the team, then watch chasers skid and fall.',
    source: 'Spell tree: Point + Cold, on water',
    duration: 6.5,
    floor: 'meadow',
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL } = g;
      const px = 202, py = 130, hx0 = 58, hy = 132, F = 1.25;

      // Pond, with ice spreading from the cursor.
      g.puddle(px, py, 64, 134);
      const fr = ease.out(seg(t, F, F + 0.7));
      if (fr > 0) {
        ctx.save(); ctx.beginPath(); ctx.arc(px, py, 150 * fr, 0, g.TAU); ctx.clip();
        ctx.globalAlpha = 0.9; g.puddle(px, py, 64, 134, { frozen: 0.85 });
        ctx.restore();
      }
      g.burst(px, py, t - F, { seed: 4, count: 26, colors: [EL.cold, '#ffffff'], speed: 110, life: 0.6, size: 2.5 });
      g.ring(px, py, 150 * fr, { color: '#ffffff', alpha: fr > 0 && fr < 1 ? 0.8 * (1 - fr) : 0, width: 2 });
      tag(g, 'ice', px, 34, F + 0.4, F + 1.4, EL.ice);

      chest(g, 362, 132);

      // Hero: frost gems, point at the pond, then walk across.
      const walk = ease.inOut(seg(t, 2.05, 3.8));
      const hx = lerp(hx0, 336, walk);
      const cp = ease.inOut(seg(t, 0.5, 1.0));
      g.wizard(hx, hy + (walk > 0 && walk < 1 ? Math.abs(Math.sin(t * 12)) * -1.5 : 0), { facing: walk > 0 ? 0 : g.angle(hx0, hy, px, py), tip: EL.cold, casting: seg(t, 0.85, F) * (1 - seg(t, F, F + 0.3)) });
      if (t >= 0.35 && t < F) g.queue(hx0, hy - 22, t < 0.65 ? ['cold'] : ['cold', 'cold']);
      if (t >= 0.5 && t < 1.8) g.cursor(lerp(110, px, cp), lerp(140, py, cp), { alpha: 0.9 * (1 - seg(t, 1.5, 1.8)) });
      tag(g, 'point', px, py - 22, 0.95, 1.6, '#ffffff');

      // Chasers run in from the left and slip on the ice.
      [[-18, 108], [-34, 156]].forEach(([x0, y0], i) => {
        const T0 = 2.5 + i * 0.2, T1 = 3.45 + i * 0.2;
        if (t < T0) return;
        const col = i ? g.ACTOR.brute : g.ACTOR.enemy, r = i ? 11 : 9;
        if (t < T1) {
          const x = lerp(x0, 146, seg(t, T0, T1));
          g.enemy(x, y0 + Math.sin(t * 16 + i) * 2, { color: col, r, facing: 0 });
        } else {
          const q = seg(t, T1, T1 + 1.3), e = ease.out(q);
          const x = 146 + 92 * e, y = y0 + (i ? 1 : -1) * 40 * e;
          g.enemy(x, y, { color: col, r, facing: t * 14 * (1 - q) + (i ? 2 : 1), status: q > 0.3 ? 'stunned' : [] });
          if (q < 1) for (let k = 1; k <= 3; k++) g.ctx.fillStyle = 'rgba(255,255,255,0.2)', g.ctx.beginPath(), g.ctx.arc(146 + 92 * ease.out(Math.max(0, q - k * 0.06)), y0 + (i ? 1 : -1) * 40 * ease.out(Math.max(0, q - k * 0.06)), 6 - k, 0, g.TAU), g.ctx.fill();
          tag(g, 'slip!', x, y - 20, T1 + 0.05, T1 + 1.0, EL.ice);
        }
      });
    },
  });

  // ---------- 5. Healing line ----------
  SG.register({
    id: 'healing-line',
    name: 'Healing Line',
    family: 'support',
    status: 'tree',
    oneLiner: 'A green line races along the ground, healing allies it crosses and skipping enemies beside them.',
    situation: 'Your allies are tangled up in melee with enemies right next to them.',
    coop: 'Frontliners keep brawling while you heal through the crowd.',
    source: 'Spell tree: Weapon + Life',
    duration: 6,
    floor: 'sand',
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL } = g;
      const hx = 44, hy = 130, S = 1.75, D = 1.25, x0 = 64, x1 = 384;
      const F = lerp(x0, x1, seg(t, S, S + D));
      const passT = (x) => S + (x - x0) / (x1 - x0) * D;
      const end = seg(t, S + D + 0.2, S + D + 1.0);

      // The line on the ground.
      if (t >= S && end < 1) {
        for (let x = x0; x < F; x += 6) {
          const a = 0.8 * Math.max(0.15, 1 - (F - x) / 260) * (1 - end);
          const w = 12 + Math.sin(x * 0.3 + t * 10) * 2.5;
          ctx.fillStyle = g.hexA(EL.life, a);
          ctx.fillRect(x, hy - w / 2, 6.5, w);
        }
        if (F < x1) {
          g.glow(F, hy, 22, EL.life, 0.9);
          g.burst(F, hy, ((t * 4) % 1) * 0.3, { seed: Math.floor(t * 4), count: 8, color: EL.life, speed: 60, life: 0.3, size: 2, dir: Math.PI, spread: 2 });
        }
      }

      const allies = [[146, hy, g.ACTOR.ally, 0.3], [268, hy, g.ACTOR.ally2, 0.35]];
      const foes = [[206, hy, g.ACTOR.enemy], [146, 96, g.ACTOR.brute], [268, 166, g.ACTOR.enemy], [330, hy, g.ACTOR.imp], [300, 98, g.ACTOR.enemy]];

      foes.forEach(([x, y, col], i) => {
        const near = allies.reduce((b, a) => g.dist(x, y, a[0], a[1]) < g.dist(x, y, b[0], b[1]) ? a : b);
        g.enemy(x + Math.sin(t * 6 + i) * 1.5, y, { color: col, r: col === g.ACTOR.brute ? 11 : 9, facing: g.angle(x, y, near[0], near[1]), hp: 0.5 });
        if (y === hy) tag(g, 'no heal', x, y - 22, passT(x), passT(x) + 1.1, '#b8b2cc');
      });
      allies.forEach(([x, y, col, hp0], i) => {
        const pt = passT(x);
        g.wizard(x, y, { color: col, facing: g.angle(x, y, foes[i + 1][0], foes[i + 1][1]), casting: 0.3 + 0.3 * Math.sin(t * 8 + i) });
        hpBar(g, x, y + 16, lerp(hp0, 1, ease.out(seg(t, pt, pt + 0.4))));
        healPlus(g, x, y - 6, t - pt, i + 3);
        g.popup('+50', x, y - 22, t - pt - 0.05, { color: EL.life });
      });

      // Hero: life gem, weapon cast (a low sweep).
      const sw = seg(t, S - 0.25, S + 0.1);
      g.wizard(hx, hy, { facing: sw > 0 && sw < 1 ? lerp(-0.9, 0.5, ease.out(sw)) : 0, tip: EL.life, casting: sw > 0 ? 1 - seg(t, S + 0.1, S + 0.5) : 0 });
      if (t >= 0.4 && t < S) g.queue(hx, hy - 22, ['life']);
      tag(g, 'weapon', hx + 6, hy - 38, 0.9, S + 0.4, EL.life);
      tag(g, 'ally', 146, 160, 0.3, 1.6, g.ACTOR.ally);
      tag(g, 'ally', 268, 100, 0.3, 1.6, g.ACTOR.ally2);
    },
  });

  // ---------- 6. Loaded blow ----------
  SG.register({
    id: 'loaded-blow',
    name: 'Loaded Blow',
    family: 'weapon',
    status: 'tree',
    oneLiner: 'Seal a spell into your staff. Your next melee hit unleashes it point blank.',
    situation: 'A brute is coming and you want your swing to count.',
    coop: 'Load up behind the tank, then step in for one huge hit.',
    source: 'Spell tree: Seal + Weapon',
    duration: 6.2,
    floor: 'stone',
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL, rand, TAU } = g;
      const H = 3.62, bx = 304, by = 140;
      const [sx, sy] = shake(g, H, 5, 0.45);
      ctx.save(); ctx.translate(sx, sy);

      const walk = ease.inOut(seg(t, 2.2, 3.35));
      const hx = lerp(66, 262, walk), hy = 140;
      const swing = seg(t, 3.42, 3.72);
      const facing = swing > 0 ? lerp(-1.5, 1.1, ease.inOut(swing)) : walk > 0 ? 0 : -0.2;
      const loaded = t >= 1.8 && t < H;

      // Enemies: a brute up front with two imps.
      const foes = [[bx, by, g.ACTOR.brute, 14], [330, 98, g.ACTOR.imp, 9], [336, 184, g.ACTOR.imp, 9]];
      foes.forEach(([x, y, col, r], i) => {
        const look = g.angle(x, y, hx, hy);
        if (t < H) {
          g.enemy(x + Math.sin(t * 4 + i) * 1.5, y, { color: col, r, facing: look, hp: 1 });
        } else {
          const fp = seg(t, H, H + 0.7), out = g.angle(270, by, x, y);
          const [px, py, gy] = toss(x, y, x + Math.cos(out) * 52, y + Math.sin(out) * 34, 34, ease.out(fp));
          if (fp < 1) groundShadow(g, px, gy, r * 0.8, 0.7);
          g.enemy(px, py, { color: col, r, facing: look + t * 9 * (1 - fp), status: 'burning', hit: Math.max(0, 1 - (t - H) * 3), hp: lerp(1, 0.05, seg(t, H, H + 0.3)), dead: seg(t, H + 1.2, H + 1.7) });
          g.popup(i ? '-90' : '-180', px, py - r - 8, t - H - 0.2, { size: i ? 9 : 11 });
        }
      });
      tag(g, 'brute', bx, by - 30, 0.3, 2.0, '#ffb6a0');

      // Hero.
      g.wizard(hx, hy + (walk > 0 && walk < 1 ? -Math.abs(Math.sin(t * 12)) * 1.5 : 0), { facing, tip: loaded ? EL.fire : EL.earth, casting: loaded ? 0.6 + 0.4 * Math.sin(t * 9) : 0 });
      const [tx, ty] = staffTip(hx, hy, facing, loaded ? 0.6 : 0);
      if (loaded) {
        g.glow(tx, ty, 18 + Math.sin(t * 9) * 3, EL.earth, 0.5);
        for (let i = 0; i < 4; i++) { const a = t * 6 + i * TAU / 4; g.orb(tx + Math.cos(a) * 7, ty + Math.sin(a) * 7, 1.6, i % 2 ? EL.earth : EL.fire); }
      }
      if (t >= 0.4 && t < 1.5) g.queue(66, hy - 22, t < 0.75 ? ['fire'] : ['fire', 'earth']);
      tag(g, 'seal', 66, hy - 38, 1.05, 1.9, '#ffffff');
      const fly = seg(t, 1.5, 1.8);
      if (fly > 0 && fly < 1) ['fire', 'earth'].forEach((e, i) => g.orb(lerp(66 + (i - 0.5) * 9, tx, ease.in(fly)), lerp(hy - 22, ty, ease.in(fly)), 3, EL[e]));
      tag(g, 'loaded', tx, ty - 16, 1.9, 2.9, EL.fire);

      // Swoosh.
      if (swing > 0 && t < 3.9) {
        const a1 = lerp(-1.5, 1.1, ease.inOut(swing)), al = 1 - seg(t, 3.72, 3.9);
        ctx.save(); ctx.strokeStyle = g.hexA('#ffffff', 0.7 * al); ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(hx + 3, hy + 3, 24, Math.max(-1.5, a1 - 1.2), a1); ctx.stroke(); ctx.restore();
      }

      // The sealed spell bursts out on the hit.
      g.explosion(bx - 12, by, t - H, { color: EL.fire, r: 82, count: 46, colors: [EL.fire, EL.earth, '#ffd166', '#ffffff'] });
      for (let i = 0; i < 7; i++) {
        const a = rand(i, 21) * TAU, rp = seg(t, H, H + 0.7 + rand(i, 3) * 0.3);
        if (rp > 0 && rp < 1) { const [rx, ry] = toss(bx - 12, by, bx - 12 + Math.cos(a) * 70, by + Math.sin(a) * 45, 50, rp); g.rock(rx, ry, 3.5, { rot: t * 9 + i }); }
      }
      tag(g, 'hit = release', hx, hy - 30, H + 0.05, H + 1.2, EL.fire, 10);
      ctx.restore();
    },
  });

  // ---------- 7. Ice shrapnel ----------
  SG.register({
    id: 'ice-shrapnel',
    name: 'Ice Shrapnel',
    family: 'control',
    status: 'tree',
    oneLiner: 'Raise an ice wall to stop a charge. Release shatters it into shards that bounce around the room.',
    situation: 'A pack charges you in a walled room.',
    coop: 'Your wall buys time for allies, then turns into their opening volley.',
    source: 'Spell tree: Shield + Ice wall, then Release',
    duration: 6.3,
    floor: 'stone',
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL, rand } = g;
      const hx = 54, hy = 130, WX = 168, WY0 = 46, WY1 = 214, REL = 3.5, S = 3.78;
      const LO = 16, HI_X = 384, HI_Y = 244;
      g.wall(0, 0, 400, 12); g.wall(0, 248, 400, 12); g.wall(388, 0, 12, 260); g.wall(0, 0, 12, 260);
      const [sx, sy] = shake(g, S, 3, 0.3);
      ctx.save(); ctx.translate(sx, sy);

      // The wall.
      const up = ease.back(seg(t, 1.2, 1.6));
      if (t >= 1.2 && t < S) {
        const mid = (WY0 + WY1) / 2, h = (WY1 - WY0) / 2 * up;
        g.barrier(WX, mid - h, WX, mid + h, { color: EL.ice, thick: 11 });
        const cr = seg(t, REL + 0.02, S);
        if (cr > 0) {
          ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 1.4;
          for (let k = 0; k < 6; k++) {
            const y0 = WY0 + 14 + k * 28; ctx.beginPath(); ctx.moveTo(WX - 5, y0);
            ctx.lineTo(WX + 1, y0 + 8 * cr); ctx.lineTo(WX - 2, y0 + 16 * cr); ctx.lineTo(WX + 5, y0 + 22 * cr); ctx.stroke();
          }
          ctx.restore();
          g.glow(WX, mid, 60, EL.ice, 0.4 * cr);
        }
      }
      g.burst(WX, 130, t - 1.2, { seed: 5, count: 14, color: EL.ice, speed: 50, life: 0.4, size: 2 });

      // Hero.
      g.wizard(hx, hy, { facing: 0, tip: EL.cold, casting: seg(t, 0.95, 1.2) * (1 - seg(t, 1.3, 1.6)) + (t >= REL && t < REL + 0.4 ? 1 : 0) });
      if (t >= 0.4 && t < 1.25) g.queue(hx, hy - 22, t < 0.7 ? ['shield'] : ['shield', 'cold']);
      tag(g, 'wall', hx, hy - 38, 0.9, 1.7, EL.ice);
      tag(g, 'release', hx, hy - 38, REL - 0.1, REL + 0.9, '#ffffff', 10);

      // Pack charges, piles up on the wall, then gets shredded.
      const slots = [[194, 78, 0], [190, 116, 1], [196, 152, 0], [192, 190, 2]];
      slots.forEach(([x, y, k], i) => {
        const col = k === 1 ? g.ACTOR.brute : k === 2 ? g.ACTOR.imp : g.ACTOR.enemy, r = k === 1 ? 11 : 9;
        const run = seg(t, 1.75 + i * 0.06, 2.8 + i * 0.1);
        if (run <= 0) return;
        const ex = lerp(420 + i * 14, x, ease.out(run));
        const hitAt = S + 0.05 + i * 0.04;
        if (t < hitAt) {
          const press = run >= 1 ? Math.sin(t * 18 + i) * 1.5 : 0;
          if (run < 1) for (let q = 1; q <= 2; q++) { ctx.fillStyle = 'rgba(255,255,255,' + (0.18 - q * 0.06) + ')'; ctx.beginPath(); ctx.arc(ex + q * 9, y, 7 - q, 0, g.TAU); ctx.fill(); }
          g.enemy(ex + press, y + Math.sin(t * 16 + i) * 1.5, { color: col, r, facing: Math.PI });
        } else {
          const fp = seg(t, hitAt, hitAt + 0.6);
          const [px, py, gy] = toss(ex, y, ex + 60 + i * 6, y + (i - 1.5) * 14, 24, ease.out(fp));
          if (fp < 1) groundShadow(g, px, gy, 7, 0.7);
          g.enemy(px, py, { color: col, r, facing: Math.PI + t * 9 * (1 - fp), status: 'frozen', hit: Math.max(0, 1 - (t - hitAt) * 3), hp: 1 - seg(t, hitAt, hitAt + 0.3), dead: seg(t, hitAt + 1.0, hitAt + 1.5) });
          g.popup('-70', px, py - 16, t - hitAt - 0.1);
        }
      });
      tag(g, 'stuck', 196, 34, 2.8, REL, '#ffb6a0');

      // Shards: straight lines folded inside the arena box.
      if (t >= S) {
        const age = t - S, al = 1 - seg(age, 1.1, 1.6);
        for (let i = 0; i < 14; i++) {
          const y0 = lerp(WY0 + 6, WY1 - 6, (i + 0.5) / 14);
          const a = (rand(i, 7) - 0.5) * 2.4 + (rand(i, 9) < 0.15 ? Math.PI : 0), v = 220 + rand(i, 3) * 90;
          const P = (tt) => { const d = Math.max(0, tt - S) * v; return [fold(WX + Math.cos(a) * d, LO, HI_X), fold(y0 + Math.sin(a) * d, LO, HI_Y)]; };
          if (al <= 0) continue;
          ctx.save(); ctx.globalAlpha = al;
          g.trail(P, { color: EL.ice, len: 0.12, width: 3, from: S });
          const [x, y] = P(t), [x2, y2] = P(t - 0.02);
          const ra = Math.atan2(y - y2, x - x2);
          ctx.translate(x, y); ctx.rotate(ra);
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -2.5); ctx.lineTo(-4, 2.5); ctx.closePath(); ctx.fill();
          ctx.restore();
          // Sparks at the wall bounces.
          const cx = Math.cos(a) > 0 ? (HI_X - WX) / (Math.cos(a) * v) : Math.cos(a) < 0 ? (WX - LO) / (-Math.cos(a) * v) : 99;
          const cy = Math.sin(a) > 0 ? (HI_Y - y0) / (Math.sin(a) * v) : Math.sin(a) < 0 ? (y0 - LO) / (-Math.sin(a) * v) : 99;
          const bt = Math.min(cx, cy);
          const [bx, by] = P(S + bt);
          g.burst(bx, by, age - bt, { seed: i + 70, count: 6, colors: [EL.ice, '#ffffff'], speed: 50, life: 0.3, size: 1.8 });
        }
      }
      g.burst(WX, 130, t - S, { seed: 9, count: 30, colors: [EL.ice, '#ffffff'], speed: 120, life: 0.5, size: 2.5 });
      tag(g, 'bounce!', 330, 34, S + 0.35, S + 1.4, EL.ice);
      ctx.restore();
    },
  });

  // ---------- 8. Lens lance ----------
  SG.register({
    id: 'lens-lance',
    name: 'Lens Lance',
    family: 'support',
    status: 'tree',
    oneLiner: 'Place a lens in the world. A wide spray that passes through it comes out as a narrow, piercing lance.',
    situation: 'Enemies stand in a line just beyond the reach of a short spray.',
    coop: 'You place the lens, your ally sprays through it.',
    source: 'Spell tree: Point + Shield + Arcane',
    duration: 7,
    floor: 'sand',
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL } = g;
      const ax = 60, ay = 150, lx = 182, ly = 150, hx = 82, hy = 58;
      const P = 2.85, B = 3.75, B1 = 5.3;
      const foes = [[252, ly, g.ACTOR.enemy], [290, ly, g.ACTOR.brute], [328, ly, g.ACTOR.enemy], [364, ly, g.ACTOR.imp]];
      const F = lerp(lx + 8, 388, ease.out(seg(t, B + 0.1, B + 0.45)));

      // Lens.
      const ls = ease.back(seg(t, P, P + 0.35));
      lensShape(g, lx, ly, ls, 1 - seg(t, 6.3, 6.8), t >= B && t < B1 ? 1 : 0);
      g.burst(lx, ly, t - P, { seed: 6, count: 16, colors: [EL.arcane, EL.shield], speed: 50, life: 0.45, size: 2 });

      // Enemies in a line.
      foes.forEach(([x, y, col], i) => {
        const r = col === g.ACTOR.brute ? 11 : 9;
        const hit = t >= B + 0.1 && F >= x - r, hT = B + 0.1 + 0.35 * (1 - Math.sqrt(1 - (x - lx - 8) / (388 - lx - 8)));
        g.enemy(x + Math.sin(t * 4 + i) * 1.2 + (hit ? 4 * seg(t, hT, hT + 0.2) : 0), y, { color: col, r, facing: Math.PI, status: hit ? 'burning' : [], hit: hit ? Math.max(0, 1 - (t - hT) * 3) : 0, hp: hit ? 1 - seg(t, hT, hT + 0.9) : 1, dead: hit ? seg(t, hT + 1.0, hT + 1.4) : 0 });
        if (hit) g.popup('-90', x, y - 18, t - hT - 0.1);
      });

      // Ally sprays twice: once bare (wide and short), once through the lens.
      const s1 = t >= 1.0 && t < 2.2, s2 = t >= B && t < B1;
      g.wizard(ax, ay, { color: g.ACTOR.ally, facing: 0, tip: EL.fire, casting: s1 || s2 ? 1 : 0 });
      tag(g, 'ally', ax, ay + 20, 0.3, 1.0, g.ACTOR.ally);
      if (t >= 0.5 && (t < 1.0 || (t >= 3.3 && t < B))) g.queue(ax, ay - 22, ['fire', 'fire']);
      if (s1) {
        const a = seg(t, 1.0, 1.15) * (1 - seg(t, 2.0, 2.2));
        g.spray(ax + 16, ay, 0, { color: EL.fire, spread: 1.1, len: 100, count: 46, alpha: 0.85 * a, size: 3 });
        tag(g, 'wide, short', 130, 98, 1.15, 2.2, EL.fire);
      }
      if (s2) {
        const a = seg(t, B, B + 0.1) * (1 - seg(t, B1 - 0.2, B1));
        g.spray(ax + 16, ay, 0, { color: EL.fire, spread: 1.1, len: 98, count: 46, alpha: 0.85 * a, size: 3 });
        ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = g.hexA(EL.fire, 0.5); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(lx + 4, ly - 22); ctx.lineTo(lx + 22, ly); ctx.lineTo(lx + 4, ly + 22); ctx.stroke(); ctx.restore();
        g.beam(lx + 6, ly, F, ly, { color: EL.fire, width: 5, alpha: a });
        g.beam(lx + 6, ly, F, ly, { color: EL.arcane, width: 2, alpha: a * 0.8 });
        tag(g, 'narrow, pierces', 300, 112, B + 0.3, B1, EL.fire);
      }

      // Hero places the lens with a point cast.
      const cp = ease.inOut(seg(t, 2.2, 2.7));
      g.wizard(hx, hy, { facing: g.angle(hx, hy, lx, ly), tip: EL.arcane, casting: seg(t, 2.5, P) * (1 - seg(t, P, P + 0.3)) });
      if (t >= 2.0 && t < P) g.queue(hx, hy - 22, t < 2.3 ? ['shield'] : ['shield', 'arcane']);
      if (t >= 2.2 && t < 3.3) g.cursor(lerp(120, lx, cp), lerp(90, ly, cp), { alpha: 0.9 * (1 - seg(t, 3.0, 3.3)) });
      tag(g, 'point', hx, hy - 38, 2.45, 3.2, '#ffffff');
      tag(g, 'lens', lx, ly - 38, P + 0.15, B + 0.2, EL.arcane);
    },
  });

  // ---------- 9. Alpha strike ----------
  SG.register({
    id: 'alpha-strike',
    name: 'Alpha Strike',
    family: 'preparation',
    status: 'tree',
    oneLiner: 'Orbitals, runes and a stored spell, all prepared in the calm. One Release fires everything at once.',
    situation: 'You know a wave is coming and have time to set up.',
    coop: 'The whole team preps, then everyone releases on the same beat.',
    source: 'Spell tree: Seal + Area, Seal + Point and Seal + Self, then one Release',
    duration: 6.5,
    floor: 'meadow',
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL, TAU, rand } = g;
      const hx = 84, hy = 138, R = 4.15, OR = 28;
      const runes = [[232, 80, 1.35], [244, 194, 1.75]];
      const spawn = (i) => 0.45 + i * 0.2;
      const STORE = 2.35;
      const [sx, sy] = shake(g, R, 5, 0.5);
      ctx.save(); ctx.translate(sx, sy);

      // Runes.
      runes.forEach(([x, y, pt], i) => {
        const p = seg(t, pt, pt + 0.3);
        if (p > 0 && t < R + 0.05) g.rune(x, y, 15 * ease.back(p), { color: EL.fire, alpha: 0.9 * p, spin: 0.8, armed: 0.5 });
        g.burst(x, y, t - pt, { seed: i + 3, count: 10, color: EL.fire, speed: 40, life: 0.4, size: 2 });
        g.explosion(x, y, t - R - 0.05, { color: EL.fire, r: 64, count: 34, seed: i + 11 });
      });

      // Wave arrives.
      const foes = [[226, 62, 0], [262, 92, 0], [216, 104, 2], [236, 176, 0], [272, 206, 2], [304, 140, 1]];
      foes.forEach(([x, y, k], i) => {
        const T0 = 2.8 + i * 0.08, run = seg(t, T0, T0 + 1.0);
        if (run <= 0) return;
        const col = k === 1 ? g.ACTOR.brute : k === 2 ? g.ACTOR.imp : g.ACTOR.enemy, r = k === 1 ? 12 : 9;
        const ex = lerp(430 + i * 10, x, ease.out(run));
        if (t < R + 0.1) {
          g.enemy(ex, y + Math.sin(t * 14 + i) * 1.5, { color: col, r, facing: Math.PI });
        } else {
          const fp = seg(t, R + 0.1, R + 0.8), out = g.angle(hx, hy, x, y) + (rand(i, 4) - 0.5) * 0.8;
          const [px, py, gy] = toss(x, y, x + Math.cos(out) * 50, y + Math.sin(out) * 34, 40, ease.out(fp));
          if (fp < 1) groundShadow(g, px, gy, 7, 0.7);
          g.enemy(px, py, { color: col, r, facing: Math.PI + t * 10 * (1 - fp), status: ['burning', 'stunned'], hit: Math.max(0, 1 - (t - R) * 3), dead: seg(t, R + 1.2, R + 1.7) });
          g.popup('-' + (120 + i * 20), px, py - 18, t - R - 0.3);
        }
      });
      tag(g, 'wave!', 330, 28, 2.9, 3.9, '#ff9a8a');

      // Hero, stored-spell slot and orbit stones.
      const hf = t > 2.7 ? 0 : -0.4;
      g.wizard(hx, hy, { facing: hf, tip: t >= STORE && t < R ? EL.arcane : EL.fire, casting: t >= R - 0.1 && t < R + 0.5 ? 1 : t >= STORE && t < R ? 0.4 + 0.2 * Math.sin(t * 7) : 0 });
      const [tx, ty] = staffTip(hx, hy, hf, 0.4);
      if (t >= STORE && t < R) g.glow(tx, ty, 16 + Math.sin(t * 8) * 3, EL.arcane, 0.6);
      if (t >= 1.95 && t < STORE) g.queue(hx, hy - 24, t < 2.1 ? ['arcane'] : ['arcane', 'fire']);
      if (t >= 0.2 && t < 3.2) g.cursor(...(t < 1.3 ? [200, 120] : t < 1.7 ? [lerp(232, 244, seg(t, 1.5, 1.7)), lerp(80, 194, seg(t, 1.5, 1.7))] : [244, 194]), { alpha: seg(t, 1.0, 1.3) * (1 - seg(t, 2.0, 2.3)) * 0.9 });

      for (let i = 0; i < 4; i++) {
        const s = spawn(i); if (t < s) continue;
        const k = ease.back(seg(t, s, s + 0.3));
        const ang = (tt) => tt * 2.4 + i * TAU / 4;
        const orb = (tt) => [hx + Math.cos(ang(tt)) * OR, hy + Math.sin(ang(tt)) * OR * 0.8 - 4];
        const L = R + i * 0.04;
        if (t < L) { const [x, y] = orb(t); g.rock(lerp(hx, x, Math.min(1, k)), lerp(hy, y, Math.min(1, k)), 5 * k, { rot: t * 4 + i }); }
        else if (t < L + 0.28) {
          const [ox, oy] = orb(L), tgt = foes[[0, 3, 1, 4][i]];
          const pos = (tt) => { const q = ease.in(seg(tt, L, L + 0.28)); return [lerp(ox, tgt[0], q), lerp(oy, tgt[1], q)]; };
          g.trail(pos, { color: EL.earth, len: 0.12, width: 5, from: L });
          g.rock(...pos(t), 5, { rot: t * 20 });
        }
      }
      // The stored spell: a beam through the middle.
      if (t >= R && t < R + 0.55) {
        const a = 1 - seg(t, R + 0.35, R + 0.55);
        g.beam(tx, ty, 392, 140, { color: EL.arcane, width: 11, alpha: a });
        g.beam(tx, ty, 392, 140, { color: EL.fire, width: 5, alpha: a });
      }
      if (t >= R && t < R + 0.4) g.glow(200, 130, 260, '#ffffff', 0.18 * (1 - seg(t, R, R + 0.4)));
      tag(g, 'RELEASE', hx, hy - 30, R - 0.05, R + 1.1, '#ffffff', 12);
      tag(g, 'calm', 200, 24, 0.2, 2.7, '#d8f0c8');
      ctx.restore();

      // HUD: what is primed.
      const hud = 1 - seg(t, R + 0.1, R + 0.4);
      if (hud > 0) {
        const nO = [0, 1, 2, 3].filter(i => t >= spawn(i)).length, nR = runes.filter(r => t >= r[2]).length;
        ctx.save(); ctx.globalAlpha = hud;
        ctx.fillStyle = 'rgba(12,8,26,0.6)'; ctx.beginPath(); ctx.roundRect(14, 222, 150, 26, 8); ctx.fill();
        g.rock(30, 235, 5, { rot: 0.5 }); g.label('x' + nO, 48, 235, { color: EL.earth });
        g.rune(80, 235, 7, { color: EL.fire, alpha: nR ? 1 : 0.3, spin: 0.8 }); g.label('x' + nR, 98, 235, { color: EL.fire });
        ctx.fillStyle = t >= STORE ? EL.arcane : 'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.roundRect(124, 228, 13, 13, 3); ctx.fill();
        g.label(t >= STORE ? 'x1' : 'x0', 148, 235, { color: EL.arcane });
        ctx.restore();
      }
    },
  });

  // ---------- 10. Yank enemy ----------
  SG.register({
    id: 'yank-enemy',
    name: 'Yank Enemy',
    family: 'control',
    status: 'tree',
    oneLiner: 'Point arcane at an enemy and a tether drags it over everything to your feet.',
    situation: 'A caster hides behind brutes and peppers you from safety.',
    coop: 'You yank the caster out, your ally finishes it before the brutes turn around.',
    source: 'Spell tree: Point + Arcane, on an enemy',
    duration: 5.4,
    floor: 'stone',
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL } = g;
      const hx = 66, hy = 130, ax = 104, ay = 202, cx0 = 330, cy0 = 130, lx = 128, ly = 128;
      const T0 = 1.85, P0 = 2.05, P1 = 2.75, FB = 2.95, FH = 3.25;
      const brutes = [[250, 106], [254, 154]];

      // Caster position over time.
      const pp = seg(t, P0, P1);
      let [cx, cy, cg] = [cx0, cy0, cy0];
      if (pp > 0) [cx, cy, cg] = toss(cx0, cy0, lx, ly, 52, ease.inOut(pp));

      // Brutes: shield the caster, then turn around confused and lumber after it.
      brutes.forEach(([x, y], i) => {
        const go = ease.inOut(seg(t, 3.4, 5.0));
        const bx = x - 60 * go;
        g.enemy(bx + Math.sin(t * 3 + i) * 1.2, y, { color: g.ACTOR.brute, r: 13, facing: t > P0 + 0.2 ? g.angle(x, y, cx, cy) : Math.PI });
        tag(g, '?', bx, y - 24, P0 + 0.25, P0 + 1.3, '#ffb6a0');
      });

      // Caster shots before the yank.
      [0.45, 1.1].forEach((s, k) => {
        const fp = seg(t, s, s + 0.45); if (fp <= 0) return;
        const ex = hx + 26, ey = hy - 10 + k * 18;
        if (fp < 1) { const [x, y] = toss(cx0 - 10, cy0, ex, ey, 30, fp); g.orb(x, y, 3.5, EL.arcane); }
        g.burst(ex, ey, t - s - 0.45, { seed: k + 40, count: 10, color: EL.arcane, speed: 40, life: 0.35, size: 2 });
      });

      // The caster itself.
      const dieA = t - FH;
      if (pp > 0 && pp < 1) groundShadow(g, cx, cg, 7, 0.7);
      g.enemy(cx, cy, {
        color: g.ACTOR.imp, r: 9, facing: pp > 0 && pp < 1 ? t * 14 : Math.PI,
        status: t >= P1 && t < FH ? 'stunned' : dieA >= 0 ? 'burning' : [],
        hit: dieA >= 0 ? Math.max(0, 1 - dieA * 3) : 0, hp: dieA >= 0 ? 1 - seg(dieA, 0, 0.3) : 1, dead: seg(dieA, 0.5, 0.9),
      });
      tag(g, 'caster', cx0, cy0 - 22, 0.2, 1.4, '#d5b8ff');
      g.burst(lx, ly + 6, t - P1, { seed: 4, count: 12, color: '#c8b49a', speed: 40, life: 0.4, size: 2 });

      // Hero: arcane, point cast, tether.
      const hf = g.angle(hx, hy, t < P1 ? cx : lx, t < P1 ? cy : ly);
      g.wizard(hx, hy, { facing: hf, tip: EL.arcane, casting: seg(t, 1.5, T0) * (1 - seg(t, P1, P1 + 0.3)) });
      if (t >= 1.0 && t < T0) g.queue(hx, hy - 22, ['arcane']);
      const cp = ease.inOut(seg(t, 1.0, 1.55));
      if (t >= 1.0 && t < P0 + 0.1) g.cursor(lerp(180, cx0, cp), lerp(150, cy0, cp), { alpha: 0.9 * (1 - seg(t, P0 - 0.1, P0 + 0.1)) });
      tag(g, 'point', cx0, cy0 + 22, 1.5, P0 + 0.2, '#ffffff');
      if (t >= T0 && t < P1 + 0.1) {
        const [tx, ty] = staffTip(hx, hy, hf, 1);
        const a = seg(t, T0, T0 + 0.1) * (1 - seg(t, P1 - 0.05, P1 + 0.1));
        const reach = ease.out(seg(t, T0, P0));
        ctx.save(); ctx.globalAlpha = a;
        g.beam(tx, ty, lerp(tx, cx, reach), lerp(ty, cy, reach), { color: EL.arcane, width: 3, alpha: a });
        ctx.restore();
      }
      tag(g, 'yank!', hx + 30, hy - 40, P0, P1 + 0.3, EL.arcane, 10);

      // Ally finishes it.
      const af = g.angle(ax, ay, lx, ly);
      g.wizard(ax, ay, { color: g.ACTOR.ally, facing: af, tip: EL.fire, casting: seg(t, 2.7, FB) * (1 - seg(t, FB, FB + 0.3)) });
      tag(g, 'ally', ax, ay + 20, 0.3, 1.5, g.ACTOR.ally);
      const fp = seg(t, FB, FH);
      if (fp > 0 && fp < 1) {
        const [sx, sy] = staffTip(ax, ay, af, 1);
        const pos = (tt) => { const q = seg(tt, FB, FH); return [lerp(sx, lx, q), lerp(sy, ly, q)]; };
        g.trail(pos, { color: EL.fire, len: 0.12, width: 5, from: FB });
        g.orb(...pos(t), 5, EL.fire);
      }
      g.explosion(lx, ly, dieA, { color: EL.fire, r: 30 });
      g.popup('-120', lx, ly - 18, dieA - 0.1);
    },
  });
})();
