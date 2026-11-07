import { describe, expect, it, vi } from "vitest";
import { createAddonApi, type AddonApiDeps } from "../src/addon-api.js";
import { SettingsRegistry } from "../src/settings.js";

describe("SettingsRegistry", () => {
  it("lädt die Werte aus der Liste, unbekannte ids ergeben {}", () => {
    const registry = new SettingsRegistry();
    registry.load([
      { id: "a", settingValues: { x: true } },
      { id: "b", settingValues: {} },
    ]);
    expect(registry.get("a")).toEqual({ x: true });
    expect(registry.get("unknown")).toEqual({});
  });

  it("liefert eine Kopie", () => {
    const registry = new SettingsRegistry();
    registry.load([{ id: "a", settingValues: { x: true } }]);
    registry.get("a").x = false;
    expect(registry.get("a")).toEqual({ x: true });
  });

  it("benachrichtigt nur die Abonnenten der passenden id, bis zur Abmeldung", () => {
    const registry = new SettingsRegistry();
    const onA = vi.fn();
    const onB = vi.fn();
    const unsubscribe = registry.subscribe("a", onA);
    registry.subscribe("b", onB);
    registry.set("a", { x: false });
    expect(onA).toHaveBeenCalledWith({ x: false });
    expect(onB).not.toHaveBeenCalled();
    unsubscribe();
    registry.set("a", { x: true });
    expect(onA).toHaveBeenCalledOnce();
    expect(registry.get("a")).toEqual({ x: true });
  });
});

function apiFor(registry: SettingsRegistry, onError = vi.fn()) {
  const deps = { settings: registry, onError } as unknown as AddonApiDeps;
  return {
    api: createAddonApi(
      { id: "a", name: "A", version: "1.0.0", entry: "i.js", apiVersion: 1 },
      deps,
    ),
    onError,
  };
}

describe("api.settings", () => {
  it("liest die Werte der eigenen id", () => {
    const registry = new SettingsRegistry();
    registry.load([
      { id: "a", settingValues: { x: true } },
      { id: "b", settingValues: { x: false } },
    ]);
    const { api } = apiFor(registry);
    expect(api.settings.get("x")).toBe(true);
    expect(api.settings.get("y")).toBeUndefined();
    expect(api.settings.all()).toEqual({ x: true });
  });

  it("meldet Fehler eines onChange-Callbacks an onError, andere laufen weiter", () => {
    const registry = new SettingsRegistry();
    const { api, onError } = apiFor(registry);
    const failure = new Error("kaputt");
    const second = vi.fn();
    api.settings.onChange(() => {
      throw failure;
    });
    api.settings.onChange(second);
    registry.set("a", { x: false });
    expect(onError).toHaveBeenCalledWith(failure);
    expect(second).toHaveBeenCalledWith({ x: false });
  });

  it("meldet sich über die Rückgabe von onChange ab", () => {
    const registry = new SettingsRegistry();
    const { api } = apiFor(registry);
    const cb = vi.fn();
    api.settings.onChange(cb)();
    registry.set("a", { x: false });
    expect(cb).not.toHaveBeenCalled();
  });
});
