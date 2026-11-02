import * as esbuild from "esbuild";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const watch = process.argv.includes("--watch");
/*
 * Only release builds carry @updateURL/@downloadURL. A local build installed
 * with Violentmonkey's "Track external edits" would otherwise be replaced by
 * the next GitHub release (auto-update), silently ending tracking — that
 * happened on 2026-11-02. `pnpm build:release` (ADOFIX_RELEASE=1) keeps them.
 */
const release = process.env.ADOFIX_RELEASE === "1";
const banner = readFileSync("src/banner.txt", "utf8")
  .replace("__VERSION__", pkg.version)
  .split("\n")
  .filter((line) => release || !/^\/\/ @(updateURL|downloadURL)\b/.test(line))
  .join("\n");

/*
 * Primer foundation CSS, computed at build time and served to src/ as
 * virtual:primer/tokens and virtual:primer/bridge (text). The logic is
 * src/core/primer/build-css.ts — bundled here on the fly so it stays plain,
 * tested TypeScript.
 */
const PRIMER = "node_modules/@primer/primitives/dist/css";
const PRIMER_WHOLE = [
  // viewport.css is skipped: @custom-media only, which no browser parses.
  ...["border", "breakpoints", "radius", "size", "size-coarse", "size-fine", "z-index"].map(
    (f) => `${PRIMER}/functional/size/${f}.css`
  ),
  `${PRIMER}/functional/typography/typography.css`,
  // functional typography aliases these
  `${PRIMER}/base/typography/typography.css`,
];
const PRIMER_THEMES = [`${PRIMER}/functional/themes/dark.css`, `${PRIMER}/functional/themes/light.css`];

const { outputFiles } = await esbuild.build({
  entryPoints: ["src/core/primer/build-css.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const { buildPrimerCss } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`
);

/** src/** files that may reference tokens — tests carry deliberate typos. */
function tokenSources(dir = "src") {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return tokenSources(path);
    return /\.(ts|css)$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [path] : [];
  });
}

/** @type {import("esbuild").Plugin} */
const primerPlugin = {
  name: "primer",
  setup(build) {
    build.onResolve({ filter: /^virtual:primer\// }, (args) => ({ path: args.path, namespace: "primer" }));
    build.onLoad({ filter: /.*/, namespace: "primer" }, (args) => {
      const sources = tokenSources();
      const read = (f) => readFileSync(f, "utf8");
      const css = buildPrimerCss({
        dark: read(PRIMER_THEMES[0]),
        light: read(PRIMER_THEMES[1]),
        whole: PRIMER_WHOLE.map(read),
        sources: sources.map(read),
      });
      const which = args.path.slice("virtual:primer/".length);
      if (!(which in css)) throw new Error(`primer: no virtual module ${args.path}`);
      return {
        contents: css[which],
        loader: "text",
        watchFiles: [...sources, ...PRIMER_WHOLE, ...PRIMER_THEMES].map((f) => join(process.cwd(), f)),
      };
    });
  },
};

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
  plugins: [primerPlugin],
  // Dev-only: ADOFIX_DEV_FOOTER=<file.js> appends that script to the bundle,
  // for read-only live probes during development (Violentmonkey runs dist/ in
  // the ADO tab). Release builds never set it.
  ...(process.env.ADOFIX_DEV_FOOTER
    ? { footer: { js: readFileSync(process.env.ADOFIX_DEV_FOOTER, "utf8") } }
    : {}),
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
