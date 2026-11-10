import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  type ManagerClient,
  type PlatformInfo,
  type UpdateStatus,
} from "../src/addons-client.js";
import { PlatformModal, debFileName } from "../src/manager/PlatformModal.js";
import type { Loadable } from "../src/manager/useLoadable.js";
import { UP_TO_DATE, platformInfo } from "./platform-fixtures.js";

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement("div");
  document.body.replaceChildren(root);
});

afterEach(() => {
  render(null, root);
  vi.useRealTimers();
});

/** Nur die Aufrufe des Popups; die übrigen werfen */
function platformClient(overrides: Partial<ManagerClient> = {}): ManagerClient {
  const unused = () => Promise.reject(new Error("nicht erwartet"));
  return {
    listAddons: unused,
    getSession: unused,
    installAddon: unused,
    listCatalog: unused,
    installFromCatalog: unused,
    setAddonEnabled: unused,
    saveAddonSettings: unused,
    uninstallAddon: unused,
    login: unused,
    getPlatform: vi.fn(() => Promise.resolve(platformInfo())),
    getHealth: vi.fn(() => Promise.resolve({ status: "ok", version: "2.1.0" })),
    startPlatformUpdate: vi.fn(() => Promise.resolve({ id: "own" })),
    ...overrides,
  };
}

const ready = (value: PlatformInfo): Loadable<PlatformInfo | null> => ({ kind: "ready", value });

async function mount(
  platform: Loadable<PlatformInfo | null>,
  checking = false,
  locale = "de",
  client = platformClient(),
) {
  const props = {
    onRefresh: vi.fn(),
    onClose: vi.fn(),
    reload: vi.fn(),
    onUnauthorized: vi.fn(),
    client,
  };
  await act(() => {
    render(
      <PlatformModal locale={locale} platform={platform} checking={checking} {...props} />,
      root,
    );
  });
  return props;
}

const q = (testId: string) => root.querySelector<HTMLElement>(`[data-testid="${testId}"]`);

