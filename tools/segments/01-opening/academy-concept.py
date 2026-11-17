"""The academy round the drill yard, as an art-free concept (2026-11-15): writes the plan and the section as SVG
into img/, and turns the grey-box shots from the game (npm run massing in game/, art/massing.ts) into page images.

Usage: python tools/segments/01-opening/academy-concept.py   (after `node scripts/massing-shots.mjs` in game/)

The block sizes here mirror game/packages/client/src/art/massing.ts (plan units, metres for height).
1 u is about 0.6 m: a wizard is 0.9 u across and 1.8 m tall."""
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, 'img')
SHOTS = os.path.join(HERE, '../../../game/shots/massing-academy')
M = 1 / 0.6  # units per metre

# the yard as built (yard-level.py)
W, H = 90, 68
STRAW = [(16, 40), (19.5, 39.4), (23, 40), (26.5, 39.4)]
HEAVY, RING, RETREAT, PARRY, PARRY_HOME = (14.5, 31), (10.5, 27.5), (28, 21.5), (39, 32.5), (61, 32.5)
HANDS, FOCUS, GATE, START = (69, 16), (54, 9.5), (46, 7.6), (24, 53)
PATH = [(23.6, 56), (22.6, 47), (19, 43), (16.5, 36.5), (17.5, 30.5), (24, 25.5), (31, 25), (36, 30.5), (50, 32.6), (59, 28.5),
        (62, 22.5), (62, 14), (58, 10.5), (50, 9.5), (46, 7.5), (46, 0)]
# the concept's blocks (massing.ts)
HALL_E, NORTH_S, GATE_X = 6, 4, 46
HALL = (HALL_E - 22 * M, NORTH_S - 2 * M, HALL_E, NORTH_S + 33 * M)
WORKS = (HALL_E - 2 * M, NORTH_S - 12 * M, 104, NORTH_S)
TOWER = (GATE_X - 3.5 * M, NORTH_S - 10 * M, GATE_X + 3.5 * M, NORTH_S + 1 * M)
DOOR_Y = HALL[1] + 25.5 * M
# the proposed route: out of the hall's door, the lessons along the two ranges, out through the passage
ROUTE = [(10, DOOR_Y), (14, 38), (14, 20), (18, 12), (40, 10.5), (58, 11), (GATE_X + 4, 8.5), (GATE_X, 5.6)]
ROUTE_STOPS = [('Strike lanes', 14, 33), ('Heavy and the slam ring', 15, 17), ('Parry lane', 30, 10.5), ('Hands ring', 60, 14), ('Rack', 52, 8)]
SEEN = 12  # within this many units of a facade, some of it is on screen


