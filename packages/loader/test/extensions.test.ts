import { describe, expect, it, vi } from "vitest";
import { ExtensionRegistry } from "../src/extensions.js";

const POINT = "fixture.badge";

describe("ExtensionRegistry", () => {
  it("liefert Einträge, die vor und nach dem ersten get bereitgestellt wurden", () => {
    const registry = new ExtensionRegistry();
    registry.provide("a", POINT, 1);
    expect(registry.get(POINT)).toEqual([{ addonId: "a", value: 1 }]);
    registry.provide("b", POINT, 2);
    expect(registry.get(POINT)).toEqual([
      { addonId: "a", value: 1 },
      { addonId: "b", value: 2 },
    ]);
    expect(registry.get("anderer.punkt")).toEqual([]);
  });

  it("liefert Kopien, die den Bestand nicht verändern", () => {
    const registry = new ExtensionRegistry();
    registry.provide("a", POINT, 1);
    registry.get(POINT).pop();
    expect(registry.get(POINT)).toHaveLength(1);
  });

  it("meldet einen späten Anbieter über onChange", () => {
    const registry = new ExtensionRegistry();
    const cb = vi.fn();
    registry.onChange(POINT, cb, vi.fn());
    registry.provide("spaet", POINT, "x");
    expect(cb).toHaveBeenCalledWith([{ addonId: "spaet", value: "x" }]);
  });

  it("meldet das Abmelden eines Anbieters und ignoriert doppeltes Abmelden", () => {
    const registry = new ExtensionRegistry();
    const withdraw = registry.provide("a", POINT, 1);
    const cb = vi.fn();
    registry.onChange(POINT, cb, vi.fn());
    withdraw();
    withdraw();
    expect(cb).toHaveBeenCalledOnce();
    expect(cb).toHaveBeenCalledWith([]);
    expect(registry.get(POINT)).toEqual([]);
  });

  it("benachrichtigt nach dem Abbestellen nicht mehr", () => {
    const registry = new ExtensionRegistry();
    const cb = vi.fn();
    const off = registry.onChange(POINT, cb, vi.fn());
    off();
    registry.provide("a", POINT, 1);
    expect(cb).not.toHaveBeenCalled();
  });

  it("gibt einen Fehler im Callback an onError des Abonnenten, andere laufen weiter", () => {
    const registry = new ExtensionRegistry();
    const onError = vi.fn();
    const other = vi.fn();
    registry.onChange(
      POINT,
      () => {
        throw new Error("kaputt");
      },
      onError,
    );
    registry.onChange(POINT, other, vi.fn());
    expect(() => registry.provide("a", POINT, 1)).not.toThrow();
    expect(onError).toHaveBeenCalledWith(new Error("kaputt"));
    expect(other).toHaveBeenCalledOnce();
  });

  it("lehnt einen leeren Namen ab", () => {
    expect(() => new ExtensionRegistry().provide("a", " ", 1)).toThrow(/nicht leerer Text/);
  });
});
