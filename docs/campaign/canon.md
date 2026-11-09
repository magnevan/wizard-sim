# Story canon: what's actually approved

The one page that says which parts of the story the user has agreed to. Everything else in the repo (explorations, story candidates, review pages, names on the map) is an option until it appears in the first section here.

**Rule:** only the user moves a line into "Approved". Each line says where the approval came from. If a line changes, edit it here and log it in `../decisions/README.md`.

Started 2026-11-09 from the decisions log, the review pages' answers and the user's messages. The Story Review page's db is empty: those reactions came through chat, and are in `../explorations/2026-11-09-story/README.md`.

## Approved

**Tone and shape**
- Classic fantasy with a light touch: warmth and the odd dry joke, not slapstick. Friendly fire makes its own comedy. (`vision.md` pillar 5; "Your Go" rejected as "too goofy and slapstick".)
- Linear, region to region. You get sent to solve an issue, and that naturally brings experience and new regions. No explicit circuit, no reputation system. (Decision "The story's hook is a year when the veins shift".)
- The party is a cohort. Every line is written to "you", and no beat depends on how many players there are. (World and Progression `q-5-cohort`.)
- Many characters met in simple ways, with the world carrying the story. (Pillar 5.)

**The world**
- Magic runs as fields (broad, like climate) and veins (narrow, like rivers), and civilization grew around them. (`world/elements.md`, premise.)
- Wells are built by civilizations, great and small. They're magical infrastructure. Legendary builders can exist as colour, like a legendary swordsmith. (Decisions of 2026-11-09.)
- Veins are part of the world and have no direct gameplay effect. (`r3-6-veins`.)
- Cancelling elements can share ground, case by case. (`r3-7-hush`.)
- The academy sits on an Arcane vein, which helps bring out a wizard's natural abilities. (Decision "Pillars 1, 5 and 6 reworded".) *See the tension below.*
- The world is one continent. Places get made-up names. The current painted map is a stand-in. (Field Atlas answers; "this isn't necessarily the final map".)

**The hook**
- A special year when the veins shift: defences lose power, and new territory has to be claimed to build wells on strong sources. (Decision "The story's hook".)
- Why it's happening stays unanswered. People in the world speculate: natural, a wizarding group up to something, or a big bad. (Same decision.)

**Progression that the story has to fit**
- The queue is five runes from the start. Pools start at 1 and grow to at most about 5. Regen is the main lever. (`q-3-pacing`, `r3-5-pools`.)
- A core set comes early, and some things are held for story beats. What's held is still open. (`q-3-pacing`, `q-4-held`.)
- Early swords come from an etched focus: Sigil works only with Conjure until the art is learned, and other gestures are locked. (`r3-1-swords`, `r4-1-sigil`.)
- Regions bend regen toward their element in three bands, without changing the total. (`q-1-bands`, `q-2-total`.)
- Practice is the meditation dream, available when no enemy is engaged. (`general`, `r3-3-dream-when`, `r3-4-dream-holds`.)
- No gear by default. (`q-10-gear`.)

## The user's ideas under review (2026-11-09)

Proposed by the user and not yet settled. Critique and options are in `../explorations/2026-11-09-opening-and-innate-casting.md`.

- The academy is an analogue to an engineering school, because the world's technology runs on the fields.
- The instability's effects: veins shift within regions, wells run dry or overcharge, defences fall, new territories become magical and get fought over, wildlife and monsters are affected.
- The hook: the wizard or group gets sent out to fix a reported issue.
- **The twist:** spellcasting in this form hasn't really existed. Wizards used structures that tap fields, and the instability is letting them draw on fields innately.
- An early crash course in fighting, because the world is more dangerous and/or the academy can't afford escorts. Room for humour.

## Open tensions

- **Engineer or not.** On 2026-11-09 the user found the *wizard engineer* funny and logged "the player isn't a wizard engineer", when reacting to a story about building wells. The engineering-school idea changes that, at least for your background. Current reading: trained as one, but the game is never about doing engineering. Needs the user's word.
- **"Innate" and the Arcane vein.** `world/elements.md` calls Shield and Sigil innate and says Arcane draws out a caster's abilities. If the twist is taken, that text needs rewording.
- **Held-back unlocks against the twist.** If structures are the old world, turrets should be the familiar part, yet they're held for mid-game. See the exploration.

## Written down but NOT approved

Don't build on these as if they were decided.

- **The region table** in `../explorations/2026-11-09-story-direction.md`: Claude's placeholder. The user has only reacted to the cause.
- **The "why you" paragraph** in the same file (a wizard holds the failing place by hand). Claude's sketch.
- **"The school's wards falter during your last lesson".** Claude's sketch, marked easy to swap.
- **All four story candidates** and every character, place and event in them. "The Flitting Year"'s folding-chair crowd and the like are colour to mine at most.
- **Element essences** in `world/elements.md`: agreed in outline only, with details open.
- **The Training Grounds Blueprint:** its answers db is empty, so nothing on it has been reviewed. The twist changes its element yards and rune lessons anyway.
- **Names on the map** (`tools/map-labels/`): generated starting points.
- **Tutorial text** (`tutorial-text.ts`): deliberately neutral placeholders. The wrapper is the user's.

## Rejected

Kept so they aren't proposed again.

- Rivals as the spine; getting spells from losing. ("At odds with the actual casting system.")
- Fields physically relocating. ("Apocalyptic", and "a nightmare for building maps".)
- A ledger of promises; a reputation system.
- The player as a builder of wells, as the main story.
- The journeyman's circuit as an explicit frame. Attuning can exist but needn't be emphasized.
- Art painted one subject at a time and placed by code.