def svg_plan():
    S, ox, oy = 8, 16, 18  # px per unit, and the margin past the map's top-left
    vw, vh = int((W + ox + 6) * S), int((H + oy + 8) * S)
    X = lambda x: round((x + ox) * S, 1)
    Y = lambda y: round((y + oy) * S, 1)
    rect = lambda x0, y0, x1, y1, **a: f'<rect x="{X(x0)}" y="{Y(y0)}" width="{round((x1 - x0) * S, 1)}" height="{round((y1 - y0) * S, 1)}" ' + ' '.join(f'{k.replace("_", "-")}="{v}"' for k, v in a.items()) + '/>'
    text = lambda x, y, s, size=13, anchor='start', w='400', fill='#2b2620': f'<text x="{X(x)}" y="{Y(y)}" font-size="{size}" text-anchor="{anchor}" font-weight="{w}" fill="{fill}">{s}</text>'
    pts = lambda P: ' '.join(f'{X(x)},{Y(y)}' for x, y in P)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vw} {vh}" font-family="system-ui, sans-serif">',
         f'<rect width="{vw}" height="{vh}" fill="#efe9dc"/>',
         '<defs><pattern id="seen" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" fill="#e3d6a8"/><line x1="0" y1="0" x2="0" y2="10" stroke="#d2bf7c" stroke-width="3"/></pattern></defs>',
         rect(0, 0, W, H, fill='#cfdcb4', stroke='#7d8b62', stroke_width=1.5),
         # where the academy is on screen: within SEEN of the west or north facade
         f'<path d="M{X(HALL_E)},{Y(HALL[3])} L{X(HALL_E + SEEN)},{Y(HALL[3])} L{X(HALL_E + SEEN)},{Y(NORTH_S + SEEN)} L{X(W)},{Y(NORTH_S + SEEN)} L{X(W)},{Y(NORTH_S)} L{X(HALL_E)},{Y(NORTH_S)} Z" fill="url(#seen)" opacity=".9"/>',
         f'<polyline points="{pts(PATH)}" fill="none" stroke="#8a6a44" stroke-width="2.5" stroke-dasharray="3 6" stroke-linecap="round"/>']
    for x, y in STRAW + [HEAVY, RETREAT, PARRY, HANDS, FOCUS]:
        o.append(f'<circle cx="{X(x)}" cy="{Y(y)}" r="5" fill="none" stroke="#8a6a44" stroke-width="2"/>')
    o.append(f'<polyline points="{pts(ROUTE)}" fill="none" stroke="#b5402a" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>')
    for name, x, y in ROUTE_STOPS:
        o += [f'<circle cx="{X(x)}" cy="{Y(y)}" r="6" fill="#b5402a"/>', text(x + 1.6, y + 0.6, name, 13, w='600', fill='#8e2f1d')]
    # the buildings
    for b, fill in ((WORKS, '#8d8676'), (HALL, '#9c9483'), (TOWER, '#6f685b')):
        o.append(rect(*b, fill=fill, stroke='#3f3a32', stroke_width=1.5))
    for k in range(7):
        y = HALL[1] + (3 + 5 * k) * M
        o.append(rect(HALL_E, y - 0.75, HALL_E + 2, y + 0.75, fill='#9c9483', stroke='#3f3a32', stroke_width=1))
    o += [rect(HALL_E - 1, DOOR_Y - 1.4, HALL_E + 0.4, DOOR_Y + 1.4, fill='#5b3d26'),
          rect(GATE_X - 1.2 * M, TOWER[3] - 0.6, GATE_X + 1.2 * M, TOWER[3] + 0.2, fill='#14161b')]
    hx = (HALL_E - 15) / 2
    o += [text(hx, 28, 'GREAT HALL', 16, 'middle', '700', '#fbf7ee'), text(hx, 30.6, '30 × 20 m inside:', 12, 'middle', fill='#fbf7ee'),
          text(hx, 32.6, 'the lecture hall', 12, 'middle', fill='#fbf7ee'), text(hx, 34.6, 'of beat 1', 12, 'middle', fill='#fbf7ee'),
          text(hx, 37.2, 'walls 14 m,', 12, 'middle', fill='#fbf7ee'), text(hx, 39.2, 'ridge 24 m', 12, 'middle', fill='#fbf7ee'),
          text(20, -5.5, 'WORKSHOPS', 16, 'start', '700', '#fbf7ee'), text(20, -3, 'three storeys (5 + 4 + 4 m), ridge 19 m, 12 m deep', 12, fill='#fbf7ee'),
          text(GATE_X, -14.5, 'GATE TOWER, 29 m', 12, 'middle', '700'), text(GATE_X, NORTH_S - 3.6, 'passage', 11, 'middle', fill='#fbf7ee'), text(GATE_X, NORTH_S - 1.8, 'to the battery', 11, 'middle', fill='#fbf7ee'),
          text(HALL_E + 1.2, DOOR_Y + 4.2, 'door, from beat 1', 11),
          text(HALL_E + SEEN + 1, 50, 'Hatched: within 12 u of a facade,', 12, fill='#6e5a1e'), text(HALL_E + SEEN + 1, 52.2, 'where some of the academy is on screen', 12, fill='#6e5a1e'),
          text(W - 1, H - 2, 'The yard as built: 90 × 68 u, 54 × 41 m', 12, 'end'),
          text(W - 1, H + 3, 'Brown dots: the route and stations as built. Red: the route proposed.', 12, 'end')]
    # scale bar, 10 m, and the camera's direction
    o += [rect(2, H + 2, 2 + 10 * M, H + 3, fill='#2b2620'), text(2, H + 5.6, '10 m (16.7 u)', 12),
          f'<path d="M{X(-12)},{Y(-12)} l18,18 M{X(-12)},{Y(-12)} l0,10 M{X(-12)},{Y(-12)} l10,0" stroke="#2b2620" stroke-width="2" fill="none"/>',
          text(-12, -13.4, 'top of the screen', 11)]
    o.append('</svg>')
    return '\n'.join(o)


