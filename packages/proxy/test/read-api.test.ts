import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startFakeEvcc, type FakeEvcc } from "./fake-evcc.js";
import { startTestProxy, type TestProxy } from "./helpers.js";
import { addonZip } from "./zip-fixtures.js";

let evcc: FakeEvcc;
let proxy: TestProxy;

beforeEach(async () => {
  evcc = await startFakeEvcc();
  proxy = await startTestProxy(evcc.url);
  await proxy.proxy.store.install(addonZip({ description: "Beispiel" }));
});

afterEach(async () => {
  await proxy.proxy.stop();
  await evcc.stop();
});

const postStatus = (id: string, body: unknown) =>
  fetch(`${proxy.url}/addons-api/addons/${id}/status`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("GET /addons-api/addons", () => {
  it("liefert die Liste mit Fehler aus der StatusRegistry", async () => {
    proxy.proxy.status.report("hello", { ok: false, message: "Error: kaputt" });
    const res = await fetch(`${proxy.url}/addons-api/addons`);
    expect(await res.json()).toEqual([
      {
        id: "hello",
        name: { de: "Hallo Welt", en: "Hello World" },
        version: "0.1.0",
        description: "Beispiel",
        entry: "index.js",
        enabled: true,
        error: "Error: kaputt",
        settings: [],
        settingValues: {},
      },
    ]);
  });

  it("liefert Schema und aufgelöste Werte", async () => {
    const settings = [
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
    await proxy.proxy.store.install(addonZip({ settings }));
    await proxy.proxy.store.setSettings("hello", { sort: "b" });
    const res = await fetch(`${proxy.url}/addons-api/addons`);
    const [addon] = (await res.json()) as Record<string, unknown>[];
    expect(addon).toMatchObject({ settings, settingValues: { showPv: true, sort: "b" } });
  });
});

describe("POST /addons-api/addons/<id>/status", () => {
  it("setzt und löscht den Fehler", async () => {
    expect((await postStatus("hello", { ok: false, message: "TypeError: x" })).status).toBe(204);
    expect(proxy.proxy.status.get("hello")).toBe("TypeError: x");
    expect(proxy.logs.join("\n")).toContain('msg="addon failed to start" id=hello');
    expect((await postStatus("hello", { ok: true })).status).toBe(204);
    expect(proxy.proxy.status.get("hello")).toBeNull();
  });

  it("antwortet 404 für unbekannte ids und 400 für ungültige Bodys", async () => {
    expect((await postStatus("unknown", { ok: true })).status).toBe(404);
    expect((await postStatus("hello", { ok: "ja" })).status).toBe(400);
    expect((await postStatus("hello", "{kaputt")).status).toBe(400);
  });

  it("antwortet 413 bei zu großem Body", async () => {
    const res = await postStatus("hello", { ok: false, message: "x".repeat(5000) });
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: { code: "too-large" } });
  });

  it("antwortet 405 bei falscher Methode", async () => {
    const res = await fetch(`${proxy.url}/addons-api/addons/hello/status`);
    expect(res.status).toBe(405);
  });
});

describe("/addons-static/<id>/*", () => {
  it("liefert Dateien installierter Addons", async () => {
    const res = await fetch(`${proxy.url}/addons-static/hello/index.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(await res.text()).toContain("activate");
  });

  it("antwortet 404 für unbekannte Addons und Traversal", async () => {
    expect((await fetch(`${proxy.url}/addons-static/unknown/x.js`)).status).toBe(404);
    expect((await fetch(`${proxy.url}/addons-static/hello/%2e%2e/%2e%2e/state.json`)).status).toBe(
      404,
    );
  });
});
