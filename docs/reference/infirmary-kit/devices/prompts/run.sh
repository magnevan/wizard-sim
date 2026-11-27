#!/usr/bin/env bash
# Runs the device prompts through tools/concept-gen/gen.sh, three at a time, into ../raw/.
cd "$(dirname "$0")/../../../../.." || exit 1
k=docs/reference/infirmary-kit
refs="$k/tent-a.png $k/well-novines-b.png $k/round3/purifier-c.png docs/reference/court-kit/court-buildings.png"
ls $k/devices/prompts/dev-*.txt | xargs -P 3 -I{} bash -c "tools/concept-gen/gen.sh {} $k/devices/raw $refs"
