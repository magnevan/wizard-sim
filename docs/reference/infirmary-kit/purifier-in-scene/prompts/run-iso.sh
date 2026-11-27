#!/usr/bin/env bash
# Runs isolated-structure prompts: run-iso.sh <n>... (each in parallel; pass at most three).
# References: court-buildings.png for the look, the scene painting for the structure.
cd /c/Users/mvikj/Code/magicka-toy/.claude/worktrees/infirmary-kit || exit 1
D=docs/reference/infirmary-kit
P=$D/purifier-in-scene/prompts
R=$D/purifier-in-scene/raw
for n in "$@"; do
  tools/concept-gen/gen.sh $P/iso-$n.txt $R docs/reference/court-kit/court-buildings.png $R/purif-${n%b}.png &
done
wait
