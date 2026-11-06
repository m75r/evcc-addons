import http from "node:http";
import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loaderTag } from "../src/proxy/inject.js";
import { VERSION } from "../src/version.js";
import { INDEX_HTML, STATE, startFakeEvcc, type FakeEvcc } from "./fake-evcc.js";
import { startTestProxy, type TestProxy } from "./helpers.js";
import { rawRequest } from "./raw-http.js";

let evcc: FakeEvcc;
let proxy: TestProxy;

beforeEach(async () => {
  evcc = await startFakeEvcc();
  proxy = await startTestProxy(evcc.url);
});

afterEach(async () => {
  await proxy.proxy.stop();
  await evcc.stop();
});

describe("Index-Route", () => {
  it("liefert unkomprimiertes HTML mit Loader-Tag, auch wenn gzip angefragt wird", async () => {
    const res = await rawRequest(`${proxy.url}/`, { headers: { "accept-encoding": "gzip" } });
    const html = res.body.toString();
    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBeUndefined();
    expect(res.headers.etag).toBeUndefined();
    expect(html).toContain(`${loaderTag(VERSION)}</head>`);
    expect(Number(res.headers["content-length"])).toBe(res.body.length);
  });

  it("reicht HEAD / ohne Injektion und ohne Warnung durch", async () => {
    const res = await rawRequest(`${proxy.url}/`, { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(Number(res.headers["content-length"])).toBe(Buffer.byteLength(INDEX_HTML));
    expect(proxy.logs.join("\n")).not.toContain("loader not injected");
  });
});

describe("Weiterleitung", () => {
  it("reicht gzip-Antworten anderer Pfade unverändert durch", async () => {
    const res = await rawRequest(`${proxy.url}/api/state`, {
      headers: { "accept-encoding": "gzip" },
    });
    expect(res.headers["content-encoding"]).toBe("gzip");
    expect(JSON.parse(gunzipSync(res.body).toString())).toEqual(STATE);
  });

  it("reicht Body und Header durch", async () => {
    const res = await fetch(`${proxy.url}/echo`, {
      method: "POST",
      headers: { "x-test": "hallo", cookie: "auth=abc" },
      body: "payload",
    });
    const echo = (await res.json()) as { body: string; headers: Record<string, string> };
    expect(echo.body).toBe("payload");
    expect(echo.headers["x-test"]).toBe("hallo");
    expect(echo.headers.cookie).toBe("auth=abc");
    expect(echo.headers.host).toBe(`127.0.0.1:${evcc.port}`);
  });

  it.each(["/slow", "/"])(
    "überlebt einen Client-Abbruch, bevor evcc auf %s antwortet",
    async (path) => {
      const req = http.request(`${proxy.url}${path === "/" ? "/" : path}`);
      req.on("error", () => undefined);
      req.end();
      await new Promise((resolve) => setTimeout(resolve, 20));
      req.destroy();
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect((await fetch(`${proxy.url}/api/state`)).status).toBe(200);
      expect(proxy.logs.join("\n")).not.toContain("level=error");
    },
  );

  it("antwortet 502, wenn evcc nicht erreichbar ist", async () => {
    await evcc.stop();
    const res = await fetch(`${proxy.url}/api/state`);
    expect(res.status).toBe(502);
    expect(await res.text()).toContain("evcc nicht erreichbar");
    expect(proxy.logs.join("\n")).toContain('msg="evcc unreachable"');
  });
});

describe("eigene Routen", () => {
  it("liefert den Health-Status", async () => {
    const res = await fetch(`${proxy.url}/addons-api/health`);
    expect(await res.json()).toEqual({ status: "ok", version: VERSION });
  });

  it("antwortet 404 für unbekannte API-Pfade", async () => {
    const res = await fetch(`${proxy.url}/addons-api/gibtsnicht`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "not-found", message: "Unbekannter Pfad /addons-api/gibtsnicht" },
    });
  });
});

describe("Startseite ohne Marker", () => {
  it("bleibt unverändert und loggt eine Warnung", async () => {
    await proxy.proxy.stop();
    await evcc.stop();
    evcc = await startFakeEvcc({ indexHtml: "<p>kaputt</p>" });
    proxy = await startTestProxy(evcc.url);
    const res = await fetch(`${proxy.url}/`);
    expect(await res.text()).toBe("<p>kaputt</p>");
    expect(proxy.logs.join("\n")).toContain('msg="loader not injected"');
  });
});
