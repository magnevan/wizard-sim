# Decision log

Append-only. Each entry records the date, the decision, why it was made, and the alternatives that were rejected. If a later entry reverses an earlier one, link back to it.

## 2026-11-02: Repo is design-first
The repo holds docs and throwaway prototypes, and there's no production codebase. The pillars in `vision.md` guide every proposal.

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
- **Upkeep rule: stuff costs once, energy costs upkeep.**
  - Stuff (Earth or Ice walls and the like) is paid from the queue and exists until it breaks.
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
- **The sculpting wand stops your spells from harming allies, but not the burning ground they leave.** The floor is the world.
- **Shield alone on yourself is a mirror ward** that turns back the next 3 shots. A barrier of Shield alone turns shots back at whoever cast them.
- **Not in the engine yet:** the Shield conjures (Bulwark, Buckler) and the Double. Both are in the rules; the engine shows a "todo" event when you cast them.
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
