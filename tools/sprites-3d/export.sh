#!/usr/bin/env bash
# Export the warband roster as the game's live 3D models (render.py --export; see export_game.py). No generation calls.
# usage: tools/sprites-3d/export.sh [slug ...]
# Writes game/content/assets/models/<slug>.glb and <slug>.json from tools/sprites-3d/output/<slug>/ (committed Meshy
# downloads: clips.glb, walking.glb, running.glb). About half a minute a character.
set -u
cd "$(dirname "$0")/../.."
B="${BLENDER:-/c/Program Files/Blender Foundation/Blender 5.2/blender.exe}"
O=tools/sprites-3d/output
OUT=game/content/assets/models
TMP="${TMPDIR:-/tmp}/sprites-3d-export"
source tools/sprites-3d/roster-opts.sh
slugs=("$@"); [ ${#slugs[@]} -eq 0 ] && slugs=("${ROSTER[@]}")
for s in "${slugs[@]}"; do
  d="$O/${DIR[$s]:-$s}"
  more="--more=$d/walking.glb"; [ "$s" = "${s#raider}" ] && more="$more --more=$d/running.glb"   # raiders run with the sprint clip in clips.glb
  for gc in "$d"/guard-*.glb "$d"/attack-*.glb; do [ -f "$gc" ] && more="$more --more=$gc"; done   # the wizard's guard clips (round 3) and weapon blows (round 4)
  "$B" --background --python tools/sprites-3d/render.py -- "$d/clips.glb" "$TMP/$s" --anim --export="$OUT/$s.glb" --slug="$s" $more ${OPTS[$s]} $([ "$s" = wizard ] && echo "$WIZ_ARMS") 2>&1 \
    | grep -E "^exported|Error|Traceback|line [0-9]|SystemExit|no clip" | sed "s/^/$s: /"
done
echo DONE
