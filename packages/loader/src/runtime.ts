// Laden aktiver Addons: import() des Entrys, dann activate(api)
import type { AddonApi, AddonManifest } from "@evcc-addons/sdk";
import type { AddonInfo } from "./addons-client.js";
import { errorText } from "./page/host.js";

export interface RuntimeDeps {
  createApi(manifest: AddonManifest): AddonApi;
  report(id: string, ok: boolean, message?: string): Promise<void>;
  /** Austauschbar für Tests */
  importModule?: (url: string) => Promise<unknown>;
}

/** Absolute URL; ein relativer Specifier würde sich auf loader.js beziehen */
export function addonUrl(addon: Pick<AddonInfo, "id" | "entry" | "version">): string {
  const path = `addons-static/${encodeURIComponent(addon.id)}/${addon.entry}`;
  return new URL(`${path}?v=${encodeURIComponent(addon.version)}`, document.baseURI).href;
}

export function toManifest(addon: AddonInfo): AddonManifest {
  const manifest: AddonManifest = {
    id: addon.id,
    name: addon.name,
    version: addon.version,
    entry: addon.entry,
    apiVersion: 1,
  };
  if (addon.description) manifest.description = addon.description;
  return manifest;
}

/** Lädt alle aktiven Addons parallel; ein Fehler betrifft nur das jeweilige Addon */
export async function loadAddons(list: AddonInfo[], deps: RuntimeDeps): Promise<void> {
  const enabled = list.filter((addon) => addon.enabled);
  await Promise.allSettled(enabled.map((addon) => loadAddon(addon, deps)));
}

async function loadAddon(addon: AddonInfo, deps: RuntimeDeps): Promise<void> {
  const importModule = deps.importModule ?? ((url: string) => import(/* @vite-ignore */ url));
  try {
    const mod = (await importModule(addonUrl(addon))) as { activate?: unknown };
    if (typeof mod.activate !== "function")
      throw new Error("activate fehlt (kein Export activate)");
    await (mod.activate as (api: AddonApi) => unknown)(deps.createApi(toManifest(addon)));
  } catch (err) {
    await deps.report(addon.id, false, errorText(err));
    return;
  }
  await deps.report(addon.id, true);
}
