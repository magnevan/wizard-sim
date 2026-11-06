# Audio sources

Every recording the game uses, where it came from, and its licence, so nothing is fetched twice. **Look here before downloading or generating any sound.** After adding a source, add a line below in the same change.

The rules, from the user (2026-11-06): prefer free libraries and packs, tuned with local tools. Don't use anything whose licence can't be confirmed. Don't use recordings or sounds from Magicka itself.

## How it fits together

- `sources/` holds the originals: each Kenney file as it came, and short excerpts of each Commons recording in `sources/commons/cuts/`, named for the clip they feed. The full Commons recordings are too big to keep; the table has each one's URL, and `bank.json` has the cut's start and length.
- `bank.json` lists every clip: what it's cut from and how it's tuned.
- `npm run audio:bank` tunes them with local ffmpeg (silence trimmed, levels set, loops made seamless) into `packages/client/public/audio/`, mono Ogg Vorbis, and writes `packages/client/src/audio/bank.gen.ts`. Never edit those by hand.
- `npm run audio:bank -- --originals <dir>` re-cuts the Commons excerpts from full downloads. Only needed for a new or moved cut.
- `npm run sound-gallery` then rebuilds the Sound Gallery's files.

Sounds not listed here are made in code (`packages/client/src/audio/synth.ts`): whooshes, the sub thump, electric buzz and zaps, shimmer, the rune blip, stingers.

## Sources

### Kenney (CC0 1.0)

Licence read on each pack's own page at kenney.nl on 2026-11-06, and in each pack's `License.txt`, kept beside its files.

| Folder | Pack | Page | Used for |
|---|---|---|---|
| `sources/kenney-impact-sounds/` | Impact Sounds 1.0 | https://kenney.nl/assets/impact-sounds | Footsteps, punches, pick on rock, breaking glass, bells and plate |
| `sources/kenney-rpg-audio/` | RPG Audio | https://kenney.nl/assets/rpg-audio | A blade drawn, chop, slice, cloth |
| `sources/kenney-sci-fi-sounds/` | Sci-fi Sounds | https://kenney.nl/assets/sci-fi-sounds | Jet roar (Fire), force field (Shield), retro laser (Arcane), explosion |
| `sources/kenney-interface-sounds/` | Interface Sounds | https://kenney.nl/assets/interface-sounds | Menu open, close, tick, confirm, error |

**Where the bytes came from:** kenney.nl refuses scripted downloads, and its zip links aren't on the page. CC0 allows redistribution, so the files came from the unmodified copies in https://github.com/series-ai/jam-ready-assets (`kenney-*/audio`), which keep Kenney's `License.txt`. Only the files `bank.json` uses are kept. Downloading the packs from kenney.nl by hand and comparing them would close this gap.

### Wikimedia Commons (public domain or CC0)

Licence read per file from the Commons API on 2026-11-06. "PD" is Commons' public-domain tag; most of these came to Commons from pdsounds.org.

| Recording | Licence | Author | Page | Used for |
|---|---|---|---|---|
| Assorted gravel rock and stones | PD | stephan | https://commons.wikimedia.org/wiki/File:Assorted_gravel_rock_and_stones.ogg | Earth's rumble |
| Bones breaking wood fire ice crackling | PD | stephan | https://commons.wikimedia.org/wiki/File:Bones_breaking_wood_fire_ice_crackling.ogg | Cold's creak |
| Clonk debris falling off table | PD | stephan | https://commons.wikimedia.org/wiki/File:Clonk_debris_falling_off_table.ogg | Debris |
| Dry grass burning in open fireplace | PD | ezwa | https://commons.wikimedia.org/wiki/File:Dry_grass_burning_in_open_fireplace.ogg | Fire's crackle |
| Water bubbles chortling | PD | stephan | https://commons.wikimedia.org/wiki/File:Water_bubbles_chortling.ogg | Water's gurgle |
| Water over rocks as tide recedes | PD | earthcalling | https://commons.wikimedia.org/wiki/File:Water_over_rocks_as_tide_recedes.ogg | Water's rush |
| Bathtub water splashes | PD | gradha | https://commons.wikimedia.org/wiki/File:Bathtub_water_splashes.ogg | Splashes |
| Thunder and rain on a veranda | PD | ezwa | https://commons.wikimedia.org/wiki/File:Thunder_and_rain_on_a_v.ogg | Thunder crack |
| Monster growls, Monster growls 2 | PD | stilgar | https://commons.wikimedia.org/wiki/File:Monster_growls.ogg, https://commons.wikimedia.org/wiki/File:Monster_growls_2.ogg | Enemy voices |
| Explosion 10 | PD | tcpp | https://commons.wikimedia.org/wiki/File:Explosion_10.ogg | Boom |
| Explosion-LS100155 | PD | Fg2 | https://commons.wikimedia.org/wiki/File:Explosion-LS100155.ogg | Boom |
| Windglockenspiel.Koshi | CC0 | Membeth | https://commons.wikimedia.org/wiki/File:Windglockenspiel.Koshi.ogg | Life's chimes |
| Gong or bell vibrant (short) | CC0 | from pdsounds.org | https://commons.wikimedia.org/wiki/File:Gong_or_bell_vibrant_(short).ogg | Sigil's gong |

Commons rate-limits hard: a burst of searches or quick downloads gets a 429 with `retry-after: 600`. Send one request a minute with a descriptive user agent.

### Wikimedia Commons (CC BY 4.0: these need a credit)

Licence read from the Commons API on 2026-11-06. Kept whole in `sources/commons-fire/`; `scripts/make-fire-kit.py` slows and reshapes them into `sources/made/`.

| Recording | Licence | Author | Page | Used for |
|---|---|---|---|---|
| WWS Bonfireburning | CC BY 4.0 | Work With Sounds / Werstas | https://commons.wikimedia.org/wiki/File:WWS_Bonfireburning.ogg | Fire's roar, its dying breath, a burning body |
| WWS Bonfireignition | CC BY 4.0 | Work With Sounds / Werstas | https://commons.wikimedia.org/wiki/File:WWS_Bonfireignition.ogg | Fire catching, bursts, blooms |

## Looked at and not used

- **OpenGameArt:** its robots.txt disallows Claude's agents by name (`Claude-Code`, `Claude-User`, `ClaudeBot`), so agents should not fetch from it. It has good CC0 packs ("Spell Sounds Starter Pack" and others). The user can download one by hand, drop it in `sources/` and add it here.
- **Kenney's donation pack on GitHub** (`ismetcabbar9-oss/kenney-audio-assets`): a 2014 copy of a paid pack, so its provenance isn't clear.
- **Aggregator repos claiming "CC0 sound effects":** skipped, since the licence couldn't be traced to each sound's author.
- **Commons `Bubbles.wav`:** someone saying the word. `Chime (1) Sample.wav`: unclear origin. `Alien technology scanning device.ogg` and `Emptying syringe in water slow.ogg` are PD and fine, but nothing uses them yet.

**Agents: don't fetch from OpenGameArt.** Its robots.txt disallows Claude's agents. The user can add its packs by hand.
