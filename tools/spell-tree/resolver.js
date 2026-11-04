/* Spell tree, Proposal A ("Magicka plus two verbs"), as a pure resolver.
 * See docs/explorations/2026-11-03-spell-tree.md. Shared by the explorer page;
 * the skeleton prototype ports the same rules to TypeScript.
 *
 *   addElement(queue, el) -> { queue, event }   combine / cancel rules
 *   resolve(queue, mode, { seal, target })      -> spell descriptor
 * mode: 'force' | 'area' | 'self' | 'weapon' | 'point'
 * target (point only): 'ground' | 'ally' | 'enemy'
 */
(function () {
  const ELEMENTS = {
    water: { name: 'Water', key: 'Q', color: '#3fa1ff' },
    life: { name: 'Life', key: 'W', color: '#5fe07a' },
    shield: { name: 'Shield', key: 'E', color: '#ffe08a' },
    cold: { name: 'Cold', key: 'R', color: '#aeefff' },
    lightning: { name: 'Lightning', key: 'A', color: '#c7a8ff' },
    arcane: { name: 'Arcane', key: 'S', color: '#ff4f9b' },
    earth: { name: 'Earth', key: 'D', color: '#b5895a' },
    fire: { name: 'Fire', key: 'F', color: '#ff7b39' },
    steam: { name: 'Steam', color: '#e4e9f2', combined: true },
    ice: { name: 'Ice', color: '#cdf3ff', combined: true },
  };
  const BASE = ['water', 'life', 'shield', 'cold', 'lightning', 'arcane', 'earth', 'fire'];
  const MAX = 5;
  // Pairs that merge into a combined element when the second is added.
  const COMBINE = [['water', 'fire', 'steam'], ['water', 'cold', 'ice']];
  // Pairs that annihilate each other.
  const CANCEL = [['fire', 'cold'], ['water', 'lightning'], ['life', 'arcane'], ['earth', 'lightning'], ['shield', 'shield'], ['steam', 'cold'], ['ice', 'fire']];
  const pairIs = (p, a, b) => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a);

  function addElement(queue, el) {
    for (let i = queue.length - 1; i >= 0; i--) {
      const c = CANCEL.find((p) => pairIs(p, queue[i], el));
      if (c) return { queue: queue.filter((_, j) => j !== i), event: `${ELEMENTS[el].name} cancels ${ELEMENTS[queue[i]].name}` };
    }
    for (let i = queue.length - 1; i >= 0; i--) {
      const c = COMBINE.find((p) => pairIs(p, queue[i], el));
      if (c) { const q = queue.slice(); q[i] = c[2]; return { queue: q, event: `${ELEMENTS[queue[i]].name} + ${ELEMENTS[el].name} → ${ELEMENTS[c[2]].name}` }; }
    }
    if (queue.length >= MAX) return { queue, event: 'Queue is full (5)' };
    return { queue: queue.concat(el), event: null };
  }

  const DAMAGING = ['fire', 'cold', 'lightning', 'earth', 'ice', 'steam', 'arcane'];
  const SPRAY = ['water', 'fire', 'cold', 'steam'];
  const names = (els) => els.map((e) => ELEMENTS[e].name.toLowerCase());
  const list = (arr) => arr.length <= 1 ? arr.join('') : arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];

  function resolve(queue, mode, opts = {}) {
    const has = (e) => queue.includes(e);
    const others = (...ex) => queue.filter((e) => !ex.includes(e));
    const uniq = [...new Set(queue)];
    const power = queue.length;
    const attuned = has('life') && queue.some((e) => DAMAGING.includes(e)) && mode !== 'self';
    const out = { form: '', title: '', text: '', leaf: null, power, attuned, notes: [] };
    const elText = list(names(uniq));

    if (opts.seal) return sealed(queue, mode, opts, out);
    if (!queue.length) {
      if (mode === 'point' && opts.target === 'ally') return Object.assign(out, { form: 'nothing', title: 'Nothing', text: 'Queue elements first. Arcane on an ally pulls them to you (Yank).' });
      if (mode === 'weapon') return Object.assign(out, { form: 'swing', title: 'Staff swing', text: 'A plain melee swing.' });
      return Object.assign(out, { form: 'nothing', title: 'Nothing', text: 'Queue some elements first.' });
    }

    if (opts.variant === 'a1') {
      const r = resolveA1(queue, mode, opts, out);
      if (r) return r;
    }

    if (mode === 'force') {
      if (has('shield')) {
        if (has('earth') || has('ice')) return done(out, 'wall', has('earth') ? 'Rock wall' : 'Ice wall', `Raise a ${has('earth') ? 'rock' : 'ice'} wall across your aim. Your projectiles bounce off it. Release bursts it into shrapnel.`, has('earth') ? 'Shatter Bulwark (with Release)' : null);
        if (others('shield').length) return done(out, 'barrier', 'Elemental barrier', `A curved barrier of ${list(names(uniq.filter((e) => e !== 'shield')))} in front of you.`);
        return done(out, 'barrier', 'Reflecting barrier', 'A curved shield in front of you that reflects projectiles.');
      }
      if (has('earth')) return done(out, 'projectile', 'Rock', `Hold to charge, release to throw. A full charge pierces and carries the first enemy.${others('earth').length ? ` Carries ${list(names(others('earth')))}.` : ''}`, 'Pinning Javelin (full charge)');
      if (has('ice')) return done(out, 'projectile', 'Ice shards', 'A spread of shards that bounce off walls.', 'Ricochet Bolt');
      if (has('arcane')) return done(out, 'beam', 'Arcane beam', `A sustained beam. Through a Lens it splits or focuses.${others('arcane').length ? ` Carries ${list(names(others('arcane')))}.` : ''}`);
      if (has('life') && !queue.some((e) => DAMAGING.includes(e))) return done(out, 'beam', 'Life beam', 'A sustained healing beam. Heals whatever it touches, friend or foe.');
      if (has('lightning')) return done(out, 'arc', 'Lightning arc', 'Chains between nearby targets. Wet targets conduct it further.');
      return done(out, 'spray', 'Spray', `A sustained cone of ${elText}.`);
    }

    if (mode === 'area') {
      if (has('shield')) return done(out, 'ring-ward', has('earth') ? 'Ring of stone' : 'Ward ring', has('earth') ? 'Rock walls rise in a ring around you.' : 'Wards everyone standing next to you.');
      if (uniq.length === 1 && has('life')) return done(out, 'zone', 'Healing circle', 'Heals everyone around you. Hold to sustain it as a zone you maintain.', 'Sustained Circle');
      if (has('earth')) return done(out, 'nova', 'Earthquake', 'A shockwave ring that knocks everything down.');
      return done(out, 'nova', 'Elemental nova', `A ring of ${elText} bursting out from you.`);
    }

    if (mode === 'self') {
      if (uniq.length === 1 && has('life')) return done(out, 'heal', 'Heal', 'Heal yourself. Hold for heal over time while you move slowly.');
      if (has('shield')) return done(out, 'ward', 'Ward', `Shield yourself${others('shield').length ? ` and become resistant to ${list(names(uniq.filter((e) => e !== 'shield')))}` : ''}.`);
      return done(out, 'ward', 'Elemental ward', `Become resistant to ${elText}.`);
    }

    if (mode === 'weapon') {
      if (has('shield')) {
        const kind = has('ice') ? ['Ice blade', 'A conjured ice blade: fast swings that chill.'] : has('lightning') ? ['Lightning whip', 'A conjured whip with long reach that chains.'] : ['Bulwark', 'A conjured tower shield. Hold to block a frontal arc, swing to bash.'];
        return done(out, 'weapon', kind[0], kind[1], kind[0] === 'Bulwark' ? 'Bulwark Shield' : null);
      }
      if (has('earth')) return done(out, 'line', 'Fault line', 'The ground cracks in a line ahead. Enemies are thrown aside and a ridge remains.', 'Fault Line');
      if (has('water')) return done(out, 'wave', 'Tidal wave', 'A wide wave rolls forward, shoving and soaking everything.', 'Tidal Wave');
      if (uniq.length === 1 && has('life')) return done(out, 'line', 'Healing line', 'Heals allies in a line ahead, not the enemies around them.');
      return done(out, 'line', 'Ground line', `A line of ${elText} races along the ground ahead.`);
    }

    if (mode === 'point') {
      const tgt = opts.target || 'ground';
      if (has('shield') && has('arcane')) return done(out, 'structure', 'Lens', 'A floating lens. Beams through it grow stronger. Two beams merge, and the first caster steers. Cursor near the lens splits, far focuses.', 'Prism');
      if (has('shield') && has('life')) return done(out, 'zone', 'Lantern', 'For a moment, nobody in its glow can drop below 1 HP.', 'Stay of Death');
      if (has('shield')) return done(out, 'ward', tgt === 'ally' ? 'Ward toss' : 'Placed ward', `Lob a shield bubble ${tgt === 'ally' ? 'onto your ally' : 'onto the spot'}${others('shield').length ? `, warding against ${list(names(uniq.filter((e) => e !== 'shield')))}` : ''}.`, 'Ward Toss');
      if (has('arcane') && tgt !== 'ground' && opts.variant !== 'a1') return done(out, 'pull', 'Yank', `A tether pulls the ${tgt} to you.${tgt === 'enemy' ? ' Drag a caster out from behind its guards.' : ''}`, 'Yank');
      if (uniq.length === 1 && has('life')) return done(out, 'heal', tgt === 'ally' ? 'Mend' : 'Healing bloom', tgt === 'ally' ? 'Heal this one ally. No splash onto the enemies around them.' : 'A small healing bloom at the spot.');
      if (has('earth')) return done(out, 'eruption', 'Geyser', `The ground under the cursor rumbles, then erupts${has('arcane') ? ' in a big arcane blast' : ''}.`, 'Geyser');
      if (has('ice')) return done(out, 'eruption', 'Ice spikes', 'Spikes burst out of the ground at the cursor.');
      if (has('lightning')) return done(out, 'strike', 'Lightning strike', 'A bolt from above hits the spot. On water it surges through the whole surface.', 'Surface Surge (on water)');
      if (has('water') && uniq.length === 1) return done(out, 'surface', 'Flood', 'Floods a patch of ground: a surface to freeze or electrify later.');
      if (has('cold') && uniq.length === 1) return done(out, 'surface', 'Frost patch', 'Freezes the ground and any water at the spot. Freeze a pond to walk on it.');
      if (has('arcane')) return done(out, 'eruption', 'Arcane blast', 'An arcane explosion at the cursor.');
      return done(out, 'bloom', 'Elemental bloom', `A burst of ${elText} at the cursor.`);
    }
    return out;
  }

  // Proposal A.1 (from the tree audit): enchantments in Self, "Point on an ally casts your
  // Self spell on them", Cage for Shield on an enemy, Yank only with Arcane alone.
  function selfEnchant(queue) {
    const has = (e) => queue.includes(e);
    const uniq = [...new Set(queue)];
    const rest = list(names(uniq.filter((e) => e !== 'shield')));
    if (has('shield') && has('arcane')) return ['enchant', 'Ethereal', 'Turn ghostly for a few seconds: attacks pass through, but you cannot attack either.', 'Ethereal Shift'];
    if (has('shield')) return ['ward', 'Ward', `A shield bubble${rest ? ` that also resists ${rest}` : ''}.`, 'Ward Toss'];
    if (uniq.length === 1 && has('life')) return ['heal', 'Heal', 'Heal now. Hold for heal over time.', null];
    if (has('arcane') && has('fire')) return ['enchant', 'Glass cannon', 'Deal more damage and take more damage for a while.', null];
    if (has('lightning')) return ['enchant', 'Haste', 'Move and cast faster for a few seconds. More lightning lasts longer.', null];
    if (has('earth')) return ['enchant', 'Stoneskin', "Rock armor soaks damage but slows you down, like Magicka's rock shield.", null];
    if (uniq.length === 1 && has('water')) return ['enchant', 'Cleanse', 'Wash off burning, frozen and other statuses.', null];
    return ['ward', 'Elemental ward', `Resist ${list(names(uniq))}.`, null];
  }

  function resolveA1(queue, mode, opts, out) {
    const has = (e) => queue.includes(e);
    const uniq = [...new Set(queue)];
    const tgt = opts.target || 'ground';
    if (mode === 'self') {
      const [form, title, text, leaf] = selfEnchant(queue);
      return done(out, form, title, text, leaf);
    }
    if (mode === 'point' && tgt !== 'ground' && uniq.length === 1 && has('arcane')) {
      return done(out, 'pull', 'Yank', `A tether pulls the ${tgt} to you.`, 'Yank');
    }
    if (mode === 'point' && tgt === 'ally') {
      out.attuned = false;
      const [form, title, text, leaf] = selfEnchant(queue);
      const label = title === 'Heal' ? 'Mend' : title === 'Ward' ? 'Ward toss' : `${title} (on ally)`;
      return done(out, form, label, `Your Self spell, cast on this ally. ${text}`, leaf);
    }
    if (mode === 'point' && tgt === 'enemy' && has('shield') && !has('arcane') && !has('life')) {
      return done(out, 'cage', 'Cage', 'A bubble traps the enemy: it cannot leave, and its shots stay inside.', null);
    }
    return null;
  }

  function sealed(queue, mode, opts, out) {
    const has = (e) => queue.includes(e);
    const elText = list(names([...new Set(queue)]));
    if (!queue.length) return done(out, 'nothing', 'Nothing to seal', 'Queue elements first, then Seal stores them instead of casting.');
    out.notes.push('Release sets off every spell you have sealed, at once.');
    if (mode === 'self') {
      if (has('shield')) return done(out, 'stored', 'Contingency', `Stored in your staff. Because it holds Shield, it fires itself the moment you are hit (${elText}).`, 'Contingency');
      return done(out, 'stored', 'Stored spell', `Stored in your staff (${elText}). Release casts it instantly, in whatever cast mode you release with.`, 'Stored Spell');
    }
    if (mode === 'point') {
      if (has('life') && has('shield')) out.attuned = false;
      if (has('life') && has('shield')) return done(out, 'rune', 'Effigy', 'A small guardian rises from the rune. Enemies attack it, and it fires its spell when broken.', 'Payload Effigy');
      return done(out, 'rune', 'Rune', `A rune at the cursor. It arms after a moment and bursts with ${elText} when an enemy steps on it, or on Release. Seal several, release all at once.`, 'Trap Rune / Detonation Lattice');
    }
    if (mode === 'force') return done(out, 'rune', 'Line rune', `A rune line drawn from you toward the aim. Whatever crosses it sets off ${elText} along its whole length.`, 'Tripwire');
    if (mode === 'area') {
      if (has('life') && queue.every((e) => e === 'life')) return done(out, 'orbit', 'Healing orbitals', 'Motes of life circle you. Release flings one to each ally nearby.');
      if (has('shield')) return done(out, 'orbit', 'Shield plates', 'Wards circle you and block shots. Release throws a ward to each ally nearby.');
      return done(out, 'orbit', 'Orbitals', `Charges of ${elText} circle you. Seal the same spell again to add more. Release flings them all at the cursor.`, 'Primed Orbitals / Spell Quiver');
    }
    if (mode === 'weapon') return done(out, 'stored', 'Loaded blow', `Your next swing carries ${elText} and unleashes it on hit.`);
    return out;
  }

  function done(out, form, title, text, leaf) {
    Object.assign(out, { form, title, text, leaf: leaf || (out.attuned ? 'Attuned Blast' : null) });
    if (out.attuned) out.notes.push('Life makes this spare your allies: it heals them a little instead of hurting them.');
    return out;
  }

  // The liked leaves and a recipe that produces each one.
  const RECIPES = [
    ['Geyser', '★', ['earth', 'arcane'], 'point', {}],
    ['Tidal Wave', '★', ['water', 'water'], 'weapon', {}],
    ['Trap Rune', '★', ['fire', 'earth'], 'point', { seal: true }],
    ['Primed Orbitals', '★', ['earth', 'earth'], 'area', { seal: true }],
    ['Attuned Blast', '★', ['fire', 'earth', 'life'], 'area', {}],
    ['Stored Spell', '★', ['fire', 'arcane', 'lightning'], 'self', { seal: true }],
    ['Ward Toss', '★', ['shield', 'fire'], 'point', { target: 'ally' }],
    ['Yank', '★', ['arcane'], 'point', { target: 'ally' }],
    ['Sustained Circle', '★', ['life', 'life'], 'area', {}],
    ['Surface Surge', '★', ['lightning'], 'point', {}],
    ['Shatter Bulwark', '★', ['shield', 'earth'], 'force', {}],
    ['Bulwark Shield', '★', ['shield', 'earth'], 'weapon', {}],
    ['Ricochet Bolt', '★', ['ice'], 'force', {}],
    ['Prism', '?', ['shield', 'arcane'], 'point', {}],
    ['Stay of Death', '?', ['shield', 'life'], 'point', {}],
    ['Fault Line', '?', ['earth', 'earth'], 'weapon', {}],
    ['Pinning Javelin', '?', ['earth', 'earth', 'earth'], 'force', {}],
    ['Contingency', '?', ['shield', 'water', 'arcane'], 'self', { seal: true }],
    ['Spell Quiver', '?', ['arcane', 'fire'], 'area', { seal: true }],
    ['Tripwire', '?', ['lightning', 'arcane'], 'force', { seal: true }],
    ['Payload Effigy', '?', ['life', 'shield', 'cold'], 'point', { seal: true }],
    ['Detonation Lattice', '?', ['fire', 'arcane'], 'point', { seal: true }],
  ];

  window.SpellTreeA = { ELEMENTS, BASE, MAX, COMBINE, CANCEL, addElement, resolve, RECIPES };
})();
