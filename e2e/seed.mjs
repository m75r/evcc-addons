// Baut die E2E-Fixtures nach e2e/.build; als Skript aufgerufen (prepare von e2eWebServers) vor dem Proxy-Start
import { strToU8, zipSync } from "fflate";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(import.meta.dirname, "..");
const cli = resolve(root, "packages/sdk/bin/evcc-addon.mjs");
const out = resolve(root, "e2e/.build");
const catalogDir = resolve(out, "catalog");
/** Basis-URL von e2e/fake-catalog.mjs */
const CATALOG_BASE = "http://127.0.0.1:17095";
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
  writeCatalogFixture();
}

/**
 * Katalog für e2e/fake-catalog.mjs unter e2e/.build/catalog: Listing, YAMLs und ZIPs.
 * Gegenüber dem Seed: test-addon Update, menu-addon gleiche Version, server-addon neu, future-addon inkompatibel.
 */
function writeCatalogFixture() {
  rmSync(catalogDir, { recursive: true, force: true });
  mkdirSync(catalogDir, { recursive: true });
  const files = [
    catalogEntry("test-addon", "0.2.0"),
    catalogEntry("menu-addon", "0.1.0"),
    catalogEntry("server-addon", "0.1.0"),
    futureEntry(),
  ];
  const listing = files.map((name) => ({
    name,
    type: "file",
    download_url: `${CATALOG_BASE}/files/${name}`,
  }));
  writeFileSync(resolve(catalogDir, "listing.json"), JSON.stringify(listing, null, 2) + "\n");
}

/** Kopiert die gebaute ZIP und schreibt die YAML mit sha256; Name und apiVersion aus addon.json */
function catalogEntry(id, version) {
  const manifest = JSON.parse(
    readFileSync(resolve(root, "e2e/fixtures/addons", id, "addon.json"), "utf8"),
  );
  const zipName = `${id}-${version}.zip`;
  const zip = readFileSync(resolve(out, zipName));
  writeFileSync(resolve(catalogDir, zipName), zip);
  return writeYaml(id, {
    name: manifest.name,
    description: manifest.description,
    version,
    apiVersion: manifest.apiVersion,
    url: `${CATALOG_BASE}/files/${zipName}`,
    sha256: createHash("sha256").update(zip).digest("hex"),
  });
}

/** Eintrag für eine künftige Plattform, ohne ZIP */
function futureEntry() {
  return writeYaml("future-addon", {
    name: "Zukunfts-Addon",
    description: "Braucht eine neuere Plattform",
    version: "1.0.0",
    apiVersion: 99,
    url: `${CATALOG_BASE}/files/future-addon-{version}.zip`,
    sha256: "0".repeat(64),
  });
}

/** YAML mit JSON-Werten (gültiges YAML), `homepage` für alle gleich */
function writeYaml(id, fields) {
  const all = { id, homepage: "https://example.com/" + id, ...fields };
  const text = Object.entries(all)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join("\n");
  const name = `${id}.yaml`;
  writeFileSync(resolve(catalogDir, name), text + "\n");
  return name;
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
