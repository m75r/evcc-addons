import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AddonError } from "../src/addons/errors.js";
import { CatalogSource } from "../src/catalog/source.js";
import { createLogger } from "../src/logger.js";
import { catalogYaml } from "./catalog-fixtures.js";
import { LISTING_PATH, startFakeCatalog, type FakeCatalog } from "./fake-catalog.js";

let fake: FakeCatalog;
let logs: string[];
let clock: number;

function source(): CatalogSource {
  const logger = createLogger("debug", { out: (l) => logs.push(l), err: (l) => logs.push(l) });
  return new CatalogSource({ url: fake.listingUrl, logger, now: () => clock });
}

async function failure(promise: Promise<unknown>): Promise<AddonError> {
  const error = await promise.catch((err: unknown) => err);
  if (!(error instanceof AddonError)) throw new Error(`kein AddonError: ${String(error)}`);
  return error;
}

beforeEach(async () => {
  logs = [];
  clock = 1_000_000;
  fake = await startFakeCatalog({
    "zeta.yaml": catalogYaml({ id: "zeta" }),
    "alpha.yaml": catalogYaml({ id: "alpha" }),
    "README.md": "# kein Eintrag",
  });
});

afterEach(() => fake.close());

describe("CatalogSource", () => {
  it("liefert die Einträge nach id sortiert und ignoriert andere Dateien", async () => {
    const entries = await source().entries();
    expect(entries.map((entry) => entry.id)).toEqual(["alpha", "zeta"]);
    expect(fake.hits("/files/README.md")).toBe(0);
    expect(logs.join("\n")).toMatch(/level=debug msg="catalog fetched" entries=2 skipped=0 ms=\d+/);
  });

  it("überspringt eine kaputte Datei mit warn-Log", async () => {
    fake.set("broken.yaml", catalogYaml({ id: "broken", sha256: "kurz" }));
    const entries = await source().entries();
    expect(entries.map((entry) => entry.id)).toEqual(["alpha", "zeta"]);
    expect(logs.join("\n")).toContain(
      'level=warn msg="catalog entry skipped" file=broken.yaml error="Ungültiger Katalogeintrag broken.yaml: sha256 muss 64 Hex-Zeichen haben"',
    );
    expect(logs.join("\n")).toContain("entries=2 skipped=1");
  });

  it("überspringt eine nicht ladbare Datei", async () => {
    fake.setStatus("/files/zeta.yaml", 500);
    expect((await source().entries()).map((entry) => entry.id)).toEqual(["alpha"]);
    expect(logs.join("\n")).toContain('file=zeta.yaml error="HTTP 500"');
  });

  it("nutzt den Cache innerhalb der TTL und fragt danach erneut", async () => {
    const catalog = source();
    await catalog.entries();
    clock += 9 * 60_000;
    await catalog.entries();
    expect(fake.hits(LISTING_PATH)).toBe(1);
    clock += 2 * 60_000;
    await catalog.entries();
    expect(fake.hits(LISTING_PATH)).toBe(2);
  });

  it("teilt sich einen laufenden Abruf", async () => {
    fake.setDelay(LISTING_PATH, 50);
    const catalog = source();
    const [a, b] = await Promise.all([catalog.entries(), catalog.entries()]);
    expect(a).toBe(b);
    expect(fake.hits(LISTING_PATH)).toBe(1);
  });

  it("meldet 404 als catalog-unavailable und speichert den Fehler nicht", async () => {
    fake.setStatus(LISTING_PATH, 404);
    const catalog = source();
    const error = await failure(catalog.entries());
    expect(error.code).toBe("catalog-unavailable");
    expect(error.message).toBe("Katalog nicht abrufbar: HTTP 404");
    expect(logs.join("\n")).toContain('level=warn msg="catalog unavailable"');
    await failure(catalog.entries());
    expect(fake.hits(LISTING_PATH)).toBe(2);
  });

  it("nennt das Abruflimit von GitHub", async () => {
    fake.setStatus(LISTING_PATH, 403, { "x-ratelimit-remaining": "0" });
    const error = await failure(source().entries());
    expect(error.message).toBe("Katalog nicht abrufbar: HTTP 403 (Abruflimit von GitHub erreicht)");
  });

  it("lehnt ein zu großes Listing ab", async () => {
    for (let i = 0; i < 12_000; i++) fake.set(`addon-${i}-mit-langem-namen.txt`, "");
    const error = await failure(source().entries());
    expect(error.code).toBe("catalog-unavailable");
    expect(error.message).toMatch(/größer als 1048576 Bytes/);
  });

  it("find liefert einen Eintrag oder not-found", async () => {
    const catalog = source();
    expect((await catalog.find("alpha")).id).toBe("alpha");
    const error = await failure(catalog.find("fehlt"));
    expect(error.code).toBe("not-found");
    expect(error.message).toBe("Addon fehlt ist nicht im Katalog");
  });
});
