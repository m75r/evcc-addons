// Addon-API: die Schnittstelle, die `activate(api)` eines Addons erhält
import type {
  AddonApi,
  AddonExtensions,
  AddonManifest,
  AddonSettings,
  LiveState,
  PageDef,
} from "@evcc-addons/sdk";
import { addonsApiUrl } from "./addons-client.js";
import { locale, onEnvChange, theme } from "./env.js";
import { evccApi } from "./evcc-api.js";
import type { ExtensionRegistry } from "./extensions.js";
import { localize } from "./i18n.js";
import type { SharedLiveState } from "./live-state.js";
import type { ManagerDialogRegistry } from "./manager/dialogs.js";
import type { NavRegistry } from "./nav/registry.js";
import type { PageHost } from "./page/host.js";
import type { SettingsRegistry } from "./settings.js";

export interface AddonApiDeps {
  nav: NavRegistry;
  host: PageHost;
  state: SharedLiveState;
  settings: SettingsRegistry;
  extensions: ExtensionRegistry;
  dialogs: ManagerDialogRegistry;
  /** Fehler des Addons zur Laufzeit (Seiten, Callbacks, Dialoge) */
  onError: (err: unknown) => void;
}

export function createAddonApi(manifest: AddonManifest, deps: AddonApiDeps): AddonApi {
  const { id } = manifest;
  const api: AddonApi = {
    id,
    addTab: (item) => deps.nav.addTab(id, item),
    addMoreMenuItem: (item) => deps.nav.addMoreMenuItem(id, item),
    registerPage: (page) => registerPage(api, page, deps),
    state: scopedState(deps.state, deps.onError),
    settings: scopedSettings(id, deps.settings, deps.onError),
    evccApi,
    extensions: scopedExtensions(id, deps),
    addManagerDialog: (def) => deps.dialogs.add(id, def, deps.onError),
    serverApi: (path, init) => fetch(serverApiUrl(id, path), init),
    locale,
    theme,
    onEnvChange,
  };
  return api;
}

/** `…/addons-api/ext/<id>/<path>` relativ zur aktuellen Seite */
export function serverApiUrl(id: string, path: string): string {
  return addonsApiUrl(`ext/${encodeURIComponent(id)}/${path.replace(/^\/+/, "")}`);
}

/** Erweiterungspunkte mit der ID des Addons als Anbieter und seinem Fehlerkanal */
function scopedExtensions(id: string, deps: AddonApiDeps): AddonExtensions {
  return {
    provide: (point, value) => deps.extensions.provide(id, point, value),
    get: (point) => deps.extensions.get(point),
    onChange: (point, cb) => deps.extensions.onChange(point, cb, deps.onError),
  };
}

export function pagePattern(id: string, path?: string): string {
  const sub = (path ?? "").replace(/^\/+|\/+$/g, "");
  return `/addons/${id}${sub ? "/" + sub : ""}`;
}

function registerPage(api: AddonApi, page: PageDef, deps: AddonApiDeps): void {
  deps.host.register(
    pagePattern(api.id, page.path),
    (el, subPath) => page.mount(el, { subPath, api }),
    {
      title: () => localize(page.title, locale()),
      onError: deps.onError,
    },
  );
}

/** Live-Daten mit Fehlerkanal des Addons */
function scopedState(state: SharedLiveState, onError: (err: unknown) => void): LiveState {
  return {
    get: (key) => state.get(key),
    subscribe: (prefix, cb) => state.subscribe(prefix, cb, onError),
  };
}

/** Einstellungen der id; einziger Fehlerkanal für onChange-Callbacks, damit andere weiterlaufen */
function scopedSettings(
  id: string,
  registry: SettingsRegistry,
  onError: (err: unknown) => void,
): AddonSettings {
  return {
    get: (key) => registry.get(id)[key],
    all: () => registry.get(id),
    onChange: (cb) =>
      registry.subscribe(id, (values) => {
        try {
          cb(values);
        } catch (err) {
          onError(err);
        }
      }),
  };
}
