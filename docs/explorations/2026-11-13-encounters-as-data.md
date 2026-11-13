# Encounters as data (2026-11-13)

Phase 2 of the engine rework (`2026-11-13-engine-architecture-audit.md`), first part: rooms say where things are, and a room's fight is a list of steps instead of a hand-written director. The battery's lesson is the first one converted. It plays exactly as before: its pinned hash trail through the whole lesson, from the arrival to the repair, is the same before and after.

## What you place in LDtk

You're new to LDtk, so this is the whole vocabulary. Each kind is placed from the Entities layer's palette, and its fields are set in the entity's panel.

| Entity | What it's for | Fields |
|---|---|---|
| PlayerStart, Dummy, Portal, Altar, Rock | unchanged | as before |
| **Prop** | art, as before; now it can also have a part in the game | `asset`, `blocks`, and new: `tag` (empty for scenery) |
| **Marker** (new) | a named spot: where enemies come out, where a line is said, where a door's switch is | `id` (unique), `tag` (groups several, like every "gap") |
| **Region** (new) | a named rectangle, sized by dragging its edges: "when the party walks in", "everyone inside" | `id` (unique) |

The point of `tag` and `id`: code finds a place by its role, not by its art. The battery used to look for props named `defence-tower`, `possession-circle`, `stakes` and `battery-well`, so a reskinned tower would have silently broken the lesson. Now it asks for the props tagged `tower`, `circle`, `stakes` and `well`. `battery-level.py` writes those tags, so regenerating the map keeps them.

While in there I fixed an LDtk setting: Prop had a limit of 4 per level with "move the last one", so placing a fifth prop in the editor would have quietly moved an old one. There's no limit now.

**Not built yet, and the next to add when a room needs them:**
- **Door:** a wall segment with an `id` that the script opens and closes (like the battery's gate of fire, which is a hand-made wall today).
- **Spawner:** probably not needed; a Marker tagged `gap` already does the job.

## What an encounter is

A script (`game/packages/sim/src/encounter.ts`) is a list of steps. The runner walks it, one step at a time:

- **A step can send groups of enemies.** `once` sends one group, `list` sends each in turn, `loop` goes round and round and gets harder each lap. Once its enemies are gone it waits a quiet pause (default 3 s), then moves on.
- **A step can hold:** "don't move on while nobody is at a defence".
- **A step can wait on a condition** and move on the moment it's true: "until someone takes a defence", "until the party enters the hall".
- **A step can run something as it begins** (`enter`), or be an **end** that never moves on by itself.
- **The room supplies its own hooks:** where a group comes out (the battery: the treeline gap nearest each driven defence), how each enemy is placed, and any clockwork of its own (the battery's well failing, guttering, the infusion).

The battery's lesson now reads as ten lines: arrive (until someone takes a defence) → ring → spray → place → brute → free (looping while the well fails) → dry → hands (the groups through the gate) → after → repair. The well's clockwork stays code, as one hook.

For a campaign room that needs no code of its own, the common vocabulary is there already:
- `partyIn(w, 'hall')`: the party is in a Region.
- `openAtMarkers('gap')`: a group comes out of every Marker with that tag.

A test runs a small script with only those two pieces: wait until the party enters the hall, then two groups from the gaps in turn, then the end.

**Why a TypeScript file, not JSON, for now:** a script names its hooks directly, so a typo is a build error and not a silent no-op, and the conditions can be any expression. The steps themselves are plain data. A JSON form that the content check validates can come later, once several rooms use the same vocabulary; it's a small translation.

## What's next

1. **Arena and Survive onto the same runner.** Their lull → wave → breather loop is the same machine as the battery's group → clear → pause. Moving them removes two more hand-written directors. Their pinned trails show whether they still play the same.
2. **The rest of the vocabulary**, each added with the first room that needs it:
   - `say(lineId)`: an event the client shows as a line of dialogue. Lines are a client table keyed by id, so the story text stays out of the sim.
   - `door(id, open)`.
   - `checkpoint(id)`.
   - `objective(textId)`.
   - `exitTo(area)`.
3. **The session → activity → area layer** (the decision of 2026-11-13). One persistent session; the host picks a campaign chapter or an arcade mode; a switch is scheduled inside the running session, not a new match. It carries a small "party state" (unlocks, flags, where in the campaign) that saves and checkpoints are made of. This is the largest piece. It's also what replaces the scenario registry and number keys with a host menu, including a chapter jump for testing.

## Questions for you

- **Q1. The tag names.** `tower`, `circle`, `stakes`, `well` for the battery; `gap` for where enemies come out. Fine, or do you want a naming scheme (`battery-tower`)? My recommendation: short role names, with ids for anything unique.
- **Q2. Placing Markers and Regions yourself.** Would you place them in LDtk, or describe what you want and have me place them? I can do either; for the opening segment I'd place them and show you a map with them drawn.
