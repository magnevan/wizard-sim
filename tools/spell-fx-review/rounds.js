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
        ask: 'Build Burn from this?',
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
];
