import type { SettingValues } from "@evcc-addons/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SwitchInfo } from "../src/dialog/client.js";
import { SwitchListStore, pollMs } from "../src/switch-list.js";

let visible: boolean;
let pollSeconds: string;
let settingListeners: Set<(values: SettingValues) => void>;

function setup(load: () => Promise<SwitchInfo[]> = () => Promise.resolve([])) {
  const loader = vi.fn(load);
  const settings = {
    get: () => pollSeconds,
    onChange: (cb: (values: SettingValues) => void) => {
      settingListeners.add(cb);
      return () => void settingListeners.delete(cb);
    },
  };
  const store = new SwitchListStore({ load: loader, settings, isVisible: () => visible });
  return { store, loader };
}

function changeSetting(value: string): void {
  pollSeconds = value;
  for (const cb of settingListeners) cb({ pollSeconds: value });
}

beforeEach(() => {
  vi.useFakeTimers();
  visible = true;
  pollSeconds = "5";
  settingListeners = new Set();
});

afterEach(() => vi.useRealTimers());

describe("SwitchListStore", () => {
  it("lädt beim ersten Abonnenten und danach im eingestellten Takt", async () => {
    pollSeconds = "10";
    const { store, loader } = setup();
    const off = store.subscribe(vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(store.current()).toEqual({ kind: "ready", value: [] });
    await vi.advanceTimersByTimeAsync(9_999);
    expect(loader).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(loader).toHaveBeenCalledTimes(2);
    off();
  });

  it("lädt nicht ohne Abonnenten und nicht bei verborgenem Tab", async () => {
    const { store, loader } = setup();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(loader).not.toHaveBeenCalled();
    const off = store.subscribe(vi.fn());
    visible = false;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(loader).toHaveBeenCalledTimes(1);
    off();
    visible = true;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(settingListeners.size).toBe(0);
  });

  it("übernimmt einen neuen Takt nach settings.onChange", async () => {
    const { store, loader } = setup();
    store.subscribe(vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    changeSetting("30");
    await vi.advanceTimersByTimeAsync(29_999);
    expect(loader).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("legt einen Ladefehler im Zustand error ab und benachrichtigt", async () => {
    const failure = new Error("kaputt");
    const { store } = setup(() => Promise.reject(failure));
    const listener = vi.fn();
    store.subscribe(listener);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.current()).toEqual({ kind: "error", error: failure });
    expect(listener).toHaveBeenCalledOnce();
  });

  it("verwirft eine ältere Antwort, die nach einer neueren eintrifft", async () => {
    let resolveSlow: (value: SwitchInfo[]) => void = () => undefined;
    const slow = new Promise<SwitchInfo[]>((resolve) => (resolveSlow = resolve));
    const answers = [slow, Promise.resolve([{ id: "neu" } as SwitchInfo])];
    const { store } = setup(() => answers.shift() as Promise<SwitchInfo[]>);
    store.subscribe(vi.fn());
    await store.refresh();
    resolveSlow([{ id: "alt" } as SwitchInfo]);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.current()).toEqual({ kind: "ready", value: [{ id: "neu" }] });
  });

  it.each([
    ["3", 3000],
    ["20", 20_000],
    [undefined, 5000],
    ["x", 5000],
  ])("rechnet pollSeconds %s in %i ms um", (value, ms) => {
    expect(pollMs(value)).toBe(ms);
  });
});
