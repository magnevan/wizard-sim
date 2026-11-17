#!/usr/bin/env bash
# Render and pixelize the warband roster from its Meshy rigs and clips (tools/sprites-3d/output/<slug>/, gitignored).
# usage: tools/sprites-3d/roster.sh <work-dir> [slug ...]    then: python tools/sprites-3d/pack.py <work-dir>
# Writes <work-dir>/<slug>/ (4x renders, track.json per move) and <work-dir>/<slug>-px/ (game-size frames).
# The baked sheets are the fallback now (?live3d=0); the game draws the roster live from export.sh's models.
set -u
cd "$(dirname "$0")/../.."
W="$(cygpath -m "$1")"; shift
B="${BLENDER:-/c/Program Files/Blender Foundation/Blender 5.2/blender.exe}"
O=tools/sprites-3d/output
ELEV=--elev=20
FPS=--fps=24   # 24 so a slowed goblin (chilled) still shows 12 distinct frames a second
source tools/sprites-3d/roster-opts.sh
slugs=("$@"); [ ${#slugs[@]} -eq 0 ] && slugs=("${ROSTER[@]}")
for s in "${slugs[@]}"; do
  d="$O/${DIR[$s]:-$s}"
  rm -rf "${W:?}/${s:?}" "${W:?}/${s:?}-px"
  for f in walking running clips; do
    only=""; [ "$s" = raider-hooded ] && [ $f = clips ] && only="left_slash,thrust_slash,right_hand_sword_slash,lean_forward_sprint,knock_down"
    [ "$s" != "${s#raider}" ] && [ $f = running ] && continue   # raiders run with the sprint clip
    "$B" --background --python tools/sprites-3d/render.py -- "$d/$f.glb" "$W/$s" $only --anim $ELEV $FPS ${OPTS[$s]} 2>&1 | grep -E "^clips|rendered|Error|Traceback|line [0-9]" | sed "s/^/$s: /"
  done
  python tools/sprites-3d/pixelize.py "$W/$s" "$W/$s-px" | tail -1 | sed "s/^/$s: /"
done
echo DONE
