import type { AddonApi } from "@evcc-addons/sdk";
import { describe, expect, it, vi } from "vitest";
import type { AddonInfo } from "../src/addons-client.js";
import { addonUrl, loadAddons } from "../src/runtime.js";

function addon(id: string, enabled = true): AddonInfo {
  return {
    id,
    name: id,
    version: "0.1.0",
    description: null,
    entry: "index.js",
    enabled,
    error: null,
  };
}

function deps(modules: Record<string, unknown>) {
  const report = vi.fn((_id: string, _ok: boolean, _message?: string) => Promise.resolve());
  const createApi = vi.fn((manifest: { id: string }) => ({ id: manifest.id }) as AddonApi);
  const importModule = (url: string) => {
    const id = /addons-static\/([^/]+)\//.exec(url)?.[1] ?? "";
    return id in modules ? Promise.resolve(modules[id]) : Promise.reject(new Error(`404 ${url}`));
  };
  return { report, createApi, importModule };
}

describe("loadAddons", () => {
  it("meldet ok: false für ein werfendes activate und lädt andere trotzdem", async () => {
    const goodActivate = vi.fn();
    const d = deps({
      broken: { activate: () => Promise.reject(new Error("kaputt")) },
      good: { activate: goodActivate },
    });
    await loadAddons([addon("broken"), addon("good")], d);
    expect(goodActivate).toHaveBeenCalledWith({ id: "good" });
    expect(d.report).toHaveBeenCalledWith("broken", false, "Error: kaputt");
    expect(d.report).toHaveBeenCalledWith("good", true);
  });

  it("meldet ein fehlendes activate", async () => {
    const d = deps({ empty: {} });
    await loadAddons([addon("empty")], d);
    expect(d.report).toHaveBeenCalledWith(
      "empty",
      false,
      expect.stringContaining("activate fehlt"),
    );
  });

  it("überspringt deaktivierte Addons", async () => {
    const activate = vi.fn();
    const d = deps({ off: { activate } });
    await loadAddons([addon("off", false)], d);
    expect(activate).not.toHaveBeenCalled();
    expect(d.report).not.toHaveBeenCalled();
  });
});

describe("addonUrl", () => {
  it("ist absolut zur Basis-URL des Dokuments", () => {
    const base = document.createElement("base");
    base.href = "http://pi/";
    document.head.append(base);
    expect(addonUrl({ id: "hello", entry: "index.js", version: "0.1.0" })).toBe(
      "http://pi/addons-static/hello/index.js?v=0.1.0",
    );
    base.remove();
  });
});
