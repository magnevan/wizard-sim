# Rune economy: what max and regen should each do (2026-11-05)

Prompted by the user's Survive Review notes: the four starting glyphs (+1 to all, +2 to one, +30 % regen, +1 Sigil) don't balance, and the question behind them is bigger. What should a wizard start with, what's the regen baseline, and should regen be flat per element?

## What's built now

- About 4 runes per element (Fire 5, Sigil 3).
- Each element regenerates **0.22 runes a second, independently**.

So total throughput is 0.22 × the number of elements you actually drain. A Fire-only wizard sustains 0.22 runes/s. A wizard rotating through five elements sustains 1.1. Throughput, not just toolkit, pushes you to diversify. The user dislikes that being the *only* way to play.

## The user's goals, restated

a. Start with fewer runes: simpler play, and complex spells aren't worth it early.
b. Specialising (a frost mage, a support) is a fantasy worth supporting, without pigeonholing.
c. Regen vs max is a mana-system classic: encounter length decides which wins. Max also does a second job here: it caps *depth* (how many of one element a spell can stack) and how long you can lean on one element before rotating.
d. Diversity already pays through the toolkit: more answers.
e. Players specialise naturally anyway, because they can't hold every spell in their head and because the battlefield favours some elements (water on the ground → Cold and Lightning).

## Claude's take

Points d and e mean the **resource doesn't need to push diversity**: the toolkit and the field already do. So the economy should be close to neutral on throughput, and let max runes carry the specialisation fantasy.

### Separate the jobs

- **Max per element = depth and burst.** What you can cast, and how much you can dump before you rotate or wait.
- **One total regen rate R = sustain.** It's the same for every play style.

That's the familiar single-mana-bar model (burst = what's stored, sustain = regen). The per-element split only says *what* you can burst with. It makes regen vs max legible instead of tangled.

### Proposed rule: a shared budget, weighted by max, with a small floor

Each element that isn't full gets:

```
regen_e = α · R · max_e / Σmax_all            (a floor, always on while not full)
        + (1-α) · R · max_e / Σmax_notfull    (the shared part, only to pools that aren't full)
```

- **α = 1** is per-element regen proportional to max. Every pool refills in the same time; diversity multiplies throughput, as it does today.
- **α = 0** is a fully shared budget. Throughput is R whatever you cast; a Fire-only wizard pours all of it into Fire.
- **The recommendation is about α = 0.25.** It slightly favours rotating (the user's "middle ground") without making a specialist starve.

Weighting by max means investing in an element also raises its share of the regen. "Specialised" is then one number per element, not two.

### Starting numbers (placeholders for the balance harness)

- **3 per element at the start** (Sigil 2). No 4- or 5-stacks of one element early, which is the friendly frontier pillar 1 already accepts. Pools grow to about 6 over a run or a campaign.
- **R ≈ 1.0 rune/s** in total: one 3-rune spell every 3 s sustained. Today a 4-element rotation gets about 0.9, so this keeps the pace for a mixed player and roughly quadruples a specialist's.
- **Lulls refill fast** (say 3× R between waves). Max then matters per fight, R inside a fight, and long-vs-short encounters stop deciding everything (pillar 7: downtime is for preparing).

### What it costs

- **Coupling is invisible.** How fast Fire refills depends on whether your Cold pool is full. The HUD has to show the flow; for example, pools that are refilling shimmer brighter the bigger their share.
- **A specialist's burst-then-wait rhythm changes.** At α = 0.25 a Fire-only wizard sustains about 0.8 runes/s of Fire, not 0.22. Fire-heavy enemies and resistances have to carry the counterplay.
- **Attune and Siphon** multiply regen today. They'd multiply R instead, which is simpler.

### The glyphs under this rule

- **+1 to every element:** more burst and one more depth everywhere.
- **+2 to one element:** depth and a bigger regen share in that element. This is the specialist pick.
- **+R (sustain):** the regen glyph stays, but at about +15 %, and only in a draw that also offers depth, so it's a real choice.
- **Sigil** becomes one of the elements "+2 to one" can name, rather than its own weak glyph.

## Side notes from the same conversation

- **Echo redesign:** "very strong for the next wave". Its only cost is the opportunity cost of not taking a permanent pick: no rune loss, no lasting penalty (user, 2026-11-05).
- **Camera:** every room follows your own wizard, with ally arrows at the screen edge. The exception is couch co-op on one screen (user, 2026-11-05).

## Open questions (on the Rune Economy page)

1. Shared budget with a floor (α), or per-element regen proportional to max (α = 1)?
2. Starting pools of 3 (Sigil 2), growing to about 6?
3. Should lulls refill faster?
4. The glyph set above?
