/* Weapon Moveset Review: the words on the page (round 3, grammar v2).
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
      ['Shift+RMB', 'Special', 'weapon', 'The one move that sets this weapon apart: a Sweep for most, the javelin for the spear; held for Siphon (the wand) and Mend (the healing hands).', '2, or 1/s held'],
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
      // round 3
      'w-arcane-v3-strike': 'Light bolts from the orb at the wand’s tip, at range. Never your main damage, but the only weapon that hits from across the room.',
      'w-arcane-v3-heavy': 'Charged bolt: hold to charge, release a heavy bolt. From half charge it pierces, going through the first goblin into the one behind. 2 uses.',
      'w-arcane-v3-special': 'Siphon: hold Shift+RMB. You’re rooted, motes stream into the orb, and your runes come back four times as fast (the mini HUD). 1 use a second.',
      'w-life-mend': 'Mend: hold Shift+RMB. Allies within 3.5 units heal while you walk at half speed; the one outside the ring doesn’t. Not you. 1 use a second.',
      'w-cold-send-v3': 'Javelin, re-animated: frost creeps up the shaft as you draw back, and the thrust sends the ice javelin off the spearhead along the same line. It pins and frosts. The spear stays in your hand. 2 uses (of 30).',
    },
    // round 3: what changed per weapon card, from your round-2 notes
    changed3: {
      life: 'Special is now Mend, a held healing aura (you cut the sweep: “channel healing energy… kinda like beam, weaker, but aoe”). The card no longer says two-handed.',
      cold: 'The javelin animation is redone, and it costs 2 uses, not 3.',
      arcane: 'Redesigned again as a ranged wand (“making it into a ranged wand is good. Maybe a special around regenerating runes?”). Echo and Copy are gone.',
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
    // round-3 guard vignette captions, by slug
    guardFx3: {
      'g-mirror-retreat-v2': 'the hop now covers 3 units (the line under it); the goblin swings at air.',
      'g-bulwark-retreat-v2': 'you step back as the slab slams forward; both goblins in front fly back and are stunned.',
      'g-rime-defend-v2': 'the goblin hits your block and is chilled (slower, no ice on the floor); a tap as its second blow lands freezes it.',
      'g-prism-defend-v2': 'your partner’s cold beam passes through you (Clear) and hits the goblin; then a caster’s fire beam stops on the raised pane, and a tap returns it.',
      'g-leaf-defend-v2': 'allies in front and behind both heal inside the ring while you block; the parry bursts a heal to all three of you.',
      'g-leaf-retreat-v2': 'you hop back alone and a bloom grows where you stood; your partner walks into it later and heals.',
    },
    // what changed per guard card in round 3
    changedG3: {
      mirror: 'You said it felt weak: a plain block now glances shots aside without wearing the buckler down, HP is up (90), and the Backstep is 3 units.',
      bulwark: 'Brace is gone. The Retreat is a Shove step: a step back plus a kickback on whatever is in front (your note).',
      rime: 'The block no longer frosts the floor; attackers who hit it are chilled instead (your note: “I don’t want too many accidental ground effects”).',
      tide: 'Doused (always wet) is gone, so you can cast lightning safely. The passive is Quenched: you can’t burn.',
      prism: 'The passive no longer halves beams, so the block matters. New passive, Clear: your allies’ beams and sprays don’t hurt you. The block stops sprays too.',
      leaf: 'Healing no longer depends on standing behind you: the block heals allies on any side, the parry heals you too, and the Retreat is a Seed step that works with no ally near.',
    },
    // How elements mix (round 3): the questions in the section near the top (first choice = recommended)
    mixQuestions: [
      { id: 'q-mix-lead', n: 'M1', round: 3, title: 'The lead is the strongest element present, as in spells.',
        text: 'Life > Earth > Arcane > Lightning, the same order that picks a spell’s form. Fire, Cold and Water lead only when no strong element is in the guard, and then by count. Today the lead is whichever element has the most runes.',
        choices: [['strength', 'Strength, as in spells (recommended)', 'One order to learn for spells and guards'], ['count', 'Most runes (today)', 'Needs a hidden tie-break']] },
      { id: 'q-mix-all', n: 'M2', round: 3, title: 'Every extra element mixes in.',
        text: 'Today a third element in a guard is ignored. That breaks your rule that adding an element can’t ever not change the spell. With this, every element the lead carries brings something.',
        choices: [['all', 'Yes, all of them (recommended)', 'Every element in the guard brings something'], ['second', 'Only the second (today)', 'A third element stays inert']] },
      { id: 'q-mix-coat', n: 'M3', round: 3, title: 'What the lead carries becomes the material of its moves: the pairings below.',
        text: 'Like a spell: Earth + Fire is a fireball. The strong guard keeps its moves’ shape, and the carried element is their material, with its own shape per pairing (the list below; rate each row). The Ember thorns and the Rime chill become simply those guards’ own material. The weak guards (Ember, Rime, Tide) only mix with each other, so a plain coat is enough for them.',
        choices: [['coat', 'Yes, material per pairing (recommended)', 'About 15 pairings to design and draw'], ['passive', 'Passives and resistances only', 'No change to the moves'], ['none', 'No mixing', 'Extra elements do nothing in a guard']] },
      { id: 'q-mix-scale', n: 'M4', round: 3, title: 'Rune counts scale what an element brings.',
        text: 'A carried element at 1 rune gives half its resistance row; at 2 runes, the full row. Each extra rune of the lead adds 25 % guard HP and 25 % Retreat distance (the Life rule: more of the shape element makes the shape bigger).',
        choices: [['count', 'Scale by rune count (recommended)', 'More runes always change something'], ['flat', 'Flat half, whatever the count', 'Simpler, but a second rune of the same element does nothing']] },
      { id: 'q-mix-weapons', n: 'M5', round: 3, title: 'Weapons: the same rule. Sigil plus a strong lead bends to what it carries.',
        text: 'Extra runes keep riding on every blow, and each extra rune of the lead adds 10 uses. The held Specials take the material too: Mend + Water also washes off burning and freezing; Siphon + an element refills that element twice as fast.',
        choices: [['yes', 'Yes (recommended)', 'Mend and Siphon stop ignoring extra runes'], ['leave', 'Leave weapons as they are', 'Blows mix; Mend and Siphon ignore extras']] },
    ],
    // the pairings: a strong lead and the element it carries (docs/explorations/2026-11-05-guards-round-2.md, revision)
    mixPairs: [
      ['mix-leaf-earth', 'Leaf', 'life', ['earth'], 'The Seed step leaves a heal-stone that bursts on allies; more guard HP (the Life lend: heal-stone).'],
      ['mix-leaf-lightning', 'Leaf', 'life', ['lightning'], 'The block’s heal chains from ally to ally (Chain heal).'],
      ['mix-leaf-cold', 'Leaf', 'life', ['cold'], 'The parry’s burst heal flies out as shards that each find a hurt ally (Healing shards).'],
      ['mix-leaf-fire', 'Leaf', 'life', ['fire'], 'Heals also dry and thaw (Healing spray).'],
      ['mix-leaf-water', 'Leaf', 'life', ['water'], 'Heals nudge allies out of danger and put out burning (Rescue spray).'],
      ['mix-bulwark-fire', 'Bulwark', 'earth', ['fire'], 'The slab glows hot: biters burn, and the Shove step sets the shoved alight.'],
      ['mix-bulwark-cold', 'Bulwark', 'earth', ['cold'], 'Biters and the shoved are chilled; a frozen target shoved into a wall shatters.'],
      ['mix-bulwark-water', 'Bulwark', 'earth', ['water'], 'The Shove step is a wave: it shoves further and soaks.'],
      ['mix-bulwark-arcane', 'Bulwark', 'earth', ['arcane'], 'The slab hits as arcane force and knocks further.'],
      ['mix-prism', 'Prism', 'arcane', ['fire', 'cold', 'water', 'lightning'], 'A parried beam comes back in the carried element, and Phase leaves that element on bodies you pass through.'],
      ['mix-spark-fire', 'Spark', 'lightning', ['fire'], 'The Blink spark bursts into flame, and the discharge ignites.'],
      ['mix-spark-cold', 'Spark', 'lightning', ['cold'], 'The Blink spark chills, and so does the discharge.'],
      ['mix-weak', 'Ember / Rime / Tide', 'fire', ['cold', 'water'], 'A coat only, when the weak guards mix with each other: Ember + Water thorns scald (steam); Tide + Cold Surge leaves ice; Rime + Water freezes longer.'],
    ],
    // open questions (first choice = recommended). Round 3 first; round 2's are answered.
    questions: [
      { id: 'q-carry', n: 1, round: 3, title: 'Carrying a guard or a weapon costs 5 % walk speed each (the Bulwark another 15 %). Enough?',
        text: 'Your note on resistances: carrying weapons should slow you a little. A guard plus a weapon is about 10 % slower than empty hands. Siphon roots you and Mend halves your speed while held.',
        choices: [['yes', 'Yes, as a starting point (recommended)', 'Tune it in play'], ['more', 'More: 10 % each', ''], ['none', 'No slow-down', 'Keep carrying free']] },
      { id: 'q-res-when', n: 2, round: 2, title: 'Do resistances apply while you carry the guard, or only while you block?',
        text: 'Blocking already stops frontal hits completely. Resistances while carried give the guard an identity in the 80 % of the fight when you are swinging or casting.',
        choices: [['carried', 'While carried (recommended)', 'Blocking is the frontal 100 %; resistances cover the rest'], ['blocking', 'Only while blocking', 'Simpler to balance, but guards only matter with Space down'], ['none', 'No resistances at all', 'Guards are only Defend, Retreat and a passive']] },
      { id: 'q-retreat-cost', n: 3, round: 2, title: 'What does Retreat cost?',
        text: 'Retreat is the guard’s escape, on Shift+LMB. It needs some limit so it isn’t spammed, and the limit should be readable (pillar 4: explicit rhythm, no hidden cooldowns).',
        choices: [['recovery', 'Nothing, with a fixed 0.5 s recovery (recommended)', 'No Retreat or Defend during the recovery'], ['cooldown', 'A cooldown timer', 'Shown on the HUD'], ['hp', 'Some guard HP per Retreat', 'Punishes the fragile guards twice']] },
      { id: 'q-guard-mix', n: 4, round: 2, title: 'What does a second element do in a guard (Shield + Fire + Cold)?',
        text: 'The lead element picks the guard. The question is what a payload element adds on top.',
        choices: [['half-res', 'Only its own resistance at half strength, plus a colour coat (recommended)', 'Defend, Retreat and passive stay the lead element’s'], ['nothing', 'Nothing', 'Extra elements are wasted in a guard'], ['mix', 'Mix the traits', 'For example Ember thorns on a Rime kite. Fun to discover, hard for a partner to read']] },
      { id: 'q-brace', n: 5, round: 2, title: 'The Bulwark’s Retreat doesn’t move you (Brace). Keep that exception?',
        text: 'The tank’s way out is to stop being moved, and the planted slab is a clear tell. The alternative reads like a weak Backstep.',
        choices: [['brace', 'Yes, keep Brace (recommended)', ''], ['shove', 'No, give it a slow shove-back step', ''], ['both', 'Tap to step back, hold to brace', 'Costs a tap/hold distinction on Shift+LMB']] },
    ],
  };
})();
