"""Write the prompts for Fire's element pass (2026-11-26): one parts sheet and five storyboards.

The first try of the lessons' "concept art as breakdowns" (docs/explorations/2026-11-26-spell-effects-lessons.md,
section 7): a parts sheet shows what the element is made of, a storyboard how one cast lives and ends. Sizes come from
game/packages/sim/src/config.ts (novaRadius 3, patchRadius 2 and patchLife 8, imbueRange 2.5 and imbueHalf 0.17).

References: every prompt gets fire-burn.png (the approved burn-out flipbook, game/content/generated/fx/) and a frame
of the locked Flamethrower (r16-fire-sparse-14.mp4 at 1.2 s, saved as spray-ref.jpg). Run: python make.py
"""
from pathlib import Path

HERE = Path(__file__).parent

HEAD = "Generate one image with your image generation tool, then save it as {name}.png in the current directory. Reply with just the file name.\n\n"

REFS = (
    "Two images are attached. The first is a frame of our game: a stylised 3D action game seen from a steep camera "
    "about 46 degrees down, on a warm, pale sandstone floor. A small red wizard (robes, pointed hat) casts a Fire "
    "spray from his hands into a group of goblins. That fire is approved and sets the look of the element. The second "
    "is its flame sprite sheet: three fireballs, each in 8 frames burning out from white-hot through orange and red "
    "into dark crackle. Every flame in the game is one of these, playing its 8 frames as it flies, so fire is many "
    "short-lived flames, each born hot and dying into crackle and ash, never one solid sculpted volume.\n\n"
)

LOOK = (
    "Keep the look of the references: painted toon flames with soft round shading, a white-hot heart, orange and "
    "red, burning out into dark crackle; dark grey-brown smoke; small ash flakes; a sooty scorch on the stone. Paint "
    "with restraint: flat, readable shapes and few of them, because every part must be rebuilt as a moving game "
    "effect. No text, no labels, no numbers, no UI, no arrows."
)

STORY = (
    "Draw it as a storyboard: {n} panels in one row, left to right in time, each panel the same game camera "
    "(46 degrees down, the same framing), on the same pale sandstone floor, with the same small wizard and goblins "
    "at game scale (a wizard is about 1.6 metres tall). Thin dark gutters between panels. The panels: {beats}\n\n"
)

PROMPTS = {
    "parts-sheet": (
        "Paint a VFX artist's parts sheet for the Fire element of this game: each building block of its effects "
        "shown alone on a plain black background, in rows, so a developer can rebuild each one as a game particle or "
        "texture. Each part is shown as a short life strip of four to six frames left to right (born, living, "
        "dying), small and clean. The parts, one row each:\n"
        "1. A single flame puff burning out (like the attached sheet, kept for consistency).\n"
        "2. A hollow flame: a ring of bright-edged tongues round a darker, see-through middle, curling outward as it "
        "grows and breaks apart.\n"
        "3. A rising flame tongue from the ground: a short lick of fire flaring up, bending, splitting and vanishing.\n"
        "4. A smoke puff: dark grey-brown, thinning out and drifting up as it fades.\n"
        "5. An ash flake: a tiny glowing ember flake cooling from orange to dark grey as it tumbles.\n"
        "6. A flame wave front seen from the game camera: a short curved segment of a wall of fire rolling forward, "
        "knee high, bright on its leading edge, breaking into flames and smoke behind.\n"
        "7. A scorch mark on stone: a sooty ragged blot with glowing cracks that cool and dim to dark soot.\n\n"
        + LOOK
    ),
    "story-burst": (
        "The subject is the Fire burst: a one-shot cast that throws fire from the wizard's hands in a wide fan in "
        "front of him (about 120 degrees wide and 2.5 metres long), all at once, hitting the goblins in it, then "
        "gone. A single gout, not a stream.\n\n"
        + STORY.format(n=5, beats=(
            "(1) the wizard thrusts his hands forward, a bright flash at his palms; (2) the fan of fire bursts out, "
            "flames racing to its full reach, the nearest goblins engulfed and recoiling; (3) the flames tumble on "
            "past their reach, swelling, reddening and breaking into crackle; (4) only dying flames, smoke rising and "
            "ash flakes floating; (5) the aftermath: a faint sooty fan on the stone, wisps of smoke, two goblins "
            "still burning."))
        + LOOK
    ),
    "story-ring": (
        "The subject is the Fire ring: a one-shot cast that sends a single wave of flame rolling outward from the "
        "wizard's feet in a full circle, out to about 3 metres (two wizard heights), hitting every goblin it "
        "passes, then gone. It is one connected ring of fire, a blast wave made of flames, not a row of separate "
        "fires.\n\n"
        + STORY.format(n=5, beats=(
            "(1) a white-hot flash bursts at the wizard's feet; (2) a low ring of flame races outward, bright on "
            "its leading edge, burning out behind it into crackle and smoke; (3) the ring reaches the goblins at "
            "its full radius and they recoil, catching fire; (4) the ring breaks apart into separate dying flames, "
            "smoke curling up and ash floating; (5) the aftermath: a faint sooty ring on the stone, the wizard "
            "standing in its clean middle, wisps of smoke."))
        + LOOK
    ),
    "story-patch": (
        "The subject is the Fire patch: the wizard places a pool of burning ground at a spot in front of him, a "
        "roughly round patch about 4 metres across. It burns for eight seconds, setting alight whoever walks "
        "through it, then goes out. Think of burning oil spilled on stone: a low carpet of short flames, not a "
        "campfire.\n\n"
        + STORY.format(n=5, beats=(
            "(1) a burst of flame lands on the floor at the target and splashes out; (2) the patch flares up to its "
            "full size, a low carpet of flames over glowing cracks; (3) it burns steadily, a goblin walking through "
            "it catching fire; (4) as it ends the flames sink into the stone and the cracks dim; (5) the aftermath: "
            "a dark sooty scorch with a few cooling embers and thin smoke, clearly no longer dangerous."))
        + LOOK
    ),
    "story-burn": (
        # The first wording ("sets him alight", "a desperate, self-harming spell") was refused by the image model's
        # filter (self-harm, violence); this one describes the same look as a magical mantle.
        "The subject is Burn: the wizard calls a mantle of fire around himself. It wraps him in flames for a few "
        "seconds and dries him off if he was wet, cartoonish and magical, like a fire elemental's aura.\n\n"
        + STORY.format(n=4, beats=(
            "(1) the wizard, dripping wet, raises his staff and a ring of fire flares up from the floor around his "
            "feet; (2) steam puffs off him as the flames rise round him like a cloak; (3) a mantle of small flames "
            "hugs his robe, embers and ash flakes rising off it; (4) the mantle dies down to a few wisps of smoke "
            "and ash flakes, his robe dry."))
        + LOOK
    ),
    "story-burning": (
        "The subject is the Burning status: what a goblin looks like while it burns after being hit by fire, so "
        "players can see at a glance who is burning.\n\n"
        + STORY.format(n=4, beats=(
            "(1) a goblin is hit by fire and catches: flames sweep up its body; (2) it burns, flames hugging and "
            "licking up its body (taller on its back and head), embers and ash flakes peeling off and rising, dark "
            "smoke above; (3) it keeps burning while it runs, the flames streaming back behind it; (4) the fire "
            "gutters out into smouldering patches and thin smoke on a sooty goblin."))
        + LOOK
    ),
}

for name, body in PROMPTS.items():
    (HERE / f"{name}.txt").write_text(HEAD.format(name=name) + REFS + body + "\n", encoding="utf-8")
print("\n".join(PROMPTS))
