---
cssclasses:
  - ws-polished
---

# Work in progress

[Start here](start-here.md) · [Threads](threads/README.md) · [Backlog (GitHub issues)](https://github.com/magnevan/wizard-sim/issues) · [How tasks work](tasks.md)

## Spell identities

> [!in-review] Answer the spell changes
> The element identities and the casting styles (Shield and Sigil paid in Concentration and Bindings) mapped onto every spell: a cost table and sixteen changes, each with Claude's recommendation. Nothing built yet.

[Spell Ramifications](https://claude.ai/artifact/FMhzY77FbQuJJtgPxdkb9n) · [Record](explorations/2026-11-28-spell-ramifications.md) · [Thread](threads/element-identity.md) · [Elements](world/elements.md)

## Campaign opening

The opening is a chain of eight stops, Life first; the yard and the battery are built ([route](campaign/01-opening/brief.md#the-route), [thread](threads/opening.md)). Its places will be built in stylised 3D from a modular kit ([flexible building](explorations/2026-11-23-flexible-building.md)); a map editor the user and an LLM share comes next ([thread](threads/map-editor.md)).

> [!in-review] Try the map editor
> `npm run dev` in `game/`, then open http://localhost:5187/editor.html: patch B in 3D. Paint terraces, add stairs and props, click a wall section to make it a window or door, and pin (N) anything that should change: Claude sees new pins with your next message in the terminal. [How to use it](../tools/map-editor/README.md#using-the-editor).

[The Morning Everything Breaks](https://claude.ai/artifact/9DwUCZHa8ibckf2vWiFews) · [Opening Segment review](https://claude.ai/artifact/22rU6WpjmMRHrToc5YbiPi) · [Saved marks](archive/claude-review-feedback-2026-11-16.md#opening-segment) · [Playable battery](current-state.md#rooms)

## The port to 3D

> [!in-review] Play the 3D page; effects have their own thread
> The Court in 3D's questions are all answered (2026-11-25). The 3D game is the main page (`?runes=1` gives runes in the court, `#practice` for the practice ground). Spell effects moved to [their own thread](threads/spell-effects-3d.md), which starts with a fresh session. The swap is done (2026-11-25): the public page is the 3D game, the pixel game is at `/classic.html`.

[The Court in 3D](https://claude.ai/artifact/3dWPYc5ZxZqgrYfpksnegu) · [Thread](threads/port-3d.md) · [Effects thread](threads/spell-effects-3d.md) · [Plan](explorations/2026-11-25-port-3d-plan.md)

## Goblin warband art

> [!in-review] Judge the band in play
> The six goblins and the wizard are drawn live from their 3D models in the game (`art/live3d.ts`; `?live3d=0` or a software renderer gets the baked sheets, `?sprites=0` the old rigs), the wizard at 1.4x. The band in play, the archer's shot and live 3D are marked keep. Still to mark: the wizard from 3D (`wiz-3d`), judged live in the game. Next work: the live wizard's conjured weapon, and walk and run tuned to each body's real speed (the exploration's follow-ups). Elemental deaths on the 3D bodies come after.
>
> **Guards, round 3:** the plan to make the guards living conjurations (core, shell and particles; Ice split from Frost; how extras show) is on the review page. Mark each guard `g3-<guard>` and answer the five `g3-q-*` questions.

[Goblin Warband Art review](https://claude.ai/artifact/4WNayLNFUL2TNuffPfTMsJ) · [Exploration](explorations/2026-11-16-warband-art.md) · [Guards, round 3](explorations/2026-11-17-guard-refinement.md)

## Sound design

> [!in-review] Compare takes in play
> Open the dev Sound Lab with `?lab` (a tab per element, and one for music and ambience). Capture decisions about the clip or cast moment being reviewed.

The [sound direction](presentation/sound.md) holds the rules that carry over between kits.

## Enemies and AI

> [!in-review] Mark the enemies and the AI plan
> On the Enemy Roster, mark each candidate enemy build, maybe or cut, and answer its seven questions. On Enemy Wizards, mark the plays and honesty rules and answer its questions.

[Enemy Roster](https://claude.ai/artifact/QSBW1MzxrF7P1cktdfnXtP) · [Enemy Wizards](https://claude.ai/artifact/CssUe9PniLQRJ4LkKRZo9J) · [Enemies and AI](explorations/2026-11-14-enemies-and-ai.md) · [Enemy wizards](explorations/2026-11-14-enemy-wizards.md) · [Encounter-level AI](explorations/2026-11-14-encounter-level-ai.md)

## Picking up another review

Add a review here when there's a specific decision or test to do. Keep its next question and a link to the working material. When it ends, update the owning topic with any decision or reusable rule and remove the review from this page.

[Previous review queue](archive/review-queue-2026-11-16.md) · [Idea bank](ideas/README.md)
