declare module "*.css" {
  const css: string;
  export default css;
}

/** Injected by build.mjs from package.json; "dev" under vitest. */
declare const __ADOFIX_VERSION__: string;

/** Build-generated Primer CSS (build.mjs: token sheet, ADO bridge). */
declare module "virtual:primer/*" {
  const css: string;
  export default css;
}
