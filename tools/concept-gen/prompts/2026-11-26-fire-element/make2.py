"""Fire's element pass, round 2 of concepts (2026-11-26): the parts sheet redone from the user's notes on round 1 and
on Magicka 1's cells (Spell Effects Review, `fire-1-parts`, `magicka-fire-compare`), and the ring and burst as one
animation (`fire-1-ring`, `fire-1-burst`). Same references as make.py: spray-ref.jpg and fire-burn.png.
Run: python make2.py
"""
from pathlib import Path

HERE = Path(__file__).parent
HEAD = "Generate one image with your image generation tool, then save it as {name}.png in the current directory. Reply with just the file name.\n\n"
REFS = (
    "Two images are attached. The first is a frame of our game: a stylised 3D action game seen from a steep camera "
    "about 46 degrees down, on a warm, pale sandstone floor; a small red wizard casts a Fire spray. That fire is approved "
    "and sets the look of the element. The second is its flame sprite sheet: fireballs burning out over 8 frames. Keep "
    "their painted toon style: soft round shading, white-hot hearts, orange and red, burning out into dark crackle.\n\n"
)

PROMPTS = {
    "parts-sheet-2": (
        "Paint a VFX artist's parts sheet for the Fire element: building blocks of game particle effects, each shown alone "
        "on a plain black background, in labelled-free rows, so a developer can cut them into sprites. Each row is a short "
        "life strip left to right (born, living, dying). Every sprite is irregular and lopsided, never round or "
        "symmetrical, so that rotating it gives real variety. The rows:\n"
        "1. Flame puff, three variants (one per sub-row of six frames): a ragged, lopsided mass of fire, white-hot at "
        "first, that breaks up from the inside as it burns out: dark holes open in its middle and spread outward, leaving "
        "a broken rim of orange and red crackle that thins to nothing.\n"
        "2. Single flame lick, four variants side by side (each one still frame): one small, thin tongue of fire, a "
        "single lick among many, each a different curl and length, clearly smaller and simpler than the puffs.\n"
        "3. Rising ground flame, three variants (six frames each): an upright flame standing on the ground that stretches "
        "upward, its tip detaching and disappearing upward into the air as the base shrinks and goes out. Straight up, "
        "no sideways lean.\n"
        "4. Smoke puff, two variants (six frames each): dark grey-brown smoke that grows, curls and thins away, lopsided.\n"
        "5. Impact splash (six frames): fire hitting a surface: a flat, hot flash that sprays short streaks of flame and "
        "sparks outward in a fan, then breaks into crackle. Seen from above at an angle, as a hit on a body or a wall.\n\n"
        "Paint with restraint: flat, readable shapes, few of them, clean edges against the black. No text, no labels, no "
        "numbers, no UI, no arrows."
    ),
    "story-ring-2": (
        "Draw a storyboard: two rows of five panels, left to right in time, each panel the same game camera (46 degrees "
        "down, same framing), on the same pale sandstone floor, with the same small red wizard and a few goblins at game "
        "scale (a wizard is about 1.6 metres tall). Thin dark gutters between panels.\n\n"
        "Top row, the Fire ring: a wave of flame travels outward from the wizard's feet in a full circle to about 3 "
        "metres, as one connected surface. The wave has a sharply defined, very hot, bright yellow-white leading edge "
        "that stands tallest at the front, and behind it the flames taper down quickly towards the inside, burning out to "
        "red crackle, so the middle is low and nearly clear. As the wave reaches its full size it slows, the whole wave "
        "sinks down and thins, fading out a little beyond its edge rather than stopping. Panels: (1) a white flash at the "
        "feet; (2) the wave a metre out, hot front, tapered interior; (3) the wave reaching the goblins, who catch fire; "
        "(4) the wave sinking and thinning just past its reach; (5) the aftermath: scorch streaks on the stone radiating "
        "outward from the wizard like spokes, short dark soot blotches along them, a few cooling embers; no single ring.\n\n"
        "Bottom row, the Fire burst: exactly the same travelling wave, but only a fan-shaped segment about 120 degrees "
        "wide thrown forward from the wizard's hands toward the goblins. Its two ends are not cut off: at each side the "
        "wave lowers and frays into a few curling flames and smoke, so the fan has soft, burning ends. Same five beats.\n\n"
        "Keep the look of the references. Paint with restraint: flat, readable shapes, few of them. No text, no labels, "
        "no numbers, no UI, no arrows."
    ),
}
for name, body in PROMPTS.items():
    (HERE / f"{name}.txt").write_text(HEAD.format(name=name) + REFS + body + "\n", encoding="utf-8")
print("\n".join(PROMPTS))
