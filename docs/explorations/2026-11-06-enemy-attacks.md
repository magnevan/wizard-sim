# Enemy attack animations (2026-11-06)

The user: "Do a pass over enemies attack animations. It looks like some enemies don't have attack animations at all."

They were right. Only the brute had a real attack (fists raised over the wind-up, then slammed down), and the archer drew its bow. The goblin, shieldbearer, fire imp and grabber only stretched their body by a fifth while a red cone filled in front of them. Then nothing happened: the hit landed on a body standing still. This pass gives each of the six a readable attack in four beats: a **telegraph pose** held for the whole wind-up, a **strike frame** with a smear, an **impact or release**, and a **recovery**.

Pillar 4 (room to think) is why the telegraph matters most. Every dangerous attack already has a 0.6–1.2 s wind-up in the sim (`archetypes.ts`). That gap is only room to think if you can see it. A red cone on the floor tells you *where*. The body has to tell you *who* and *when*, at a glance, in a crowd, from any side.

## Audit: what the sim does, and what was drawn

Times are from `ARCHETYPES` (`game/packages/sim/src/archetypes.ts`). Behaviour is in `enemies.ts`. In the sim, every attack is `approach → windup → (strike tick) → cooldown`. The grabber adds `dash` and `grab` after its wind-up.

| Enemy | Wind-up (telegraph) | The hit | After (cooldown) | Drawn before this pass |
|---|---|---|---|---|
| **Goblin** (swarmer) | 0.6 s, starts when the gap ≤ 0.3 u. It stands still. | Melee at the end of the wind-up: 5 dmg, knockback 3, if the target is within reach + 0.45 u and in front (±68°). Otherwise it hits a rock wall it is pressed against. | 0.9 s, creeping toward the target at 30 % speed. | Red ground cone and a 20 % stretch. **No arm or weapon motion, no strike, no recovery.** |
| **Brute** | 1.1 s. A 2.1 u circle locks on the target's spot when the wind-up starts. | A slam at the locked spot: 38 dmg, knockback 16, to everyone in the circle (friends too). It breaks rock there. A `burst` event fires. | 1.8 s, creeping. | Orange ring filling. Fists rise overhead over the wind-up and come down over 0.5 s. The `slam` effect from the burst draws cracks and a dust ring. **The strike timing was the view's own memory of the AI changing state.** It also fired when a stun *interrupted* a wind-up, so a stunned brute mimed a slam that never happened. |
| **Shieldbearer** | 0.8 s. It turns slowly (flank it). | Melee like the goblin: 18 dmg, knockback 8. | 1.2 s, creeping. | Red cone and a stretch. **The shield never moved.** |
| **Archer** (caster) | 1.0 s. For the first 55 % it tracks the target, then the aim locks: that is the dodge window. | A missile at 6 u/s, 20 dmg (Arcane, pink). | 2.4 s, keeping its distance. | Dashed green aim line. The string drew back in 4 steps. **At the release the string jumped back to rest. There was no release frame and no sign the aim had locked.** |
| **Grabber** | 0.8 s. It tracks for 55 %, then locks. | A dash at 12 u/s for 0.55 s. A wizard it touches is held 3.5 s and dragged to the edge, then thrown (13 dmg, knockback 9). 25 damage, a Yank, a stun or a freeze breaks the hold. | 3 s. | Dashed teal line and a stretch. During the dash and the hold, its arms reached a little further and it played its walk cycle. The victim wriggled. **There was no coil, no lunge pose, no catch, and nothing showed how long the hold had left.** |
| **Fire imp** | 0.6 s. | Melee: 9 dmg, knockback 2, and it sets you burning. | 1.0 s. | Red cone and a stretch. **No fire at all.** |

The table covers every archetype: `ARCHETYPES` has these six plus the empty `none`.

## What each one does now

Everything is read straight from state the sim already keeps per body: `ai`, `aiT` (ticks in that state), `lockX/Y` and `holding`. The cooldown begins on the strike tick, so "time since the strike" is just `aiT` in the cooldown. Nothing is remembered between frames. The pose is a pure function of the sim state, so a rollback that rewrites the past redraws correctly. **The sim is unchanged and the golden hash stays `d13d22ff`.** No new state was needed. That also fixed the brute's false slam after a stun.

Every goblin-sized body crouches into its wind-up and stretches into the blow. It leans back while it coils and forward into the strike, and steps its front foot in. That reads from any side, even when the weapon is hidden behind the body.

- **Goblin.** Each of the three weapons has its own move.
  - **Club:** raised back over the shoulder for the whole wind-up, then brought down in front, with a white arc smear.
  - **Dagger:** drawn back, then stabbed out, with a white thrust streak.
  - **Spear:** levelled and pulled back, then thrust its full length, with a long streak.
  - All three get a small white hit star at the tip, and the off hand counter-swings. Recovery takes 0.3 s.
