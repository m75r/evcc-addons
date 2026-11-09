import type { AddonManifest, ManagerDialogDef } from "@evcc-addons/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAddonApi, type AddonApiDeps } from "../src/addon-api.js";
import { ExtensionRegistry } from "../src/extensions.js";
import type { SharedLiveState } from "../src/live-state.js";
import { ManagerDialogRegistry } from "../src/manager/dialogs.js";
import type { NavRegistry } from "../src/nav/registry.js";
import type { PageHost } from "../src/page/host.js";
import { SettingsRegistry } from "../src/settings.js";

const MANIFEST: AddonManifest = {
  id: "my-addon",
  name: "Mein Addon",
  version: "1.0.0",
  entry: "index.js",
  apiVersion: 2,
};

function deps(overrides: Partial<AddonApiDeps> = {}): AddonApiDeps {
  return {
    nav: {} as NavRegistry,
    host: {} as PageHost,
    state: {} as SharedLiveState,
    settings: new SettingsRegistry(),
    extensions: new ExtensionRegistry(),
    dialogs: new ManagerDialogRegistry(),
    onError: vi.fn(),
    ...overrides,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("createAddonApi (apiVersion 2)", () => {
  it("ruft mit serverApi …/addons-api/ext/<id>/<path> relativ zur Seite auf", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response("{}")));
    vi.stubGlobal("fetch", fetchMock);
    const api = createAddonApi(MANIFEST, deps());
    const init = { method: "POST" };
    await api.serverApi("/items/a?x=1", init);
    const base = window.location.origin + window.location.pathname;
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("addons-api/ext/my-addon/items/a?x=1", base).href,
      init,
    );
  });

  it("legt Dialoge unter der eigenen ID ab", () => {
    const dialogs = new ManagerDialogRegistry();
    const api = createAddonApi(MANIFEST, deps({ dialogs }));
    const def: ManagerDialogDef = { label: "D", title: "Dialog", icon: "<svg/>", mount: vi.fn() };
    api.addManagerDialog(def);
    expect(dialogs.list("my-addon").map((entry) => entry.def.title)).toEqual(["Dialog"]);
    expect(dialogs.list("anderes")).toEqual([]);
  });

  it("lehnt einen Dialog ohne mount ab", () => {
    const api = createAddonApi(MANIFEST, deps());
    const def = { label: "D", title: "Dialog", icon: "<svg/>" } as unknown as ManagerDialogDef;
    expect(() => api.addManagerDialog(def)).toThrow(/mount muss eine Funktion sein/);
  });

  it("stellt Erweiterungen mit der eigenen ID bereit und meldet Fehler an onError", () => {
    const extensions = new ExtensionRegistry();
    const onError = vi.fn();
    const api = createAddonApi(MANIFEST, deps({ extensions, onError }));
    api.extensions.onChange("x.y", () => {
      throw new Error("kaputt");
    });
    api.extensions.provide("x.y", 42);
    expect(api.extensions.get("x.y")).toEqual([{ addonId: "my-addon", value: 42 }]);
    expect(onError).toHaveBeenCalledWith(new Error("kaputt"));
  });
});
