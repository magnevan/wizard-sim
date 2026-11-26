"""Makes Fire's painted sheets for the game from the Codex originals in raw/ (prompts in prompts/).

    python game/content/generated/fx/prep.py

- fire-rolls.png, fire-smoke.png, fire-licks.png: the 4 x 4 sheets, scaled to 1024 px (cells of 256).
- fire-carpet.png: each of the 16 low flame clusters cut out tight and set on the bottom of a 256 x 128 cell (4 x 4,
  1024 x 512), so a quad's base is the flames' base (fire.ts samples the cell whole).
- fire-cracks.png: the tileable charred bed with glowing cracks, scaled to 1024 px.
- fire-flow.png: the tileable flame tongues streaming upward, scrolled through the spray's body (take 1), 1024 px.
- fire-burn.png: three flame flipbooks (raw/fire-burn-1..3), 8 burn-out frames each, 2048 x 768 (cells of 256).
- fire-smokeburn.png: a smoke flipbook, 4 frames as one grey density channel (dark smoke -> high), 1024 x 256.
- earth-cracks.png: 2 x 2 white crack stars on black, as one grey channel (the impact's crack decal), 1024 px.
"""
from pathlib import Path
from PIL import Image

HERE = Path(__file__).parent
RAW = HERE / 'raw'


def scaled(name, take=1):
    Image.open(RAW / f'{name}-{take}.png').convert('RGB').resize((1024, 1024), Image.LANCZOS).save(HERE / f'{name}.png', optimize=True)


def carpet(take=1):
    src = Image.open(RAW / f'fire-carpet-{take}.png').convert('RGB')
    W, H = src.size
    out = Image.new('RGB', (1024, 512))
    for j in range(4):
        for i in range(4):
            cell = src.crop((round(i * W / 4), round(j * H / 4), round((i + 1) * W / 4), round((j + 1) * H / 4)))
            box = cell.convert('L').point(lambda v: 255 if v > 24 else 0).getbbox()
            if not box:
                continue
            c = cell.crop(box)
            k = min(248 / c.width, 124 / c.height)
            c = c.resize((max(1, round(c.width * k)), max(1, round(c.height * k))), Image.LANCZOS)
            out.paste(c, (i * 256 + (256 - c.width) // 2, j * 128 + 128 - c.height - 2))
    out.save(HERE / 'fire-carpet.png', optimize=True)


def burn():
    out = Image.new('RGB', (8 * 256, 3 * 256))
    for r in range(3):
        src = Image.open(RAW / f'fire-burn-{r + 1}.png').convert('RGB'); W, H = src.size
        for i in range(8):
            cx, cy = i % 4, i // 4
            c = src.crop((round(cx * W / 4), round(cy * H / 2), round((cx + 1) * W / 4), round((cy + 1) * H / 2))).resize((256, 256), Image.LANCZOS)
            out.paste(c, (i * 256, r * 256))
    out.save(HERE / 'fire-burn.png', optimize=True)
    src = Image.open(RAW / 'fire-smokeburn-1.png').convert('L'); W, H = src.size
    sm = Image.new('L', (4 * 256, 256))
    for i in range(4):
        cx, cy = i % 2, i // 2
        c = src.crop((round(cx * W / 2), round(cy * H / 2), round((cx + 1) * W / 2), round((cy + 1) * H / 2))).resize((256, 256), Image.LANCZOS)
        sm.paste(c.point(lambda v: 255 - v), (i * 256, 0))
    sm.save(HERE / 'fire-smokeburn.png', optimize=True)


def parts2(take=1):
    """Fire's parts, take 2 (raw/fire-parts2-1.png: a 6 x 10 grid on black; tools/concept-gen/prompts/2026-11-26-fire-element):
    fire-puff2.png (rows 0-2: three lopsided puffs breaking up from the inside, 6 frames each), fire-lick2.png (row 3: four
    single licks, still), fire-rise.png (rows 4-6: three upright ground flames whose tips leave upward, 6 frames each, each
    cell's bottom on the flame's foot) and fire-impact.png (row 9: a splash of fire on a surface, 6 frames), cells of 256."""
    import numpy as np
    src = Image.open(RAW / f'fire-parts2-{take}.png').convert('RGB'); W, H = src.size
    on = (np.array(src.convert('L')) > 28).any(1)
    bands, s = [], None
    for i, v in enumerate(on):
        if v and s is None: s = i
        if not v and s is not None:
            if i - s > 8: bands.append((s, i))
            s = None
    assert len(bands) == 10, bands
    pitch = W / 6

    def cell(col, band, foot=False):
        side = round(pitch)
        cx = round((col + 0.5) * pitch)
        y1 = band[1] + 4 if foot else round((band[0] + band[1]) / 2 + side / 2)
        return src.crop((cx - side // 2, y1 - side, cx - side // 2 + side, y1)).resize((256, 256), Image.LANCZOS)

    def sheet(name, rows, frames, foot=False):
        out = Image.new('RGB', (frames * 256, len(rows) * 256))
        for r, b in enumerate(rows):
            for i in range(frames):
                out.paste(cell(i, bands[b], foot), (i * 256, r * 256))
        out.save(HERE / name, optimize=True)

    sheet('fire-puff2.png', [0, 1, 2], 6)
    sheet('fire-lick2.png', [3], 4)
    sheet('fire-rise.png', [4, 5, 6], 6, foot=True)
    sheet('fire-impact.png', [9], 6)


if __name__ == '__main__':
    scaled('fire-rolls')
    scaled('fire-smoke')
    scaled('fire-licks')
    scaled('fire-cracks')
    scaled('fire-flow')
    carpet()
    burn()
    parts2()
    Image.open(RAW / 'earth-cracks-1.png').convert('L').resize((1024, 1024), Image.LANCZOS).save(HERE / 'earth-cracks.png', optimize=True)
