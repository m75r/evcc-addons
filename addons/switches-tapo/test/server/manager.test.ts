import { createTestLogger } from "@evcc-addons/sdk/testing/harness";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EvccApi } from "../../src/server/evcc-client.js";
import { SwitchManager, pollMsFromSetting } from "../../src/server/manager.js";
import type { DeviceState, SwitchDevice } from "../../src/server/tapo/client.js";

/** Zählt Lesezugriffe, damit sich der Takt des Pollings messen lässt */
class CountingDevice implements SwitchDevice {
  reads = 0;

  getState(): Promise<DeviceState> {
    this.reads++;
    return Promise.resolve({ on: false, power: 0, hasMeter: true });
  }

  setOn(): Promise<void> {
    return Promise.resolve();
  }
}

const EVCC: EvccApi = {
  loadpointTitles: () => Promise.resolve(["Lampe"]),
  consumerTitles: () => Promise.resolve([]),
  resolveLoadpoint: () => Promise.resolve(1),
  setMode: () => Promise.resolve(),
};

const FILE = {
  version: 1,
  switches: [
    {
      id: "lampe",
      name: "Lampe",
      type: "tapo",
      host: "127.0.0.1:1",
      user: "u",
      password: "p",
      loadpoint: "Lampe",
      token: "t".repeat(64),
    },
  ],
};

let device: CountingDevice;
let manager: SwitchManager | undefined;
let logs: string[];

async function start(pollMs: number): Promise<SwitchManager> {
  const dataDir = await mkdtemp(join(tmpdir(), "switch-manager-"));
  await writeFile(join(dataDir, "switches.json"), JSON.stringify(FILE));
  const test = createTestLogger();
  logs = test.lines;
  const created = new SwitchManager({
    dataDir,
    evccUrl: "http://127.0.0.1:9",
    logger: test.logger,
    pollMs,
    createDevice: () => device,
    evcc: EVCC,
    now: () => Date.now(),
  });
  manager = created;
  await created.start();
  return created;
}

/** Liest nach `ms` die Anzahl der Lesezugriffe seit dem Aufruf */
async function readsWithin(ms: number): Promise<number> {
  const before = device.reads;
  await vi.advanceTimersByTimeAsync(ms);
  return device.reads - before;
}

beforeEach(() => {
  vi.useFakeTimers();
  device = new CountingDevice();
});

afterEach(() => {
  manager?.stop();
  manager = undefined;
  vi.useRealTimers();
});

describe("pollMsFromSetting", () => {
  it.each([
    ["3", 3000],
    ["10", 10_000],
    ["30", 30_000],
    [undefined, 5000],
    ["7", 5000],
    [true, 5000],
  ])("%s → %i ms", (value, ms) => {
    expect(pollMsFromSetting(value)).toBe(ms);
  });
});

describe("SwitchManager: Abfrageintervall", () => {
  it("fragt mit der Einstellung „10“ alle 10 s ab", async () => {
    await start(pollMsFromSetting("10"));
    await vi.advanceTimersByTimeAsync(0);
    expect(await readsWithin(9_999)).toBe(0);
    expect(await readsWithin(1)).toBe(1);
    expect(await readsWithin(30_000)).toBe(3);
  });

  it("ersetzt mit setPollMs die laufenden Timer", async () => {
    const started = await start(10_000);
    await vi.advanceTimersByTimeAsync(0);
    started.setPollMs(3000);
    expect(await readsWithin(9000)).toBe(3);
    expect(logs).toContain('level=info msg="poll interval changed" ms=3000');
  });

  it("ändert bei gleichem Wert nichts", async () => {
    const started = await start(5000);
    started.setPollMs(5000);
    expect(logs.filter((line) => line.includes("poll interval changed"))).toEqual([]);
  });
});
