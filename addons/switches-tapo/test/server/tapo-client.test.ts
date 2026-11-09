import net from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TapoClient } from "../../src/server/tapo/client.js";
import { startFakeTapo, TAPO_PASSWORD, TAPO_USER, type FakeTapo } from "./fake-tapo.js";

let tapo: FakeTapo;

beforeEach(async () => {
  tapo = await startFakeTapo({ on: true, power: 35 });
});

afterEach(async () => {
  await tapo.stop();
});

function client(overrides: Partial<ConstructorParameters<typeof TapoClient>[0]> = {}) {
  return new TapoClient({
    host: tapo.host,
    user: TAPO_USER,
    password: TAPO_PASSWORD,
    ...overrides,
  });
}

describe("TapoClient", () => {
  it("liest Zustand und Leistung", async () => {
    expect(await client().getState()).toEqual({ on: true, power: 35, hasMeter: true });
    expect(tapo.methods).toEqual(["get_device_info", "get_energy_usage"]);
  });

  it("schaltet und nutzt dabei dieselbe Sitzung", async () => {
    const device = client();
    await device.setOn(false);
    expect(tapo.state.on).toBe(false);
    expect(await device.getState()).toMatchObject({ on: false, power: 0 });
    expect(tapo.commands.map((entry) => entry.on)).toEqual([false]);
    expect(tapo.handshakes).toBe(1);
  });

  it("erkennt Steckdosen ohne Messung (-1001)", async () => {
    tapo.state.hasMeter = false;
    expect(await client().getState()).toEqual({ on: true, power: null, hasMeter: false });
  });

  it("meldet falsche Zugangsdaten mit KLAP-Hinweis", async () => {
    await expect(client({ password: "falsch" }).getState()).rejects.toThrow(
      "Verbindung fehlgeschlagen (nur Tapo-Firmware mit KLAP-Protokoll wird unterstützt): " +
        "handshake1: Anmeldung abgelehnt",
    );
  });

  it("meldet ein abgelehntes handshake1 mit KLAP-Hinweis und Status", async () => {
    tapo.state.handshakeStatus = 404;
    await expect(client().getState()).rejects.toThrow(
      "(nur Tapo-Firmware mit KLAP-Protokoll wird unterstützt): handshake1: HTTP 404",
    );
  });

  it("meldet sich nach 403 neu an und wiederholt die Anfrage", async () => {
    const device = client();
    await device.getState();
    tapo.expireSessions();
    expect(await device.getState()).toMatchObject({ on: true });
    expect(tapo.handshakes).toBe(2);
  });

  it("serialisiert parallele Anfragen", async () => {
    const device = client();
    const results = await Promise.all([device.getState(), device.setOn(false), device.getState()]);
    expect(results[0]).toMatchObject({ on: true });
    expect(results[2]).toMatchObject({ on: false });
  });

  it("meldet eine nicht erreichbare Steckdose", async () => {
    const port = tapo.port;
    await tapo.stop();
    await expect(client({ host: `127.0.0.1:${port}` }).getState()).rejects.toThrow(
      /^Steckdose nicht erreichbar: connect ECONNREFUSED/,
    );
    tapo = await startFakeTapo();
  });

  it("bricht nach dem Timeout ab", async () => {
    const sockets: net.Socket[] = [];
    const silent = net.createServer((socket) => void sockets.push(socket));
    await new Promise<void>((resolve) => silent.listen(0, "127.0.0.1", resolve));
    const { port } = silent.address() as net.AddressInfo;
    try {
      await expect(
        client({ host: `127.0.0.1:${port}`, timeoutMs: 200 }).getState(),
      ).rejects.toThrow("Steckdose nicht erreichbar: keine Antwort innerhalb von 0.2 s");
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => silent.close(resolve));
    }
  });
});
