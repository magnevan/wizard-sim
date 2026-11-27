#!/usr/bin/env bash
# Runs the six in-scene purifier prompts, at most three at once.
cd /c/Users/mvikj/Code/magicka-toy/.claude/worktrees/infirmary-kit || exit 1
D=docs/reference/infirmary-kit
P=$D/purifier-in-scene/prompts
R=$D/purifier-in-scene/raw
IMG=tools/infirmary-review/img
run() { # n, extra refs...
  n=$1; shift
  tools/concept-gen/gen.sh $P/purif-$n.txt $R $IMG/h2-cove.jpg $IMG/paint-h-cove.jpg "$@"
}
run 1 $D/round3/purifier-c.png &
run 2 $D/round3/purifier-c.png &
run 3 $D/round3/purifier-a.png &
wait
run 4 $D/round3/purifier-b.png &
run 5 &
run 6 &
wait
ls -la $R
