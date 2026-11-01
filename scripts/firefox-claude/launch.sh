#!/usr/bin/env bash
# Load the project-local Claude extension into your normal, running Firefox.
#
# Release Firefox only runs unsigned extensions as "temporary add-ons", which
# are unloaded when Firefox quits. So: run this once per Firefox session. It
# opens about:debugging as a new tab in your current window and puts the
# manifest path on the clipboard. Click "Load Temporary Add-on…", press
# Cmd+Shift+G, paste, Enter.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MANIFEST="$ROOT/.firefox-claude/ext/manifest.json"
[[ -f "$MANIFEST" ]] || { echo "Run scripts/firefox-claude/setup.sh first." >&2; exit 1; }

"$ROOT/scripts/firefox-claude/tokens.sh"
printf '%s' "$MANIFEST" | pbcopy
# `open -a` percent-encodes the "#"; the Firefox binary hands the URL to the running instance as-is
"${FIREFOX_BIN:-/Applications/Firefox.app/Contents/MacOS/firefox}" --new-tab "about:debugging#/runtime/this-firefox" &>/dev/null &

cat <<EOF
Opened about:debugging in Firefox. Manifest path copied to clipboard:
  $MANIFEST
In that tab: "Load Temporary Add-on…" → Cmd+Shift+G → paste → Enter.
Close the Claude login prompt if it appears; Claude Code doesn't need it.
EOF
