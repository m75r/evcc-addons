// Vitest-Plugin für Addon-Repos: CSS-Importe als Text, wie `evcc-addon build` (esbuild `loader: { ".css": "text" }`)
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

const CSS_PREFIX = "\0css-text:";
const CSS_SUFFIX = ".js";

/** Importiert CSS-Dateien als Zeichenkette (`import styles from "./styles.css"`) */
export function cssAsText(): Plugin {
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
