#!/usr/bin/env bash
# Render, pixelize and compare goblin models. usage: tools/goblin-3d/run.sh <work-dir> <name>=<model> ...
# Writes <work-dir>/<name>/ (4x renders + preview), <name>-px/ (game-size frames), still.png and one GIF per move.
set -e
cd "$(dirname "$0")/../.."
W="$(cygpath -m "$1")"; shift
B="${BLENDER:-/c/Program Files/Blender Foundation/Blender 5.2/blender.exe}"
rows=("PixelLab=game/content/generated/pixellab/warband/raider-hooded-32")
for nm in "$@"; do
  n="${nm%%=*}"; m="${nm#*=}"
  rm -rf "$W/$n" "$W/$n-px"
  "$B" --background --python tools/goblin-3d/render.py -- "$m" "$W/$n" --preview 2>&1 | grep -i "rendered\|error\|UNNAMED\|Traceback" || true
  python tools/goblin-3d/pixelize.py "$W/$n" "$W/$n-px"
  rows+=("$n=$W/$n-px")
done
python tools/goblin-3d/sheet.py still "$W/still.png" "${rows[@]}"
for mv in walk run attack; do python tools/goblin-3d/sheet.py gif "$W/$mv.gif" $mv "${rows[@]}"; done
