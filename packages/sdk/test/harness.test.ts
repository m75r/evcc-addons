import { readdir } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestServerApi, type TestServerApi } from "../src/testing/harness.js";

let harness: TestServerApi;

afterEach(() => harness.close());

async function setup(admin = true) {
  harness = await createTestServerApi({ id: "demo", admin, settings: { greeting: "hallo" } });
  const { api } = harness;
  api.route("GET", /^\/$/, (_req, res) => api.http.sendJson(res, 200, { root: true }));
  api.route("GET", /^\/items\/([^/]+)$/, (_req, res, [item]) =>
    api.http.sendJson(res, 200, { item }),
  );
  api.route("POST", /^\/echo$/, async (req, res) => {
    api.http.sendJson(res, 200, await api.http.readJson(req, 100));
  });
  api.route("GET", /^\/admin$/, async (req, res) => {
    await api.auth.require(req);
    api.http.sendJson(res, 200, { admin: true });
  });
  api.route("GET", /^\/conflict$/, () => {
    throw api.httpError(409, "x", "Konflikt");
  });
  return api;
}

describe("createTestServerApi", () => {
  it("leitet Anfragen an die Routen weiter und dekodiert Gruppen", async () => {
    await setup();
    expect(await harness.request("GET", "/")).toMatchObject({ status: 200, body: { root: true } });
    expect((await harness.request("GET", "/items/a%20b?x=1")).body).toEqual({ item: "a b" });
    expect((await harness.request("POST", "/echo", { a: 1 })).body).toEqual({ a: 1 });
  });

  it("antwortet 404 bei unbekanntem Pfad und 405 bei falscher Methode", async () => {
    await setup();
    expect((await harness.request("GET", "/nix")).status).toBe(404);
    expect((await harness.request("DELETE", "/")).status).toBe(405);
  });

  it("antwortet ohne Admin mit 401 auf auth.require", async () => {
    await setup(false);
    const res = await harness.request("GET", "/admin");
    expect(res).toMatchObject({ status: 401, body: { error: { code: "login-required" } } });
    harness.setAdmin(true);
    expect((await harness.request("GET", "/admin")).status).toBe(200);
  });

  it("bildet httpError auf Status und Code ab, zu große Bodys auf 413", async () => {
    await setup();
    expect(await harness.request("GET", "/conflict")).toMatchObject({
      status: 409,
      body: { error: { code: "x", message: "Konflikt" } },
    });
    const big = await harness.request("POST", "/echo", { text: "x".repeat(200) });
    expect(big).toMatchObject({ status: 413, body: { error: { code: "too-large" } } });
  });

  it("ruft onChange bei setSettings auf", async () => {
    const api = await setup();
    const cb = vi.fn();
    api.settings.onChange(cb);
    expect(api.settings.get("greeting")).toBe("hallo");
    harness.setSettings({ greeting: "servus" });
    expect(cb).toHaveBeenCalledWith({ greeting: "servus" });
    expect(api.settings.all()).toEqual({ greeting: "servus" });
  });

  it("legt einen leeren Datenordner an und loggt mit addon=<id>", async () => {
    const api = await setup();
    expect(await readdir(harness.dataDir)).toEqual([]);
    api.logger.info("hallo", { x: "a b" });
    expect(harness.logs).toEqual(['level=info msg=hallo addon=demo x="a b"']);
  });
});
