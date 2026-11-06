# Art trial

Comparing art sources for the campaign's props (`docs/explorations/2026-11-06-campaign-and-content.md`, stage 3): Claude's code-drawn pixel art, PixelLab (through its MCP server) and a Gemini image model.

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
