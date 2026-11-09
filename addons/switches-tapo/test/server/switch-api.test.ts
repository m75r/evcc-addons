import type { TestResponse, TestServerApi } from "@evcc-addons/sdk/testing/harness";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startFakeEvcc, type FakeEvcc } from "@evcc-addons/sdk/testing/fake-evcc";
import { startFakeTapo, TAPO_PASSWORD, TAPO_USER, type FakeTapo } from "./fake-tapo.js";
import { startGateway, type TestGateway } from "./gateway.js";

let evcc: FakeEvcc;
let tapo: FakeTapo;
let gateway: TestGateway;
let harness: TestServerApi;

beforeEach(async () => {
  evcc = await startFakeEvcc();
  evcc.loadpoints.titles = ["Carport", "Lampe"];
  tapo = await startFakeTapo({ on: true, power: 35 });
  gateway = await startGateway(evcc.url);
  harness = gateway.harness;
});

afterEach(async () => {
  await gateway.stop();
  await tapo.stop();
  await evcc.stop();
});

function input(overrides: Record<string, unknown> = {}) {
  return {
    name: "Lampe",
    type: "tapo",
    host: tapo.host,
    user: TAPO_USER,
    password: TAPO_PASSWORD,
    target: { kind: "loadpoint", title: "Lampe" },
    ...overrides,
  };
}

/** Anfrage auf den Sub-Pfad, mit oder ohne Admin-Login */
function call(method: string, path: string, body?: unknown, admin = true): Promise<TestResponse> {
  harness.setAdmin(admin);
  return harness.request(method, path, body);
}

interface Dto {
  id: string;
  token?: string;
  host?: string;
  user?: string;
  password?: string;
  target: { kind: string; title: string };
  targetFound: boolean | null;
  status: { reachable: boolean | null; on: boolean | null; power: number | null; error: string };
}

async function create(overrides: Record<string, unknown> = {}): Promise<Dto> {
  const res = await call("POST", "/", input(overrides));
  expect(res.status).toBe(201);
  return res.body as Dto;
}

async function listAs(admin: boolean): Promise<Dto[]> {
  return ((await call("GET", "/", undefined, admin)).body as { switches: Dto[] }).switches;
}

