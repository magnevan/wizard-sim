"""Writes the prompts for the courtyard's woods: three trees from the concept art, each isolated.

  python tools/concept-gen/prompts/2026-11-23-court-setpieces/make_trees.py
"""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
BODY = """Generate one image with your image generation tool, then save it as setpiece-tree-{name}.png in the current directory. Reply with just the file name.

The attached image is the academy courtyard's concept art: stylised, hand-painted, warm light, lush woods round the walls.

Draw one single {what} in exactly that style, as a game asset on a plain light grey background, seen from slightly above in a three-quarter view: {detail} The whole tree from its roots to its crown, standing upright, about {hw} as tall as its crown is wide. Nothing else in the image: no ground, no grass, no shadow, no other plants, no text."""
TREES = {
    'oak': ('broad oak tree', 'a sturdy brown trunk, a round, full crown of rich green leaves in soft clumps, with a few warm golden highlights.', 'one and a half times'),
    'pine': ('tall conifer', 'a straight trunk and a narrow, layered crown of dark blue-green needles, pointed at the top.', 'three times'),
    'blossom': ('flowering tree', 'a slender trunk and a round crown covered in violet and pink blossom, like the purple-flowering trees in the attached image.', 'one and a half times'),
}
for name, (what, detail, hw) in TREES.items():
    open(os.path.join(HERE, f'setpiece-tree-{name}.txt'), 'w', encoding='utf-8', newline='\n').write(BODY.format(name=name, what=what, detail=detail, hw=hw) + '\n')
print(len(TREES), 'prompts')