- **Brute.**
  - **Wind-up:** it rears back under its raised fists. The fists already rose over the wind-up; that pose is kept.
  - **Strike:** one tick mid-swing with a smear down each arm, then the fists hit the floor and its body folds over them.
  - **Impact:**
    - a white star and a closing shock ring at the slam's centre, and a big light;
    - **a crack that runs along the floor from its fists to the slam's centre** (the slam lands 2.6 u ahead, further than its arms reach, and the crack makes the link readable);
    - chunks of floor thrown up and dust rolling out round the impact (in the world, not on the screen);
    - a 2.5 px screen shake for 0.25 s.
    - The existing `slam` cracks and dust ring still play from the sim's burst event.
  - **Recovery:** the fists stay down for 0.3 s, then rise over 0.6 s.
- **Shieldbearer.** It pulls the shield in and leans back for the wind-up. For the bash it shoves the shield out with a lunge: the rim and boss flash, a white shock crescent comes off the shield's face, and dust kicks up from its feet. Recovery takes 0.4 s.
- **Archer.**
  - **The draw:** it pulls the string back over the whole wind-up, as before.
  - **The lock:** once the aim locks (the dodge window), **the arrowhead glows pink with a small light.** This answers "when do I dodge" from the archer's own body as well as the aim line.
  - **The release:** a puff of pink and white sparks at the bow. The string goes white and snaps forward past rest, back, forward, then settles over 0.36 s, while the bow arm recoils.
- **Grabber.**
  - **Coil:** it crouches, its arms flung back and wide with the claws splayed.
  - **Dash:** both arms are thrown far forward and the body leans into the lunge, with speed lines trailing it and dust off its feet.
  - **Catch:** a white flash where the claws close. During the hold its arms clamp shut on the wizard and squeeze.
  - **The hold timer:** a ring on the floor round the held wizard closes as the throw nears. It turns from teal to gold at half time, then blinks red and gold in the last quarter. The throw is the damaging moment, so this tells the held player and their partner how long they have to break it.
- **Fire imp.** For the wind-up, its claws come up to its mouth. Its mouth, its claws and its crown flame glow brighter and brighter, with embers rising and an orange light growing. Then it flings its claws forward and **spits a short gout of flame** out to the end of its reach, with a flash of light. Recovery takes 0.3 s.

The ground telegraphs (red cone, orange slam ring, dashed aim lines) are unchanged.

## Code

- `game/packages/client/src/art/enemy-attacks.ts`:
  - `attackK()` maps the sim's state to a quantized attack pose: −1 none, 0..0.5 the wind-up, 0.55 mid-swing for one tick, 0.6 the strike held, 0.6..1 the recovery.
  - `drawAttackFx()` draws the smears, sparks, flame, cracks, dust and the hold ring into the field canvases.
  - Per-enemy strike-hold and recovery times are in `BEATS`.
- `art/rigs.ts`: `RigState.atk` and `hold`. `drawGoblin` has per-variant wind-up and strike poses with lean, lunge and stance. `drawBrute` leans with its slam.
- `view.ts`: the poses now come from `attackK()`. Its old `prevAi` / `attackT` memory is gone.
- `?scene=enemyattacks` (in `demo.ts`, with a headless loop such as `npm run shot`): every enemy frozen at one beat, with the sim not stepping.
  - `&phase=` takes `wind`, `strike`, `impact`, `recover` or `loop`.
  - `&face=` sets the facing in turns.

## Trade-offs

- **The frame cache grows.** Each enemy now has about 13 attack poses per facing (8 wind-up steps, mid-swing, strike, recovery steps). These are painted on demand and capped, like every other rig state. A crowd of goblins winding up in step still shares frames.
- **Smears draw over the body**, because the effects layer sits above the actors. For a tenth of a second that reads as motion blur, not a layering bug.
- **The brute's fists and its slam are 2.6 u apart.** The crack papers over this. The honest fix is to give the brute a reach that matches its arms, or a shockwave that travels, and that is a gameplay change for the user.
- **More motion on screen.** Every attack now has a flash at the strike. In a crowd of ten goblins that is a lot of white. If it gets noisy, the hit stars are the first thing to cut, because the victim's own hit flash already marks the hit.

## Worth showing in the Spell VFX gallery for rating

Most worth a vote: the **grabber's hold ring** (it adds information, not just flavour), the **archer's lock glint**, the **brute's crack from fists to impact**, and the **imp's spit**. The goblin and shieldbearer moves are simpler and could ride along as one card each.

## Open questions for the user

1. Should the brute's slam land where its fists land (shorter reach, or a shockwave that travels out to 2.6 u)? Claude's pick: a travelling shockwave, which keeps the gameplay and makes the art honest. It hasn't been built, because it changes the hit timing.
2. Should the grabber's hold ring count down for everyone, or only show for the held player and their allies? Claude's pick: everyone, as now. It's a co-op rescue cue.
