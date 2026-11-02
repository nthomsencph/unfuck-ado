#!/usr/bin/env node
// Drive the user's Firefox through the project-local Claude for Firefox MCP
// server, ALWAYS in a tab this script opened itself.
//
//   node scripts/firefox-claude/ff.mjs '[["navigate",{"tabId":"$TAB","url":"https://…"}],["computer",{"tabId":"$TAB","action":"screenshot"}]]'
//
// Why its own tab: the extension's tab group adopts whatever tab sits in its
// window. On 2026-11-02 Firefox reused the group's blank tab for an externally
// opened about:debugging, and the next `navigate` replaced the user's tab
// (likely also their Violentmonkey tracking tab). So every run opens a fresh
// tab, refuses to touch privileged/local pages, and closes the tab at the end
// (KEEP=1 to leave it open).
//
// Env: SHOT=<prefix> saves screenshots as <prefix>-<n>.jpg; MAX=<n> truncates
// printed results (default 1200); KEEP=1 keeps the tab; PROBE results
// ("b64:…") are decoded automatically.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const server = join(here, "..", "..", ".firefox-claude", "firefox-mcp.mjs");
// Our own fresh tab starts on about:newtab/about:blank — those are fine.
const PROTECTED = /^(about:(?!newtab|blank|home)|moz-extension:|file:|chrome:|view-source:)/;

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
await tool("tabs_context_mcp", { createIfEmpty: true });
const created = text(await tool("tabs_create_mcp", {}));
const TAB = Number((created.match(/tab(?:Id)?\D{0,5}(\d+)/i) || [])[1]);
if (!TAB) {
  console.error("could not open a dedicated tab:", created.slice(0, 300));
  p.kill();
  process.exit(1);
}

const max = Number(process.env.MAX || 1200);
let n = 0;
for (const [name, args] of JSON.parse(process.argv[2].replaceAll('"$TAB"', String(TAB)))) {
  // Guard: never act on a tab that has drifted onto a privileged/local page.
  const ctx = text(await tool("tabs_context_mcp", {}));
  const url = (ctx.match(new RegExp(`tabId ${TAB}: "[^"]*" \\(([^)\\s]+)`)) || [])[1] || "";
  if (name !== "navigate" && !name.startsWith("tabs_") && PROTECTED.test(url)) {
    console.error(`refusing ${name}: tab ${TAB} is on ${url}`);
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

if (!process.env.KEEP) await tool("tabs_close_mcp", { tabId: TAB });
p.kill();
