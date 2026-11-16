# Spell balance

[Start here](../start-here.md) · [Playable spell rules](../current-state.md) · [Design pillars](../vision.md)

| Question | Source |
| --- | --- |
| What does a rune combination produce? | [Spell Atlas review](https://claude.ai/artifact/GiZ7G7eQ4pMqXLaPEZK6Cw). The game uses the generated grammar in `game/packages/rules/src/`. |
| What values does the game use? | `game/packages/sim/src/config.ts` for sim tuning. |
| How do spells compare? | Run `npm run balance` from `game/`. The checked-in report is `game/tools/balance-report.json`. |
| Which rune additions change the result? | Run `npm run audit` from `game/`. See the [initial inert-addition audit](../explorations/2026-11-05-inert-audit.md) for context. |
| What have we learned from tuning? | [Balance Notes review](https://claude.ai/artifact/5cTMLv4PTnGvGS3QCBdDHg) · [Spell audit](../explorations/2026-11-11-spell-audit.md) · [Rune scaling audit](../explorations/2026-11-07-rune-scaling.md). |

Keep intended trade-offs here as decisions are made. For a measurement worth keeping, record the tested build, the scenario and the result in a dated exploration, then link to it.

For early campaign regen, 0.5 runes per second already felt generous to the user in a playtest. The starting value is still a tuning question. [Round 4 feedback](../archive/claude-review-feedback-2026-11-16.md#world-and-progression)
