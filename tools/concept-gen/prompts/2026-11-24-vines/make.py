"""Writes the vine prompts (docs/explorations/2026-11-24-dressing-variation.md, Vines): two hanging strips and two cluster
sheets, each painted at a stated real size beside the attached wizard (tools/building-art/wizard-scale.png, 1.7 m tall),
so the leaves come out leaf-sized whatever wall they end on.

  python tools/concept-gen/prompts/2026-11-24-vines/make.py
"""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
HEAD = ("Generate one image with your image generation tool, then save it as {out}.png in the current directory. Reply with "
        "just the file name.\n\nThe first attached image is the academy courtyard's concept art (stylised, hand-painted, warm "
        "light, lush violet-flowering vines on sandstone walls). The second shows our wizard, who is 1.7 m tall: use him only "
        "for scale, and do not draw him.\n\n")
STRIP = ("Draw a single vertical strip of {what}, hanging straight down from a straight horizontal top edge across the full "
         "width of the image, as a game texture on a plain flat bright green (#00ff00) background, seen straight on and flat, "
         "with no wall behind it. The strip is 1 metre wide and 3 metres long, so the image is three times as tall as wide; "
         "{leaf}. Strands of different lengths, thicker at the top and thinning to a few trailing tendrils at the bottom. "
         "Evenly lit, no shadow, no text.")
SHEET = ("Draw a sprite sheet of twelve separate {what}, laid out in a four by three grid with clear space between them, on a "
         "plain flat bright green (#00ff00) background, seen straight on and flat. Each is a different shape: {variety}. "
         "{leaf}. Evenly lit, no shadows, nothing touching the edges of its cell, no text.")
P = {
    'strip-ivy': (STRIP, dict(what='trailing ivy in deep and fresh greens', leaf='each ivy leaf is about 8 centimetres across, so a leaf is about a twentieth of the wizard\'s height')),
    'strip-violet': (STRIP, dict(what='a flowering violet climber like wisteria, green leaves with hanging violet and lilac flower clusters', leaf='each leaf is about 6 centimetres long and each flower cluster about 20 centimetres long')),
    'clusters-ivy': (SHEET, dict(what='clumps of ivy leaves', variety='small round clumps, long trailing sprigs, a fork of two stems, a single drooping tendril, a dense knot', leaf='each clump is 20 to 40 centimetres across, its leaves about 8 centimetres, matching the wizard\'s scale')),
    'clusters-violet': (SHEET, dict(what='clumps of violet blossom with leaves', variety='hanging racemes, round sprays, a sprig with one bloom, a dense bunch, a pink-tinged spray', leaf='each clump is 20 to 40 centimetres across, its flower racemes up to 20 centimetres long')),
}
for out, (body, kw) in P.items():
    open(os.path.join(HERE, f'{out}.txt'), 'w', encoding='utf-8', newline='\n').write(HEAD.format(out=out) + body.format(**kw) + '\n')
print(len(P), 'prompts')
