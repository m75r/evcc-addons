import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "../src/logger.js";
import { SwitchController, type ControllerDeps } from "../src/switches/controller.js";
import { EvccClient } from "../src/switches/evcc-client.js";
import type { SwitchConfig } from "../src/switches/model.js";
import type { DeviceState, SwitchDevice } from "../src/switches/tapo/client.js";
import { startFakeEvcc, type FakeEvcc } from "./fake-evcc.js";

const CONFIG: SwitchConfig = {
  id: "lampe",
  name: "Lampe",
  type: "tapo",
  host: "127.0.0.1:1",
  user: "u",
  password: "p",
  loadpoint: "Lampe",
  token: "t".repeat(64),
};

/** Gerät im Speicher; setOn kann bis `release()` hängen bleiben */
class FakeDevice implements SwitchDevice {
  on = true;
  commands: boolean[] = [];
  reachable = true;
  private gate: Promise<void> | null = null;
  private open: () => void = () => undefined;

  getState = vi.fn((): Promise<DeviceState> => {
    if (!this.reachable) return Promise.reject(new Error("Steckdose nicht erreichbar: Timeout"));
    return Promise.resolve({ on: this.on, power: this.on ? 10 : 0, hasMeter: true });
  });

  setOn = vi.fn(async (on: boolean) => {
    this.commands.push(on);
    if (this.gate) await this.gate;
    this.on = on;
  });

  hold(): void {
    this.gate = new Promise((resolve) => (this.open = resolve));
  }

  release(): void {
    this.gate = null;
    this.open();
  }
}

let evcc: FakeEvcc;
let device: FakeDevice;
let clock: number;
let logs: string[];
let controller: SwitchController;

beforeEach(async () => {
  evcc = await startFakeEvcc();
  evcc.loadpoints.titles = ["Carport", "Lampe"];
  device = new FakeDevice();
  clock = 1_000_000;
  logs = [];
  const deps: ControllerDeps = {
    config: CONFIG,
    device,
    evcc: new EvccClient(evcc.url, 500),
    logger: createLogger("debug", { out: (l) => logs.push(l), err: (l) => logs.push(l) }),
    now: () => clock,
  };
  controller = new SwitchController(deps);
});

afterEach(async () => {
  await evcc.stop();
});

/** Wartet, bis ausstehende Moduswechsel bei evcc angekommen sind */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 5));
}

/** Lesecache überspringen und neu abfragen */
async function pollAfter(ms = 1100): Promise<void> {
  clock += ms;
  await controller.poll();
  await settle();
}

/** Start mit bekanntem Zustand „an“, dann Taster aus */
async function pressOff(): Promise<void> {
  await controller.poll();
  device.on = false;
  await pollAfter();
}

const modes = () => evcc.loadpoints.modes.map(({ position, mode }) => ({ position, mode }));

describe("SwitchController: Erkennung", () => {
  it("löst beim ersten Lesewert nach dem Start keine Erkennung aus", async () => {
    device.on = false;
    await controller.poll();
    await settle();
    expect(modes()).toEqual([]);
    expect(controller.status).toMatchObject({ reachable: true, on: false, held: false });
  });

  it("erkennt „aus“ am Gerät und setzt den Modus „off“", async () => {
    await pressOff();
    expect(modes()).toEqual([{ position: 2, mode: "off" }]);
    expect(controller.status).toMatchObject({ held: true, modeError: null });
    expect(logs).toContain('level=info msg="switch pressed on device" switch=lampe state=off');
    expect(logs).toContain('level=info msg="loadpoint mode set" switch=lampe loadpoint=2 mode=off');
  });

  it("setzt bei „ein“ am Gerät den Modus „now“, unabhängig vom bisherigen Modus", async () => {
    device.on = false;
    await controller.poll();
    device.on = true;
    await pollAfter();
    expect(modes()).toEqual([{ position: 2, mode: "now" }]);
  });

  it("erkennt nichts, solange ein Befehl läuft", async () => {
    device.on = false;
    await controller.poll();
    device.hold();
    const command = controller.command(true);
    clock += 1100;
    device.on = true;
    await controller.read();
    device.release();
    await command;
    await pollAfter();
    expect(modes()).toEqual([]);
    expect(controller.status.held).toBe(false);
  });

  it("verwirft einen Lesewert, der vor dem Befehl begann", async () => {
    device.on = false;
    await controller.poll();
    clock += 1100;
    const stale = controller.read();
    await controller.command(true);
    await stale;
    await pollAfter();
    expect(modes()).toEqual([]);
  });

  it("legt bei einem zweiten Tastendruck einen neuen Halt an", async () => {
    await pressOff();
    device.on = true;
    await pollAfter();
    expect(modes()).toEqual([
      { position: 2, mode: "off" },
      { position: 2, mode: "now" },
    ]);
    expect((await controller.command(false)).suppressed).toBe(true);
    expect(device.commands).toEqual([]);
  });
});

