import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagerDialogContext, ManagerDialogDef, SettingValues } from "@evcc-addons/sdk";
import {
  ApiError,
  type AddonInfo,
  type ManagerClient,
  type Session,
} from "../src/addons-client.js";
import { ManagerDialogRegistry } from "../src/manager/dialogs.js";
import { ManagerPage } from "../src/manager/ManagerPage.js";

const ADDON: AddonInfo = {
  id: "hello",
  name: { de: "Hallo Welt", en: "Hello World" },
  version: "0.1.0",
  description: "Beispiel",
  entry: "index.js",
  apiVersion: 1,
  hasServer: false,
  hasData: false,
  enabled: true,
  error: null,
  settings: [],
  settingValues: {},
};

const WITH_SETTINGS: AddonInfo = {
  ...ADDON,
  settings: [
    { key: "showPv", type: "boolean", label: { de: "PV anzeigen", en: "Show PV" }, default: true },
    {
      key: "sort",
      type: "select",
      label: "Sortierung",
      default: "a",
      options: [
        { value: "a", label: { de: "Name A–Z", en: "Name A–Z" } },
        { value: "b", label: "Name Z–A" },
      ],
    },
  ],
  settingValues: { showPv: false, sort: "b" },
};

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement("div");
  document.body.replaceChildren(root);
});

afterEach(() => render(null, root));

