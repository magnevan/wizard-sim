"""Writes the infirmary plan H paint-over prompts: the plan H revision 2 grey-box (tools/infirmary-review/img/h1-*.png)
painted as concept art in the infirmary concept's style, keeping the layout. For the user only (making-a-place.md).

  python docs/reference/infirmary-kit/paintovers-h/prompts/make.py
Refs per prompt: the render, docs/reference/element-order/area-life-v2.jpg, tools/infirmary-review/img/plan-h-1.jpg
"""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
BODY = """Generate one image with your image generation tool, then save it as {out}.png in the current directory. Reply with just the file name.

The first attached image is a screenshot of a level in our game, a grey-box blockout of a wizard academy's infirmary on a clifftop crescent round a small sheltered cove: {what} Flat green is placeholder ground; flat pale floors are placeholder paving; the plain white box with dark window slots is a placeholder for the battery's boiler house. The tents with cots, the glasshouse, the gilded well with its green crystal, the brick smokestack, the balustrades, stairs, cliffs and jetty are already finished pieces. The second attached image is concept art of this same infirmary, showing the look and mood we want. The third attached image is an earlier painting of this same plan.

Paint the first image as finished concept art of a stylised 3D game level in the look of the second: the morning monsters broke through the academy's wall, soft warm morning light with sea haze. The well is a Life well that taps the magical field: a gilded cage on a round stepped dais with a glowing green crystal at its heart, choked by thick flowering vines with pale glowing blossoms. Glowing green rune glyphs carved into the paving run as walkable paths from the well's dais out to everything it feeds: to the grand glasshouse, to the healing devices in the tents, down to the cove, and along the road east. Round the edges of the broad open forecourt a triage camp has been pitched in a hurry: open white tents with gold stars at odd angles, wounded soldiers in dented armour on cots and on stretchers laid on the ground between the tents, nurses in green aprons rushing between them, brass healing devices with green glowing lenses beside the cots, crates and bandages; the middle of the forecourt round the well stays open paving. Warm sandstone balustrades and retaining walls, worn flagstones, grey cobbles on the road, lush grass, flowers in violet, white and yellow, dense woods of birch and blossoming trees round the edges, a sandy beach in the cove and the bright sea.

Keep the layout exactly: the same camera, the same framing and image size, every terrace, retaining wall, balustrade, stair, cliff, path, road, tent, jetty and building in the same place at the same size, and the open paving left open. Paint real materials on every surface: flagstones on the paved floors, cobbles on the road, grass, flower beds and trees on the green ground. Fill the dark area above the ground with more woods and sky. No text."""
GREENHOUSE = 'grand glasshouse of gilded iron and glass with wisteria climbing it, its panes glowing green inside with lush plants'
FARM = 'farmland of green and golden crop rows behind a low stone wall running on past the left edge'
STAIR_W = 'the built sandstone stair on the west of the cove going down to the beach'
BROKEN_E = 'on the east of the cove the retaining wall that broke this morning: in the place of the stair there, a fresh collapse of sandstone blocks and rubble forming a rough ramp from the beach back up to the clifftop, broken balustrade lying in the sand'
PURIFIER = 'at the end of the jetty, the sea-water purifier: a brass and sandstone pavilion with a green crystal that draws sea water up through brass intake pipes, glowing green as Life magic cleans it, a clean water channel running back along the jetty'
BOILER = "the battery's boiler house, a soot-stained brick and sandstone building with arched windows and iron doors, the tall brick smokestack beside it trailing smoke"
ROAD = 'the cobbled road east with a glowing glyph path running along it and iron lanterns lit along its far side'
VIEWS = {
    'overview': f'the whole place from the game camera: the north road arriving at the top into a broad paved forecourt, the well in its middle, rows of tents round the forecourt\'s edges, the {GREENHOUSE} at the left by {FARM}; at the bottom the cove: {STAIR_W}, {BROKEN_E}, a sandy beach, and {PURIFIER}; at the right {BOILER} and {ROAD}.',
    'arrival': f'arriving down the north road: a wizard walks down it into the broad paved forecourt, triage tents along the forecourt\'s top and side edges, the well with its glowing crystal in the middle, open paving all round it.',
    'forecourt': f'the forecourt: the well in the middle on its round dais, triage tents along the top and both side edges, a wizard on the open paving, the north road leaving at the top, and at the bottom the top of the cove\'s cliff and balustrade; the grass wedge at the bottom middle is a flower garden above the cliff.',
    'cove': f'the cove below the forecourt: {STAIR_W} (the double flight on the left), {BROKEN_E} (the flight on the right), a curved cliff of rock at the back, the sandy beach with a wizard on it, and {PURIFIER}, the sea at the bottom with rocky cliffs on both sides.',
    'road': f'the road east: {ROAD}, a wizard walking on it, {BOILER} on the grass above the road, the edge of the forecourt with a triage tent at the upper left, the top of the cove\'s stair at the left, the long balustrade along the cliff at the bottom.',
}
VIEWS['overview-2'] = VIEWS['overview']
TAKE2 = '\n\nThis is a second take: a slightly later, brighter hour, with more urgency in the camp and the glyph paths glowing brighter.'
for out, what in VIEWS.items():
    text = BODY.format(out=out, what=what) + (TAKE2 if out == 'overview-2' else '')
    open(os.path.join(HERE, f'{out}.txt'), 'w', encoding='utf-8', newline='\n').write(text + '\n')
print(len(VIEWS), 'prompts')
