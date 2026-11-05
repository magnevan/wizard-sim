---
status: prototyping
pillars: [3, 4]
related: [minions-and-clones.md, support-verbs.md]
---

# Death & revival

## One-liner
Death matters more than in Magicka co-op: no spamming resurrections.

## Context
In Magicka multiplayer you die and get revived constantly; single player allows one revive per encounter.

## Directions
- Out until the end of combat, or until a timer runs out.
- A possible hardcore variant, depending on how chaotic play turns out.

## Interactions
- If death is harsher, *preventing* death (ward toss, yank, targeted shields) becomes more valuable, which strengthens the support role.
- The clone (`minions-and-clones.md`) becomes a meaningful low-risk option.

## Open questions
- What does a dead player do while waiting? Spectate, or something light?
- Does reviving exist at all mid-combat, and is it costly or a ritual?

## Where it stands (2026-11-05)
- **Built:** a downed wizard is out until the wave ends, and gets up at half health in the breather (the Arena and Survive; `explorations/2026-11-05-survive-mode.md`). This is the "out until the end of combat" direction.
- **Built in Survive: Rally,** a power-up: stand within 1.6 u of a downed ally for 3 s, hands free, and they get up with 40 % health. Any cast, weapon move, block, hit or step away breaks it ([Survive gets Rally and Echo](../decisions/README.md#2026-11-05-survive-gets-rally-and-echo)).
- Open question "does reviving exist mid-combat?" **Answered for Survive:** yes, as Rally, a ritual that costs the rescuer their hands. For the campaign it's still open (the Resurrect Rite in `explorations/2026-11-03-coop-magicks.md` is the other candidate).
- Still open: what a downed player does while waiting (today: nothing but watch), and a hardcore variant.
