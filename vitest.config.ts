// Vitest-Projekte: Proxy (Node), Loader und Addons (happy-dom)
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const jsx = { jsx: { runtime: "automatic", importSource: "preact" } } as const;
const CSS_PREFIX = "\0css-text:";
const CSS_SUFFIX = ".js";

/** Importiert CSS-Dateien als Zeichenkette, wie esbuild mit `loader: { ".css": "text" }` */
function cssAsText(): Plugin {
  return {
    name: "css-as-text",
    enforce: "pre",
    async resolveId(source, importer) {
      if (!source.endsWith(".css")) return null;
      const resolved = await this.resolve(source, importer, { skipSelf: true });
      return resolved ? CSS_PREFIX + resolved.id + CSS_SUFFIX : null;
    },
    load(id) {
      if (!id.startsWith(CSS_PREFIX)) return null;
      const file = id.slice(CSS_PREFIX.length, -CSS_SUFFIX.length);
      return `export default ${JSON.stringify(readFileSync(file, "utf8"))};`;
    },
  };
}

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "proxy",
          root: "packages/proxy",
          environment: "node",
          include: ["test/**/*.test.ts"],
        },
      },
      {
        oxc: jsx,
        plugins: [cssAsText()],
        test: {
          name: "loader",
          root: "packages/loader",
          environment: "happy-dom",
          include: ["test/**/*.test.{ts,tsx}"],
        },
      },
      {
        oxc: jsx,
        plugins: [cssAsText()],
        test: {
          name: "addons",
          environment: "happy-dom",
          include: ["addons/*/test/**/*.test.{ts,tsx}"],
          passWithNoTests: true,
        },
      },
    ],
  },
});
