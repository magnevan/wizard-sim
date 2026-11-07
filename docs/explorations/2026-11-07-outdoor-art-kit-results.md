# The outdoor art kit: what we bought (2026-11-07)

Follows `2026-11-07-outdoor-art-kit.md`. The user took PixelLab's Tier 1 plan ($12 a month, 2,000 generations, reset 2026-12-07) and approved the whole list. Seven jobs cost exactly the 70 generations quoted (2,000 → 1,930). Results are on [the Outdoor Art Kit page](https://claude.ai/artifact/QNKgjigTb14KmCe8mod1kT).

## What came back

- **96 objects, all as named.** 64 small things, 32 larger props. Every named slot held what it was meant to, so nothing was invented by the tool.
- **104 props in the registry:** 98 bought pieces, plus 4 mirrored fences and walls, and an autumn oak and bush made locally. They're placeable in LDtk today by asset id.
- **Four ground sets** for the top-down grass with dirt, cobble and water, plus pro dirt; 16 isometric corner tiles; 18 isometric path pieces.

## What we learned

**Painted ground beat isometric tiles.** The corner set shows its diamond grid across the whole map, and the path set draws thin, straight paths on a raised slab. They weren't given our palette, so their lime green could be fixed, but the grid couldn't. The pro set is the richest ground and stays in our palette. Its tufts repeat, even when each tile is flipped at random.

**The scatter sheet fills its canvas whatever the subject.** At 32 px a daisy is as tall as a wizard and a pebble as big as a rabbit. Halving everything fixes most of it. Relative sizes between items are still loose: a horseshoe matches a boulder. Per-item scale is a later tuning job.

**`create_map_object` takes no palette.** The oak came out neon and too large. Halving it and mapping its greens onto our leaf ramp fixed both. It's 1 generation, so it's still the cheap way to a big single prop.

**Inline style references are fragile.** They're typed out as base64, and two of three 32 px images were corrupted on the way. Neither failure was charged. The scatter sheet went without a reference, on palette alone, and still matched. The 48 px sheets used 3 references rather than the 8 the brief said.

**Fences join well enough.** Sections are about 30 px long and run close to the isometric slope, so a 1.8-tile step lines them up. The corner post isn't used yet: the mock's corners simply meet.

## Not built

The game can't show any of this ground: there's no floor painter or Ground layer, and the isometric camera isn't built. The yard picture comes from `tools/outdoor-kit/yard-bought.py`, not from the game. Next is the painter, on a branch, in one outdoor room.
