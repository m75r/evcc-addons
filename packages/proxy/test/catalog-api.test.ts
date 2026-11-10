import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FAKE_COOKIE, startFakeEvcc, type FakeEvcc } from "@evcc-addons/sdk/testing/fake-evcc";
import { CatalogSource } from "../src/catalog/source.js";
import { silentLogger } from "../src/logger.js";
import { catalogYaml, sha256 } from "./catalog-fixtures.js";
import { LISTING_PATH, startFakeCatalog, type FakeCatalog } from "./fake-catalog.js";
import { startTestProxy, type TestProxy } from "./helpers.js";
import { addonZip } from "./zip-fixtures.js";

let evcc: FakeEvcc;
let fake: FakeCatalog;
let proxy: TestProxy;

const LOGIN = { cookie: FAKE_COOKIE };

beforeEach(async () => {
  evcc = await startFakeEvcc();
  fake = await startFakeCatalog();
  proxy = await startTestProxy(evcc.url, {
    catalogUrl: fake.listingUrl,
    maxUploadBytes: 64 * 1024,
  });
});

afterEach(async () => {
  await proxy.proxy.stop();
  await fake.close();
  await evcc.stop();
});

function getCatalog(headers: Record<string, string> = LOGIN) {
  return fetch(`${proxy.url}/addons-api/catalog`, { headers });
}

async function errorCode(res: Response): Promise<string> {
  return ((await res.json()) as { error: { code: string } }).error.code;
}

describe("GET /addons-api/catalog", () => {
  it("lehnt ohne Login mit 401 ab, ohne den Katalog abzurufen", async () => {
    const res = await getCatalog({});
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe("login-required");
    expect(fake.hits(LISTING_PATH)).toBe(0);
  });

  it("liefert alle fünf Status nach id sortiert, ohne url, sha256 und homepage", async () => {
    fake.set("a-new.yaml", catalogYaml({ id: "a-new", version: "1.0.0" }));
    fake.set("b-same.yaml", catalogYaml({ id: "b-same", version: "1.0.0" }));
    fake.set("c-update.yaml", catalogYaml({ id: "c-update", version: "1.1.0" }));
    fake.set("d-newer.yaml", catalogYaml({ id: "d-newer", version: "1.0.0" }));
    fake.set("e-future.yaml", catalogYaml({ id: "e-future", apiVersion: 99 }));
    const store = proxy.proxy.store;
    await store.install(addonZip({ id: "b-same", version: "1.0.0" }));
    await store.install(addonZip({ id: "c-update", version: "1.0.0" }));
    await store.install(addonZip({ id: "d-newer", version: "2.0.0" }));
    const res = await getCatalog();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>[];
    expect(body.map((entry) => [entry.id, entry.status, entry.installedVersion])).toEqual([
      ["a-new", "available", null],
      ["b-same", "installed", "1.0.0"],
      ["c-update", "update", "1.0.0"],
      ["d-newer", "newer-installed", "2.0.0"],
      ["e-future", "incompatible", null],
    ]);
    expect(body[0]).toEqual({
      id: "a-new",
      name: { de: "Hallo Welt", en: "Hello World" },
      description: { de: "Beispiel", en: "Example" },
      version: "1.0.0",
      apiVersion: 1,
      status: "available",
      installedVersion: null,
    });
  });

  it("meldet einen Katalogfehler als 502 catalog-unavailable", async () => {
    fake.setStatus(LISTING_PATH, 404);
    const res = await getCatalog();
    expect(res.status).toBe(502);
    expect(await errorCode(res)).toBe("catalog-unavailable");
  });
});

/** Legt ZIP und YAML für `id`/`version` im Fake-Katalog ab; `fields` überschreibt die YAML */
function publish(
  id: string,
  version: string,
  zip: Uint8Array | null = addonZip({ id, version }),
  fields: Record<string, unknown> = {},
) {
  const zipName = `${id}-${version}.zip`;
  if (zip) fake.set(zipName, zip);
  const checksum = zip ? sha256(zip) : "0".repeat(64);
  fake.set(
    `${id}.yaml`,
    catalogYaml({ id, version, url: fake.fileUrl(zipName), sha256: checksum, ...fields }),
  );
  return `/files/${zipName}`;
}

function installFrom(id: string, headers: Record<string, string> = LOGIN, base = proxy.url) {
  return fetch(`${base}/addons-api/catalog/${id}/install`, { method: "POST", headers });
}