describe("SwitchController: Unterdrückung", () => {
  it("unterdrückt set(true) vor dem gesetzten Modus, ohne das Gerät zu schalten", async () => {
    evcc.loadpoints.modeDelayMs = 200;
    await controller.poll();
    device.on = false;
    clock += 1100;
    await controller.read();
    expect(await controller.command(true)).toEqual({ on: false, suppressed: true });
    expect(device.commands).toEqual([]);
    expect(logs).toContain(
      'level=info msg="evcc command suppressed" switch=lampe requested=on held=off',
    );
  });

  it("unterdrückt einen veralteten set(true) 50 ms nach dem gesetzten Modus (SetMode-Race)", async () => {
    await pressOff();
    clock += 50;
    expect((await controller.command(true)).suppressed).toBe(true);
    expect(device.commands).toEqual([]);
  });

  it("führt set(true) 2 s nach dem gesetzten Modus aus", async () => {
    await pressOff();
    clock += 2000;
    expect(await controller.command(true)).toEqual({ on: true, suppressed: false });
    expect(device.commands).toEqual([true]);
    expect(controller.status.held).toBe(false);
  });

  it("beendet den Halt mit dem passenden Befehl und führt ihn aus", async () => {
    await pressOff();
    expect(await controller.command(false)).toEqual({ on: false, suppressed: false });
    expect(device.commands).toEqual([false]);
    expect(controller.status.held).toBe(false);
    clock += 10;
    expect((await controller.command(true)).suppressed).toBe(false);
  });

  it("führt ohne Halt jeden Befehl aus", async () => {
    await controller.poll();
    await controller.command(false);
    await controller.command(true);
    expect(device.commands).toEqual([false, true]);
    await pollAfter();
    expect(modes()).toEqual([]);
  });
});

describe("SwitchController: Fehler beim Setzen des Modus", () => {
  it("meldet einen fehlenden Ladepunkt, unterdrückt weiter und setzt nach Behebung", async () => {
    evcc.loadpoints.titles = ["Carport"];
    await pressOff();
    expect(controller.status.modeError).toBe("Ladepunkt „Lampe“ nicht gefunden");
    clock += 5000;
    expect((await controller.command(true)).suppressed).toBe(true);
    expect(logs.join("\n")).toContain('msg="loadpoint mode failed" switch=lampe title=Lampe');

    evcc.loadpoints.titles = ["Carport", "Lampe"];
    await pollAfter();
    expect(modes()).toEqual([{ position: 2, mode: "off" }]);
    expect(controller.status.modeError).toBeNull();
  });

  it("meldet einen doppelten Titel", async () => {
    evcc.loadpoints.titles = ["Lampe", "Lampe"];
    await pressOff();
    expect(controller.status.modeError).toBe("Ladepunkt „Lampe“ ist nicht eindeutig");
  });

  it("behandelt ein nicht erreichbares evcc wie einen fehlenden Ladepunkt", async () => {
    evcc.loadpoints.modeStatus = 500;
    await pressOff();
    expect(controller.status.modeError).toContain("HTTP 500");
    expect((await controller.command(true)).suppressed).toBe(true);
    await evcc.stop();
    await pollAfter();
    expect(controller.status.modeError).toMatch(/^evcc nicht erreichbar/);
    evcc = await startFakeEvcc();
  });
});

describe("SwitchController: Lesen", () => {
  it("teilt parallele Lesevorgänge und cacht 1 s", async () => {
    await Promise.all([controller.read(), controller.read(), controller.read()]);
    clock += 900;
    await controller.read();
    expect(device.getState).toHaveBeenCalledTimes(1);
    clock += 200;
    await controller.read();
    expect(device.getState).toHaveBeenCalledTimes(2);
  });

  it("loggt nur den Wechsel zwischen erreichbar und nicht erreichbar", async () => {
    device.reachable = false;
    await controller.poll();
    await pollAfter();
    expect(controller.status).toMatchObject({
      reachable: false,
      error: "Steckdose nicht erreichbar: Timeout",
    });
    device.reachable = true;
    await pollAfter();
    const lines = logs.filter((line) => line.includes("reachable"));
    expect(lines).toEqual([
      'level=warn msg="switch unreachable" switch=lampe error="Steckdose nicht erreichbar: Timeout"',
      'level=info msg="switch reachable" switch=lampe',
    ]);
  });
});
