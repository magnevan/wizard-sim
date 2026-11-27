# Writes round 2's device prompt files (header + style + body + tail) and run.sh's ref lists.
# Round 2 design (the user's notes on round 1): well -> glyph path in the ground -> one station
# per tent -> a small emitter behind each cot's pillow.
import pathlib
here = pathlib.Path(__file__).parent

style = ("The attached images show the stylised 3D look of the academy's set pieces: smooth hand-painted textures, "
         "warm sandstone, deep blue with gold trim and the gold eight-pointed star emblem, polished brass, soft warm light. "
         "They include a healing brazier and a mender's pylon from the academy's field infirmary, an open field-hospital tent "
         "with four cots from the same triage camp, and the green-and-gold Life rune (a gold sprouting plant on a green field) "
         "where the academy's magic arrives.\n\n")
view = ("Draw a single game asset in that stylised 3D look, on a plain solid light grey background, seen from slightly above "
        "in a three-quarter view from its front corner so its front and one side show. ")
tail = (" A portable field device of the triage camp, set up in a hurry this morning beside the wounded: sturdy, practical, "
        "clearly carried in and assembled fast. Standalone and perfectly centered on the plain grey background, no characters, "
        "the structure crisp, dry and still, every surface plainly lit with no glow.")

cot = "a single plain folding wooden cot with a cream canvas bed, a cream pillow and a blue-and-cream striped blanket"

station_base = ("It is a healing station, one per tent: a squat device about 1.2 metres tall standing on a low round sandstone "
                "base plate whose top is carved with the gold Life rune, a sprouting plant, on green stone, where a carved glyph "
                "line in the ground ends. ")
leads_end = (" Four thin brass leads run out from the base across the ground in four directions, each a slim brass rod laid "
             "flat on the ground on small brass pegs, ending a short way out in a small brass coupling, ready to be joined to "
             "the cots. The piece is about as wide as it is tall, without the leads.")

bodies = {
"dev2-station-a": station_base +
  "On the base stand three short sturdy brass legs braced by a ring, holding a wide shallow brass bowl at waist height; the "
  "bowl's outer face is banded in deep blue enamel with small gold eight-pointed stars, two brass carrying handles stick out "
  "from its rim, and inside sits a heap of uncut green crystal stones around a central green stone carved with the Life rune. "
  "From the underside of the bowl four slim brass rods curve down between the legs to four brass sockets round the base plate's "
  "rim, one at each quarter, and from each socket a lead leaves along the ground." + leads_end,
"dev2-station-b": station_base +
  "On the base sits a squat round brass urn, waist high, wide-bellied and closed by a domed brass lid with a pierced crown of "
  "gold eight-pointed stars; the lid is propped half open on a hinge to show the green crystal stones packed inside. The urn's "
  "belly is banded in deep blue enamel with a gold eight-pointed star on its front. Around the urn's foot sits a heavy brass "
  "collar with four short spouts pointing out and down at the four quarters, each spout turning into a lead along the ground. "
  "Two stout brass handles on the urn's shoulders for carrying." + leads_end,
"dev2-station-c": station_base +
  "On the base stands a short thick sandstone pedestal, knee high, with a green-and-gold Life rune panel on its front; on top "
  "of it a brass cradle of four curved upright ribs holds a deep brass cup like a goblet's bowl, filled with uncut green "
  "crystal stones around one tall central green stone carved with the Life rune. The cup's rim is a deep blue enamel band with "
  "small gold eight-pointed stars. Each of the four ribs runs down the pedestal's corner to the ground and bends outward there "
  "to become a lead, so the leads grow straight out of the station's frame." + leads_end,

"dev2-emitter-a": "It is a bed emitter, a small healing device that stands on the ground at the head of " + cot + ", just "
  "behind the cot's head end, shown together with that cot for scale but clearly a separate object standing on its own feet, "
  "not attached to the cot. The emitter is a slim brass stand a little taller than a standing person's waist on a small round "
  "sandstone foot carved with the Life rune, three short brass feet steadying it. From the stand's top a slender curved brass "
  "arm leans forward like a swan's neck and ends in a small open brass ring, hand sized, held level in the air just above and "
  "slightly behind the pillow, high enough to leave the pillow and the patient's head clear; in the ring's centre is a small "
  "green stone disc carved with the gold Life rune. A thin brass lead runs from the stand's foot along the ground and away "
  "out of the picture's side, ending in a small brass coupling. A tiny deep-blue enamel collar with a gold eight-pointed star "
  "rings the stand.",
"dev2-emitter-b": "It is a bed emitter, a small healing device that stands on the ground at the head of " + cot + ", just "
  "behind the cot's head end, shown together with that cot for scale but clearly a separate object standing on its own feet, "
  "not attached to the cot. The emitter is a short square carved sandstone post, a little higher than the cot, its front "
  "carved with a green-and-gold Life rune panel, a sprouting plant. Above the post's flat top a thin gold halo ring stands "
  "upright, held up by two slim brass prongs, the ring's centre a small green stone disc with the Life rune, so the halo hangs "
  "over and behind the pillow like a saint's halo behind a head, leaving the pillow clear. A brass band with small gold "
  "eight-pointed stars on deep blue rings the post's top. A thin brass lead leaves the post's foot along the ground and runs "
  "out of the picture's side, ending in a small brass coupling.",
"dev2-emitter-c": "It is a bed emitter, a small healing device that stands on the ground at the head of " + cot + ", just "
  "behind the cot's head end, shown together with that cot for scale but clearly a separate object standing on its own feet, "
  "not attached to the cot. The emitter is a folding brass tripod, waist high, its legs ending in small brass feet on a little "
  "square sandstone plate carved with the Life rune. From the tripod's head a short jointed brass arm with a hinge and a "
  "wing nut reaches over and holds a small round brass dish face down, tilted toward the pillow, hovering above and behind "
  "the pillow without covering it; the dish's face is a green stone carved with the gold Life rune, its rim deep blue enamel "
  "with tiny gold stars. A thin brass lead runs from the plate along the ground and out of the picture's side, ending in a "
  "small brass coupling.",

"dev2-pylon-a": "It is a mender's pylon standing between two " + cot.replace("a single ", "") .replace("cot with", "cots with") +
  ", set side by side with a walking gap between them, their head ends in line. The pylon is a short square post about chest "
  "high, sandstone with brass collars, on a square sandstone foot; set flat into the ground in front of the foot is a square "
  "sandstone plate carved with the gold Life rune, a sprouting plant, on green stone, where a carved glyph line in the ground "
  "ends. A deep-blue band with the gold eight-pointed star wraps the post. The post carries no arms; instead, a brass bowl on "
  "its top holds a few green crystal stones. Behind each cot's pillow stands a small separate emitter: a slim brass stand with "
  "a short curved arm holding a small brass ring with a green Life rune disc above and behind the pillow, leaving the pillow "
  "clear. From the pylon's foot two thin brass leads run along the ground, one to each emitter's foot. The whole group is "
  "wider than it is tall.",
"dev2-pylon-b": "It is a mender's pylon made to stand between two " + cot.replace("a single ", "").replace("cot with", "cots with") +
  ", set side by side with a walking gap between them, their head ends in line, the pylon in the gap level with the pillows. "
  "The pylon is a short square sandstone post, chest high, with riveted brass collars and a folding brass brace, on a square "
  "sandstone foot with a green-and-gold Life rune plate set into the ground in front of it, a sprouting plant, where a carved "
  "glyph line ends. A deep-blue band with the gold eight-pointed star wraps the post. From the post's top two short brass arms "
  "reach out left and right, but only as far as the space just behind each cot's pillow, each ending in a small upright brass "
  "ring with a green stone disc carved with the Life rune, held above and behind the pillow so the pillow and the patient's "
  "head stay clear. The arms are short and sturdy; the piece is about as wide as the gap plus a hand's width either side.",
}

