# TODO: the battery's first playtest (2026-11-10)

**Status: open.** The user walked the battery and drove a defence, and listed 14 issues. They suggested splitting them: "A lot of these issues are related to the geometry of objects rather than the scene itself, so maybe we should just organize these issues into a task and work on it separately from the more specific scenario issues."

Issue numbers are the user's. Causes marked *confirmed* were read in the code. Causes marked *likely* come from reading it and haven't been tested. Nothing here has been fixed.

## Track A: objects and rendering (separate session and worktree)

These apply to every prop or effect, not only the battery. They touch the content compiler, prop drawing and the wall kit.

The battery exists only on the branch `worktree-opening-segments`, so start this work from that branch, not from main.

### Collision

- **#13 You can clip through turrets, and #11 you can walk through the well.** *Confirmed cause:* `footprintWalls` (`game/packages/content/src/compile.mjs`) turns a footprint deeper than 0.6 into two parallel walls, one along each long side. That's solid for a shallow bench. A 5 x 5 tower or well gets two walls 4.5 apart with open ends, so you walk in from the side. Fix: a closed outline for deep footprints, and ideally round ones for round objects. Rooms with blocking props change hash, so re-check the golden and bot hashes. The Academy's deep props have the same hole.

### Where things stand, and what sorts in front

- **#6 The pedestal floats slightly.** *Likely cause:* a prop's `foot` should be the middle of its footprint on the ground (`game/content/README.md`), but `tools/art-import/props.py` defaults to two pixels above the image's bottom edge. The sprite therefore stands higher than its shadow and collision. The fix applies to every prop registered that way, so judge it across the Academy and the outdoor props too. The defence and well already use the base's middle.
- **#11 The well's steps hide almost your whole body from behind.** *Likely cause:* one sprite has one sort point, its centre. Everything south of that point draws in front and everything north draws behind, including when you're only on the low steps. Options: split the well into a low base and an upper part, or per-prop depth. This wants the same answer as #14.
- **#14 Walking along the wall, you clip behind segments and pop out.** *Likely cause:* each wall piece sorts by one y, but on screen a piece covers 12 px of y, so a wizard walking beside the wall crosses from one piece's order to the next. With no walls around the edge, the battery's wall is the first one you walk beside for a long way. Fix: decide the order by which side of the wall's line the body is on (`kitRun` and `Pieces.tex`, `game/packages/client/src/art/wall-kit.ts`, `view-structures.ts`). Earlier today, forcing a sort offset looked wrong on the towers, so avoid that route.

### Shadows

- **#12 Shadows from turrets and the chest have pixel-sized gaps.** *Confirmed cause:* `castMask` (`game/packages/client/src/art/cast-shadow.ts`) maps each source pixel to one destination pixel, and rounding leaves holes wherever the shadow stretches. Fix: fill it by mapping backwards, from each shadow pixel to its source, or by drawing spans.

### Fire as a surface

- **#10 Flame walls: (a) flat when scaled up, (b) movement too fast, (c) long walls repeat visibly.** The curtain drawing was tuned for a 15 px cast wall (`curtain` in `view-structures.ts`), and the gate multiplies its height by `GATE_FIRE`. Flame speed should stay roughly constant with size. It needs more layers for volume and a longer-period pattern.

### Research: smooth turret rotation (#5)

**Question for a research agent:** what's the best way to make a pixel-art turret head rotate without obvious snapping?

The user's options: (a) generate more facings, (b) redesign the turret so it's easier to rotate, (c) a 3D-to-pixel-art pipeline. Also consider what shipped isometric and pixel-art games do, and whether a part of the head can rotate in code.

What we know:
- `POST /v2/rotate` costs 1 generation per facing, run on the head alone at 64 px. Two facings came out usable, and the east one needed the old flame cleaned up by hand.
- Affine rotation of the head in code mangled it.
- #1 below widens the swing to nearly a half circle, so the facings needed go up. The answer should say how many facings hide the snap at this size (the head is about 50 px across).
- Report cost, how well frames stay consistent, and how it extends to future turrets.

## Track B: the battery itself (this thread)

- **#8 Fire nova.** Main's rework (`15c0bae`, "Single-element novas are one surface going outward") landed after this branch's last merge, so the playtest showed the old nova. Merge main and look again before judging it. The half-ring clip in `drawFx` may need adjusting.
- **#1 Can't aim left.** *Confirmed cause:* the clamp is 45 degrees either side of straight out on the plan, as first specified. On the 2:1 isometric screen that range runs from straight up to straight right, so "straight out" looks like one end of the swing and everything to the turret's upper left is out of reach. Widen it toward both tangents of the wall, about 80 degrees each way. It also needs art for those facings, which depends on #5.
- **#2 Straight out looks tiny, to the right looks right.** *Confirmed cause:* foreshortening. A world unit straight up the screen is half the pixels of one to the right, and the wall hides the first 4 units or so. Same range, half the drawing. Fix: tune reach by screen direction, or a longer base range.
- **#3 The spray is too thin for its range.** Scale the cone for a defence (`K.cone`, spread and power).
- **#4 The camera should ease north-east while you drive,** so the battlefield fills the view.
- **#7 The fire patch's range is too restrictive.** *Likely cause:* Place's aim point goes through the same swing clamp as the head. A placed spell should have its own range and shouldn't be limited to the head's wedge.
- **#9 A dedicated turret bar.** Roughly the same size as the rune bar, but given over to one element, with more room for its runes and regen. Build it so other turrets can use it.

After these: waves and lanes, the failing pool, the infusion and the repair (`docs/decisions/README.md`, 2026-11-10; the Opening Segment page).

## Enemies at the wall's foot

Not on the user's list, but it comes from the same layout: a full-height wall hides about 4 units of ground behind it, and enemies reaching the wall will be out of sight. A one-storey kit would be about 10 generations, with sign-off first. Decide once waves exist.
