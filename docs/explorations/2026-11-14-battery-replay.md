# The battery, replayed (2026-11-14)

The user replayed the battery's lesson on the new engine and gave four notes. This is what each one asked for, the design call made, and what was built. All of it is in the game (`#battery`; `?at=well-failing` and `?at=repair` jump there) and waits for the user's next playtest.

## 1. The overload doesn't read from most defences

> "Can't see crystal from all turrets, it doesn't feel so clear that the overload is happening ... make the glyph path have some sparking effect to it, that bursts when we overload, and ... sound effects that ramp up as we get closer to bursting, plus the burst itself."

**The call:** the glyph paths run from the well to every defence, so they're the one part of the well you always see. The overload has to show there, and be heard wherever you are.

**Built:**
- **On the paths** (`art/feed-lines.ts pathSparks`). Arcs crackle and hop along every path, a few at first and a storm at the end; their rate rises with `overload` (how far the flow has fallen, `art/power-down.ts`). The runes that still burn surge white-hot now and then. They used to only gutter, which read as fading rather than overloading.
- **The burst.** When the well runs dry, every path is a line of white fire for 0.6 s and throws a spray of sparks, drawn over the worn-in paths at full strength. The screen jolts (`wellShake`), after a faint tremor in the overload's last seconds.
- **The sound** (`audio/recipes.ts composeWellOverload`, `composeWellBurst`). A drone of electric buzz over a low rushing hum, centred on you so it's the same at every defence. It climbs a step at each quarter of the overload, louder and higher, with a crackle joining in the last half. The burst is a deep boom, a thunder crack and snapping arcs. All of it uses clips the game already has (free library first).
- **The well itself** is now overloaded from the start (the user's earlier note, 2026-11-13), so the crystal, where it can be seen, agrees.

## 2. After the gate falls it's too hard: no healing

> "It could be through just given some hidden damage reduction to begin with, but should also maybe include some way of healing. Maybe a white mage that can help us out?"

**The call:** both, and the healing comes through note 3's mechanic rather than an ally that plays for you. An AI healer would be a big build (ally AI, art, a body that fights) and takes the healing out of your hands, against pillar 1. A circle you heal yourself in teaches a move, and it's what the white mage *does*.

**Built:**
- **Hidden hardiness** (`config.ts CAMPAIGN.hardy`, a new `Mode.wizardHp` hook). In a campaign area wizards have twice the hp. The bar is a share, so nothing shows; it halves what every hit means.
- **A Life circle** by the well (`sim/src/battery.ts LIFE_CIRCLE`), 5.5 south of it on the yard side, so you fall back from the fight to heal. It lights green from the infusion on. Standing in it you have a Life pool of 2 that refills fast, and Life on yourself heals. The prompt reads "Heal yourself" (W, then Space) while you're in it and hurt; hurt below 60% elsewhere in the fight, it says "Hurt? Stand in the green circle".

**Open for the user:** who lays the circle. The sketch: a white mage travelling with you, who draws it when the gate goes down. That's story, so it's the user's (`docs/campaign/canon.md`). Until then the circle simply lights up.

## 3. Regen should start much lower

> "Rune regen should start much much lower ... maybe around .25 ... the intention was that we'd previously gain some sort of tool ... from the academy that we could use to channel a lesser version of sigil ... a proto mechanic for channeling elements that is like 'while standing in this magical circle you can channel the element here'."

The tool is the **etched focus** (canon: "Early swords come from an etched focus: Sigil works only with Conjure until the art is learned"; the opening's beat 3, the charged focus from the academy's rack).

**Built:**
- **Campaign regen** (`CAMPAIGN.regen` 0.25 runes a second). In a campaign area your own pools refill at a quarter of the arenas' R, so the Arena and Survive are unchanged. A defence's pool still refills from the well.
- **Channel circles, first version.** Stand in one and you can channel its element: its pool, refilling at `CHANNEL.regen` on top of your own; step out and it's gone. The sim records which circle each seat channels in the battery's state (`battery.channel`), so every copy of the world agrees. The Life circle above is the first.

**The tension, named:** lower regen makes beat 7 harder at the moment note 2 says it's already too hard. Hardiness and the Life circle cover it for now. The real answer is the focus: a blade from stored Sigil is the natural move when your one Fire rune is spent (the opening's beat 7 design). **Proposed order:**
1. The etched focus as an item you carry: a small store of Sigil that only Conjure can spend. Conjure with it and your Fire makes a fire blade.
2. Circles for other elements where a lesson wants them (a Fire circle at the academy's rack, say), combining with the focus: stand in a circle and conjure that element's weapon.
3. Then decide whether the focus's charge refills on its own or only at circles and wells.

## 4. Too much waiting between groups

> "Pace feels a bit too slow in tutorial, there's too much waiting for next wave, this also hurts the 'realism'."

**Built** (`sim/src/encounter.ts Step.overlap`, `battery-waves.ts BWAVES`):
- **Overlap.** A step can count as cleared with some of its enemies still standing (all of them out of the trees). After the lesson, the free fights and beat 7's groups send the next group once only one of the last is left. Only between a step's own groups: the step after (the repair) still waits for a clean field.
- **Shorter pauses.** The lesson's pause between steps is 1.5 s (was 3). It's 0.5 s after the lesson, and the goblins come through the gate 2 s after the infusion (was 3).
- **Not changed:** the well's 75 s fail. If the free fights still drag, 60 s is the next thing to try.

## For the next playtest

- Does the overload now read from the far defences: the crackles, the climbing drone, the burst?
- Beat 7 with 0.25 regen, double hp and the Life circle: too easy, right, or still hard?
- The white mage: is that the story, and should they be seen?
- The focus: build it next, in the order above?
