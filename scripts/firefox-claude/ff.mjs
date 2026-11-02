#!/usr/bin/env node
// Drive the user's Firefox through the project-local Claude for Firefox MCP
// server, in the extension's OWN window — never in a tab the user is using.
//
//   node scripts/firefox-claude/ff.mjs '[["navigate",{"tabId":"$TAB","url":"https://…"}],["computer",{"tabId":"$TAB","action":"screenshot"}]]'
//
// Lessons from 2026-11-02:
// - The extension's tab group adopts tabs. Firefox reused its blank tab for an
//   externally opened about:debugging (and likely the user's Violentmonkey
//   tab); later navigates replaced the user's tab. And the user went on to
//   browse in the group's tab.
// - tabs_create_mcp opens tabs with active:false. Firefox throttles timers in
//   background tabs so hard that the userscript's settle work (and dev probes)
//   never ran — pages rendered half-applied.
// So: work in the group's tab, which tabs_context_mcp(createIfEmpty) puts in
// a dedicated, focused window; refuse to act if that tab shows a page this
// script wouldn't have opened (the user may have wandered into it). If the
// group holds a user tab, ask the user to close it — the next run then opens
// a fresh dedicated window.
//
// The dedicated window must stay at least partly VISIBLE: macOS reports fully
// covered windows to Firefox, which then throttles their timers like background
// tabs (a 7s setTimeout never fired in 12s on 2026-11-02).
//
// Env: SHOT=<prefix> saves screenshots as <prefix>-<n>.jpg; MAX=<n> truncates
// printed results (default 1200). Probe results ("b64:…") are decoded.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const server = join(here, "..", "..", ".firefox-claude", "firefox-mcp.mjs");
// Pages this script opens itself. Anything else in the group's tab means the
// user is using it. login.microsoftonline.com: ADO redirects there itself
// when the session expires (2026-11-02), and navigating away is the fix.
const OURS = /^(about:(newtab|blank|home)|https:\/\/(dev\.azure\.com|[\w-]+\.visualstudio\.com|login\.microsoftonline\.com|github\.com|example\.com|www\.iana\.org)\/)/;

const p = spawn(process.execPath, [server]);
let buf = "";
const waiters = {};
p.stdout.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const m = JSON.parse(buf.slice(0, i));
    buf = buf.slice(i + 1);
    waiters[m.id]?.(m);
  }
});
let id = 0;
const call = (method, params) =>
  new Promise((r) => {
    waiters[++id] = r;
    p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
const tool = async (name, args) => (await call("tools/call", { name, arguments: args })).result;
const text = (res) => (res?.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n");

await call("initialize", {});
const ctx0 = JSON.parse(text(await tool("tabs_context_mcp", { createIfEmpty: true })).split("\n\n")[0]);
const tabs = ctx0.availableTabs ?? [];
if (tabs.length !== 1) {
  console.error(`the Claude group holds ${tabs.length} tabs (${tabs.map((t) => `${t.tabId} ${t.url}`).join(", ")}) — expected exactly its own one; ask the user to close the extra tabs`);
  p.kill();
  process.exit(1);
}
const TAB = tabs[0].tabId;
const max = Number(process.env.MAX || 1200);
let n = 0;
for (const [name, args] of JSON.parse(process.argv[2].replaceAll('"$TAB"', String(TAB)))) {
  // Guard: never act on a tab that has drifted onto a privileged/local page.
  const ctx = text(await tool("tabs_context_mcp", {}));
  const url = (ctx.match(new RegExp(`tabId ${TAB}: "[^"]*" \\(([^)\\s]+)`)) || [])[1] || "";
  if (!name.startsWith("tabs_") && url && !OURS.test(url)) {
    console.error(`refusing ${name}: tab ${TAB} shows ${url}, which this script didn't open — the user may be using it`);
    break;
  }
  const t = Date.now();
  const res = await tool(name, args);
  n++;
  if (process.env.SHOT) {
    for (const c of res?.content ?? []) {
      if (c.type === "image") {
        const f = `${process.env.SHOT}-${n}.jpg`;
        writeFileSync(f, Buffer.from(c.data, "base64"));
        console.log("saved", f);
      }
    }
  }
  let out = text(res);
  if (out.startsWith("b64:")) out = Buffer.from(out.slice(4).split("\n")[0], "base64").toString("utf8");
  console.log(`## ${name} (${Date.now() - t}ms) =>`, out.length > max ? out.slice(0, max) + "…" : out);
}

p.kill();
