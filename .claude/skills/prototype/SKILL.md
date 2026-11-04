---
name: prototype
description: Turn a design idea from docs/ideas into a minimal playable prototype in prototypes/. Use when the user wants to try out, test, or build a mechanic.
---

# Prototype

1. **Pick the question:** read the idea file. Agree with the user on the *one* question the prototype answers, and its smallest test. Cut everything else.
2. **Check the stack:** look in `docs/decisions/README.md` for the prototype tech choice. If none has been made, propose one (default: a browser canvas game in TypeScript + Vite, because it runs instantly and is easy to share) and record the decision once the user agrees.
3. **Scaffold** `prototypes/NN-short-name/` (NN = next number) with a README containing Question / Run / Findings (Findings left empty).
4. **Build the minimum:** placeholder art (circles, colors) and hard-coded values, with tuning knobs exposed as constants at the top of a file or as on-screen sliders. Simulate co-op with a second player on the same keyboard or a scripted dummy before doing any networking.
5. **Run it** and confirm it starts. Tell the user exactly what to try.
6. **After play:** fill in Findings, update the idea's status, and log any decision.
