import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  type AddonInfo,
  type ManagerClient,
  type Session,
} from "../src/addons-client.js";
import { ManagerPage } from "../src/manager/ManagerPage.js";

const ADDON: AddonInfo = {
  id: "hello",
  name: { de: "Hallo Welt", en: "Hello World" },
  version: "0.1.0",
  description: "Beispiel",
  entry: "index.js",
  enabled: true,
  error: null,
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
    uninstallAddon: vi.fn(() => Promise.resolve()),
    login: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

async function mount(client: ManagerClient, reload = vi.fn(), confirm = () => true) {
  await act(async () => {
    render(
      <ManagerPage
        locale="de"
        coreErrors={[]}
        client={client}
        whenLoaded={Promise.resolve()}
        reload={reload}
        confirm={confirm}
      />,
      root,
    );
    await Promise.resolve();
  });
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  return { reload };
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
  it("zeigt bei canManage Upload, Schalter und Deinstallieren", async () => {
    await mount(fakeClient({ canManage: true, reason: null }));
    expect(q("addons-install")).not.toBeNull();
    expect(q("addons-login")).toBeNull();
    expect((q("addon-toggle") as HTMLInputElement).disabled).toBe(false);
    expect(q("addon-uninstall")).not.toBeNull();
  });

  it("zeigt ohne Login das Anmeldefeld und deaktivierte Schalter", async () => {
    await mount(fakeClient({ canManage: false, reason: "login-required" }));
    expect(q("addons-login")).not.toBeNull();
    expect(q("addons-install")).toBeNull();
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
});
