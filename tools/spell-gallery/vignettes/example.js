// Reference vignette: shows the conventions every vignette file follows.
// - Pure function of t: compute every position from t, never store state.
// - Tell one clear story per loop: setup -> cast -> payoff -> brief rest.
// - Keep the hero (caster) visible and facing the action.
SG.register({
  id: 'ricochet-bolt',
  name: 'Ricochet Bolt',
  family: 'offense',
  status: 'starred',
  oneLiner: 'A fast bolt that banks off walls a few times before it fizzles.',
  situation: 'An enemy is behind cover, or the room is all walls and corners.',
  coop: 'An ally raises an ice wall to create the angle you need.',
  source: 'Your wishlist',
  duration: 5,
  draw(g, t) {
    const { ctx, seg, ease, lerp, EL } = g;
    // Scene: a wall splits the arena; the target hides behind it.
    g.wall(190, 60, 16, 140);
    g.wall(0, 0, 400, 10); g.wall(0, 250, 400, 10);
    const hx = 70, hy = 170, ex = 300, ey = 140;

    // Bolt path: hero -> top wall -> past the barrier -> enemy.
    const pts = [[hx + 14, hy - 6], [140, 12], [ex, ey]];
    const flyP = seg(t, 1.0, 2.0);
    const hitAge = t - 2.0;

    g.aim(hx, hy, 140, 12, { alpha: 0.35 * (1 - seg(t, 0.9, 1.1)) });
    g.wizard(hx, hy, { facing: g.angle(hx, hy, 140, 12), tip: EL.lightning, casting: seg(t, 0.4, 1.0) * (1 - seg(t, 1.0, 1.3)) });

    const dead = seg(t, 2.6, 3.2);
    g.enemy(ex, ey, { r: 11, facing: Math.PI, hit: hitAge > 0 ? Math.max(0, 1 - hitAge * 3) : 0, hp: hitAge > 0 ? 0.2 : 1, status: hitAge > 0 && hitAge < 0.6 ? 'shocked' : [], dead });

    if (flyP > 0 && flyP < 1) {
      const f = (tt) => g.along(pts, seg(tt, 1.0, 2.0));
      g.trail((tt) => f(tt).slice(0, 2), { color: EL.lightning, len: 0.18, width: 4, from: 1.0 });
      const [x, y] = f(t);
      g.orb(x, y, 3.5, EL.lightning);
    }
    // spark where it bounced
    g.burst(140, 14, t - 1.0 - 0.33, { seed: 2, count: 12, color: EL.lightning, speed: 60, life: 0.4, size: 2, dir: Math.PI / 2, spread: 2.4 });
    g.explosion(ex, ey, hitAge, { color: EL.lightning, r: 22 });
    g.popup('-80', ex, ey - 16, hitAge);
  },
});
