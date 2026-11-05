/* Survive Review: the words and numbers. Every number here was read from the game on 2026-11-05:
 * game/packages/sim/src/survive.ts (SURVIVE_TIMES, the waves, survivePlan), config.ts (RUNES,
 * PERKS, STRUCT), world.ts (PU, PU_CAP, SURVIVE_ROCK, SURVIVE_GATES, ALTAR_SPOTS, regenOf),
 * and the client's art/perks.ts (names, rules, colours, glyphs). The design text is from
 * docs/explorations/2026-11-05-survive-mode.md. */
(function () {
  'use strict';
  const PB = (window.PB = window.PB || {});

  // 7x7 glyphs, copied from game/packages/client/src/art/perks.ts
  const G = {
    GEAR: ['.#.#.#.', '#######', '.##.##.', '###.###', '.##.##.', '#######', '.#.#.#.'],
    POOLS: ['#.#.#.#', '#.#.#.#', '#.#.#.#', '.......', '...#...', '..###..', '.#####.'],
    SPRING: ['...#...', '..###..', '.#.#.#.', '...#...', '.#...#.', '#.###.#', '.#####.'],
    BOLT: ['..#....', '.##....', '#######', '.##..#.', '..#.##.', '....###', '...####'],
    MIRROR: ['.#####.', '#.....#', '#..#..#', '#.#.#.#', '#.....#', '.#...#.', '..###..'],
    BLOOM: ['..#.#..', '.#####.', '##.#.##', '.#####.', '..###..', '...#...', '..###..'],
    WALL: ['.......', '##.##.#', '##.##.#', '.......', '#.##.##', '#.##.##', '.......'],
    ECHO: ['.#...#.', '###.###', '.#...#.', '###.###', '.#...#.', '#.#.#.#', '#.#.#.#'],
    RALLY: ['...#...', '..###..', '...#...', '..#.#..', '.......', '##.###.', '#######'],
    // the element icons (px.ts ICON) the game uses for Spare sigil, Pyre and Deep (element)
    SIGIL: ['...#...', '..#.#..', '.#####.', '#..#..#', '.#####.', '..#.#..', '...#...'],
    FIRE: ['...#...', '..##...', '..###.#', '.#####.', '###.###', '##...##', '.#####.'],
    // designed only: no glyph in the game yet; drafted here in the same style
    HEART: ['.##.##.', '#######', '###.###', '##.#.##', '.#####.', '..###..', '...#...'],
    FUSE: ['.....#.', '....#..', '...#...', '..###..', '.#####.', '.#####.', '..###..'],
    STEP: ['...##..', '..###..', '.###...', '####...', '..#.#..', '.#...#.', '#.....#'],
  };

  const BASE_REGEN = 0.22;
  const ws = (k) => (BASE_REGEN * (1 + 0.3 * k)).toFixed(3).replace(/0$/, '');

  // status: 'built' (in the sim with a test) or 'designed' (only in the exploration doc)
  const PERKS = [
    {
      slug: 'pu-deep', name: 'Deep pools', ramp: 'sigil', glyph: G.POOLS, status: 'built', cap: 3,
      rule: '+1 max rune of every element',
      does: 'Every pool gets one more rune, Sigil included: 4 → 5 for most elements, Fire 5 → 6, Sigil 3 → 4. You get the rune straight away, not on the next regen tick.',
      sees: 'Your badge appears in the top-left row. Bigger pools mean bigger spells, so your partner sees five-rune sprays and boulders sooner.',
      cost: 'Pure power. Its only cost is the two altars you didn’t take.',
      pillar: 'Pillar 1’s accepted exception: deeper pools open magic you couldn’t reach.',
    },
    {
      slug: 'pu-deep-el', name: 'Deep (element)', ramp: 'arcane', glyph: G.POOLS, status: 'built', cap: 4,
      rule: '+2 max runes of one element',
      does: 'The altar names one of the eight non-Sigil elements (Deep Fire, Deep Earth…), drawn from the run’s dice, and shows that element’s icon and colour. +2 max runes of it. Up to 4 stacks across all elements.',
      sees: 'The altar wears the element’s colour, so your partner can see you leaning into Earth or Fire before you cast.',
      cost: 'Narrows you toward one element. A 5-Earth boulder becomes affordable; the other pools stay small.',
      pillar: 'The same exception, and the leaning kind of progression pillar 1 prefers.',
      glyphNote: 'In the game the altar shows the named element’s icon. The pools glyph is the fallback.',
    },
    {
      slug: 'pu-wellspring', name: 'Wellspring', ramp: 'water', glyph: G.SPRING, status: 'built', cap: 3,
      rule: 'Runes regenerate 30% faster',
      does: `Rune regen goes from ${BASE_REGEN} runes a second per element to ${ws(1)} (one stack), ${ws(2)} (two) or ${ws(3)} (three).`,
      sees: 'Nothing directly: you just cast more often.',
      cost: 'Pure pace. It shortens “room to think”, because you cast more and choose less.',
      pillar: 'Mild conflict with pillar 1 (“prefer … over flat +X% numbers”). It stays because you asked for regen by name.',
      flag: 'pillar 1',
    },
    {
      slug: 'pu-spare-sigil', name: 'Spare sigil', ramp: 'sigil', glyph: G.SIGIL, status: 'built', cap: 2,
      rule: '+1 Sigil rune: one more device',
      does: 'Sigil max 3 → 4 (→ 5 at two stacks): one more turret, glyph or aura standing at once.',
      sees: 'One more of your devices on the field.',
      cost: 'More to babysit. Each turret still draws its shots from your pools.',
      pillar: '“Do more things at once”: exactly pillar 1’s preferred kind.',
    },
    {
      slug: 'pu-bedrock', name: 'Bedrock', ramp: 'earth', glyph: G.WALL, status: 'built', cap: 1,
      rule: 'Your rock walls last twice as long',
      does: 'Your rock walls stand twice as long (25 s plus 5 s per extra Earth, so 50 s and up) with 50% more hit points.',
      sees: 'Your walls stay up: a gate you shut stays shut for a whole wave.',
      cost: 'Only matters if you build. Longer walls also block your partner’s shots and your own beams for longer.',
      pillar: 'Pillar 7: rewards preparing.',
    },
    {
      slug: 'pu-pyre', name: 'Pyre', ramp: 'fire', glyph: G.FIRE, status: 'built', cap: 1,
      rule: 'Foes you set burning explode on death',
      does: 'An enemy that dies while burning from your fire bursts: 2 Fire runes’ worth, 1.8 u radius. Bursts set more enemies burning, so they chain.',
      sees: 'Fire bursts where goblins die. The burst hits your partner too.',
      cost: 'Friendly fire stays (pillar 3): a goblin burning at your friend’s feet is now a bomb. Fire imps don’t burn, so it does nothing against them.',
      pillar: 'Pillar 2: a new interaction from existing parts (burning + death).',
    },
    {
      slug: 'pu-slipstream', name: 'Slipstream', ramp: 'lightning', glyph: G.BOLT, status: 'built', cap: 1,
      rule: 'First spell after a hop is free',
      does: 'The first spell you cast within 2 s of a Retreat hop costs no runes.',
      sees: 'A hop, then a big spell straight after it.',
      cost: 'Useless if you never hop. Big spells gain most, so it pushes you to dodge before a 5-rune cast.',
      pillar: 'Mastery in the hands (pillar 1), but it adds a timing habit. Watch that it doesn’t feel mandatory.',
    },
    {
      slug: 'pu-charm', name: 'Mirror charm', ramp: 'shield', glyph: G.MIRROR, status: 'built', cap: 1,
      rule: 'A mirror ward regrows on you',
      does: 'A mirror ward (3 reflected shots) grows on you about 1 s after the pick, and regrows 12 s after you last wore any ward. It drains no Shield pool.',
      sees: 'A mirror shell on you that bounces archer bolts back.',
      cost: 'Free defence, but only against shots. It does nothing against a brute. Casting a real ward replaces it.',
      pillar: 'Passive power. Fine for a run mode; too strong as permanent progression.',
    },
    {
      slug: 'pu-bloom', name: 'Bloom', ramp: 'life', glyph: G.BLOOM, status: 'built', cap: 1,
      rule: 'Your heals splash onto allies',
      does: 'Every heal you give splashes half its amount onto the other wizards within 2.5 u of the one healed. It only ever heals.',
      sees: 'Green heal numbers on everyone standing near the one you healed.',
      cost: 'Makes the support role stronger and pulls the team together, which is exactly where a brute’s slam or your own Pyre hurts most.',
      pillar: 'Touches pillar 3 (“hitting a friend never helps them by accident”). It only heals, and only from heals you chose to cast, so picking it is the intent.',
      flag: 'pillar 3',
    },
    {
      slug: 'pu-clockwork', name: 'Clockwork', ramp: 'shield', glyph: G.GEAR, status: 'built', cap: 1,
      rule: 'Your turrets fire for free',
      does: 'Your turrets’ shots cost no runes and fire at their full rate. Normally a shot costs half its payload’s runes, and all your turrets together may spend at most 60% of your regen.',
      sees: 'Your turrets keep firing while you cast.',
      cost: 'Turrets become “set and forget”. Your Sigil runes are still bound, and shots are still uncharged tap casts.',
      pillar: 'Strongly rewards preparing (pillar 7). Could make turret builds a no-brainer: watch it.',
    },
    {
      slug: 'pu-echo', name: 'Echo', ramp: 'sigil', glyph: G.ECHO, status: 'built', cap: 9, scene: 'echo',
      rule: 'A free Double stands with you next wave',
      does: 'A Double appears beside you the moment you pick it, so you can plan round it in the lull, and fades when the next wave is cleared. It binds no Sigil rune. Otherwise it’s the cast Double: 60 HP, repeats your spells at half power for half their runes, and enemies treat it as 6 u closer than it is. A Double you cast replaces it. It can be picked again at the next altar.',
      sees: 'A translucent violet copy of you with a seal at its feet. Enemies peel off toward it.',
      cost: 'The Double is a magnet, so you must play round it. Its repeats still cost runes.',
      pillar: '“The Double for a wave”, from your list.',
    },
    {
      slug: 'pu-rally', name: 'Rally', ramp: 'life', glyph: G.RALLY, status: 'built', cap: 1, scene: 'rally',
      rule: 'Stand by a downed ally 3s to revive them',
      does: 'Stand within 1.6 u of a downed ally for 3 s with your hands free, and they get up mid-wave with 40% health (the breather gives 50%). Queueing runes doesn’t break it. Casting, a weapon move, blocking, the healing link, a grab, a stun or stepping away empties the ring; a hit drains 1 s of it (at most every 0.5 s) and the ring doesn’t fill while you’re being hit. Two rescuers don’t fill it faster.',
      sees: 'A dashed green ring round the fallen ally shows where to stand. While a rally runs, a ring fills in the rescuer’s colour, Life motes flow, RALLY floats overhead and the strip reads “P1 RALLYING P2 66%”. The revive is a column of Life light; a broken ring snaps.',
      cost: 'You stop casting to do it, and a grabber or brute punishes the rescuer.',
      pillar: 'Pillar 3’s dance, and it answers the death-and-revival idea.',
    },
    {
      slug: 'pu-glass-heart', name: 'Glass heart', ramp: 'fire', glyph: G.HEART, status: 'designed',
      rule: '+25% damage, −25% max health',
      does: 'You deal 25% more damage and have 25% less max health.',
      sees: 'Bigger hits from you, and a partner who goes down faster.',
      cost: 'A real trade-off build. It conflicts with Bloom-style support play.',
      pillar: 'Flat +X%, so it conflicts with pillar 1 as written. It’s here because a run mode is where such trades are fun.',
      flag: 'pillar 1',
    },
    {
      slug: 'pu-long-fuse', name: 'Long fuse', ramp: 'shield', glyph: G.FUSE, status: 'designed',
      rule: 'Delayed blasts and glyphs: 50% bigger, 50% slower',
      does: 'Your delayed blasts and glyphs are 50% bigger and take 50% longer to arm.',
      sees: 'Bigger glyphs in the gates, armed well before the wave arrives.',
      cost: 'Prep-heavy, bad in a panic.',
      pillar: 'Pillar 7.',
    },
    {
      slug: 'pu-quickstep', name: 'Quickstep', ramp: 'lightning', glyph: G.STEP, status: 'designed',
      rule: 'Recovery after a cast 40% shorter',
      does: 'The recovery after each cast is 40% shorter.',
      sees: 'You cast faster.',
      cost: 'Pure pace, like Wellspring.',
      pillar: 'Pillar 4: it eats “slower, more deliberate”. Claude would reject it.',
      flag: 'pillar 4',
    },
  ];

  const DROPPED = [
    ['+1 queue length', 'the queue is the grammar, and five is its ceiling; a sixth slot would break the spell tree’s readability.'],
    ['Heal on kill', 'it rewards the damage player only and makes support redundant.'],
    ['Random element every wave', 'the run would be a level gimmick, against pillar 6.'],
  ];

  // The loop, with the real times (SURVIVE_TIMES)
  const LOOP = [
    ['wave', 'Wave', 'until cleared', 'Enemies leave the open portals one every 0.45 s; portals start 1 s apart. Downed wizards stay down until the wave ends. Everyone down ends the run.'],
    ['breather', 'Breather', '3 s', 'The downed get back up with half their health.'],
    ['pick', 'Pick', 'up to 30 s', 'Three altars rise in the keep, and the next wave’s portals open. Stand on one for 0.75 s to take it. The lull starts once everyone has picked.'],
    ['lull', 'Lull', '6 s (10 s before wave 1)', 'The strip counts down with the next wave’s mix. Time to prepare: walls, glyphs, turrets.'],
  ];

  const WAVES = [
    ['1', 'Goblin ×5', 'Hit many at once'],
    ['2', 'Goblin ×5, Fire imp ×2', 'Read the battlefield'],
    ['3', 'Shieldbearer, Goblin ×6', 'Go round'],
    ['4', 'Archer ×2, Shieldbearer, Goblin ×4', 'Reach past the front'],
    ['5', 'Brute, Goblin ×6', 'Sustain, and protect its target'],
    ['6', 'Grabber, Fire imp ×3, Archer', 'Rescue'],
    ['7', 'Brute, Shieldbearer ×2, Archer ×2', 'All of the above, slower'],
    ['8', 'Brute ×2, Grabber, Goblin ×6, Fire imp ×2', 'Everything at once'],
  ];

  // Questions. choices: [id, label, sub, flags] with flags 'rec' (Claude's recommendation) and 'built' (in the game now).
  const QUESTIONS = [
    {
      id: 'q-pillar1', n: 'Vision', title: 'Does a run mode get to bend pillar 1 with flat-number power-ups?',
      text: 'Pillar 1 says “prefer progression that lets you lean into a playstyle, do more things at once, or speed up as you warm up, over flat +X% numbers.” Survive resets every run, so its power-ups are a run-scoped build, closer to Magicka’s Magicks than to levelling. Wellspring (built) and Glass heart (designed) are the flat ones. If you say yes, Claude adds a line to the pillar: run modes may use flat numbers, the campaign may not.',
      choices: [
        ['run-only', 'Yes, in run modes only', 'Survive and later run modes may use flat numbers; the campaign holds to pillar 1.', 'rec built'],
        ['never', 'No, pillar 1 binds everywhere', 'Cut Wellspring; Glass heart stays unbuilt.', ''],
        ['case', 'Case by case', 'No rule in the vision; judge each power-up.', ''],
      ],
    },
    {
      id: 'q-1-pick', n: 'Q1', title: 'How do players pick a power-up?',
      text: 'Built: three altars rise in the keep; each player stands on one for 0.75 s. Two players may take the same one. You see your partner walk to an altar, and their colour lands on it. The alternatives: the team picks one together, or a 1 / 2 / 3 card menu.',
      choices: [
        ['altars', 'Altars in the world, one each', 'Shareable; no new keys.', 'rec built'],
        ['shared', 'One shared pick for the team', 'Forces a conversation; one build for everyone.', ''],
        ['menu', 'A card menu', 'New keys, pauses the world, invisible to the partner.', ''],
      ],
    },
    {
      id: 'q-2-timing', n: 'Q2', title: 'Should the next wave show itself during the pick?',
      text: 'Built: the next wave’s portals open as the altars rise, and its mix is in the strip, so you can pick for what’s coming (Pyre against goblins, Mirror charm against archers). It is also more to read at once.',
      choices: [
        ['during', 'Yes, portals open during the pick', 'Pick for what’s coming.', 'rec built'],
        ['after', 'No, show the wave after the pick', 'Calmer pick; the pick is blind.', ''],
      ],
    },
    {
      id: 'q-3-flat', n: 'Q3', title: 'Wellspring and Glass heart: keep the flat-number ones?',
      text: 'Built: Wellspring is in (you asked for regen). Glass heart is designed but not built. This is the per-power-up half of the pillar question above.',
      choices: [
        ['both', 'Keep both; build Glass heart', 'A run mode is where trade-off builds are fun.', 'rec'],
        ['wellspring', 'Keep Wellspring only', 'What’s built now.', 'built'],
        ['neither', 'Cut both', 'Survive holds to pillar 1 as strictly as the campaign.', ''],
      ],
    },
    {
      id: 'q-4-bloom', n: 'Q4', title: 'Bloom: is picking it enough intent for pillar 3?',
      text: 'Pillar 3: “hitting a friend never helps them by accident; empowering an ally is something you set up on purpose.” Bloom splashes your heals onto allies you didn’t aim at. It only ever heals, and only from heals you chose to cast.',
      choices: [
        ['enough', 'Picking it is enough intent', 'Keep it as built.', 'rec built'],
        ['aimed', 'Only splash onto allies you also aim at', 'Tighter, but it barely differs from a plain heal.', ''],
        ['cut', 'It crosses the pillar: cut it', '', ''],
      ],
    },
    {
      id: 'q-6-curve', n: 'Q6', title: 'Is the wave curve the right shape?',
      text: 'Built: eight authored waves, each adding one enemy question, then the eight loop with 35% more enemies each loop. From wave 4, every wave adds 7% enemy health and 4% damage (speed +1.5% a wave for twelve waves). Counts are ×1.3 for the big arena and a quarter more per extra wizard. The other shape: past wave 8, draw waves from a pool (the encounters doc’s question 3).',
      choices: [
        ['loop', 'Authored to 8, then loop harder', 'Predictable; easy to tune.', 'rec built'],
        ['pool', 'Past 8, draw from a pool', 'More variety on long runs; harder to balance.', ''],
        ['more', 'Author more waves first', 'Grow the authored list before looping.', ''],
      ],
    },
    {
      id: 'q-8-zoom', n: 'Q8', title: 'Zoom out a step when the team splits?',
      text: 'Built: when the team spreads further than the view, the camera steps out one integer scale (4x to 3x, never below 2x) and steps back in once everyone fits with room to spare. The other choice: one fixed scale, with only the edge marks for off-screen enemies and portals.',
      choices: [
        ['zoom', 'Zoom out a step', 'You see both players; it’s a visible jump.', 'rec built'],
        ['fixed', 'Stay at one scale', 'Steadier; you rely on the edge marks.', ''],
      ],
    },
    {
      id: 'q-9-keep', n: 'Q9', title: 'The keep’s walls: a courtyard to hold, or too static?',
      text: 'Built: a walled keep (17 × 12 u) round the altars, corners cut, with a 3.6 u door on each axis. It’s the place to hold, with four doors to watch or wall shut. Its corners could open into four more gaps.',
      choices: [
        ['keep', 'Keep the four-door courtyard', '', 'rec built'],
        ['open', 'Open the corners: eight gaps', 'Harder to hold; more movement.', ''],
        ['remove', 'Remove the keep walls', 'An open plaza again.', ''],
      ],
    },
    {
      id: 'q-10-rally', n: 'Q10', title: 'Rally: should a break empty the ring, or drain part of it?',
      text: 'Built (since this page went up): 3 s, 1.6 u, back with 40% health; your own breaks empty the ring and a hit drains 1 s. Before, any break emptied it, so a single archer bolt reset a rescue at 90%. Claude’s pick splits the two kinds of break: your own choices (cast, swing, block, walk away) still empty it, because rallying is a commitment, but a hit only takes a second off, so chip damage doesn’t make rescue hopeless.',
      choices: [
        ['hit-drains', 'Hits drain 1 s; your own actions empty it', 'Commitment stays; chip damage doesn’t reset it.', 'rec built'],
        ['empty', 'Any break empties the ring', 'What was built first. Harsh against archers.', ''],
        ['drain-all', 'Every break drains 1 s', 'Most forgiving; rescue while casting in bursts.', ''],
      ],
    },
    {
      id: 'q-11-echo-free', n: 'Q11', title: 'Echo: should its Double repeat your spells for free?',
      text: 'Built: Echo’s Double repeats your spells at half power for half their runes, like the cast Double. Free repeats would double your output with nothing to decide.',
      choices: [
        ['half', 'Keep half the runes', 'Each repeat is still a choice.', 'rec built'],
        ['free', 'Repeats are free', 'Stronger and simpler; less to think about.', ''],
      ],
    },
    {
      id: 'q-12-echo-run', n: 'Q12', title: 'Echo: one wave per pick, or a Double every wave for the run?',
      text: 'Built: a one-shot. The Double stands until the next wave is cleared, and Echo can be offered and picked again at later altars. The other way: one pick gives you a Double at the start of every wave for the rest of the run.',
      choices: [
        ['oneshot', 'One wave per pick', 'The pick stays a recurring choice.', 'rec built'],
        ['run', 'A Double every wave', 'A build-defining pick; strong early.', ''],
      ],
    },
  ];

  const DECIDED = [
    ['Q5', 'Next to build: Rally and Echo. Answered: both, Rally first. Both are built.'],
    ['Q7', 'Arena size. Decided: 48 × 34, so it overflows the screen at every scale.'],
  ];

  PB.SR = { PERKS, DROPPED, LOOP, WAVES, QUESTIONS, DECIDED, G };
})();