def svg_section():
    S, base = 14, 470  # px per metre, ground line
    vw = 1240
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vw} 540" font-family="system-ui, sans-serif">', f'<rect width="{vw}" height="540" fill="#efe9dc"/>']
    Z = lambda z: round(base - z * S, 1)
    text = lambda x, y, s, size=13, anchor='start', w='400', fill='#2b2620': f'<text x="{x}" y="{y}" font-size="{size}" text-anchor="{anchor}" font-weight="{w}" fill="{fill}">{s}</text>'

    def person(x):
        h = 1.8 * S
        return (f'<circle cx="{x}" cy="{Z(1.8) + 3}" r="3.5" fill="#b5402a"/>'
                f'<path d="M{x},{Z(1.55)} L{x},{Z(0.8)} M{x - 4},{Z(1.35)} L{x + 4},{Z(1.35)} M{x},{Z(0.8)} L{x - 3},{base} M{x},{Z(0.8)} L{x + 3},{base}" stroke="#b5402a" stroke-width="2.4" fill="none"/>')

    def house(x0, w, eaves, ridge, fill, label, sub):
        x1 = x0 + w * S
        return [f'<path d="M{x0},{base} L{x0},{Z(eaves)} L{(x0 + x1) / 2},{Z(ridge)} L{x1},{Z(eaves)} L{x1},{base} Z" fill="{fill}" stroke="#3f3a32" stroke-width="1.5"/>',
                text((x0 + x1) / 2, Z(ridge) - 22, label, 14, 'middle', '700'), text((x0 + x1) / 2, Z(ridge) - 6, sub, 12, 'middle')]

    # the rejected kit hall, to the same scale
    o += house(40, 8, 3.2, 4.2, '#c9b9a0', 'Rejected kit hall', '8 m long, about 4 m high')
    o.append(person(40 + 4 * S + 60))
    # the Great Hall, across: 22 m, walls 14, ridge 24, the door and one tall window
    gx = 250
    o += house(gx, 22, 14, 24, '#a8a090', 'Great Hall, across', '22 m wide, walls 14 m, ridge 24 m')
    o += [f'<rect x="{gx + 22 * S - 4}" y="{Z(5.2)}" width="8" height="{5.2 * S}" fill="#5b3d26"/>',
          f'<rect x="{gx + 22 * S - 3}" y="{Z(11.5)}" width="6" height="{8 * S}" fill="#2c3340"/>']
    o.append(person(gx + 22 * S + 20))
    # the workshops, across, with the gate tower behind
    wx = 650
    o.append(f'<path d="M{wx + 2.5 * S},{base} L{wx + 2.5 * S},{Z(24)} L{wx + 6 * S},{Z(29)} L{wx + 9.5 * S},{Z(24)} L{wx + 9.5 * S},{base} Z" fill="#c4bdae" stroke="#3f3a32" stroke-width="1" stroke-dasharray="4 3"/>')
    o.append(text(wx + 6 * S, Z(29) - 8, 'gate tower behind, 29 m', 12, 'middle'))
    o += house(wx, 12, 13, 19, '#a8a090', '', '')
    o.append(text(wx + 6 * S, Z(3.2), 'Workshops, across', 14, 'middle', '700'))
    o.append(text(wx + 6 * S, Z(3.2) + 16, '12 m deep, ridge 19 m', 12, 'middle'))
    for z in (5, 9):
        o.append(f'<line x1="{wx}" y1="{Z(z)}" x2="{wx + 12 * S}" y2="{Z(z)}" stroke="#3f3a32" stroke-width="1" stroke-dasharray="3 3"/>')
    for z0, z1 in ((1, 3.9), (6.2, 8.4), (10.2, 12.2)):
        o.append(f'<rect x="{wx + 12 * S - 3}" y="{Z(z1)}" width="6" height="{(z1 - z0) * S}" fill="#2c3340"/>')
    o.append(person(wx + 12 * S + 20))
    # what one screen shows of a facade, by how far you stand from it
    sx = 950
    o += [text(sx, 70, 'What one screen shows of a facade', 14, 'start', '700'),
          text(sx, 90, '(1080p: 480 × 270 art px; 14.5 px a metre)', 12)]
    for k, (d, m) in enumerate(((2, 7.7), (4, 6.2), (6, 4.6), (8, 3.1), (12, 0))):
        y = 125 + k * 26
        o += [text(sx, y, f'{d} u away', 13), f'<rect x="{sx + 80}" y="{y - 12}" width="{m * 18}" height="14" fill="#9c9483"/>',
              text(sx + 86 + m * 18, y, f'{m:g} m' if m else 'its foot only', 12)]
    o += [text(sx, 270, 'So you see the ground floor and a little', 12), text(sx, 286, 'more; storeys above are seen only', 12),
          text(sx, 302, 'as you walk along the building.', 12)]
    o += [f'<line x1="20" y1="{base}" x2="{vw - 20}" y2="{base}" stroke="#2b2620" stroke-width="2"/>',
          f'<rect x="40" y="{base + 22}" width="{10 * S}" height="5" fill="#2b2620"/>', text(40, base + 46, '10 m', 12),
          text(200, base + 46, 'Red: a person, 1.8 m (a wizard). All drawn to one scale.', 12)]
    o.append('</svg>')
    return '\n'.join(o)


def shots():
    for name in ('hall-door', 'corner', 'passage', 'workshops', 'yard-mid'):
        src = os.path.join(SHOTS, name + '.png')
        im = Image.open(src).convert('RGB')
        im = im.resize((im.width // 2, im.height // 2), Image.NEAREST)
        im.save(os.path.join(IMG, f'academy-{name}.jpg'), quality=88)


if __name__ == '__main__':
    open(os.path.join(IMG, 'academy-plan.svg'), 'w', encoding='utf-8').write(svg_plan())
    open(os.path.join(IMG, 'academy-section.svg'), 'w', encoding='utf-8').write(svg_section())
    shots()
    print('academy concept: img/academy-plan.svg, academy-section.svg, academy-*.jpg')
