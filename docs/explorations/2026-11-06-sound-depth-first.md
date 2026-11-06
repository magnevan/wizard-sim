# Sound, depth first

The user started rating the Sound Gallery and stopped the approach, not only the sounds:

> You can't hear sounds, and I can't get a page with 100+ sounds to review. It's already pretty hard to judge, I'm not an expert in sound design I just have human taste.
>
> My suggestion is that we probably want to go more depth first on elements, and use the knowledge we gain to build other elements. It might be helpful to have some mini version of the game (or just the game) in a browser where we can judge it alongside, because it's easier to see if the audio works for a fire spray or nova if I can see it at the same time.
>
> I also think we should take inspiration from other games (or just magicka). Lets listen to those sounds and see how it compares.

## What the gallery taught us

Twenty ratings came in before the user stopped. The strongest ones say the same thing from different sides:

- **Water:** "I think water would sound quite different depending on the application. Rain is a classic sound, stepping in water has a familiar splash. A water spray would be more like a fire hose. Water AOE more like a big chunk of water being thrown."
- **Cold:** "a pond freezing is not the same as an ice shard hitting someone."
- **Shield:** "we'd need a few different effects with similar vibe. Like a background hum, a reflect sound, a creation sound etc."
- **Fire:** "sounds ok for like fire on the ground, not so much for a flame thrower."
- **Arcane:** "awful. Weird retro disco sound." **Life:** "sounds goofy." **Rune mixer:** "they're just little tones", and the cancel sound is "way too intense". All three are code-made.
- Kept: the Conjure and Missile shapes.

So stage 1's central idea was wrong. One layer per element times one envelope per shape gives every spell the same material at different lengths, and a spell's sound depends on what the element is *doing*.

## What the reference does

Listening to and measuring the reference confirms this, and the structure turned out to be simple:

- **Each element and shape pairing has its own arrangement,** but they share a small kit: about fifteen files cover a whole element, with the same few bursts reused for hits, thrown spells and bodies on fire.
- **Held spells have stages:** a short catch, a loop with a sub layer under it, and a separate dying breath when you let go. Stage 1 just faded out.
- **Elements are far apart in pitch.** Fire is low, with no crackle in a held flame at all. Water spray is the opposite, mostly hiss. Stage 1 put crackle at the top of Fire's sound, which is why it read as a fire on the ground.
- **Most one-shots have a few variants and random pitch.**
- **It's loud:** loops run about 10 dB hotter than ours did.

The details and measurements stay in the local `.reference` folder, as the numbers from the game did. No audio from another game ships, and the local comparison can't reach a build.

## What changes

1. **Element kits replace element layers,** one element at a time (`client/src/audio/kits.ts`). A kit is a dozen clips and their arrangement for each job: start, hold, stop, beam, launch, burst, land, status. Fire goes first because the user's note on it was the clearest and a flame is the easiest to judge by eye.
2. **The Sound Lab replaces the gallery** as the way to judge sound (`client/src/audio/lab.ts`, dev server, `?lab=fire`). Five moments, each cast on a loop at a dummy, with the visuals, and one click to swap between Before, New and the reference while it plays. A mark and a note per moment, saved to `game/content/audio/lab-notes.json`. Five judgements rather than a hundred.
3. **Recordings first.** Code-made sounds did worst, so Fire's kit starts from two real bonfire recordings, with their crackle removed, slowed and rebalanced, over a code-made low layer that adds turbulence.
4. **Measurement is how Claude listens.** Each clip is compared with its target for frequency balance, loudness and flutter. It caught three things a balance check alone missed: the first roar surged instead of holding steady, its sub was too low to hear, and the short clips were up to 10 dB quiet. It can show a clip is the right shape. It can't show it's good: only the user can.

The order after Fire: what the Lab teaches goes into a short recipe, then Water (the user's note already lists its four jobs), then the others. The gallery stays published but nobody needs to finish it.

## Open

- ElevenLabs isn't connected to Claude Code in this session, so AI sound is untested.
- CC BY recordings need a credit, which is a first for this project: the game will need a credits page before release. The source list has it for now.
- Sonniss's free GDC bundles and Freesound could give better flame recordings than two bonfires, but need the user's download or API key.
