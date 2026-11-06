# Art trial

Comparing art sources for the campaign's props (`docs/explorations/2026-11-06-campaign-and-content.md`, stage 3): Claude's code-drawn pixel art, PixelLab (through its MCP server) and a Gemini image model.

Published at https://claude.ai/artifact/S2wttPmXSg7YXZhJQbL4gN (private to the user), with `capabilities: { db: {} }`. Republish `index.html` to the same URL, with `img/` as its files.

## Rebuilding the page's images

From a 1x game screenshot (`?scale=1`): `prep.py` builds the palette and references, `code-props.html` draws the code set (dump it with headless Chrome), `cleanup.py` shrinks a generated sheet and locks it to `palette-lock.json`, and `compose.py` places each set on the floor. `out/` is gitignored; what the page shows is copied to `img/`.

## Round 2: the mock room's props

No generation calls: everything starts from the raw library, `game/content/generated/`, which is never edited.

```
node tools/art-trial/code-dump.mjs      # code-props.html -> out/code/<id>.png
python tools/art-trial/props.py         # raw + code -> game/content/assets/props/<id>/: lean, simple, code, meta.json
python tools/art-trial/variants.py      # variants on top: banners, shelves, plinths; out/variants.png
```

- `imgops.py` is the toolbox: `reduce_detail`, `ramp_swap`, `moss`, `wear`, `region_swap`, `keep_largest`.
- To add a variant, add a line in `variants.py`. Its `meta.json` then names the raw file, the base and the operations.
- Page images: the steps are at the top of `page-images.py`. `iso-still.py` makes the isometric picture.
- The verdict on each kind of variation is in `docs/explorations/2026-11-06-art-trial-round-2.md`.

## The Gemini key

- Put the key in `.secrets/gemini.key` at the repo root, on one line. The `.secrets/` folder is gitignored and never committed.
- You can also set `GEMINI_API_KEY` instead.
- The script never prints or logs the key.

## Making an image

```
node tools/art-trial/gemini.mjs --models                       # which image models this key can use (free)
node tools/art-trial/gemini.mjs --prompt "..." --out lectern-1 [--ref style.png] [--model id]
```

- Images land in `tools/art-trial/out/` (gitignored).
- Every call is logged to `out/gemini-calls.jsonl`, with the model, prompt and token usage.
- The key is paid, so the script refuses to make more than 20 calls a day. Raise `MAX_PER_DAY` only if the user agrees.
