// The review's pages, one per round, oldest first. Add a round by appending an entry; the page opens on the last.
// Each item with `ask` gets a keep / tune / redo box saved to the db collection `answers` as `<round id>-<item id>`.
// Text is written by Claude (trusted markup); viewers' answers never go through innerHTML.
window.ROUNDS = [
  {
    id: 'order',
    tab: 'The order',
    el: 'neutral',
    date: '2026-11-26',
    title: 'The work order',
    lead: 'How the 3D spell effects get made from here: one element at a time through all its casts, then rune combinations one shape at a time, then Shield and Sigil.',
    sections: [
      {
        id: 'phases',
        title: 'Three phases',
        html: `
<ol class="phases">
  <li><b>Elements, one at a time.</b> Each pure element has five casts: Force, Ring, Place, Self and the burst. A pass covers all five, the element's status on bodies, what it leaves behind, and its impacts on ground, wall and body. Order: Fire, Cold, Arcane, Earth (each already has one piece built), then Water, Lightning, Life, and Ice last (its look borrows from Cold and Water).</li>
  <li><b>Rune combinations, one shape at a time:</b> sprays, beams, missiles, rings, Places, Selfs, bursts. The open question there is how much of an added element shows. The weapons' rule is the one to try first: the first extra changes the material, each other one adds one small effect.</li>
  <li><b>Shield and Sigil:</b> barriers, walls, wards, Blink, guards; turrets, glyphs, orbitals, the Lens, auras, the Double, conjured weapons.</li>
</ol>
<p>Not placed yet: enemy attacks, deaths, cast previews.</p>`,
      },
      {
        id: 'pass',
        title: 'How each element pass runs',
        html: `
<ul>
  <li><b>Concept art as a breakdown first:</b> a parts sheet for the element (each building block alone, born to dead) and a storyboard per cast (start, run, end, what it leaves behind).</li>
  <li><b>Shape apart from look.</b> A cast's shape (size, timing, following the caster) comes from the game's rules and is built once, by the first element that needs it. Each element brings only its look. The ring's shape is already shared: the Frost ring now draws through it, pixel for pixel the same.</li>
  <li><b>One round per page here,</b> with clips of every cast, and a box per cast.</li>
  <li><b>It ends with an identity card</b> for the element: palette, materials, motion, residue, status. Phase 2 reads from the cards.</li>
</ul>`,
      },
    ],
  },
  {
    id: 'fire-1',
    tab: 'Fire 1',
    el: 'fire',
    date: '2026-11-26',
    title: 'Fire, round 1: concepts',
    lead: 'Breakdowns from Codex for every Fire cast but the spray, painted from the approved spray and its flame flipbook. Nothing is built from these yet. Mark each one: build from it, tune it first, or redo it.',
    items: [
      {
        id: 'parts',
        title: 'The parts sheet',
        text: 'Every building block of Fire, alone and born to dead, top to bottom: the burn-out puff (the spray\'s flipbook), a hollow ring flame, a lick rising from the ground, smoke, an ash flake, a short stretch of a wall of flame rolling forward, a scorch cooling. The new parts are the hollow flame (for the ring and the bright-edged flames the spray still lacks) and the wave front.',
        img: ['el-parts-sheet.jpg'],
        ask: 'Are these the parts Fire is made of?',
      },
      {
        id: 'ring',
        title: 'Fire ring',
        text: 'A white flash at the feet, a thin ring of flames racing out with a bright front, burning out behind it, catching the goblins at the full radius, breaking into separate flames, and a faint sooty ring left. The painting runs a little wide: the real radius is 3 m at one rune, 0.6 m more per rune.',
        img: ['el-story-ring.jpg'],
        ask: 'Build the ring from this?',
      },
      {
        id: 'burst',
        title: 'Fire burst',
        text: 'A flash at the palms, a fan of flame puffs thrown all at once (about 120° wide, 2.5 m long), reddening into crackle, then smoke and two goblins still burning. One gout, not a stream.',
        img: ['el-story-burst.jpg'],
        ask: 'Build the burst from this?',
      },
      {
        id: 'patch',
        title: 'Fire patch (Place)',
        text: 'A splash where it lands, a low carpet of flames over glowing cracks, a goblin catching fire as it walks through, the flames sinking into the stone, and a dark scorch left that clearly no longer hurts. The patch is 4 m across and burns for 8 seconds.',
        img: ['el-story-patch.jpg'],
        ask: 'Build the patch from this?',
      },
      {
        id: 'burn',
        title: 'Burn (Self)',
        text: 'Fire on yourself: a ring of flame at the feet, steam puffing off a wet robe, a mantle of small flames hugging it with embers rising, then smoke wisps and soot.',
        img: ['el-story-burn.jpg'],
        note: 'Set aside (your call on the Magicka 2 clips): Burn stays small, the burning status carries it.',
      },
      {
        id: 'burning',
        title: 'Burning on a body',
        text: 'A goblin catches, burns with flames taller on its back and head, streams flame behind it as it runs, and gutters out into smoulder. This replaces the licks bodies burn with now.',
        img: ['el-story-burning.jpg'],
        ask: 'Make burning bodies look like this?',
      },
    ],
    general: 'Anything else about Fire',
  },
  {
    id: 'magicka-fire',
    tab: 'Magicka fire',
    el: 'fire',
    date: '2026-11-26',
    title: 'Magicka 1\'s fire, taken apart',
    lead: 'Read from the installed game\'s files for study, at your request on the parts sheet: each Fire effect\'s emitters, the flipbook cells they play, and each particle\'s life drawn on our floor colour. None of it is copied into the game or the repo; these pictures live only on this private page. Magicka 2 packs its files in a way we haven\'t opened. One thing shows across every sheet: on our pale floor (the right-hand columns) their additive flames wash out to near white, where on their dark ground they glow, so ours still need the dark rims and smoke.',
    items: [
      {
        id: 'compare',
        title: 'Our parts beside theirs',
        text: 'Each row of our parts sheet next to the Magicka cell doing the same job. What it answers from your notes: (1, 2) Magicka grows its flames 2 to 3 times over their life, and the fade is baked into the frames (alpha stays near 1), so both are true at once. (3) Their wisp leans too; it reads upright on bodies only because its rotation is kept within ±20°, and the lapping comes from many short ones rising, not from the drawing. (4) One smoke cell, varied only by rotation and spin: mirroring and rotating is enough. (6) They have no wave sprite: a ring is puffs flung outward. (7) Their burning ground is a short crackle respawned 10 times a second, so its short fade is fine; a lasting scorch is a separate ground decal.',
        img: ['m-compare-parts.jpg'],
        ask: 'Keep our parts, given this?',
      },
      {
        id: 'spray',
        title: 'Spray_Fire1 (our Flamethrower)',
        text: 'Five emitters: big flame puffs (60/s, ×3 growth), short hot wisps at the hands, smoke behind (alpha), embers, and a five-puff burst at the start. The one our spray was rebuilt from.',
        img: ['m1-Spray_Fire1.jpg'],
      },
      {
        id: 'area',
        title: 'Area_fire1_b (our Fire ring)',
        text: 'A single 1 s pulse: six big flame puffs and six smoke puffs flung out fast (speed 42–48), ten short wisps, three slower puffs that fall back, and twelve sparks. No ring shape is drawn: the motion of a dozen puffs makes it.',
        img: ['m1-Area_fire1_b.jpg'],
      },
      {
        id: 'ground',
        title: 'Area_ground_fire (our Fire patch)',
        text: 'Sparks, a soft glow that doubles and fades in under half a second, and a crackle cell respawned 10 times a second, each growing 3 times. Burning ground is a continuous trickle of short crackles, not one long animation.',
        img: ['m1-Area_ground_fire.jpg'],
      },
      {
        id: 'self',
        title: 'Self_Fire (our Burn)',
        text: '0.4 s in all: a big soft glow that shrinks to nothing, five flame puffs, and curled wisps rising fast (gravity 13). The lasting part is the burning status that follows.',
        img: ['m1-Self_Fire.jpg'],
      },
      {
        id: 'blast',
        title: 'Fire_Blast',
        text: 'Five hundred small spinning flames at once over a haze of smoke: a burst of many small parts, not a few big ones. A reference for our burst.',
        img: ['m1-Fire_Blast.jpg'],
      },
      {
        id: 'burn1',
        title: 'StatusEffect_Burning (level 1)',
        text: 'Curled wisps at 15/s, a little smoke and three puffs. Three levels in all, each adding layers.',
        img: ['m1-StatusEffect_Burning.jpg'],
      },
      {
        id: 'burn2',
        title: 'StatusEffect_Burning_2',
        text: 'The middle level.',
        img: ['m1-StatusEffect_Burning_2.jpg'],
      },
      {
        id: 'burn3',
        title: 'StatusEffect_Burning_3',
        text: 'Wisps at 20/s, smoke, leaning flames kept nearly upright (±20°), flame puffs, a pulse of big puffs and a shrinking glow: six layers. Burning grows by adding layers, the way our burn pool grows with Fire.',
        img: ['m1-StatusEffect_Burning_3.jpg'],
      },
    ],
    general: 'Anything else from Magicka worth keeping',
  },
  {
    id: 'magicka2-fire',
    tab: 'Magicka 2 clips',
    el: 'fire',
    date: '2026-11-26',
    title: 'Magicka 2\'s fire, from your clips',
    lead: 'Your recordings, cropped round the spell, at full speed, at half speed, and as 16 frames. They stay on your machine and this private page. The "wall or area" clip has no effect in it: the wizard stands with runes queued and the cast doesn\'t come in its 1.4 s. Your answers (2026-11-26): Magicka is a reference, not the target; where we can make better-looking effects or other stylistic choices, we do. The swirl that opens every clip is Magicka\'s queued-element orb, which you left out of our game on purpose.',
    items: [
      {
        id: 'nova',
        title: 'Fire nova (our Fire ring)',
        text: 'The queue orb\'s swirl (not ours), then a white-hot disc at his feet that swells into a ring of bright puffs with thin flame streaks shooting outward past it. The puffs go orange and red and thin away in about half a second. Left behind: faint round soot blotches, one per puff, and a darker scorch at his feet that lingers. Your call: our travelling wave of fire beats this explosion, and the ring and the aimed burst share one animation (Magicka can\'t aim a burst, and an explosion suits that less). Worth taking: soot blotches instead of a neat sooty ring.',
        vid: ['m2-fire-nova.mp4', 'm2-fire-nova-half.mp4'],
        img: ['m2-sheet-nova.jpg'],
      },
      {
        id: 'self',
        title: 'Fire on yourself, then burning (our Burn)',
        text: 'The queue orb\'s swirl, a small flash at the feet, then the whole body flashes white for a frame. Then an orange glow round the body and small upright licks of flame on it, for about 3 s while the damage ticks. Your call: don\'t spend long on Burn; the burning status carries it, and some casts may be dropped.',
        vid: ['m2-fire-self-and-burning.mp4', 'm2-fire-self-and-burning-half.mp4'],
        img: ['m2-sheet-self-and-burning.jpg'],
      },
      {
        id: 'ball',
        title: 'Fireball (Earth + Fire: phase 2, the missiles)',
        text: 'A charge swirl, a bright streak with a dark smoke trail along the ground, and an explosion: a big white-yellow bloom that turns into orange flames clinging to the bushes for about 1.5 s, which are left charred dark. Your verdict: quite good looking, a strong streak and a visually impressive impact. Kept for the missiles in phase 2.',
        vid: ['m2-fire-ball.mp4', 'm2-fire-ball-half.mp4'],
        img: ['m2-sheet-ball.jpg'],
      },
      {
        id: 'beam',
        title: 'Fire beam (Arcane + Fire: phase 2, the beams)',
        text: 'A dark red twisting core with orange flames licking along it, a bloom of flame round a dark red hole where it hits, and the impact smouldering after the beam stops. Kept for the beams in phase 2: a payload shows as the carried element\'s flames wrapped round the beam\'s own core. Your verdict: OK, but its style is a little different from ours.',
        vid: ['m2-fire-beam.mp4', 'm2-fire-beam-half.mp4'],
        img: ['m2-sheet-beam.jpg'],
      },
      {
        id: 'wall',
        title: 'Fire wall (Shield + Fire: phase 3)',
        text: 'Re-recorded. An arc of fire round the wizard that burns for about 10 s, made of separate columns pouring up from the ground. Your verdict: not very good, basically fire pouring up in discrete geysers. A counterexample for our Fire patch and walls: burning ground should read as one connected surface.',
        vid: ['m2-fire-wall.mp4'],
        img: ['m2-sheet-wall.jpg'],
      },
    ],
    general: 'Anything else from these clips',
  },
  {
    id: 'fire-2',
    tab: 'Fire 2',
    el: 'fire',
    date: '2026-11-26',
    title: 'Fire, round 2: concepts from your notes',
    lead: 'The parts sheet and the ring redone from your round 1 notes and your read of Magicka\'s cells, still from Codex, nothing built yet. Next comes building the ring and the burst from the storyboard, with these parts.',
    items: [
      {
        id: 'parts',
        title: 'Parts sheet, take 2',
        text: 'Top to bottom: three flame puffs, lopsided so rotation gives variety, breaking up from the inside (holes open in the middle and spread to a broken rim); single small licks, one among many, clearly simpler than the puffs (they came as a short evolution, not four separate variants); three rising ground flames, upright, their tips leaving upward as the base dies, so a fresh one keeps the fire going; two smoke puffs that grow and thin; and the impact we lacked, a fire splash (it reads more as a hit on the ground than on a body). The ember is left out: one tinted spark fading in code does it.',
        img: ['el-parts-sheet-2.jpg'],
        ask: 'Build Fire from these parts?',
      },
      {
        id: 'ring',
        title: 'The ring, take 2',
        text: 'Top row. A white flash, then a wave with a hot, bright front, thinning and sinking as it reaches its radius and running a little past it, and scorch streaks radiating out like spokes instead of a ring. Weaker than asked: the inside taper (the front is still a thick band); in the build the interior burns out faster behind the front.',
        img: ['el-story-ring-2.jpg'],
        ask: 'Build the ring from this?',
      },
      {
        id: 'burst',
        title: 'The burst, take 2',
        text: 'Bottom row, the same wave cut to the aimed fan. Its second panel is right: an arc segment of the ring\'s wave thrown forward. The third drifts into a filled triangle from the hands, more spray than wave, which the build will not follow; the frayed, burning ends only partly show. The build runs the ring\'s wave over the fan and lowers and frays it toward the two ends.',
        img: ['el-story-ring-2.jpg'],
        ask: 'Build the burst that way?',
      },
    ],
    general: 'Anything else about Fire',
  },
];
