import type { TestServerApi } from "@evcc-addons/sdk/testing/harness";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startFakeEvcc, type FakeEvcc } from "@evcc-addons/sdk/testing/fake-evcc";
import { startFakeTapo, TAPO_PASSWORD, TAPO_USER, type FakeTapo } from "./fake-tapo.js";
import { startGateway, type TestGateway } from "./gateway.js";

let evcc: FakeEvcc;
let tapo: FakeTapo;
let gw: TestGateway;
let harness: TestServerApi;
let lamp: { id: string; token: string };

beforeEach(async () => {
  evcc = await startFakeEvcc();
  evcc.loadpoints.titles = ["Carport", "Lampe"];
  tapo = await startFakeTapo({ on: false, power: 12 });
  gw = await startGateway(evcc.url);
  harness = gw.harness;
  const created = await harness.request("POST", "/", {
    name: "Lampe",
    type: "tapo",
    host: tapo.host,
    user: TAPO_USER,
    password: TAPO_PASSWORD,
    target: { kind: "loadpoint", title: "Lampe" },
  });
  lamp = created.body as { id: string; token: string };
});

afterEach(async () => {
  await gw.stop();
  await tapo.stop();
  await evcc.stop();
});

async function gateway(action: string, token = lamp.token, id = lamp.id) {
  const method = action.startsWith("set") ? "POST" : "GET";
  const res = await harness.request(method, `/${id}/${token}/${action}`);
  return { status: res.status, json: () => Promise.resolve(res.body) };
}

describe("Gateway für evcc", () => {
  it("liefert Zustand und Leistung", async () => {
    tapo.press(true);
    // Lesecache abwarten
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const res = await gateway("state");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ on: true, power: 12 });
  });

  it("schaltet über set?on=true|false", async () => {
    const on = await gateway("set?on=true");
    expect(on.status).toBe(200);
    expect(await on.json()).toEqual({ on: true });
    expect(tapo.state.on).toBe(true);
    await gateway("set?on=false");
    expect(tapo.commands.map((entry) => entry.on)).toEqual([true, false]);
    expect(await (await gateway("state")).json()).toEqual({ on: false, power: 0 });
  });

  it("antwortet 404 bei falschem Token und unbekannter ID, ohne den Grund zu nennen", async () => {
    const wrongToken = await gateway("state", "00".repeat(32));
    const shortToken = await gateway("set?on=true", "abc");
    const unknownId = await gateway("state", lamp.token, "ffffffff");
    for (const res of [wrongToken, shortToken, unknownId]) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        error: { code: "not-found", message: "Unbekannte Steckdose" },
      });
    }
    expect(tapo.commands).toEqual([]);
  });

  it("antwortet 400 bei ungültigem on", async () => {
    for (const query of ["set?on=1", "set"]) {
      const res = await gateway(query);
      expect(res.status).toBe(400);
    }
    expect(tapo.commands).toEqual([]);
  });

  it("antwortet 502 device-error, wenn die Steckdose nicht erreichbar ist", async () => {
    await tapo.stop();
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const state = await gateway("state");
    expect(state.status).toBe(502);
    expect(await state.json()).toMatchObject({ error: { code: "device-error" } });
    expect((await gateway("set?on=true")).status).toBe(502);
    tapo = await startFakeTapo();
  });

  it("macht den alten Token mit „Token erneuern“ ungültig", async () => {
    const old = lamp.token;
    const res = await harness.request("POST", `/${lamp.id}/token`);
    const { token } = res.body as { token: string };
    expect(token).not.toBe(old);
    expect((await gateway("state", old)).status).toBe(404);
    expect((await gateway("state", token)).status).toBe(200);
  });

  it("schreibt den Token nie ins Log", async () => {
    await gateway("state");
    await gateway("set?on=true");
    await gateway("state", "00".repeat(32));
    const logs = harness.logs.join("\n");
    expect(logs).toContain('msg="switch command" addon=switches-tapo');
    expect(logs).not.toContain(lamp.token);
    expect(logs).not.toContain("00".repeat(32));
  });
});
