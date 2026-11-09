import { strToU8 } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ServerAddonHost } from "../src/addons/server-host.js";
import { AddonStore } from "../src/addons/store.js";
import { silentLogger } from "../src/logger.js";
import { startFakeEvcc, type FakeEvcc } from "@evcc-addons/sdk/testing/fake-evcc";
import { startTestProxy, type TestProxy } from "./helpers.js";
import { addonZip } from "./zip-fixtures.js";

const scope = globalThis as { __hostEvents?: string[] };

/** server.mjs, das Start, Stopp und Einstellungen in globalThis.__hostEvents meldet */
function serverModule(tag: string): string {
  return String.raw`
const events = (globalThis.__hostEvents ??= []);
export function activateServer(server) {
  events.push("start:" + server.id + ":${tag}");
  server.route("GET", /^\/$/, (_req, res) => server.http.sendJson(res, 200, { root: true }));
  server.route("GET", /^\/echo$/, (_req, res) => server.http.sendJson(res, 200, { tag: "${tag}" }));
  server.route("GET", /^\/item\/([^/]+)$/, (_req, res, [item]) => server.http.sendJson(res, 200, { item }));
  server.route("GET", /^\/boom$/, () => { throw new Error("boom"); });
  server.route("GET", /^\/conflict$/, () => { throw server.httpError(409, "x", "Konflikt"); });
  server.settings.onChange((values) => events.push("settings:" + JSON.stringify(values)));
  return { stop() { events.push("stop:" + server.id + ":${tag}"); } };
}`;
}

const BROKEN = `export function activateServer() { throw new Error("kaputt"); }`;

function serverZip(code: string, overrides: Record<string, unknown> = {}): Uint8Array {
  return addonZip(
    { id: "srv", apiVersion: 2, server: "server.mjs", ...overrides },
    { "server.mjs": strToU8(code) },
  );
}

const SETTINGS = [
  {
    key: "greeting",
    type: "select",
    label: "Gruß",
    default: "hallo",
    options: [
      { value: "hallo", label: "Hallo" },
      { value: "servus", label: "Servus" },
    ],
  },
];

let evcc: FakeEvcc;
let proxy: TestProxy;

beforeEach(async () => {
  scope.__hostEvents = [];
  evcc = await startFakeEvcc();
  proxy = await startTestProxy(evcc.url);
});

afterEach(async () => {
  await proxy.proxy.stop();
  await evcc.stop();
});

const events = () => scope.__hostEvents ?? [];
const host = () => proxy.proxy.serverAddons;
const store = () => proxy.proxy.store;
const ext = (path: string) => fetch(`${proxy.url}/addons-api/ext/${path}`);

/** Zweiter Host auf demselben Store, wie nach einem Neustart des Proxys */
function freshHost(): ServerAddonHost {
  return new ServerAddonHost({
    store: store(),
    status: proxy.proxy.status,
    logger: silentLogger(),
    dataDir: proxy.config.dataDir,
    evccUrl: evcc.url,
  });
}

/** Zweiter Store auf demselben dataDir, wie das CLI `server.mjs install` */
function cliStore(): AddonStore {
  return new AddonStore({ dataDir: proxy.config.dataDir, logger: silentLogger() });
}

