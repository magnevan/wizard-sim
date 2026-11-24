"""Writes the courtyard paint-over prompts: our grey-box (the kit scene, editor screenshots) repainted as finished art,
keeping the layout, so the concept art matches what we build (the user, 2026-11-24). One prompt per view.

  python tools/concept-gen/prompts/2026-11-24-court-paintover/make.py
"""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
BODY = """Generate one image with your image generation tool, then save it as {out}.png in the current directory. Reply with just the file name.

The first attached image is a screenshot of a level in our game, a grey-box blockout of the wizard academy's courtyard: {what} The plain pale-grey boxes with flat blue-grey roofs are placeholder buildings; the flat pale floors are placeholder paving; the gilded armillary, the towers, piers and lamps are already finished pieces. The second attached image is concept art of the same academy, showing the look we want.

Repaint the first image as a finished stylised 3D game level in the look of the second: warm morning light, warm sandstone, blue slate roofs with gold trim, tall arched windows, arcades, carved doorways, blue banners with gold stars, flower boxes, small trees in planters, inlaid compass medallions and coloured channels in the paving, violet magic glinting in cracks.

Keep the layout exactly: the same camera, the same framing and image size, every terrace, curved retaining wall, balustrade, stair, ring of steps, tower, pier and the armillary in the same place at the same size. Where the screenshot has a grey box, paint the real academy building filling that same box, with its doors facing the plaza. Paint real materials on every floor: flagstones, cobbles on the roads, grass and woods on the land. Leave out the small numbered circles and anything that looks like interface. No text."""
VIEWS = {
    'court-whole': 'the whole courtyard from above: the great hall at the top with the north road between its two halves, a curved balcony road, two flights down to a middle terrace with a library (left) and workshops (right), a round sunk plaza with the armillary at its heart, a sea court and the sea stair down to a quay, with the sea round it and a river and bridge at the right.',
    'court-plaza': 'the round sunk plaza with the armillary on its dais at the centre, the ring of steps round it, the overlook bay on the balcony wall above with two lamp posts, and the two flights coming down either side.',
    'court-sea': 'the sea stair: from the plaza rim down two flights past a landing to the quay on the sea, between two round gate piers with blue banners at the top, the sea court\'s curved retaining wall to either side.',
}
for out, what in VIEWS.items():
    open(os.path.join(HERE, f'{out}.txt'), 'w', encoding='utf-8', newline='\n').write(BODY.format(out=out, what=what) + '\n')
print(len(VIEWS), 'prompts')
