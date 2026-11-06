/* Survive Review: the words and numbers. Every number here was read from the game on 2026-11-06 (the second power-up pass:
 * docs/explorations/2026-11-06-survive-powerups-2.md):
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
    ECHO: ['#..#...', '.#..#..', '..#..#.', '...#..#', '..#..#.', '.#..#..', '#..#...'],
    LINGER: ['.#####.', '..#.#..', '...#...', '..#.#..', '.#####.', '.......', '#######'],
    STEP: ['...##..', '..###..', '.###...', '####...', '..#.#..', '.#...#.', '#.....#'],
    RALLY: ['...#...', '..###..', '...#...', '..#.#..', '.......', '##.###.', '#######'],
    // the element icons (px.ts ICON) the game uses for Shield and Sigil, Pyre and Deep (element)
    SIGIL: ['...#...', '..#.#..', '.#####.', '#..#..#', '.#####.', '..#.#..', '...#...'],
    FIRE: ['...#...', '..##...', '..###.#', '.#####.', '###.###', '##...##', '.#####.'],
    HEART: ['.##.##.', '#######', '###.###', '##.#.##', '.#####.', '..###..', '...#...'],
    // designed only: no glyph in the game yet; drafted here in the same style
    TRIAGE: ['..###..', '..#.#..', '###.###', '#.....#', '###.###', '..#.#..', '..###..'],
  };

  // Regen is one shared budget (decisions 2026-11-05, the rune economy): R runes a second in total
  const BASE_R = 1.0, WELL = 0.15, START = 2;
  const ws = (k) => (BASE_R * (1 + WELL * k)).toFixed(2).replace(/0$/, '');

  // status: 'built' (in the sim with a test), 'designed' (only in the exploration doc), 'cut' (rated
  // cut; code removed) or 'default' (no longer a power-up: every wizard has it)
  const PERKS = [
    {
      slug: 'pu-three', name: '+1 to three', ramp: 'sigil', glyph: G.POOLS, status: 'built', cap: 6,
      rule: '+1 max rune of three elements you tap',
      does: `Replaces Deep pools (+1 to all). Step on the altar, then tap three different element keys (the keys you cast with; not Shield or Sigil). While you choose they pick instead of queueing, and the HUD shows “+1 to: _ _ _”. Each gets one more max rune, ${START} → ${START + 1}, filled at once. The pick waits until you’ve tapped all three.`,
      sees: 'Your badge appears in the top-left row, and your pools grow where you lean, so your partner sees which elements you’re building toward.',
      cost: 'Pure power, but narrower than +1 to all: three of the eight, your choice.',
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
      rule: `Runes regenerate ${Math.round(WELL * 100)}% faster`,
      does: `Your total regen R goes from ${BASE_R} rune a second (shared among the pools that aren’t full) to ${ws(1)} (one stack), ${ws(2)} (two) or ${ws(3)} (three).`,
      sees: 'Nothing directly: you just cast more often.',
      cost: 'Pure pace. It shortens “room to think”, because you cast more and choose less.',
      pillar: 'Mild conflict with pillar 1 (“prefer … over flat +X% numbers”). It stays because you asked for regen by name.',
      flag: 'pillar 1',
    },
    {
      slug: 'pu-shield-sigil', name: 'Shield and Sigil', ramp: 'shield', glyph: G.SIGIL, status: 'built', cap: 3,
      rule: '+1 max Shield and +1 max Sigil rune',
      does: `Replaces Spare sigil. Shield ${START} → ${START + 1} and Sigil 1 → 2: a bigger ward or wall, and one more turret, glyph or aura standing at once.`,
      sees: 'One more of your devices on the field, and sturdier shields.',
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
      slug: 'pu-slipstream', name: 'Slipstream', ramp: 'lightning', glyph: G.BOLT, status: 'cut', cap: 1,
      rule: 'First spell after a hop is free',
      does: 'Was: the first spell you cast within 2 s of a Retreat hop cost no runes. Cut on your rating (degenerate: hop back from nothing and cast a free 5-rune spell); its code is gone.',
      sees: 'A hop, then a big spell straight after it.',
      cost: 'Useless if you never hop. Big spells gained most, so it pushed you to hop before every 5-rune cast.',
      pillar: 'Cut.',
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
      slug: 'pu-bloom', name: 'Bloom', ramp: 'life', glyph: G.BLOOM, status: 'cut', cap: 1,
      rule: 'Your heals splash onto allies',
      does: 'Was: every heal you gave splashed half its amount onto the other wizards within 2.5 u of the one healed. Cut on your rating (not useful); its code is gone.',
      sees: 'Green heal numbers on everyone standing near the one you healed.',
      cost: 'Makes the support role stronger and pulls the team together, which is exactly where a brute’s slam or your own Pyre hurts most.',
      pillar: 'Touches pillar 3 (“hitting a friend never helps them by accident”). It only heals, and only from heals you chose to cast, so picking it is the intent.',
      flag: 'pillar 3',
    },
    {
      slug: 'pu-clockwork-v2', name: 'Clockwork', ramp: 'shield', glyph: G.GEAR, status: 'built', cap: 1,
      rule: 'Your turrets bind no Sigil rune',
      does: 'Redesigned (your note: free shots were far too strong). A turret still costs its runes when you cast it, and its shots still cost half their payload, but it no longer holds a Sigil rune while it stands: the rune comes back by regen, so a turret, a glyph and an aura can stand together on Survive’s single Sigil rune. Shots still fit the shared budget (all your turrets together spend at most 13% of your regen R), so a second turret splits the fire of the first: more coverage, about the same damage. Dismissing a Clockwork turret gives no rune back, and pressing Sigil with none free never recalls one.',
      sees: 'Turrets at two gates, and your glyphs and aura besides.',
      cost: 'Little extra damage: it buys coverage and room for your other devices, not DPS. Placing turrets still costs runes each time.',
      pillar: 'Pillar 1’s preferred kind: do more things at once. Pillar 7: rewards setting up before the wave.',
    },
    {
      slug: 'pu-echo-v2', name: 'Echo', ramp: 'sigil', glyph: G.ECHO, status: 'built', cap: 9, scene: 'echo',
      rule: 'Next wave, every spell goes off twice',
      does: 'Redesigned (your note: be super powerful for one wave; the cost is the permanent upgrade you didn’t take). From the pick until the next wave is cleared, every spell you cast goes off a second time 0.4 s later, free, from where you stand then and along your aim then. Bolts, rocks, shards, novas, patches, rain, springs, strikes, blasts and the imbued burst repeat whole; a beam or spray is joined by a second one that trails your aim by 0.4 s; an arc zaps again after each zap. Walls, wards, devices, weapons, Blink and Self casts don’t echo. Measured on a dummy: a rock ×2.0 damage, a beam ×1.9, a fireball ×1.8, a fire spray ×1.5 (burning doesn’t stack). It is three times as likely to be on an altar before a key wave (the 5th and 8th of every eight) and can be picked again.',
      sees: 'A violet ring at your feet, and every spell of yours twice: the second one a beat later, from your staff.',
      cost: 'Gone after one wave, and the pick is a permanent upgrade you didn’t take. Friendly fire echoes too.',
      pillar: 'Pillar 7’s cousin: a pick for a moment you can see coming (the next wave shows itself during the pick).',
    },
    {
      slug: 'pu-rally', name: 'Rally', ramp: 'life', glyph: G.RALLY, status: 'default', cap: 1, scene: 'rally',
      rule: 'Everyone: stand by a downed ally 3s to revive them',
      does: 'No longer a power-up (your answer): every wizard can do it. Stand within 1.6 u of a downed ally for 3 s with your hands free, and they get up mid-wave with 40% health (the breather gives 50%). Queueing runes doesn’t break it. Casting, a weapon move, blocking, the healing link, a grab, a stun or stepping away empties the ring; a hit drains 1 s of it (at most every 0.5 s) and the ring doesn’t fill while you’re being hit. Two rescuers don’t fill it faster.',
      sees: 'A dashed green ring round the fallen ally shows where to stand. While a rally runs, a ring fills in the rescuer’s colour, Life motes flow, RALLY floats overhead and the strip reads “P1 RALLYING P2 66%”. The revive is a column of Life light; a broken ring snaps.',
      cost: 'You stop casting to do it, and a grabber or brute punishes the rescuer.',
      pillar: 'Pillar 3’s dance, and it answers the death-and-revival idea.',
    },
    {
      slug: 'pu-glass-heart', name: 'Glass heart', ramp: 'fire', glyph: G.HEART, status: 'built', cap: 2,
      rule: '+25% damage, −25% max health',
      does: 'You deal 25% more damage (every hit, your partner included) and have 25% less max health, per stack, up to two (+50% / −50%). Your current health shrinks with the max.',
      sees: 'Bigger hits from you, and a partner who goes down faster. Fun with someone to hide behind.',
      cost: 'A real trade-off build: you need a partner, walls or wards between you and the wave.',
      pillar: 'Flat +X%, so it conflicts with pillar 1 as written. It’s here because a run mode is where such trades are fun.',
      flag: 'pillar 1',
    },
    {
      slug: 'pu-lingering', name: 'Lingering', ramp: 'earth', glyph: G.LINGER, status: 'built', cap: 1,
      rule: 'What you place lasts 50% longer, 25% bigger',
      does: 'Replaces Long fuse (your note: lean into glyphs, fire walls and persistent areas, not the arming delay). Everything you place or leave lingering lasts 1.5× as long and is 1.25× as wide: Place patches and the floors they leave (burning ground, frost, ice, water), steam, rain, Healing springs, the floor a nova leaves, rock walls (with any coat, so a Fire wall burns 1.5× as long; with Bedrock 3×), and glyphs (their trigger ring is wider and the patch they cast is the bigger one). Instant blasts stay instant.',
      sees: 'Bigger fire patches and rain that stays, so the zones you both have to read and walk round are bigger too.',
      cost: 'Only matters if you place things. Your burning ground and walls also block and burn your partner for longer (friendly fire stays).',
      pillar: 'Pillar 1’s leaning kind (a placer’s build) and pillar 7 (prepare the field).',
    },
    {
      slug: 'pu-quickstep-v2', name: 'Quickstep', ramp: 'lightning', glyph: G.STEP, status: 'built', cap: 2,
      rule: 'A lasting haste: 15% faster steps and casts',
      does: 'Redesigned as a permanent, weaker Haste (your note). +15% walking speed, and 15% shorter wind-ups and recoveries, per stack (two at most: +30%). It multiplies with the Haste aura (Sigil + Lightning on yourself, ×1.4), which now shortens your recovery too, as it always did your wind-up. Measured: casting barely speeds up (you wait on runes, as you said), a staff Strike spam is +20% (+27% at two stacks), and you walk 15% further.',
      sees: 'You move a little quicker, and your weapon swings come round faster.',
      cost: 'Small and steady; spells stay rune-bound. Mostly a mover’s and a weapon-user’s pick.',
      pillar: 'Pillar 1’s “speed up as you warm up”, kept small so pillar 4 (deliberate casting) holds: runes still set the pace.',
    },
    {
      slug: 'pu-triage', name: 'Triage', ramp: 'life', glyph: G.TRIAGE, status: 'designed', cap: 1,
      rule: 'Your heals on a badly hurt ally heal double',
      does: 'Claude’s proposal to replace Bloom (your note: a heal tweak, but a useful one). Any heal you give another wizard below 35% health heals twice as much (springs, beams, the healing link, Mend, Life bolts). Not on yourself.',
      sees: 'A partner on the brink jumps back up when you reach them: the save is visible and it was your timing.',
      cost: 'Does nothing while everyone is healthy; rewards watching your partner’s bar, not spamming heals.',
      pillar: 'Answers the open question “what makes support skillful”: timing and attention, not volume. Pillar 3 holds (it only heals, and only your chosen heals).',
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
    ['pick', 'Pick', 'no time limit', 'Three altars rise in the keep, and the next wave’s portals open (nothing leaves them yet). Stand on one for 0.75 s to take it. The lull starts once everyone has picked.'],
    ['lull', 'Lull', '6 s (10 s before wave 1)', 'The strip counts down with the next wave’s mix. Time to prepare: walls, glyphs, turrets.'],
  ];

  const WAVES = [
    ['1', 'Goblin ×4', 'Hit many at once'],
    ['2', 'Goblin ×4, Fire imp', 'Read the battlefield'],
    ['3', 'Shieldbearer, Goblin ×3', 'Go round'],
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
      text: 'Built: Wellspring is in (you asked for regen), and Glass heart is now built too (you rated it keep). Wellspring itself is still under discussion. This is the per-power-up half of the pillar question above.',
      choices: [
        ['both', 'Keep both; build Glass heart', 'A run mode is where trade-off builds are fun.', 'rec built'],
        ['wellspring', 'Keep Wellspring only', 'Cut Glass heart again.', ''],
        ['neither', 'Cut both', 'Survive holds to pillar 1 as strictly as the campaign.', ''],
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
      id: 'q-12-echo-run', n: 'Q12', title: 'Echo: one wave per pick, or every wave for the run?',
      text: 'Still built as a one-shot after the redesign: your spells echo until the next wave is cleared, and Echo can be offered and picked again at later altars. The other way: one pick makes your spells echo for the rest of the run (that would double your damage for good, so it would need a real drawback).',
      choices: [
        ['oneshot', 'One wave per pick', 'Strong for one wave; the cost is the permanent pick you passed on.', 'rec built'],
        ['run', 'Every wave', 'A build-defining pick; would need a drawback.', ''],
      ],
    },
    {
      id: 'q-13-echo-key', n: 'Q13', title: 'Echo: how should it find the key waves?',
      text: 'Built: Echo is one wave of double spells, and it is three times as likely to be on an altar before a key wave (the 5th and 8th of every eight: the first brute, and everything at once). The pick already shows the next wave’s portals and mix, so you can tell. The alternatives: offer it only before key waves, or weight it evenly and let you judge.',
      choices: [
        ['weighted', 'More often before key waves (×3)', 'Usually there when it matters; sometimes a surprise.', 'rec built'],
        ['only', 'Only before key waves', 'Predictable; Echo becomes the boss-wave pick.', ''],
        ['even', 'Even odds every pick', 'Simplest; the timing is all yours.', ''],
      ],
    },
    {
      id: 'q-14-clockwork', n: 'Q14', title: 'Clockwork: which cost reduction?',
      text: 'Built: turrets bind no Sigil rune (they still cost their runes, and shots still share the 13%-of-regen budget, so a second turret splits the first one’s fire). That buys coverage and room for other devices, not damage. The other modest options from your note: a turret costs one rune less to cast (at least 1), or shots cost a quarter of their payload instead of half (about +50% turret damage, the strongest of the three).',
      choices: [
        ['nobind', 'Turrets bind no Sigil rune', 'More at once; about the same DPS.', 'rec built'],
        ['minus-one', '−1 rune off a turret’s cast (min 1)', 'Cheaper to set up; same shots.', ''],
        ['cheap-shots', 'Shots cost a quarter, not half', 'More turret damage; closest to the old one.', ''],
      ],
    },
    {
      id: 'q-15-linger', n: 'Q15', title: 'Lingering: is ×1.5 time and ×1.25 size the right size, and should auras count?',
      text: 'Built: everything you place or leave lingering lasts 1.5× as long and is 1.25× as wide (about 1.56× the area), once per run. Auras (Sigil + Self) are not included: they sit on you, not on the field. Including them would make Haste and the fire aura last 18 s instead of 12 s.',
      choices: [
        ['as-built', 'As built: placed things only', '', 'rec built'],
        ['auras', 'Auras last 1.5× too', 'Also helps the aura player.', ''],
        ['bigger', 'Bigger numbers (×2 time, ×1.4 size)', 'A build-defining pick for placers.', ''],
      ],
    },
  ];

  const DECIDED = [
    ['Round 2', 'Your Maybe notes (2026-11-06): Echo is now “every spell twice for one wave” (so Q11, the Double’s repeat cost, is moot), Long fuse became Lingering, Quickstep is a permanent small Haste (and Haste now shortens recovery), Clockwork no longer makes shots free. All four are built; Bloom stays cut, and Triage is proposed in its place.'],
    ['Q5', 'Next to build: Rally and Echo. Answered: both, Rally first. Both are built.'],
    ['Q7', 'Arena size. Decided: 48 × 34, so it overflows the screen at every scale.'],
    ['Q8', 'Zoom when the team splits? Answered: no zoom. Each screen follows its own wizard, in every room; other wizards off screen get an arrow at the edge in their seat colour (blinking while down). Couch co-op on one screen still shares the view. Built.'],
    ['Pick', 'Answered: no time limit; the pick ends once everyone has picked, and the open portals release nothing until the wave. Built.'],
    ['Power-ups', 'Answered: Slipstream and Bloom are cut (so Q4, Bloom and pillar 3, is moot); Rally is something everyone can do, not a power-up; Glass heart is built (+25% damage, −25% max health, two stacks at most).'],
  ];

  PB.SR = { PERKS, DROPPED, LOOP, WAVES, QUESTIONS, DECIDED, G };
})();
