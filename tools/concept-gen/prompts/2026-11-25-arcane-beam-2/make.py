"""Arcane beam, round 2 of concepts (2026-11-25): the user's two directions after the 3D beam's round 4 ("not inspiring").

    python make.py   (writes the prompt files beside it; run each with tools/concept-gen/gen.sh <prompt> <out> plaza-26.jpg)

Reference image: tools/port-3d-review/img/plaza-26.jpg (the court at the game camera, two wizards, a row of goblins).
"""
from pathlib import Path

HERE = Path(__file__).parent

BASE = """Generate one image with your image generation tool, then save it as {name}.png in the current directory. Reply with just the file name.

The attached image is a screenshot of our stylised 3D co-op wizard game: a warm sandstone courtyard seen from the game's high camera, two small wizards and a row of goblins. Repaint exactly this scene, same camera, same layout, same soft stylised 3D look, and add one spell: the left wizard is channelling an Arcane beam, a straight continuous beam of raw magenta-violet magical energy from the tip of the staff to the nearest goblin, which it is hitting. The beam is about as wide as a wizard's hat at its widest glow; it stays straight from staff to goblin. Arcane is raw energy, magenta, violet and white; it must not look like fire, lightning or a laser pointer.

{look}

Keep the rest of the scene as in the screenshot. No text, no UI."""

LOOKS = {
    'plasma-core-1': """The look: a blazing white-hot core line with no hard edge, falling off sharply into a soft magenta glow, and around it a loose, wispy cloud of violet plasma that is slowly peeling away from the beam and drifting off and down, like smoke from something burning too hot. Bright pulses of light race along the beam from the staff to the goblin: show two or three of them in this frozen moment, each lighting up the plasma cloud around it. Where it hits, the goblin is lit magenta and the plasma splashes and curls off it.""",
    'plasma-core-2': """The look: an intensely glowing core, white at the centre, with no outline at all: its light just fades fast into magenta and violet. Wisps and tendrils of glowing plasma drift off the beam all along its length, thicker near the goblin, dissolving as they fall away. Pulses of brighter light travel down the beam, visible as bright swellings in the core and as glow cast onto the surrounding plasma wisps and onto the floor below. At the goblin, energy spills over its body in curling wisps.""",
    'particles-1': """The look: the beam is made entirely of an immense number of tiny glowing magenta, pink and white particles streaming from the staff to the goblin at tremendous speed, so fast they draw short bright streaks; densest and whitest along the middle, thinning out at the edges where stray particles fly a little off the line. There is no solid tube and no outline: the beam's shape is the stream of particles. Where it hits, particles burst and scatter off the goblin.""",
    'particles-2': """The look: a torrent of countless tiny plasma motes, magenta and violet with white-hot ones in the middle, racing along the beam's line so fast each is a short streak; the stream is dense and bright in its middle and frays into scattered sparks at its edges, with a faint glow haze around the whole stream. A few motes spiral loosely around the main stream. At the goblin, the stream breaks against it in a fan of sparks.""",
    'hybrid-1': """The look: a mix of two ideas. A strong white-hot core with no hard edge, falling off sharply into magenta glow; a dense stream of tiny bright particles racing along and around the core at great speed; and a wispy violet plasma haze peeling off the beam and drifting away. Bright pulses travel down the beam and light up the haze and particles around them. At the goblin, sparks and plasma splash off its body.""",
}

for name, look in LOOKS.items():
    (HERE / f'{name}.txt').write_text(BASE.format(name=name, look=look), encoding='utf-8')
print('ok', len(LOOKS))
