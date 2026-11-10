// Einstieg für den Playwright-Webserver „Proxy“ (siehe e2eWebServers): optional vorbereiten, dann starten.
// Umgebung: EVCC_ADDONS_TEST_ROOT, EVCC_ADDONS_TEST_ZIPS (JSON-Liste), EVCC_ADDONS_TEST_PREPARE (Node-Skript),
// EVCC_ADDONS_TEST_CATALOG_URL (optional, catalogUrl des Proxys),
// EVCC_ADDONS_TEST_RELEASE_URL (optional, releaseUrl des Proxys)
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { startTestProxy } from "./server.js";

function prepare(root: string, script: string | undefined): void {
  if (!script) return;
  execFileSync(process.execPath, [resolve(root, script)], { cwd: root, stdio: "inherit" });
}

try {
  const root = process.env.EVCC_ADDONS_TEST_ROOT ?? process.cwd();
  const zips = JSON.parse(process.env.EVCC_ADDONS_TEST_ZIPS ?? "[]") as string[];
  prepare(root, process.env.EVCC_ADDONS_TEST_PREPARE);
  const catalogUrl = process.env.EVCC_ADDONS_TEST_CATALOG_URL;
  const releaseUrl = process.env.EVCC_ADDONS_TEST_RELEASE_URL;
  const child = startTestProxy({ root, zips, catalogUrl, releaseUrl });
  child.on("exit", (code) => process.exit(code ?? 0));
} catch (err) {
  process.stderr.write(
    `E2E-Vorbereitung fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
}
