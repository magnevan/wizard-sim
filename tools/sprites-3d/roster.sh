#!/usr/bin/env bash
# Render and pixelize the warband roster from its Meshy rigs and clips (tools/sprites-3d/output/<slug>/, gitignored).
# usage: tools/sprites-3d/roster.sh <work-dir> [slug ...]    then: python tools/sprites-3d/pack.py <work-dir>
# Writes <work-dir>/<slug>/ (4x renders, track.json per move) and <work-dir>/<slug>-px/ (game-size frames).
set -u
cd "$(dirname "$0")/../.."
W="$(cygpath -m "$1")"; shift
B="${BLENDER:-/c/Program Files/Blender Foundation/Blender 5.2/blender.exe}"
O=tools/sprites-3d/output
P=tools/sprites-3d/props.py
ELEV=--elev=20
# slug: model files | render options
declare -A OPTS=(
  [raider-hooded]="--add=tools/sprites-3d/raider_codex.py:blade"
  [raider-goggles]="--prop=$P:knife@RightHand"
  [archer]="--prop=$P:bow@LeftHand --release=archery_shot:39 --yaw=archery_shot:-90:14:30:48:58"   # the clip shoots out of its left side
  [shieldbearer]="--prop=$P:spear@RightHand --prop=$P:shield@LeftForeArm"
  [hooker]="--prop=$P:hook@RightHand"
  [chieftain]="--prop=$P:maul@RightHand --canvas=96 --height=1.8"
)
declare -A DIR=([raider-hooded]=meshy-rig)
slugs=("$@"); [ ${#slugs[@]} -eq 0 ] && slugs=(raider-hooded raider-goggles archer shieldbearer hooker chieftain)
for s in "${slugs[@]}"; do
  d="$O/${DIR[$s]:-$s}"
  rm -rf "${W:?}/${s:?}" "${W:?}/${s:?}-px"
  for f in walking running clips; do
    only=""; [ "$s" = raider-hooded ] && [ $f = clips ] && only="left_slash,thrust_slash,right_hand_sword_slash,lean_forward_sprint,knock_down"
    [ "$s" != "${s#raider}" ] && [ $f = running ] && continue   # raiders run with the sprint clip
    "$B" --background --python tools/sprites-3d/render.py -- "$d/$f.glb" "$W/$s" $only --anim $ELEV ${OPTS[$s]} 2>&1 | grep -E "^clips|rendered|Error|Traceback|line [0-9]" | sed "s/^/$s: /"
  done
  python tools/sprites-3d/pixelize.py "$W/$s" "$W/$s-px" | tail -1 | sed "s/^/$s: /"
done
echo DONE
