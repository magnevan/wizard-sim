"""Writes the waterfall style prompts (one per style) beside this file.

    python tools/concept-gen/prompts/2026-11-24-waterfall/make.py

Each in-place prompt goes with two references: the grey-box of the falls in the game camera
(docs/reference/waterfall/falls-greybox-game.jpg (sent as a PNG)) and the courtyard concept
(tools/kit/scenes/refs/court/r1-*.jpg). The anatomy sheet takes the courtyard concept only.
"""
from pathlib import Path

HERE = Path(__file__).parent

HEAD = "Generate one image with your image generation tool, then save it as {name}.png in the current directory. Reply with just the file name.\n\n"

SCENE = (
    "The first attached image is a screenshot of a level in our game, stylised 3D seen from the game's high camera. "
    "A stream (the turquoise water at the top centre) runs to the lip of a cliff and simply stops. Ten metres below, "
    "a narrow sea inlet (the turquoise water at the bottom centre) lies in a gorge between the wizard academy's tall "
    "sandstone retaining wall with its balustrade (left) and a rock cliff with woods on top (right). The waterfall "
    "that joins the two is missing: the bare brown rock face in the middle is where it belongs. Both water surfaces "
    "are flat placeholders. The second attached image is concept art of the same academy, showing the look we want.\n\n"
    "Repaint the first image as a finished stylised 3D game level in the look of the second (warm morning light, "
    "warm sandstone, gold trim, lush woods), and add the waterfall, which is the subject of the picture. {style}\n\n"
    "Paint the stream above as living water flowing toward the lip, and the inlet below as sea water disturbed by "
    "the fall, with foam where it lands and ripples spreading out toward the bottom of the picture. Keep the layout: "
    "the same camera and framing, the building, the terrace, the wall and balustrade, the cliffs and the woods in the "
    "same places at the same sizes; the fall drops from the stream's lip to the inlet. No people, no text."
)

STYLES = {
    "falls-a-ribbon": (
        "Style: a bold painted ribbon. One clean, unbroken curtain of water the full width of the stream, falling "
        "straight down the whole drop in a single smooth sheet: saturated turquoise with long crisp white streaks "
        "running down it like brush strokes, a bright rounded white crest where it bends over the lip, and a thick "
        "band of chunky cartoon foam and a few round spray puffs at its foot. Simple, graphic, readable shapes, "
        "like hand-painted animation; very little mist."
    ),
    "falls-b-cascade": (
        "Style: a stepped cascade. The water comes down in four or five short falls, one below the other, over "
        "broad rock ledges: each ledge holds a shallow pool that spills over its front edge as a short white "
        "curtain into the next pool. The ledges step forward as they go down, so the pools show from above. "
        "Wet dark rock at the edges, small ferns and moss between the steps, foam at the foot of every step."
    ),
    "falls-c-weir": (
        "Style: built by the academy's masons. The stream ends at a dressed sandstone weir with a gold-trimmed "
        "lip, matching the retaining wall and balustrade; the water leaves it as one thin, glassy, even sheet, "
        "falls a little way into a carved stone basin set in the cliff, and overflows from the basin through "
        "three carved spouts as three narrow falls into the sea. Dressed stone, mouldings and a little gilding "
        "frame the water; it reads as a grand fountain built into the cliff."
    ),
    "falls-d-veils": (
        "Style: a wild mountain fall. The water breaks on the rock as it comes over the lip and splits into "
        "several separate white strands and veils of different widths, parting round jutting boulders and "
        "joining again lower down; dark wet rock shows between the strands. Hanging moss, ferns and small "
        "flowers grow in the spray. A soft cloud of mist rises at the foot with a faint rainbow in it, and "
        "big rounded boulders stand in the foam where it lands."
    ),
}

ANATOMY = (
    "The attached image is concept art of our wizard academy, a stylised 3D game: it shows the look we want.\n\n"
    "Draw a design sheet for the game's waterfall, in that look, on a plain light grey background. The waterfall "
    "is assembled by the game from a few repeating parts, so that one design can make a fall of any height and "
    "width. Top row, the parts, each on its own with clear space round it, seen from the front and slightly above: "
    "(1) the crest, where flat stream water bends over a stone lip, with a bright rounded highlight; (2) the "
    "curtain, a tall rectangular strip of falling water with long white streaks, made so that it can repeat "
    "downward without a seam; (3) the foot, where the curtain lands in a pool: a band of thick foam, round spray "
    "puffs and spreading ripple rings; (4) a wisp of rising mist; (5) a wet dark boulder that splits the curtain "
    "in two. Bottom row, the same parts assembled into three finished waterfalls on small cut-out blocks of rock "
    "cliff, side by side at the same scale, each with a tiny wizard in a blue robe standing at the top for scale: "
    "a low wide fall as tall as the wizard; a medium fall three wizards tall; a tall narrow fall eight wizards "
    "tall, with one boulder splitting it halfway down. The three are clearly the same design at different sizes. "
    "Saturated turquoise water, crisp white streaks and foam, warm morning light. No text, no labels, no numbers."
)

for name, style in STYLES.items():
    (HERE / f"{name}.txt").write_text(HEAD.format(name=name) + SCENE.format(style=style) + "\n", encoding="utf-8")
(HERE / "falls-anatomy.txt").write_text(HEAD.format(name="falls-anatomy") + ANATOMY + "\n", encoding="utf-8")
print("wrote", len(STYLES) + 1, "prompts")
