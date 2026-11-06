// Baut den Browser-Loader als ES-Modul dist/loader.js
import { build } from "esbuild";
import { resolve } from "node:path";

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
    legalComments: "none",
    logLevel: "warning",
  });
} catch (err) {
  process.stderr.write(
    `Build des Loaders fehlgeschlagen: ${err instanceof Error ? err.message : err}\n`,
  );
  process.exit(1);
}
