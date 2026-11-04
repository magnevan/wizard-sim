// Builder D: new support / ally-empowerment ideas from research.
// Every ally buff here is deliberate: aimed, timed, or opted into by the ally.
(function () {
  const PALE = '#fff3c4';
  const RED = '#ff4d4d';

  // Staff tip of g.wizard (mirrors the engine's staff geometry).
  function tipOf(x, y, f, cast = 0, s = 1) {
    const sx = x + Math.cos(f + 0.5) * 6 * s, sy = y + Math.sin(f + 0.5) * 6 * s;
    return [sx + Math.cos(f) * (16 + cast * 3) * s, sy + Math.sin(f) * (16 + cast * 3) * s];
  }
  // Small HP bar above an actor.
  function hpBar(g, x, y, hp, o = {}) {
    const { ctx } = g, w = o.w || 22;
    ctx.fillStyle = 'rgba(10,6,20,0.8)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
    ctx.fillStyle = o.color || (hp < 0.3 ? '#ff5d73' : '#5fe07a');
    ctx.fillRect(x - w / 2, y, w * g.clamp(hp), 3);
  }
  // Point on a lobbed arc; returns [x, y (lifted), groundY, height 0..1].
  function lob(x1, y1, x2, y2, p, h) {
    const lift = Math.sin(Math.PI * p);
    return [x1 + (x2 - x1) * p, y1 + (y2 - y1) * p - lift * h, y1 + (y2 - y1) * p, lift];
  }
  // Red enemy telegraph: outer ring + inner fill growing with p.
  function telegraph(g, x, y, r, p, a = 1) {
    const { ctx, TAU } = g;
    ctx.save();
    ctx.fillStyle = g.hexA(RED, 0.12 * a); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = g.hexA(RED, 0.28 * a); ctx.beginPath(); ctx.arc(x, y, r * p, 0, TAU); ctx.fill();
    ctx.strokeStyle = g.hexA(RED, 0.85 * a); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  // Screen shake: translate the context for `age` in [0, 0.4).
  function shake(g, age, amp) {
    if (age < 0 || age > 0.4) return;
    const k = (1 - age / 0.4) * amp;
    g.ctx.translate(Math.sin(age * 90) * k, Math.cos(age * 70) * k * 0.6);
  }
  // A short arrow pointing along angle a, tip at (x,y).
  function arrow(g, x, y, a, o = {}) {
    const { ctx } = g, l = o.len || 15;
    ctx.save(); ctx.globalAlpha = o.alpha ?? 1; ctx.strokeStyle = '#f4efe6'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * l, y - Math.sin(a) * l); ctx.lineTo(x, y); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(a - 0.5) * 4, y - Math.sin(a - 0.5) * 4); ctx.lineTo(x, y);
    ctx.lineTo(x - Math.cos(a + 0.5) * 4, y - Math.sin(a + 0.5) * 4); ctx.stroke();
    ctx.restore();
  }
  // Countdown ring: full circle draining clockwise as p goes 0 -> 1.
  function timerRing(g, x, y, r, p, color, a = 1) {
    const { ctx } = g;
    ctx.save();
    ctx.strokeStyle = 'rgba(10,6,20,0.5)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, r, 0, g.TAU); ctx.stroke();
    ctx.strokeStyle = g.hexA(color, a); ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2 + p * g.TAU, -Math.PI / 2 + g.TAU); ctx.stroke();
    ctx.restore();
  }
  function hourglassIcon(g, x, y, color, a = 1) {
    const { ctx } = g;
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = 'rgba(12,8,26,0.75)';
    ctx.beginPath(); ctx.roundRect(x - 7, y - 8, 14, 16, 4); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(x - 4, y - 5); ctx.lineTo(x + 4, y - 5); ctx.lineTo(x, y); ctx.lineTo(x + 4, y + 5); ctx.lineTo(x - 4, y + 5); ctx.lineTo(x, y);
    ctx.closePath(); ctx.fill(); ctx.restore();
  }

  // ---------------------------------------------------------------- 1
  SG.register({
    id: 'stay-of-death',
    name: 'Stay of Death',
    family: 'support',
    status: 'new',
    oneLiner: 'Toss a pale lantern; for two seconds nobody in its glow can drop below 1 HP.',
    situation: 'A big telegraphed slam is about to land on an ally who cannot escape.',
    coop: 'Pure timing: too early and it expires, too late and they fall. Read the wind-up.',
    source: "Overwatch: Baptiste's Immortality Field; Dota 2: Dazzle's Shallow Grave",
    duration: 5,
    draw(g, t) {
      const { ctx, seg, ease, lerp, between, EL, ACTOR } = g;
      const hx = 85, hy = 185, ax = 236, ay = 152, bx = 310, by = 112;
      const wind = seg(t, 0.6, 2.2), slamAge = t - 2.2;
      const lx = 226, ly = 166;                       // lantern landing spot
      const lantP = seg(t, 1.3, 1.75), landed = t >= 1.75;
      const domeIn = seg(t, 1.75, 1.95), domeOut = seg(t, 3.5, 3.8);
      const domeA = domeIn * (1 - domeOut) * (t > 3.5 ? (Math.sin(t * 70) > 0 ? 1 : 0.35) : 1);

      ctx.save();
      shake(g, slamAge, 5);

      if (between(t, 0.6, 2.3)) telegraph(g, ax, ay, 46, ease.in(wind), 1 - seg(t, 2.2, 2.3));
      if (domeA > 0) g.zone(lx, ly - 6, 46, { color: PALE, alpha: 0.18 * domeA, edge: 0.6 * domeA });

      // ally retreats toward the hero after surviving
      const back = ease.inOut(seg(t, 3.9, 4.6));
      const axx = lerp(ax, 170, back), ayy = lerp(ay, 176, back);
      const hp = slamAge < 0 ? 0.7 : lerp(0.7, 0.04, ease.out(seg(slamAge, 0, 0.25)));
      const hitFlash = slamAge > 0 ? Math.max(0, 1 - slamAge * 3) : 0;
      g.wizard(axx, ayy, { color: ACTOR.ally, facing: back > 0 ? Math.PI : -0.5, tip: EL.fire });
      if (hitFlash > 0) g.glow(axx, ayy, 18, '#ffffff', hitFlash);
      hpBar(g, axx, ayy - 22, hp);

      // brute: rears back during wind-up, lunges on the slam
      const rear = ease.out(wind) * 12 * (slamAge < 0 ? 1 : 0);
      const lunge = slamAge >= 0 ? (slamAge < 0.12 ? ease.out(slamAge / 0.12) : 1 - ease.inOut(seg(slamAge, 0.12, 0.7))) * 26 : 0;
      const ang = g.angle(bx, by, ax, ay);
      const brx = bx - Math.cos(ang) * rear + Math.cos(ang) * lunge, bry = by - Math.sin(ang) * rear + Math.sin(ang) * lunge;
      g.enemy(brx, bry, { r: 24 + wind * 3 * (slamAge < 0 ? 1 : 0), color: ACTOR.brute, facing: ang });
      // wind-up meter above the brute
      if (between(t, 0.6, 2.3)) {
        ctx.fillStyle = 'rgba(10,6,20,0.8)'; ctx.fillRect(brx - 20, bry - 38, 40, 5);
        ctx.fillStyle = RED; ctx.fillRect(brx - 19, bry - 37, 38 * wind, 3);
        if (landed) { ctx.fillStyle = PALE; ctx.fillRect(brx - 19 + 38 * seg(1.75, 0.6, 2.2) - 1, bry - 40, 2, 9); }
      }

      // hero tosses the lantern
      const cast = seg(t, 0.95, 1.3) * (1 - seg(t, 1.35, 1.7));
      g.wizard(hx, hy, { facing: g.angle(hx, hy, lx, ly), tip: PALE, casting: cast });
      const [tx, ty] = tipOf(hx, hy, g.angle(hx, hy, lx, ly), 1);
      if (lantP > 0 && !landed) {
        const [x, y, gy] = lob(tx, ty, lx, ly, lantP, 50);
        g.shadow(x, gy, 3);
        drawLantern(g, x, y, 0.6);
      }
      if (landed && domeA > 0.02) drawLantern(g, lx, ly, domeA);
      else if (landed) drawLantern(g, lx, ly, 0, 1 - seg(t, 3.8, 4.1));
      g.burst(lx, ly, t - 1.75, { seed: 4, count: 14, color: PALE, speed: 70, life: 0.5, size: 2 });
      if (domeA > 0) g.bubble(lx, ly - 6, 46, { color: PALE, alpha: 0.6 * domeA, hit: slamAge > 0 && slamAge < 0.5 ? 1 - slamAge * 2 : 0 });

      g.explosion(axx, ayy, slamAge, { color: RED, r: 34, seed: 9 });
      g.burst(axx, ayy - 6, slamAge - 0.1, { seed: 5, count: 16, color: PALE, speed: 50, life: 0.8, size: 2, dir: -Math.PI / 2, spread: 2 });
      ctx.restore();

      if (slamAge > 0 && slamAge < 1.4) g.label('1 HP', axx, ayy - 34 - Math.min(slamAge, 0.3) * 20, { color: PALE, size: 10, alpha: 1 - seg(slamAge, 1.1, 1.4) });
      if (between(t, 1.75, 2.2)) g.label('just in time', 160, 230, { color: PALE, alpha: seg(t, 1.75, 1.85) });
    },
  });

  function drawLantern(g, x, y, lit, alpha = 1) {
    const { ctx } = g;
    if (alpha <= 0) return;
    if (lit > 0) g.glow(x, y - 4, 24, PALE, 0.7 * lit);
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.fillStyle = '#3a3048'; ctx.fillRect(x - 4, y - 11, 8, 3);
    ctx.fillStyle = g.mix('#8a8270', PALE, lit); ctx.fillRect(x - 3.5, y - 8, 7, 8);
    ctx.strokeStyle = '#2a2236'; ctx.lineWidth = 1; ctx.strokeRect(x - 3.5, y - 8, 7, 8);
    ctx.beginPath(); ctx.arc(x, y - 12, 2.5, Math.PI, 0); ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- 2
  SG.register({
    id: 'kindred-step',
    name: 'Kindred Step',
    family: 'movement',
    status: 'new',
    oneLiner: "Blink to an ally's side, even through walls, arriving with a brief guard around you both.",
    situation: 'An ally is cornered behind a wall and needs a body and a shield there now.',
    coop: 'Only targets allies. Commit forward to rescue, then choose: hold together or retreat.',
    source: "Overwatch: Kiriko's Swift Step; Magicka: Teleport",
    duration: 5,
    draw(g, t) {
      const { ctx, seg, ease, lerp, between, EL, ACTOR } = g;
      const hx0 = 95, hy0 = 130, ax = 305, ay = 185;
      const hx1 = 280, hy1 = 168, gx = 294, gy = 180, GR = 34;
      g.wall(190, 40, 15, 180);

      // cursor finds the ally
      const curP = ease.inOut(seg(t, 0.3, 0.9));
      const cx = lerp(150, ax, curP), cy = lerp(110, ay, curP);
      const aimA = seg(t, 0.4, 0.6) * (1 - seg(t, 1.1, 1.25));
      if (aimA > 0) g.aim(hx0, hy0, cx, cy, { alpha: 0.6 * aimA, color: ACTOR.ally });
      const lock = seg(t, 0.9, 1.0) * (1 - seg(t, 1.2, 1.4));
      if (lock > 0) g.ring(ax, ay, 15 + (1 - lock) * 8, { color: ACTOR.ally, alpha: lock, width: 2 });

      // guard bubble
      const gIn = ease.back(seg(t, 1.6, 1.8)), gOut = seg(t, 2.9, 3.2);
      const gr = GR * gIn;

      // enemies close in, bounce off the guard, then get washed back
      const starts = [[372, 224], [372, 150], [336, 232]];
      starts.forEach(([sx, sy], i) => {
        const a = g.angle(gx, gy, sx, sy), d0 = g.dist(gx, gy, sx, sy);
        let d = lerp(d0, GR + 9, seg(t, 0.2, 2.0));
        d += 14 * ease.out(seg(t, 2.0, 2.3)) * (1 - seg(t, 2.6, 3.0) * 0.6);
        d += 36 * ease.out(seg(t, 3.35, 3.9));
        const x = gx + Math.cos(a) * d, y = gy + Math.sin(a) * d;
        const hit = between(t, 2.0, 2.3) ? 1 - seg(t, 2.0, 2.3) : 0;
        g.enemy(x, y, { r: 9, facing: a + Math.PI, hit, status: t > 3.4 && t < 4.4 ? 'slowed' : [] });
        if (gIn > 0) g.burst(gx + Math.cos(a) * GR, gy + Math.sin(a) * GR, t - 2.0, { seed: i + 3, count: 8, color: '#ffffff', speed: 60, life: 0.35, size: 1.8, dir: a, spread: 1.6 });
      });

      g.wizard(ax, ay, { color: ACTOR.ally, facing: 0.2, tip: EL.fire });
      hpBar(g, ax, ay - 22, 0.22);

      // hero: dissolve, streak, reappear
      const outA = 1 - seg(t, 1.1, 1.3), inA = seg(t, 1.6, 1.75);
      const sprayOn = between(t, 3.3, 4.0);
      if (t < 1.3) g.wizard(hx0, hy0, { facing: g.angle(hx0, hy0, ax, ay), tip: EL.arcane, casting: seg(t, 0.7, 1.1), alpha: outA });
      g.burst(hx0, hy0, t - 1.15, { seed: 7, count: 18, color: ACTOR.hero, speed: 50, life: 0.5, size: 2 });
      const path = (tt) => { const p = ease.inOut(seg(tt, 1.2, 1.6)); const [x, y] = lob(hx0, hy0, hx1, hy1, p, 70); return [x, y]; };
      if (between(t, 1.2, 1.62)) {
        g.trail(path, { color: ACTOR.hero, len: 0.2, width: 5, from: 1.2 });
        const [x, y] = path(t); g.orb(x, y, 4, ACTOR.hero);
      }
      if (t >= 1.6) {
        const f = sprayOn ? -0.15 : 0.3;
        g.wizard(hx1, hy1, { facing: f, tip: sprayOn ? EL.water : EL.arcane, alpha: inA, casting: sprayOn ? 1 : 0 });
        if (sprayOn) { const [sx, sy] = tipOf(hx1, hy1, f, 1); g.spray(sx, sy, f + 0.15, { color: EL.water, spread: 1.4, len: 95, count: 34, size: 3 }); }
      }
      g.burst(hx1, hy1, t - 1.6, { seed: 8, count: 18, color: ACTOR.hero, speed: 70, life: 0.45, size: 2 });

      if (gr > 0 && gOut < 1) g.bubble(gx, gy, gr, { color: EL.shield, alpha: (1 - gOut) * (t > 2.9 ? (Math.sin(t * 60) > 0 ? 1 : 0.4) : 1), hit: between(t, 2.0, 2.35) ? 1 - seg(t, 2.0, 2.35) : 0 });

      if (between(t, 0.3, 1.25)) g.cursor(cx, cy);
      if (between(t, 1.7, 2.6)) g.label('guard', gx, gy - GR - 10, { color: EL.shield, alpha: seg(t, 1.7, 1.8) * (1 - seg(t, 2.45, 2.6)) });
    },
  });

  // ---------------------------------------------------------------- 3
  SG.register({
    id: 'conduit-sigil',
    name: 'Conduit Sigil',
    family: 'enchant',
    status: 'new',
    oneLiner: 'Mark an ally; your spells pass through them harmlessly and fire out their staff, amplified.',
    situation: 'Your ally has line of sight to a target you cannot reach, and you have the bigger beam.',
    coop: 'The only safe way to shoot through a friend. You supply the power, they aim it.',
    source: "Original; echoes Zarya's barrier-to-energy conversion (Overwatch)",
    duration: 5.5,
    draw(g, t) {
      const { ctx, seg, ease, lerp, between, EL, ACTOR } = g;
      const hx = 78, hy = 205, ax = 238, ay = 198, bx = 330, by = 72;
      g.wall(150, 10, 15, 170);

      // 1) direct shot blocked
      const blockA = seg(t, 0.25, 0.4) * (1 - seg(t, 0.85, 1.0));
      const wallHit = [157, hy + (by - hy) * ((157 - hx) / (bx - hx))];
      if (blockA > 0) {
        g.aim(hx, hy, wallHit[0], wallHit[1], { color: RED, alpha: 0.8 * blockA });
        g.label('no line', wallHit[0] - 30, wallHit[1] - 4, { color: '#ffb3b3', alpha: blockA });
      }

      // 2) sigil on the ally
      const tapP = seg(t, 1.0, 1.3);
      const sigA = seg(t, 1.3, 1.5) * (1 - seg(t, 4.4, 4.9));
      if (sigA > 0) g.rune(ax, ay, 17, { color: EL.arcane, alpha: 0.9 * sigA, spin: 1.4, armed: sigA });

      // brute
      const dmg = seg(t, 2.0, 3.8);
      const dead = seg(t, 3.8, 4.2);
      const beamOut = between(t, 1.9, 3.9);
      g.enemy(bx, by, { r: 24, color: ACTOR.brute, facing: g.angle(bx, by, ax, ay), hp: 1 - dmg * 0.95, hit: beamOut && t > 2.0 ? 0.35 + 0.25 * Math.sin(t * 40) : 0, status: beamOut && t > 2.0 ? 'burning' : [], dead });
      g.explosion(bx, by, t - 3.8, { color: EL.fire, r: 30, seed: 6 });

      // ally aims at the brute, sweeping slightly
      const sweep = Math.sin((t - 1.9) * 3) * 0.06;
      const af = g.angle(ax, ay, bx, by) + (beamOut ? sweep : 0);
      g.wizard(ax, ay, { color: ACTOR.ally, facing: af, tip: sigA > 0 ? EL.arcane : EL.cold, casting: beamOut ? 1 : 0 });
      hpBar(g, ax, ay - 22, 1);
      const hf = between(t, 0.2, 1.0) ? g.angle(hx, hy, bx, by) : g.angle(hx, hy, ax, ay);
      const heroBeam = between(t, 1.6, 3.9);
      g.wizard(hx, hy, { facing: hf, tip: heroBeam ? EL.fire : EL.arcane, casting: heroBeam ? 1 : seg(t, 0.85, 1.0) * (1 - seg(t, 1.2, 1.4)) });

      if (between(t, 1.0, 1.32)) {
        const [tx, ty] = tipOf(hx, hy, hf, 1);
        g.orb(lerp(tx, ax, tapP), lerp(ty, ay, tapP), 3, EL.arcane);
      }
      if (sigA > 0 && between(t, 1.3, 2.0)) g.label('sigil', ax, ay + 26, { color: EL.arcane, alpha: seg(t, 1.3, 1.4) * (1 - seg(t, 1.85, 2.0)) });

      // 3) hero beam into ally, amplified beam out of ally
      const fade = 1 - seg(t, 3.7, 3.9);
      if (heroBeam) {
        const [tx, ty] = tipOf(hx, hy, hf, 1);
        const grow = seg(t, 1.6, 1.8);
        g.beam(tx, ty, lerp(tx, ax, grow), lerp(ty, ay, grow), { color: EL.fire, width: 5, alpha: fade });
        if (t > 1.8) g.glow(ax, ay, 26, EL.fire, 0.6 * fade);
      }
      if (beamOut) {
        const [tx, ty] = tipOf(ax, ay, af, 1);
        const grow = ease.out(seg(t, 1.9, 2.05));
        const L = g.dist(tx, ty, bx, by) - (dead > 0 ? 0 : 10);
        const ex = tx + Math.cos(af) * L * grow, ey = ty + Math.sin(af) * L * grow;
        g.beam(tx, ty, ex, ey, { color: EL.fire, width: 10, alpha: fade });
        g.beam(tx, ty, ex, ey, { color: EL.arcane, width: 4, alpha: fade });
        if (between(t, 2.1, 3.5)) g.label('x1.5', lerp(tx, bx, 0.45) + 16, lerp(ty, by, 0.45) + 6, { color: '#ffd166', alpha: seg(t, 2.1, 2.2) * (1 - seg(t, 3.35, 3.5)) });
      }
    },
  });

  // ---------------------------------------------------------------- 4
  SG.register({
    id: 'hourglass-mark',
    name: 'Hourglass Mark',
    family: 'enchant',
    status: 'new',
    oneLiner: 'Brand an ally; seconds later they snap back to where they stood, undoing damage taken since.',
    situation: 'An ally is about to dive into a crowd and you want a guaranteed way back.',
    coop: 'Prediction skill: mark before the risk, not after. Lets beginners play bold under a safety net.',
    source: "League: Ekko's Chronobreak; Overwatch: Tracer's Recall",
    duration: 5,
    draw(g, t) {
      const { ctx, seg, ease, lerp, between, EL, ACTOR } = g;
      const hx = 66, hy = 200, gx = 120, gy = 140, dx = 272, dy = 132;
      const markOn = t >= 0.6, rewindP = ease.inOut(seg(t, 3.3, 3.7));
      const timerP = seg(t, 0.6, 3.3);

      // ghost marker at the start spot
      const ghostA = seg(t, 0.6, 0.8) * (1 - seg(t, 3.6, 3.75));
      if (ghostA > 0) {
        g.wizard(gx, gy, { color: ACTOR.ally, facing: 0, alpha: 0.35 * ghostA });
        timerRing(g, gx, gy, 15, timerP, EL.cold, ghostA);
        hourglassIcon(g, gx, gy - 28, EL.cold, ghostA);
      }

      // blobs: three pop in the blast, two survive and bite
      const blobs = [[300, 98, 1], [318, 160, 1], [334, 124, 0], [250, 172, 1], [296, 196, 0]];
      const blastAge = t - 1.65;
      blobs.forEach(([x, y, pops], i) => {
        const a = g.angle(x, y, dx, dy);
        if (pops) {
          const dead = seg(blastAge, 0.05, 0.45);
          const kb = ease.out(seg(blastAge, 0, 0.3)) * 18;
          g.enemy(x - Math.cos(a) * kb, y - Math.sin(a) * kb, { r: 9, facing: a, hit: blastAge > 0 ? 1 : 0, dead });
        } else {
          // lunge at the ally three times
          let lx = x, ly = y;
          const tgtX = rewindP > 0 ? lerp(dx, gx, rewindP) : dx;
          for (const h of [2.1, 2.5, 2.9]) {
            const p = seg(t, h - 0.12, h) * (1 - seg(t, h, h + 0.2));
            lx += Math.cos(a) * p * 18; ly += Math.sin(a) * p * 18;
          }
          const conf = between(t, 3.75, 4.6);
          const f = conf ? a + Math.sin(t * 9 + i) * 1.4 : g.angle(lx, ly, tgtX, dy);
          g.enemy(lx, ly, { r: 10, facing: f });
          if (conf) g.label('?', lx, ly - 18, { alpha: seg(t, 3.75, 3.9) * (1 - seg(t, 4.4, 4.6)) });
        }
      });
      g.explosion(dx, dy, blastAge, { color: EL.arcane, r: 48, seed: 11 });

      // the ally
      const dash = ease.inOut(seg(t, 0.9, 1.45));
      let ax = lerp(gx, dx, dash), ay = lerp(gy, dy, dash);
      if (rewindP > 0) { ax = lerp(dx, gx, rewindP); ay = lerp(dy, gy, rewindP); }
      const hits = [2.1, 2.5, 2.9].filter(h => t >= h).length;
      let hp = 1 - hits * 0.27;
      if (t >= 3.3) hp = lerp(0.19, 1, ease.out(seg(t, 3.5, 3.8)));
      let flash = 0;
      for (const h of [2.1, 2.5, 2.9]) if (between(t, h, h + 0.2)) flash = 1 - seg(t, h, h + 0.2);
      if (between(t, 3.3, 3.72)) {
        const path = (tt) => { const p = ease.inOut(seg(tt, 3.3, 3.7)); return [lerp(dx, gx, p), lerp(dy, gy, p)]; };
        g.trail(path, { color: EL.cold, len: 0.25, width: 10, from: 3.3 });
        for (let i = 0; i < 10; i++) {
          const p = g.clamp(rewindP - 0.04 * i);
          g.orb(lerp(dx, gx, p) + (g.rand(i, 4) - 0.5) * 12, lerp(dy, gy, p) + (g.rand(i, 5) - 0.5) * 12, 1.6, EL.cold, { alpha: 1 - i / 10 });
        }
      }
      const ghosty = between(t, 3.3, 3.7) ? 0.45 : 1;
      g.wizard(ax, ay, { color: ACTOR.ally, facing: rewindP > 0 ? Math.PI : 0, tip: EL.arcane, casting: seg(t, 1.45, 1.65) * (1 - seg(t, 1.7, 1.9)), alpha: ghosty });
      if (flash > 0) g.glow(ax, ay, 16, RED, flash);
      if (markOn) hpBar(g, ax, ay - 22, hp);
      else hpBar(g, ax, ay - 22, 1);
      g.burst(gx, gy, t - 3.7, { seed: 12, count: 16, color: EL.cold, speed: 60, life: 0.5, size: 2 });
      if (between(t, 3.7, 4.6)) g.label('rewound', gx, gy - 34, { color: EL.cold, alpha: seg(t, 3.7, 3.8) * (1 - seg(t, 4.45, 4.6)) });

      // hero brands the ally
      g.wizard(hx, hy, { facing: g.angle(hx, hy, gx, gy), tip: EL.cold, casting: seg(t, 0.1, 0.3) * (1 - seg(t, 0.55, 0.8)) });
      if (between(t, 0.3, 0.62)) {
        const [tx, ty] = tipOf(hx, hy, g.angle(hx, hy, gx, gy), 1), p = seg(t, 0.3, 0.6);
        g.orb(lerp(tx, gx, p), lerp(ty, gy, p), 3, EL.cold);
      }
      g.burst(gx, gy, t - 0.6, { seed: 13, count: 12, color: EL.cold, speed: 50, life: 0.4, size: 2 });
    },
  });

  // ---------------------------------------------------------------- 5
  SG.register({
    id: 'bulwark-shield',
    name: 'Bulwark',
    family: 'weapon',
    status: 'new',
    oneLiner: 'Conjure a tower shield: hold it to block a frontal arc, bash to shove enemies.',
    situation: 'Escorting a fragile ally across a lane swept by enemy archers.',
    coop: 'Allies tucked behind you can step out past the edge and cast, then duck back in.',
    source: "Overwatch: Reinhardt's Barrier Field; League: Braum's Unbreakable",
    duration: 5,
    draw(g, t) {
      const { ctx, seg, ease, lerp, between, EL, ACTOR } = g;
      const hxAt = (tt) => 118 + 30 * g.clamp(tt - 0.5, 0, 2.5);
      const hy = 140;
      const hx = hxAt(t);
      const archers = [[368, 72], [368, 200]];
      const SR = 24;

      // top archer gets hit by the ally's bolt at 2.05
      const boltHit = t - 2.05;
      archers.forEach(([x, y], i) => {
        const hurt = i === 0 && boltHit > 0;
        g.enemy(x, y, { r: 11, color: ACTOR.enemy, facing: g.angle(x, y, hx, hy), hp: hurt ? 0.35 : 1, hit: hurt ? Math.max(0, 1 - boltHit * 3) : 0, status: hurt && boltHit < 1.5 ? 'burning' : [] });
      });

      // melee blob walks in and gets bashed
      const bashAge = t - 3.2;
      const mStart = [392, 150];
      const contact = [hxAt(3.2) + 34, 146];
      const mp = ease.inOut(seg(t, 1.6, 3.2));
      let mx = lerp(mStart[0], contact[0], mp), my = lerp(mStart[1], contact[1], mp);
      if (bashAge > 0) mx += ease.out(seg(bashAge, 0, 0.4)) * 70;
      g.enemy(mx, my, { r: 11, color: ACTOR.brute, facing: Math.PI, hit: bashAge > 0 ? Math.max(0, 1 - bashAge * 3) : 0, status: bashAge > 0.3 && bashAge < 1.6 ? 'stunned' : [] });
      g.burst(contact[0] - 8, contact[1], bashAge, { seed: 21, count: 16, color: EL.earth, speed: 90, life: 0.4, size: 2.5, dir: 0, spread: 1.6 });

      // ally peeks out past the shield edge to cast
      const peek = seg(t, 1.35, 1.6) * (1 - seg(t, 2.2, 2.45));
      const ax = hx - 24 + peek * 14, ay = hy + 4 - peek * 36;
      const af = peek > 0.5 ? g.angle(ax, ay, archers[0][0], archers[0][1]) : 0;
      g.wizard(ax, ay, { color: ACTOR.ally, facing: af, tip: EL.fire, casting: seg(t, 1.55, 1.75) * (1 - seg(t, 1.8, 2.0)) });
      const boltP = seg(t, 1.75, 2.05);
      if (boltP > 0 && boltP < 1) {
        const [tx, ty] = tipOf(ax, ay, af, 1);
        g.orb(lerp(tx, archers[0][0], boltP), lerp(ty, archers[0][1], boltP), 3.5, EL.fire);
      }
      g.explosion(archers[0][0], archers[0][1], boltHit, { color: EL.fire, r: 18, seed: 22, count: 16 });

      // hero with shield
      const bash = bashAge > 0 ? (bashAge < 0.1 ? ease.out(bashAge / 0.1) : 1 - ease.inOut(seg(bashAge, 0.1, 0.45))) * 12 : 0;
      g.wizard(hx, hy, { facing: 0, tip: EL.earth });
      drawShield(g, hx + bash, hy, SR, 0);

      // arrows: fired every 0.45s, travel 0.4s, thud into the shield and drop
      for (let k = 0; k < 8; k++) {
        const t0 = 0.3 + k * 0.45, t1 = t0 + 0.4;
        if (t < t0 || t > t1 + 0.5) continue;
        const [sx, sy] = archers[k % 2];
        const hxi = hxAt(t1);
        const a = g.angle(hxi, hy, sx, sy);
        const ix = hxi + Math.cos(a) * (SR + 3), iy = hy + Math.sin(a) * (SR + 3);
        const fa = g.angle(sx, sy, ix, iy);
        if (t < t1) {
          const p = seg(t, t0, t1);
          arrow(g, lerp(sx, ix, p), lerp(sy, iy, p), fa);
        } else {
          const age = t - t1;
          arrow(g, ix + age * 10, iy + age * 30, fa + age * 3, { alpha: 1 - age / 0.5, len: 10 });
          g.burst(ix, iy, age, { seed: k, count: 6, color: '#ffffff', speed: 50, life: 0.25, size: 1.5, dir: fa + Math.PI, spread: 2 });
        }
      }
      if (between(t, 3.2, 3.9)) g.label('bash', contact[0], contact[1] - 26, { color: EL.earth, alpha: 1 - seg(t, 3.7, 3.9) });
    },
  });

  // Tower shield: thick earthen arc in front of (x,y) facing f.
  function drawShield(g, x, y, r, f) {
    const { ctx, EL } = g;
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = g.hexA(EL.shield, 0.25); ctx.lineWidth = 14;
    ctx.beginPath(); ctx.arc(x, y, r, f - 0.95, f + 0.95); ctx.stroke();
    ctx.strokeStyle = g.mix(EL.earth, '#6b4a2f', 0.3); ctx.lineWidth = 8; ctx.stroke();
    ctx.strokeStyle = g.hexA('#ffe7c2', 0.6); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r + 2.5, f - 0.85, f + 0.85); ctx.stroke();
    ctx.fillStyle = EL.shield; ctx.beginPath(); ctx.arc(x + Math.cos(f) * r, y + Math.sin(f) * r, 2.5, 0, g.TAU); ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- 6
  SG.register({
    id: 'stonemason-maul',
    name: "Stonemason's Maul",
    family: 'weapon',
    status: 'new',
    oneLiner: 'Conjure a maul: slam to raise a stone pillar, strike a pillar to send it rolling.',
    situation: 'Open ground with no cover, or a lined-up wave you want to bowl through.',
    coop: 'Build cover for allies on the fly, then bowl it at the enemy once they step clear.',
    source: "Dota 2: Earth Spirit's Stone Remnant and Boulder Smash",
    duration: 5.5,
    floor: 'meadow',
    draw(g, t) {
      const { ctx, seg, ease, lerp, between, EL, ACTOR } = g;
      const px = 162, py = 130, PR = 16;
      const boulderT0 = 2.75, BV = 170, BS = 22;
      const bxAt = (tt) => px + BV * (tt - boulderT0);
      const crumbleT = boulderT0 + (352 - px) / BV;

      // marching line of blobs; each is bowled aside when the boulder reaches it
      for (let i = 0; i < 4; i++) {
        const x0 = 312 + i * 26, y = py + (i % 2 ? 4 : -4);
        const hitT = (x0 - px + BV * boulderT0) / (BV + BS);
        let x = x0 - BS * Math.min(t, hitT), yy = y;
        const age = t - hitT;
        const side = i % 2 ? 1 : -1;
        if (age > 0) { x += ease.out(seg(age, 0, 0.5)) * 20; yy += side * ease.out(seg(age, 0, 0.5)) * 46; }
        g.enemy(x, yy, { r: 9, facing: Math.PI, hit: age > 0 ? Math.max(0, 1 - age * 3) : 0, dead: seg(age, 0.4, 0.8), status: age > 0 ? 'stunned' : [] });
        g.burst(x, y, age, { seed: 30 + i, count: 10, color: EL.earth, speed: 70, life: 0.4, size: 2, dir: side * Math.PI / 2, spread: 1.4 });
      }

      // spit shot at the ally, blocked by the pillar
      const spitP = seg(t, 1.55, 1.85);
      const spitFrom = [312 - BS * 1.55, py - 4];
      if (spitP > 0 && spitP < 1) g.orb(lerp(spitFrom[0], px + PR, spitP), lerp(spitFrom[1], py + 4, spitP), 3, EL.poison);
      g.burst(px + PR, py + 4, t - 1.85, { seed: 33, count: 12, color: EL.poison, speed: 60, life: 0.4, size: 2, dir: 0, spread: 2 });

      // pillar
      const rise = ease.back(seg(t, 0.8, 1.0));
      if (t >= 0.8 && t < boulderT0) g.pillar(px, py, PR * rise, { color: '#8d8272' });
      g.ring(px, py, 10 + ease.out(seg(t, 0.8, 1.2)) * 26, { color: EL.earth, alpha: 1 - seg(t, 0.8, 1.2), width: 3 });
      g.burst(px, py, t - 0.8, { seed: 34, count: 14, color: '#c9b79a', speed: 60, life: 0.5, size: 2.5 });
      if (between(t, 1.0, 1.5)) g.label('cover', px, py - 28, { color: EL.earth, alpha: 1 - seg(t, 1.35, 1.5) });

      // boulder
      if (t >= boulderT0 && t < crumbleT) {
        const bx = bxAt(t);
        for (let i = 1; i < 6; i++) g.burst(bx - i * 14, py + 6, t - boulderT0 - i * 0.05 > 0 ? 0.15 : -1, { seed: 40 + i + Math.floor(t * 8), count: 3, color: '#c9b79a', speed: 20, life: 0.4, size: 2.5 });
        g.rock(bx, py, PR, { rot: (bx - px) / PR, color: '#8d8272' });
      }
      g.burst(352, py, t - crumbleT, { seed: 41, count: 22, colors: ['#8d8272', EL.earth, '#c9b79a'], speed: 90, life: 0.6, size: 3 });
      g.ring(px, py, ease.out(seg(t, boulderT0, boulderT0 + 0.3)) * 30, { color: '#ffffff', alpha: (1 - seg(t, boulderT0, boulderT0 + 0.3)) * (t >= boulderT0 ? 1 : 0), width: 2 });

      // ally: hides behind the pillar, then steps clear
      const hide = ease.inOut(seg(t, 0.95, 1.45)), clear = ease.inOut(seg(t, 2.0, 2.4));
      const ax = lerp(lerp(56, 132, hide), 120, clear), ay = lerp(lerp(178, 146, hide), 196, clear);
      g.wizard(ax, ay, { color: ACTOR.ally, facing: 0, tip: EL.cold });
      if (between(t, 2.15, 2.75)) g.label('clear', ax, ay + 20, { color: ACTOR.ally, alpha: seg(t, 2.15, 2.25) * (1 - seg(t, 2.6, 2.75)) });

      // hero with maul: slam (0.4-0.8), step behind pillar, swing (2.45-2.75)
      const step = ease.inOut(seg(t, 2.1, 2.45));
      const hx = lerp(112, 132, step), hy = lerp(108, py, step);
      const slamWind = seg(t, 0.35, 0.7), slamHit = seg(t, 0.7, 0.8);
      const swingWind = seg(t, 2.45, 2.65), swingHit = seg(t, 2.65, 2.75);
      let ma;
      if (t < 1.6) ma = lerp(lerp(0.9, -1.9, ease.out(slamWind)), 0.7, ease.in(slamHit)); // over-the-head slam toward the pillar spot
      else ma = lerp(lerp(lerp(0.9, 0, seg(t, 1.6, 2.4)), -2.4, ease.out(swingWind)), 0.1, ease.in(swingHit));
      if (t > 2.9) ma = lerp(0.1, 0.4, seg(t, 2.9, 3.3));
      g.wizard(hx, hy, { facing: g.angle(hx, hy, px, py), tip: null });
      drawMaul(g, hx, hy, ma);
    },
  });

  function drawMaul(g, x, y, a) {
    const { ctx } = g;
    const hx = x + Math.cos(a) * 26, hy = y + Math.sin(a) * 26;
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = '#6b4a2f'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 4, y + Math.sin(a) * 4); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.translate(hx, hy); ctx.rotate(a);
    ctx.fillStyle = '#8d8272'; ctx.fillRect(-5, -9, 10, 18);
    ctx.strokeStyle = 'rgba(30,18,10,0.7)'; ctx.lineWidth = 1.2; ctx.strokeRect(-5, -9, 10, 18);
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(-5, -9, 3, 18);
    ctx.restore();
  }

  // ---------------------------------------------------------------- 7
  SG.register({
    id: 'fastball-sling',
    name: 'Fastball Sling',
    family: 'movement',
    status: 'new',
    oneLiner: 'Conjure a sling; an ally who steps in gets flung at your cursor, landing in a burst.',
    situation: 'A caster hides behind a crowd, out of reach for either player alone.',
    coop: 'You aim the landing, they choose to hop in. Never launches anyone involuntarily.',
    source: "X-Men's Fastball Special; launch pads in It Takes Two",
    duration: 5.5,
    draw(g, t) {
      const { ctx, seg, ease, lerp, between, EL, ACTOR } = g;
      const hx = 70, hy = 196, sx = 120, sy = 128;      // sling center
      const land = [322, 98];
      const launch0 = 1.8, launch1 = 2.6;
      const flyP = seg(t, launch0, launch1);
      const landAge = t - launch1;

      // sling posts
      const postIn = ease.back(seg(t, 0.35, 0.6));
      const p1 = [sx, sy - 20], p2 = [sx, sy + 20];

      // ally path: walk in, pull back, fly, fight
      const walk = ease.inOut(seg(t, 0.8, 1.35)), pull = ease.out(seg(t, 1.4, 1.75));
      let ax = lerp(lerp(52, sx - 6, walk), sx - 20, pull), ay = lerp(92, sy, walk), az = 0, scale = 1;
      if (t >= launch0) {
        const p = ease.inOut(flyP);
        const [x, y, gy, lift] = lob(sx - 20, sy, land[0], land[1], p, 70);
        ax = x; ay = gy; az = y - gy; scale = 1 + lift * 0.6;
        const close = ease.inOut(seg(t, 2.8, 3.0));     // step up to the stunned caster
        ax = lerp(ax, 340, close); ay = lerp(ay, 82, close);
      }
      // elastic
      if (postIn > 0) {
        const ex = t < launch0 ? ax : lerp(sx - 20, sx, seg(t, launch0, launch0 + 0.08));
        const ey = t < launch0 ? ay : sy;
        const snapped = t >= launch0 + 0.08;
        ctx.save(); ctx.strokeStyle = g.hexA(EL.life, 0.9 * postIn); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(...p1);
        if (walk > 0.8 && !snapped) ctx.lineTo(ex - 4, ey); else ctx.lineTo(sx + Math.sin(t * 50) * 3 * (1 - seg(t, launch0, launch0 + 0.5)) * (snapped ? 1 : 0), sy);
        ctx.lineTo(...p2); ctx.stroke(); ctx.restore();
        g.pillar(p1[0], p1[1], 6 * postIn, { color: g.mix(EL.life, '#2d5a2a', 0.4) });
        g.pillar(p2[0], p2[1], 6 * postIn, { color: g.mix(EL.life, '#2d5a2a', 0.4) });
      }

      // crowd in the middle, heads following the flying ally
      for (let i = 0; i < 6; i++) {
        const cx = 205 + (i % 3) * 26 + (i > 2 ? 12 : 0), cy = 112 + Math.floor(i / 3) * 0 + i * 15;
        const f = t >= launch0 && landAge < 1 ? g.angle(cx, cy, ax, ay + az) : g.angle(cx, cy, hx, hy);
        g.enemy(cx, cy, { r: 9, facing: f });
      }

      // caster behind them
      const kb = ease.out(seg(landAge, 0, 0.3));
      const [ix, iy] = [lerp(350, 366, kb), lerp(68, 58, kb)];
      const bonks = [3.1, 3.6, 4.1];
      const nb = bonks.filter(b => t >= b).length;
      const dead = seg(t, 4.3, 4.7);
      let hit = landAge > 0 ? Math.max(0, 1 - landAge * 3) : 0;
      for (const b of bonks) if (between(t, b, b + 0.25)) hit = 1 - seg(t, b, b + 0.25);
      g.enemy(ix, iy, { r: 18, color: ACTOR.imp, facing: g.angle(ix, iy, ax, ay), hp: landAge > 0 ? 0.7 - nb * 0.23 : 1, hit, status: landAge > 0.2 ? 'stunned' : [], dead });
      if (landAge < 0) g.sparks(ix, iy, { r: 22, color: EL.arcane, count: 2 });

      // the ally
      if (az < -1) g.shadow(ax, ay, 7);
      let bonk = 0;
      for (const b of bonks) bonk = Math.max(bonk, seg(t, b - 0.1, b) * (1 - seg(t, b, b + 0.15)));
      const af = t < launch0 ? 0 : g.angle(ax, ay, ix, iy);
      g.wizard(ax + Math.cos(af) * bonk * 6, ay + az + Math.sin(af) * bonk * 6, { color: ACTOR.ally, facing: af, tip: EL.cold, scale, casting: bonk });
      for (const b of bonks) g.popup('-25', ix, iy - 26, t - b, { size: 9 });
      if (between(t, 0.9, 1.6)) g.label('hop in', 70, 84, { color: ACTOR.ally, alpha: seg(t, 0.9, 1.0) * (1 - seg(t, 1.45, 1.6)) });

      // landing burst
      g.ring(land[0], land[1], ease.out(seg(landAge, 0, 0.4)) * 42, { color: EL.life, alpha: (1 - seg(landAge, 0, 0.4)) * (landAge > 0 ? 1 : 0), width: 4 });
      g.burst(land[0], land[1], landAge, { seed: 50, count: 22, colors: [EL.life, '#ffffff'], speed: 110, life: 0.5, size: 2.5 });
      g.explosion(ix, iy, t - 4.3, { color: ACTOR.imp, r: 22, seed: 51, count: 18 });

      // hero: places sling, then aims the landing
      const aimOn = between(t, 0.9, launch1);
      const cp = ease.inOut(seg(t, 0.9, 1.5));
      const cx = lerp(230, land[0], cp), cy = lerp(160, land[1], cp);
      g.wizard(hx, hy, { facing: aimOn ? g.angle(hx, hy, cx, cy) : g.angle(hx, hy, sx, sy), tip: EL.life, casting: seg(t, 0.1, 0.35) * (1 - seg(t, 0.5, 0.8)) });
      g.queue(hx, hy - 22, ['life', 'earth']);
      if (aimOn) {
        if (t < launch0) g.aim(sx, sy, cx, cy, { alpha: 0.35, color: EL.life });
        g.cursor(cx, cy, { color: EL.life });
      }
    },
  });

  // ---------------------------------------------------------------- 8
  SG.register({
    id: 'clothesline',
    name: 'Clothesline',
    family: 'control',
    status: 'new',
    oneLiner: 'Two players each cast an anchor; a crackling line forms between them that trips anything crossing it.',
    situation: 'A wave of small enemies rushes through the gap between two positioned players.',
    coop: 'First caster picks the element, second adds theirs; walk together to sweep the field.',
    source: "Original; inspired by It Takes Two's paired abilities",
    duration: 5,
    draw(g, t) {
      const { ctx, seg, ease, lerp, between, EL, ACTOR } = g;
      const LV = 25, X0 = 172;
      const lineX = (tt) => X0 + LV * g.clamp(tt - 1.5, 0, 2.0);
      const hy = 38, ay = 222;
      const live = t >= 0.9 && t < 4.0;
      const lineA = seg(t, 0.9, 1.0) * (1 - seg(t, 3.8, 4.1));

      // anchors (rune glyphs) follow their casters
      const lx = lineX(t);
      const g1 = seg(t, 0.4, 0.55) * (1 - seg(t, 3.8, 4.1)), g2 = seg(t, 0.9, 1.05) * (1 - seg(t, 3.8, 4.1));
      if (g1 > 0) g.rune(lx, hy, 13, { color: EL.fire, alpha: g1, spin: 2, armed: g1 });
      if (g2 > 0) g.rune(lx, ay, 13, { color: EL.lightning, alpha: g2, spin: -2, armed: g2 });

      // pending line from the first anchor
      if (between(t, 0.45, 0.95)) {
        const reach = ease.out(seg(t, 0.45, 0.9));
        g.aim(lx, hy, lx, lerp(hy, ay, reach), { color: EL.fire, alpha: 0.8 });
      }

      // the wave
      const xs = [258, 278, 300, 318, 334, 350, 362, 376];
      const ys = [70, 172, 120, 200, 92, 146, 186, 60];
      xs.forEach((x0, i) => {
        const y = ys[i];
        const v = 40;
        // first time the blob reaches the moving line (pure: scan forward)
        let trip = Infinity;
        for (let tt = 0.9; tt < 4.0; tt += 0.02) { if (x0 - v * tt <= lineX(tt)) { trip = tt; break; } }
        const age = t - trip;
        const x = x0 - v * Math.min(t, trip);
        if (age < 0) {
          g.enemy(x, y, { r: 8, facing: Math.PI });
        } else {
          const flip = ease.out(seg(age, 0, 0.3));
          ctx.save(); ctx.translate(x - flip * 8, y + flip * 4);
          ctx.rotate(-flip * Math.PI * 0.5);
          ctx.scale(1, 1 - 0.4 * flip);
          g.enemy(0, 0, { r: 8, facing: Math.PI, hit: Math.max(0, 1 - age * 3), status: 'shocked' });
          ctx.restore();
          if (age > 0.3) for (let k = 0; k < 3; k++) {
            const a = t * 5 + k * g.TAU / 3;
            ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(x - 8 + Math.cos(a) * 7, y - 6 + Math.sin(a) * 2, 1.5, 0, g.TAU); ctx.fill();
          }
          g.burst(x, y, age, { seed: 60 + i, count: 8, colors: [EL.fire, EL.lightning], speed: 50, life: 0.35, size: 2 });
        }
      });

      // the line
      if (live && lineA > 0) {
        for (let k = 0; k < 2; k++) g.bolt(lx, hy + 6, lx, ay - 6, { seed: Math.floor(t * 18) + k * 7, color: k ? EL.lightning : EL.fire, width: k ? 1.5 : 2.5, alpha: lineA, jag: 5 });
      }
      g.burst(lx, (hy + ay) / 2, t - 0.9, { seed: 70, count: 18, colors: [EL.fire, EL.lightning, '#ffffff'], speed: 60, life: 0.4, size: 2, dir: 0, spread: g.TAU });

      // casters walk together
      g.wizard(lx - 2, hy, { facing: Math.PI / 2, tip: EL.fire, casting: seg(t, 0.2, 0.4) * (1 - seg(t, 0.5, 0.7)) });
      g.wizard(lx - 2, ay, { color: ACTOR.ally, facing: -Math.PI / 2, tip: EL.lightning, casting: seg(t, 0.7, 0.9) * (1 - seg(t, 1.0, 1.2)) });
      if (between(t, 0.35, 0.85)) g.label('anchor 1', lx + 40, hy, { color: EL.fire, alpha: 1 - seg(t, 0.7, 0.85) });
      if (between(t, 0.85, 1.45)) g.label('anchor 2', lx + 40, ay, { color: EL.lightning, alpha: 1 - seg(t, 1.3, 1.45) });
    },
  });
})();