describe("POST /addons-api/catalog/<id>/install", () => {
  const SETTINGS = [{ key: "showPv", type: "boolean", label: "PV", default: true }];

  it("installiert einen verfügbaren Eintrag", async () => {
    publish("hello", "0.1.0");
    const res = await installFrom("hello");
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      previousVersion: null,
      addon: { id: "hello", version: "0.1.0", enabled: true },
    });
    const list = (await (await fetch(`${proxy.url}/addons-api/addons`)).json()) as unknown[];
    expect(list).toMatchObject([{ id: "hello" }]);
    expect(proxy.logs.join("\n")).toContain(
      'msg="addon installed" id=hello version=0.1.0 source=catalog',
    );
  });

  it("aktualisiert und behält Aktiv-Zustand und Einstellungen", async () => {
    const store = proxy.proxy.store;
    await store.install(addonZip({ settings: SETTINGS }));
    await store.setEnabled("hello", false);
    await store.setSettings("hello", { showPv: false });
    publish("hello", "0.2.0", addonZip({ version: "0.2.0", settings: SETTINGS }));
    const res = await installFrom("hello");
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      previousVersion: "0.1.0",
      addon: { version: "0.2.0", enabled: false, settingValues: { showPv: false } },
    });
    expect(proxy.logs.join("\n")).toContain(
      'msg="addon installed" id=hello version=0.2.0 previous=0.1.0 source=catalog',
    );
  });

  it("installiert dieselbe Version neu", async () => {
    await proxy.proxy.store.install(addonZip());
    publish("hello", "0.1.0");
    const res = await installFrom("hello");
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ previousVersion: "0.1.0" });
  });

  it("lehnt einen Downgrade mit 409 ab", async () => {
    await proxy.proxy.store.install(addonZip({ version: "0.2.0" }));
    const zipPath = publish("hello", "0.1.0");
    const res = await installFrom("hello");
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe("downgrade");
    expect(fake.hits(zipPath)).toBe(0);
  });

  it("lehnt einen inkompatiblen Eintrag ohne Download ab", async () => {
    const zipPath = publish("hello", "0.1.0", addonZip(), { apiVersion: 99 });
    const res = await installFrom("hello");
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe("catalog-incompatible");
    expect(fake.hits(zipPath)).toBe(0);
    expect(proxy.logs.join("\n")).toContain(
      'msg="addon install rejected" code=catalog-incompatible id=hello source=catalog',
    );
  });

  it("meldet eine unbekannte id mit 404", async () => {
    publish("hello", "0.1.0");
    const res = await installFrom("fehlt");
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe("not-found");
  });

  it("lehnt eine falsche Prüfsumme ab und installiert nichts", async () => {
    publish("hello", "0.1.0", addonZip(), { sha256: "b".repeat(64) });
    const res = await installFrom("hello");
    expect(res.status).toBe(502);
    expect(await errorCode(res)).toBe("checksum-mismatch");
    expect(await proxy.proxy.store.list()).toEqual([]);
    expect(proxy.logs.join("\n")).toContain(
      'msg="addon install rejected" code=checksum-mismatch id=hello source=catalog',
    );
  });

  it("lehnt eine ZIP mit anderer Version ab", async () => {
    publish("hello", "0.2.0", addonZip({ version: "0.3.0" }));
    const res = await installFrom("hello");
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({
      error: {
        code: "catalog-mismatch",
        message: "Paket enthält hello 0.3.0, erwartet hello 0.2.0",
      },
    });
    expect(await proxy.proxy.store.list()).toEqual([]);
  });

  it("meldet einen fehlgeschlagenen Download mit 502", async () => {
    publish("hello", "0.1.0", null);
    const res = await installFrom("hello");
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({
      error: {
        code: "download-failed",
        message: "Download von hello 0.1.0 fehlgeschlagen: HTTP 404",
      },
    });
  });

  it("meldet einen Download-Timeout mit 502", async () => {
    const zipPath = publish("hello", "0.1.0");
    fake.setDelay(zipPath, 2000);
    const catalog = new CatalogSource({
      url: fake.listingUrl,
      logger: silentLogger(),
      downloadTimeoutMs: 100,
    });
    const quick = await startTestProxy(evcc.url, {}, { catalog });
    try {
      const res = await installFrom("hello", LOGIN, quick.url);
      expect(res.status).toBe(502);
      const { error } = (await res.json()) as { error: { code: string; message: string } };
      expect(error.code).toBe("download-failed");
      expect(error.message).toMatch(/innerhalb von 0.1 s/);
    } finally {
      await quick.proxy.stop();
    }
  });

  it("lehnt eine ZIP über maxUploadBytes mit 413 ab", async () => {
    const big = addonZip({}, { "blob.bin": new Uint8Array(randomBytes(100 * 1024)) });
    publish("hello", "0.1.0", big);
    const res = await installFrom("hello");
    expect(res.status).toBe(413);
    expect(await errorCode(res)).toBe("too-large");
  });

  it("überschreibt eine unlesbare Vorinstallation", async () => {
    const dir = join(proxy.config.dataDir, "addons/hello");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "addon.json"), "{kaputt");
    publish("hello", "0.1.0");
    const res = await installFrom("hello");
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ previousVersion: null, addon: { id: "hello" } });
  });

  it("lehnt ohne Login und mit fremdem Origin ab", async () => {
    const zipPath = publish("hello", "0.1.0");
    const anonymous = await installFrom("hello", {});
    expect(anonymous.status).toBe(401);
    const origin = await installFrom("hello", { ...LOGIN, origin: "http://evil.example" });
    expect(origin.status).toBe(403);
    expect(await errorCode(origin)).toBe("origin-mismatch");
    expect(fake.hits(zipPath)).toBe(0);
  });
});
