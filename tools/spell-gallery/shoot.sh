#!/usr/bin/env bash
# Render a vignette file's filmstrip to PNG with headless Chrome.
# Usage: tools/spell-gallery/shoot.sh vignettes/foo.js out.png [frames] [id]
set -e
DIR="$(cd "$(dirname "$0")" && pwd -W 2>/dev/null || pwd)"
FILE="$1"; OUT="$2"; FRAMES="${3:-6}"; ID="$4"
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
URL="file:///${DIR//\\//}/filmstrip.html?file=${FILE}&frames=${FRAMES}${ID:+&id=$ID}"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files \
  --window-size=1860,${HEIGHT:-1800} --virtual-time-budget=3000 --screenshot="$OUT" "$URL" 2>/dev/null
echo "wrote $OUT"
