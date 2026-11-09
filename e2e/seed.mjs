// Baut die E2E-Fixtures nach e2e/.build; als Skript aufgerufen (prepare von e2eWebServers) vor dem Proxy-Start
import { strToU8, zipSync } from "fflate";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(import.meta.dirname, "..");
const cli = resolve(root, "packages/sdk/bin/evcc-addon.mjs");
const out = resolve(root, "e2e/.build");
const FIXTURES = [
  "test-addon",
  "broken-addon",
  "menu-addon",
  "server-addon",
  "broken-server-addon",
  "ext-provider",
  "ext-consumer",
];

/** Fixture bauen; LICENSE und THIRD_PARTY_NOTICES.md kommen aus der Repo-Wurzel */
function buildFixture(name, ...args) {
  const dir = resolve(root, "e2e/fixtures/addons", name);
  execFileSync(process.execPath, [cli, "build", dir, "--out", out, "--legal-dir", root, ...args], {
    cwd: root,
    stdio: ["ignore", "ignore", "inherit"],
  });
}

/**
 * Baut alle Fixtures (test-addon zusätzlich als 0.2.0) und ein Zip-Slip-Paket.
 * Server-Addons und Erweiterungs-Fixtures stehen nicht in seed.json, die Specs installieren sie selbst.
 */
export function buildFixtures() {
  for (const name of FIXTURES) buildFixture(name);
  buildFixture("test-addon", "--version", "0.2.0");
  writeZipSlipFixture(resolve(out, "zip-slip.zip"));
}

/** Gültiges Manifest plus ein Eintrag außerhalb des Addon-Ordners */
function writeZipSlipFixture(target) {
  const manifest = { id: "evil", name: "Evil", version: "0.1.0", apiVersion: 1, entry: "index.js" };
  const zip = zipSync({
    "addon.json": strToU8(JSON.stringify(manifest)),
    "index.js": strToU8("export function activate() {}"),
    "../evil.js": strToU8("alert(1)"),
  });
  writeFileSync(target, zip);
}

/** Seed-Addons (Pfade relativ zur Repo-Wurzel) */
export function seedZips() {
  return JSON.parse(readFileSync(resolve(root, "e2e/fixtures/seed.json"), "utf8")).zips;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    buildFixtures();
  } catch (err) {
    process.stderr.write(`Fixtures nicht gebaut: ${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
  }
}
