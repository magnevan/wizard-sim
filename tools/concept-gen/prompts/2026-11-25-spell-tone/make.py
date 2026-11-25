"""Write the prompts for the spell-tone concepts (2026-11-25): Arcane beam, Earth rock, Cold nova, and a family sheet.

Same method as ../2026-11-25-spell-fire/make.py: a fixed scene paragraph plus one "Style:" paragraph, so the
pictures differ only in how the spell is drawn. The fire round's chosen toon fire is attached as a second
reference, so every spell is drawn in its family. Run: python make.py

References for every scene prompt, in this order:
  1. tools/port-3d-review/img/plaza-26.jpg              (the court, the camera, the sizes)
  2. docs/reference/spell-concepts/fire/toon-spray-2.jpg (the style family)
The family sheet adds the best take of each spell as references 3 to 5 (named in the exploration).
Each take ran in its own folder (two runs into one folder overwrite each other's log).
It writes every style x subject; only the .txt files kept beside it were sent. Saved names:
toon-beam2 -> arcane/toon-beam-3, -4; toon-rock2 -> earth/toon-rock-3; family-sheet -> family/toon-sheet-1, -2.
"""
from pathlib import Path

HERE = Path(__file__).parent

HEAD = "Generate one image with your image generation tool, then save it as {name}.png in the current directory. Reply with just the file name.\n\n"

SCENE = (
    "The first attached image is a screenshot of our game: a stylised 3D action game seen from a steep camera "
    "about 46 degrees down, looking north over a warm sandstone courtyard in morning sun. The wizards are "
    "small (the red and the blue wizard in robes and pointed hats); goblins stand in a row behind them. "
    "The second attached image is concept art for our Fire spray in the same courtyard: it shows the style "
    "every spell in the game is drawn in.\n\n"
    "Repaint the first image as a finished frame of the game with the same camera, framing, courtyard, light "
    "and sizes, and add one spell effect, which is the subject of the picture. {subject}\n\n"
    "{style}\n\n"
    "The spell must stand out clearly against the warm, pale orange stone floor: it is a spell in a game, "
    "and a player must read its exact shape at a glance from this high camera. Keep the courtyard, the "
    "stairs, the balustrades and the goblins as they are. No fire in this picture. No text, no labels, no UI."
)

BEAM = (
    "The red wizard is casting an Arcane beam: one straight, continuous beam of raw arcane energy that "
    "leaves the tip of his staff and strikes the goblin standing on the red stripe, up and to the left, "
    "about four wizard heights away, pinning it. The beam is magenta and violet: a blazing white-hot core "
    "line running its whole length, a thicker magenta-violet body around it with brighter surges racing "
    "along it toward the goblin like pulses, and a soft magenta halo round the whole beam. A bright flare "
    "where it leaves the staff, a splash of energy where it hits the goblin. Strong magenta light on the "
    "floor along its length and on the goblin. The blue wizard stands aside, watching."
)

ROCK_FLIGHT = (
    "The red wizard has just hurled an Earth rock missile: one rough boulder of brown-grey stone, about as "
    "wide as a goblin is tall, tumbling through the air at waist height halfway between him and the goblin "
    "on the red stripe, flying north up the picture toward that goblin. Behind it trails a short wake of "
    "tan dust and grit and a few small pebbles, showing where it came from. Its soft shadow lies on the "
    "floor under it. It is heavy, solid and fast: stuff, not energy, with no glow. The blue wizard stands "
    "aside, watching."
)

ROCK_IMPACT = (
    "The moment an Earth rock missile, a rough brown-grey boulder the red wizard threw, smashes into the "
    "goblin standing on the red stripe: the boulder bursts into a spray of stone shards and chunks flying "
    "outward and up, a ring of tan dust rolls out low along the floor from the point of impact, about as "
    "wide as a wizard is tall, and the stone floor under it is cracked in a star. The goblin is knocked "
    "backward off its feet. It is heavy and solid: stuff, not energy, with no glow. The red wizard is "
    "still following through from the throw; the blue wizard stands aside."
)

NOVA = (
    "The blue wizard has just cast a Cold nova: a single serrated front of ice rolling outward from his "
    "feet in a full circle across the floor, caught at the moment it is about one and a half wizard heights "
    "out from him, about to hit the goblins. The front is one connected ring of jagged, knee-high ice "
    "crystals, pale cyan and white, with a bright white leading edge that is shattering into glittering "
    "shards as it goes, and cold white mist spilling off its outer side. Inside the ring the stone is left "
    "coated in white frost and rime. The red wizard stands well back, outside the ring."
)

