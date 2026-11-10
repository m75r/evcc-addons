// Baut den Proxy als einzelnes Node-Bundle dist/server.mjs
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { legalBanner } from "../sdk/bin/legal.mjs";

const root = resolve(import.meta.dirname, "../..");
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));

try {
  await build({
    entryPoints: [resolve(import.meta.dirname, "src/cli.ts")],
    outfile: resolve(import.meta.dirname, "dist/server.mjs"),
    platform: "node",
    target: "node22",
    format: "esm",
    bundle: true,
    // SDK aus dem Quelltext, ohne vorher packages/sdk/dist zu bauen
    conditions: ["source"],
    sourcemap: false,
    legalComments: "eof",
    banner: {
      js: [
        legalBanner("evcc-addons server", ["fflate (MIT)", "yaml (ISC)"]),
        // CommonJS-Abhängigkeiten (yaml) rufen require("process") auf; im ESM-Bundle fehlt require
        'import { createRequire as __createRequire } from "node:module";',
        "const require = __createRequire(import.meta.url);",
      ].join("\n"),
    },
    define: { __VERSION__: JSON.stringify(pkg.version) },
    logLevel: "warning",
  });
} catch (err) {
  process.stderr.write(
    `Build des Proxys fehlgeschlagen: ${err instanceof Error ? err.message : err}\n`,
  );
  process.exit(1);
}
