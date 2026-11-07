// Baut den Browser-Loader als ES-Modul dist/loader.js
import { build } from "esbuild";
import { resolve } from "node:path";
import { legalBanner } from "../../scripts/legal.mjs";

const BANNER = legalBanner("evcc-addons loader", ["Preact (MIT)", "@h2d2/shopicons (Apache-2.0)"]);

try {
  await build({
    entryPoints: [resolve(import.meta.dirname, "src/main.ts")],
    outfile: resolve(import.meta.dirname, "dist/loader.js"),
    bundle: true,
    format: "esm",
    target: "es2020",
    jsx: "automatic",
    jsxImportSource: "preact",
    loader: { ".css": "text" },
    minify: true,
    legalComments: "eof",
    banner: { js: BANNER },
    logLevel: "warning",
  });
} catch (err) {
  process.stderr.write(
    `Build des Loaders fehlgeschlagen: ${err instanceof Error ? err.message : err}\n`,
  );
  process.exit(1);
}
