import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { AddonError } from "../src/addons/errors.js";
import { StatusRegistry } from "../src/addons/status.js";
import { AddonStore } from "../src/addons/store.js";
import { silentLogger } from "../src/logger.js";
import { tempDir } from "./helpers.js";
import { addonZip } from "./zip-fixtures.js";

let dataDir: string;
let status: StatusRegistry;
let store: AddonStore;

beforeEach(async () => {
  dataDir = await tempDir();
  status = new StatusRegistry();
  store = new AddonStore({ dataDir, logger: silentLogger(), status });
});

describe("AddonStore", () => {
  it("installiert aktiv und listet das Addon", async () => {
    const result = await store.install(addonZip());
    expect(result).toMatchObject({ previousVersion: null, addon: { enabled: true } });
    const list = await store.list();
    expect(list.map((a) => [a.manifest.id, a.enabled])).toEqual([["hello", true]]);
    expect(await readFile(join(dataDir, "addons/hello/index.js"), "utf8")).toContain("activate");
  });

  it("behält beim Update enabled: false und liefert previousVersion", async () => {
    await store.install(addonZip());
    await store.setEnabled("hello", false);
    const result = await store.install(addonZip({ version: "0.2.0" }));
    expect(result.previousVersion).toBe("0.1.0");
    expect(result.addon.enabled).toBe(false);
    expect((await store.get("hello")).manifest.version).toBe("0.2.0");
    const entries = await readdir(join(dataDir, "addons"));
    expect(entries).toEqual(["hello"]);
  });

  it("entfernt Dateien, Zustand und Statusfehler", async () => {
    await store.install(addonZip());
    status.report("hello", { ok: false, message: "kaputt" });
    await store.remove("hello");
    expect(await store.list()).toEqual([]);
    expect(await readdir(join(dataDir, "addons"))).toEqual([]);
    const state = JSON.parse(await readFile(join(dataDir, "state.json"), "utf8")) as unknown;
    expect(state).toEqual({ addons: {} });
    expect(status.get("hello")).toBeNull();
  });

  it("lässt bei abgebrochener Installation das alte Addon intakt", async () => {
    await store.install(addonZip());
    let calls = 0;
    const failing = new AddonStore({
      dataDir,
      logger: silentLogger(),
      writeFile: (async (...args: Parameters<typeof writeFile>) => {
        if (++calls === 2) throw new Error("Platte voll");
        return writeFile(...args);
      }) as typeof writeFile,
    });
    await expect(failing.install(addonZip({ version: "0.2.0" }))).rejects.toThrow(/Platte voll/);
    expect((await store.get("hello")).manifest.version).toBe("0.1.0");
    expect(await readdir(join(dataDir, "addons"))).toEqual(["hello"]);
  });

  it("meldet unbekannte ids als not-found", async () => {
    await expect(store.get("unknown")).rejects.toMatchObject({ code: "not-found" });
    await expect(store.setEnabled("unknown", true)).rejects.toBeInstanceOf(AddonError);
    await expect(store.remove("../etc")).rejects.toMatchObject({ code: "not-found" });
  });
});
