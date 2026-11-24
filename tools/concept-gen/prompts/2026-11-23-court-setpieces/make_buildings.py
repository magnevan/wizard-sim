"""Writes the prompts for the courtyard's three buildings as set pieces, isolated from our grey-box paint-overs
(docs/reference/court-kit/court-whole-paintover.png, court-plaza-paintover.png).

  python tools/concept-gen/prompts/2026-11-23-court-setpieces/make_buildings.py
"""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
BODY = """Generate one image with your image generation tool, then save it as setpiece-{name}.png in the current directory. Reply with just the file name.

The attached images are paintings of our wizard academy's courtyard: stylised 3D, warm sandstone, blue slate roofs with gold trim, warm morning light.

Draw {what} from those paintings on its own, as a single game asset on a plain light grey background, seen from slightly above in a three-quarter view from its front corner, so its front and one side show. {detail} Its footprint is a simple rectangle about {fp} as deep as it is wide, standing on a low moulded plinth; the whole building is about {hw} as tall as it is wide. It is solid all round: walls on every side, a complete roof. Nothing else in the image: no courtyard, no ground beyond the plinth, no people, no text."""
B = {
    'library': ('the library (the building on the left wing of the middle terrace)',
                'Two storeys of warm sandstone with tall arched windows, a carved arched doorway with double wooden doors in the middle of its front under a small gabled porch, a blue banner with a gold star beside the door, flower boxes under the lower windows, a steep blue slate roof with gold ridge trim and two dormers.',
                'nine tenths', 'four fifths'),
    'workshops': ('the workshops (the building on the right wing of the middle terrace)',
                  'Two storeys of warm sandstone with arched windows, a wide arched doorway with heavy wooden doors in the middle of its front, a brass pipe and a small copper chimney on one side, a blue banner with a gold star, a steep blue slate roof with gold trim and a small brass weathervane.',
                  'nine tenths', 'four fifths'),
    'hall-half': ('one half of the great hall (the tall building at the top, split in two by the north road)',
                  'A tall, narrow wing of warm sandstone, three storeys, with tall arched windows with gold tracery, a grand arched doorway at the bottom of its front, buttresses at its corners, a blue banner with a gold star, and a steep blue slate roof rising to a gilded spire.',
                  'just over one times', 'twice'),
}
for name, (what, detail, fp, hw) in B.items():
    open(os.path.join(HERE, f'setpiece-{name}.txt'), 'w', encoding='utf-8', newline='\n').write(
        BODY.format(name=name, what=what, detail=detail, fp=fp, hw=hw) + '\n')
print(len(B), 'prompts')