# Round 2: every first beam came back as a thin laser with a pink wash, and the rock's dust wake was faint.
BEAM2 = (
    "The red wizard is casting an Arcane beam at three runes: one straight, continuous beam of raw arcane "
    "energy that leaves the tip of his staff and strikes the goblin standing on the red stripe, up and to "
    "the left, about four wizard heights away. It is not a thin laser: it is a thick, heavy rope of "
    "magenta-violet plasma about as wide as the wizard's hat, with real volume and soft round toon shading, "
    "a blazing white-hot core line down its middle, a dark violet rim along its edges, and three or four "
    "bright swellings racing along it toward the goblin like pulses through a hose. A tight violet halo "
    "hugs it. A bright flare at the staff, a splash of energy and violet sparks where it hits the goblin. "
    "Magenta light falls on the floor in a narrow strip under the beam only. The blue wizard stands aside."
)

ROCK2 = (
    "The red wizard has just hurled an Earth rock missile: one rough boulder of grey-brown stone with a "
    "dark underside, about as wide as a goblin is tall, tumbling through the air at waist height halfway "
    "between him and the goblin on the red stripe, flying north up the picture toward that goblin. Behind "
    "it trails a thick wake of billowing dust about as long as the wizard is tall: chunky toon-shaded "
    "puffs, darker ochre-brown than the floor, thinning toward the wizard, with grit and small pebbles "
    "falling out of it. Its sharp shadow lies on the floor under it. It is heavy, solid and fast: stuff, "
    "not energy, with no glow. The blue wizard stands aside, watching."
)

STYLES = {
    # the family: the chosen fire's look carried to another element
    "toon": (
        "Style: volumetric toon spell effects, the same family as the Fire spray in the second attached "
        "image. The effect is one thick body that looks three dimensional, with soft round toon shading: a "
        "blazing white-hot or very bright core, the element's saturated colour around it, a thin darker rim "
        "where it meets the air, and the element's own residue where it has any (dust, frost, mist) in a "
        "darker or paler value than the floor. It casts strong coloured light on the floor and on the "
        "goblins. Bold, clean, readable shapes; neither realistic nor flat."
    ),
    # alternative 1: chunkier and more painterly
    "chunky": (
        "Style: the same volumetric toon family as the Fire spray in the second attached image, pushed "
        "chunkier and more painterly: fewer, bigger shapes, each one blocky and heavy with visible "
        "hand-painted brushwork, strongly simplified forms, deep dark values in the shadows and rims and "
        "very bright highlights, like a hand-painted fantasy game. Coloured light on the floor under it."
    ),
    # alternative 2: crisper
    "crisp": (
        "Style: the same volumetric toon family as the Fire spray in the second attached image, pushed "
        "crisper: harder-edged toon shading in two or three clear tone steps, sharp clean silhouettes, fine "
        "bright highlights and thin bright edges, precise and glassy, still lit and three dimensional in the "
        "courtyard, never a flat sticker. Coloured light on the floor under it."
    ),
}

SUBJECTS = {"beam": BEAM, "rock": ROCK_FLIGHT, "impact": ROCK_IMPACT, "nova": NOVA, "beam2": BEAM2, "rock2": ROCK2}

FAMILY = (
    "Generate one image with your image generation tool, then save it as {name}.png in the current "
    "directory. Reply with just the file name.\n\n"
    "The first attached image is a screenshot of our game: a stylised 3D action game seen from a steep "
    "camera about 46 degrees down, looking north over a warm sandstone courtyard in morning sun, two small "
    "wizards in front of a row of goblins. The other four attached images are concept art for four of our "
    "spells in that courtyard: a Fire spray, an Arcane beam, an Earth rock missile and a Cold nova.\n\n"
    "Repaint the first image as one finished frame of a four-player game with the same camera, framing, "
    "courtyard, light and sizes, with four wizards in the same robes and pointed hats (red, blue, green and "
    "yellow) spread across the open floor in front of the goblins, each casting one of the four spells, "
    "drawn exactly as in its concept art, so the four read side by side:\n"
    "- far left, the red wizard: the Fire spray, a cone of volumetric toon flame with a white-hot core at "
    "the staff and dark smoke off its far end, into the goblins on the left;\n"
    "- left of middle, the green wizard: an Earth rock missile, a "
    "tumbling brown-grey boulder in flight with a dust wake, about to hit a goblin;\n"
    "- right of middle, the yellow wizard: an Arcane beam, a straight magenta-violet beam with a white-hot "
    "core from the staff to a goblin;\n"
    "- far right, the blue wizard: a Cold nova, a serrated ring of pale cyan and white ice rolling out from "
    "his feet with frost left on the stone inside it.\n\n"
    "Every spell is in the same style: volumetric toon effects with a bright core, a saturated body, a "
    "darker rim, residue where the element has any and coloured light on the floor. Each must stand out "
    "clearly against the warm, pale orange stone floor and not overlap the others. No text, no labels, no UI."
)


def write(name: str, body: str) -> None:
    (HERE / f"{name}.txt").write_text(body, encoding="utf-8")


if __name__ == "__main__":
    for key, style in STYLES.items():
        for sname, subject in SUBJECTS.items():
            name = f"{key}-{sname}"
            write(name, HEAD.format(name=name) + SCENE.format(subject=subject, style=style))
    write("family-sheet", FAMILY.format(name="family-sheet"))
    print("written to", HERE)
