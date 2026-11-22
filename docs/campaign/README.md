# Making a campaign segment

How a piece of the campaign goes from an idea to something in the game. Proposed 2026-11-09, to be changed once we've run it once.

- [Story canon](canon.md): what the user has approved. Read it first.
- [Story development notes](story-development.md): proposals and previous directions.
- `NN-name/`: one folder per segment. Each stage adds a file.
- `../../tools/segments/NN-name/`: the segment's working document, an artifact with one chapter per place. Anything still being worked on lives there.

A **segment** is one continuous stretch of play with one job to do: the opening, a region's first half. It's about 30 to 60 minutes.

## The stages

Each stage answers one question before the user passes it. When testing an unresolved detail within a stage, label the chosen option as a playtest assumption.

| # | Stage | File | Question it answers | Shape |
|---|---|---|---|---|
| 1 | **Brief** | `brief.md` | What is this segment *for*? | One page: what the player learns, gains and feels; the state going in and coming out; the story's one job |
| 2 | **Beat chart** | `beats.md` | Is the order right? | One row per beat: type, what it teaches, runes available, intensity, minutes. Read top to bottom, it should alternate pressure and rest |
| 3 | **Space diagram** | `space.md` | What connects to what? | Bubbles and arrows, no scale: rooms, gates, loops, where you can prepare, where you see enemies coming |
| 4 | **Blockout** | LDtk level | Is it fun? | Playable, plain tiles, placeholder enemies, one-line text. **The main gate** |
| 5 | **Script** | `script.md` | What do people say? | The user's voice. Real lines, written to "you", replacing the placeholders |
| 6 | **Dressing** | asset list | What does it look like? | The assets the blockout calls for, then art, judged in the whole scene. Paid generation needs the user's sign-off |
| 7 | **Finish** | | Does it hold together? | Sound, tuning, a co-op pass, a run with four players |

**Places come from concept images (2026-11-16).** Between the space diagram and the blockout, Codex draws each place from its purpose and connections, one level at a time (world, biome, region, area), using the parent level's image as reference. The blockout's screenshots then guide the dressing. Assembling scenes from bought assets looked like stickers. See the [map pipeline](../explorations/2026-11-16-campaign-map-pipeline.md).

## Rules that keep it honest

- **Gameplay first, then words, then art.** The script waits for the blockout, because beats change when they're played. The overnight story run showed the limit of paper: blind judges ranked first a story the user rejected within minutes.
- **Stages can go backwards.** A blockout that isn't fun goes back to the beat chart, and that's the process working.
- **Short and plain.** Tables and fragments, no prose. If a stage needs more than a page, the segment is too big.
- **Story approval is explicit.** Put new facts in the working segment as proposals and add them to [Story canon](canon.md) once the user approves them.
- **Each stage gets something to look at** where it helps: a beat strip, a bubble diagram, a block sketch, with answer boxes next to what they ask about.
- **Reuse before inventing.** Check the encounter library (`../explorations/2026-11-07-world-and-progression.md`) and what the game already does.

## Staying on track

A segment has many places at different stages, and going deep on one makes it easy to lose the rest. Decided 2026-11-22, after the opening's yard and battery work left two review pages with unanswered boxes and the brief a week behind.

- **One page per segment.** The segment's working page (`tools/segments/NN-name/`) is where the user answers. New questions about the segment go on it as chapters or concepts, not on new pages. A brainstorm may still get its own page, but its decisions move to the segment page when the brainstorm ends.
- **A board at the top of that page:** one row per stop (and one for the walks), one column per stage, each cell done, in progress, waiting on the user, next for Claude, or later. It answers "where are we" at a glance, and it's updated in the same commit as any change to the segment.
- **Waiting on you lists every open question,** including ones on other pages, so nothing waits unseen.
- **One stop deep at a time.** Past concept art, a stop moves through its stages before the next one starts. The others wait, shallow, at concept art.
- **Discoveries go to issues.** Something noticed on the way (a bug, an idea for another stop) is filed with the `file` skill or F8, not added to the thread unless it's the next step.
- **The thread file holds the order of work,** and the board holds where everything stands. Neither holds long notes; those go in the segment's explorations.

## Every brief answers

1. What can the player do when they arrive, and when they leave?
2. What's the one new thing they learn or feel?
3. What's the story's one job here?
4. How long is it, and what's cut first if it runs long?
5. Does it work with one player and with four? Who does what in co-op?
6. How does a returning player get through it quickly? (Pillar 1.)
7. Which pillars does it lean on, and does it bend any?
8. What's the smallest playable test?

The vocabulary is standard if you want to read further: a *beat chart* is often called a pacing chart, a *space diagram* a bubble diagram, and a *blockout* a greybox.
