#!/usr/bin/env bash
# Runs round 2's device prompts through tools/concept-gen/gen.sh, three at a time, into ../raw/.
# usage: run.sh [name ...]   (default: every line of refs.txt)
cd "$(dirname "$0")/../../../../.." || exit 1
k=docs/reference/infirmary-kit
p=$k/devices2/prompts
lines=$(if [ $# -gt 0 ]; then for n in "$@"; do grep "^$n " $p/refs.txt; done; else cat $p/refs.txt; fi)
echo "$lines" | xargs -P 3 -L 1 bash -c 'n=$0; shift; r=(); for x in "$@"; do r+=("'$k'/$x"); done; tools/concept-gen/gen.sh '$p'/$n.txt '$k'/devices2/raw "${r[@]}"'
