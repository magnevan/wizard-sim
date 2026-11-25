"""Write the prompts for the Fire spell concepts (2026-11-25).

Each direction is one style paragraph dropped into the same scene, so the
pictures differ only in how the fire is drawn. Run: python make.py
Reference image for every scene prompt: tools/port-3d-review/img/plaza-26.jpg
It writes every style x subject; only the .txt files kept beside it were sent. The sheet was sent twice,
with toon-spray-2.png and with hybrid-spray-1.png (docs/reference/spell-concepts/fire/) as its reference.
"""
from pathlib import Path

HERE = Path(__file__).parent

HEAD = "Generate one image with your image generation tool, then save it as {name}.png in the current directory. Reply with just the file name.\n\n"

SCENE = (
    "The attached image is a screenshot of our game: a stylised 3D action game seen from a steep camera "
    "about 46 degrees down, looking north over a warm sandstone courtyard in morning sun. The wizards are "
    "small (the red and the blue wizard in robes and pointed hats); goblins stand in a row behind them.\n\n"
    "Repaint it as a finished frame of the game with the same camera, framing, courtyard, light and sizes, "
    "and add one spell effect, which is the subject of the picture. {subject}\n\n"
    "{style}\n\n"
    "The fire must stand out clearly against the warm, pale orange stone floor: it is a spell in a game, "
    "and a player must read its exact shape at a glance from this high camera. Keep the courtyard, the "
    "stairs, the balustrades and the goblins as they are. No text, no labels, no UI."
)

SPRAY = (
    "The red wizard is casting a Fire spray: a continuous flamethrower stream that leaves the tip of his "
    "staff and blasts forward (north, up the picture) toward the goblins, widening into a cone about 65 "
    "degrees wide and about twice as long as the wizard is tall, so its far end reaches the nearest "
    "goblins. It is one stream pouring out of one point, fierce and fast, hottest where it leaves "
    "the staff. Two goblins at the far end are caught in it. The blue wizard stands aside, watching."
)

FLOOR = (
    "A Fire spray has just swept across the floor and left a burning patch: a single patch of burning "
    "ground, roughly round and a little wider than the wizard is tall, on the open floor in front of the red wizard, between him and the goblins. It is one connected "
    "patch of flame on the stone, low flames licking up from a scorched, glowing floor, not a pile of "
    "separate fires. The wizards and goblins stand clear of it."
)

RING = (
    "The red wizard has just cast a Fire ring: a single wave of flame rolling outward from his feet in a "
    "full circle across the floor, caught at the moment it is about one and a half wizard heights out from him, "
    "a moving wall of fire knee- to waist-high that is about to hit the goblins. It is one connected "
    "ring of flame with a hot leading edge and a scorched, smouldering floor left inside it. The blue "
    "wizard stands well back, outside the ring."
)

# Round 2: the first floor (toon-floor-1) came back as a campfire with one tall flame in the middle.
FLOOR2 = (
    "A Fire spray has just swept across the floor and left a burning patch on the open floor in front of "
    "the red wizard, between him and the goblins: roughly round and a little wider than the wizard is tall. "
    "It is a low, wide carpet of flame covering the whole patch evenly, like burning oil spilled on the "
    "stone: many short flame tongues of similar height, knee-high at most, densest in the middle and "
    "thinning to a ragged rim of glowing embers, over scorched black stone with glowing orange cracks. "
    "The wizards and goblins stand clear of it."
)

