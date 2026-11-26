"""Writes a Codex critique prompt for fire iteration N: python critique.py N"""
import sys, os
N = sys.argv[1]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), N)
FX = 'C:/Users/mvikj/Code/magicka-toy/.claude/worktrees/port-3d/.claude/worktrees/p3d-react/game/packages/client/src/view3d/fx'
prompt = f"""You are a senior real-time VFX artist and a harsh, specific critic. Do NOT generate images. Look, read the code, think, then write your critique.

We are making the Fire spray (a channelled flamethrower from a wizard's staff) for a stylised 3D top-down co-op wizard game, and the designer wants it to look as good as Magicka 2's flamethrower. The designer's latest verdict on our version: "come on man, are you messing with me?" It is not presentable. Earlier notes: "flames have no texture"; "the initial weld looks really bad compared to magicka 2"; the designer described Magicka 2 as: "bright core reminiscent of something like a welder flame, or maybe some jet engine; outer fire texture, blotches of fire that pulse large then fade; smoke patches that rapidly scale out and fade; char on the floor; small floating embers", and Magicka 1 as: "flame particles that move outwards, scale up, fade out, change color from bright yellow to more orange/red at the end; same floating embers; smoke is rendered behind, scales up larger than flame, lasts longer and has an upwards drift".

Attached, in order:
1. sheet.jpg: our current fire, nine frames (3 runes at a close 14-unit camera over the channel and after release, 2 runes, and 3 runes at the real game camera of 30 units). A wizard is 2.7 units tall.
2. magicka2-stream.jpg and magicka1-stream.jpg: stills of the references, from the designer's recordings.
3. magicka2-sheet.jpg: the Magicka 2 clip at four frames a second.

Our code: {FX}/fire.ts (the layers: SMOKE, CORE (the weld), PUFF (the body: painted flame cells from fire-rolls.png), GLOW, EMBER, and the FAN floor decal; particles.ts is the kit: stateless GPU particles, premultiplied alpha where alpha 0 adds light and alpha 1 covers; the scene is pale warm sandstone tone-mapped with ACES). The cone's width, length and timing come from the game's simulation and can't change (it is wider than Magicka's: about 96 degrees at 3 runes); everything else can. Goblins hit by fire are tinted and get a hit-flash rim (view3d/bodies.ts, art/model-pose.ts) and burning statuses (fx/statuses.ts).

Write critique.md in the current directory, then reply with just the file name. In it:
1. A score from 1 to 10 for how close ours is to Magicka 2's look, and one sentence why.
2. The three changes that would raise the score most, in order, each with exact code changes (which layer, which function, the numbers: rates, sizes, speeds, colours, alpha, blend) you would make after reading fire.ts. Be concrete enough that someone can apply it without guessing.
3. Anything in the frames that looks broken (not just unpolished).
Keep it under 700 words.
"""
open(os.path.join(OUT, 'critique.txt'), 'w', encoding='utf-8').write(prompt)
print('ok')
