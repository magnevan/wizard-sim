# Vision (draft)

Distilled from the first conversation (2026-11-02) and revised since; the game built on it is public at https://magnevan.github.io/wizard-sim/. Change it on purpose, and log changes in `decisions/`. For what's built and decided right now, see `current-state.md`.

## Pillars

1. **Mastery lives mostly in the player's hands.**
   Most power comes from what *you* know and can execute. A returning player should be strong from minute one, because they remember how to cast. Unlocks may add real power (as Magicka's Magicks did), but the bulk of skill stays with the player. Prefer progression that lets you lean into a playstyle, do more things at once, or speed up as you warm up, over flat +X% numbers. Deeper element pools that open magic you couldn't reach before are an accepted exception, because they make the frontier smaller and friendlier early on. *(2026-11-03.)*

2. **Spells are a language, not a menu.**
   Players compose spells from parts and discover combinations nobody told them about. The space should feel wider than Magicka's fixed set of shapes, without becoming unreadable to the caster, to teammates, or in the heat of play.

3. **Co-op is a dance, with friendly fire included.**
   Accidentally exploding a friend stays in, but players must have deliberate ways to *avoid* friendly fire. Hitting a friend never helps them by accident; empowering an ally is something you set up on purpose. A skilled player should be able to commit fully to a *support* role that is as expressive and skill-based as dealing damage, and that lets them carry less experienced friends.

4. **Room to think and to play.**
   The pace is slightly slower and more deliberate than Magicka's: choosing the right spell beats twitch reflexes. Casting rhythm is explicit and consistent, not hidden input cooldowns, and a spell isn't strong just because its keys are easy to type. A resource may encourage mindful casting. The campaign has dedicated, low-pressure spaces for experimenting with magic.

5. **Cartoony and arcadey, with more depth over a longer campaign.**
   Keep the playful tone. Add character development and a campaign structure that rewards sticking around.

6. **A reproducible playstyle.**
   Players should be able to build a personal style that works across the game. Elemental interactions with the battlefield are a given, but levels don't each lean on an environmental gimmick. Occasional gimmicks that force adaptation are fine. Level twists that boost or suppress your existing magic (a place where fire runs hot, a dampening zone) are welcome. What to avoid is a novel level-only mechanic, such as "knock over pillars here" or "use this laser contraption". *(Clarified 2026-11-03.)*

7. **Downtime is for preparing, and preparing well pays off.**
   Traps, primed spells, stored spells, and structures for allies reward using lulls wisely. Encounters need breaks and visible approaches for this to matter, but preparation is rewarded, not mandatory. Every spell shape must have a situation where it's clearly the best answer.

## Platform

Top-down. Mouse and keyboard first; gamepads already work for local co-op (seats 1–3), so don't design them out. Mouse is for moving and aiming, so spell input shouldn't depend on drawing shapes with it. Online co-op for two to four players runs in the browser.

## Open questions

- ~~What does the spell structure look like beyond "elements → derived shape"?~~ **Answered:** proposal C, form × cast + payload; the strongest element picks the form, Shield and Sigil are elements, and with nothing queued the same gestures are weapon moves (`decisions/README.md`: "The overnight drafts, reviewed", "Grammar v2 in the game").
- What does a dedicated support player actually *press*? **Partly answered:** wards and auras cast on the ally under the cursor, Life spells that only heal and lend resistance, the Healing link and Mend (Healing hands), the Leaf aegis, the Lens, and Rally in Survive. Still open: what makes support *skillful* rather than a heal-bot.
- What do playstyle-leaning progression and warm-up progression look like concretely?
- ~~Is there a casting resource, and what is it?~~ **Answered:** element runes: a small pool per element (about 4), slow regen, reserved when queued and spent on cast; stuff costs once, energy costs upkeep; Sigil devices bind a rune (`decisions/README.md`: "Resources and battlefield", "Calls Claude made while building milestone 1").
- Where in the campaign does practice happen, and how does it avoid feeling like homework?
- How slow is "slower"? Is it about enemy design, casting time, or both? *So far:* both. Wind-up grows with a spell's size, recovery is fixed, and rune regen sets the pace; enemies were made tougher and slower-hitting after the Magicka baseline. Whether it feels right is a play-test question for the balance pass.
- Is Air a tenth element (`ideas/air-element.md`)?
- Does a run mode (Survive) get to bend pillar 1 with flat-number power-ups, or is it held to the campaign's rule? (Built on the recommendation that run modes may; `explorations/2026-11-05-survive-mode.md` question 3.)
