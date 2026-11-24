"""Writes the texture prompts (one per material) into this folder: tex-<name>.txt. Run once; the .txt files are the record.

  python tools/concept-gen/prompts/2026-11-24-textures/make.py
"""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
COMMON = ("The attached image is the academy courtyard this texture is for: stylised, hand-painted, warm sandstone, gold "
          "trim, warm light.\n\nDraw a seamless tileable texture of {desc}, in exactly that painted style, {view}, filling "
          "the whole square image edge to edge. Evenly lit, flat, with no shadows, no vignette, no perspective, no objects "
          "and no text. The pattern repeats cleanly when the image is tiled side by side.")
TOP, FACE = 'seen straight down from above', 'seen straight on, face-on'
TEX = {
    'paving': ('warm sandstone flagstones of mixed rectangular sizes in a running bond with thin mortar joints, gently '
               'worn, like the courtyard floor in the attached image', TOP),
    'plaza': ('large square cream sandstone slabs, smooth and slightly polished, with thin joints, lighter than ordinary '
              'paving, about four slabs across the image', TOP),
    'road': ('rounded cobblestones in warm grey and brown, tightly set in sand, a little worn on top', TOP),
    'lawn': ('short, lush stylised grass with a few tiny pale flowers and clover', TOP),
    'rock': ('rough natural cliff rock in warm grey-brown, broken into chunky facets with dark cracks', TOP),
    'deck': ('weathered timber planks running from left to right with small iron nails, warm brown', TOP),
    'ashlar': ('a wall of dressed warm sandstone blocks laid in regular horizontal courses, each block about twice as '
               'long as it is tall, with thin mortar joints and softly chipped edges, about six courses tall', FACE),
    'water': ('calm sea water seen from above, deep teal-blue with soft painted ripples and a few small bright glints, '
              'stylised and hand-painted like the sea in the attached image', TOP),
    'woods': ('a shady forest floor of fallen leaves in warm browns and golds, small ferns, moss and a few pine needles', TOP),
    'dirt': ('a packed earth footpath in warm light brown, with a few small pebbles and faint footprints, worn smooth', TOP),
    'sand': ('fine pale golden sand with soft ripples and a few tiny shells and pebbles, as on a sheltered shore', TOP),
    'smooth-stone': ('a smooth, fine-grained warm sandstone surface with faint tooling marks and a few soft stains, '
                     'for stair treads and kerbs', TOP),
    'plinth': ('the foundation of a sea wall: massive dark weathered sandstone blocks in grey-brown, larger than ordinary '
               'wall blocks, in about three regular courses, wet and stained, with patches of green moss and a few small '
               'barnacles and limpets in the joints', FACE),
}
for name, (desc, view) in TEX.items():
    body = (f"Generate one image with your image generation tool, then save it as tex-{name}.png in the current "
            f"directory. Reply with just the file name.\n\n" + COMMON.format(desc=desc, view=view) + "\n")
    open(os.path.join(HERE, f'tex-{name}.txt'), 'w', encoding='utf-8', newline='\n').write(body)
print(len(TEX), 'prompts')