describe("PlatformModal", () => {
  it("zeigt Versionen, Datum, Versionshinweise und den manuellen Weg", async () => {
    await mount(ready(platformInfo()));
    expect(q("platform-modal")?.getAttribute("aria-labelledby")).toBe("addons-platform-title");
    expect(q("platform-current")?.textContent).toBe("v2.1.0");
    expect(q("platform-latest")?.textContent).toBe("v2.2.0");
    expect(q("platform-modal")?.textContent).toContain("(veröffentlicht am 12.11.2026)");
    const notes = q("platform-notes") as HTMLAnchorElement;
    expect(notes.textContent).toBe("Versionshinweise auf GitHub ↗");
    expect(notes.href).toBe("https://github.com/m75r/evcc-addons/releases/tag/v2.2.0");
    expect(notes.target).toBe("_blank");
    expect(notes.rel).toBe("noopener");
    expect(q("platform-manual")?.textContent).toContain(
      "Automatische Installation ist hier nicht verfügbar.",
    );
    const download = q("platform-download") as HTMLAnchorElement;
    expect(download.textContent).toBe("Paket herunterladen ↗");
    expect(download.href).toMatch(/evcc-addons_2\.2\.0_all\.deb$/);
    expect(q("platform-manual")?.textContent).toContain("und auf dem Pi installieren:");
    expect(q("platform-command")?.textContent).toBe("sudo apt install ./evcc-addons_2.2.0_all.deb");
  });

  it("zeigt ohne downloadUrl Versionshinweise und Befehl, aber keinen Download-Link", async () => {
    const info = platformInfo();
    await mount(ready({ ...info, latest: { ...info.latest!, downloadUrl: null } }));
    expect(q("platform-notes")).not.toBeNull();
    expect(q("platform-download")).toBeNull();
    expect(q("platform-command")?.textContent).toBe("sudo apt install ./evcc-addons_2.2.0_all.deb");
  });

  it("zeigt „ist aktuell“ ohne neuere Version", async () => {
    await mount(ready(UP_TO_DATE));
    expect(q("platform-up-to-date")?.textContent).toBe("evcc-addons ist aktuell (v2.1.0).");
    expect(q("platform-manual")).toBeNull();
  });

  it("übersetzt einen checkError", async () => {
    const checkError = { code: "release-invalid", message: "tag_name fehlt" };
    await mount(ready(platformInfo({ latest: null, updateAvailable: false, checkError })));
    expect(q("platform-check-error")?.textContent).toBe(
      "Prüfung fehlgeschlagen: Die Antwort von GitHub ist ungültig: tag_name fehlt",
    );
  });

  it("zeigt einen Fehler beim Laden", async () => {
    const error = new ApiError(403, "demo-mode", "evcc läuft im Demo-Modus");
    await mount({ kind: "error", message: error.message, error });
    expect(q("platform-check-error")?.textContent).toBe(
      "Prüfung fehlgeschlagen: evcc läuft im Demo-Modus",
    );
  });

  it("zeigt „Wird geprüft …“ beim Laden und während einer Prüfung", async () => {
    await mount({ kind: "loading" });
    expect(q("platform-checking")?.textContent).toBe("Wird geprüft …");
    render(null, root);
    await mount(ready(platformInfo()), true);
    expect(q("platform-checking")).not.toBeNull();
    expect(q("platform-manual")).toBeNull();
    expect((q("platform-check") as HTMLButtonElement).disabled).toBe(true);
  });

  it("„Jetzt prüfen“ ruft onRefresh, ✕ ruft onClose auf", async () => {
    const props = await mount(ready(platformInfo()));
    await act(() => q("platform-check")?.click());
    expect(props.onRefresh).toHaveBeenCalledOnce();
    await act(() => q("platform-close")?.click());
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("ist auf Englisch übersetzt", async () => {
    await mount(ready(UP_TO_DATE), false, "en");
    expect(q("platform-modal")?.querySelector(".modal-title")?.textContent).toBe(
      "Update evcc-addons",
    );
    expect(q("platform-up-to-date")?.textContent).toBe("evcc-addons is up to date (v2.1.0).");
    expect(q("platform-check")?.textContent).toBe("Check now");
  });
});

describe("debFileName", () => {
  it("schreibt Vorabversionen in Debian-Schreibweise wie nfpm", () => {
    expect(debFileName("2.2.0")).toBe("evcc-addons_2.2.0_all.deb");
    expect(debFileName("2.2.0-rc.1")).toBe("evcc-addons_2.2.0~rc.1_all.deb");
  });
});

/** Wartet Mikrotasks ab (ohne Timer, damit Fake-Timer funktionieren) */
async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

async function advance(ms: number): Promise<void> {
  await act(() => void vi.advanceTimersByTime(ms));
  await flush();
}

describe("PlatformModal: Installation", () => {
  const INSTALLABLE = platformInfo({ canInstall: true });

  function status(state: UpdateStatus["state"], id = "own", message?: string): PlatformInfo {
    const update = { id, state, version: "2.2.0", at: "2026-11-10T10:00:00Z", message };
    return { ...INSTALLABLE, update };
  }

  /** Popup mit installierbarem Release; getPlatform liefert `current()` */
  async function startUpdate(overrides: Partial<ManagerClient> = {}) {
    const client = platformClient(overrides);
    const props = await mount(ready(INSTALLABLE), false, "de", client);
    vi.useFakeTimers();
    await act(() => q("platform-update")?.click());
    await flush();
    return { client, props };
  }

  const progress = () => q("platform-progress")?.textContent;

  it("zeigt den Button nur bei canInstall, dann statt des manuellen Wegs den Hinweis", async () => {
    await mount(ready(platformInfo()));
    expect(q("platform-update")).toBeNull();
    render(null, root);
    await mount(ready(INSTALLABLE));
    expect(q("platform-update")?.textContent).toBe("Aktualisieren");
    expect(q("platform-update")?.classList.contains("btn-primary")).toBe(true);
    expect(q("platform-restart-hint")?.textContent).toBe(
      "Der Dienst startet während der Installation neu, die Seite lädt danach automatisch neu.",
    );
    expect(q("platform-manual")).toBeNull();
    render(null, root);
    const info = platformInfo({ canInstall: true });
    await mount(ready({ ...info, latest: { ...info.latest!, downloadUrl: null } }));
    expect(q("platform-update")).toBeNull();
    expect(q("platform-manual")).not.toBeNull();
  });

  it("startet und zeigt nacheinander gestartet, heruntergeladen, installiert", async () => {
    let current = INSTALLABLE;
    const { client } = await startUpdate({ getPlatform: vi.fn(() => Promise.resolve(current)) });
    expect(client.startPlatformUpdate).toHaveBeenCalledWith("2.2.0");
    expect(progress()).toBe("Aktualisierung wird gestartet …");
    expect(q("platform-progress")?.querySelector(".spinner-border")).not.toBeNull();
    expect((q("platform-update") as HTMLButtonElement).disabled).toBe(true);
    expect((q("platform-check") as HTMLButtonElement).disabled).toBe(true);
    await advance(2000);
    expect(progress()).toBe("Aktualisierung wird gestartet …");
    current = status("downloading");
    await advance(2000);
    expect(progress()).toBe("v2.2.0 wird heruntergeladen …");
    current = status("installing");
    await advance(2000);
    expect(progress()).toBe("v2.2.0 wird installiert …");
    current = status("done");
    await advance(2000);
    expect(progress()).toBe("Dienst startet neu …");
  });

  it("zeigt bei nicht erreichbarem Proxy „Dienst startet neu …“", async () => {
    const network = new ApiError(0, "network", "Addon-Proxy nicht erreichbar");
    await startUpdate({ getHealth: vi.fn(() => Promise.reject(network)) });
    await advance(2000);
    expect(progress()).toBe("Dienst startet neu …");
  });

  it("lädt neu, sobald health die neue Version meldet", async () => {
    let version = "2.1.0";
    const { props } = await startUpdate({
      getHealth: vi.fn(() => Promise.resolve({ status: "ok", version })),
    });
    await advance(2000);
    expect(props.reload).not.toHaveBeenCalled();
    version = "2.2.0";
    await advance(2000);
    expect(props.reload).toHaveBeenCalledOnce();
    await advance(10_000);
    expect(props.reload).toHaveBeenCalledOnce();
  });

  it("ignoriert einen Fehler eines fremden Laufs und zeigt den eigenen mit Journal-Hinweis", async () => {
    let current = status("failed", "alt", "alter Fehler");
    await startUpdate({ getPlatform: vi.fn(() => Promise.resolve(current)) });
    await advance(2000);
    expect(q("platform-failed")).toBeNull();
    expect(progress()).toBe("Aktualisierung wird gestartet …");
    current = status("failed", "own", "Prüfsumme von evcc-addons_2.2.0_all.deb stimmt nicht");
    await advance(2000);
    expect(q("platform-failed")?.textContent).toBe(
      "Aktualisierung fehlgeschlagen: Prüfsumme von evcc-addons_2.2.0_all.deb stimmt nicht" +
        "Details: journalctl -u evcc-addons-update",
    );
    expect(q("platform-progress")).toBeNull();
    expect((q("platform-update") as HTMLButtonElement).disabled).toBe(false);
    expect((q("platform-check") as HTMLButtonElement).disabled).toBe(false);
  });

  it("meldet nach 5 min ohne neue Version einen Timeout", async () => {
    await startUpdate();
    await advance(298_000);
    expect(q("platform-failed")).toBeNull();
    await advance(2000);
    expect(q("platform-failed")?.textContent).toBe(
      "Die Aktualisierung dauert ungewöhnlich lange.Details: journalctl -u evcc-addons-update",
    );
  });

  it("sperrt ✕, Escape und Hintergrund während der Installation", async () => {
    const { props } = await startUpdate();
    await act(() => q("platform-close")?.click());
    await act(
      () =>
        void q("platform-modal")?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        ),
    );
    await act(() => q("platform-modal")?.click());
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("zeigt „Es läuft bereits eine Aktualisierung.“ bei 409 update-running", async () => {
    const running = new ApiError(409, "update-running", "Es läuft bereits eine Aktualisierung");
    const { props } = await startUpdate({
      startPlatformUpdate: vi.fn(() => Promise.reject(running)),
    });
    expect(q("platform-failed")?.textContent).toContain("Es läuft bereits eine Aktualisierung.");
    await act(() => q("platform-close")?.click());
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("meldet 401 beim Start über onUnauthorized", async () => {
    const unauthorized = new ApiError(401, "login-required", "Bitte anmelden");
    const { props } = await startUpdate({
      startPlatformUpdate: vi.fn(() => Promise.reject(unauthorized)),
    });
    expect(props.onUnauthorized).toHaveBeenCalledOnce();
  });
});
