# Generated art library

Every image bought from an AI tool is kept here, raw and unedited, so nothing is generated twice. **Look here before making any PixelLab or Gemini call.** After a call, add the raw output and a line to the table below in the same change. Local edits and variants go elsewhere; this folder stays raw.

**Spending rules (the user's, 2026-11-06):**
1. Keep every result here, so nothing is generated twice.
2. Make variations with local tools instead of new calls: flag colours, aged or mossy stone, altered bookshelf contents.
3. Batch: `create_1_direction_object` charges per job (10 generations for 16 objects at 48 px; Pro is 5 per prop). That's checked against the balance, through the MCP tool only.
4. Name every slot in `item_descriptions` when a room needs them all.
5. Use free tools first: local scripts, and PixelLab's `pixelart_workbench`.
6. Generate once, derive the rest: buy a chair once, and make the broken or burnt chair locally.
7. Note the balance before and after each paid call.

Balance: 2,000 → 1,930 on Tier 1 (2026-11-07, resets 2026-12-07). Pass inline style images as few and small as you can: two of three were corrupted in transit there.

Status: trial material, and the terms were read on 2026-11-06 (a summary, not legal advice; re-check before release):
- **PixelLab** (pixellab.ai/termsofservice): you own what you make and may "use, modify, and distribute the outputs", commercially too, with no attribution and no stated difference for trial plans. You may not train models on outputs. It also binds you to the Open RAIL-M licence's use limits, which haven't been read yet.
- **Gemini API** (aistudio.google.com/docs/terms): Google claims no ownership and states no general limit on publishing, but it doesn't address commercial use directly. On a paid key, prompts and outputs aren't used to improve Google's products.
- **Copyright:** raw AI output may not be protectable, so anything in this public repo may be free for others to copy. Steam's AI disclosure still applies at release.

| Files | Tool | Cost | Brief |
|---|---|---|---|
| `pixellab/pl-obj-0..15.png` | PixelLab `create_1_direction_object`, 48 px, top-down, our palette, our sprites as style reference (object `256bd245-2b66-4843-b2bb-ef60ac67374a`) | 10 generations for all 16 | 0 lectern, 1 bookshelf, 2 archery target, 3 rune circle, 4 teacher (named); 5 cauldron, 6 desk, 7 throne, 8 potion shelf, 9 armillary sphere, 10 chest, 11 banner, 12 training dummy, 13 weapon rack, 14 crystal ball, 15 clock (invented by the tool) |
| `pixellab/pl-front-bookshelf.png` | PixelLab `create_object_pro_flash`, 48 px, low top-down, palette and style reference (object `2365b727-830d-458b-b86e-77ce3423b63a`) | 5 generations | Straight-on bookshelf |
| `pixellab/pf-{lectern,bookshelf,target,circle,teacher}.png` | PixelLab `create_image_pixflux`, high top-down, no reference | 1 generation each | The five props, no style reference |
| `gemini/g-pro.png`, `gemini/g-flash.png` | `gemini-3-pro-image`, `gemini-3.1-flash-image` | 1 call each | The five props on one sheet; prompt in `tools/art-trial/prompt-sheet.txt`, call log in `gemini/gemini-calls.jsonl` |
| `pixellab/outdoor/ground-dirt/`, `ground-cobble/`, `ground-water/` | PixelLab `create_topdown_tileset`, standard, 32 px (`0f68561e`, `6be7d785`, `384c2d10`; the last two share the first's grass) | 1 generation each | Packed brown dirt footpath with small pebbles / worn grey cobblestone path / shallow clear pond water, each with short green meadow grass |
| `pixellab/outdoor/ground-pro/` | `create_topdown_tileset`, pro, 32 px, high top-down, our palette (`0db4d7c2`) | 15 generations | The same dirt and grass |
| `pixellab/outdoor/iso-ground/`, `iso-path/` | `create_tiles_pro`, isometric tileset, 32 px, angle 30, depth 0 (`f5a2ff4a`); `create_path_tiles`, isometric, 48 px, angle 30 (`392e6091`) | 10 generations each | Grass to dirt; grass with a dirt footpath. No palette given |
| `pixellab/outdoor/scatter/00..63.png` | `create_1_direction_object`, 32 px, our palette, no reference (`6e24ab84`) | 10 generations for 64 | The named list in `tools/outdoor-kit/briefs.json`, in its order |
| `pixellab/outdoor/yard/00..15.png`, `rural/00..15.png` | `create_1_direction_object`, 48 px, our palette, 3 props as references (`a9413650`, `096f705e`) | 10 generations per 16 | The named lists in `briefs.json`, in their order |
| `pixellab/outdoor/trees/oak.png`, `pine.png` | `create_map_object`, high top-down (`bdbf23c0`, `3bd790db`) | 1 generation each | Broad oak; tall pine |
