import { strToU8 } from "fflate";
import http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FAKE_COOKIE, startFakeEvcc, type FakeEvcc } from "@evcc-addons/sdk/testing/fake-evcc";
import { startTestProxy, type TestProxy } from "./helpers.js";
import { addonZip } from "./zip-fixtures.js";

let evcc: FakeEvcc;
let proxy: TestProxy;

beforeEach(async () => {
  evcc = await startFakeEvcc();
  proxy = await startTestProxy(evcc.url, { maxUploadBytes: 1024 * 1024 });
});

afterEach(async () => {
  await proxy.proxy.stop();
  await evcc.stop();
});

const LOGIN = { cookie: FAKE_COOKIE };

function upload(zip: Uint8Array, headers: Record<string, string> = LOGIN) {
  return fetch(`${proxy.url}/addons-api/addons`, {
    method: "PUT",
    headers: { "content-type": "application/zip", ...headers },
    body: new Uint8Array(zip),
  });
}

function api(
  path: string,
  method: string,
  body?: unknown,
  headers: Record<string, string> = LOGIN,
) {
  return fetch(`${proxy.url}/addons-api/${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function errorCode(res: Response): Promise<string> {
  return ((await res.json()) as { error: { code: string } }).error.code;
}

describe("ohne Login", () => {
  it("lehnt PUT, PATCH und DELETE mit 401 ab", async () => {
    await proxy.proxy.store.install(addonZip());
    expect((await upload(addonZip(), {})).status).toBe(401);
    expect((await api("addons/hello", "PATCH", { enabled: false }, {})).status).toBe(401);
    const settings = await api("addons/hello/settings", "PATCH", { values: {} }, {});
    expect(settings.status).toBe(401);
    const res = await api("addons/hello", "DELETE", undefined, {});
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe("login-required");
  });

  it("meldet 403 admin-password-missing, wenn evcc kein Passwort hat", async () => {
    evcc.auth.mode = 501;
    const res = await upload(addonZip());
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe("admin-password-missing");
  });

  it("liefert den Sitzungsstatus", async () => {
    expect(await (await api("session", "GET", undefined, {})).json()).toEqual({
      canManage: false,
      reason: "login-required",
    });
    expect(await (await api("session", "GET")).json()).toEqual({ canManage: true, reason: null });
  });
});

describe("mit Login", () => {
  it("installiert, aktualisiert und installiert dieselbe Version neu", async () => {
    const first = await upload(addonZip());
    expect(first.status).toBe(201);
    expect(await first.json()).toMatchObject({
      previousVersion: null,
      addon: { id: "hello", enabled: true },
    });
    const update = await upload(addonZip({ version: "0.2.0" }));
    expect(await update.json()).toMatchObject({
      previousVersion: "0.1.0",
      addon: { version: "0.2.0" },
    });
    const again = await upload(addonZip({ version: "0.2.0" }));
    expect(await again.json()).toMatchObject({ previousVersion: "0.2.0" });
    expect(proxy.logs.join("\n")).toContain(
      'msg="addon installed" id=hello version=0.2.0 previous=0.1.0',
    );
  });

  it("schaltet um und deinstalliert", async () => {
    await upload(addonZip());
    const toggled = await api("addons/hello", "PATCH", { enabled: false });
    expect(await toggled.json()).toMatchObject({ id: "hello", enabled: false });
    expect((await proxy.proxy.store.get("hello")).enabled).toBe(false);
    expect((await api("addons/hello", "DELETE")).status).toBe(204);
    expect(await proxy.proxy.store.list()).toEqual([]);
    expect((await api("addons/hello", "DELETE")).status).toBe(404);
  });

  it("lehnt Zip-Slip, falschen Content-Type und fremden Origin ab", async () => {
    const slip = await upload(addonZip({}, { "../evil.js": new Uint8Array(1) }));
    expect(slip.status).toBe(400);
    expect(await errorCode(slip)).toBe("zip-slip");
    expect(proxy.logs.join("\n")).toContain(
      'msg="addon install rejected" code=zip-slip entry=../evil.js',
    );
    const type = await upload(addonZip(), { ...LOGIN, "content-type": "text/plain" });
    expect(type.status).toBe(415);
    const origin = await upload(addonZip(), { ...LOGIN, origin: "http://evil.example" });
    expect(origin.status).toBe(403);
    expect(await errorCode(origin)).toBe("origin-mismatch");
  });
});

describe("PATCH /addons-api/addons/<id>/settings", () => {
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

  beforeEach(async () => {
    await proxy.proxy.store.install(addonZip({ settings: SETTINGS }));
  });

  const save = (body: unknown, headers?: Record<string, string>) =>
    api("addons/hello/settings", "PATCH", body, headers);

  it("lehnt ohne Login mit 401 ab", async () => {
    const res = await save({ values: { showPv: false } }, {});
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe("login-required");
  });

  it("speichert mit Login und liefert die aufgelösten Werte", async () => {
    const res = await save({ values: { showPv: false } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id: "hello",
      settingValues: { showPv: false, sort: "a" },
    });
    expect((await proxy.proxy.store.get("hello")).settings).toEqual({ showPv: false, sort: "a" });
    expect(proxy.logs.join("\n")).toContain('msg="addon settings saved" id=hello keys=showPv');
  });

  it("antwortet 400 settings-invalid bei unbekanntem Schlüssel", async () => {
    const res = await save({ values: { foo: true } });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { code: "settings-invalid", message: "foo: unbekannte Einstellung" },
    });
  });

  it("antwortet 400 body-invalid ohne values", async () => {
    const res = await save({ showPv: false });
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe("body-invalid");
  });

  it("antwortet 404 bei unbekanntem Addon", async () => {
    const res = await api("addons/unknown/settings", "PATCH", { values: {} });
    expect(res.status).toBe(404);
  });

  it("antwortet 413 too-large bei einem Body über 4096 B", async () => {
    const res = await save({ values: { sort: "x".repeat(5000) } });
    expect(res.status).toBe(413);
    expect(await errorCode(res)).toBe("too-large");
  });

  it("lehnt einen fremden Origin ab", async () => {
    const res = await save({ values: {} }, { ...LOGIN, origin: "http://evil.example" });
    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe("origin-mismatch");
  });
});

describe("Server-Addons", () => {
  const SERVER = String.raw`export function activateServer(server) {
  server.route("GET", /^\/echo$/, (_req, res) => server.http.sendJson(res, 200, { echo: true }));
}`;
  const serverZip = () =>
    addonZip({ id: "srv", apiVersion: 2, server: "server.mjs" }, { "server.mjs": strToU8(SERVER) });
  const echo = (id = "srv") => fetch(`${proxy.url}/addons-api/ext/${id}/echo`);

  it("ruft den Host bei Installation, Umschalten und Einstellungen", async () => {
    const host = proxy.proxy.serverAddons;
    const sync = vi.spyOn(host, "sync");
    const settingsChanged = vi.spyOn(host, "settingsChanged");
    await upload(serverZip());
    await api("addons/srv", "PATCH", { enabled: false });
    await api("addons/srv/settings", "PATCH", { values: {} });
    expect(sync.mock.calls).toEqual([["srv"], ["srv"]]);
    expect(settingsChanged).toHaveBeenCalledWith("srv", {});
  });

  it("stoppt beim Deinstallieren vor dem Löschen", async () => {
    await upload(serverZip());
    const order: string[] = [];
    vi.spyOn(proxy.proxy.serverAddons, "stop").mockImplementation(() => {
      order.push("stop");
      return Promise.resolve();
    });
    const remove = proxy.proxy.store.remove.bind(proxy.proxy.store);
    vi.spyOn(proxy.proxy.store, "remove").mockImplementation(async (id) => {
      order.push("remove");
      await remove(id);
    });
    expect((await api("addons/srv", "DELETE")).status).toBe(204);
    expect(order).toEqual(["stop", "remove"]);
  });

  it("leitet /addons-api/ext/<id>/… weiter, 404 für unbekannte und deaktivierte", async () => {
    await upload(serverZip());
    expect(await (await echo()).json()).toEqual({ echo: true });
    const unknown = await echo("unbekannt");
    expect(unknown.status).toBe(404);
    expect(await errorCode(unknown)).toBe("not-found");
    await api("addons/srv", "PATCH", { enabled: false });
    expect((await echo()).status).toBe(404);
    await api("addons/srv", "PATCH", { enabled: true });
    expect((await echo()).status).toBe(200);
  });

  it("zeigt einen Startfehler im DTO der Installation", async () => {
    const broken = addonZip(
      { id: "srv", apiVersion: 2, server: "server.mjs" },
      { "server.mjs": strToU8("export const nichts = 1;") },
    );
    const res = await upload(broken);
    expect(await res.json()).toMatchObject({
      addon: {
        hasServer: true,
        error: "Server-Teil: server.mjs exportiert keine Funktion activateServer",
      },
    });
  });
});

describe("Upload über dem Limit", () => {
  /** Sendet `total` Bytes in Blöcken; liefert den Status, sobald die Antwort eintrifft */
  function bigUpload(total: number, chunked: boolean): Promise<{ status: number; sent: number }> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string | number> = {
        ...LOGIN,
        "content-type": "application/zip",
      };
      if (!chunked) headers["content-length"] = total;
      const req = http.request(`${proxy.url}/addons-api/addons`, { method: "PUT", headers });
      let sent = 0;
      req.on("response", (res) => {
        res.resume();
        resolve({ status: res.statusCode ?? 0, sent });
      });
      req.on("error", (err) => (sent > 0 ? undefined : reject(err)));
      const chunk = Buffer.alloc(64 * 1024);
      const pump = () => {
        while (sent < total && !req.destroyed) {
          sent += chunk.length;
          if (!req.write(chunk)) return void req.once("drain", pump);
        }
        if (!req.destroyed) req.end();
      };
      pump();
    });
  }

  it("liefert 413 bei zu großem Content-Length", async () => {
    const { status } = await bigUpload(20 * 1024 * 1024, false);
    expect(status).toBe(413);
  });

  it("liefert 413 bei chunked Upload ohne Content-Length, ohne alles zu puffern", async () => {
    const { status, sent } = await bigUpload(50 * 1024 * 1024, true);
    expect(status).toBe(413);
    expect(sent).toBeLessThan(50 * 1024 * 1024);
  });
});
