# 2026-11-06: The help panel (F2): "what will my runes do?"

The user asked for a help tab for new players: press a key, a panel slides out on the side, and it shows a small animation and a description of the spell each cast variant would make with the runes you have queued. "Kinda like the Atlas, but in-game." This page records what was built, the calls made along the way, and what it costs.

## What it feels like

You queue Fire and press F2 (or click the small "?" next to Tune, or press D-pad up on a pad). A dark panel slides in from the right edge in about 0.18 s. It has five rows, one per gesture:

| Row | Key | Fire | Water + Cold | Shield + Earth | Sigil + Arcane |
|---|---|---|---|---|---|
| Force | RMB | Flamethrower | Ice shards | Fault line | Arcane beam turret |
| Area | Shift+RMB tap | Fire ring | Freezing splash | Ring of stone | Arcane orbitals |
| Place | Shift+RMB hold | Fire patch | Ice sheet | Stone arc | Arcane glyph |
| Self | Space | Burn | Douse + Chill | Stone armour | Glass cannon |
| Weapon | Shift+LMB | Fire burst | Freezing burst | Bulwark | Arcane hook |

Each row shows the key glyph (a little mouse with the used button lit, a Shift arrow, TAP or HOLD, or a SPACE cap), the name in the spell's colour, a line or two of the rules' text, the extra elements' traits as coloured tags (+CHILL +FREEZE), and a 64 x 46 preview in which a wizard casts that exact spell at a dummy, over and over. Type another rune and the rows change at once. Cast, and the row you're casting lights up. With nothing queued the panel shows your hands: Strike, Heavy, Special (or Siphon / Mend, held), Defend and your guard's Retreat, for the weapon and guard you hold. "Nothing queued: your hands. Tide trident (30) + Tide shield."

Under the title the panel always shows every element key with its letter, in the rune bar's order (Q W E R / A S D F G). The footer holds the numbers switch.

What a partner sees: nothing. The panel is local to your screen, and the game keeps running under it (you can play with it open; clicks under it still walk and cast).

## The calls Claude made (the user can veto any)

1. **The previews are the game itself, not icons.** Each row owns a tiny world (a Sanctum world with one wizard and one dummy) and the game's own `WorldView`, so a turret, a Bulwark block, a Surge or a Ring of stone look exactly as they do in play. The wizard is driven by the demo loop the screenshots already use (`demo.ts`), and the world resets every 2.8 s cycle (two cycles for a conjured weapon: conjure, then Strike; a guard: conjure, then block). The alternative was a per-shape icon animation tinted by element: much cheaper to draw, but it would show a spray where the game shows Ice shards, and it can't show the hands' moves at all.
2. **Cost, and keeping it cheap.** The previews step and draw only while the panel is open. Each has a small effect field (160 x 128 art px) instead of the arena's, they share the game view's rig frame cache (a wizard pose is painted once for all of them), and half of them redraw each frame (30 fps each). Under software rendering (headless SwiftShader) the panel costs about 7 ms a frame once warm; on a GPU it is much less. The first open builds the five views one per frame.
3. **The game world is untouched.** Previews have their own `World`; the one piece of sim module state a hit leaves behind (the hit kind, `hit.ts`) is put back after each preview step (`hitKindNow`, a new read-only export). The effect canvases' placement (`FIELD`) is swapped in and out around each preview. `help-preview-isolation.test.ts` runs the scripted replay with two preview worlds stepped in between and checks the hash is unchanged. The golden hash stays `d13d22ff`.
4. **Pixel text, at one scale under the HUD on big screens.** The panel uses the HUD's 3x5 font, drawn into a canvas at an integer scale: the HUD's scale up to 2x, one less above that (3x at 1080p). That fits 25 characters a line beside a preview and five rows down the screen. It sits under the Tune button and stops above the rune bar when it would overlap it (only on narrow windows).
5. **Text: the rules' first sentence or two, with a few rewrites.** Most rows use the rules' text cut to one or two sentences. Some cells read wrong that way because the rules describe the form's plain spell rather than the mix: Ice sheet (the rules say "Rain falls..."), Steam cloud ("sets the ground burning"), Freezing splash, Steam burst. Those, the imbued burst (its paragraph is long), and the Self cast without Shield or Sigil (which shows its traits: "Burn: sets you alight and dries you off") are written in `help-model.ts`. The hands' moves aren't in the rules at all, so they're written from the tables in `hands.ts` and `guards.ts`.
6. **Numbers are optional and off by default** (Shift+F2, or click the footer switch; remembered per browser). A row then shows rune cost (and "binds 1 Sigil" or "stands"), damage per element per hit or per second (or healing), reach or radius, how long it lasts, and the hold ("channel, free 2.5 s then 0.4/s", "charge up to 1 s"). They are read from the live config, so the tuning panel changes them. For the hands: blow damage, recovery, uses, parry window, Retreat distance.
7. **"Opposites cancel."** When your queue cancels (Fire then Cold), the footer says "Cold cancels Fire: opposites cancel, runes back" for 4 s; a double tap of Sigil or Shield says "a double tap dismisses". With the panel closed it shows as a toast over the rune bar, but only the first 5 times a browser sees one, so it stops nagging once learned.
8. **The first-session hint.** The first time a browser plays, "F2: what will my runes do?" blinks under the "?" button for 14 s, or until the panel is opened (a localStorage flag, wrapped in try/catch). Scripted and demo runs skip it unless `?helphint=1`.
9. **The gamepad.** D-pad up (unused until now) opens the panel for that pad's seat, and the key glyphs switch to the pad's buttons (RT, LT, LT HOLD, RB, LB+RT). Back stays "clear the queue".

## Trade-offs, named

- **Reading cost:** five rows of small pixel text is a lot to read mid-fight. The panel is meant for the Sanctum and the lulls; the previews carry most of the meaning at a glance.
- **Screen space:** at 1080p the panel covers the right fifth of the view. It hides when closed, and it never covers the rune bar.
- **Fidelity vs. cost:** five live worlds is the most expensive way to animate a help page. It's paid only while the panel is open, and it can't drift out of date when a spell's look changes.
- **Upkeep:** the hands' text and the four rewritten cells live in the client. When a weapon or guard changes in `hands.ts` / `guards.ts`, `help-model.ts` needs the same change (its test names the moves).

## Open questions

1. Should the panel pause the game in the Sanctum (or slow it), the way a tutorial would? Claude's pick: no; you learn by trying the spell right after reading.
2. Should the rows show the drag variants (drawn walls, line glyphs) as a sixth row when the queue has Shield or Sigil? Claude's pick: not yet; the Place row's text mentions dragging.
3. Should the rules' text for Ice sheet (and the other mixed Place / Area cells) be fixed in `tools/spell-atlas/rules-c.js`, so the Atlas and the game say the same thing? Claude's pick: yes, in the next rules pass.

## Code

- `game/packages/client/src/help-model.ts`: pure (queue or hands -> rows, text, stats), tested in `test/help-model.test.ts`.
- `game/packages/client/src/help-preview.ts`: one preview (its world, its view, the FIELD and hit-kind swaps).
- `game/packages/client/src/help-panel.ts`: the panel, the "?" button, the toggle, the hint and the toast, F2 and D-pad up.
- Hooks: `main.ts` (made, stepped and drawn), `hud.ts` (`barRect()`), `gamepad.ts` (`seatOfPad()`), `demo.ts` (`PERIOD` exported), `sim/hit.ts` (`hitKindNow()`).
