import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  type AddonInfo,
  type CatalogEntry,
  type InstallResponse,
  type ManagerClient,
} from "../src/addons-client.js";
import { UP_TO_DATE } from "./platform-fixtures.js";
import { CatalogModal } from "../src/manager/CatalogModal.js";

const ADDON: AddonInfo = {
  id: "tapo",
  name: "Tapo-Steckdosen",
  version: "1.1.0",
  description: null,
  entry: "index.js",
  apiVersion: 2,
  hasServer: true,
  hasData: false,
  enabled: true,
  error: null,
  settings: [],
  settingValues: {},
};

function entry(id: string, name: string, overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id,
    name: { de: name, en: `${name} (en)` },
    description: { de: `Beschreibung ${name}`, en: "Description" },
    version: "1.0.0",
    apiVersion: 2,
    status: "available",
    installedVersion: null,
    ...overrides,
  };
}

/** ids absichtlich in anderer Reihenfolge als die Namen */
const CATALOG: CatalogEntry[] = [
  entry("future", "Zukunft", { status: "incompatible", apiVersion: 99 }),
  entry("consumers", "Verbraucher", {
    version: "2.0.0",
    status: "installed",
    installedVersion: "2.0.0",
  }),
  entry("tapo", "Tapo-Steckdosen", {
    version: "1.1.0",
    status: "update",
    installedVersion: "1.0.0",
  }),
  entry("zz-beta", "Beta-Addon", { status: "newer-installed", installedVersion: "1.2.0" }),
  entry("hello", "Hallo Welt"),
];

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement("div");
  document.body.replaceChildren(root);
});

afterEach(() => {
  render(null, root);
  vi.useRealTimers();
});

function fakeClient(overrides: Partial<ManagerClient> = {}): ManagerClient {
  const installed: InstallResponse = { addon: ADDON, previousVersion: "1.0.0" };
  return {
    listAddons: vi.fn(() => Promise.resolve([])),
    getSession: vi.fn(() => Promise.resolve({ canManage: true, reason: null })),
    installAddon: vi.fn(() => Promise.resolve(installed)),
    listCatalog: vi.fn(() => Promise.resolve(CATALOG)),
    installFromCatalog: vi.fn(() => Promise.resolve(installed)),
    setAddonEnabled: vi.fn(() => Promise.resolve(ADDON)),
    saveAddonSettings: vi.fn(() => Promise.resolve(ADDON)),
    uninstallAddon: vi.fn(() => Promise.resolve()),
    login: vi.fn(() => Promise.resolve()),
    getPlatform: vi.fn(() => Promise.resolve(UP_TO_DATE)),
    getHealth: vi.fn(() => Promise.resolve({ status: "ok", version: "2.1.0" })),
    startPlatformUpdate: vi.fn(() => Promise.resolve({ id: "0123456789abcdef" })),
    ...overrides,
  };
}

/** Wartet Mikrotasks ab (ohne Timer, damit Fake-Timer funktionieren) */
async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

async function mount(client: ManagerClient) {
  const props = { reload: vi.fn(), onUnauthorized: vi.fn(), onClose: vi.fn() };
  await act(() => {
    render(<CatalogModal locale="de" client={client} {...props} />, root);
  });
  await flush();
  return props;
}

const q = (testId: string, scope: ParentNode = root) =>
  scope.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
const item = (id: string) => q(`catalog-entry-${id}`) as HTMLElement;
const actions = () => [
  ...root.querySelectorAll<HTMLButtonElement>('[data-testid="catalog-action"]'),
];

async function click(element: HTMLElement | null) {
  await act(() => element?.click());
  await flush();
}

