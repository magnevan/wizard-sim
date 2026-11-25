"""Makes Fire's painted sheets for the game from the Codex originals in raw/ (prompts in prompts/).

    python game/content/generated/fx/prep.py

- fire-rolls.png, fire-smoke.png, fire-licks.png: the 4 x 4 sheets, scaled to 1024 px (cells of 256).
- fire-carpet.png: each of the 16 low flame clusters cut out tight and set on the bottom of a 256 x 128 cell (4 x 4,
  1024 x 512), so a quad's base is the flames' base (fire.ts samples the cell whole).
- fire-cracks.png: the tileable charred bed with glowing cracks, scaled to 1024 px.
- fire-flow.png: the tileable flame tongues streaming upward, scrolled through the spray's body (take 1), 1024 px.
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


if __name__ == '__main__':
    scaled('fire-rolls')
    scaled('fire-smoke')
    scaled('fire-licks')
    scaled('fire-cracks')
    scaled('fire-flow')
    carpet()
    Image.open(RAW / 'earth-cracks-1.png').convert('L').resize((1024, 1024), Image.LANCZOS).save(HERE / 'earth-cracks.png', optimize=True)
