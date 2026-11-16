#!/usr/bin/env bash
# Generate one concept image with the Codex app's CLI (the user's subscription).
#
# usage: tools/concept-gen/gen.sh <prompt.txt> <out-dir> [reference images...]
#
# The prompt file asks for one image and names the file to save (see README).
# Runs in <out-dir>, writes <out-dir>/<prompt-name>.log, and gives up after 15 minutes.
set -u
prompt="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
out="$2"; shift 2
mkdir -p "$out"
refs=()
for r in "$@"; do refs+=(-i "$(cd "$(dirname "$r")" && pwd)/$(basename "$r")"); done

# The Codex app ships its CLI inside its install folder, which can't be listed directly.
if [ -z "${CODEX_EXE:-}" ]; then
  dir="$(powershell.exe -NoProfile -Command '(Get-AppxPackage -Name OpenAI.Codex).InstallLocation' | tr -d '\r')"
  CODEX_EXE="$(cygpath -u "$dir")/app/resources/codex.exe"
fi

cd "$out" || exit 1
log="$(basename "${prompt%.*}").log"
# notify=[]: skip the app's turn-ended hook; --ephemeral: don't keep the session.
timeout 900 "$CODEX_EXE" exec -c 'notify=[]' --ephemeral --skip-git-repo-check -s workspace-write \
  "${refs[@]}" - < "$prompt" > "$log" 2>&1
code=$?
echo "exit $code ($out/$log)"
exit $code
