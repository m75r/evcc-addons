import { strToU8 } from "fflate";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AddonStore } from "../src/addons/store.js";
import { buildConfig } from "../src/config.js";
import { runInstall } from "../src/install-command.js";
import { createLogger, silentLogger } from "../src/logger.js";
import { parseArgs } from "../src/main.js";
import { tempDir } from "./helpers.js";
import { addonZip } from "./zip-fixtures.js";

async function setup() {
  const dir = await tempDir();
  const config = buildConfig({ dataDir: "data" }, dir);
  await mkdir(config.dataDir);
  const zips = [join(dir, "hello.zip"), join(dir, "other.zip")];
  await writeFile(zips[0], addonZip());
  await writeFile(zips[1], addonZip({ id: "other" }));
  const store = new AddonStore({ dataDir: config.dataDir, logger: silentLogger() });
  return { config, zips, store };
}

const ids = async (store: AddonStore) => (await store.list()).map((a) => a.manifest.id);

describe("parseArgs", () => {
  it("erkennt install mit --config und --reset", () => {
    expect(parseArgs(["install", "--config", "c.json", "--reset", "a.zip", "b.zip"], {})).toEqual({
      command: "install",
      configPath: "c.json",
      reset: true,
      files: ["a.zip", "b.zip"],
    });
  });

  it("nutzt EVCC_ADDONS_CONFIG und den Standardpfad", () => {
    expect(parseArgs([], { EVCC_ADDONS_CONFIG: "/x.json" }).configPath).toBe("/x.json");
    expect(parseArgs([], {}).configPath).toBe("/etc/evcc-addons/config.json");
  });

  it("lehnt unbekannte Argumente ab", () => {
    expect(() => parseArgs(["--foo"], {})).toThrow(/Unbekanntes Argument/);
  });
});

describe("install", () => {
  it("installiert mehrere ZIPs und loggt jedes Ergebnis", async () => {
    const { config, zips, store } = await setup();
    const logs: string[] = [];
    const logger = createLogger("info", { out: (l) => logs.push(l), err: (l) => logs.push(l) });
    await runInstall(config, { reset: false, files: zips }, { logger });
    expect(await ids(store)).toEqual(["hello", "other"]);
    expect(logs.filter((l) => l.includes('msg="addon installed"'))).toHaveLength(2);
  });

  it("entfernt mit --reset vorher alle Addons", async () => {
    const { config, zips, store } = await setup();
    await runInstall(config, { reset: false, files: zips }, { logger: silentLogger() });
    await runInstall(config, { reset: true, files: [zips[1]] }, { logger: silentLogger() });
    expect(await ids(store)).toEqual(["other"]);
  });

  it("bricht ab, wenn dataDir einem anderen User gehört", async () => {
    const { config, zips } = await setup();
    const run = runInstall(
      config,
      { reset: false, files: zips },
      {
        logger: silentLogger(),
        getuid: () => 4242,
      },
    );
    await expect(run).rejects.toThrow(
      /Bitte als Eigentümer von .* ausführen, z\. B\. sudo -u evcc-addons/,
    );
  });

  it("weist bei Addons mit Server-Teil auf den Neustart hin", async () => {
    const { config } = await setup();
    const zip = join(config.dataDir, "..", "srv.zip");
    const files = { "server.mjs": strToU8("export function activateServer() {}") };
    await writeFile(zip, addonZip({ id: "srv", apiVersion: 2, server: "server.mjs" }, files));
    const logs: string[] = [];
    const logger = createLogger("info", { out: (l) => logs.push(l), err: (l) => logs.push(l) });
    await runInstall(config, { reset: false, files: [zip] }, { logger });
    expect(logs).toContain(
      'level=info msg="server addon installed" id=srv hint="läuft nach dem nächsten Aufruf oder systemctl restart evcc-addons"',
    );
  });

  it("nennt den Neustart nicht bei Addons ohne Server-Teil", async () => {
    const { config, zips } = await setup();
    const logs: string[] = [];
    const logger = createLogger("info", { out: (l) => logs.push(l), err: (l) => logs.push(l) });
    await runInstall(config, { reset: false, files: zips }, { logger });
    expect(logs.join("\n")).not.toContain("server addon installed");
  });

  it("meldet ungültige Pakete mit Dateinamen", async () => {
    const { config } = await setup();
    const bad = join(config.dataDir, "..", "bad.zip");
    await writeFile(bad, "keine zip");
    await expect(
      runInstall(config, { reset: false, files: [bad] }, { logger: silentLogger() }),
    ).rejects.toThrow(/bad\.zip: ZIP-Datei ist beschädigt/);
  });
});