function fakeClient(session: Session, overrides: Partial<ManagerClient> = {}): ManagerClient {
  return {
    listAddons: vi.fn(() => Promise.resolve([ADDON])),
    getSession: vi.fn(() => Promise.resolve(session)),
    installAddon: vi.fn(() => Promise.resolve({ addon: ADDON, previousVersion: null })),
    setAddonEnabled: vi.fn(() => Promise.resolve(ADDON)),
    saveAddonSettings: vi.fn((_id: string, values: SettingValues) =>
      Promise.resolve({ ...WITH_SETTINGS, settingValues: { ...values } }),
    ),
    uninstallAddon: vi.fn(() => Promise.resolve()),
    login: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

async function mount(
  client: ManagerClient,
  version: string | null = null,
  confirm: (message: string) => boolean = () => true,
  dialogs = new ManagerDialogRegistry(),
) {
  const reload = vi.fn();
  const onSettingsSaved = vi.fn();
  await act(async () => {
    render(
      <ManagerPage
        locale="de"
        coreErrors={[]}
        client={client}
        whenLoaded={Promise.resolve()}
        reload={reload}
        confirm={confirm}
        onSettingsSaved={onSettingsSaved}
        version={version}
        dialogs={dialogs}
      />,
      root,
    );
    await Promise.resolve();
  });
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  return { reload, onSettingsSaved };
}

const q = (testId: string) => root.querySelector<HTMLElement>(`[data-testid="${testId}"]`);

async function upload(error: ApiError) {
  const client = fakeClient(
    { canManage: true, reason: null },
    {
      installAddon: vi.fn(() => Promise.reject(error)),
    },
  );
  await mount(client);
  await act(() => q("addons-new")?.click());
  const input = q("addons-install-file") as HTMLInputElement;
  const file = new File(["x"], "a.zip");
  Object.defineProperty(input, "files", { value: [file] });
  await act(() => void input.dispatchEvent(new Event("change", { bubbles: true })));
  await act(async () => {
    q("addons-install")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return client;
}

describe("ManagerPage", () => {
  it("zeigt bei canManage „+ Neu“, Schalter und Deinstallieren", async () => {
    await mount(fakeClient({ canManage: true, reason: null }));
    expect(q("addons-new")?.textContent).toBe("Neu");
    expect(q("addons-new")?.querySelector("svg")).not.toBeNull();
    expect(q("addons-install")).toBeNull();
    expect(q("addons-subtitle")?.textContent).toContain("Addons erweitern evcc");
    expect(q("addons-login")).toBeNull();
    expect((q("addon-toggle") as HTMLInputElement).disabled).toBe(false);
    expect(q("addon-uninstall")).not.toBeNull();
  });

  it("„+ Neu“ blendet den Subtext aus und das Installieren ein, erneut wieder zurück", async () => {
    await mount(fakeClient({ canManage: true, reason: null }));
    const button = q("addons-new") as HTMLButtonElement;
    expect(button.getAttribute("aria-expanded")).toBe("false");
    await act(() => button.click());
    expect(q("addons-install")).not.toBeNull();
    expect(q("addons-subtitle")).toBeNull();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    await act(() => button.click());
    expect(q("addons-install")).toBeNull();
    expect(q("addons-subtitle")).not.toBeNull();
  });

  it("zeigt ohne Login das Anmeldefeld und deaktivierte Schalter", async () => {
    await mount(fakeClient({ canManage: false, reason: "login-required" }));
    expect(q("addons-login")).not.toBeNull();
    expect(q("addons-install")).toBeNull();
    expect(q("addons-new")).toBeNull();
    expect(q("addons-subtitle")).not.toBeNull();
    expect((q("addon-toggle") as HTMLInputElement).disabled).toBe(true);
    expect(q("addon-uninstall")).toBeNull();
  });

  it.each([
    ["admin-password-missing", "Bitte in evcc ein Admin-Passwort setzen."],
    ["demo-mode", "evcc läuft im Demo-Modus, Addons lassen sich nicht verwalten."],
    ["evcc-unreachable", "evcc ist nicht erreichbar, Addons lassen sich gerade nicht verwalten."],
  ] as const)("zeigt den Hinweis für %s", async (reason, text) => {
    await mount(fakeClient({ canManage: false, reason }));
    expect(q("addons-session-hint")?.textContent).toBe(text);
    expect(q("addons-login")).toBeNull();
  });

  it.each([
    ["zip-slip", "Das Paket enthält unzulässige Dateipfade."],
    ["too-large", "Das Paket ist zu groß (höchstens 10 MB)."],
    ["too-many-files", "Das Paket enthält zu viele Dateien (höchstens 500)."],
    ["manifest-missing", "Im Paket fehlt die Datei addon.json."],
    ["manifest-invalid", "addon.json ist ungültig: Detail"],
    ["entry-missing", "Die Einstiegsdatei aus addon.json fehlt im Paket."],
    ["id-invalid", "Die id in addon.json ist ungültig."],
    ["version-invalid", "Die Version in addon.json ist ungültig (x.y.z)."],
    ["api-version-unsupported", "Das Addon benötigt eine neuere Addon-API."],
    ["zip-invalid", "Die Datei ist keine gültige ZIP-Datei."],
  ])("übersetzt den Fehlercode %s", async (code, text) => {
    await upload(new ApiError(400, code, "Detail"));
    expect(q("addons-install-error")?.textContent).toBe(text);
  });

  it("wechselt bei 401 einer Aktion zum Anmeldefeld", async () => {
    await upload(new ApiError(401, "login-required", "Bitte anmelden"));
    expect(q("addons-login")).not.toBeNull();
    expect(q("addons-install")).toBeNull();
  });

  it("zeigt „Passwort falsch“ und lädt nach erfolgreichem Login neu", async () => {
    const login = vi.fn((password: string) =>
      password === "richtig"
        ? Promise.resolve()
        : Promise.reject(new ApiError(401, "wrong-password", "x")),
    );
    const { reload } = await mount(
      fakeClient({ canManage: false, reason: "login-required" }, { login }),
    );
    const input = root.querySelector<HTMLInputElement>(
      'input[type="password"]',
    ) as HTMLInputElement;
    const submit = async (value: string) => {
      await act(() => {
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => {
        q("addons-login")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    };
    await submit("falsch");
    expect(q("addons-login-error")?.textContent).toBe("Passwort falsch");
    expect(reload).not.toHaveBeenCalled();
    await submit("richtig");
    expect(reload).toHaveBeenCalledOnce();
  });

  it("schaltet ein Addon um und lädt neu", async () => {
    const client = fakeClient({ canManage: true, reason: null });
    const { reload } = await mount(client);
    await act(async () => {
      (q("addon-toggle") as HTMLInputElement).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(client.setAddonEnabled).toHaveBeenCalledWith("hello", false);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("zeigt den Fehler einer Aktion auf der Karte", async () => {
    const client = fakeClient(
      { canManage: true, reason: null },
      { uninstallAddon: vi.fn(() => Promise.reject(new ApiError(500, "internal", "Platte voll"))) },
    );
    await mount(client);
    await act(async () => {
      q("addon-uninstall")?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(q("addon-action-error")?.textContent).toBe("Aktion fehlgeschlagen: Platte voll");
  });

  it.each([
    [false, "Hallo Welt wirklich deinstallieren?"],
    [true, "Hallo Welt wirklich deinstallieren? Gespeicherte Daten des Addons werden gelöscht."],
  ])("fragt vor dem Deinstallieren nach (hasData %s)", async (hasData, message) => {
    const client = fakeClient(
      { canManage: true, reason: null },
      { listAddons: vi.fn(() => Promise.resolve([{ ...ADDON, hasData }])) },
    );
    const confirm = vi.fn(() => false);
    await mount(client, null, confirm);
    await act(() => q("addon-uninstall")?.click());
    expect(confirm).toHaveBeenCalledWith(message);
    expect(client.uninstallAddon).not.toHaveBeenCalled();
  });

  it("zeigt die Version neben dem Titel, nur wenn sie bekannt ist", async () => {
    await mount(fakeClient({ canManage: true, reason: null }), "1.2.3");
    expect(q("addons-version")?.textContent).toBe("v1.2.3");
    render(null, root);
    await mount(fakeClient({ canManage: true, reason: null }), null);
    expect(q("addons-version")).toBeNull();
  });
});

const ADMIN: Session = { canManage: true, reason: null };

function settingsClient(session: Session = ADMIN, overrides: Partial<ManagerClient> = {}) {
  return fakeClient(session, {
    listAddons: vi.fn(() => Promise.resolve([WITH_SETTINGS])),
    ...overrides,
  });
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const field = <T extends HTMLElement>(key: string) => q(`addon-setting-${key}`) as T;

async function openSettings() {
  await act(() => q("addon-settings")?.click());
}

async function clickSave() {
  await act(async () => {
    q("addon-settings-save")?.click();
    await tick();
  });
}

async function editSettings() {
  await act(() => field<HTMLInputElement>("showPv").click());
  await act(() => {
    const select = field<HTMLSelectElement>("sort");
    select.value = "a";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("ManagerPage: Einstellungen", () => {
  it("zeigt ohne Schema keinen Einstellungs-Button", async () => {
    await mount(fakeClient(ADMIN));
    expect(q("addon-settings")).toBeNull();
  });

  it("öffnet das Modal mit den aktuellen Werten", async () => {
    await mount(settingsClient());
    await openSettings();
    expect(q("addon-settings-modal")?.textContent).toContain("Einstellungen Hallo Welt");
    expect(field<HTMLInputElement>("showPv").checked).toBe(false);
    expect(field<HTMLSelectElement>("sort").value).toBe("b");
    expect(root.textContent).toContain("PV anzeigen");
    expect(field<HTMLInputElement>("showPv").disabled).toBe(false);
  });

  it("speichert ohne Neuladen und meldet das zurückgegebene DTO", async () => {
    const client = settingsClient();
    const { reload, onSettingsSaved } = await mount(client);
    await openSettings();
    await editSettings();
    await clickSave();
    expect(client.saveAddonSettings).toHaveBeenCalledWith("hello", { showPv: true, sort: "a" });
    expect(q("addon-settings-modal")).toBeNull();
    expect(reload).not.toHaveBeenCalled();
    expect(onSettingsSaved).toHaveBeenCalledWith({
      ...WITH_SETTINGS,
      settingValues: { showPv: true, sort: "a" },
    });
    await openSettings();
    expect(field<HTMLInputElement>("showPv").checked).toBe(true);
  });

  it.each([
    [new ApiError(500, "internal", "Platte voll"), "Speichern fehlgeschlagen: Platte voll"],
    [
      new ApiError(400, "settings-invalid", 'sort: unbekannte Option "foo"'),
      'Speichern fehlgeschlagen: Ungültiger Wert für sort: unbekannte Option "foo"',
    ],
    [new ApiError(413, "too-large", "zu groß"), "Die Einstellungen sind zu groß (höchstens 4 KB)."],
  ])("zeigt den Fehler %s im offenen Modal", async (error, text) => {
    const { onSettingsSaved } = await mount(
      settingsClient(ADMIN, { saveAddonSettings: vi.fn(() => Promise.reject(error)) }),
    );
    await openSettings();
    await clickSave();
    expect(q("addon-settings-error")?.textContent).toBe(`⚠ ${text}`);
    expect(q("addon-settings-modal")).not.toBeNull();
    expect(onSettingsSaved).not.toHaveBeenCalled();
  });

  it("schließt bei 401 und zeigt das Login-Formular", async () => {
    const unauthorized = new ApiError(401, "login-required", "Bitte anmelden");
    await mount(
      settingsClient(ADMIN, { saveAddonSettings: vi.fn(() => Promise.reject(unauthorized)) }),
    );
    await openSettings();
    await clickSave();
    expect(q("addon-settings-modal")).toBeNull();
    expect(q("addons-login")).not.toBeNull();
  });

  it("ist ohne Login schreibgeschützt", async () => {
    await mount(settingsClient({ canManage: false, reason: "login-required" }));
    await openSettings();
    expect(field<HTMLInputElement>("showPv").disabled).toBe(true);
    expect(field<HTMLSelectElement>("sort").disabled).toBe(true);
    expect(q("addon-settings-readonly")?.textContent).toBe("Zum Ändern in evcc anmelden.");
    expect(q("addon-settings-save")).toBeNull();
    expect(q("addon-settings-cancel")?.textContent).toBe("Schließen");
  });

  it("zeigt im Demo-Modus den passenden Hinweis", async () => {
    await mount(settingsClient({ canManage: false, reason: "demo-mode" }));
    await openSettings();
    expect(q("addon-settings-readonly")?.textContent).toBe(
      "evcc läuft im Demo-Modus, Addons lassen sich nicht verwalten.",
    );
  });

  it.each([
    [
      "Esc",
      () =>
        q("addon-settings-modal")?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        ),
    ],
    ["✕", () => q("addon-settings-close")?.click()],
    ["Abbrechen", () => q("addon-settings-cancel")?.click()],
    ["Backdrop", () => q("addon-settings-modal")?.click()],
  ])("schließt per %s ohne Speichern", async (_label, close) => {
    const client = settingsClient();
    await mount(client);
    await openSettings();
    await act(() => void close());
    expect(q("addon-settings-modal")).toBeNull();
    expect(client.saveAddonSettings).not.toHaveBeenCalled();
  });

  it("schließt nicht bei Klick in den Dialog", async () => {
    await mount(settingsClient());
    await openSettings();
    await act(() => root.querySelector<HTMLElement>(".modal-content")?.click());
    expect(q("addon-settings-modal")).not.toBeNull();
  });

  it("setzt body.modal-open und entfernt es wieder", async () => {
    await mount(settingsClient());
    await openSettings();
    expect(document.body.classList.contains("modal-open")).toBe(true);
    expect(document.activeElement).toBe(q("addon-settings-modal"));
    await act(() => q("addon-settings-close")?.click());
    expect(document.body.classList.contains("modal-open")).toBe(false);
  });
});

describe("ManagerPage: Dialoge der Addons", () => {
  function registry(mount: ManagerDialogDef["mount"], onError = vi.fn()) {
    const dialogs = new ManagerDialogRegistry();
    const icon = '<svg data-testid="dialog-icon"></svg>';
    dialogs.add(
      "hello",
      { label: "Steckdosen", title: { de: "Dialog", en: "Dialog" }, icon, mount },
      onError,
    );
    return dialogs;
  }

  async function open(dialogs: ManagerDialogRegistry, session: Session) {
    await mount(fakeClient(session), null, () => true, dialogs);
    await act(() => q("addon-dialog-0")?.click());
  }

  it("zeigt den Button nur bei registriertem Dialog und aktivem Addon", async () => {
    await mount(fakeClient({ canManage: true, reason: null }));
    expect(q("addon-dialog-0")).toBeNull();
    render(null, root);
    await mount(fakeClient({ canManage: true, reason: null }), null, () => true, registry(vi.fn()));
    const button = q("addon-dialog-0");
    expect(button?.getAttribute("aria-label")).toBe("Steckdosen");
    expect(button?.querySelector('[data-testid="dialog-icon"]')).not.toBeNull();
    render(null, root);
    const disabled = fakeClient(
      { canManage: true, reason: null },
      { listAddons: vi.fn(() => Promise.resolve([{ ...ADDON, enabled: false }])) },
    );
    await mount(disabled, null, () => true, registry(vi.fn()));
    expect(q("addon-dialog-0")).toBeNull();
  });

  it("öffnet das Modal mit Titel und übergibt canManage an mount", async () => {
    const mountDialog = vi.fn((el: HTMLElement, ctx: ManagerDialogContext) => {
      el.innerHTML = `<p data-testid="inhalt">canManage=${String(ctx.canManage)}</p>`;
    });
    await open(registry(mountDialog), { canManage: false, reason: "login-required" });
    expect(q("addon-dialog-modal")?.querySelector(".modal-title")?.textContent).toBe("Dialog");
    expect(q("addon-dialog-modal")?.querySelector(".modal-lg")).not.toBeNull();
    expect(q("inhalt")?.textContent).toBe("canManage=false");
    expect(mountDialog.mock.calls[0][1].locale).toBe("de");
  });

  it("ruft beim Schließen mit ✕ das Aufräumen auf", async () => {
    const cleanup = vi.fn();
    await open(
      registry(() => cleanup),
      { canManage: true, reason: null },
    );
    await act(() => q("addon-dialog-close")?.click());
    expect(cleanup).toHaveBeenCalledOnce();
    expect(q("addon-dialog-modal")).toBeNull();
  });

  it("schließt bei onUnauthorized und zeigt das Anmeldefeld", async () => {
    let ctx: ManagerDialogContext | undefined;
    await open(
      registry((_el, context) => void (ctx = context)),
      { canManage: true, reason: null },
    );
    expect(q("addons-login")).toBeNull();
    await act(() => ctx?.onUnauthorized());
    expect(q("addon-dialog-modal")).toBeNull();
    expect(q("addons-login")).not.toBeNull();
  });

  it("zeigt einen Fehler in mount im Dialog und meldet ihn an onError", async () => {
    const onError = vi.fn();
    const failing = () => {
      throw new Error("kaputt");
    };
    await open(registry(failing, onError), { canManage: true, reason: null });
    expect(q("addon-dialog-error")?.textContent).toBe(
      "⚠ Der Dialog konnte nicht angezeigt werden: Error: kaputt",
    );
    expect(onError).toHaveBeenCalledWith(new Error("kaputt"));
  });
});
