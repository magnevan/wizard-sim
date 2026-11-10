# TODO: a continuous world, and removing the wall cap (2026-11-09)

**Status: deferred.** The user agreed the world shouldn't be a set of discrete rooms and that the wall cap has to go, but not now: "I think we don't need to tackle this problem right now, but we should write down some sort of TODO for it." When it's picked up, do it in its own session and worktree, not in the thread building the world. Based on reading the code; nothing has been prototyped or measured.

## What the user decided

- **Players stay reasonably close,** and mechanics can help enforce it: "we do expect players to stay reasonably close and we can build some mechanics to help enforce this." So one active area around the party, not several. Which mechanics is open.

## Why it's limited today

- Terrain and blocking props share the 160 slots of `MAX_WALLS` with players' cast walls. The map checker allows 40 rock walls per room (`content/README.md`, `packages/content/src/check.mjs`). Survive uses 40, the Academy 38.
- Those walls are in `w.walls`, so they're copied into every rollback snapshot and hashed, though terrain never changes.
- Collision and other wall loops scan all the slots.
- The nav grid covers the whole room, lives in rollback state (`w.nav`), and is sized for the largest room (`MAX_CELLS`). Its distance field toward each wizard is rebuilt every 0.3 s, so its cost grows with map size.

## The work, in order

1. **Terrain out of rollback state. Built 2026-11-10 on the branch `worktree-agent-a47e8a370a065b82e`, not merged.** Read-only map data with a 2-unit grid (`packages/sim/src/terrain.ts`), and no per-room limit. Rollback snapshots stay the same size, because the pool stays at 160 slots, now all for cast walls. Cost in a room with several hundred segments isn't measured yet.
2. **Nav as a moving window** around the party, with terrain cost cached rather than re-rasterized.
3. **An active area.** Only what's near the party runs. Enemies sleep and wake by a deterministic rule, so all peers agree.
4. **Keeping the party together.** The mechanics that enforce it. Today local co-op frames the seats' middle and online each screen follows its own wizard, so the rule has to suit both.
5. **Drawing by chunk.** Load ground and props as you walk.
6. **Authoring.** Keep one file per map and place them side by side using LDtk's world layout, so the opening's five maps can join up.

Terrain needs no streaming in the sim: every peer has the whole map as data, and step 1's lookup makes its size mostly irrelevant.

## Until then

Until step 1's branch is merged, the map checker still refuses a room over 40 rock walls. The user pulled that step forward and left the rest for later: "at least the 40 wall limit thing for now".
