#!/usr/bin/env bash
# Project-local Claude-in-Firefox setup for live ADO verification.
#
# Installs NetVar1337/claude-for-firefox at an audited, pinned commit into
# .firefox-claude/ (gitignored), with these changes from upstream:
#   - the claude.ai page bridge content script is removed
#   - only Claude Code's ACCESS token is copied in (tokens.sh), never the
#     refresh token, so the extension can't rotate Claude Code's login away
#   - a separate native host on a socket inside .firefox-claude/, so Chrome's
#     Claude extension keeps working side by side
#   - the `firefox` MCP server is registered with Claude Code in LOCAL scope
#     (this project directory only)
#
# The one file outside this repo is the native-messaging manifest. Firefox
# only looks for those in a per-user directory on macOS. It allows only this
# extension ID to start the host.
#
#   scripts/firefox-claude/setup.sh              install / refresh
#   scripts/firefox-claude/setup.sh --uninstall  remove everything it added
set -euo pipefail

REPO_URL="https://github.com/NetVar1337/claude-for-firefox"
PINNED_COMMIT="5ed02a6ad2e659476a8f4ee87b976cc1a1164630"  # audited 2026-11-01
EXT_ID="claude-for-firefox@anthropic.community"
NMH_NAME="com.anthropic.claude_code_browser_extension"
NMH_FILE="$HOME/Library/Application Support/Mozilla/NativeMessagingHosts/$NMH_NAME.json"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIR="$ROOT/.firefox-claude"
SRC="$DIR/src"
EXT="$DIR/ext"

[[ "$(uname -s)" == Darwin ]] || { echo "macOS only" >&2; exit 1; }

if [[ "${1:-}" == "--uninstall" ]]; then
  (cd "$ROOT" && claude mcp remove firefox --scope local >/dev/null 2>&1) || true
  rm -f "$NMH_FILE"
  rm -rf "$DIR"
  echo "Removed .firefox-claude/, $NMH_FILE and the local 'firefox' MCP server."
  exit 0
fi

NODE="$(command -v node)" || { echo "node not found" >&2; exit 1; }
mkdir -p "$DIR"

# 1. Fetch the pinned commit (re-uses an existing clone)
if [[ ! -d "$SRC/.git" ]]; then
  git clone --quiet "$REPO_URL" "$SRC"
fi
git -C "$SRC" fetch --quiet origin "$PINNED_COMMIT" 2>/dev/null || git -C "$SRC" fetch --quiet origin
git -C "$SRC" -c advice.detachedHead=false checkout --quiet --force "$PINNED_COMMIT"
[[ "$(git -C "$SRC" rev-parse HEAD)" == "$PINNED_COMMIT" ]] || { echo "commit mismatch" >&2; exit 1; }
git -C "$SRC" clean -qfdx

# 2. Build the extension dir (no installers, no native/, no tokens)
rm -rf "$EXT"
mkdir -p "$EXT"
rsync -a --exclude='.git' --exclude='install.sh' --exclude='install.ps1' \
  --exclude='native' --exclude='README.md' "$SRC/" "$EXT/"

# Drop the claude.ai bridge: it lets any script on claude.ai send internal
# extension messages (prompt injection into the sidebar, permission mode, logout).
"$NODE" -e '
  const fs = require("fs"), f = process.argv[1];
  const m = JSON.parse(fs.readFileSync(f, "utf8"));
  m.content_scripts = m.content_scripts.filter(cs => !cs.js.includes("firefox-claude-ai-bridge.js"));
  fs.writeFileSync(f, JSON.stringify(m, null, 2) + "\n");
' "$EXT/manifest.json"
rm -f "$EXT/firefox-claude-ai-bridge.js"

