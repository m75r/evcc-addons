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
    await expect(store.setSettings("unknown", {})).rejects.toMatchObject({ code: "not-found" });
    await expect(store.remove("../etc")).rejects.toMatchObject({ code: "not-found" });
  });
});

const SETTINGS = [
  { key: "showPv", type: "boolean", label: "PV", default: true },
  {
    key: "sort",
    type: "select",
    label: "Sortierung",
    default: "a",
    options: [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ],
  },
];

async function storedEntry(id = "hello"): Promise<unknown> {
  const state = JSON.parse(await readFile(join(dataDir, "state.json"), "utf8")) as {
    addons: Record<string, unknown>;
  };
  return state.addons[id];
}

describe("AddonStore: Einstellungen", () => {
  it("liefert beim Installieren die aufgelösten Einstellungen", async () => {
    const result = await store.install(addonZip({ settings: SETTINGS }));
    expect(result.addon.settings).toEqual({ showPv: true, sort: "a" });
  });

  it("schreibt nur gesetzte Schlüssel in state.json, keine Defaults", async () => {
    await store.install(addonZip({ settings: SETTINGS }));
    const saved = await store.setSettings("hello", { sort: "b" });
    expect(saved.settings).toEqual({ showPv: true, sort: "b" });
    expect(await storedEntry()).toEqual({ enabled: true, settings: { sort: "b" } });
    await store.setSettings("hello", { showPv: false });
    expect(await storedEntry()).toEqual({ enabled: true, settings: { sort: "b", showPv: false } });
  });

  it("lehnt ungültige Werte mit settings-invalid ab", async () => {
    await store.install(addonZip({ settings: SETTINGS }));
    await expect(store.setSettings("hello", { sort: "foo" })).rejects.toMatchObject({
      code: "settings-invalid",
      message: 'sort: unbekannte Option "foo"',
    });
  });

  it("gibt nicht gesetzten Schlüsseln nach einem Update den neuen Default", async () => {
    await store.install(addonZip({ settings: SETTINGS }));
    await store.setSettings("hello", { sort: "b" });
    const changed = [{ ...SETTINGS[0], default: false }, SETTINGS[1]];
    await store.install(addonZip({ version: "0.2.0", settings: changed }));
    expect((await store.get("hello")).settings).toEqual({ showPv: false, sort: "b" });
  });

  it("behält die Einstellungen beim Umschalten", async () => {
    await store.install(addonZip({ settings: SETTINGS }));
    await store.setSettings("hello", { showPv: false });
    const toggled = await store.setEnabled("hello", false);
    expect(toggled.settings).toEqual({ showPv: false, sort: "a" });
    expect(await storedEntry()).toEqual({ enabled: false, settings: { showPv: false } });
  });

  it("behält sie beim Update und verwirft beim Lesen unbekannte Schlüssel", async () => {
    await store.install(addonZip({ settings: SETTINGS }));
    await store.setSettings("hello", { showPv: false, sort: "b" });
    const result = await store.install(addonZip({ version: "0.2.0", settings: [SETTINGS[0]] }));
    expect(result.addon.settings).toEqual({ showPv: false });
    expect((await store.get("hello")).settings).toEqual({ showPv: false });
  });

  it("löscht sie beim Deinstallieren", async () => {
    await store.install(addonZip({ settings: SETTINGS }));
    await store.setSettings("hello", { showPv: false });
    await store.remove("hello");
    expect(await storedEntry()).toBeUndefined();
    await store.install(addonZip({ settings: SETTINGS }));
    expect((await store.get("hello")).settings).toEqual({ showPv: true, sort: "a" });
  });

  it("verliert bei parallelen Aufrufen keinen Wert", async () => {
    await store.install(addonZip({ settings: SETTINGS }));
    await Promise.all([
      store.setSettings("hello", { showPv: false }),
      store.setEnabled("hello", false),
      store.setSettings("hello", { sort: "b" }),
    ]);
    expect(await storedEntry()).toEqual({
      enabled: false,
      settings: { showPv: false, sort: "b" },
    });
  });
});