async function uploadFile() {
  await click(q("catalog-upload"));
  const input = q("addons-install-file") as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [new File(["x"], "a.zip")] });
  await act(() => void input.dispatchEvent(new Event("change", { bubbles: true })));
  await act(() => {
    q("addons-install")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await flush();
}

describe("CatalogModal", () => {
  it("zeigt den Ladezustand, dann die Einträge nach Namen sortiert", async () => {
    const list = deferred<CatalogEntry[]>();
    await mount(fakeClient({ listCatalog: () => list.promise }));
    expect(q("catalog-modal")?.querySelector(".modal-title")?.textContent).toBe("Addon hinzufügen");
    expect(q("catalog-modal")?.querySelector(".modal-dialog.modal-lg")).not.toBeNull();
    expect(q("catalog-loading")?.textContent).toBe("Katalog wird geladen …");
    list.resolve(CATALOG);
    await flush();
    const names = [...root.querySelectorAll(".evcc-addons-catalog-entry strong")];
    expect(names.map((el) => el.textContent)).toEqual([
      "Beta-Addon",
      "Hallo Welt",
      "Tapo-Steckdosen",
      "Verbraucher",
      "Zukunft",
    ]);
    expect(item("tapo").textContent).toContain("v1.1.0");
    expect(item("tapo").textContent).toContain("Beschreibung Tapo-Steckdosen");
  });

  it.each([
    ["hello", null, "Installieren", "btn-primary"],
    ["tapo", "Installiert: v1.0.0", "Aktualisieren", "btn-primary"],
    ["consumers", "✓ Installiert", "Neu installieren", "btn-outline-secondary"],
    ["zz-beta", "Installiert: v1.2.0", null, null],
    ["future", "Benötigt eine neuere Version von evcc-addons", null, null],
  ])("zeigt für %s Zustand %s und Button %s", async (id, status, label, style) => {
    await mount(fakeClient());
    expect(q("catalog-status", item(id))?.textContent ?? null).toBe(status);
    const button = q("catalog-action", item(id));
    expect(button?.textContent ?? null).toBe(label);
    if (style) expect(button?.classList.contains(style)).toBe(true);
  });

  it("zeigt den leeren Katalog", async () => {
    await mount(fakeClient({ listCatalog: () => Promise.resolve([]) }));
    expect(q("catalog-empty")?.textContent).toBe("Keine Addons im Katalog.");
  });

  it("sperrt beim Aktualisieren alle Buttons, meldet den Erfolg und lädt nach 1,5 s neu", async () => {
    const install = deferred<InstallResponse>();
    const client = fakeClient({ installFromCatalog: vi.fn(() => install.promise) });
    const props = await mount(client);
    vi.useFakeTimers();
    await click(q("catalog-action", item("tapo")));
    expect(client.installFromCatalog).toHaveBeenCalledWith("tapo");
    expect(actions().every((button) => button.disabled)).toBe(true);
    expect(q("catalog-action", item("tapo"))?.textContent).toBe("Wird installiert …");
    install.resolve({ addon: ADDON, previousVersion: "1.0.0" });
    await flush();
    expect(q("catalog-success", item("tapo"))?.textContent).toBe(
      "Aktualisiert von 1.0.0 auf 1.1.0",
    );
    expect(actions().every((button) => button.disabled)).toBe(true);
    vi.advanceTimersByTime(1499);
    expect(props.reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(props.reload).toHaveBeenCalledOnce();
  });

  it("zeigt einen Fehler im Eintrag und gibt die Buttons wieder frei", async () => {
    const error = new ApiError(502, "checksum-mismatch", "Prüfsumme stimmt nicht");
    await mount(fakeClient({ installFromCatalog: () => Promise.reject(error) }));
    await click(q("catalog-action", item("hello")));
    expect(q("catalog-error", item("hello"))?.textContent).toBe(
      "Die Prüfsumme des Downloads stimmt nicht mit dem Katalog überein.",
    );
    expect(actions().some((button) => button.disabled)).toBe(false);
    expect(q("catalog-action", item("hello"))?.textContent).toBe("Installieren");
  });

  it("schließt bei 401 der Katalog-Installation und meldet onUnauthorized", async () => {
    const error = new ApiError(401, "login-required", "Bitte anmelden");
    const props = await mount(fakeClient({ installFromCatalog: () => Promise.reject(error) }));
    await click(q("catalog-action", item("hello")));
    expect(props.onClose).toHaveBeenCalledOnce();
    expect(props.onUnauthorized).toHaveBeenCalledOnce();
  });

  it("schließt bei 401 des Uploads und meldet onUnauthorized", async () => {
    const error = new ApiError(401, "login-required", "Bitte anmelden");
    const props = await mount(fakeClient({ installAddon: () => Promise.reject(error) }));
    await uploadFile();
    expect(props.onClose).toHaveBeenCalledOnce();
    expect(props.onUnauthorized).toHaveBeenCalledOnce();
  });

  it("schließt mit ✕ und Escape, aber nicht während einer Installation", async () => {
    const install = deferred<InstallResponse>();
    const props = await mount(fakeClient({ installFromCatalog: () => install.promise }));
    const escape = () =>
      q("catalog-modal")?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    await click(q("catalog-close"));
    await act(() => void escape());
    expect(props.onClose).toHaveBeenCalledTimes(2);
    await click(q("catalog-action", item("hello")));
    await click(q("catalog-close"));
    await act(() => void escape());
    await click(q("catalog-modal"));
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it("zeigt einen Katalogfehler, der Upload bleibt nutzbar", async () => {
    const error = new ApiError(502, "catalog-unavailable", "Katalog nicht abrufbar: HTTP 404");
    const client = fakeClient({ listCatalog: () => Promise.reject(error) });
    await mount(client);
    expect(q("catalog-load-error")?.textContent).toBe(
      "Katalog nicht geladen: Katalog nicht abrufbar: HTTP 404",
    );
    await uploadFile();
    expect(client.installAddon).toHaveBeenCalledOnce();
    expect(q("addons-install-success")?.textContent).toBe("Aktualisiert von 1.0.0 auf 1.1.0");
  });

  it("[⇪] blendet den Upload ein und aus", async () => {
    await mount(fakeClient());
    const toggle = q("catalog-upload") as HTMLButtonElement;
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.getAttribute("aria-label")).toBe("Aus Datei installieren");
    expect(toggle.querySelector("svg")).not.toBeNull();
    expect(toggle.nextElementSibling?.classList.contains("btn-close")).toBe(true);
    expect(q("addons-install")).toBeNull();
    await click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(q("addons-install")?.textContent).toContain("Aus Datei installieren");
    await click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(q("addons-install")).toBeNull();
  });

  it("sperrt den Upload während einer Katalog-Installation", async () => {
    const install = deferred<InstallResponse>();
    await mount(fakeClient({ installFromCatalog: () => install.promise }));
    await click(q("catalog-upload"));
    await click(q("catalog-action", item("hello")));
    expect((q("addons-install-file") as HTMLInputElement).disabled).toBe(true);
    expect(q("addons-install")?.querySelector<HTMLButtonElement>("button")?.disabled).toBe(true);
  });

  it("sperrt die Katalog-Buttons und das Schließen während eines Uploads", async () => {
    const upload = deferred<InstallResponse>();
    const props = await mount(fakeClient({ installAddon: () => upload.promise }));
    await uploadFile();
    expect(actions().every((button) => button.disabled)).toBe(true);
    expect((q("catalog-upload") as HTMLButtonElement).disabled).toBe(true);
    await click(q("catalog-close"));
    expect(props.onClose).not.toHaveBeenCalled();
    upload.reject(new ApiError(400, "zip-invalid", "kaputt"));
    await flush();
    expect(actions().some((button) => button.disabled)).toBe(false);
  });
});