describe("Verwaltung der Steckdosen", () => {
  it("lehnt Anlegen, Bearbeiten und Löschen ohne Admin mit 401 ab", async () => {
    expect((await call("POST", "/", input(), false)).status).toBe(401);
    const created = await create();
    expect((await call("PATCH", `/${created.id}`, input(), false)).status).toBe(401);
    expect((await call("DELETE", `/${created.id}`, undefined, false)).status).toBe(401);
    expect((await call("POST", `/${created.id}/token`, undefined, false)).status).toBe(401);
  });

  it("liefert nach dem Anlegen den gelesenen Status, nie das Passwort", async () => {
    const created = await create();
    expect(created).toMatchObject({
      name: "Lampe",
      host: tapo.host,
      user: TAPO_USER,
      target: { kind: "loadpoint", title: "Lampe" },
      targetFound: true,
      status: { reachable: true, on: true, power: 35, hasMeter: true, error: null },
    });
    expect(created.token).toMatch(/^[0-9a-f]{64}$/);
    expect(created).not.toHaveProperty("password");
    expect(harness.logs.join("\n")).toContain(
      `msg="switch created" addon=switches-tapo switch=${created.id} name=Lampe host=${tapo.host}`,
    );
    expect(harness.logs.join("\n")).not.toContain(TAPO_PASSWORD);
  });

  it("zeigt ohne Admin weder Adresse, E-Mail noch Token", async () => {
    await create();
    const [entry] = await listAs(false);
    expect(entry).toMatchObject({
      name: "Lampe",
      target: { kind: "loadpoint", title: "Lampe" },
      status: { on: true },
    });
    for (const key of ["host", "user", "token", "password"]) expect(entry).not.toHaveProperty(key);
    const [admin] = await listAs(true);
    expect(admin).toHaveProperty("token");
    expect(admin).not.toHaveProperty("password");
  });

  it("meldet targetFound für Ladepunkte: false, true, doppelt false, ohne evcc null", async () => {
    await create({ target: { kind: "loadpoint", title: "Gibt es nicht" } });
    expect((await listAs(true))[0].targetFound).toBe(false);
    evcc.loadpoints.titles = ["Gibt es nicht"];
    expect((await listAs(true))[0].targetFound).toBe(true);
    evcc.loadpoints.titles = ["Gibt es nicht", "Gibt es nicht"];
    expect((await listAs(true))[0].targetFound).toBe(false);
    await evcc.stop();
    expect((await listAs(true))[0].targetFound).toBeNull();
    evcc = await startFakeEvcc();
  });

  it("meldet targetFound für Verbraucher über title || name", async () => {
    await create({ target: { kind: "consumer", title: "kaffee" } });
    expect((await listAs(true))[0].targetFound).toBe(false);
    evcc.loadpoints.consumers = [{ name: "kaffee" }, { name: "db:3", title: "Kühlschrank" }];
    expect((await listAs(true))[0].targetFound).toBe(true);
  });

  it("speichert trotz Verbindungsfehler und zeigt den Fehler im Status", async () => {
    const created = await create({ password: "falsch" });
    expect(created.status).toMatchObject({ reachable: false });
    expect(created.status.error).toContain("nur Tapo-Firmware mit KLAP-Protokoll");
    expect(await listAs(true)).toHaveLength(1);
  });

  it("bearbeitet mit leerem Passwort und prüft erneut die Verbindung", async () => {
    const created = await create({ password: "falsch" });
    const res = await call("PATCH", `/${created.id}`, input({ password: TAPO_PASSWORD }));
    expect(res.status).toBe(200);
    expect((res.body as Dto).status.reachable).toBe(true);
    const again = await call("PATCH", `/${created.id}`, input({ name: "Neu", password: "" }));
    expect(again.body).toMatchObject({ name: "Neu", status: { reachable: true } });
  });

  it("antwortet 400 switch-invalid mit Meldung je Feld", async () => {
    const res = await call("POST", "/", input({ host: "http://x" }));
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: "switch-invalid" } });
  });

  it("löscht und antwortet danach 404", async () => {
    const created = await create();
    expect((await call("DELETE", `/${created.id}`)).status).toBe(204);
    expect(await listAs(true)).toEqual([]);
    const again = await call("DELETE", `/${created.id}`);
    expect(again).toMatchObject({ status: 404, body: { error: { code: "not-found" } } });
  });
});

describe("POST /<id>/power", () => {
  const consumer = { target: { kind: "consumer", title: "Kaffeemaschine" } };

  it("schaltet eine Steckdose mit Verbraucher-Bindung ohne Login", async () => {
    const created = await create(consumer);
    const off = await call("POST", `/${created.id}/power`, { on: false }, false);
    expect(off).toMatchObject({ status: 200, body: { on: false } });
    expect(tapo.state.on).toBe(false);
    const on = await call("POST", `/${created.id}/power`, { on: true }, false);
    expect(on.body).toEqual({ on: true });
    expect(tapo.commands.map((entry) => entry.on)).toEqual([false, true]);
    expect(harness.logs.join("\n")).toContain(
      `msg="switch power set" addon=switches-tapo switch=${created.id} state=on`,
    );
  });

  it("antwortet 409 bei Ladepunkt-Bindung", async () => {
    const created = await create();
    const res = await call("POST", `/${created.id}/power`, { on: false }, false);
    expect(res).toMatchObject({
      status: 409,
      body: {
        error: {
          code: "target-not-consumer",
          message: "Diese Steckdose schaltet evcc über den Ladepunkt.",
        },
      },
    });
    expect(tapo.commands).toEqual([]);
  });

  it("antwortet 400 bei ungültigem Body und 404 bei unbekannter ID", async () => {
    const created = await create(consumer);
    for (const body of [{}, { on: "true" }, []]) {
      const res = await call("POST", `/${created.id}/power`, body, false);
      expect(res).toMatchObject({ status: 400, body: { error: { code: "body-invalid" } } });
    }
    const unknown = await call("POST", "/ffffffff/power", { on: true }, false);
    expect(unknown).toMatchObject({ status: 404, body: { error: { code: "not-found" } } });
  });

  it("antwortet 502 device-error, wenn die Steckdose nicht erreichbar ist", async () => {
    const created = await create(consumer);
    await tapo.stop();
    const res = await call("POST", `/${created.id}/power`, { on: true }, false);
    expect(res).toMatchObject({ status: 502, body: { error: { code: "device-error" } } });
    tapo = await startFakeTapo();
  });
});