STYLES = {
    "ribbons": (
        "Style: hand-painted flame ribbons, like the spell effects in Hades or League of Legends. The fire "
        "is drawn as a few long, sweeping, overlapping ribbons of flame that twist together like a braid, "
        "each with a crisp painted edge, a pale yellow-white inside, saturated orange and a deep red rim, "
        "with long tapering tongues peeling off the sides. Graphic and painterly, bold shapes, very few "
        "small particles; a warm glow on the floor under it."
    ),
    "cel": (
        "Style: cel-shaded fire with hard edges, like a toon-shaded anime game. The flame is one bold "
        "shape split into three or four flat colour bands with crisp hard borders: a white-yellow core, "
        "a yellow band, an orange band and a dark red outline band, with sharp pointed flame tongues "
        "along its outer edge. No soft gradients and no smoke, just clean graphic shapes, plus a few "
        "sharp diamond-shaped sparks."
    ),
    "toon": (
        "Style: volumetric toon fire. The stream is a thick rolling body of fire that looks three "
        "dimensional, with a blazing white-hot core running down its middle, billowing orange flame "
        "around it with soft round toon shading, a thin bright red-orange rim where it meets the air, "
        "and dark grey-brown smoke curling off its far end and its tips. It casts strong orange light "
        "on the floor and on the goblins."
    ),
    "breath": (
        "Style: liquid dragon breath. The fire behaves like a thick fluid jet: a glossy, molten stream "
        "of yellow-white fire pours out of the staff like a fire hose, keeps a clear tight column for "
        "the first part, then splashes and fans out where it widens, with drops and globs of burning "
        "liquid flying off its edges and splattering burning spots on the floor. Strong highlights, "
        "like molten metal or lava that is still bright and fast."
    ),
    "jets": (
        "Style: bright readable jets, like the spells in Magicka: the cone is filled with many fast, "
        "thin, bright streaks of fire all shooting outward from the staff tip in straight lines, dense "
        "and white-yellow near the staff, turning orange and breaking into flickering tongues and "
        "sparks toward the far end. It reads as speed and pressure, a roaring blast; the cone's edges "
        "are clear because the streaks fan out along them."
    ),
    "embers": (
        "Style: minimal embers and heat. Very little solid flame: a narrow, intense white-orange core "
        "jet near the staff, then the cone is shown mostly by thousands of bright embers and sparks "
        "streaming outward, a shimmering heat haze that warps the floor and goblins behind it, and "
        "the stone under it glowing red-hot in a cone shape. Elegant and restrained, dark smoke wisps "
        "at the end."
    ),
    # round 2: toon's body with jets' crisp, fast cone
    "hybrid": (
        "Style: volumetric toon fire driven like a high-pressure jet. Right at the staff tip a blazing "
        "white-hot core shoots out as a tight bundle of straight, fast streaks that fan out to exactly the "
        "cone's edges, so the cone's straight sides are crisp; within the first third the streaks swell "
        "into one thick, rolling body of orange flame with soft round toon shading and a thin bright "
        "red-orange rim, filling the whole cone with no gaps, and at the far end it billows up and curls "
        "into dark grey-brown smoke. Strong orange light on the floor under it and on the goblins."
    ),
}

SHEET = (
    "Generate one image with your image generation tool, then save it as {name}.png in the current "
    "directory. Reply with just the file name.\n\n"
    "The attached image is concept art for a Fire spray in our stylised 3D game: a flamethrower stream "
    "from a wizard's staff, seen from a steep high camera. Make an effects breakdown sheet for building "
    "this effect, in exactly this style, on a plain flat dark grey background.\n\n"
    "Top row, left to right, each part alone on its own, in the same camera and at the same size, "
    "evenly spaced: (1) the core stream, the narrow white-hot jet leaving the staff; (2) the flame body, "
    "the main mass of fire filling the cone; (3) the edge licks, the separate flame tongues peeling off "
    "its sides and far end; (4) the embers and sparks; (5) the smoke.\n\n"
    "Middle row, left to right: (6) the ground scorch the spray leaves on pale stone; (7) the warm light "
    "it throws on the ground, as a soft glow shape on pale stone; (8) a single flame tongue drawn large, "
    "showing its colour bands from core to edge; (9) the colour ramp of the fire as five flat swatches "
    "from hottest to coolest.\n\n"
    "Bottom row: the whole effect assembled from those parts, wide across the sheet, with a tiny wizard "
    "in a red robe and pointed hat at its narrow end for scale. No text, no labels, no numbers."
)


def write(name: str, body: str) -> None:
    (HERE / f"{name}.txt").write_text(body, encoding="utf-8")


if __name__ == "__main__":
    for key, style in STYLES.items():
        for subject_name, subject in (("spray", SPRAY), ("floor", FLOOR), ("floor2", FLOOR2), ("ring", RING)):
            name = f"{key}-{subject_name}"
            write(name, HEAD.format(name=name) + SCENE.format(subject=subject, style=style))
    write("sheet", SHEET.format(name="sheet"))
    print("written to", HERE)
