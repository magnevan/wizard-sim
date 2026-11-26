"""Writes a Codex critique prompt for the Fire ring/burst iteration N into <dir>/N/critique.txt:
python 2026-11-26-wave-critique-prompt.py <dir> N [previous critique + our response, a text file]"""
import os
import sys

D, N = sys.argv[1], sys.argv[2]
prev = sys.argv[3] if len(sys.argv) > 3 else ''
OUT = os.path.join(D, N)
os.makedirs(OUT, exist_ok=True)
FX = 'C:/Users/mvikj/Code/magicka-toy/.claude/worktrees/fx-element-order/game/packages/client/src/view3d/fx'
since = ''
if prev:
    since = (f"\n\nThis is iteration {N}. The previous critique's changes were applied where we agreed (see the code); the "
             "previous critique and our response are below. Judge the new frames on their own; say if anything got worse.\n\n"
             "--- previous critique and our response ---\n" + open(prev, encoding='utf-8').read())
prompt = f"""You are a senior real-time VFX artist and a harsh, specific critic. Do NOT generate images. Look, read the code, think, then write your critique.

We are making the Fire ring and the Fire burst for a stylised 3D top-down co-op wizard game. They are ONE animation: a travelling wave of flame going out from the wizard, round the full circle for the ring (Area cast, radius 3.6 units at 2 runes, +0.6 a rune) and across an aimed fan for the burst (about 120 degrees wide, 2.5 units). The sim hits the whole area at once; the wave is visual. Magicka is a reference, not the target: the designer prefers our travelling wave over Magicka 2's nova explosion.

The designer's notes on the concept (verbatim): "a slightly more defined / hotter wave front and tapered interior would look a bit better. We need to make sure the wave also tapers down, like the frost wave we made. It's fine if it tapers a bit beyond its aoe. Scorch marks probably shouldn't be a singular ring since its a radial movement." On the burst: "fire ring and fire burst should be the same animation, just segmented. Maybe a little bit more treatment to handle the edges, since a ring doesn't have an edge." On our first build: "It's not a bad starting point though." On the fire parts: sprites should be irregular (rotation then gives variety), flames should burn out by breaking up from the inside, ground flames should leave upward. The approved Fire spray (not shown) uses painted flipbook flames, dark smoke, ash flakes.

Attached, in order:
1. sheet.png: our current build. Top: frozen frames in a grid, labelled (spell, time after cast in seconds) at a close camera (11 units top to bottom): the 2-rune ring at 0.07, 0.2, 0.34, 0.6 and 2.5 s, the 5-rune ring at 0.4 s, the burst at 0.2 and 0.45 s. Bottom strip: the ring at the real game camera (30 units) in a crowd. A wizard is 2.7 units tall. The lab floor is paler than the game's court.
2. story.jpg: the approved concept storyboard (top row ring, bottom row burst).
3. magicka2-nova.jpg: Magicka 2's fire nova at 0.13 s a frame (reference only).

Our code: {FX}/fire-wave.ts (layers: PUFFS (fire-puff2.png flipbooks riding the front), RISE (upright ground flames, fire-rise.png), SMOKE, FLASH, GROUND decal (hot line, soot band, radial scorch)), with particles.ts (stateless GPU particles; premultiplied alpha: alpha 0 adds light, alpha 1 covers), decal.ts, ring-shape.ts. Tone mapping is ACES. Sizes and timing of the area come from the sim; everything visual can change.{since}

Write critique.md in the current directory, then reply with just the file name. In it:
1. A score from 1 to 10 for how good this is as a stylised game effect that answers the designer's notes, and one sentence why.
2. The three changes that would raise the score most, in order, each with exact code changes in fire-wave.ts (layer, function, the numbers) concrete enough to apply without guessing.
3. Anything that looks broken (not just unpolished).
4. Whether it is presentable to the designer as the next review round: yes or no.
Keep it under 700 words.
"""
open(os.path.join(OUT, 'critique.txt'), 'w', encoding='utf-8').write(prompt)
print(os.path.join(OUT, 'critique.txt'))
