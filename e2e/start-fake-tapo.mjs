// Startet die simulierte Tapo-Steckdose (packages/proxy/test/fake-tapo.ts) für die E2E-Tests
import { build } from "esbuild";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const outfile = resolve(root, "e2e/.build/fake-tapo.mjs");
export const FAKE_TAPO_PORT = 17090;

const entry = `
import { startFakeTapo } from "./packages/proxy/test/fake-tapo.ts";
const tapo = await startFakeTapo({ on: false, power: 12 }, ${FAKE_TAPO_PORT});
process.stdout.write("fake tapo listening on " + tapo.url + "\\n");
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => void tapo.stop().then(() => process.exit(0)));
`;

try {
  await build({
    stdin: { contents: entry, resolveDir: root, loader: "ts", sourcefile: "fake-tapo-entry.ts" },
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    outfile,
    logLevel: "warning",
  });
  await import(pathToFileURL(outfile).href);
} catch (err) {
  process.stderr.write(`Fake-Tapo nicht gestartet: ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
}
