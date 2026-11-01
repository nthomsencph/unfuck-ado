#!/usr/bin/env bash
# Copy Claude Code's current OAuth ACCESS token (from the macOS Keychain) into
# the project-local Firefox extension, which picks it up within 5 minutes.
#
# The refresh token is deliberately NOT copied: the extension would use it to
# refresh, the server rotates refresh tokens, and Claude Code's own copy would
# stop working. Claude Code refreshes its token itself; the native host re-runs
# this script every 5 minutes while Firefox is open, so the copy stays current.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EXT="$ROOT/.firefox-claude/ext"
[[ -d "$EXT" ]] || { echo "Run scripts/firefox-claude/setup.sh first." >&2; exit 1; }
NODE="${NODE:-$(command -v node)}"

security find-generic-password -s 'Claude Code-credentials' -w 2>/dev/null \
| "$NODE" -e '
  const fs = require("fs"), path = require("path"), dst = process.argv[1];
  let raw = ""; process.stdin.on("data", d => raw += d).on("end", () => {
    let o; try { o = JSON.parse(raw).claudeAiOauth || {}; } catch { o = {}; }
    if (!o.accessToken) { console.error("No Claude Code login found in Keychain. Run `claude` and log in."); process.exit(1); }
    const tmp = path.join(path.dirname(dst), ".tokens.tmp");
    fs.writeFileSync(tmp, JSON.stringify({ accessToken: o.accessToken, refreshToken: "", expiresAt: o.expiresAt || 0 }), { mode: 0o600 });
    fs.renameSync(tmp, dst);
    console.log("Token copied; expires " + (o.expiresAt ? new Date(o.expiresAt).toLocaleString() : "(unknown)"));
  });
' "$EXT/firefox-injected-tokens.json"
