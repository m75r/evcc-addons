// Bootstrap des Loaders im evcc-Fenster
import { h, render } from "preact";
import { createAddonApi } from "./addon-api.js";
import { listAddons, managerClient, reportStatus } from "./addons-client.js";
import { MORE_MENU, waitFor } from "./dom/anchors.js";
import { keepInserted } from "./dom/keep-alive.js";
import { locale, onEnvChange } from "./env.js";
import { getCoreErrors, reportCoreError } from "./errors.js";
import { t } from "./i18n.js";
import { createLiveState, type SharedLiveState } from "./live-state.js";
import { ManagerPage } from "./manager/ManagerPage.js";
import { ADDONS_PATH } from "./nav/addons-item.js";
import { NavRegistry } from "./nav/registry.js";
import { currentPath, onRouteChange } from "./nav/router.js";
import { errorText, PageHost } from "./page/host.js";
import { loadAddons } from "./runtime.js";
import styles from "./styles.css";

const STYLE_ID = "evcc-addons-style";

interface Core {
  host: PageHost;
  nav: NavRegistry;
  state: SharedLiveState;
  addonsLoaded: Promise<void>;
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = styles;
  document.head.append(style);
}

function registerManager(core: Core): void {
  const props = {
    client: managerClient,
    whenLoaded: core.addonsLoaded,
    reload: () => window.location.reload(),
    confirm: (message: string) => window.confirm(message),
  };
  core.host.register(
    ADDONS_PATH,
    (el) => {
      render(h(ManagerPage, { ...props, locale: locale(), coreErrors: getCoreErrors() }), el);
      return () => render(null, el);
    },
    {
      exact: true,
      title: () => t("addons.title", locale()),
      header: false,
      onError: (err) => reportCoreError("Seite Addons", err),
    },
  );
}

/** Statusmeldung an den Proxy; schlägt sie fehl, erscheint der Fehler auf der Seite „Addons“ */
async function report(id: string, ok: boolean, message?: string): Promise<void> {
  try {
    await reportStatus(id, ok, message);
  } catch (err) {
    reportCoreError(`Status von ${id}`, err);
  }
}

async function startAddons(core: Core): Promise<void> {
  try {
    const list = await listAddons();
    await loadAddons(list, {
      report,
      createApi: (manifest) =>
        createAddonApi(manifest, {
          ...core,
          onError: (err) => void report(manifest.id, false, errorText(err)),
        }),
    });
  } catch (err) {
    reportCoreError("Addons laden", err);
  } finally {
    core.host.setReady();
  }
}

async function watchMenu(): Promise<void> {
  try {
    await waitFor(MORE_MENU);
  } catch (err) {
    reportCoreError("Menü „Mehr“", err);
  }
}

function wireEvents(core: Core): void {
  onRouteChange((path) => {
    core.host.attach();
    core.host.show(path);
    core.nav.updateActive(path);
    core.nav.render();
  });
  onEnvChange(() => {
    core.nav.relocalize();
    core.host.show(currentPath(), true);
  });
  keepInserted(() => {
    core.host.attach();
    core.nav.render();
  });
}

export function start(): void {
  injectStyles();
  const host = new PageHost(locale);
  host.attach();
  let resolveLoaded: () => void = () => undefined;
  const addonsLoaded = new Promise<void>((resolve) => (resolveLoaded = resolve));
  const core: Core = {
    host,
    nav: new NavRegistry({ locale, currentPath }),
    state: createLiveState(),
    addonsLoaded,
  };
  registerManager(core);
  host.show(currentPath());
  core.nav.render();
  wireEvents(core);
  void watchMenu();
  void startAddons(core).finally(resolveLoaded);
}

start();
