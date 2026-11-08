import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FAKE_COOKIE, startFakeEvcc, type FakeEvcc } from "./fake-evcc.js";
import { startFakeTapo, TAPO_PASSWORD, TAPO_USER, type FakeTapo } from "./fake-tapo.js";
import { startTestProxy, type TestProxy } from "./helpers.js";

let evcc: FakeEvcc;
let tapo: FakeTapo;
let proxy: TestProxy;

beforeEach(async () => {
  evcc = await startFakeEvcc();
  evcc.loadpoints.titles = ["Carport", "Lampe"];
  tapo = await startFakeTapo({ on: true, power: 35 });
  proxy = await startTestProxy(evcc.url);
});

afterEach(async () => {
  await proxy.proxy.stop();
  await tapo.stop();
  await evcc.stop();
});

const LOGIN = { cookie: FAKE_COOKIE };

function input(overrides: Record<string, unknown> = {}) {
  return {
    name: "Lampe",
    type: "tapo",
    host: tapo.host,
    user: TAPO_USER,
    password: TAPO_PASSWORD,
    loadpoint: "Lampe",
    ...overrides,
  };
}

function api(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = LOGIN,
) {
  return fetch(`${proxy.url}/addons-api/${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

interface Dto {
  id: string;
  token?: string;
  host?: string;
  user?: string;
  password?: string;
  loadpointFound: boolean | null;
  status: { reachable: boolean | null; on: boolean | null; power: number | null; error: string };
}

async function create(overrides: Record<string, unknown> = {}): Promise<Dto> {
  const res = await api("switches", "POST", input(overrides));
  expect(res.status).toBe(201);
  return (await res.json()) as Dto;
}

async function listAs(headers: Record<string, string>): Promise<Dto[]> {
  const res = await api("switches", "GET", undefined, headers);
  return ((await res.json()) as { switches: Dto[] }).switches;
}

describe("Verwaltung der Steckdosen", () => {
  it("lehnt Anlegen, Bearbeiten und Löschen ohne Admin mit 401 ab", async () => {
    expect((await api("switches", "POST", input(), {})).status).toBe(401);
    const created = await create();
    expect((await api(`switches/${created.id}`, "PATCH", input(), {})).status).toBe(401);
    expect((await api(`switches/${created.id}`, "DELETE", undefined, {})).status).toBe(401);
    expect((await api(`switches/${created.id}/token`, "POST", undefined, {})).status).toBe(401);
  });

  it("liefert nach dem Anlegen den gelesenen Status, nie das Passwort", async () => {
    const created = await create();
    expect(created).toMatchObject({
      name: "Lampe",
      host: tapo.host,
      user: TAPO_USER,
      loadpointFound: true,
      status: { reachable: true, on: true, power: 35, hasMeter: true, error: null },
    });
    expect(created.token).toMatch(/^[0-9a-f]{64}$/);
    expect(created).not.toHaveProperty("password");
    expect(proxy.logs.join("\n")).toContain(
      `msg="switch created" switch=${created.id} name=Lampe host=${tapo.host}`,
    );
    expect(proxy.logs.join("\n")).not.toContain(TAPO_PASSWORD);
  });

  it("zeigt ohne Admin weder Adresse, E-Mail noch Token", async () => {
    await create();
    const [entry] = await listAs({});
    expect(entry).toMatchObject({ name: "Lampe", loadpoint: "Lampe", status: { on: true } });
    for (const key of ["host", "user", "token", "password"]) expect(entry).not.toHaveProperty(key);
    const [admin] = await listAs(LOGIN);
    expect(admin).toHaveProperty("token");
    expect(admin).not.toHaveProperty("password");
  });

  it("meldet loadpointFound false und null, wenn evcc nicht antwortet", async () => {
    await create({ loadpoint: "Gibt es nicht" });
    expect((await listAs(LOGIN))[0].loadpointFound).toBe(false);
    evcc.loadpoints.titles = ["Gibt es nicht"];
    expect((await listAs(LOGIN))[0].loadpointFound).toBe(true);
  });

  it("speichert trotz Verbindungsfehler und zeigt den Fehler im Status", async () => {
    const created = await create({ password: "falsch" });
    expect(created.status).toMatchObject({ reachable: false });
    expect(created.status.error).toContain("nur Tapo-Firmware mit KLAP-Protokoll");
    expect(await listAs(LOGIN)).toHaveLength(1);
  });

  it("bearbeitet mit leerem Passwort und prüft erneut die Verbindung", async () => {
    const created = await create({ password: "falsch" });
    const res = await api(`switches/${created.id}`, "PATCH", input({ password: TAPO_PASSWORD }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as Dto).status.reachable).toBe(true);
    const again = await api(
      `switches/${created.id}`,
      "PATCH",
      input({ name: "Neu", password: "" }),
    );
    expect(await again.json()).toMatchObject({ name: "Neu", status: { reachable: true } });
  });

  it("antwortet 400 switch-invalid mit Meldung je Feld", async () => {
    const res = await api("switches", "POST", input({ host: "http://x" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "switch-invalid" } });
  });

  it("löscht und antwortet danach 404", async () => {
    const created = await create();
    expect((await api(`switches/${created.id}`, "DELETE")).status).toBe(204);
    expect(await listAs(LOGIN)).toEqual([]);
    expect((await api(`switches/${created.id}`, "DELETE")).status).toBe(404);
  });
});
