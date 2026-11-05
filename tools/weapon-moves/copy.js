/* Weapon Moveset Review: the words on the page (round 2, grammar v2).
 * Sources: docs/explorations/2026-11-05-weapons-review-1.md (grammar v2, the round-1 verdicts)
 * and docs/explorations/2026-11-05-guards.md (the guards, the redesigns, the open questions). */
(function () {
  'use strict';
  const PB = window.PB;
  PB.WMC = {
    // the v2 grammar table in the header: [gesture, move, defined by, what it does, uses]
    grammar: [
      ['RMB tap', 'Strike', 'weapon', 'The default swing. Three in rhythm make a combo; the third hit is the weapon’s finisher.', '1'],
      ['RMB hold', 'Heavy', 'weapon', 'Charge, then release (the healing link is held instead). The weapon’s big blow.', '2'],
      ['Shift+RMB', 'Special', 'weapon', 'The one move that sets this weapon apart: a Sweep for most, the javelin for the spear, Copy for the Echo focus.', '2–3'],
      ['Shift+LMB', 'Retreat', 'guard', 'A quick move away from where you face. Each guard moves you differently.', 'free'],
      ['Space', 'Defend', 'guard', 'Hold to block, tap as a hit lands to parry. Each guard adds a block effect and a parry effect.', 'free'],
    ],
    // one caption per round-2 vignette slug
    moves: {
      'w-staff-strike': 'Three light swings in rhythm. Each one shoves the goblin back a step and does almost no damage.',
      'w-staff-heavy': 'Hold it, then let go: a big shove that knocks one goblin over, still without damage.',
      'w-staff-sweep': 'A spin that clears space around you. It pushes everyone out a step, your partner too.',
      'w-water-strike': 'Wide trident arcs that shove. Every hit pushes the goblin back and leaves it wet.',
      'w-water-heavy': 'A wave slash: the blow sends a wave along the floor that pushes and soaks everything it passes.',
      'w-water-sweep': 'The best sweep in the game: a wide wash that soaks everything around you, your partner included.',
      'w-life-strike': 'Touch heals an ally while your hands are on them. Three touches in rhythm heal in steps.',
      'w-life-heavy-v2': 'Healing link: hold RMB to channel into an ally. There’s no release; the link holds as they walk away, until about 8 units or a wall. 1 use a second.',
      'w-life-sweep': 'Heals only the allies you touch as you turn. It’s never a ring, and it never heals enemies.',
      'w-cold-strike': 'Three pokes. The third one goes through two bodies in a line.',
      'w-cold-heavy-v2': 'Impaling dash, much further: about 2.5× round 1 (the R1 tick marks where it used to stop), straight through a frozen target, which shatters.',
      'w-cold-send-v2': 'Javelin: an ice javelin splits off the spear and pins the target, and the ground frosts. The spear stays in your hand, so there’s no recall. 3 uses.',
      'w-lightning-strike': 'Cracks. Only the tip hits hard (a sweet spot): the goblin under the middle of the lash barely notices.',
      'w-lightning-heavy': 'A lash that chains on to up to 3 bodies.',
      'w-lightning-sweep': 'A whirl: very wide and weak. It reaches far, which includes your partner.',
      'w-arcane-v2-strike': 'Three weak orb bolts. Never your main damage: the focus is for spells.',
      'w-arcane-v2-heavy': 'Echo: hold, and the remembered spell (here Fire + Fire, a fireball) is re-cast from the orb at half power. 5 uses, no runes.',
      'w-arcane-v2-special': 'Copy: your partner casts lightning; Shift+RMB takes it as the remembered spell. Their runes fly into your orb, so both of you see what’s loaded.',
      'w-fire-strike': 'Fast slashes. The third one throws a short arc of flame.',
      'w-fire-heavy-v2': 'Fire wave: the overhead sends a rolling crescent of flame forward that ignites everything it passes. It leaves scorch, not lingering fire.',
      'w-fire-sweep': 'A ring of flame round you. Your partner is inside it.',
      'w-earth-strike': 'Slow and heavy. Against a shieldbearer, the first two hits break on the shield and the third breaks the shield (exposed).',
      'w-earth-heavy-v2': 'Directed quake: the slam sends a fissure down one lane, and rocks burst up in sequence. It knocks down everything in the line; the goblin beside it is untouched.',
      'w-earth-sweep': 'A slow, huge spin with big knockback.',
    },
    // what changed this round, per weapon card
    changed: {
      staff: 'Unchanged.',
      water: 'Redrawn as a trident; the moves are the ones you kept.',
      life: 'Heavy is now a continuous link.',
      cold: 'Heavy dashes much further; the javelin moves to Shift+RMB.',
      lightning: 'Unchanged.',
      arcane: 'Redesigned: the hook is gone, and the weapon now amplifies your spells.',
      fire: 'Heavy is now a fire wave.',
      earth: 'Heavy is now a directed quake.',
    },
    // guard vignette captions
    guardFx: {
      mirror: ['A tapped block as the arrow lands sends it back at the archer.', 'the goblin swings at air where you stood.'],
      bulwark: ['Held block: a club and an arrow both stop on the slab while you inch forward. A tap as the club lands bashes the goblin down.', 'the brute’s punch lands on the planted slab and moves nothing.'],
      ember: ['Thorns: the clubber catches fire on the block, and a fire arrow does nothing to it.', 'the chasing goblin walks into the fire line and catches fire.'],
      rime: ['Blocking frosts the floor in front of you; the charger hits the ice and slips.', 'the chaser reaches the strip and slips along it.'],
      spark: ['The parry discharges: a chain arc from the ring to the archer and on to the goblin, which stuns.', 'the goblin steps on the spark you left and is shocked.'],
      tide: ['Absorb and shove: the blocked hit pushes the goblin far back and soaks it.', 'the goblin that caught up is shoved far back and soaked.'],
      prism: ['The only guard that stops beams: the held block bends a fire beam off to the side.', 'you pass straight through the goblin that was flanking you.'],
      leaf: ['While you block, the ally behind you heals.', 'you land beside your partner and both health bars tick up.'],
    },
    // open questions from docs/explorations/2026-11-05-guards.md (first choice = recommended)
    questions: [
      { id: 'q-res-when', n: 1, title: 'Do resistances apply while you carry the guard, or only while you block?',
        text: 'Blocking already stops frontal hits completely. Resistances while carried give the guard an identity in the 80 % of the fight when you are swinging or casting.',
        choices: [['carried', 'While carried (recommended)', 'Blocking is the frontal 100 %; resistances cover the rest'], ['blocking', 'Only while blocking', 'Simpler to balance, but guards only matter with Space down'], ['none', 'No resistances at all', 'Guards are only Defend, Retreat and a passive']] },
      { id: 'q-retreat-cost', n: 2, title: 'What does Retreat cost?',
        text: 'Retreat is the guard’s escape, on Shift+LMB. It needs some limit so it isn’t spammed, and the limit should be readable (pillar 4: explicit rhythm, no hidden cooldowns).',
        choices: [['recovery', 'Nothing, with a fixed 0.5 s recovery (recommended)', 'No Retreat or Defend during the recovery'], ['cooldown', 'A cooldown timer', 'Shown on the HUD'], ['hp', 'Some guard HP per Retreat', 'Punishes the fragile guards twice']] },
      { id: 'q-guard-mix', n: 3, title: 'What does a second element do in a guard (Shield + Fire + Cold)?',
        text: 'The lead element picks the guard. The question is what a payload element adds on top.',
        choices: [['half-res', 'Only its own resistance at half strength, plus a colour coat (recommended)', 'Defend, Retreat and passive stay the lead element’s'], ['nothing', 'Nothing', 'Extra elements are wasted in a guard'], ['mix', 'Mix the traits', 'For example Ember thorns on a Rime kite. Fun to discover, hard for a partner to read']] },
      { id: 'q-brace', n: 4, title: 'The Bulwark’s Retreat doesn’t move you (Brace). Keep that exception?',
        text: 'The tank’s way out is to stop being moved, and the planted slab is a clear tell. The alternative reads like a weak Backstep.',
        choices: [['brace', 'Yes, keep Brace (recommended)', ''], ['shove', 'No, give it a slow shove-back step', ''], ['both', 'Tap to step back, hold to brace', 'Costs a tap/hold distinction on Shift+LMB']] },
    ],
  };
})();