describe("ServerAddonHost: Lebenszyklus", () => {
  it("startet beim Start nur aktive Server-Addons", async () => {
    await store().install(serverZip(serverModule("a")));
    await store().install(serverZip(serverModule("b"), { id: "off" }));
    await store().setEnabled("off", false);
    const started = freshHost();
    await started.startAll();
    expect(events()).toEqual(["start:srv:a"]);
    await started.stopAll();
    expect(events()).toEqual(["start:srv:a", "stop:srv:a"]);
  });

  it("lädt nach einem Update mit sync die neue Version", async () => {
    await store().install(serverZip(serverModule("v1")));
    await host().sync("srv");
    expect(await (await ext("srv/echo")).json()).toEqual({ tag: "v1" });
    await store().install(serverZip(serverModule("v2"), { version: "0.2.0" }));
    await host().sync("srv");
    expect(await (await ext("srv/echo")).json()).toEqual({ tag: "v2" });
    expect(events()).toEqual(["start:srv:v1", "stop:srv:v1", "start:srv:v2"]);
  });

  it("stoppt beim Deaktivieren, antwortet danach 404 und löscht den Server-Fehler", async () => {
    await store().install(serverZip(serverModule("a")));
    await store().install(serverZip(BROKEN, { id: "kaputt" }));
    await host().startAll();
    expect(proxy.proxy.status.get("kaputt")).toBe("Server-Teil: kaputt");
    for (const id of ["srv", "kaputt"]) {
      await store().setEnabled(id, false);
      await host().sync(id);
    }
    expect(events()).toEqual(["start:srv:a", "stop:srv:a"]);
    expect((await ext("srv/echo")).status).toBe(404);
    expect(proxy.proxy.status.get("kaputt")).toBeNull();
  });

  it("erkennt eine Installation und Deinstallation per CLI beim Abgleich", async () => {
    await store().install(serverZip(serverModule("alt")));
    await host().sync("srv");
    await cliStore().install(serverZip(serverModule("neu")));
    expect(await (await ext("srv/echo")).json()).toEqual({ tag: "neu" });
    await cliStore().remove("srv");
    await host().reconcile();
    expect(events()).toEqual(["start:srv:alt", "stop:srv:alt", "start:srv:neu", "stop:srv:neu"]);
    expect((await ext("srv/echo")).status).toBe(404);
  });

  it("meldet einen Fehler in activateServer nur für dieses Addon", async () => {
    await store().install(serverZip(BROKEN, { id: "kaputt" }));
    await store().install(serverZip(serverModule("a")));
    await host().startAll();
    const status = proxy.proxy.status;
    expect(status.get("kaputt")).toBe("Server-Teil: kaputt");
    expect((await ext("kaputt/echo")).status).toBe(404);
    expect((await ext("srv/echo")).status).toBe(200);
    status.report("kaputt", { ok: true });
    expect(status.get("kaputt")).toBe("Server-Teil: kaputt");
    expect(proxy.logs.join("\n")).toContain(
      'msg="server addon failed" addon=kaputt phase=activate error=kaputt',
    );
  });

  it("gibt gespeicherte Einstellungen an onChange weiter", async () => {
    await store().install(serverZip(serverModule("a"), { settings: SETTINGS }));
    await host().sync("srv");
    host().settingsChanged("srv", { greeting: "servus" });
    expect(events()).toEqual(["start:srv:a", 'settings:{"greeting":"servus"}']);
  });

  it("stoppt mit stopAll alle laufenden Server-Teile", async () => {
    await store().install(serverZip(serverModule("a")));
    await store().install(serverZip(serverModule("b"), { id: "zwei" }));
    await host().startAll();
    await host().stopAll();
    expect(
      events()
        .filter((event) => event.startsWith("stop:"))
        .sort(),
    ).toEqual(["stop:srv:a", "stop:zwei:b"]);
  });
});

describe("ServerAddonHost: Anfragen", () => {
  beforeEach(async () => {
    await store().install(serverZip(serverModule("a")));
    await host().sync("srv");
  });

  it("erreicht ohne Sub-Pfad die Route /", async () => {
    expect(await (await ext("srv")).json()).toEqual({ root: true });
    expect(await (await ext("srv/")).json()).toEqual({ root: true });
  });

  it("dekodiert die Gruppen des Patterns", async () => {
    expect(await (await ext("srv/item/a%20b")).json()).toEqual({ item: "a b" });
  });

  it("antwortet 500, wenn ein Handler wirft, und läuft weiter", async () => {
    const res = await ext("srv/boom");
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: { code: "internal" } });
    expect((await ext("srv/echo")).status).toBe(200);
    expect(proxy.logs.join("\n")).toContain(
      'msg="server addon request failed" addon=srv path=/addons-api/ext/srv/*** error=boom',
    );
  });

  it("bildet httpError auf Status und Code ab", async () => {
    const res = await ext("srv/conflict");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: "x", message: "Konflikt" } });
  });

  it("antwortet 404 bei unbekanntem Pfad und 405 bei falscher Methode", async () => {
    expect((await ext("srv/unbekannt")).status).toBe(404);
    const res = await fetch(`${proxy.url}/addons-api/ext/srv/echo`, { method: "POST" });
    expect(res.status).toBe(405);
  });
});
