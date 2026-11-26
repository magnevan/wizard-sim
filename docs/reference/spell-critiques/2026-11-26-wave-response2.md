Iteration 2 critique (6/10, "presentable: yes"), summarised: pale beaded hoop with weak fire mass; the burst at 0.45 s two bright fragments; aftermath too faint; particles use the caster's floor height everywhere.

Our response: we disagree that it was presentable (it got thinner than iteration 1), so all three changes were applied as given:
- PUFFS size base 0.46 + 0.16 rnd; LOOK_PUFF colours (2.4, 1.25, 0.45) to (1.0, 0.7, 0.45), full cover; ground hot line 0.35.
- RISE as the wake: born to uTr * 1.05, radius max(0, frontAt(tb) - 0.08), shrinking and lifting 0.4 as it dies, cover fading over its last quarter.
- Soot: blotches smoothstep(0.48, 0.72), alpha 0.8; smokePerU 2.0, smoke alpha 0.5.
- The per-particle floor height on steps is noted for later (not fixed this round).
