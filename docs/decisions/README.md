# Decision log

Append-only. Each entry records the date, the decision, why it was made, and the alternatives that were rejected. If a later entry reverses an earlier one, link back to it. A superseded statement gets one short italic pointer under it; the entries themselves aren't rewritten. For a one-page summary of what's true now, see `../current-state.md`.

## Topic index

- **Process and repo:** [Repo is design-first](#2026-11-02-repo-is-design-first) · [Engine phase starts](#2026-11-04-engine-phase-starts) · [Going public as Wizard Sim](#2026-11-04-going-public-as-wizard-sim) · [Build optimistically](#2026-11-05-build-optimistically)
- **Pillars:** [Feedback round 1](#2026-11-02-feedback-round-1-see-explorations2026-11-02-feedback-round-1md) · [Preparation pillar; death is harsher](#2026-11-03-preparation-pillar-death-is-harsher) · [Resources and battlefield](#2026-11-03-resources-and-battlefield-see-explorations2026-11-03-resources-and-battlefieldmd) · [Pillars 1, 5 and 6 reworded; the world is fields](#2026-11-07-pillars-1-5-and-6-reworded-the-world-is-fields-explorations2026-11-07-world-and-progressionmd) · [World and progression, round 2](#2026-11-08-world-and-progression-round-2-explorations2026-11-07-world-and-progressionmd) · [round 3](#2026-11-08-world-and-progression-round-3-explorations2026-11-07-world-and-progressionmd)
- **Spell grammar and elements:** [Round 3](#2026-11-03-round-3-see-explorations2026-11-03-feedback-round-3md) · [Structures in proposal C](#2026-11-03-structures-in-proposal-c-weapon-column-merged) · [Seal becomes an element; Steam and Ice dropped](#2026-11-03-seal-becomes-an-element-steam-and-ice-dropped-see-explorations2026-11-03-structures-review-and-elementsmd) · [Overnight proposals](#2026-11-04-overnight-proposals-nothing-decided) · [The overnight drafts, reviewed](#2026-11-04-the-overnight-drafts-reviewed-see-explorations2026-11-04-overnight-draftsmd)
- **Runes and economy:** [Resources and battlefield](#2026-11-03-resources-and-battlefield-see-explorations2026-11-03-resources-and-battlefieldmd) · [Calls Claude made while building milestone 1](#2026-11-04-calls-claude-made-while-building-milestone-1-the-user-can-veto-any) · [Balance tooling](#2026-11-04-balance-tooling-and-the-first-measurements) · [The rune economy: a shared regen budget](#2026-11-05-the-rune-economy-a-shared-regen-budget-with-a-floor-explorations2026-11-05-rune-economymd) · [The rune economy, built](#2026-11-05-the-rune-economy-built) · [Rune scaling](#2026-11-05-rune-scaling-the-audits-recommendations-accepted)
- **Shield and walls:** [The overnight drafts, reviewed](#2026-11-04-the-overnight-drafts-reviewed-see-explorations2026-11-04-overnight-draftsmd) (Model A) · [Play-test notes, round 2](#2026-11-04-play-test-notes-round-2-explorations2026-11-04-playtest-2md) · [Play-test round 2, answers](#2026-11-05-play-test-round-2-answers-and-notes-811) · [Rings, wall lifetime, Self on allies](#2026-11-05-rings-wall-lifetime-self-on-allies)
- **Sigil, devices, the Double:** [Sigil's identity](#2026-11-04-sigils-identity-see-explorations2026-11-04-sigil-identity-and-buffsmd) · [The look rule, ice shards, turret draw](#2026-11-04-the-look-rule-ice-shards-turret-draw-the-users-feedback-on-the-vfx-gallery-and-pixel-battlefield-pass-3) · [Play-test notes, round 1](#2026-11-04-play-test-notes-round-1-the-users-first-session-with-the-build) · [Play-test round 2, answers](#2026-11-05-play-test-round-2-answers-and-notes-811) (turrets)
- **Life and support:** [The overnight drafts, reviewed](#2026-11-04-the-overnight-drafts-reviewed-see-explorations2026-11-04-overnight-draftsmd) (L3) · [Grammar v2; wards for support](#2026-11-05-grammar-v2-in-the-game-wards-for-support) · [Life spells, the size rule](#2026-11-05-life-spells-the-size-rule-the-inert-audits-life-group) · [Every element in a heal lends its resistance](#2026-11-05-every-element-in-a-heal-lends-its-resistance-guard-ties-settled)
- **Statuses:** [Cold freezes the wet](#2026-11-06-cold-freezes-the-wet-ice-doesnt-soak-chill-slows-attacks)
- **Visuals and deaths:** [The look rule](#2026-11-04-the-look-rule-ice-shards-turret-draw-the-users-feedback-on-the-vfx-gallery-and-pixel-battlefield-pass-3) · [Play-test notes, round 1](#2026-11-04-play-test-notes-round-1-the-users-first-session-with-the-build) · [Deaths for every enemy](#2026-11-05-deaths-for-every-enemy) · [Lingering effects last as long as they look](#2026-11-05-lingering-effects-last-as-long-as-they-look) · [Floors fade; the consistency audit](#2026-11-05-floors-fade-the-consistency-audit) · [Enemy attacks drawn](#2026-11-06-enemy-attacks-drawn-explorations2026-11-06-enemy-attacksmd) · [Attack warnings trimmed; the brute's shockwave](#2026-11-06-attack-warnings-trimmed-the-brutes-shockwave)
- **Weapons and guards:** [Weapons review, round 1](#2026-11-05-weapons-review-round-1-explorations2026-11-05-weapons-review-1md) · [Grammar v2 in the game](#2026-11-05-grammar-v2-in-the-game-wards-for-support) · [Round-2 weapons and guards built](#2026-11-05-round-2-weapons-and-guards-built-into-the-game-on-the-recommendations-pending-the-users-round-2-ratings) · [Round-2 ratings built](#2026-11-05-round-2-ratings-built-new-retreats-and-passives-the-arcane-wand-mend-carrying-slows-you) · [How elements mix in guards](#2026-11-05-how-elements-mix-in-guards-merged-with-the-users-identities) · [Mixing ratings](#2026-11-05-mixing-ratings-every-rune-scales-the-prism-mixes-its-return) · [Hyperbolic resistance](#2026-11-05-guard-resistance-is-hyperbolic) · [The Prism stores and Lances](#2026-11-05-the-prism-stores-and-lances-mend-and-siphon-take-their-extras) · [Round 4 ratings](#2026-11-05-round-4-ratings-the-lance-prism-is-adopted) · [Guard ties settled](#2026-11-05-every-element-in-a-heal-lends-its-resistance-guard-ties-settled) · [Weapon blows fixed; the imbued burst](#2026-11-05-weapon-blows-fixed-the-imbued-swing-becomes-a-burst) · [Weapons are the cheap option; extras you can see](#2026-11-05-weapons-are-the-cheap-option-a-strike-rhythm-per-weapon-and-extras-you-can-see)
- **Engine and stack:** [Prototype stack](#2026-11-03-prototype-stack-provisional-the-user-can-veto) · [Engine phase starts](#2026-11-04-engine-phase-starts) · [Engine stack](#2026-11-04-engine-stack-the-users-answers-on-the-engine-choice-page) · [Performance pass](#2026-11-06-performance-pass-explorations2026-11-06-performancemd)
- **Online and netcode:** [Online co-op, first route](#2026-11-04-online-co-op-first-route) · [Network test, drop-out and rejoin](#2026-11-04-network-test-drop-out-and-rejoin) · [The host tunes online matches](#2026-11-05-the-host-tunes-online-matches) · [Smoother remote players online](#2026-11-05-smoother-remote-players-online-the-two-fixes-approved-on-2026-11-04) · [Survive grows to 48 x 34 …; a stalled page](#2026-11-05-survive-grows-to-48-x-34-guards-read-from-behind-a-stalled-page-no-longer-drops-the-others) · [Netcode is rollback](#2026-11-05-netcode-is-rollback-recorded-after-the-fact) · [The host moves the match](#2026-11-06-the-esc-menu-and-the-scenario-registry)
- **Rooms, Survive, death:** [Preparation pillar; death is harsher](#2026-11-03-preparation-pillar-death-is-harsher) · [Survive mode in the game](#2026-11-05-survive-mode-in-the-game-explorations2026-11-05-survive-modemd) · [Survive's arena is big](#2026-11-05-survives-arena-is-big-and-the-camera-follows) · [Survive grows to 48 x 34](#2026-11-05-survive-grows-to-48-x-34-guards-read-from-behind-a-stalled-page-no-longer-drops-the-others) · [Survive gets Rally and Echo](#2026-11-05-survive-gets-rally-and-echo) · [Survive Review answers, round 1](#2026-11-05-survive-review-answers-round-1) · [Survive power-ups, pass 2](#2026-11-06-survive-power-ups-pass-2-the-maybes-explorations2026-11-06-survive-powerups-2md)
- **Maps and content:** [Outdoor art, Tier 1 and painted ground](#2026-11-07-outdoor-art-tier-1-and-painted-ground-explorations2026-11-07-outdoor-art-kit-resultsmd) · [The mock academy room](#2026-11-06-the-mock-academy-room-explorations2026-11-06-art-trial-round-2md) · [Content direction: LDtk as the user's editor](#2026-11-06-content-direction-our-pipeline-with-ldtk-as-the-users-editor) · [Art direction: true isometric, PixelLab props, the detailed wizard](#2026-11-06-art-direction-true-isometric-pixellab-props-the-detailed-wizard) · [Map pipeline, stage 1: the rooms are LDtk maps](#2026-11-06-map-pipeline-stage-1-the-rooms-are-ldtk-maps-explorations2026-11-06-map-pipeline-stage-1md)
- **Sound:** [Sound, stage 1](#2026-11-06-sound-stage-1-explorations2026-11-06-soundmd)
- **Balance and tuning:** [Balance tooling and the first measurements](#2026-11-04-balance-tooling-and-the-first-measurements) · [The host tunes online matches](#2026-11-05-the-host-tunes-online-matches) · [Weapons are the cheap option; extras you can see](#2026-11-05-weapons-are-the-cheap-option-a-strike-rhythm-per-weapon-and-extras-you-can-see) · [Rune scaling audit](#2026-11-07-rune-scaling-audit-four-fixes-and-a-1-rune-line-in-f2-explorations2026-11-07-rune-scalingmd)
- **Menus and navigation:** [The Esc menu and the scenario registry](#2026-11-06-the-esc-menu-and-the-scenario-registry) · [The tutorial prototype](#2026-11-06-the-tutorial-prototype-explorations2026-11-06-tutorialmd) · [The tutorial, pass 2](#2026-11-06-the-tutorial-pass-2-explorations2026-11-06-tutorial-pass-2md) · [Final-pass review](#2026-11-06-final-pass-review-rules-text-room-switches-and-shared-keys) · [Final-pass loose ends and code quality](#2026-11-06-final-pass-loose-ends-and-code-quality)
- **UI and onboarding:** [The help panel (F2)](#2026-11-06-the-help-panel-f2-explorations2026-11-06-help-panelmd) · [The tutorial, pass 2](#2026-11-06-the-tutorial-pass-2-explorations2026-11-06-tutorial-pass-2md) · [Final-pass review: rules text, room switches and shared keys](#2026-11-06-final-pass-review-rules-text-room-switches-and-shared-keys)

## 2026-11-02: Repo is design-first
The repo holds docs and throwaway prototypes, and there's no production codebase. The pillars in `vision.md` guide every proposal.
*(Superseded: the engine phase started 2026-11-04 and the game lives in `game/`, public since then. See "Engine phase starts" and "Going public as Wizard Sim".)*

## 2026-11-02: Feedback round 1 (see `explorations/2026-11-02-feedback-round-1.md`)
- **Rejected: priming elements into a teammate's queue.** Communicating it costs far more than the teammate typing the element themselves, so it reads as sabotage.
- **Rejected: accidental ally empowerment.** Friendly fire empowers a friend only if someone deliberately set it up.
- **Not a pillar: world simulation as the source of spell variety.** Elemental battlefield interactions are a baseline, but variety must come from the spells, so players can build a reproducible style. No per-level gimmick dependence.
- **Deprioritized: spatial / mouse-drawn casting.** Mouse is for movement and aim. More *aiming variations* are welcome.
- **Pillar 1 softened:** unlocks may add real power, as long as most skill stays with the player.
- **Platform:** top-down, mouse and keyboard first, gamepad not ruled out.
- **Process:** design spells from cool "leaf" examples upward into a structure, before prototyping anything.

## 2026-11-03: Preparation pillar; death is harsher
- **Pillar 7 added:** downtime is for preparing, and preparing well pays off, together with the rule that every shape needs a situation where it's the best answer.
- **Death direction:** avoid spamming resurrections. Death should sting more than in Magicka co-op: e.g. out until the end of combat or until a timer runs out. A hardcore variant is possible, depending on how chaotic play ends up. Details in `ideas/death-and-revival.md`.
- **Clone trade-off:** the clone is weaker, but its death has smaller consequences. A vulnerable real body isn't the point.

## 2026-11-03: Prototype stack (provisional; the user can veto)
- **Decision:** prototypes use TypeScript + Vite + plain Canvas2D, with no game engine library.
- **Why:**
  - It runs in any browser, so it can be published as a private artifact link.
  - Claude can check it with headless Chrome screenshots.
  - Starting it is instant.
  - A hand-rolled loop keeps the spell system free of engine conventions.
- **Alternatives:**
  - Godot: a real editor and better tooling for a larger game, but harder for Claude to drive and check.
  - Phaser / PixiJS: more rendering power than needed so far.
- **Revisit** if the prototype grows past "test one question", or if performance becomes the bottleneck.
- Made by Claude while the user was away (they asked for a game skeleton to be built).
*(Superseded for the game by "Engine stack" (2026-11-04): PixiJS v8 for drawing over our own TypeScript sim. Prototypes may still use Canvas2D.)*

## 2026-11-03: Round 3 (see `explorations/2026-11-03-feedback-round-3.md`)
- **Rejected: Loaded Blow** (one spell loaded onto your weapon). The user prefers reusable conjured weapons.
- **Rejected: Comet Call** (too specific) and **Ward Bridge**.
- **Problem accepted:** spells must be designed as parts of the full input space, not as one-offs. In A and A.1, one in three added elements did nothing.
- **Problem accepted:** spells whose meaning depends on exactly what the cursor is on (ground / ally / enemy) are too fragile to misclicks.
- **Retired:** "Life makes a spell ally-safe" (it clashes with Life meaning heal).
- **Preference:** tap vs hold on the same key doing different things is welcome. Seal should be a modifier plus a click.
- **Proposed (not decided): proposal C** (`explorations/2026-11-03-full-tree.md`), with the Spell Atlas page for ratings.

## 2026-11-03: Resources and battlefield (see `explorations/2026-11-03-resources-and-battlefield.md`)
- **Direction: element runes.** Per-element charges with max charges, regenerating mostly passively. Their main job is slowing the pace (free elements reward spam). Cost = the elements queued; sustaining past a form's natural duration is paid as regen debt.
- **Accepted trade-off:** deeper pools may unlock magic that a shallow pool can't reach. Power moves partly out of the hands, in exchange for a friendlier, gradual frontier.
- **Rejected: "your own spells create sources" as a core loop.** Not interesting enough.
- **Pillar 6 clarified:** per-level twists that boost or suppress your existing magic are fine. What's unwanted is novel level-specific mechanics.
- **Rule:** external drains (structures) can't empty you completely. You keep a reserve.
- **UI:** a full display of your own runes only. Allies' runes are shown subtly or not at all.
- **Separate idea:** battlefield building stays its own idea, compatible with runes but not the same thing.
- **Naming:** a *rune* is one unit of an element. Placed seal traps are renamed **glyphs** (Trap Glyph, Puddle Glyph, Line glyph). The Atlas is republished with the new names.
- **Deferred: depth-gated progression.** Pools stay unlocked for now. Revisit if a system suggests itself, or confirm later that none is needed. (Under C, depth 1 already reaches all 52 cells.)
  *(Superseded counts: since Atlas v4 the grid has 39 cells and 678 distinct spells; depth 1 reaches all 39 cells and 670 spells, depth 2 all 678 (`tools/spell-atlas/depth-c.js`).)*
- **Upkeep rule: stuff costs once, energy costs upkeep.**
  - Stuff (Earth or Ice walls and the like) is paid from the queue and exists until it breaks.
    *(Later: Ice stopped being an element the same day ("Seal becomes an element; Steam and Ice dropped"), and rock walls time out after 25 s ("Rings, wall lifetime, Self on allies").)*
  - Energy (shields, turrets, fields, sustained beams) is paid as regen debt that scales with the work it does.
  - "Stuff" needs some cap on how much you can prepare; the exact cap is left for balancing later.

## 2026-11-03: Structures in proposal C; Weapon column merged
- **Proposed and in the Atlas for review:**
  - Shield + Place is a drawn wall (drag; no drag gives a dome).
  - Shield + Force is a quick tangent wall.
  - Shield + Area is a continuous ring.
  - Seal + Force is a turret (a sealed wall is a sentinel).
  - A dragged Seal + Place is a line glyph.
  - Cost kinds: stuff, energy, sustain, one-off.
- **Decided (the user's call): the tap-Weapon "ground line" column is removed.**
  - Conjure becomes the only Weapon cast (Shift+LMB).
  - Lines should come from the elements, the way Arcane or Life makes a beam.
  - Where they go is open (Atlas question `c-lines`).
  - Tidal Wave and Fault Line are waiting for that home.

## 2026-11-03: Seal becomes an element; Steam and Ice dropped (see `explorations/2026-11-03-structures-review-and-elements.md`)
- **Decided: Seal is no longer a modifier key.** It becomes an element, working name **Sigil**, the offensive opposite of Shield. Shield makes barriers and Sigil makes devices (turrets, orbitals, glyphs, buffs, offensive weapons). Place goes back to meaning only *where*. Reason: two modifiers at once is a bad chord, and Seal's Shield combinations were awkward.
- **Decided: Steam and Ice are no longer combined elements.** Water + fire and water + cold neither collapse nor cancel. Both stay in the queue, and the mix naturally gives steam-like or ice-like effects, just as rock + fire isn't lava.
  - Lost: long collapsed stacks. Also lost is the old trick of hiding water inside steam or ice so it could coexist with lightning (wet + lightning). The user accepts both: the combo narrowed the meta, and it made element order matter.
- **Decided: Place with no drag draws an arc around the caster at a default length (the quick wall).** It replaces the dome. Curving the drag bends a drawn wall.
- **Deferred: Air** (as Earth's opposite, for symmetry). It may get its own pass later.
- **Open:** Sigil's final name; preparing a spell becomes its own mechanism, deferred.
- **Atlas v4 published** with these rules: 39 cells, 678 distinct spells, 0 inert additions. Claude's calls are up for review in the Atlas (`d-*` questions):
  - Self and Weapon without Shield or Sigil work as in Magicka: the elements hit you, or you get one imbued swing.
  - Per-element conjured weapons moved to Sigil + Weapon.
  - Sigil + Self buffs are all offensive.
  - Pure Sigil makes a spark turret (later replaced by the Lens). Sigil's colour was lime at first and is now violet `#d400ff`, because lime was too close to Life.
  - Release still sets off devices and shatters rock walls.
- **Keys (the user's call):** Sigil moves to D, under Shield (E), matching how opposites stack on the keys: Q/A, W/S, E/D, R/F. Earth moves to G. If Air comes, it would go on T, above Earth.
- **Shield + Force becomes a forward wave (the user's lean), replacing the shoving wall.** The wave sweeps forward, hits everyone it passes, and breaks; it's a one-off and doesn't stay. Water makes a Tidal wave that soaks a crowd. Earth makes a Fault line that knocks everyone down. If Air arrives, it would be the shove. This gives Tidal Wave and Fault Line a home, which partly answers `c-lines`.

## 2026-11-04: Sigil's identity (see `explorations/2026-11-04-sigil-identity-and-buffs.md`)
- **Decided: Bind.** Every Sigil device binds one Sigil rune until it goes off, breaks or expires. Your Sigil pool depth is how many devices you can keep. The elements are paid once at cast and are the device's ammo. This is also the cap on "stuff" that the upkeep rule left open. Shield keeps its upkeep over time.
- **Decided: Sigil doesn't stack.** Sigil + Sigil cancel, as Shield + Shield do.
- **Decided: Sigil + Self is an aura** that affects those around you; it doesn't boost your spells:
  - Fire aura, Frost aura and Mist aura
  - Regeneration and Bulldoze
  - Haste
  - Glass cannon, which now makes you easier to knock down instead of making you take more damage.
- **Decided (pure Sigil, Claude's proposals the user agreed to):**
  - Force is a **lens** that amplifies whatever is cast through it.
  - Place is a **waypoint glyph** (Release teleports you to it).
  - Weapon is the **sculpting wand** (while held, your spells spare allies, which also answers `c-ally-safe`).
- **Pure Sigil Area: regenerating orbitals.** The user pushed back on Claude's "chore" argument: every orbital is a chore in the same way. Each orb refunds part of one rune on your next spells (at most one per spell).
- **Open: pure Sigil Self.** Echo is dropped. It should be as cool and strong as the Shield self-cast; Claude's candidate is a Double.
- **Stacking for wards and auras (proposed):** Earth is the material and the other elements coat it (stone armour coated in fire burns melee attackers). Without Earth, each element adds its own resistance or aura.
- **Decided: pure Sigil Self is a Double.** It is a copy of you that enemies target, and it repeats your spells at half power from its own spot. Each repeat costs half the spell's runes from your pool; if you can't pay, it doesn't repeat. It binds one Sigil rune while it exists.
- **Open (the user's note): rework Shield for the rune economy.** Shield was designed for free elements; it needs a pass now that runes, upkeep and Bind exist.

## 2026-11-04: Overnight proposals (nothing decided)
- **Proposed, waiting on the user:** the per-element trait table, Shield Model A (barriers and wards drain your Shield pool while they stand), and Life direction L3 (a spell with Life in it is always support). See `explorations/2026-11-04-overnight-drafts.md` and the Atlas `f-*` questions.
- **Proposed, waiting on the user: Air as a full element** on T, opposite Earth. It would drop the Earth/Lightning cancel, take Water's shove, and add a Gale wave (Shield + Air). See `explorations/2026-11-04-air-pass.md` and its `air-*` questions. Claude recommends deciding the drafts above first.

## 2026-11-04: The look rule, ice shards, turret draw (the user's feedback on the VFX gallery and Pixel Battlefield pass 3)
- **Decided: the form picks the shape, the carried element picks the look, the Magicka way.** Arcane + Fire is a Fire beam, Earth + Fire a Fireball, Lightning + Fire a Flame arc, Earth + Water + Cold an Ice boulder. Applies to the Earth, Arcane and Lightning forms; the most numerous carried element sets the look (a water mix counts as its own look: Steam, Ice). Shield and Sigil already name themselves after what they carry. Life keeps its healing look while the Life review is open. Before this, the visuals let the strong element dominate (a rock with flames stuck on), which the user cut.
- **Decided: Water + Cold as Force is Ice shards,** a volley of jagged shards that pierce and chill and freeze only when enough land. A freezing spray was too strong. The other casts keep the freeze (Freezing splash, Ice sheet).
- **Decided (correction): a Sigil turret never runs out on its own.** Each shot draws its elements from the owner's pool, so it stalls only when the owner runs dry. It still binds one Sigil rune. Glyphs and orbitals stay paid once at cast. This replaces "the elements are its ammo" for turrets.
- **Decided (visuals): no status icons above enemies.** Status shows on the body (flames, frost, drips).
- Atlas v9 carries the new names; questions `g-look` and `g-shards`. Audit still 0 inert.

## 2026-11-04: The overnight drafts, reviewed (see `explorations/2026-11-04-overnight-drafts.md`)
The user's rule for this review: unanswered questions mean Claude's recommendation stands. Where the user said otherwise, it says so.
- **Decided: Life leads (L3).** Form priority is now Shield / Sigil > Life > Earth > Arcane > Lightning > sprays, so no damage spell carries Life. In a Life spell the other elements lend their shape, never their harm:
  - Lightning: Chain heal.
  - Cold: Healing shards.
  - Water: Rescue spray (a nudge, and it puts out burning).
  - Earth: Heal-stone.
  - Fire: **Healing spray, a cone** (the user's note). Plain Life Force stays the beam.
  Life devices heal, and the Life glyph is allies only.
- **Decided (the user disagreed with Claude): Shield + Life makes healing zones,** not self-mending structures. A Life curtain, ring or wave heals whoever crosses or stands in it.
  - Shield + Life on yourself is a Mending ward (it heals you slowly).
  - Stone armour coated in Life heals you; the Mending bulldoze heals you per shove.
- **Decided: who Life heals is (c).** It heals everyone it touches, and the sculpting wand makes your heals spare enemies. The user said this helps the Healing ring. Whether the wand covers the Healing spring is open (`h-spring-wand`).
- **Decided (the user's note): Life + Weapon.** Plain is the **Healing palm**, a one-off with a few steps of reach. Sigil + Life + Weapon is **Healing hands**: long-lasting, short reach, no healing swords. This resolves the overlap with the old Mending rod.
- **Decided: Regeneration is a true aura;** self-heal taps (burst) or channels (sustain, moving slowly).
- **Decided: Shield is Model A (endurance), with a low idle drain** (the user's note). Energy barriers and the ward drain the Shield pool, and the elements in them are paid once.
  - All your shields fade together; at the reserve floor the oldest breaks.
  - The ward drains twice a wall's idle rate, one per caster, and now has the Energy cost tag.
  - Earth walls stay stuff. Earth walls reserving Earth is still open (`h-shield-earth`); Claude's lean is not yet.
- **Decided: the element frame.** One status each, plus four shape changes: Water push, Cold **Shatter** (E2 for Cold only), Lightning chain, Arcane burst. Only the leading shape element bends a spell (S2).
  - Statuses: Lightning stuns briefly, Arcane exposes, Fire thaws and dries, Water and Cold put out burning everywhere.
  - Interactions: rock grounds chains, and a wet caster who casts lightning shocks themselves.
  - A mix is an interaction inside one spell.
- **Decided (the user's suggestion, Claude's reading): Sigil alone, Place is the Lens and Force is Blink** (an instant short teleport along your aim, with a brief hold on the Sigil rune). The waypoint glyph is gone. Confirm in `h-blink`.
- **Open idea (the user's): plain elements on yourself could give runes back.** The draft is "Attune": channel to regenerate that element faster (`h-self-attune`). It is not in the rules.
- **UI (the user's request):** answer boxes sit next to the text they ask about. In the Atlas this is the "What your review decided" section.
- Atlas v10. The audit still shows 0 inert additions out of 7110, and 678 spells. The VFX `rules-c.js` was re-copied.
- **Follow-up answers (h-*, 2026-11-04):**
  - The support-spell names are kept.
  - The sculpting wand also covers the Healing spring, for consistency.
  - Earth walls don't reserve Earth runes for now; see first whether they get spammed in a prototype.
  - Blink is confirmed as a plain teleport, as in the original, with no waypoint.
  - **Plain Arcane on yourself becomes Attune** (the user's call): it stings, and your runes regenerate faster for a moment. It replaces Hurt, and Fire on yourself dries you off. Atlas v11.

## 2026-11-04: Engine phase starts
- **The design phase is good enough to start the engine** (the user, after VFX v4: "Looks really great").
- **Decided: co-op is online-ready, local first.** The sim is deterministic and driven by inputs from day one: a fixed step, seeded randomness, and no rendering or wall-clock time inside the sim. That way lockstep or rollback netcode can be added later without a rewrite. Local couch co-op with gamepads comes first.
- **Open: the engine and stack.** The user asked for a real deep dive rather than a quick pick, and wanted to know whether "TS + WebGL" meant a fully custom engine or reusing an existing JS engine. The research is done (`explorations/2026-11-04-engine-options.md`) and published as the Engine Choice page. Claude recommends PixiJS v8 + our own TS sim + Electron later, with Godot 4.7 as the strong second.
- The repo got its baseline commit: the design docs, tools and prototypes as they stand.

## 2026-11-04: Engine stack (the user's answers on the Engine Choice page)
- **Decided: PixiJS v8 for drawing, our own deterministic TypeScript sim.** Electron for Steam later. The user rated the Pixi stack "keep" and picked it, matching Claude's recommendation. Godot 4.7 was the runner-up.
- **Decided: lockstep first, with rollback kept possible.** The sim stays snapshot-able.
  *(Superseded: online play runs rollback with a 2-tick delay. See "Netcode is rollback (recorded after the fact)".)*
- **Decided: arenas are data files now,** with our own editor when we need one. No visual editor is required.
- **Decided: milestone 1 is a deterministic core.** Two wizards on one machine, the Atlas rules driving real casts, the Pixel Battlefield look, and a replay that hashes the same in node and in the browser. Online play waits until that holds.
- **The workspace is `game/`,** an npm workspace with three packages:
  - `rules`: generated from the Atlas's `rules-c.js`, which stays the source of truth for now.
  - `sim`: no DOM, clock or async; exact maths only; state in typed arrays; snapshot, restore and hash; replays.
  - `client`: Vite + PixiJS v8.
  Tests enforce the sim's purity, the rules sync and a golden replay hash. `check:browser` runs the same replay in headless Chrome and compares the hashes; it passes.
- The skeleton prototype (Proposal A) stays as a record. Its input buffer, gamepad mapping, flow fields and wave director are to be ported into `game/` in milestone 1.

## 2026-11-04: Calls Claude made while building milestone 1 (the user can veto any)
- **Runes are reserved when you queue, spent when you cast.** Esc, or one element cancelling another, refunds the reserved runes. The new element in a cancel is never spent, so a misclick costs nothing. You can't queue an element you have less than one rune of: the HUD flashes it as dry.
- **Pools and regen follow the Battlefield mock-up:** about 4 runes per element (Fire 5, Sigil 3) and 0.22 runes per second. Attune (Arcane on yourself) multiplies regen by 2.5 for 6 s.
- **Cast rhythm:**
  - Wind-up is 0.12 s plus 0.04 s per rune, recovery 0.18 s.
  - Holding the Area button past 0.25 s makes it a Place.
  - Channels are free for 5 s, then cost 0.2 runes per second of the form element.
  - A cast pressed during recovery is buffered for 0.3 s, so no press is lost (casting-rhythm: "every key press is registered").
- **Blink has no wind-up at all** (the user's "super snappy" note).
- **Turrets carrying a channelled spell (beam, spray) shoot bolts** that carry its elements. A Lightning turret zaps. A real beam emplacement can come later.
  *(Superseded: turrets cast the real spell. See "Play-test round 2, answers and notes 8–11".)*
- **The sculpting wand stops your spells from harming allies, but not the burning ground they leave.** The floor is the world.
- **Shield alone on yourself is a mirror ward** that turns back the next 3 shots. A barrier of Shield alone turns shots back at whoever cast them.
- **Not in the engine yet:** the Shield conjures (Bulwark, Buckler) and the Double. Both are in the rules; the engine shows a "todo" event when you cast them.
  *(Superseded: the Double is built (it follows you, "Play-test notes, round 1"; Survive's Echo spawns one, "Survive gets Rally and Echo"), and the Shield conjures became the eight guards ("Round-2 weapons and guards built into the game").)*
- **Enemies are the skeleton's six archetypes**, named as the Battlefield draws them (goblin swarmers, archer casters). Waves and portals work as in the skeleton.
- **A new player joins through the input record** (a join button bit), so every peer will spawn them on the same tick.

## 2026-11-04: Balance tooling and the first measurements
- **The tuning panel** (F1 in the game) makes every gameplay number a live slider. A tuning is exported as JSON; `tuningHash()` names it, so replays and future online sessions can check that everyone runs the same numbers.
- **The balance harness** (`npm run balance`) measures every common spell and bot wave runs. The first findings are published on the Balance Notes page:
  - Channels are about 10x more rune-efficient than one-shots.
  - Extra runes of the form element scale unevenly.
  - Sprays hit everyone at full strength.
  - Enemies are soft.
- **Open (on the page):** how channels pay (Claude: a short free window plus upkeep), form scaling (Claude: +70% per extra rune), goblin toughness (Claude: one hit), and whether to apply the proposed first pass before the first play-test (Claude: yes).
- Spray falloff is now a tunable (`combat.sprayFalloff`, off by default). Burn damage is credited to whoever lit it.
- **Magicka baseline** (`reference/magicka-numbers.md`, public sources, partial). Two things are worth comparing:
  - **Health ratios.** In Magicka a grunt has about 0.7× a wizard's HP and a troll about 6×. In ours a goblin has 0.2× and a brute 3.5×. Our enemies are relatively softer.
  - **Stacking differs per form in Magicka:** sprays and novas grow about with the square root of the stack count, rocks by triangular numbers, ice shards by the square. That reading of the wiki's values is the research agent's, not stated by a source. So stacking a spray barely pays, while going all-in on a rock does. Our first pass uses a flat +70% for every form. **Open:** keep it flat, or give each form its own curve as Magicka did.
- **Magicka 1, read from the user's own install** (`reference/magicka-numbers-extracted.md`, kept locally and not in the public repo; decompiled locally at the user's request; only numbers are kept, nothing decompiled is in the repo):
  - Sprays and beams hit 4 times a second.
  - Sprays scale with the square root of the stack count; beams gain time, not damage.
  - Statuses last far longer than ours: burn 5 s per magnitude and growing; chill 10 s; frozen 4 s and ×3; wet until removed.
  - Wards are full immunity.
  - A goblin has 0.7× a wizard's HP (ours 0.2×); brutes are close (3.0× vs 3.45×).
  - Our goblins deal about twice Magicka's damage per second to a wizard.
  - HP doesn't scale with player count.
  - **Open:** which of these to adopt (Claude's leaning: goblins tougher and weaker-hitting, longer statuses, per-form stacking curves; keep our 40% wards, since full immunity flattens the rune choices).
- **Decided (the user: "a helpful baseline", the style stays ours):**
  - Goblins go to 30 hp and 5 damage. They no longer die to one hit; crowd spells take about a second.
  - Statuses last longer: wet 12 s, burn 5 s, chill fades at half the old rate, and freeze lasts 3.5 s.
  - Each form gets its own stacking curve: sprays with the square root, rocks with n^1.5, and beams last n× longer instead of hitting harder. The rest add +70% per extra rune.
  - Wards stay at 40% resistance.
  - Each of these is a tunable.

## 2026-11-04: Online co-op, first route
- **Decided (the user): start with the artifact route, and move to WebRTC soon.** Online play runs over the claude.ai artifact's room: everyone with the page open, relayed by the platform, with no server of ours. Lockstep sends one broadcast packet 20 times a second with an 8-tick (about 130 ms) input delay. The lobby refuses a different build or tuning.
  *(Superseded: matches run rollback with a 2-tick delay, over WebRTC on the hosted page. See "Netcode is rollback (recorded after the fact)" and "Going public as Wizard Sim".)*
- The limits are the room's own: about 40 messages a second per sender, and messages can drop (the session resends). The other player must be invited to the artifact with Contributor access. Latency is untested with two real people.
- Next: a WebRTC bus behind the same interface (with self-hosted builds), local prediction of aim and cast starts, and drop-out and rejoin.

## 2026-11-04: Play-test notes, round 1 (the user's first session with the build)
- **Blink goes to the cursor** (up to 30 units, nerf from there), landing at the nearest free spot.
- **The Double follows you** and echoes channels as well as one-shots, at half power for half the runes.
- **Decided (the user's design): dismissing creations.**
  - Double-tap Sigil while the cursor is on one of your creations: it's dismissed and its rune comes back. On yourself, that removes your wand or weapon, aura, motes and orbitals.
  - Pressing Sigil with no free rune recalls your oldest creation, so a new device simply replaces the oldest (the user: "keep the FIFO thing as well").
  - Cancels no longer need a free rune. Esc doesn't dismiss.
- **Fire stays on the floor for 10 s,** and scorch marks outlast it (the user: "you'd expect the terrain to keep scorched").
- **Many structure visuals were placeholders** (lens, barriers, wards, auras, the Double). A full VFX coverage pass is under way, with a placement preview while you hold Area.
- **Death animations:** start with one enemy (the goblin), trying a base death plus an overlay for the killing element. The user doubts overlays will be enough, so the trial reports where a death needs its own animation. Deaths now carry the killing element, the blow's direction and the body's statuses.

## 2026-11-04: Going public as Wizard Sim
- **Public repo:** https://github.com/magnevan/wizard-sim. **The game is hosted** at https://magnevan.github.io/wizard-sim/, deployed by `.github/workflows/pages.yml` on every push to main (it runs `npm run check` first). Online play there uses WebRTC rooms with four-letter codes.
- **The public history starts fresh.** The 42 earlier commits stay on the local branch `private-history`; never push it. Commits use the GitHub no-reply email.
- **The decompiled Magicka numbers stay local** (`docs/reference/magicka-numbers-extracted.md` is gitignored). The public-source notes in `magicka-numbers.md` are published.
- **Names:** the code is `@wizard-sim/*`, the page title is Wizard Sim and the debug global is `window.wizardSim`. Docs still credit Magicka as the inspiration. The local folder stays `magicka-toy`.
- **Licence: MIT** for the whole repo (the user's choice).
- `npm run check:webrtc` can test the deployed build: `node scripts/net-e2e.mjs --webrtc --url https://magnevan.github.io/wizard-sim/`.

## 2026-11-04: Network test, drop-out and rejoin
- **Network test lives in the tuning panel (F1), not in URL options** (the user's call). It adds lag, jitter and loss to one page's match traffic, both ways, so one window alone makes a match feel far away. Presets: Same city 30 ms, Far 100 ms, Overseas 200 ms, Bad wifi 120 ms ± 120 ms with 5 % loss. It also sets this page's input delay (fewer remote corrections against your own actions starting later) and shows the round trip, rewinds per second and time spent waiting.
- **Drop-out:** a seat silent for 2.5 s (or one that says bye on Leave or closing the tab) is dropped. The coordinator, the lowest seat still playing, takes the highest tick anyone holds from it, so nobody has to forget an input. The match goes on; the wizard stands still. A page that gets dropped goes back to the lobby with Rejoin offered.
- **Rejoin:** anyone can take an empty seat, whether by reloading or re-entering the room code. The coordinator sends a confirmed snapshot (gzipped, a few KB) and the inputs after it; the seat plays again 0.75 s later, and the newcomer runs extra ticks to catch up. A page that falls behind for other reasons (a hidden tab) catches up the same way.
- **Limits:** if the host's page leaves, the match goes on, but its room code stops working, so nobody can join or rejoin by code. Rejoin needs WebRTC or the tab bus: a snapshot doesn't fit the artifact room's 4 KiB messages. The dropped wizard is still in the world: enemies can hit it, and it can be revived.
- **On remote snapping (the user asked why prediction isn't faster):** nothing can guess a key press before its packet arrives. The fixes are better guesses for aim (in world space, carrying on a sweep) and showing a late remote spell from its first frame. Not built yet.
  *(Superseded: built in 3c28950. See "Smoother remote players online".)*

## 2026-11-04: Play-test notes, round 2 (`explorations/2026-11-04-playtest-2.md`)
- **Shield gets the Sigil dismiss:** double-tap Shield over your wall and the whole cast comes down. Over yourself, it drops your ward and guard.
- **Casting while moving is allowed** (the user: "we should probably just allow that too"). It was already in the rules (half speed while channelling or charging); a mouse-chord input bug had blocked it. The slow-down is the tunable `body.castWalk`.
- **Coated rock acts on contact:** its non-Earth elements pulse on whoever touches it, like a curtain on whoever crosses it.
- **The death set for the goblin is complete:** base, cold, lightning, quake, steam v2, fire v2 (no combustion flame) and frozen shatter v2 (body-shaped ice) are keeps. Water uses the base death; wet lightning is not its own death; the boulder death is for boulders, not quakes. Arcane needs a third, calmer version.
- **Open:** inspect mode (hold Alt), Shield ring balance (one budget per cast, recommended), the game-wide "every element changes the spell" audit, and the weapon proposals (`explorations/2026-11-04-weapons-and-movesets.md`).

## 2026-11-05: Play-test round 2, answers and notes 8–11
- **The user's answers:**
  - Inspect mode: yes, start small and grow it.
  - Shield ring: one effect budget per cast.
  - "Adding an element always changes the spell": a sim audit enforces it.
  - Weapons: the high level is approved, and a full review page of weapons and move sets comes first. Block goes on Space ("you can only do these things without runes queued anyway").
- **Turrets cast the real spell** (the user: "turrets should always cast the actual spell you embued them with, not just a projectile"). A spray or beam turret channels it for the natural channel length, following the nearest target; a lightning one keeps zapping. It used to turn channels into bolts. This reverses an earlier call of mine.
- **Turrets fire uncharged**, like your tap cast. A rock + fire turret hit for 25 against your 14, because its shots were 60 % charged.
- **Turrets are paced by your regen:** a shot (or a whole channel) costs half its runes, and all your turrets together spend at most 60 % of your regen of any element (`structures.turretShotCost`, `structures.turretShare`). They used to fire every second at full price, about 4.5× your regen, and emptied your pool.
- **The rune HUD handles bigger pools:** up to 5 runes are pips, 6–10 are two rows, and more is a bar with the count.
- Golden hash re-recorded (`36a48e1b`): turrets carry channel state (`devices.chan`).
- **Inspect mode is built:** hold Alt for a card on what's under the cursor.
- **The game-side audit** (`npm run audit`, `explorations/2026-11-05-inert-audit.md`) finds 210 inert additions in play, grouped into families. Life payloads are the biggest.
- **Walls (notes 12–13):**
  - A long drawn wall no longer eats its own segments; that's where the gap came from.
  - Walled-off enemies head straight for you and break the rock.
  - Each player can keep 30 segments (was 12; the user: "way too low").
- **Sprays leave the floor alone** (note 14: walking forward into your own puddle or fire was awkward). Floors come from Place patches and novas.
- **Open:** a length budget per wall cast. Today a drawn wall's length is free up to the cap.

## 2026-11-05: Rings, wall lifetime, Self on allies
- **Rings are small and full strength** (the user: "I'd never want to use the version with lower heal per second"). Radius 1.5, 8 segments, so it fits you and a partner pressed close. A body touching several segments of one wall is still pulsed once. This replaces the one-budget-per-cast halving.
- **Rock walls time out instead of a tight cap** (the user's suggestion; my recommendation too). A count cap fails both ways: 30 segments plug a corridor but not a wide gap. Rock stands 25 s, plus 5 s per extra Earth, and crumbles over its last 3 s. Energy walls are already limited by the Shield pool. The per-player cap (40) and pool (160) stay only as a technical ceiling. *Trade-off:* less long-range preparation, since a wall raised in the lull lasts into the first rush, not the whole wave.
- **Self on an ally only for Shield (a ward) and Sigil + elements (an aura)** (the user: other elements don't need it). Plain elements on Self always hit you. With a ward or aura queued, the ally under the cursor shows a ring at their feet and a chevron overhead. The pick is as generous as the inspect card.

## 2026-11-05: Weapons review, round 1 (`explorations/2026-11-05-weapons-review-1.md`)
- **Weapon grammar v2:** with an empty queue, RMB tap is Strike (the default swing), RMB hold is Heavy, and Shift+RMB is the weapon's one Special (a Sweep for most, the spear's javelin). The guard defines Space (Defend) and Shift+LMB (Retreat, a quick move backwards). Thrust, Send and weapon Defend are cut.
- **No two-handed weapons** (the user's call): every weapon pairs with every guard.
- **Weapons run on uses** (about 30).
- **Guards are eight, one per lead element.** Each defines its Defend, its Retreat, a passive effect and its resistances (the user's direction; the set is designed next).
- **Redesigns:** water becomes a trident. New Heavies: a much longer spear dash, a directed earthquake wave for earth, a fire wave for fire, and a continuous healing link for life. Arcane is reworked toward enhancing your spellcasting.

## 2026-11-05: Grammar v2 in the game; wards for support
- **Your hands are in the game.** With nothing queued:
  - RMB tap strikes with your conjured weapon (1 use); held, it charges a Heavy (2 uses, harder, longer reach).
  - Shift+RMB is the Special (2 uses): a full-circle Sweep, or the spear's javelin.
  - Shift+LMB hops you backwards.
  - Space blocks with your guard.
  - Without a weapon, the staff does weak shoves.
  - Weapon and guard are held together. The HUD shows the weapon's element and uses left under your badge, plus a bar while you hold a guard.
  - The weapon-specific Heavies and the guards' own Retreats wait for the guards round.
- **A caster may keep up any number of wards** (the user: one-per-caster "feels like it'll hurt a support playstyle"). Each wizard still wears only one ward. Every ward drains its caster's Shield pool, which is the real limit.
- Golden re-recorded (`485c0373`): seats carry `handT`, the held-RMB counter for a Heavy.

## 2026-11-05: The host tunes online matches
- **The host can tune during an online match without a desync** (the user's ask).
  - **How it works:** the host's panel edits go out as "the whole tuning becomes this map at tick T", about half a second ahead. Every peer applies the change at T; the match keeps the schedule, so every tick, replays included, runs with the tuning it had. A change that arrives late rewinds to its tick.
  - **Joining:** the host's tuning travels in the start message (and in a rejoin's welcome), so a different local tuning no longer refuses the join.
  - **Leaving:** the match's tuning isn't saved as your own; your saved tuning comes back when you leave.
- **Online, only the host tunes.** Other players' panels refuse with a note. Cheats (spawn, heal, refill, god mode, infinite runes, the wave tools) are off online, because they change the world on one page only. NET_VERSION 3.

## 2026-11-05: Life spells, the size rule (the inert audit's Life group)
- **Decided (the user):** in a Life spell, the element lending the shape sets its size, and Life sets the healing. "Fire could cause life to be a spray... more life is stronger healing, more fire is bigger cone." This is built for sprays (Fire or Water lending): each extra lending rune widens and lengthens the cone, and the Life count sets the strength. It used to be the Life count that sized the cone.
- **Proposed for the others, by the same rule (the user: "I don't know exactly what could be the equivalent for earth and ice yet"):**
  - Earth lends the lobbed heal-stone: more Earth, a bigger splash.
  - Cold lends healing shards: more Cold, more shards.
  - Lightning lends the chain heal: more Lightning, more jumps.
  Built 2026-11-05 (the user: "Your heal plus element suggestion sounds fine"). Chain heals already added a jump per extra Lightning.
- **Still open:** a second, non-lending element in a heal (Life + Lightning + Cold) still does nothing.

## 2026-11-05: Survive mode in the game (`explorations/2026-11-05-survive-mode.md`)
- **The user asked for an arena and a survive mode with power-ups between waves.** Claude built it as the room `survive` (`#survive`): a walled arena with gate chokepoints, endless waves, and an altar pick between waves. The proposals below are Claude's; the user hasn't reviewed them yet.
- **The pick is in the world:** three altars rise in the breather. Each player stands on one (0.75 s) and gets its power-up, and two players may take the same one. The next wave's portals open during the pick, so you can pick for what's coming. No new keys.
- **Power-ups are per-seat and per-run.** Rune max and regen became per-seat (`runeMax`, `regenOf`), equal to the config outside Survive. Ten are built: the easy ones (Deep pools, Deep element, Wellspring, Spare sigil) and six that bend spell rules (Bedrock, Pyre, Slipstream, Mirror charm, Bloom, Clockwork). Five more are designed only.
- **Pillar notes, open for the user:** Wellspring and Glass heart are flat numbers (pillar 1), and Bloom helps allies you didn't aim at (pillar 3).
- The golden hash is unchanged (`485c0373`): the survive state exists only in a survive world.

## 2026-11-05: Smoother remote players online (the two fixes approved on 2026-11-04)
- **Remote aim is guessed in world space** (`packages/net/src/rollback.ts`, `predictAim`). A mouse player walking with the cursor still keeps aiming at the same spot on the floor, so the guess re-aims from where their wizard is predicted to stand. The spot comes from intersecting the last real inputs' half-unit rounding intervals, and the peer's own input delay is inferred from them. Aim held relative to the wizard (a gamepad stick) is still repeated, and a steady sweep carries on for up to 10 ticks (capped at 0.12 rad a tick). Guesses never reach confirmed ticks, so peers may guess differently.
  - Measured: a bot walking with a still cursor, 100 ms: 7374 → 748 rewound ticks (wrong guesses 93 % → 5 %). Headless Chrome at 150 ms + jitter + loss: 166 → 11 rewound ticks/s (86 % → 4 % wrong). A steady sweep's aim error halves (0.35 → 0.14 world units).
- **A late remote spell is shown from its first frame** (`packages/client/src/art/vfx.ts`). When rollback inserts a remote cast in the past, its missile is drawn from where it left the staff and catches up with its true spot over 0.15 s. A channel plays its opening at speed, and the cast flash plays. Before this, the missile popped in mid-flight. The change is cosmetic only.
- The Network test (F1) can switch both back to compare (Remote aim: World point / Repeat last; Late spells: Catch up / Pop in). It now also shows the share of wrong guesses and how many late spells were caught up. `check:net` prints rewinds per second for both aim guesses over the slow link.
- Fixed on the way: `quantize()` can return -0 (`Math.round(-0.3)`), which the wire turns into 0 for the other peers while the sender's own world keeps a -0 in a Float64Array. That was a latent desync. `LockstepSession.pushLocal` now normalises it. The sim is untouched, and the golden hash is unchanged.

## 2026-11-05: Deaths for every enemy
- **Bespoke deaths for the other five enemies**, in the game and in the gallery (group `deaths2`, waiting for ratings). They cover the brute's felled-tree fall, the archer's bow and arrows, the imp guttering out or cooling to stone under cold or water, the grabber's claws, and the shieldbearer's dropped or splintered shield. Anything not bespoke plays the goblin death, scaled.

## 2026-11-05: Build optimistically
- **The user's process change:** "Can you build optimistically and we can go back and change if I have feedback?" Review pages no longer gate building. The recommended options go into the game straight away, and later ratings revise them.
- **Survive's six questions** are built on their recommendations (altars per player, portals open during the pick, flat power-ups allowed in run modes, Bloom as a deliberate pick).
- **In progress:** the round-2 weapons and guards in the game, and a much bigger Survive arena with a camera that follows the players (the user: "Arena looks tiny btw, I expected it to not even fit everything in the screen at once").

## 2026-11-05: Survive's arena is big, and the camera follows
- **Why:** the user: "Arena looks tiny btw, I expected it to not even fit everything in the screen at once."
- **The play area is per world** (`w.dims`, fixed by the room when the world is made; not state). The surface and nav grids are sized from it. The Sanctum and the Arena keep 24 x 16, so their layout and **the golden hash are unchanged** (`485c0373`). Survive is 44 x 30, about 3.4x the floor.
  - Rejected: one fixed maximum grid for every room. It would have grown every room's snapshot and changed the golden hash for nothing.
- **Survive's layout** (`SURVIVE_ROCK`, 40 terrain segments) has four zones: a keep round the altar plaza with four doors; walled causeways west and east; six V-shaped gate funnels at the far edges, each with its portal; and a field of cover between them. Waves are 1.3x bigger, and portals open on gates far from the wizards and from each other, a second apart. Details: `explorations/2026-11-05-survive-mode.md` (addendum).
- **The camera follows** an arena that doesn't fit. It frames the living wizards and keeps the local player in view. It steps out one integer scale (never below 2x) when the team spreads, and it clamps a couple of units past the arena's edge. Panning stays pixel-crisp. Off-screen enemies and portals get edge marks. Rooms that fit are framed as before.
- Proposed defaults, open for the user: the size (44 x 30), zooming out when the team splits, and the online camera framing the whole team rather than only you.
*(Superseded: no zoom; each screen follows its own wizard in every room, with ally edge arrows. See "Survive Review answers, round 1".)*

## 2026-11-05: Round-2 weapons and guards built into the game (on the recommendations, pending the user's round-2 ratings)
The user said "build optimistically", so the game now has what `explorations/2026-11-05-guards.md` proposes, with Claude's recommended answer to each of its four open questions. All of it is open to change once the round-2 ratings come in.
- **Weapon Heavies** (`packages/sim/src/hands.ts`):
  - Tide trident: a wave slash that shoves and soaks.
  - Flame sword: a rolling fire wave that ignites what it passes and leaves no lingering fire.
  - Stone maul: a narrow fissure that knocks down everything in its lane.
  - Frost spear: an impaling dash at 2.5x its reach. Frozen bodies on the way shatter, and the dash ends on the first body that isn't frozen.
  - Lightning whip: a chain lash to up to 3 more targets.
  - Healing hands: the Healing link. Hold RMB on an ally. It holds up to 8 u or until a wall comes between you, heals 12 hp/s, costs 1 use a second, and does nothing on release.
  - Staff: the big shove.
  - The three waves reuse the Shield wave pool, which now stores its own power and range.
- **Specials:** Sweep for most weapons. The spear's **javelin** (3 uses) pins its target (a new body state, `root`: it can't walk but can act), frosts the ground, and the spear stays in your hand.
- **The arcane weapon is now the Echo focus.** It remembers your last spell (seat state: counts and cast; structures, Blink and Self casts aren't remembered). Its Heavy re-casts that spell from you at half power for 5 uses and no runes. An echoed channel runs on its own for 1 s. Its Strike is a weak bolt. Its Special, **Copy**, takes the last spell an ally cast within 6 u in the last 2 s. The hook and its yank are gone.
  *(Superseded: the Echo focus was replaced by the Arcane wand (bolt, charged bolt, Siphon). See "Round-2 ratings built".)*
- **Eight guards** (`packages/sim/src/guards.ts`): one per lead element, and Shield alone is the Mirror buckler. Each has its own Defend, Retreat, passive and resistances, as in the doc's tables. Every guard blocks shots. Only the Bulwark's block stops melee. The other guards' block effects still answer a melee hit (Ember thorns, the Tide shove). Only the Prism stops beams (sprays count as beams here). A timed parry stops any frontal hit and fires the guard's parry effect.
- **Open questions, as recommended:** (1) resistances apply while the guard is carried; (2) Retreat is free, with a fixed 0.5 s recovery in which you can't Retreat or Defend; (3) a second element adds only its own resistance at half strength; (4) the Bulwark keeps Brace, which doesn't move you. Without a guard, Shift+LMB is still the generic hop.
- **Claude's calls:**
  - Enemy blows and arrows count as physical damage.
  - Ember and Rime immunity also stops the matching status (no burn; no chill or freeze).
  - Any weapon move or spell drops the block.
  - The Mirror's parry window is 0.2 s, and the other guards' is 0.12 s.
  - Blocking slows you to 0.7 (the Bulwark to 0.4 on top of its always-on 0.85; the Mirror isn't slowed).
  - Every new number is a tunable (the F1 group "Weapons & guards", `ARMS` in `config.ts`).
- **Client:** each guard has its own look, ported from the review page's drawings. The trident replaces the glaive. The Echo orb shows the remembered runes circling it. Also new: the healing-link beam, the Blink spark, a short effect for each Heavy and Retreat, parry and block flashes, the guard's HP bar in its colour on the HUD, the inspect card text and the controls hint.
- **Golden hash re-recorded** (`485c0373` → `14440468`): new seat, body and wave state (guard elements, Retreat timers, the link, the echo memory, the last spell cast, `root`, wave power and range). The scripted run doesn't use weapons or guards.

## 2026-11-05: Survive grows to 48 x 34; guards read from behind; a stalled page no longer drops the others
- **Survive is 48 x 34** (was 44 x 30). The user expected it not to fit on screen at once. At 2x, a 1280 x 800 window shows about 40 x 31 u of play area (the strip between the wave banner and the rune HUD), so the arena now overflows it both ways. It also overflows at the scale the camera picks for 1280 x 720, 1366 x 768, 1440 x 900, 1920 x 1080 and 2560 x 1440 (a camera test checks these). The keep, its pillars and the altars stay where they were. Everything outside them moved out: the causeways are 7 u long (they were 5 u), the west and east gates sit at x = +-23, and the four north and south gates at (+-12, +-15.8). The screens and the corner Ls also moved out, and the floor's ruin map follows. Still 40 segments. The golden hash is unchanged (`14440468`).
  - Weak spot: when the camera steps out one scale (a 3x window whose team has spread), the view is about 60 x 42 u, and the whole arena fits. Making it overflow even then would need roughly 64 x 46.
- **Guards read in every facing.** When the guard is on the far side of the body, it is still drawn under the wizard, and its rim shows through on top, dithered, in the guard's colour (the Bulwark's rim is square). This happens when you face away, or face east while it is slung on your left. A raised block facing away draws its energy face on top, wider than the body, with a bright tick at each end. From behind, a block reads as a glow wrapping round you.
- **Net flake (`check:net`: "pages drifted apart over the slow link (-1 vs 851)").** Page A (the host) had been dropped: its session was null. The TypeError after it came from the test, which set `session.aimPrediction` without checking for null. A drop needs one page to hear nothing from the other for 2.5 s. A's link was only lagged (150 ms, 3% loss), so A's own page most likely stalled for over 2.5 s. Two software-rendered pages share one CPU, and memory was short. B then dropped it, as designed.
  - Game fix: if a page's own loop stalls (over 0.5 s between two pumps), it gives every seat a fresh 2.5 s before calling anyone silent. Without this, a page that froze could, on waking, take the others' silence for theirs and drop the healthy players. It would be its own coordinator by then, so its "drop" would kick the host out.
  - Test fixes: the aim switch is null-safe. The test now fails with each page's message and its longest event-loop stall. It also has a new phase: B freezes for 3.5 s, A must keep playing, and only B is dropped.

## 2026-11-05: Round-2 ratings built: new Retreats and passives, the Arcane wand, Mend, carrying slows you

From the user's round-2 ratings on the Weapon Moveset Review (`explorations/2026-11-05-guards-round-2.md`). Built optimistically and shown as round 3 on the same page.
- **Guards:**
  - Bulwark's Retreat is the **Shove step** (a step back plus a knockback and stun in front), replacing Brace.
  - The Mirror's Backstep goes 3 u, and its block glances shots off without wear.
  - The Rime block chills biters and no longer frosts the floor.
  - Tide is **Quenched** (can't burn), no longer always wet.
  - The Prism's passive is **Clear** (allies' beams and sprays don't hurt you).
  - The Leaf block heals allies on any side, and its Retreat is the **Seed step** (a healing bloom left behind).
- **Weapons:**
  - The Echo focus is replaced by the **Arcane wand**: light bolt, charged piercing bolt, and **Siphon** (held, rooted, rune regen ×4).
  - Healing hands' Special is **Mend** (held, heals allies around you).
  - The javelin costs 2 uses, and is drawn peeling off the spearhead.
- **Carrying a guard or a weapon costs 5 % walking speed each** (q-res-when note).
- **Mixing, first cut:** the lead sets the moves; the second element mixes in its passive and its whole resistance row at half. A fuller rule (every element mixes, coats, rune counts scale) is proposed in the exploration and asked on the page; it is not built.
  *(Superseded: the fuller rule is built. See "How elements mix in guards" and "Mixing ratings: every rune scales".)*
- Golden hash `14440468` → `e055dcdb` (the Echo state is removed; the Special channel state is new).

## 2026-11-05: How elements mix in guards (merged with the user's identities)

The user: the strong elements are Life, Earth and Arcane. Shield + Life is preservation, so extras mostly grant resistance. Shield + Earth is a sturdy barrier whose extras burn or chill attackers. Sigil + Arcane is the ranged option that imbues its attacks. Built (`explorations/2026-11-05-guards-round-2.md`, "Merged"):
- **Lead:** the strongest element present leads (Life > Earth > Arcane > Lightning, as in spells), else the most runes of Water, Fire or Cold.
- **Extras:** every other element mixes in its passive and its resistance row (half per rune, all at 2).
- **Leaf:** takes only the extras' strengths.
- **Other guards:** the extras are a coat that bites whoever hits the block (and the Shove step's shoved, and the Prism's returned beam) at half power.
- **Open:** Lightning's place among the strong elements, and how the remaining guards and weapons should use their extras.

## 2026-11-05: Mixing ratings: every rune scales, the Prism mixes its return

The user kept the strength lead, Lightning as strong, and the Leaf, Bulwark, weak-guard and wand rows. The Prism is a maybe ("not totally sold"), built as is for now. Built (`explorations/2026-11-05-guards-round-2.md`, "The user's ratings on the merge"):
- **Every rune scales** (q-mix-scale: "all runes cause some form of scaling, like in spells"): each guard rune past the first adds 15 % guard HP and Retreat distance. Weapons already scale through payload damage.
- **A Prism parry returns the beam mixed with its coat; opposites cancel rune for rune**, as in the queue, so a Cold Prism can swallow a Fire beam.
- Golden hash unchanged (`e055dcdb`).

## 2026-11-05: Guard resistance is hyperbolic

The user asked for it so that effective HP scales linearly and stacking never reaches immunity. Damage taken is 1 / (1 + r), and a weakness takes 1 − r. The old immunities become r = 3 (takes 25 %), and that level still blocks the element's status. Details are in `explorations/2026-11-05-guards-round-2.md`. The golden hash is unchanged.

## 2026-11-05: The Prism stores and Lances; Mend and Siphon take their extras

- **The Prism (Shield + Arcane) is redesigned** as a Capacitor. It stores what its raised block takes. Lowering it with 10+ charge fires the Lance, a 7 u arcane line for 8 + the charge, carrying the coat.
  - It keeps its parry, Phase and Clear.
  - The alternatives (a projected pane, or keeping the beam mirror) and the reasons are in `explorations/2026-11-05-guards-round-2.md`. Asked on the review page.
- **Siphon:** the wand's elements refill faster.
- **Mend:**
  - Every extra rune heals more.
  - Water or Cold douses burning allies.
  - Fire dries and thaws them.
- **Guard rim:** guards show their extras as a dotted rim.
- Golden hash `e055dcdb` → `7184435b` (new Prism charge state).

## 2026-11-05: Round 4 ratings: the Lance Prism is adopted

The user chose the Capacitor and Lance (q-prism = lance) and kept the new Prism cards, Mend's extras and Siphon's focus, with a balance pass to come. The guard rim was "maybe a little too subtle", so it is now drawn stronger.

## 2026-11-05: Every element in a heal lends its resistance; guard ties settled

- **Heals:** the user approved it ("That sounds like a good addition").
  - Every element in a Life spell besides Life lends whoever it heals that element's guard strengths for 4 s (never its weaknesses, as under the Leaf). Each rune adds a quarter of the guard's row.
  - This closes the last open case from the Life size rule: Life + Lightning + Cold, where the Cold used to do nothing, now also makes the healed resist cold.
  - It works on any body, enemies included (pillar 3). It stacks with a guard's own resistance before the hyperbolic formula.
  - The Atlas text says what each element lends.
  - Golden hash `7184435b` → `a258615b` (new bless state).
- **Guard ties (the user: "Didn't we decide lead is based on the type of rune, not the count?"):** yes. A strong element leads by type. Count only matters among Water, Fire and Cold, and ties go Water, Fire, Cold, the same as spells. The tie note in `explorations/2026-11-05-guards-round-2.md` predates that and is superseded. No change.
- **Correction:** the remote-prediction fixes (world-space aim guesses, late remote spells caught up) were already built in 3c28950. The 2026-11-04 "Not built yet" line above is superseded by the entry "Smoother remote players online".

## 2026-11-05: Survive gets Rally and Echo

The user approved building both, Rally first (`explorations/2026-11-05-survive-mode.md`, question 5). Claude's calls, all in `PERKS` in `config.ts` and on the tuning panel:
- **Rally** (once per seat): stand within 1.6 u of a downed ally for 3 s and they get up with 40 % health (the breather gives 50 %). It works in any phase but the run's end.
  - **What breaks it:** casting, a weapon move, blocking, the Healing link, a hit, a grab, a stun or knock-down, or stepping out of range. Any break empties the ring. Queueing runes doesn't break it, so you can get up swinging.
  - **Rescuers:** two rescuers don't fill the ring faster, so the second one covers the first.
  - **What a partner sees:** a dashed green ring round the fallen ally, the size of the range. While a rally runs, a ring fills in the rescuer's colour, Life motes flow between them, RALLY floats overhead, and the wave strip reads "P1 RALLYING P2 66%". The revive is a column of Life light and a RALLIED pop. A broken ring snaps.
- **Echo** (a one-shot that can be picked again): a free Double appears at once, so you can plan round it in the lull, and fades when the next wave is cleared. It is the cast Double in every way (60 HP, repeats your spells at half power for half their runes, and enemies want it more), except that it binds no Sigil rune. A Double you cast replaces it. The Double's spawn is now `spawnDouble` in `structures.ts`.
- Golden hash unchanged (`7184435b`): all the new state is in `world.run`, which only Survive has.

*(Superseded: Rally is everyone's, not a power-up, since "Survive Review answers, round 1"; Echo is no longer a free Double but a free repeat of every spell, since "Survive power-ups, pass 2".)*

## 2026-11-05: Netcode is rollback (recorded after the fact)

Recorded after the fact during a docs cleanup: the switch happened while building, and no entry logged it.
- **Decided: online matches run rollback, not lockstep.** `RollbackSession` (`game/packages/net/src/rollback.ts`) runs every tick at once with predicted remote inputs, snapshots each tick, and rewinds and replays when a real input differs, within a 1 s window. Your own input acts at once.
- **Input delay: 2 ticks** (`NET_DELAY` in `game/packages/client/src/net/netplay.ts`; the host can change it in the F1 Network test). This replaces the 8-tick lockstep delay of "Online co-op, first route".
- **When:** commit `14c15ae`, 2026-11-04 20:37 UTC ("Rollback netcode: RollbackSession ... online play uses it with a 2-tick delay"). That commit is on the local branch `private-history`, which is never pushed; the public history's first commit `ce6edb6` (2026-11-04 22:41 UTC) already contains it.
- **Why (from that commit and the engine research):** rollback removes the input delay that lockstep needs, and the sim was already snapshot-able, as "Engine stack" required so that rollback stayed possible. Tests at the time: 2 peers at 100 ms and 4 peers at 200 ms with 15 % loss stay identical and never wait.
- **Later on top of it:** world-space aim prediction and late remote spells caught up ("Smoother remote players online"); drop-out and rejoin ("Network test, drop-out and rejoin").
- This supersedes "lockstep first, with rollback kept possible" ("Engine stack") and the lockstep delay in "Online co-op, first route". `LockstepSession` stays in `@wizard-sim/net` as the base class.

## 2026-11-05: Vision open questions updated; the other enemies' deaths are keeps

- **vision.md** (the user approved the cleanup proposal: "Sounds good"):
  - The opening line points to the live game and to `current-state.md`.
  - Platform notes that gamepads and online co-op work.
  - The spell-structure and casting-resource questions are answered. Support is partly answered. Pacing has a "so far" note.
  - Two questions are new: Air as a tenth element, and whether run modes may bend pillar 1.
  - The pillars are unchanged.
- **Deaths for the other enemies (Spell VFX gallery, group `deaths2`):** the user rated all 18 bespoke deaths keep: brute, archer, imp, grabber and shieldbearer. *(Read back late: the ratings were left on 2026-11-05 at 15:54–15:57.)* The goblin's calmer Arcane death (v3) is in the game but was never shown in the gallery, so it gets a gallery card to rate.

## 2026-11-05: Rally: a hit drains the ring instead of emptying it

This is built on the recommendation for Survive q10 (`tools/survive-review`, `q-10-rally`), pending the user's answer:
- Your own breaks still empty the ring: casting, a weapon move, blocking, the link, a grab, a stun, or stepping away.
- A hit drains 1 s (`PERKS.rallyDrain`), at most every 0.5 s (`rallyDrainGap`), and the ring doesn't fill while you're being hit.
- So one archer bolt no longer resets a 90 % rescue, while a goblin chewing on the rescuer still keeps the ally down for a long time.
- Golden hash unchanged: the state lives in `world.run`.

## 2026-11-05: The rune economy: a shared regen budget with a floor ([explorations/2026-11-05-rune-economy.md](../explorations/2026-11-05-rune-economy.md))

The user's answers on the Rune Economy page (`tools/rune-economy`, db `answers`):
- **q-1 Regen model: the shared budget with a floor (α ≈ 0.25).**
  - One total regen rate R is shared among the pools that aren't full, weighted by max.
  - A quarter of R always reaches every pool that isn't full.
  - The user's own reason: a floor also stops "one rune short in every element" from taking forever to refill.
  - This replaces the flat 0.22/s per element, in every room.
- **q-2 Starting pools: Survive starts at 2 per element.**
  - "Start quite weak". The campaign will start very weak and build up.
  - Survive can grow faster, and its waves must be retuned to match.
- **q-3 Lulls: pools refill to full when a wave ends.**
- **q-4 Glyphs (the user's own option):**
  - "+1 to all" becomes **+1 to three elements**.
  - Shield and Sigil, being "pretty different as elements", get their own glyph: **+1 Shield and +1 Sigil**.
  - "+2 to one" and "+R" stay.
- **Same conversation:**
  - **Echo is redesigned** as "very strong for the next wave", where the only cost is the permanent pick you skipped (no rune loss).
  - **The camera follows your own wizard in every room, with arrows at the screen edge pointing to allies.** Couch co-op on one screen is the exception.
- **How "+1 to three" picks its elements:** the user expected to always choose the three. They agreed to try Claude's version first: each altar names three elements from a fixed rotation, with no menu. If that feels too random, switch to choosing.
  - **Revised the same evening, by Claude:** choosing is cheap without a menu. You step on the altar, then tap the three element keys you want (the keys you already cast with), and the HUD shows "+1 to: _ _ _". This is built in place of the fixed rotation.

## 2026-11-05: Survive Review answers, round 1

The user's first answers on the Survive Review page (`tools/survive-review`), built:
- **Q8, the camera: separate screens, ally arrows, no zoom.** Each screen follows its own wizard; the zoom-out step and the team-centred framing are gone. Another wizard off screen gets a small arrow at the edge of the view in their seat colour, with a light rim and a head dot so it never reads as an enemy's red mark, blinking while they are down. Then widened by the user: **this holds in every room**, the Sanctum and the Arena too. Where the arena fits the screen, the view only drifts toward you as far as keeps the whole arena in view; where it doesn't, it stops a little past the edge, as Survive's did. **Exception:** several local seats on one screen (couch co-op) share it: the camera aims at their middle, and an arena that fits is framed still, as before. The `?ally=1` bot counts as a remote partner. `?local=N` follows seat N only (for tests and screenshots). This supersedes the zoom-out step in "Survive's arena is big, and the camera follows".
- **The pick has no time limit.** It ends once every living wizard has picked (the breather has already stood everyone up). The next wave's portals open during it but release nothing until the wave starts, as before; a test now holds that. The 30 s `pickMax` is gone; the dev panel's skip ends the pick at once (unpicked seats go without).
- **Slipstream and Bloom are cut** (the user: Slipstream is degenerate, since you can hop back from nothing and cast a free 5-rune spell; Bloom isn't useful). Their code is removed, not just their altars: the hop window, the free-cast refund and the heal splash.
- **Rally is everyone's by default** (the user: "doesn't sound like it should be a power-up"). Any wizard can rally a downed ally, with the same rules (3 s, 1.6 u, back at 40 %, your own breaks empty the ring, a hit drains 1 s). It's no longer offered at the altars, and the green ring shows round every downed wizard.
- **Glass heart is built** (the user: keep, "fun especially in co-op if you have people you can stay safe behind"). It uses the exploration's numbers: +25 % damage dealt and −25 % max health per stack, additive, up to two stacks (+50 % / −50 %). Your current health shrinks with the max. The bonus applies to every hit you deal, friendly fire included.
- **Power-up ids are renumbered** (charm 7, clockwork 8, echo 9, glass 10; `N_PU` 11). That's fine because `world.run` is only ever built fresh.
  *(Since pass 2: Lingering 11 and Quickstep 12, `N_PU` 13.)*
- **Not changed,** because they're under discussion: Echo, Wellspring, the rune power-ups and the wave list.
  *(Echo was redesigned in "Survive power-ups, pass 2".)*
- Golden hash unchanged (`9382eb5b`): the scripted run is in the Sanctum, which has no `world.run`, and the camera is client-only.

## 2026-11-05: The Leaf's Seed step blooms where you land, for allies only

- **The user's play-test:** "you take a step back and leave a healing aura behind ... you'd just help the enemies who are about to walk into it."
  - A Retreat moves away from enemies, so anything it leaves behind sits in their path.
  - The round-2 choice ("like the Life spring, it heals anyone standing in it") made the Leaf's escape a gift to whoever was chasing you.
- **Built:**
  - The hop back is unchanged (2.5 u).
  - On landing, an instant bloom heals you and every ally within 3.5 u of where you land (`ARMS.seedHeal` 15, `leafRange`).
  - Nothing lingers on the ground, and enemies are never healed.
  - It's drawn as a leaf ring opening at the landing spot.
- **Why allies only:** a guard's moves are deliberate support. The Leaf's block and parry already heal only allies, so the Retreat now matches them (pillar 3: empowering an ally is set up on purpose). Life *spells* still heal anyone they touch.
- Golden hash unchanged.

## 2026-11-05: The rune economy, built

Built from "The rune economy: a shared regen budget with a floor" above. Claude's calls are marked; the user can veto any.
- **Regen, every room:** one total rate R = 1.0 rune/s (`RUNES.regen`) shared among the pools that aren't full: `regen_e = α·R·max_e/Σmax_all + (1−α)·R·max_e/Σmax_notfull`, α = 0.25 (`RUNES.floor`). Code: `regenRate` in `world.ts`, `fullMask` / `poolCap` in `structures.ts`. Sigil counts as full when every unbound rune is back.
- **Attune multiplies R by 2.5, Siphon by 4,** and the wand's focus multiplies that element's share again, as before. Channel upkeep and the Shield drain are unchanged; a drained pool simply takes a bigger share.
- **Claude's call, turrets:** their pacing was "at most 60 % of your 0.22/s regen". It is now 13 % of R (`STRUCT.turretShare` 0.13), which keeps their old fire rate.
- **The HUD shows the flow:** a refilling pool's pip glows brighter, and its rim shimmers faster, the bigger its share of R, and a line under the pips grows with that share.
- **Survive starts at 2 per element (Sigil 1)** and every pool refills to full when a wave is cleared. The Sanctum and the Arena keep their pools (about 4, Fire 5, Sigil 3).
- **Survive's glyphs:**
  - **+1 to three** replaces Deep pools. Step on the altar, then tap three different element keys (not Shield or Sigil); they pick instead of queueing, and the HUD shows "+1 to: _ _ _". The pick waits until you've tapped all three. The choice is input-driven and lives in `world.run` (`choose`, `chosen`), so it rolls back with everything else.
  - **+1 Shield and +1 Sigil** replaces Spare sigil.
  - **Wellspring is +15 % R** a stack. Deep (element) stays +2 to one.
  - **Claude's call, caps:** +1 to three up to 6 stacks (was 3, since pools now start smaller), Shield and Sigil up to 3 (was 2); the others are unchanged.
- **Claude's call, the early waves are lighter** for 2-rune pools: wave 1 is 4 goblins (was 5), wave 2 is 4 goblins and 1 fire imp (was 5 and 2), wave 3 is a shieldbearer and 3 goblins (was 6). The counts are still scaled by 1.3 for the big arena. The list's shape is unchanged.
  - The bot now drops Place spells (a geyser, else a fire patch) on shieldbearers instead of throwing shots into their guard.
  - The balance harness has a new Survive section (one bot, 8 seeds). The solo bot casts only 1–2-rune spells, and it now clears wave 2 in 8 of 8 runs and wave 3 in 6 of 8 (it falls after picking Clockwork, which does nothing for it).
  - Before this change, the bot cleared wave 2 but fell at wave 3 in 7 of 8 runs.
- **The golden hash moved to `dda18ae2`** (from `9382eb5b`). The scripted Sanctum run regenerates differently under the shared budget.

## 2026-11-05: Weapon blows fixed; the imbued swing becomes a burst

The user's report from the live game: a conjured Tide trident's Strike (RMB tap) and Sweep (Shift+RMB) "do nothing", and look like "a small jab of the default wand and a water nova". Confirmed in the sim: an enemy 1.2 u ahead kept its health and position, and only got wet. The blow fired the weapon's elements and nothing else, and Water deals no damage. Its only picture was the generic burst event, drawn as a nova. Fixed, with the imbued swing redesigned at the user's request:
- **Every blow is a physical hit plus the weapon's elements.** Strike, Sweep and the staff's shove all deal physical damage and knockback, then the weapon's payload at 0.8 power. A hit is recorded (last hit, direction, melee). Each weapon has its own numbers (`ARMS.blowDmg`, `blowKnock`, `blowHalf`, `blowReach`, all tunable):

  | Weapon | Physical dmg | Knock (u/s) | Strike half-angle | Reach |
  |---|---|---|---|---|
  | Staff | 6 | 3 | 54° | 1.6 u |
  | Tide trident | 7 | **12** | **40°** (narrower) | **2.6 u** (×1.2) |
  | Frost spear | 8 | 4 | 25° | 2.8 u |
  | Lightning whip | 4 | 3 | 36° | 3.4 u |
  | Flame sword | 7 | 4 | 54° | 1.8 u |
  | Stone maul | 4 (its Earth already deals 17.6, knocks down) | 9 | 54° | 1.6 u |
  | Healing hands | heal only, no physical hit | 0 | 43° | 1.8 u |

  - The Sweep is the same blow in a full circle at 0.8 power, pushing outward.
  - The wand's Strike stays a bolt.
  - The maul's physical part is kept small so its Heavy (the fissure) still hits clearly harder than a Strike.
- **The blows are drawn as moves, not novas.**
  - The sim emits `move` events `strike` and `sweep` with the weapon's element and no burst.
  - On a Strike, the held weapon thrusts out along the aim and back. Narrow weapons show streaks to their reach (three prongs for the trident), wide ones a smear across the cone.
  - On a Sweep, the weapon spins once round you, leaving an element-tinted trail ring.
  - Each element sheds its own bits: droplets, flames, shards, a crack or dust.
  - These are drawn in the game's own pixel style after the Weapon Moveset Review's Strike and Sweep vignettes, not ported line for line, since those are keyframed poses.
- **Tap or hold is readable.** Once RMB is held past the 0.25 s tap window, a ring at your feet fills in the weapon's colour (grey for the staff). At full charge it flashes white and the weapon glows. The Healing link, which is a hold but not a charge, has no ring.
- **The imbued swing is now the imbued burst** (a Weapon cast with elements but no Sigil or Shield). The user wanted Magicka's imbue-then-release: a burst of the queued elements in front of you, with no lasting weapon.
  - It's a cone 2.5 u long (+0.25 u per extra rune) with a 61° half-angle (`SHAPES.imbue*`).
  - It hits at full spell power, so damage grows with the runes like any other spell, and carries every queued element.
  - It's drawn as a crescent of those elements leaving the staff and rolling out over the cone.
  - In the Atlas it's "Water burst", "Fire burst", "Stone burst"..., and the mixes are "Scalding burst" and "Freezing burst" (`tools/spell-atlas/rules-c.js`, synced to the game and the VFX gallery). Atlas audit: 0 inert additions.
  - Life + Weapon stays the Healing palm.
- *Rejected:* making Water itself deal damage, which would change every Water spell.
- Golden hash unchanged (`9382eb5b`): the scripted run uses no weapon blows or imbued casts.

## 2026-11-05: Lingering effects last as long as they look
See `explorations/2026-11-05-effect-durations.md`.
- **The user's play-test:** "it feels like some effects are way too short. Like placing rain rains for like 1 second. I'd expect like 5+."
- **The rule:** an effect that looks like it lingers (an area you place) lasts as long as it looks like it should, and is drawn for its whole sim life, fading at the end. Instant-looking effects (novas, strikes, blasts, geysers, discharges) stay instant.
- **Built: Water Place is now Rain** (was Flood). Rain falls for 5 s, +1 s per extra Water (`SHAPES.rainLife`, `rainPerRune`, `ZONE.rain`). Every tick it soaks and douses whoever is under it, and every 0.5 s it tops up the puddle. It is drawn as falling rain for its whole life. The spell's other elements still hit only once, on landing. Water deals no damage, so no damage over time is added.
- **The audit found nothing else to change:** the Fire patch already burns the ground for 10 s and the Frost patch freezes it for 16 s. Their short opening flourishes are only the moment they appear. Steam (6 s), the Healing spring (4 + 2n s) and the Blink spark (4 s) were already drawn for their whole lives.
- **Rejected:** shortening the Fire patch to the ~5 s the note suggested. It already reads as lasting, and a shorter patch would only be weaker.
- Golden hash unchanged (`dda18ae2`): the scripted run never casts plain Water Place.

## 2026-11-05: Floors fade; the consistency audit
See `explorations/2026-11-05-effect-durations.md`, "Follow-up: consistency audit".
- **The user's answers:** water and ice floors should fade out at the end, as burning ground does. On rain, more Water should make it wider *and* longer ("Maybe both"). Then the user asked whether other effects need a look for consistency.
- **Built: floors fade over their last second.**
  - Water and ice dither out in six steps (`FLOOR_FADE`, `floorFade` in `client/src/art/vfx.ts`).
  - Fire's flames and its dark base now fade together over the same second. The flames used to fade over 0.67 s while the base popped out.
- **Built: the Blink spark fades fully.** It used to end with its ring still at half strength.
- **Kept: rain grows +0.4 u and +1 s per extra Water.** That is the same radius step as every Place patch. The Atlas text now says so, and a test pins the radius.
- **The audit's results:**
  - Everything else that lingers already fades or ends with its own effect: zones, walls, devices, wards, auras, Doubles, statuses.
  - No effect is drawn for a different time than it lives in the sim.
  - The per-rune rules disagree in places: the geyser and spring grow +0.3 u (other Place shapes +0.4), Discharge grows +1.0 (other Area shapes +0.6), the spring gains +33 % life a rune (rain and rock +20 %), and steam, patch floors and the aura don't grow at all.
- **Proposed, not built (balance):** "more of the lead element makes it bigger, and if it lingers, longer (+20 % a rune); every rune adds strength". The six questions and Claude's picks are in the exploration. In short: the geyser and spring step goes to +0.4 (yes); Discharge stays an exception (keep); the spring keeps +2 s (keep); steam +20 % (yes); patch floors +20 % (yes); the aura stays fixed.
  *(Accepted in "Rune scaling: the audit's recommendations accepted" and built on 2026-11-06; see the end of "Weapons are the cheap option".)*
- Golden hash unchanged (`dda18ae2`): only drawing changed.

## 2026-11-05: Rune scaling: the audit's recommendations accepted

The user: "sounds good", on the six scaling questions from "Floors fade; the consistency audit".
- **Change:**
  - Geyser and healing spring radius goes to +0.4 u a rune.
  - Steam lasts +20 % a rune.
  - Floors left by a Place patch last +20 % a rune (Place only; novas are unchanged).
- **Keep:**
  - Discharge's +1.0 u reach a rune: the reason to stack Lightning on yourself.
  - The spring's +2 s a rune: extra Life heals by lasting longer.
  - The aura doesn't grow with Sigil.
- To be built after the weapons pass lands, since both touch `effects.ts`.
  *(Built 2026-11-06: the "Built" lines at the end of "Weapons are the cheap option".)*

## 2026-11-05: Weapons are the cheap option: a Strike rhythm per weapon, and extras you can see
See `explorations/2026-11-05-weapon-dps.md` (the before/after table).
- **The user's play-test:** "The arcane wand feels a bit too powerful. You can spam it very fast, leading to high dps for very low cost." And: "I also am not seeing enough visual difference based on any extra elements I add". That was about the wand first, then about every weapon (the trident with extras looked like a plain trident), then the guards.
- **Measured** (`npm run balance:weapons`, `game/tools/weapon-dps.ts`): each Strike recovered in 0.18 s, so a mashed Strike landed about 4.3 times a second, and 30 uses cost 2 runes. The wand did 31 DPS against the Arcane beam's 13.5. The maul did 92 against the Earth rock's 15. The free staff did 26, out-damaging every one-rune spell.
- **The principle: a weapon is the cheap, always-available option.** Its sustained DPS sits clearly below a committed spell of the same element. A spammed Strike should be about 50–60% of that spell. A Heavy hits harder per move but comes slower. The wand must not out-damage the beam.
- **Built: each weapon has its own Strike rhythm** (`ARMS.strikeRecovery`). The recovery after a Strike or Sweep is: staff 0.6 s, Healing hands 0.35, trident 0.65, whip 0.68, wand 0.62, sword 0.8, spear 0.9, maul 1.4.
  - This keeps pillar 4: it's the same recovery phase spells have, with a length per weapon.
  - It's drawn as the weapon's follow-through: out fast, a beat held, back to rest over the recovery. You can see the maul's slow swing and the wand's quick flick.
  - Presses during it wait in the cast buffer.
- **Damage changes with it:**
  - Blow physical damage: staff 4, trident 5, spear 4, whip 3, sword 2, maul 2.
  - A blow carries 0.5 of a spell's elements (was 0.8).
  - The wand's light bolt is 0.3 (was 0.45), and its full charged bolt 0.75 (was 1.1).
  - Weapon waves are 0.8 (was 1.4).
- **After the fix:**
  - Wand Strike: 7.4 DPS, 55% of the beam. Wand Heavy: 59%.
  - Whip: 53% of the arc.
  - Maul: 59% of the rock.
  - Staff: 47% of the beam, for free.
- **Two exceptions:**
  - **The flame sword is 108% of Fire spray x1.** Burning is a 6 DPS floor that any igniting touch sets, and the regen-limited spray is barely above it. This is open question 1 in the exploration.
  - **The frost spear is 164% of Ice shards.** Cold spells deal little damage by design. At 6.9 DPS the spear is still below the wand and the whip.
- A test holds the wand below 65% of the beam and the whip below 65% of the arc (`arms.test.ts`).
- **Built: extras you can see, one shared system** (`game/packages/client/src/art/accent.ts`). The look rule still holds: the lead element sets the weapon or guard, and each extra rides on it with equal weight.
  - **On the held weapon**, each extra gets a band of its colour along the blade, a tip glow and its own particle:
    - Fire: licks and embers.
    - Cold: rime on the blade.
    - Lightning: crackle hopping along it.
    - Water: drips.
    - Earth: stone chunks set in it.
    - Arcane: rune sparks.
    - Life: motes.
    - The wand's orb and the Healing hands get a ring in the extras' colours instead.
  - **In every move**, the extras show along the Strike's thrust and round the Sweep's ring. The Heavies and guard moves trail or burst them.
  - **The wand's bolts** stay violet at the heart and change with each extra: a flaming streak, an ice-shard head, crackle, a droplet trail, a stone pebble, motes.
  - **Guards** replace the faint dotted coat rim with a thick turning arc per extra, a glow of the strongest, and coloured ends on the blocking face.
- **Noted:** "Sigil + Fire + Lightning" is the Lightning whip, not a flame sword, because Lightning leads by type, as in guards and spells. Open question 2.
- Golden hash unchanged (`dda18ae2`): the scripted run uses no weapon moves.
- **Built (2026-11-06):**
  - Geyser and spring radius are now `0.9 + 0.4n` and `1.4 + 0.4n`, the same size at one rune.
  - New `SHAPES.lingerPerRune` 0.2 stretches steam and a Place patch's floors.
  - The golden hash moves from `dda18ae2` to `d13d22ff`, because the scripted replay casts a multi-rune Place spell.

## 2026-11-06: Weapons pass questions answered

- **Lead by type stands for weapons.** Sigil + Fire + Lightning is the Lightning whip with Fire extras, and there's no "lightning flame sword". User: "no that's fine".
- **The Flame sword stays at 108 % of the 1-rune Fire spray.** The 1-rune Fire spray will be revisited in the balance pass. User: "sure, we could revisit fire spray later".
- **Heavies keep about the same DPS as mashed Strikes, but hit harder per move.** The user had no strong opinion, so Claude's pick stands. Revisit if play-testing says charging isn't worth it.

## 2026-11-06: Survive power-ups, pass 2: the Maybes (`explorations/2026-11-06-survive-powerups-2.md`)

The user's Maybe notes on the Survive Review, built on Claude's proposals (the user can veto any):
- **Echo:** for one wave, every spell you cast goes off again 0.4 s later, free, along your aim then. It replaces the free Double. Beams and sprays get a second one trailing your aim; arcs zap twice. Structures, devices, weapons, Blink and Self casts don't echo. It's three times as likely to be offered before a key wave (the 5th and 8th of every eight). User: "be super powerful for the next wave … The permanent weakness is about the opportunity cost of not picking another thing."
- **Long fuse becomes Lingering:** placed and lingering areas (patches and their floors, steam, rain, springs, nova floors, rock walls, glyphs) last 1.5× as long and are 1.25× as wide. Auras are not included.
- **Haste now shortens recovery too,** by the same factor as wind-up. **Quickstep** is a permanent, weaker Haste: +15 % a stack, two stacks at most.
- **Clockwork:** turrets bind no Sigil rune. Their shots cost runes again, inside the shared turret budget. Free shots were "way too powerful".
- **Bloom stays cut.** Triage (heals on an ally below 35 % health heal double) is proposed in its place, not built.
- Q11 (the Double's repeat cost) is moot. Q13–Q15 are new on the Survive Review.
- The golden hash is unchanged (`d13d22ff`): the scripted run is in the Sanctum and never hastes.

## 2026-11-06: The Esc menu and the scenario registry
The user asked for an Esc menu "where we can start having some navigation": multiplayer, and travel between scenarios (to be redesigned nearer a beta). Built on Claude's calls, which the user can veto (`explorations/2026-11-06-esc-menu.md`).
- **Esc clears first.** With runes queued, Esc refunds them as before. With an empty queue it opens the menu, and in the menu it closes it. Start (Options) on any gamepad toggles the menu. A quick Esc tap no longer slips between two ticks (`input.ts` latches it).
- **The menu draws like the HUD:** art pixels, the 3x5 font, at the HUD's automatic scale. Its sections are Resume, Scenarios, Multiplayer, Controls and Settings, and keyboard, mouse and gamepad all work.
- **Offline it pauses; online it doesn't,** and it says so. Your wizard stands still while the menu is open.
- **One scenario registry** (`client/src/scenarios.ts`: id, name, one line, room, key) feeds the menu, the number keys, the URL and the netcode's room names. A switch rebuilds the world in place instead of reloading, so a lobby survives it. The Tutorial row is in, greyed until the sim has a `tutorial` room.
  *(The sim has it since "The tutorial prototype": the row and key 4 are live.)*
- **Online, the host moves everyone:** `NetPlay.switchRoom` starts a new match with the players still in, and their pages follow it by the old match's id (`prev` on the start message). Non-hosts see the scenarios greyed. The number keys do nothing in an online match.
- **Fixed on the way:** a joiner's page now remembers the host's room. A rejoin welcome sent by a joiner acting as coordinator used to name the joiner's own room.
- **Alternatives:**
  - a separate menu key (rejected, since Esc is the convention);
  - pausing online (left open);
  - leave-first instead of a room switch (rejected, since the switch was small enough to build);
  - a DOM-styled menu (rejected, since the pixel canvas matches the HUD).

## 2026-11-06: Enemy attacks drawn (`explorations/2026-11-06-enemy-attacks.md`)

- **Every enemy gets a readable attack:** a telegraph pose for the whole wind-up, a strike frame with a smear, an impact or release, and a recovery. Before this, only the brute and the archer's draw moved; the goblin, shieldbearer, imp and grabber stood still while their hit landed. User: "It looks like some enemies don't have attack animations at all."
- **Drawn from the sim's existing state** (`ai`, `aiT`, `lockX/Y`, `holding`), so no sim change was needed. Rollback redraws correctly, and the golden hash stays `d13d22ff`. This also fixes a stunned brute miming a slam that never landed.
- **Calls Claude made (the user can veto any):**
  - the archer's arrowhead glows once its aim locks;
  - the grabber shows a hold-timer ring that everyone sees;
  - a crack runs from the brute's fists to the slam's centre, so the 2.6 u reach reads;
  - the brute slam shakes the screen by 2.5 px;
  - every goblin-sized body crouches into its wind-up and stretches into the blow.
- **Open:** should the brute's slam travel out from its fists as a shockwave (a gameplay change)? The exploration's question 1.

## 2026-11-06: The help panel (F2) (`explorations/2026-11-06-help-panel.md`)

Built on the user's request, with Claude's calls (the user can veto any):
- **F2, the "?" button or D-pad up opens a panel on the right edge** that says what the queued runes will do: one row per gesture (RMB, Shift+RMB tap, Shift+RMB hold, Space, Shift+LMB), each with its key glyph, the spell's name, a line or two from the rules, the extra elements' traits as coloured tags, and a live preview. With nothing queued it shows your hands' five moves for the weapon and guard you hold. While a spell is being cast, its row is lit.
- **The previews are the real thing:** each row runs a tiny world of its own (a wizard and a dummy) through the demo loop and draws it with the game's own view. Why: a drawn icon would misrepresent what a spell looks like. The cost is a few ms a frame for all five (half of them redraw each frame), and nothing runs while the panel is closed. The game's world is untouched (a test checks the hash with previews stepped in between).
- **Numbers are behind a toggle, off by default** (Shift+F2 or the switch in the footer): rune cost (and what binds), damage or healing per element per hit (or per second), reach, how long it lasts, and the hold (channel or charge). They are read from the live config, so tuning shows.
- **Pixel text, one scale under the HUD's on big screens** (3x at 1080p), so 25 characters fit beside a preview. The panel stops above the rune bar when the two would overlap.
- **New-player touches:** every element key with its letter in the panel; a cancel shows "X cancels Y: opposites cancel, runes back" in the panel's footer, and as a toast over the rune bar the first 5 times a browser sees one; the first session shows "F2: what will my runes do?" under the "?" button for 14 s (kept in localStorage).
- **Text written here, not taken from the rules:** a few cells whose rule text describes the form's plain spell instead of the mix (Ice sheet, Steam cloud, Freezing splash, Steam burst), the imbued burst, the Self cast without Shield or Sigil (its traits instead), and every hands move (from `hands.ts` and `guards.ts`). The rules' own text for Ice sheet describes Rain, which is worth fixing in `rules-c.js`.
  *(Fixed in "Final-pass review: rules text, room switches and shared keys": the rules now describe the mixes, the burst, the weapons and the guards, and the panel's overrides are gone, except Self without Shield or Sigil.)*
- **Rejected:** a DOM panel with a system font (more readable at small sizes, but it wouldn't look like the game); per-shape icon animations (cheaper, but they can't show a turret, a Bulwark block or a Surge the way the game does).


## 2026-11-06: The tutorial prototype (`explorations/2026-11-06-tutorial.md`)
The first cut of the tutorial design is built and playable at `#tutorial` (Esc menu → Tutorial, or key 4; `#tutorial-7` starts at beat 7). Built on Claude's recommendations; the user can veto any.
- **Eight beats in one chamber, then an end card:** Walk (three floor stones), Strike (three straw goblins), Heavy (shove a straw sack into a chalk ring), Retreat (a soft Brute: two slams that hit nobody), Defend (parry an archer's bolt with the training buckler), Fire (burn the bramble hedge across the way out), Water (cross a burning floor, then douse yourself), Steam (straw goblins in the rain: Water + Fire). The end card's three arches go to the Sanctum, Survive and the Arena. A bot plays it through in about 80 s; a first-timer should take about 4 minutes.
- **The design's open questions stand on their recommendations** (unanswered, so Claude's picks are built or kept):
  1. Defend in the hands chapter uses a **training buckler** (a real Mirror buckler with 4× guard HP, re-given at every beat start from beat 5). No bare-handed block.
  2. Plain Cold on wet still doesn't freeze; the tutorial will teach the Water + Cold mix (beat 13, not in this cut). Making wet + any Cold freeze is worth a separate look.
  3. First visits don't land in the tutorial yet; that waits for the full build.
  4. **Brambles are a new archetype** (only fire hurts them; blows bounce off; rooted). Beyond the tutorial they're a candidate battlefield prop, not used yet.
  5. **One chamber, redressed** behind a short fade, not a path of rooms.
  6. The tutorial teaches the grammar and one use of each element, not every cell.
  7. Neutral, short lines; no tutor character.
  8. The tutorial is first contact; practice stays in the Sanctum (whose trials could later reuse beats). No vision edit made.
  9. **Skipping needs everyone on the "I know this" stone** (1 s).
  10. **You can't die: you faint** for 1.5 s and get up at full; the beat starts over only when every wizard has fainted.
- **The prototype's shortcut:** personal beats (Walk, Retreat, Defend, Douse) complete when **any one player** does them. The per-seat done-bits (`w.tut.done`) are there for the full build.
- **How it's built:** a `tutorial` room; `w.tut` state (null in every other room, so the golden hash `d13d22ff` is unchanged); rune gating through `runeMax` (locked elements are max 0, show dry, and the HUD hides their caps, or the whole rune bar when all are locked); the beat table in `sim/src/tutorial.ts` with setup and checks, run last in `step` so the checks see the tick's events; prompt text in `client/src/tutorial-text.ts`. Shared-code hooks, each inert outside the tutorial: archetype flags `passive`, `rooted` and `onlyFire`, and the Brute's slam reporting whether it hit anyone.
- **Not in this cut** (as the design deferred): beats 6 and 10–19, the apprentice and sleeper, bolts on walls, the test waves, per-seat spawns and done-bits, the F2 row highlight, the "Tutorial: runes / the test" menu entries, the first-visit offer.
- **Alternatives:** a staff block for everyone (rejected for now, open question 1); straw targets as softened goblins with multipliers (replaced by a passive `straw` archetype, because a goblin with zero damage still bites and shoves).

## 2026-11-06: Final-pass review: rules text, room switches and shared keys
A review of the day's merges (item 5b of `overnight-2026-11-06.md`). Each fix has a test that failed first. Claude's calls; the user can veto any.
- **The rules describe what the game builds** (`tools/spell-atlas/rules-c.js`, synced to the game and the VFX gallery; Atlas audit still 0 inert additions, 678 spells):
  - The water mixes have their own Area and Place text, whichever of the two leads: the Ice sheet no longer reads as Rain, the Steam cloud no longer as Rain or a fire patch, the Freezing splash and Steam burst no longer as a pushing splash.
  - Sigil + Weapon names the game's weapons and their moves: the **Arcane wand** (bolts, a charged piercing bolt, the held Siphon) instead of the Arcane hook (Yank), the **Tide trident** instead of the Tide glaive, the Healing hands with their link and Mend.
  - Shield + Weapon names the guard its lead element picks, as `guards.ts` does (the eight guards: Mirror buckler, Bulwark, Ember targe, Rime kite, Spark ring, Tide shield, Prism, Leaf aegis), with its real Defend, Retreat and passive. The Bulwark's "swing to bash" is gone.
  - The imbued burst's text starts with what it does; the Frost patch lasts about 16 s (it said 15).
  - So the help panel's per-cell overrides are gone; only Self without Shield or Sigil is still put together in `help-model.ts`.
- **An in-place room switch leaves nothing of the old room behind.** A new world's clock starts at 0; the view kept the old room's scorch marks (drawn darker than full for up to a minute) and effects keyed by the old clock. The view's clock now carries on across a switch (`WorldView.simTime`), and the scorch marks are cleared. Client only.
- **Coming back to the tutorial greets the beat again** (its title and fade-in were skipped when you returned to the beat you left).
- **Shared keys:** a gamepad's D-pad up no longer toggles the help panel while the Esc menu is open (the D-pad moves the menu there). The number keys switch scenarios from inside the menu too, offline and when not typing a room code, as the "(1)"–"(4)" beside each scenario promise. The menu's Controls list has key 4 and the D-pad's help.
- Golden hash unchanged (`d13d22ff`): nothing in the sim changed.

## 2026-11-06: Performance pass (`explorations/2026-11-06-performance.md`)
Measured first (`npm run perf`, new), then only safe, local fixes that keep the same pixels and the same sim result (the golden hash `d13d22ff` and three bot-run hashes are unchanged). Claude's calls; the user can veto any.
- **Sim:** enemy steering's line-of-sight test skips walls by bounding box, and the hot wall-distance loops no longer allocate. Wall collision runs body by body over the tick's rock walls. Survive at wave 12 went from 0.55 to 0.26 ms per step. That matters most for rollback, which can re-run up to 60 ticks in one frame.
- **Client:** the two effect canvases are a window the size of the view, not the whole field. Atlas pages are 256 px (a new frame re-uploads a quarter as much). Enemy frames aren't keyed by an idle phase their rigs don't draw. Strings and arrays are gone from per-frame hot paths (floor surfaces, wall slabs, `poly`). In headless Chrome a Survive late wave went from about 22 to 11 ms per frame (p50), 4.0 to 2.8 MB uploaded per frame at 1280 × 800 (1.8 MB at 1080p), and 3.4 to 1.0 MB allocated.
- **Bundle:** Pixi has a chunk of its own, and PeerJS loads only when a room is made or joined. Boot script fell from 1116 to 1021 kB, and the boot load is three parallel files instead of a waterfall of eight.
- **Not taken (listed with rough costs in the exploration):** tile or sub-rectangle uploads of the effect canvases (still the main GPU cost), per-cell atlas uploads, the help previews repainting walls every loop, a bucket queue for the nav fields, and lazy tune and help panels.
- **Rejected:** coarser quantization of enemy attack poses (it would cut more frames, but it changes how the attacks look).

## 2026-11-06: Final-pass loose ends and code quality
Items 5(a) and 5(c) of `overnight-2026-11-06.md`: the bugs the review left open, what the day's work left rough, and small behaviour-preserving clean-ups. Claude's calls; the user can veto any.
- **Bugs fixed** (each with a test that failed first):
  - A pad joins on a fresh press of any button but Start. Start (Options) opens the menu, so closing the menu with it no longer seats that pad, and neither does an A still held from picking Resume (the menu's open and close mark every pad's buttons as seen).
  - A room switch keeps exactly the seats that were taken. A pad on seat 2 with seat 1 empty used to conjure an idle wizard on seat 1 (the switch counted seats up to the highest one). `scenarios.ts worldFor` now builds the new world.
  - The tutorial: a body spawned into a reused slot carries no old tag (`spawnBody` clears it), and a new beat also clears the blessing, the spear's dash, the Prism's Phase, the Retreat cooldown and a raised guard. The menu's "HERE - RESTART" on the tutorial greets the beat again.
  - `?spell=sigil+cold/weapon;heavy`, the doc's own example, works: a bare hands word (heavy, block, wait...) is a cast with nothing queued.
- **The hands test is in** (the design's beat 6): four soft, slow goblins (6 hp, a quarter damage) on the diagonals round the entry close in; "Shift+RMB sweeps all the way round you." The tutorial now runs beats 1 to 9, then the end card. The goblins have 6 hp, not the design's 10, so two Sweeps clear them while they surround you, not four.
- **The brambles read as brambles.** They're bigger, a lumpy mound of leaf clumps with long brown canes arching out past it and pale thorn tips, so the silhouette bristles instead of reading as a green box. The hedge stands just in front of the rock line, where the rock rising behind it can't hide it, and it's four brambles (r 0.6) wide, so there's no slipping between it and the rock (a test walks into the gap from five lines).
- **Code quality:**
  - One pixel font: the glyphs the menu and the help panel each added (? ' ; " = < > and the menu's ` # ·) are in `art/px.ts FONT`, with one `fontText` clean-up the menu, the help panel and the HUD's wave strip share. So the tutorial's text can use an apostrophe too, whichever panel loaded first.
  - One blow table: `effects.ts blowOf` reads a weapon's (or the staff's) cone, reach, damage and knockback from ARMS.blow*, for both `heldBlow` and the empty Weapon cast's staff swing. The swing's dead options (`FireExtra` half, reach and knock, which nothing passed) are gone.
  - Leftovers from the Echo redesign are gone: `spawnDouble` no longer takes an hp for "Echo's free Double", and isn't exported. Comments that described the cut Arcane hook (Yank) now describe the hard shove that breaks a grab. The Slipstream and Bloom code was already gone. A script finds no config key that nothing reads.
- Golden hash unchanged (`d13d22ff`): only the tutorial's own state and the client changed.

## 2026-11-06: Attack warnings trimmed; the brute's shockwave

The user rated the six enemy attack cards in the VFX gallery (v9): all six **keep**, with these notes.
- **Archer:** "No warning needed. The travel time is your warning." The dashed aim line and the arrowhead's lock glint are gone. The aim still tracks, then locks, in the sim.
- **Imp:** "No warning needed." The red cone and the glow and embers over its wind-up are gone; the spit is unchanged.
- **Shieldbearer:** "More subtle warning." Its cone is drawn at about a third of the goblin's strength.
- **Brute (q-brute-shockwave):** "Yes, traveling shockwave is better. The warning on the ground should be much more subtle." Built:
  - The fists hit the floor just ahead of the brute (0.6 of its radius), and a front rolls out from there at 14 u/s (`slamSpeed`).
  - It hits each wizard inside the locked 2.1 u circle once, when the front reaches them. Rock breaks, and the impact (star, debris, dust, shake) lands, when the front reaches the circle's centre. The front, an arc of grit, is drawn only inside the circle, with the crack following it.
  - The circle is now a faint outline with a light wash at the end, instead of a solid ring filling with orange.
  - This is a gameplay change: the far side of the circle is hit about 0.3 s later than before, so standing at the edge buys a little time. New sim state: `slamX/slamY` (the start point) and `slamBy/slamAt` (once per wizard per slam). **Golden hash re-recorded: `d13d22ff` → `ca05db3f`.**
- **Goblin:** the user asked whether it cycles weapons. It doesn't: there are three kinds of goblin, each with its own weapon for life (club, dagger or spear, every third one in a crowd). The card shows the three in turn; its title and text now say so.
- The gallery's cards were re-ported to match.

## 2026-11-06: Stacked orbitals share one ring; they strike sooner

From the user's play-testing:
- **"When stacking orbitals, can we make them orbit you uniformly?"** Each orbital cast was its own ring starting at the same angle, so stacked casts sat on top of each other. Now all of one wizard's orbitals share one ring and phase, with their orbs spaced evenly in cast order (`orbitAngle`, sim). When an orb is spent or a new cast adds more, the client eases the others to the new spacing over about 0.1 s rather than snapping.
- **"The goblin basically had to walk into them for them to trigger, is that intentional?"** No. An orb struck only foes within 0.9 u of itself (`orbitStrike − orbitRadius + 0.6`), so a goblin coming in between two orbs was nearly touching you first. An orb now strikes a foe within `orbitStrike` = 1.6 u of it (to the foe's edge), which is about 3 u from you.
- Golden hash unchanged (`ca05db3f`): the scripted run casts no orbitals.

## 2026-11-06: Water on a fire leaves you dry; the tutorial prototype's review

**Bug, from the user:** "dousing yourself while on fire leaves you wet. I think it should just leave you dry. Maybe a little unrealistic, but feels better with canceling elements, and how magicka 1 worked." Now water on a burning body only puts the fire out, the mirror of fire on a wet body only drying it (`hit.ts`). Water on a body that isn't burning still soaks it, and standing in rain soaks you on its next pulse. **Golden hash re-recorded: `ca05db3f` → `afcc1d3f`** (the scripted run douses a burning body).

**The tutorial prototype, the user's high-level review** ("a good prototype"; their per-step notes are to come):
1. **A lore wrapper is coming, and it's the user's to write.** The tutorial feels barebones without one. Claude doesn't invent the story; text stays neutral and in one place (`client/src/tutorial-text.ts`) so the wrapper can drop in. This supersedes the tutorial exploration's open question 7 (neutral lines now): a voice will come, from the user.
2. **Lessons start too fast,** above all those with enemies: "You can't just start with a brute charging towards you, or start surrounded by enemies." Each beat with enemies needs a calm start, with the enemies arriving from a distance after you're ready.
3. **An empty rune UI,** instead of rune slots appearing as "floating islands" one by one as you get new runes: the whole rune bar shows from the start, empty, and fills as runes are given.
4. **Lessons are missing:** the prototype covers 2 of 9 elements and few of the spell types. The design's remaining beats (10–19: the other elements and the casts) are to be built.

## 2026-11-06: The tutorial, pass 2 (`explorations/2026-11-06-tutorial-pass-2.md`)
The review's four points, built on Claude's calls (the user can veto any):
- **All nineteen beats are in:** after the hands chapter, Fire (Force), Water (Self), Steam, Cold (Area), Opposites, Lightning (Place: Rain, then the arc), Freeze and shatter, the strongest leads (Earth + Fire over a pit), Life (heal a wounded dummy without waking the goblin asleep beside it), Shield (walls stop arrows; drag to draw), Arcane (the long beam), Sigil (a flame sword or a turret), then the test (two announced waves). All nine elements and every cast are taught; the end card says "That is the alphabet". The design's beats are kept where they still match the game; the changes and why are in the exploration.
- **A calm start for every beat with enemies.** Nothing hostile stands in the chamber on arrival; enemies walk in through gates on the far walls once you step on the ready stone ahead of the entry (after a 1.5 s warning), or after 8 s by themselves, with the gates warming and a countdown in the prompt box for the last 3 s. A wipe restarts the beat in its calm. The "I know this" stone closes once enemies are in.
- **The whole rune bar from the rune chapter (beat 7):** nine sockets in the normal layout, locked ones empty, each filling in with a flash in the beat that gives it. Chapter 1 still shows no bar (Claude's call: "from the start" of the runes, not of the tutorial).
- **No lore:** every word the player reads is in `client/src/tutorial-text.ts`, per beat a title, prompt lines and an optional done line, as neutral placeholders for the user's wrapper. The Life beat's wounded body is a training dummy, not a character.
- **The test keeps the faint rule** (the design gave it the Arena's downed rules): a wipe restarts its current wave.
- **How it's built:** arrivals are data (`tutorial-data.ts TUT_ARRIVALS`: archetype, gate, delay, softness); the pit is tutorial-only (wizards held at its lip, shots fly over); two `w.tut`-guarded hooks in shared code (the wounded dummy doesn't reset; an enemy shot meeting a wizard's wall counts for the Shield beat). The bot plays all of it through, alone and in co-op (`npm test`); `npm run check:tutorial` also loads every beat in Chrome with the bot playing. Golden hash unchanged (`afcc1d3f`): the tutorial state exists only in tutorial worlds.
- **Open** (exploration questions 1–8): how the calm ends, the skip stone mid-fight, the test's stakes, when the rune bar appears, the Fireball beat also accepting a Fire patch, the dummy as a stand-in, the length, and what's still deferred (per-seat done bits, the F2 row highlight, the picker entries, first-visit landing, the co-op Life beat).

## 2026-11-06: Content direction: our pipeline, with LDtk as the user's editor

From `explorations/2026-11-06-campaign-and-content.md`. The user agrees with the direction (a content package, validators, a map viewer, art from three sources referenced by ID) and adds:
- **LDtk integration, so the user can edit maps too.** LDtk is open source (MIT). No LDtk MCP server or model integration was found (Phaser Editor and PlayCanvas have MCP servers; LDtk doesn't). Plan: the `.ldtk` project, saved one file per level, is the maps' source of truth. Its IntGrid (terrain) and Entities layers are the data the build reads. The build ignores LDtk's baked auto-tiles and autotiles with our own art, so Claude's edits to the JSON need no editor re-save to be right in the game. LDtk gets a preview tileset exported from our baked art, so what the user paints looks like the game. Claude works through a small CLI: IntGrid as text rows for reading and diffs, edits written back, the content check, and screenshots. This supersedes "our own text map format" as the master copy; the text rows become a view of the LDtk file.
- **The art trial adds mainstream image models** (the big labs' general models) next to PixelLab (free tier first; the user finds it pricey but possibly worth it) and Claude's code-drawn art, which the user rates highly and doesn't want undersold. General models don't output exact pixel art, so their drafts go through a downscale-and-palette-lock step we build.

## 2026-11-06: Map pipeline, stage 1: the rooms are LDtk maps (`explorations/2026-11-06-map-pipeline-stage-1.md`)

Built on the content direction above, on Claude's calls (the user can veto any):
- **The LDtk project is the master copy of every room:** `game/content/maps/world.ldtk` with one `.ldtkl` file per level (Sanctum, Arena, Survive, Tutorial), pinned to LDtk 1.5.3 and validated against LDtk's official JSON schema (committed in `game/packages/content/schema/`). The user opens it in the LDtk GUI; Claude edits the same JSON and works through `npm run content -- grid / list`.
- **The game reads two data layers only:** the Terrain IntGrid (unpainted = floor, `1` = rock, whose outline the build traces into merged wall segments) and the Entities layer (PlayerStart with a seat, Dummy, Portal, Altar, and free Rock wall segments with exact `x1 y1 x2 y2` fields for walls off the grid). Only values and entities the sim understands are defined; pits and water come when the sim has them.
- **Scale: 1 world unit = 20 px, one Terrain cell = 10 px = 0.5 u (the sim's CELL).** Pixel positions convert to world units by one integer division, so every coordinate on the 0.05 u grid round-trips exactly. The Arena's computed portal ring carries exact optional `x`/`y` fields; the check fails if they drift more than a pixel from the entity.
- **The sim stays pure:** a node build (`packages/content`, `npm run content:build`) writes `packages/sim/src/rooms.gen.ts`, plain data, committed. `createWorld` reads the room's starts, dummies and rock from it, the wave directors its portals, Survive its altars. `ROOM_DIMS`, `SURVIVE_ROCK`, `SURVIVE_GATES` and `ALTAR_SPOTS` are now views of that data, and a new level is a new room.
- **No change in play:** the golden hash stays `afcc1d3f`, and bot runs in every room (the Sanctum, with and without waves; the Arena, plain and at wave 8; Survive, plain and at wave 12; the tutorial) hash bit for bit the same as before the port. Screenshots of the Sanctum, the Arena and Survive show the same layout and, at the same tick, the same state hash.
- **`npm run content:check`** (also run inside `npm run check` as a test): the schema; references (definitions, IntGrid values, level files, unique iids, entity-reference fields); the rooms compile (four seat starts, three altars or none, at least four portals in the wave rooms, at most 40 rock walls, the share of the 160 wall slots Survive already uses); placement (inside the room, clear of rock) and reachability from seat 0's start on the enemies' nav grid; the generated module up to date.
- **A room hash:** the sim hashes each room's data (`ROOM_HASH`) and all of them (`CONTENT_HASH`); the lobby's host, join and rejoin messages carry it, and a page with different maps can't join. Replays don't carry it yet.
- **Not built (later stages):** a preview tileset in LDtk (it shows flat colours and shapes), the tutorial's per-beat layouts (still `tutorial-data.ts`), doors between maps, the academy, the map viewer page, autotiling art, the AI art trial.

## 2026-11-06: The mock academy room (`explorations/2026-11-06-art-trial-round-2.md`)

The user's answers to round 1 of the art trial:
- Roles: "I think I agree with your recommendation [PixelLab for unique props, code-drawn for tiles/variants/game-state things, Gemini for concept art]. But I don't know if we should do straight-on instead of isometric, I feel like the isometric style makes it easier to see more detail, there's a reason so much games are isometric you know."
- Detail: "I think we can experiment a little here, both with keeping world lower detail, but also maybe increasing detail on wizard?"
- Next test: one mock academy room with the chosen sources together in the running game: "Sure, sounds good."

Later the same day, the user liked PixelLab's style, so `lean` is the likely direction, and set two rules: **every generated result is kept** (raw in `game/content/generated/`, never edited) and **variations are made with local tools, not new calls**.

Built on those, on Claude's calls (the user can veto any):
- **The Academy** (`#academy`, key 5) is a mock room in the running game, listed as an art test, with no lore. It's an LDtk level like the others.
- **A typed `Prop` entity** (asset id, blocks). A blocking prop's footprint compiles to one or two wall segments in the room's `propRock`: static rock that stops bodies and shots, isn't drawn, and counts toward the 40-wall budget. Props carry no other gameplay. The golden hash stays `afcc1d3f`; `CONTENT_HASH` changed.
- **The asset registry's first version:** `game/content/assets/props/<id>/` with `meta.json` (footprint, sets, provenance, the raw file it came from) and images. `content:check` holds it whole, and a generated image must name its raw file. Images are fetched only when a room needs them.
- **Three prop sets, switchable live** (O, `?props=`), and **a detailed wizard** (I, `?wizard=hd`), client side only. `lean` and today's wizard are the defaults.
- **A local variant tool** (`tools/art-trial/imgops.py`, `variants.py`): palette and ramp swaps, moss, wear, repainted contents, part cut-outs, mirroring. Its verdicts are in the exploration.
- **PixelLab images stay trial material:** each `meta.json` says not cleared to ship. Merging puts them on the public page, so that's the user's call to make first.
- **Not decided:** the angle, the detail levels and true isometric are questions on the art trial page (`q-5` to `q-9`). The exploration has the isometric cost write-up.

## 2026-11-06: Art direction: true isometric, PixelLab props, the detailed wizard

The user's verdicts on the Academy Art Trial, rounds 1 and 2:
- **The camera goes true isometric.** q-8: "yes, true isometric camera". This reverses the straight-on 3/4 view of Pixel Battlefield, the art direction chosen earlier. The cost write-up is in `explorations/2026-11-06-art-trial-round-2.md`. Claude recommended trying one room on a branch first, so that's how it starts.
- **Angled props, and angled walls to match.** q-5: "Yeah, angled is better. It seems we can solve this issue by making most walls angled as well? Makes sense for an isometric game."
- **Props stay at full detail.** q-6: "For sure full, the color looks very bad in the simplified version."
- **The detailed wizard wins.** q-7: "Detailed one is better. We'll probably iterate on the wizard look over time too."
- **Art sources.** Ratings: PixelLab object sheet keep; code-drawn cut ("Significantly worse than pixellab"); Pixflux, Gemini Pro and Gemini Flash cut. This is for props. The role split the user agreed to in round 1 still stands for tiles, variants and anything driven by game state, unless they say otherwise.
- **Variants.** q-9: "I think all your variations worked reasonably well. We could potentially start with code variations, and if they're not judged good enough go back to pixellab." The weakest was the cut-out, which changed the plinth's geometry from square to triangular.

**Clarified by the user, same day:** code-drawn art is "developer art": a placeholder for assets that can be replaced later. "I do think we can probably look into pixellab for characters and tiles as well", while "super-dynamic things like spells will probably always be code drawn". This replaces the entry above's line about the round 1 role split.

The plinth went triangular because the orb hides that corner in the source art, so a cut-out has nothing to show there (the user's reading). Parts hidden in a sprite can't be recovered by cutting.

## 2026-11-06: Cold freezes the wet; ice doesn't soak; chill slows attacks

From the user's play-testing:
- **Freeze.** "Applying frost to wet enemies doesn't seem to freeze them, only spells with wet and frost mixed do. I actually think spells with wet and frost mixed should not freeze by themselves. One reason is that freeze is a strong effect... The second is that logically you're freezing the spell. It's like I'm throwing ice spikes at you (hurts but doesn't freeze you), vs getting you wet and putting you in a blizzard." Now any Cold hit on a body that was already wet freezes it, a Cold aura too. Water + Cold is ice: it hurts and chills, douses but doesn't soak, and can't freeze a dry target alone. Claude's call: an ice spell on a target that was already wet does freeze it, since it carries Cold. Stacked chill still freezes on its own. This answers the tutorial exploration's question 2 in favour of its option (b).
- **Chill.** "It doesn't look like chilled enemies attack slower." They didn't: chill only slowed walking. Now a wind-up and recovery slow by the same factor as walking (down to about a third at full chill). A brute's rolling shockwave is exempt, because its age is `aiT`. Chilled wizards' casting is unchanged.
- **Regen aura.** It healed without an event, so no numbers showed. It now reports each heal.
- Golden hash re-recorded: `afcc1d3f` -> `20427aa5`. This makes Cold stronger; the balance harness hasn't been rerun.


## 2026-11-06: Sound, stage 1 (`explorations/2026-11-06-sound.md`)
The game had no audio. The user's direction: "I think Magicka is a good model for sound, we want a similar feel. In general I prefer free sound libraries or packs, and we can use local tools to tune the sounds for variations (top of mind variations could be things like number of runes, or environment (cave vs outdoor), interactions with other elements maybe, sounds behind walls). We can also try out AI sound generation. I imagine this is particularly helpful for things like narration that's too custom, but we can also see if we prefer it for sound effects."
- **Agreed design: sound is built the way spells are.** Each element is a sound layer and each cast shape an envelope or structure, so combinations compose instead of needing hundreds of recordings, and a partner's spell is readable by ear.
- **Built:** a client-only Web Audio engine (`game/packages/client/src/audio/`), driven by sim events and state. The sim didn't change and the golden hash stays `afcc1d3f`.
- **Rollback safety:** one-shots come from shown steps; a replay's events that nothing has played are played after it; sustained sounds follow the state each frame and fade, so a corrected prediction can't click or stick.
- **Variation on every sound:** rune count, room reverb, element interactions, occlusion by walls, pan and distance, random pitch and clip, and a limiter.
- **Sources:** Kenney (CC0) and Wikimedia Commons (public domain or CC0), each licence read at its source, tuned with local ffmpeg; code-made sounds for the rest. `game/content/audio/README.md` is the manifest. Nothing from Magicka.
- **The test is the user's ears:** the Sound Gallery (`tools/sound-gallery/`) is the deliverable. `npm run check:sound` measures what can be measured without hearing.

Claude's calls, which the user can veto:
- **OpenGameArt is out for agents:** its robots.txt disallows Claude's agents by name. The user can add packs by hand. Kenney's files came from an unmodified public GitHub copy, because kenney.nl refuses scripted downloads.
- **Rooms:** the Sanctum and any unlisted room are a hall, the tutorial's chamber a cave, the Arena and Survive outdoor.
- **Ogg Vorbis only:** small and clean at loop points, but Safari before 18.4 can't decode it and falls back to code-made stand-ins.
- **Volumes save to localStorage as well as the URL,** so they survive a fresh visit, unlike the other settings.
- **At most three elements sound in a mix,** the lead on top.
- **Footsteps:** wizards and brutes only. A wave's feet would be noise.
- **A mispredicted one-shot can't be taken back.** It's short, so that's accepted.
- **Audio prepares in idle time after boot, and the first input only resumes.** Doing it all on the first input froze the page for 1.3 s, enough to break a rejoin in `check:net` now and then.

**Follow-up, same day.** The user: "regen aura like the self regen shouldn't heal anyone around you". Built: a Life aura heals its wearer only.

**Proposed by the user, not built:** "both freeze and stun are at risk of being quite powerful. I think we could avoid it by giving stronger enemies some forms of resistance. Instead of freezing being instant from wet+cold, characters have a freeze level that has to build up before they're frozen (and decays otherwise). So concentrated freeze is needed to chill a large/strong enemy. Stun feels a little different, maybe its more probabilistic". This will replace the instant freeze above.

## 2026-11-06: Sound goes depth first (`explorations/2026-11-06-sound-depth-first.md`)
The user stopped the gallery review: "I can't get a page with 100+ sounds to review", and "we probably want to go more depth first on elements, and use the knowledge we gain to build other elements", judged "alongside" the game, compared with Magicka.
- **Element kits replace element-times-shape layers,** one element at a time. Their ratings and the reference agree: an element sounds different for each job. Supersedes stage 1's "sound is built the way spells are" as each element is approved.
- **The Sound Lab replaces the gallery for judging:** in the game on the dev server (`?lab=fire`), five moments, swapping Before, New and a local reference while watching.
- **Fire goes first, and stays in the lab until the user approves it.** The live game doesn't play it yet.
- **Recordings before code-made sounds:** the code-made ones rated worst.

Claude's calls, which the user can veto:
- **The reference is decoded from the user's own copy, kept in a gitignored folder and served only by the dev server.** Nothing from it is in the repo or a build. Our clips are matched to its broad balance, not made from it.
- **CC BY is accepted for recordings,** with a credit in `game/content/audio/README.md`. The game will need a credits page before release.

**Follow-up, same day.** The user on Fire's first kit: "they all sound really bad", and asked to use Magicka's sounds "as a baseline for our spells, and then just fill in the gaps / gradually replace them". Claude advised against publishing them, since the repo and site are public and non-commercial use doesn't make redistribution all right. The user agreed to the local route.
- **The baseline is local:** on the dev server, kits made from the user's own copy cover what they can, and anything else falls through to our sounds (`client/src/audio/baseline.ts`, `?baseline=0` turns it off). It's in the gitignored `.reference` folder and is never in the repo or a build. The public game keeps stage 1.
- **Reshaping recordings towards a measured target doesn't work:** the numbers matched and the user heard "almost like crowd noises". Measurement can catch faults; it can't make a sound good. Replacements should start from recordings or generated sounds that are already the right thing.
- **Fire's own kit stays for now,** unused outside the lab, until the user decides whether anything in it is worth keeping.

**Follow-up, same day: Sigil's first round** (`explorations/2026-11-06-sigil-sound.md`). Nine generated clips were "pretty universally bad", with "a big problem with the sound not feeling like it had any connection with the animation on screen".
- **A sound is for one thing on screen, not for an element.** The user: "we want to be careful with just having like 'a fire sound' because grounding burning should sound different than a flamethrower, and different than a ball of fire". A kit can now give a spell its own sound (`spells`, by the sim's shape), and that wins whichever element leads.
- **Sounds are cut to their animation:** the glyph's etch runs its 0.8 s draw and clicks as it arms; the three rune motes now appear 0.16 s apart, on screen and in sound.
- **Sigil's direction, approved by the user:** magic being written into the world, a sharp, precise stamp or etch with a dark charged edge and a short clean decay; deliberate and mechanical, more a seal locking than a bell ringing, with no long hum.
- **Paid generation waits for an approved description.**
- **The turret waits for a short summon animation** before it gets a summon sound.
- **Turrets are held to place.** The user had trouble placing them and asked for a preview while holding RMB. A turret used to cast on press and land 2.5 u ahead along your aim, whatever the cursor did. Now Force with a turret queued previews it at the cursor while held, and plants it there on release, at most Place's 9 u away; past that the preview stops at the limit and shows the reach. A tap places it too. The golden hash didn't change: no replay casts a turret.

## 2026-11-07: Pillars 1, 5 and 6 reworded; the world is fields (`explorations/2026-11-07-world-and-progression.md`)
The user on the brief's pillar conflicts: "I agree with your notes on pillars. Pillar 5 & 1 is more just capturing how magicka is, but I've rethought it a bit for this game", and "a veteran player has a much bigger advantage in this game than in most RPGs". On pillar 6: "The phrasing here became a little too harsh", after an early agent proposed minigame-like devices the user disliked.
- **Pillar 5 is now "Classic fantasy, told through places; an RPG-paced campaign."** Not cartoony and arcadey.
- **Pillar 1 adds that character growth widens what your hands can do.** Growth raises the ceiling (queues, things at once), not the floor.
- **Pillar 6 allows devices whose input is your spells;** it rules out minigames.
- **The world's premise:** magic runs as fields and veins that shaped civilization like rivers. Life is a living field, Arcane the deep field under the others, and Shield and Sigil are innate: Shield the will to refuse (held by continuous concentration, so it drains while it stands), Sigil the will to shape (holding a shape takes attention, so it binds a rune). The essences are kept in `world/elements.md`.
- **Zones bend regen, not damage.** Enemies in a region attack more with its element; resistance among them is only a splash.
- **The academy sits on an Arcane vein,** which draws out a wizard's innate abilities.
- **Co-op with mismatched progress gets a catch-up mechanic,** designed later.
- **Encounters come from a library of types** (defence in its many forms, native bosses, puzzles...), not a fixed per-region formula.

## 2026-11-08: World and progression, round 2 (`explorations/2026-11-07-world-and-progression.md`)
The user's answers on the World and Progression page.
- **Zones deepen in three bands** (edge, heartland, well) **and only redistribute regen;** total regen never changes.
- **Unlock pacing is U2:** a core set early, some held for story beats. **The queue is five runes from the start;** the user: "You can in theory cast complex spells early, but it would just take you a long time to cast it again". Regen is the lever.
- **What's held back is open.** The user leans to one or two elements and wants an even count; Sigil's rune-hungry mechanics belong later, but swords early.
- **The party is a cohort.** **The story baseline is A + B + D** (the circuit, the shifting fields, the academy's vein), the turn uncertain.
- **The player chooses which pool deepens.**
- **No gear by default;** spell sidegrade customization later.
- **Shield drains harder as it's hit** ("it also drains as it resists change"), as an essence; whether the rules match is for the balance pass.
- **Practice is the meditation sandbox** (the user's idea), not shrines; shrines stay as optional side challenges (puzzle, constraint, keeping first). The Sanctum idea is developing again.

## 2026-11-08: World and progression, round 3 (`explorations/2026-11-07-world-and-progression.md`)
- **Early swords come from the academy's etched focus:** Sigil works only with Conjure until the art is learned. The user is wary of how a non-Conjure cast with Sigil queued reads; options in round 4.
- **Rune pools start at 1** and grow to at most about 5. Both pools and regen grow.
- **Meditating is allowed only when no enemy is engaged.** In the dream you can't die, only what you've unlocked is there, and regen matches your current zone.
- **Veins exist in the world only,** with no direct gameplay effect.
- **Cancelling elements can share ground in the world,** case by case (rain and lightning together, but not fire and frost). Round 2's "opposites never meet" is withdrawn.
- **The tenth element needs a brainstorm** before Air is chosen (`explorations/2026-11-08-tenth-element.md`).
- **The world map:** try a few approaches, starting from an Azgaar base with our overlay.

## 2026-11-08: The world map's scale and look (`explorations/2026-11-08-fantasy-map.md`)
- **The world is one continent with several regions** (Field Atlas Q3).
- **The map should have a fantasy feel,** like an inked fantasy map rather than a diagram (the user's brief). The Field Atlas now paints that way; whether it's the right route is open (Q5).

## 2026-11-08: The world map, round 3 (`explorations/2026-11-08-fantasy-map-round-3.md`)
- **The map approach is the fields-first generator, then paint over a kept seed** (Field Atlas Q1). The user passes the laid-out map through an image model to enhance the painted feel; lettering stays out of that pass and goes back on afterwards, since the model garbles it.
- **Both looks stay:** the Chart for players, the field view for design (Q2, Q7). On the Chart, the land itself must make plain which field is strong: the user's note on Q7.
- **Places get generated made-up names** (Q6), withdrawing "no proper names" for the map. The world's lore stays the user's.
- **Every field holds its own ground on the map, Arcane included.** Rifts stay as Arcane's landmark.
- **The north runs off the map** as uncharted frozen land.

## 2026-11-08: Map art painted one subject at a time is rejected (`explorations/2026-11-08-map-art-trial.md`)
- **Rejected: generating map assets in isolation and placing them by code.** They read as stickers, not integrated or hand-crafted. Integration has to come from painting the map as a whole.

## 2026-11-08: The map pipeline is seed, then painting, then labels (`explorations/2026-11-08-map-art-trial.md`)
- **Generate a seed image, have an image model paint a beautiful map from it with real freedom, then label the world from what the model painted.** The seed is inspiration, not a layout to preserve. This replaces "keep the layout exactly and lay the lettering back on".

## 2026-11-09: ChatGPT paints the world map, in two passes (`explorations/2026-11-08-map-art-trial.md`)
- **ChatGPT replaces Gemini for the painting, run by hand in its own app.** On the same sketch and prompt it gave better craft, scale and fidelity to the sketch. A second message in the same chat fixed the specific gaps (edges, fen, signature landmarks) without losing the world.
- **Labels are placed on the painting in `tools/map-labels/`,** with generated names as starting points to reroll or replace.

## 2026-11-09: The story's spine isn't a rival system (`explorations/2026-11-09-story/`)
- **Rejected as the story's spine: "Your Go" and its rival system,** although the blind judges ranked it first. The user likes its creativity, but: the tone is too goofy and slapstick (the vision asks for a light touch); it depends on strong character building to make the rivals likable, and on making PvP battles fun; and getting spells from losing is at odds with the casting system, where spells are composed from runes the player already has.
- **Which story to carry forward is still open.** The user is reading the others.

## 2026-11-09: Wells are built, and the four story candidates reviewed (`explorations/2026-11-09-story/`)
- **Wells are constructed, not natural.** The user: "It seems like a constructed element, not necessarily emergent in the world. Like a civilization can choose to build a large well, but there could be smaller ones too." This replaces the round-2 definition of a well as the place where veins surface by themselves. Great wells and small ones both exist.
- **Attuning doesn't need emphasis.** "It seems like a fine motivation, but we can have others."
- **A special year or event with the fields appeals, but fields actually moving is out.** It's apocalyptic for civilizations built around a field, and "a nightmare for building maps". This also weighs against the "shifting fields" part of the A + B + D story baseline.
- **Promises:** befriending an area's people is okay, a ledger of kept and broken promises is "a little... meh". A reputation system with civilizations, perhaps picking one over another, could work. Moving non-linearly through the world is acceptable but "needs a cohesive vision".
- **The case:** "kind of interesting", but lacks "the connection to you as a wizard". The story needs that connection.

## 2026-11-09: The story's hook is a year when the veins shift (`explorations/2026-11-09-story-direction.md`)
- **A special year when the fields behave oddly is the hook.** Veins shift, magical defences lose power, and new territory has to be claimed to build wells on strong sources. It's the reason to go out and explains the world's conflicts.
- **No explicit circuit.** This replaces the journeyman's circuit as the frame: "you get sent out into the field to solve an issue, this naturally gives you experience and mastery and brings you to new regions."
- **Linear travel, region to region. No reputation system.**
- **Wells are magical infrastructure, and the player isn't a wizard engineer.** Legendary builders can exist as colour, like a legendary swordsmith.
- **Why the veins are shifting stays unanswered for now,** and people in the world speculate: natural, a big wizarding group doing something nefarious, or a big bad doing something evil.
## 2026-11-07: Rune scaling audit: four fixes, and a +1 rune line in F2 (`explorations/2026-11-07-rune-scaling.md`)

The user asked for an audit of how spells scale with extra runes, and for it to be in the help panel. Measured with `npm run scaling` (`game/tools/scaling.balance.ts` → `scaling-report.json`).
- **Built on the recommendation** (revise freely):
  - Ice shards each fly at `SHAPES.shardPower` (0.75) of the payload. The loop variable used to shadow the scale, so shard *i* hit at 0.3 × *i*.
  - Arcane is on the +70 % rule in every form, so extra Arcane now strengthens a nova and a blast. A beam's form element counts once (a `flatForm` hit option), which keeps "beams last longer instead of hitting harder" for Arcane.
  - The same rule now holds for the Life beam, which had grown with n² (more healing per second *and* longer).
  - Water's own spray and splash push (6 u/s a Water rune), as the rules text says; Rain, steam and ice don't.
- **Kept, now visible:**
  - Fire's √n curve: Fire is the mix-in, because its Burn and floor don't grow.
  - The spring's n × (4 + 2n) healing.
  - Earth's n^1.5.
  - Auras that don't grow.
- **The F2 panel** shows, with numbers on, what one more rune of the lead element changes. Its numbers now come from `spellNumbers()`, which mirrors the sim. That fixed the arc (25/s a Lightning, not 10), the beam and spray reach, the beam's free time, the geyser's 1.3× and the spring's healing rate.
- Golden hash `20427aa5` → `2f804c92`: the four mechanics changes above.
- Open: q-1 Fire stacking, q-2 the spring curve, q-3 Ice shards' tuning (all with recommendations in the exploration).
## 2026-11-07: Outdoor art, Tier 1 and painted ground (`explorations/2026-11-07-outdoor-art-kit-results.md`)

- **PixelLab Tier 1.** The user took the $12 plan: 2,000 generations a month, no rollover. The sign-off rule stands.
- **The outdoor list was approved and bought,** 70 generations: 3 + 1 ground sets, isometric corner and path sets, 96 objects, 2 trees.
- **Painted ground, built on Claude's recommendation:** the plan is a terrain map painted through the camera, not ground tiles. The isometric tiles were tried and looked worse. Nothing of this is in the game yet, and `q-1` and `q-2` on the page can overturn it.
- **Scatter is halved locally,** because the sheet fills its canvas whatever the subject.

## 2026-11-09: Play-test bugs: Area floors, the staff hand, ice shields, a drag undone

The user's bug list from play.

- **An Area cast leaves no floor.** A nova or quake used to lay water, fire or frost round the caster, which then soaked or burned them. Place is what makes floors now; Place patches and Rain are unchanged, since they're aimed away from you and their lingering is [a decision of its own](#2026-11-05-lingering-effects-last-as-long-as-they-look). The golden hash moved, `2f804c92` → `e19c4685`, because the scripted run taps Area with Fire and Water + Cold.
- **A conjured weapon replaces the staff, in the staff's hand.** It used to be drawn in the same hand the guard hangs from, with the staff still showing. The wand counts as a weapon. Spells cast while holding one gather at the hand.
- **Shield with Water and Cold is drawn as ice.** Curtains (Area and Place) are a row of still, faceted crystals, the wave is a front of ice spears, the ward has crystals round the feet. Visual only: the sim already treated the mix as ice. The F2 panel still calls these spells by their Water names (Tidal wave, Tide shield).
- **Bringing a drag back to its start undoes the line.** A wall goes back to the arc and a line glyph to a glyph, and it stays a Place rather than turning into a tap's Area.
- **Shield radii are the user's to find.** `structures.arcRadius` (2.2) and `structures.ringRadius` (1.5) were already sliders in the tuning panel (F1); they now have help text, and the defaults wait for the value the user settles on.

## 2026-11-09: Fire's one-shot casts hit up front; the burst beats the ring

The user: the Fire ring has little reason to exist next to the flamethrower, its visuals are boring and its damage small. Built on Claude's recommendation; the user can veto or retune it (both numbers are F1 sliders).

- **What the audit found.** Fire's direct table damage (6) is a spray's per-second rate, so a one-shot cast dealt 6 and the rest was a fixed 30 burn: totals of 36, 38 and 40 for 1, 2 and 3 runes (Earth: 22, 62, 114). Removing the ring's floor in the entry above took away part of what it had left. And the imbued burst (Shift+LMB) did the same single-target damage as the ring (Shift+RMB tap) over a smaller area, in every element but Lightning.
- **Fire ring and Fire burst:** the direct hit is doubled (`shapes.fireBlast`, 2) and pays +70 % a rune as Arcane's nova does, not the spray's square root. Ring totals are now 42, 50, 59.
- **The burst hits 1.5 times as hard as the ring** in every element (`shapes.imbuePower`), so the choice is a cone's punch against a circle's coverage, and it spares allies behind you.
- **New visuals:** the ring has a white-hot flash, a tall double front of flame, thrown embers, smoke and drawn scorch marks (no floor); the Fire burst has a muzzle flash, a fan of flame and a scorched wedge.
- **Golden hash** `e19c4685` → `b29ab7f1`: the scripted run taps a Fire ring.
- **Open:** how burning itself should work; see `ideas/burn-by-damage.md`. Other elements' rings are not touched: Cold's is also weak (5, 7, 9) and Water's does no damage by design.

## 2026-11-09: The burst keeps the ring's power; Cold's first pass

- **The 1.5× burst above is reversed.** The user: the burst's benefit is that friendly fire is easier to control, even if its damage potential is lower. The audit's "no reason to pick it" ignored that. `shapes.imbuePower` is 1 and stays a slider.
- **Cold's ring and burst, first pass, built on the user's ask for a balance pass on its initial damage:** the direct hit is 1.6× its table rate (`shapes.coldBlast`) and pays +70 % a rune, for 8, 14 and 19 against Fire's 12, 20 and 29, with no burn on top. Cold is meant to be the weaker damage; its essence is the slow. Frost spray, the frost sheet and Ice shards are unchanged. The golden hash didn't move (the scripted run has no Cold-led ring or burst).
- **Open:** strong enemies should be harder to slow (the user), and today chill builds the same on everything.

## 2026-11-09: Direction for Fire and Cold (`explorations/2026-11-09-fire-and-cold-status.md`)

Direction from the user; not built yet.

- **Fire must not end up as it did in Magicka,** where it had little besides raw damage while Wet powered Cold and Lightning.
- **Chill builds more slowly on stronger enemies, and slows on a sliding scale up to a cap.**
- **Water + Cold freezes, but needs a minimum chill, and freeze length may follow chill. Chill decays.**

## 2026-11-10: Burn and frost pools built; Fire stays pure damage

- **Element roles (the user).** Water is primarily synergy, with some knockback. Frost has the biggest crowd control and less damage, except freeze and shatter. Lightning has good damage, a bit chaotic in where it lands, with some stagger. Fire is the best overall damage, harder to synergize, harder to get full value from over time, and you risk setting yourself on fire. Recorded in `world/elements.md`.
- **Rejected for Fire:** Consume (Fire spending Wet or Chill for a burst). Fire's anti-synergy is intentional: it's how players get in each other's way in co-op and something to plan a kit around. Panic: the user prefers the pure damage, since control would make Fire more like the others.
- **Burn pool built:** lit for 12, plus all of Fire's own damage and a quarter of the rest, capped at 60, spent over 4 s. Ring totals are 36, 53 and 70 for 1 to 3 runes.
- **Frost pool built, on the user's design:** a hit's Cold damage fills a hidden pool of 2.5 × √max HP. Scaling by damage over runes because it prorates mixes without a special rule (Arcane + 2 Cold chills twice as hard as 2 Arcane + Cold). The pool drains 10 % of its size a second with no grace period, so a weak source stalls on a tough body and it takes a stronger one or a second caster. Cold never freezes without Water. A freeze needs 30 % chill, lasts 1.5 to 4 s by chill, and uses up the chill and the wet.
- **Health bars:** a 1 px chill strip, and an orange section for what the burn will still take (a trial; may not stay).
- **Bug fixed:** the last hit's kind lived in a module variable outside the snapshot, so a rollback could desync `lastKind`. It's reset each step.
- **Golden hash** `b29ab7f1` → `ef369733`.

## 2026-11-10: Freezing works in either order; a Water spray soaks for longer

From the user's play-test: Cold and a Water spray wouldn't freeze a Brute, but a puddle did. A spray's Wet lasted 2.4 s, shorter than a tough body takes to chill, and only a Cold hit could trigger the freeze.

- **Every soaking hit leaves a body wet for at least 6 s** (`status.wetMin`).
- **A Water hit on a body at 30 % chill or more freezes it,** so Cold and Water work in either order. Stepping into a puddle doesn't count: only a hit does. Ice (Water + Cold in one spell) still can't set up its own freeze.

## 2026-11-09: Casting is new, and you fix infrastructure (`explorations/2026-11-09-opening-and-innate-casting.md`)
- **Innate casting is a result of the shifting veins.** Before, wizards used structures that tap fields. The academy's Arcane vein is why these characters can do it.
- **The academy is an analogue to an engineering school. Engineering is your job, not the gameplay.** This refines "the player isn't a wizard engineer", which was about the gameplay.
- **You fix infrastructure, not veins:** "An earthquake has broke a dam, and we need to build a new one where the river now goes."
- **Instant devices are different from built structures:** you are the well that powers them, which is why turrets come later.
- **Melee alone isn't enough to stay in for long.** The tutorial segment lasts until the base set of runes is unlocked.
- **The approved story now lives in `campaign/canon.md`,** with a staged process for segments in `campaign/README.md`.
- **Not decided:** the opening's exact outline, which the user wants to try in a few versions (`campaign/01-opening/brief.md`).

## 2026-11-09: The ground painter, and the first general art for the opening (`campaign/01-opening/space.md`)
- **The user asked for work that holds at any map scale, and authorized buying art that's very likely to be used** ("various ground, wall textures. General assets that will fit this vibe"), while unable to review in detail.
- **Built: a ground painter.** A client-only Ground layer in LDtk, painted per pixel through the camera, as the Outdoor Art Kit's mock proposed. It keeps the golden hash and every room hash. No room uses it yet.
- **Bought (113 generations, 1,930 → 1,817):** four pro ground sets, two wall kits, the academy and field works sheets, three buildings, and a clutter sheet of 64, which Claude added. All listed on the Opening Blueprint.
- **Held back: the defence itself,** as specific to this segment and unreviewed.
- **Found:** the kits' floors show a diamond grid, so the painter should do floors; 32 px stone reads large against a wizard; the gatehouse came out straight-on.

## 2026-11-09: The isometric camera, on trial; ground transitions and variation
- **The true isometric camera exists behind `?camera=iso`,** off for everyone else. The user decided on isometric on 2026-11-06, with one room on a branch first. It's done by handing the view a copy of the world turned 45 degrees (`client/src/iso-world.ts`), with the ground squash at 2:1, so the sim, netcode and drawing code are unchanged. Stick input turns to match.
- **Not handled yet:** the tutorial's overlays, which draw from fixed room positions, so `#tutorial` isn't right under it. The help panel's previews stay straight on, on purpose.
- **Ground transitions (the user: "transitions between floor materials too, and many ways to give variation"):** per-material edge styles and layered variation, as in `game/content/README.md`. Three more ground sets bought for alternates (45 generations, 1,817 → 1,772).

## 2026-11-09: Scene lighting, on trial with the isometric camera (`explorations/2026-11-09-lighting.md`)
- **Built while the user couldn't review,** after they found the look "a bit intense": moods per room, cast shadows, lamps on props, cloud shade, and a colour grade. On with `?camera=iso`, off with `?lighting=0`. The public game doesn't have it.
- **The user's notes that led here:** the stone floor's scale is fine; the grass was too busy (quieted).
- **Researched, as the user asked,** rather than from memory; sources are in the exploration.

## 2026-11-09: Isometric is the only camera; walls and spells in the lighting (`explorations/2026-11-09-lighting.md`)
- **The straight-on view and the old code-drawn floor are removed** (the user: "we can probably just kill the non isometric stuff. I dont want you to have to duplicate work"). The tutorial and help previews work under it. This reaches the public game when the branch is merged.
- **Walls stop light and their faces catch it; beams and sprays light along their whole length** in their own colour.

## 2026-11-09: Room walls from the building kits
- **The Academy's walls are the bought school kit;** far walls stand tall, near walls are cut low so the room stays visible. Asked for by the user ("Let's do the wall kit thing").
- **Survive keeps its drawn walls** (Claude's call): tall kit walls hid the action in the open arena, cutting them low looked like fences, and its angled walls have no kit pieces.
- **The fortification kit waits for the battery,** where a tall defensive wall is the point.

## 2026-11-09: Sprays and arcs stop at walls
- **Sprays end at rock and barriers** like beams do, wear them down at the beam's rate, and don't hit anything with a wall between it and the caster. The user: "sprays should not ignore walls", and "ideally sprays would react with walls in some natural way".
- **A spray spreads along the wall it hits:** fire licks sideways and up the face, water bursts and runs down, frost grows, steam billows. Drawn only on the face the camera sees; a spray on the far side is hidden by the wall.
- **Healing sprays don't wear walls down** (Claude's call).
- **Lightning arcs follow the same rule** (Claude's call, not asked for): neither the first strike nor a jump passes a wall, and a crackle into the air stops at one. Otherwise a bolt hidden behind a wall would still hurt what's on the other side.

## 2026-11-09: A continuous world is the goal, and waits (`explorations/2026-11-09-continuous-world-todo.md`)
- **The world won't stay a set of discrete rooms, and the 40-rock-wall cap has to go.** Not now: "I think we don't need to tackle this problem right now, but we should write down some sort of TODO for it." It gets its own session, away from the thread building the world.
- **Players stay reasonably close,** and mechanics can help enforce it (the user). Which mechanics is open.

## 2026-11-10: One working document per segment; the opening's first pass stops at the battery
- **Beats 8 on are on hold** (the user: "There's a lot to build and refine up to the battery").
- **Each segment gets one working artifact,** in `tools/segments/NN-name/`: `index.html` is the shared layout and `segment.js` the content. One chapter per place, holding its beats, its map and what's unsolved there. The user asked for this; the layout is Claude's. Artifacts stay, because answers sit next to what they ask about and Claude can read them back. The Opening Blueprint became the first one. Its lighting and bought-art sections came off: they had no notes, and art is judged in the scene (the images stay in `tools/segments/01-opening/img/`).
- **Notes are per round.** Once folded in, a note moves into the page as settled or to solve, and the boxes start empty under the next round's ids. Earlier notes stay in the db.
- **A defence reaches only a bit further than a person** (Claude's number, about 6 units against 4.5; the user: "not so long as to make it feel like it's not the same spells"). Range comes from Place.
- **The battery is built first** (the user).
- **Walks vary and some are long.** The user: "I think you should sometimes walk a bit before something happens, because it makes the world feel more real." This replaces the 5 to 15 second rule.
- **What you can see depends on direction,** as the user pointed out: least straight down the screen, then straight up, and most into the corners. The old "14 ahead, 8 behind" only held for straight up and down.
- **The first job's well was destabilized and needs repairs,** in place of the moved vein (the user's suggestion; in `canon.md` under review).

## 2026-11-10: Terrain is read-only room data, with no per-room limit (`explorations/2026-11-09-continuous-world-todo.md`)
- **Merged 2026-11-10.** The user asked for the wall limit to be fixed now and streaming left for later. Terrain is out of rollback state, on a 2-unit grid, and the checker no longer caps it.
- **Players always get all 160 cast-wall slots** (a side effect, Claude's call). Before, Survive left them 120 and the Academy 122. Only shows above those counts.

## 2026-11-10: The battery's plan, from the Opening Segment page, round 2
- **One lane per player, and each wave built for one Fire attack.** Claude's proposals; the user: "agreed".
- **The transition** is the storyboard on the page, ending in a line like "You've learned to channel fire" (the user's words). The rune's arrival gets a special animation, and is very visible on the bar. The bar looks different while operating a defence.
- **The charged focus stays** (the user: "Good to learn this before you go out. And you can revisit some stations with the blade").
- **Whether the blade needs a prompt is a playtest question:** a prompt may be overbearing, and with no hint players may struggle. Subtler hints are an option.
- **The repair:** you take part, or do it yourselves, with a simple "press X to stabilize". A fade to black and back, and the well has changed. Wells need three looks: Unstable, Drained, Stable.
- **Wells have no single design,** only things in common. In the world they differ in size by orders of magnitude, and the ones we play around stay roughly similar.
- **The defence is approved.** The user asked for rotations, so it's bought as candidates, then eight rotations from the best one, then a broken state.

## 2026-11-10: The defence is a flamethrower with a head that turns
- **It faces north-east and swings about 45 degrees either way,** so it needs three facings, not eight (the user). Only the head turns, on a central collar, and the tower stays one image.
- **Flamethrower, not cannon** (the user: "flamethrower is more the identity of the base fire spells"). The first four towers and their rotations are kept but unused.

## 2026-11-10: A well holds up a column of light
- **Not a literal well** (the user, with concept images). The basin proposal is dropped: wells are structures of stone and brass framing a column of light that rises out of the ground.
- **The battery's well is proposed as an armillary on a plinth, in orange,** and isn't bought yet. Its colour is the user's call, since their images are blue.
- **A well's colour follows the magic it extracts** (the user), so the battery's is orange. It still needs the Approve mark before it's bought.
- **The burnt-out defence keeps a rigid barrel** (the user: a physical barrel wouldn't change shape), and the whole structure goes darker with no flames.

## 2026-11-10: The battery is an outdoor area
- **Not a room** (the user). It has no walls round it. Woods stand on every side and carry on past where you can walk, painted into the ground, since nobody can reach them. The fortified wall runs through the middle, so it stands full height and whatever is north of it draws behind it.
- **The defences are 11 units apart, not 7.** A tower is 6 units wide on screen, so at 7 they overlapped and one stood in front of the gate. All four still fit one screen.
- **The well is bought:** candidate 2 of 4 is in place as a stand-in, the rest are kept.
- **More air** (the user: "very cramped"; tower size is fine). The area is 84 x 72, the defences 13 apart, the rear yard half as deep again. This replaces the 11 above. All four towers no longer fit one 1080p screen, which matters only for four players on one couch, and is open on the page.
- **The gatehouse is re-angled, not rebought.** Sheared 2:1 to run along the wall, doors swung open, no generations spent.
- **All four towers don't need to fit one screen** (the user), so the spacing stays.
- **The gatehouse gets thickness** (the user: it looked flat). Its front is extruded back through the wall by hand, with lit tops and shaded brick sides, still with no generations spent.
- **The gate is built from the wall's own kit** (the user: its colour and brickwork didn't match, and the doors looked flat). It replaces the re-angled gatehouse. Two block pylons and a stone span, with no doors for now. An arched version is written up on the page, optional. Cobble is now sampled along the ground's angle, as it looked top-down.
- **The gate is a wall of fire** (the user: Shield + Fire + Fire, "it fits with the theme"). It's the game's own curtain, owned by the place, so it never drains anyone. That it goes out when the well runs dry is a proposal on the page.
- **The kit-built gate is a stand-in.** The user found its square shapes clunky. A set of outdoor fortifications is written up on the page, not bought.
- **The wall of fire goes out when the well runs dry** (agreed with the user), at beat 6, which is how the enemies get through at beat 7. The fortifications are approved; the gate can be two pillars or an arch.
- **The battery has its own fortress kit,** in sandstone that matches the defence towers (10 generations). The gate is two pillars from it with the wall of fire between them (the user: it needn't be an arch), so the gate tries weren't bought.
- **The fortress reads as one build** (the user: clipping at the pillars, an abrupt join at the towers, tones that didn't match). The kit is colour-matched to the towers piece by piece, the towers' orange glow is much weaker, the wall tucks behind each tower, and the pillars stand forward of the wall.
- **The gate's pillars are two separate props** (the user caught one sprite drawing over wall that should be in front of it), each sorted by where it stands, and each blocking.
- **The towers stand against the yard side of the wall** (the user: the wall-to-tower join looked bad either way). The wall runs unbroken behind them, with no forced draw order. Since sprays stop at walls, a defence's fire will have to clear the wall when driving is built.
- **A defence's spells are adjusted for the wall** (the user): a longer flamethrower, burst and wave casts landing outside the wall, and no full circle, since it makes no sense on a defensive line.
- **Driving a defence is built** (`game/packages/sim/src/battery.ts`). X at a pedestal. Your cast point moves just outside the wall, so spells clear it, and your wizard is drawn where it stood. Fire only, a 7.5 flamethrower and a half-ring reaching 7 (the wall hides about 4 units of ground behind it). Numbers are first guesses.
## 2026-11-10: Novas are one surface, not a row of pieces
- **Each single-element Area cast is drawn as one connected surface travelling outward** (`art/novas.ts`). The user on the fire ring: "I don't like how it looks like a bunch of discrete candles being pushed out. It should be more like a wave of flames", then "in fact, all the single element novas look bad". The same complaint as the fire patch in the Spell VFX gallery ("very clearly N fire patches").
- **Each element gets its own shape** (Claude's call): Fire a leaning wave with its body burning behind it, tearing apart in patches. Water a rolling swell with spray. Cold a serrated ice front over spreading frost, shattering where it stops. Life a see-through veil of upright threads with rising motes. Arcane a hard, fast hoop with knots running round it.
- **Earth's quake and Lightning's discharge are unchanged:** they never used the ring of dots.
- Only the drawing changed: radius, damage and timing of the casts are as they were.
- **Playtest of driving, first pass** (the user's notes, `explorations/2026-11-10-battery-playtest-todo.md`): the swing is 80 degrees each way, reach depends on screen direction, the view leans out over the field, placed spells have their own range, and a device has its own bar.