# Read-only probes for CSP-strict pages (see probe.js): ADO and GitHub block
# eval, so the javascript tool's eval-based shim can't run there.
"$NODE" -e '
  const fs = require("fs"), [f, probeFile] = process.argv.slice(1);
  const probe = fs.readFileSync(probeFile, "utf8");
  const anchor = "if (!expr) return { result: { type: \x27undefined\x27 } };";
  let s = fs.readFileSync(f, "utf8");
  if (!s.includes(anchor)) { console.error("probe patch anchor missing"); process.exit(1); }
  s = s.replace(anchor, anchor + `
          const probeMatch = expr.match(/__PROBE__(\\{[\\s\\S]*?\\})__END__/);
          if (probeMatch) {
            // The tool embeds the code via JSON.stringify, so the probe JSON
            // arrives escaped once. Never throw: a rejected shim call hangs the
            // caller until its 45s timeout.
            let v;
            try {
              let q;
              try { q = JSON.parse(probeMatch[1]); } catch (_) { q = JSON.parse(JSON.parse(\x27"\x27 + probeMatch[1] + \x27"\x27)); }
              if (q.op === \x27reload\x27) { setTimeout(() => chrome.runtime.reload(), 200); return { result: { type: \x27string\x27, value: \x27reloading\x27, description: \x27reloading\x27 } }; }
              const [inj] = await browser.scripting.executeScript({ target: { tabId }, func: adofixProbe, args: [q], world: \x27MAIN\x27 });
              // base64: the tool's output filter blocks text that looks like cookies/query strings
              v = \x27b64:\x27 + btoa(unescape(encodeURIComponent(JSON.stringify(inj && inj.result))));
            } catch (e) { v = JSON.stringify({ probeError: String(e && e.message || e) }); }
            return { result: { type: \x27string\x27, value: v, description: v } };
          }`);
  fs.writeFileSync(f, s + "\n" + probe);
' "$EXT/firefox-compat.js" "$ROOT/scripts/firefox-claude/probe.js"

# 3. Native host + MCP server, talking over a socket inside .firefox-claude/.
# Upstream uses os.tmpdir(), which differs between Firefox (launched from the
# Dock: /var/folders/…) and Claude Code (may be /tmp), so they never meet.
SOCK="$DIR/bridge.sock"
for f in firefox-host.mjs firefox-mcp.mjs; do
  "$NODE" -e '
    const fs = require("fs"), [src, dst, sock] = process.argv.slice(1);
    const s = fs.readFileSync(src, "utf8");
    const out = s.replace(/path\.join\(os\.tmpdir\(\), `claude-firefox-bridge-\$\{user\}\.sock`\)/, JSON.stringify(sock));
    if (out === s) { console.error("socket path patch failed: " + src); process.exit(1); }
    fs.writeFileSync(dst, out);
  ' "$SRC/native/$f" "$DIR/$f" "$SOCK"
done
# Firefox starts this wrapper. Besides the host it keeps the access token fresh:
# every 5 min, for as long as the host (same PID after exec) is alive. The loop
# must not touch stdin/stdout, which carry native-messaging frames.
cat > "$DIR/native-host.sh" <<EOF
#!/usr/bin/env bash
( while kill -0 \$\$ 2>/dev/null; do
    NODE="$NODE" "$ROOT/scripts/firefox-claude/tokens.sh" >/dev/null 2>>"$DIR/host.log"
    sleep 300
  done ) </dev/null >/dev/null 2>&1 &
exec "$NODE" "$DIR/firefox-host.mjs" 2>>"$DIR/host.log"
EOF
chmod +x "$DIR/native-host.sh"

mkdir -p "$(dirname "$NMH_FILE")"
cat > "$NMH_FILE" <<EOF
{
  "name": "$NMH_NAME",
  "description": "Claude Code host for Claude for Firefox (unfuck-ado project)",
  "path": "$DIR/native-host.sh",
  "type": "stdio",
  "allowed_extensions": ["$EXT_ID"]
}
EOF

# 4. MCP server for Claude Code, this project only
(cd "$ROOT" && claude mcp remove firefox --scope local >/dev/null 2>&1 || true
 claude mcp add firefox --scope local -- "$NODE" "$DIR/firefox-mcp.mjs" >/dev/null)

# 5. Claude Code access token (macOS may ask once for Keychain access)
NODE="$NODE" "$ROOT/scripts/firefox-claude/tokens.sh" || echo "Token copy failed; Claude Code tools will be denied until it works." >&2

echo "Done. Load it into your running Firefox with: pnpm firefox"
echo "Then restart Claude Code in this project to pick up the mcp__firefox__* tools."
