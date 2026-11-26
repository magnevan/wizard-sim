"""Writes the infirmary paint-over prompts: the round 7 grey-box (tools/infirmary-review/img/r7-*.png) painted as
concept art in the infirmary concept's style, keeping the layout. For the user only (making-a-place.md).

  python docs/reference/infirmary-kit/paintovers/prompts/make.py
Refs per prompt: the render, docs/reference/element-order/area-life-v2.jpg, docs/reference/court-kit/court-whole-paintover.png
"""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
BODY = """Generate one image with your image generation tool, then save it as {out}.png in the current directory. Reply with just the file name.

The first attached image is a screenshot of a level in our game, a grey-box blockout of a wizard academy's infirmary on a slope above the sea: {what} Flat green is placeholder ground; flat pale floors are placeholder paving; the tents with cots, the glasshouse, the copper stills shed under a blue roof, the caged well with its green crystal, the brass pipes, the brick smokestack, the balustrades and stairs are already finished pieces. The second attached image is concept art of this same infirmary, showing the look and mood we want. The third attached image shows how an earlier grey-box of ours was painted into a finished place.

Paint the first image as finished concept art of a stylised 3D game level in the look of the second: the morning things broke, soft warm morning light with sea haze. Wounded students lie on cots under the open white tents with gold stars, nurses in green aprons tending them, lanterns dark. At the heart the gilded cage of the well with the green crystal, choked by thick flowering vines with pale glowing blossoms that spill over its dais and climb the pipes. The brass conduit pipes with blue bands run from the well to the glasshouse (its panes cracked, wisteria bursting through), to the copper distillery shed, to the tents and down to the stone bath on the shore. Flowers burst from beds and planters everywhere, violet, white and yellow. Warm sandstone walls and balustrades, worn flagstones, grey cobbles on the road, lush grass, dense woods of birch and blossoming trees round the edges, the brick smokestack of the battery standing by the road to the east, a sandy shore and the bright sea.

Keep the layout exactly: the same camera, the same framing and image size, every terrace, retaining wall, balustrade, stair, path, road, planter and building in the same place at the same size, and the pipes along the same routes. Paint real materials on every surface: flagstones on the paved floors, cobbles on the road, grass, flower beds and trees on the green ground. Fill the dark area above the ground with more woods and sky. No text."""
VIEWS = {
    'overview': 'the whole place from above: the north road arriving at the top between two open tents of cots, the caged well on a round dais in the middle of the upper terrace, the glasshouse on the left, the copper distillery shed and a cobbled road running east past the brick smokestack on the right, two stairs down a long terraced wall to the shore with a small stone bath, and the sea at the bottom.',
    'overview-2': 'the whole place from above: the north road arriving at the top between two open tents of cots, the caged well on a round dais in the middle of the upper terrace, the glasshouse on the left, the copper distillery shed and a cobbled road running east past the brick smokestack on the right, two stairs down a long terraced wall to the shore with a small stone bath, and the sea at the bottom.',
    'arrival': 'arriving down the north road: a wizard walks down it towards the top terrace with the two open tents of cots, the caged well on its dais below them, a stair down on the left, the glasshouse at the lower left and the brass pipes spreading out from the well.',
    'overlook': 'the heart of the place: the caged well with its green crystal on a round stepped dais, the two tents of cots on the terrace behind, the glasshouse on the left, brass pipes branching from the well, the cobbled road on the right, two small planters at the lower left and the top of a stair at the bottom.',
    'shore': 'the shore: a wide stair down the terraced wall on the left, a stone bath behind a balustrade fed by a brass pipe in the middle, a second stair running down the wall on the right, a wizard on the paved shore, benches, a stand and lamps along the wall, a long balustrade along the sea at the bottom.',
    'road': 'the cobbled road to the east: the copper distillery shed under its blue roof beside it with a brass pipe running to it, a tent of cots at the upper left, the tall brick smokestack of the battery beside the road, a wizard walking the road, the long terraced wall below with a rocky cliff at the lower right.',
}
TAKE2 = '\n\nThis is a second take: try a slightly later, brighter hour, with more people and more flowers.'
for out, what in VIEWS.items():
    text = BODY.format(out=out, what=what) + (TAKE2 if out == 'overview-2' else '')
    open(os.path.join(HERE, f'{out}.txt'), 'w', encoding='utf-8', newline='\n').write(text + '\n')
print(len(VIEWS), 'prompts')
