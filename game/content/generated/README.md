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

Status: trial material. Read the tool's terms before any of it ships.

| Files | Tool | Cost | Brief |
|---|---|---|---|
| `pixellab/pl-obj-0..15.png` | PixelLab `create_1_direction_object`, 48 px, top-down, our palette, our sprites as style reference (object `256bd245-2b66-4843-b2bb-ef60ac67374a`) | 10 generations for all 16 | 0 lectern, 1 bookshelf, 2 archery target, 3 rune circle, 4 teacher (named); 5 cauldron, 6 desk, 7 throne, 8 potion shelf, 9 armillary sphere, 10 chest, 11 banner, 12 training dummy, 13 weapon rack, 14 crystal ball, 15 clock (invented by the tool) |
| `pixellab/pl-front-bookshelf.png` | PixelLab `create_object_pro_flash`, 48 px, low top-down, palette and style reference (object `2365b727-830d-458b-b86e-77ce3423b63a`) | 5 generations | Straight-on bookshelf |
| `pixellab/pf-{lectern,bookshelf,target,circle,teacher}.png` | PixelLab `create_image_pixflux`, high top-down, no reference | 1 generation each | The five props, no style reference |
| `gemini/g-pro.png`, `gemini/g-flash.png` | `gemini-3-pro-image`, `gemini-3.1-flash-image` | 1 call each | The five props on one sheet; prompt in `tools/art-trial/prompt-sheet.txt`, call log in `gemini/gemini-calls.jsonl` |
