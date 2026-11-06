// Startet den gebauten Proxy für die E2E-Tests mit frisch geseedetem Datenverzeichnis
import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { buildFixtures, configPath, resetAddons, root } from "./seed.mjs";

const dataDir = resolve(root, "e2e/.data");

try {
  await rm(dataDir, { recursive: true, force: true });
  await mkdir(dataDir, { recursive: true });
  buildFixtures();
  resetAddons();
} catch (err) {
  process.stderr.write(
    `E2E-Vorbereitung fehlgeschlagen: ${err instanceof Error ? err.message : err}\n`,
  );
  process.exit(1);
}

const child = spawn(
  process.execPath,
  [resolve(root, "packages/proxy/dist/server.mjs"), "--config", configPath],
  { stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
