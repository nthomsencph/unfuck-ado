import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      // build.mjs serves virtual:primer/{tokens,bridge} as generated CSS text.
      // Tests don't need the real sheets — an empty string lets any module that
      // imports the primer index (e.g. for octicon) load under vitest.
      name: "adofix-virtual-primer-stub",
      resolveId: (id) => (id.startsWith("virtual:primer/") ? `\0${id}` : null),
      load: (id) => (id.startsWith("\0virtual:primer/") ? 'export default "";' : null),
    },
  ],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});
