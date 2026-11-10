// Baut den Proxy (dist/server.mjs) und den Root-Updater (dist/updater.mjs) als einzelne Node-Bundles
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { legalBanner } from "../sdk/bin/legal.mjs";

const root = resolve(import.meta.dirname, "../..");
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));

/** `thirdParty` nennt die gebündelten Fremdkomponenten für den Lizenzkopf */
async function bundle(entry, outfile, title, thirdParty) {
  await build({
    entryPoints: [resolve(import.meta.dirname, entry)],
    outfile: resolve(import.meta.dirname, outfile),
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
        legalBanner(title, thirdParty),
        // CommonJS-Abhängigkeiten (yaml) rufen require("process") auf; im ESM-Bundle fehlt require
        'import { createRequire as __createRequire } from "node:module";',
        "const require = __createRequire(import.meta.url);",
      ].join("\n"),
    },
    define: { __VERSION__: JSON.stringify(pkg.version) },
    logLevel: "warning",
  });
}

try {
  await bundle("src/cli.ts", "dist/server.mjs", "evcc-addons server", [
    "fflate (MIT)",
    "yaml (ISC)",
  ]);
  // Der Updater bündelt keine Fremdkomponenten (nur node:-Module und eigener Code)
  await bundle("src/updater/main.ts", "dist/updater.mjs", "evcc-addons updater", []);
} catch (err) {
  process.stderr.write(
    `Build des Proxys fehlgeschlagen: ${err instanceof Error ? err.message : err}\n`,
  );
  process.exit(1);
}
