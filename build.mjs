import * as esbuild from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const banner = readFileSync("src/banner.txt", "utf8").replace("__VERSION__", pkg.version);
const watch = process.argv.includes("--watch");

/** @type {import("esbuild").BuildOptions} */
const options = {
  entryPoints: ["src/main.ts"],
  outfile: "dist/ado-unfuck.user.js",
  bundle: true,
  format: "iife",
  target: "firefox115",
  charset: "utf8",
  banner: { js: banner },
  define: { __ADOFIX_VERSION__: JSON.stringify(pkg.version) },
  loader: { ".css": "text" },
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
