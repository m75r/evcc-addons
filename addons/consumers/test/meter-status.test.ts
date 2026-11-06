import type { AddonApi } from "@evcc-addons/sdk";
import { describe, expect, it, vi } from "vitest";
import { fetchMeterStatus, parseStatus, pollIntervalMs } from "../src/meter-status.js";

const evccApi = vi.fn((_path: string) => Promise.resolve(new Response()));

function apiWith(response: Response, interval?: unknown): AddonApi {
  evccApi.mockImplementation(() => Promise.resolve(response));
  return {
    evccApi,
    state: { get: () => interval, subscribe: () => () => undefined },
  } as unknown as AddonApi;
}

describe("parseStatus", () => {
  it("übernimmt Wert und Lesefehler, ignoriert andere Felder", () => {
    expect(
      parseStatus({
        power: { value: 24, error: "" },
        energy: { value: 78.1 },
        chargedEnergy: { value: 0, error: "timeout" },
        enabled: { value: true },
      }),
    ).toEqual({
      power: { value: 24 },
      energy: { value: 78.1 },
      chargedEnergy: { value: 0, error: "timeout" },
    });
    expect(parseStatus(null)).toEqual({});
    expect(parseStatus({ power: { value: "x" } })).toEqual({});
  });
});

describe("fetchMeterStatus", () => {
  it("ruft den Status-Endpunkt der Konfiguration auf", async () => {
    const api = apiWith(Response.json({ chargedEnergy: { value: 0.898 } }));
    expect(await fetchMeterStatus(api, "wärme pumpe")).toEqual({
      kind: "ok",
      status: { chargedEnergy: { value: 0.898 } },
    });
    expect(evccApi).toHaveBeenCalledWith("config/devices/meter/w%C3%A4rme%20pumpe/status");
  });

  it("bildet 401, 403 und 404 ab und wirft bei anderen Fehlern", async () => {
    for (const status of [401, 403]) {
      expect(await fetchMeterStatus(apiWith(new Response(null, { status })), "a")).toEqual({
        kind: "unauthorized",
      });
    }
    expect(await fetchMeterStatus(apiWith(new Response(null, { status: 404 })), "a")).toEqual({
      kind: "missing",
    });
    await expect(
      fetchMeterStatus(apiWith(new Response(null, { status: 500 })), "a"),
    ).rejects.toThrow("HTTP 500");
  });
});

describe("pollIntervalMs", () => {
  it("nutzt das evcc-Intervall, mindestens 5 s, sonst 30 s", () => {
    const empty = new Response();
    expect(pollIntervalMs(apiWith(empty, 30))).toBe(30_000);
    expect(pollIntervalMs(apiWith(empty, 0.1))).toBe(5_000);
    expect(pollIntervalMs(apiWith(empty, undefined))).toBe(30_000);
  });
});
