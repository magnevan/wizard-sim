# The infirmary on the kit

Status: active; layout round 2 approved by a fresh critic (7.5/10) with its fixes in; Codex pictures of the seven new pieces wait for the user's picks on the review page before any Meshy model (about 210 credits) · Last touched: 2026-11-26
Record: [the read](../campaign/01-opening/infirmary-read.md) (stages 0 to 3: plan D rev 9, flow 8/10, sense 9/10) · plan: `tools/place-plans/plans/inf-d.py` · scene: `tools/kit/scenes/infirmary.scene.json` · [building it on the kit](../campaign/making-a-place.md#building-it-on-the-kit) (the steps) · [the opening thread](opening.md) · [the courtyard on the kit](kit-courtyard.md) (the first place built this way)

## Where it stands

The second place on the kit, picked by the user on 2026-11-26 over the drill yard: its layout is the most settled, it's small (about 2 × 2 screens), and its sea edge can reuse the courtyard's cliffs, quay and parapets. Stop 1 of the opening: your first cast, Life. No fight: cut the vines off the well's conduits, heal the wounded on cots under tents.

Branch `worktree-infirmary-kit`.

## Next

- [ ] **The user reviews it** on [The Infirmary on the Kit](https://claude.ai/artifact/9xpg4f5Ye54kgLyGKrMEvA) (renders, so no game needed; source `tools/infirmary-review/`, answers in its db `answers`), or walks it (`npm run dev` in `game/`, then `index.html#infirmary`). Known from the first look (`cli.mjs view`):
  - The east flight from the overlook is a short 2-cell flight beside the stills, not plan rev 7's long run along the drop (no room on the kit without moving the dais or the stills). The two overlook flights are near twins again, which the flow critic marked down.
  - The conduit walkways (raised to 3.8 m, a kerb you step onto) mostly didn't survive the flights' landings; they're dressing anyway (pipes with vines).
  - The woods are drawn as plain lawn: the kit has no woods floor yet.
  - The tents are four `setpiece.post` stand-ins; the well and the smokestack are round piers.
- [ ] **The user's picks (2026-11-26):** greenhouse a, stills a, tent a approved for Meshy (about 90 credits; being made). Redrawn for a second look: the well and the conduit pipes **without vines** (the user: "define the basic structure and make the vines procedural... it can be consistent when it regenerates, and we could animate the recovery"), the smokestack without smoke (smoke is an effect), the bath dressing as empty pots for procedural flowers, urns and a towel stand, no stairs (stairs are the map editor's, maybe with a new texture). The tent is to be broken into its parts (cots, table, lantern) after modelling, "since they're individually useful". The greenhouse's windows are the thing to watch in its model.
- [ ] **Procedural vines and flowers for this place** (from those picks): vines grown on the well's cage and along the conduit pipes, choking them at the start and drawing back as the well relights (an animated recovery), and flowers grown in the bath's empty pots. Uses the courtyard's foliage system ([foliage thread](foliage.md), `game/packages/client/src/lab/foliage.ts`).
- [ ] **The gaps as a piece list:** the well (caged, a green crystal, vines), the greenhouse, the stills, the tents with cots, the conduits as raised brass pipes on walkways, the bath, the battery's smokestack. Codex pictures first; the user OKs each picture and its cost before Meshy.
- [ ] Dressing notes carried from the read: tents lighter than buildings, the walkways on posts, a different floor on the top tier and the well's tier so the 1.5 m step reads, different beds in the two gardens, the bath's rim on the sand or behind a sea wall, a kerb at the north gate.

## Done

- 2026-11-26: round 2's pieces (the user picked b for all four): the well (`setpiece.infirmary-well`), the battery's smokestack (`setpiece.battery-stack`) and the bath dressing sheet split into six `dress.*` pieces (planters bowl, box and trough, two urns, the towel stand), placed in the scene; 120 credits (210 in all, 1,254 left). The conduit sheet failed: Meshy fused the four pipes into one object, nothing usable (30 of those credits). Question on the page: pipes drawn in code along routes (my pick) or Meshy part by part.

- 2026-11-26: the greenhouse, the stills and the tent modelled (Meshy 7.1, 90 credits, `game/content/generated/meshy/kit-src/infirmary/`), fitted (`setpiece.greenhouse`, `setpiece.stills`, `setpiece.infirmary-tent` in `kit.json`) and placed in the scene in place of the wall boxes and the post stand-ins. The tent at full size (cots about 1.9 m, 16 × 6.5 u, 3.1 m) so two tents flank the road instead of the read's four small ones. The greenhouse keeps its picture's proportions (fit scales evenly): 3.4 m tall, a little small; scale up if it reads so. Tent split: three cots came loose (`kit-src/infirmary/tent-parts/`, gitignored, rebuildable); the fourth cot, table and lantern stay fused to the body. Round 2 pictures (structure only) for the well, pipes, smokestack and bath dressing are on the review page.

- 2026-11-26: layout round 2 and the pieces' pictures, in parallel (the user: "If the reviewer approves it, it's ok with me"). The user's picks on the page: the code-drawn rule is right; move the stills. The stills moved east; the east side a ledge and one flight down the wall face (the critic's one structural change: the first two-flight try "reads as a pen", "overbuilt" for 1.5 m); the cobbled road starts beside the dais; the bath a balustraded pool in a bay cut into the bluff, a walled back and a low sea wall along the walk; the conduit walks dropped (pipes in dressing). Critic, fresh, on the renders: 7.5/10, APPROVE. Fourteen Codex pictures (two per piece: well, greenhouse, stills, tent, conduit sheet, smokestack, bath sheet) in `docs/reference/infirmary-kit/`, with my picks on the page. No Meshy spent.

- 2026-11-26: traced and walkable. `trace_plan.py inf-d infirmary` drew plan D's plain `stairs()` as terrace steps (30 errors), so its `FIXES['infirmary']` writes the four flights (two from the overlook, the shore flight down by the greenhouse, the way back up along the cliff), the shore and its walk, the bath on the sand behind a retaining rim, and the markers (starts on the road in, `gate-court`, `gate-battery`, the well). New FIXES ops: `terrace` (rename or re-level), `flight`, `object`. `compile.py`: 427 pieces, 0 errors. `room.py infirmary` replaces the LDtk grey-box as the sim's `infirmary` room; the 3D page offers it.
- 2026-11-26: the thread started; the courtyard parked for a polish pass.
