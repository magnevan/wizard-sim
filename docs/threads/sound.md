# Spell sounds, music and ambience

Status: paused, waiting for the user's picks · Last touched: 2026-11-17 at 8650909
Record: [Fire sound](../explorations/2026-11-08-fire-sound.md) (Fire, Sigil) · [sound overnight](../explorations/2026-11-14-sound-overnight.md) (the rest) · [sound direction](../presentation/sound.md)

## Where it stands

Fire is finished in the dev game and waits for the user's OK to go public. The public game has only the rune blop and the Haste hum. Life, Shield, Cold, Arcane and Lightning (round 1, three takes per part), Sigil arming, and 27 CC0 music and ambience tracks are up for review in the Sound Lab. All of it is merged to main.

## Next

- [ ] The user's picks in the Lab: `?lab=life|shield|cold|arcane|lightning`, `?lab=sigil`, `?lab=atmos`.
- [ ] Read **all** of `game/content/audio/lab-notes.json` (not just recent entries). Keys are `<el>/<moment>/<kit key>/take<n>` and `atmos/<room>/<kind>/<id>`.
- [ ] Put the picks into `.reference/tools/kit-elements.py` the way Fire's went into `make-generated-kit.py` (drop `set`, keep the chosen take).
- [ ] Make Fire public, once the user says so.

## How to work here

- The user's game sound rules: burn ticks are silent; a charge-up plays for at least 0.3 s; loops fade over their release; circling orbitals are silent.
- `node tools/sfx/elevenlabs.mjs <list.json>`, capped at 300 calls per UTC day (`SFX_MAX_PER_DAY` overrides it for one run). About 5,692 of 10,000 credits were used by 2026-11-14.
- CLAP (`.reference/tools/clap.py`) and the spectrogram sheets (`sheet.py`) catch duds before the Lab.
- The Lab mutes the groups it doesn't count as the spell's (`SPELL_GROUPS` in `lab.ts`). Add a group there when a new sound comes from a new group.
- A worktree needs its own copy of `.reference`; robocopy it back afterwards.

## Done

- 2026-11-08 Fire and its Sigil
- 2026-11-14 Round 1 for the other five elements, Sigil arming, music and ambience
- 2026-11-17 Merged to main (8650909)
