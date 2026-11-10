// Prüft den Katalog im Repo (addons/*.yaml) mit dem Parser des Proxys
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCatalogFile } from "../src/catalog/entry.js";

const CATALOG_DIR = resolve(import.meta.dirname, "../../../addons");

async function catalogFiles(): Promise<string[]> {
  return (await readdir(CATALOG_DIR)).filter((name) => name.endsWith(".yaml"));
}

describe("Katalog addons/", () => {
  it("enthält mindestens drei Einträge und nur .yaml-Dateien", async () => {
    expect((await catalogFiles()).length).toBeGreaterThanOrEqual(3);
    expect(await readdir(CATALOG_DIR)).toEqual(await catalogFiles());
  });

  it("jeder Eintrag ist gültig und nutzt https", async () => {
    for (const name of await catalogFiles()) {
      const entry = parseCatalogFile(await readFile(join(CATALOG_DIR, name), "utf8"), name);
      expect(entry.url, name).toMatch(/^https:\/\//);
      expect(entry.homepage, name).toMatch(/^https:\/\//);
    }
  });
});
