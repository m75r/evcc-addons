// Startet zwei simulierte Tapo-Steckdosen (addons/switches-tapo/test/server/fake-tapo.ts) für die E2E-Tests:
// 17090 „Lampe“ (Ladepunkt-Bindung), 17091 „kaffee“ (Verbraucher-Bindung)
import { build } from "esbuild";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const outfile = resolve(root, "e2e/.build/fake-tapo.mjs");
export const FAKE_TAPO_PORT = 17090;
export const FAKE_TAPO_CONSUMER_PORT = 17091;

const entry = `
import { startFakeTapo } from "./addons/switches-tapo/test/server/fake-tapo.ts";
const tapos = [
  await startFakeTapo({ on: false, power: 12 }, ${FAKE_TAPO_PORT}),
  await startFakeTapo({ on: false, power: 1150 }, ${FAKE_TAPO_CONSUMER_PORT}),
];
for (const tapo of tapos) process.stdout.write("fake tapo listening on " + tapo.url + "\\n");
const stop = () => Promise.all(tapos.map((tapo) => tapo.stop())).then(() => process.exit(0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => void stop());
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