tent_body = ("It is one dressed field-hospital tent from the academy's triage camp, seen from high above at the game's "
  "camera angle, about 50 degrees down, in a three-quarter view from the tent's open front corner. The tent is the open "
  "canvas tent from the reference: cream canvas roof on wooden poles, deep blue trim with a gold eight-pointed star, its front "
  "side open. Inside stand four plain folding wooden cots with cream canvas, cream pillows and blue-and-cream striped blankets, "
  "in a row side by side, their heads against the back wall. Behind each cot's pillow stands a small separate brass bed "
  "emitter: a slim brass stand with a curved arm holding a small brass ring with a green Life rune disc above and behind the "
  "pillow, leaving the pillow clear. At the tent's front corner, just outside the canvas, stands the tent's healing station: "
  "a squat brass bowl on three short legs about waist high, on a round sandstone base carved with the gold Life rune on green "
  "stone, the bowl banded in deep blue with gold stars and filled with uncut green crystal stones. A carved glyph line, a "
  "narrow channel of gold-inlaid rune marks set flush into the grass, runs in from the picture's edge and ends at the station's "
  "base. From the station four thin brass leads run along the ground, flat on small pegs, one to each emitter's foot, laid "
  "neatly along the tent's floor behind the cots. Grass and trodden earth around the tent, a crate and a coil of rope by its "
  "side. A piece of the camp, set up in a hurry this morning: sturdy, practical. No characters, the scene crisp, dry and "
  "still, every surface plainly lit with no glow, the tent centred on a plain light grey background beyond the grass patch.")

refs = {
  "station": "devices/dev-lamp-b.png tent-a.png well-novines-b.png ../court-kit/court-buildings.png",
  "emitter": "devices/dev-lamp-b.png tent-a.png ../court-kit/court-buildings.png",
  "pylon": "devices/dev-pylon-a.png devices/dev-lamp-b.png tent-a.png",
  "tent": "tent-a.png devices/dev-lamp-b.png well-novines-b.png ../court-kit/court-buildings.png",
}

def write(name, text):
    head = f"Generate one image with your image generation tool, then save it as {name}.png in the current directory. Reply with just the file name.\n\n"
    (here / f"{name}.txt").write_text(head + text + "\n", encoding="utf-8")

for name, body in bodies.items():
    write(name, style + view + body + tail)
write("dev2-tent-dressed", style + "Draw a single game scene in that stylised 3D look. " + tent_body)
with open(here / "refs.txt", "w") as f:
    for name in list(bodies) + ["dev2-tent-dressed"]:
        kind = name.split("-")[1]
        kind = {"tent": "tent"}.get(kind, kind)
        f.write(f"{name} {refs[kind]}\n")
print("ok")
