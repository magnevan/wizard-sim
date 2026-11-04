---
status: prototyping
pillars: [1, 4]
related: [../explorations/2026-11-02-feedback-round-1.md]
---

# Casting rhythm & resource

## One-liner
Casting speed and spell cost are explicit and fair: no hidden input cooldowns, no advantage for combos that happen to be easy to type, and possibly a resource that rewards mindful casting.

## Problem in Magicka
- An undocumented minimum gap between inputs; elements could be dropped when spamming.
- The throughput of a spell depended on how easy its keys were to type, which is arbitrary.
- Power was capped by click speed plus animations.

## Directions to explore
- Make the input buffer *reliable*: every key press is registered and queued.
- Make cast time a property of the spell (e.g. scaling with element count) rather than of the keys used.
- A casting resource (mana, heat, focus...) so stronger casts cost more and pacing is a decision.
- A warm-up mechanic: a resource or rhythm that builds as you play well (ties into progression).

## Open questions
- Is a resource fun, or just a limiter? What's the most interesting version?
- Does a resource give support a new verb (restoring it for allies)?

## Update 2026-11-03
The leading resource candidate is now per-element pools, in `element-economy.md` (see `explorations/2026-11-03-resources-and-battlefield.md`).
