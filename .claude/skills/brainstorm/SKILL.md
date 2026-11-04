---
name: brainstorm
description: Run a structured game-design brainstorm on a mechanic or question for this Magicka-inspired project, then record results in docs/. Use when the user wants to explore, riff on, or stress-test a design idea.
---

# Brainstorm

1. **Load context:** read `docs/vision.md`, `docs/ideas/README.md`, and the latest file in `docs/explorations/`. Skim any idea files related to the topic.
2. **Frame:** restate the question in one sentence and name the pillar(s) it touches. If the topic is vague, ask at most one clarifying question.
3. **Diverge:** generate 5–10 distinct directions. Include at least one conservative option (close to Magicka), at least one wild option, and at least one borrowed from another game (name the game). Describe each one *in the hands*: what is pressed, what is seen, and what a co-op partner experiences.
4. **Converge:** check each direction against the pillars and note its cost in input complexity and readability. Pick the 2–3 strongest and say why.
5. **Ask:** end with 2–4 pointed questions where the user's taste decides the outcome.
6. **Record:** once the user has responded (or if they ask you to record right away):
   - Save the session as `docs/explorations/YYYY-MM-DD-topic.md`.
   - Create or update idea files from `docs/ideas/_template.md`, and update the table in `docs/ideas/README.md`.
   - If a pillar changed, edit `docs/vision.md` and add an entry to `docs/decisions/README.md`.

Keep the tone conversational and opinionated. Recommend things; don't just list them.
