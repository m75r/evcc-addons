// Baut die E2E-Fixture-Addons und installiert den Seed-Zustand per CLI
import { strToU8, zipSync } from "fflate";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const root = resolve(import.meta.dirname, "..");
export const configPath = resolve(root, "e2e/fixtures/proxy.config.json");
const serverPath = resolve(root, "packages/proxy/dist/server.mjs");
const buildAddon = resolve(root, "scripts/build-addon.mjs");

function run(args) {
  execFileSync(process.execPath, args, { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
}

/** Baut Fixtures nach e2e/.build (test-addon zusätzlich als 0.2.0) und hello, falls es fehlt */
export function buildFixtures() {
  const out = resolve(root, "e2e/.build");
  run([buildAddon, "e2e/fixtures/addons/test-addon", "--out", out]);
  run([buildAddon, "e2e/fixtures/addons/test-addon", "--out", out, "--version", "0.2.0"]);
  run([buildAddon, "e2e/fixtures/addons/broken-addon", "--out", out]);
  if (!existsSync(resolve(root, "dist/addons/hello-0.1.0.zip"))) run([buildAddon, "addons/hello"]);
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

export function seedZips() {
  const seed = JSON.parse(readFileSync(resolve(root, "e2e/fixtures/seed.json"), "utf8"));
  return seed.zips.map((zip) => resolve(root, zip));
}

/** Setzt e2e/.data auf den Seed-Zustand zurück */
export function resetAddons() {
  run([serverPath, "install", "--config", configPath, "--reset", ...seedZips()]);
}
