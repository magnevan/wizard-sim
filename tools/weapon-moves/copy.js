/* Weapon Moveset Review: the words on the page (captions, open questions, the two-handed table).
 * Source: docs/explorations/2026-11-04-weapons-and-movesets.md. Lines marked (proposal) are
 * new in this review and not in the doc. */
(function () {
  'use strict';
  const PB = window.PB;
  PB.WMC = {
    // one line per weapon x move
    moves: {
      staff: {
        strike: 'Three light swings in rhythm. Each one shoves the goblin back a step and does almost no damage.',
        thrust: 'A straight jab that nudges one body back. Its reach is a little longer than the swing’s.',
        heavy: 'Hold it like a Force charge, then let go: a big shove that knocks one goblin over, still without damage.',
        sweep: 'A spin that clears space around you. It pushes everyone out a step, your partner too.',
        send: '(proposal) The staff isn’t thrown. You point it, and a ping marks the cursor for your partner.',
        defend: 'Brace: the staff is held across you, and a charging goblin bounces off it.',
      },
      water: {
        strike: 'Wide arcs that shove. Every hit pushes the goblin back and leaves it wet.',
        thrust: 'A push poke: one long shove that drives a body away and soaks it.',
        heavy: 'A wave slash: the blow sends a wave along the floor that pushes and soaks everything it passes.',
        sweep: 'The best sweep in the game: a wide wash that soaks everything around you, your partner included.',
        send: 'Planted: the glaive sticks upright at the cursor and a spring puddle spreads round it. Shift+LMB calls it back.',
        defend: 'Douse parry: the parry throws water, which also puts you out if you’re burning.',
      },
      life: {
        strike: 'Touch heals an ally while your hands are on them. Three touches in rhythm heal in steps.',
        thrust: 'Palm push: a pulse of healing flies to the ally ahead of you.',
        heavy: 'Laying on of hands: hold it to channel into an ally next to you, then release for a strong heal.',
        sweep: 'Heals only the allies you touch as you turn. It’s never a ring, and it never heals enemies.',
        send: 'A mote of healing tossed to the ally under the cursor.',
        defend: 'A slow self-heal while you hold Space.',
      },
      cold: {
        strike: 'Three pokes. The third one goes through two bodies in a line.',
        thrust: 'The longest thrust in the game (about 3.5 units): the move for spacing.',
        heavy: 'An impaling dash through one enemy. A frozen target shatters.',
        sweep: 'A butt-spin with the spear held short: short reach, and it chills.',
        send: 'Javelin: the target is pinned (rooted) and the ground under it frosts. Shift+LMB calls the spear back.',
        defend: 'Brace: set the spear, and a charging enemy runs onto it.',
      },
      lightning: {
        strike: 'Cracks. Only the tip hits hard (a sweet spot): the goblin under the middle of the lash barely notices.',
        thrust: 'A tip crack that stuns a caster mid-draw.',
        heavy: 'A lash that chains on to up to 3 bodies.',
        sweep: 'A whirl: very wide and weak. It reaches far, which includes your partner.',
        send: 'Tether: a crackling line from you to the cursor for 2 s. Whoever crosses it is shocked.',
        defend: 'Crackle: whoever touches you is shocked.',
      },
      arcane: {
        strike: 'Chain swings with the hook on the end.',
        thrust: 'Yank: the hook flies out and pulls the body to you.',
        heavy: 'A long cast (6 units): it drags one body all the way to you, ally or enemy.',
        sweep: 'The chain swung in a ring that knocks everyone back hard.',
        send: 'Grapple: hook the point under the cursor and pull yourself there.',
        defend: 'Spin the chain in front of you to bat away one shot.',
      },
      fire: {
        strike: 'Fast slashes. The third one throws a short arc of flame.',
        thrust: 'A burning lunge that leaves a short trail of fire behind you.',
        heavy: 'An overhead that leaves a line of fire on the floor.',
        sweep: 'A ring of flame round you. Your partner is inside it.',
        send: 'Thrown: it spins out and comes back like a boomerang, setting fire along the path. No recall needed.',
        defend: 'A parry, then a riposte that sets the attacker alight.',
      },
      earth: {
        strike: 'Slow and heavy. Against a shieldbearer, the first two hits break on the shield and the third breaks the shield (exposed).',
        thrust: 'Shoulder bash: you lead with your body, maul held across, and knock the goblin down.',
        heavy: 'Ground slam: a small quake ring that knocks down everything near it.',
        sweep: 'A slow, huge spin with big knockback.',
        send: 'Dropped: thrown in a high arc like a heavy missile. It stays where it lands until you recall it.',
        defend: 'Rooted: plant the maul and nothing knocks you back while you hold it, not even a brute.',
      },
    },
    // the two-handed exception table (section 4)
    hands: [
      ['Flame sword', 'One', 'Any guard'],
      ['Frost spear', 'One', 'Any guard; spear + Bulwark is the tank build'],
      ['Lightning whip', 'One', 'Any guard'],
      ['Arcane hook', 'One', 'Any guard'],
      ['Bare staff / sculpting wand', 'One', 'Any guard; wand + Leaf aegis is a clean support build'],
      ['Stone maul', 'Two', 'No guard: conjuring it replaces your guard, and a guard replaces it'],
      ['Tide glaive', 'Two', 'No guard (as above)'],
      ['Healing hands', 'Two', 'No guard, on purpose: protecting the healer is the partner’s job'],
      ['Bulwark (guard)', '—', 'Pairs with one-handers only'],
    ],
    // open questions (section 5, minus question 2: Space blocking is decided)
    questions: [
      { id: 'q-grammar', n: 1, title: 'Do empty-queue gestures become weapon moves?',
        text: 'Runes queued = magic, no runes = your hands. Every cast gesture gets a weapon move, as on this page. The risk is misfires at the boundary: mashing RMB before you queue runes lunges you into the goblins.',
        choices: [['yes-staff', 'Yes, with weak shove-only staff moves too (recommended)', 'The grammar is learned from minute one'], ['yes-weapon', 'Yes, but only while holding a conjured weapon', 'The fallback if the slice shows frequent misfires'], ['no', 'No, keep a single weapon swing', 'Today’s behaviour']] },
      { id: 'q-guards', n: 3, title: 'Should the lead element pick the guard (eight guards, each blocking differently)?',
        text: 'This replaces Bulwark-or-Buckler. It uses the same rule as Sigil weapons and fixes “all bucklers look the same” in the rules, not just the art.',
        choices: [['eight', 'Yes, eight guards (recommended)', 'As in the Guards section'], ['fewer', 'Yes, but fewer: merge the weak ones', 'Say which in the note'], ['two', 'No, keep Bulwark and Buckler', '']] },
      { id: 'q-hands', n: 4, title: 'Two-handed exceptions: maul, glaive and Healing hands exclude a guard, and the Bulwark allows only one-handers?',
        text: 'A conflicting conjure simply replaces the other. There’s no “slung on your back” state.',
        choices: [['replace', 'Yes, and a conflicting conjure replaces the other (recommended)', 'Simple beats clever here'], ['sling', 'Yes, but keep the replaced one slung on your back', 'Swap back without recasting'], ['none', 'No exceptions: everything dual-wields', '']] },
      { id: 'q-uses', n: 5, title: 'Is a weapon’s resource uses only, with no rune cost per move?',
        text: 'Strike and Thrust cost 1 use, Heavy, Sweep and Send cost 2. About 30 uses, shown as a pip bar on the weapon in the world and in the HUD, so the break is never a surprise. Durability is what keeps melee from becoming the easy-keys strategy (pillar 4).',
        choices: [['uses', 'Yes, about 30 uses (recommended)', ''], ['uses-fewer', 'Uses, but fewer (about 15)', 'Shorter bursts of melee'], ['timer', 'A timer instead of uses', 'It fades after N seconds whatever you do']] },
    ],
  };
})();
