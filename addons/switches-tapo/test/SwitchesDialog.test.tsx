import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  type SwitchClient,
  type SwitchInfo,
  type SwitchInput,
} from "../src/dialog/client.js";
import { HINT_KEY } from "../src/dialog/MigrationHint.js";
import { SwitchesDialog } from "../src/dialog/SwitchesDialog.js";
import { SwitchListStore } from "../src/switch-list.js";

const TOKEN = "ab".repeat(32);

const SWITCH: SwitchInfo = {
  id: "a1b2c3d4",
  name: "Dyson Luftreiniger",
  type: "tapo",
  target: { kind: "loadpoint", title: "Dyson (Wohnzimmer)" },
  targetFound: true,
  status: {
    reachable: true,
    on: true,
    power: 35.4,
    hasMeter: true,
    error: null,
    held: false,
    modeError: null,
    updatedAt: "2026-11-08T12:00:00.000Z",
  },
  host: "192.168.1.50",
  user: "ich@example.com",
  token: TOKEN,
};

const PUBLIC: SwitchInfo = { ...SWITCH, host: undefined, user: undefined, token: undefined };

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement("div");
  document.body.replaceChildren(root);
});

afterEach(() => render(null, root));

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const q = (testId: string) => root.querySelector<HTMLElement>(`[data-testid="${testId}"]`);

function fakeClient(list: SwitchInfo[], overrides: Partial<SwitchClient> = {}) {
  return {
    listSwitches: vi.fn(() => Promise.resolve(list)),
    createSwitch: vi.fn((input: SwitchInput) => Promise.resolve({ ...SWITCH, name: input.name })),
    updateSwitch: vi.fn(() => Promise.resolve(SWITCH)),
    deleteSwitch: vi.fn(() => Promise.resolve()),
    renewSwitchToken: vi.fn(() => Promise.resolve("cd".repeat(32))),
    setPower: vi.fn(() => Promise.resolve(true)),
    listEvccDevices: vi.fn(() =>
      Promise.resolve({
        loadpoints: ["Carport", "Dyson (Wohnzimmer)"],
        consumers: ["Kaffeemaschine", "Kühlschrank"],
      }),
    ),
    listDeviceHosts: vi.fn(() =>
      Promise.resolve({
        loadpoint: { "Dyson (Wohnzimmer)": "192.168.1.77" },
        consumer: { Kaffeemaschine: "192.168.1.51" },
      }),
    ),
    ...overrides,
  };
}

/** Speicher wie localStorage, nur im Test */
function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  } as Storage;
}

interface MountOptions {
  canManage?: boolean;
  confirm?: boolean;
  copy?: (text: string) => Promise<void>;
  storage?: Storage | null;
}

async function mount(client: SwitchClient, opts: MountOptions = {}) {
  const onUnauthorized = vi.fn();
  const copy = vi.fn(opts.copy ?? (() => Promise.resolve()));
  const settings = { get: () => "5", onChange: () => () => undefined };
  const store = new SwitchListStore({ load: () => client.listSwitches(), settings });
  await act(async () => {
    render(
      <SwitchesDialog
        locale="de"
        client={client}
        store={store}
        storage={opts.storage === undefined ? memoryStorage() : opts.storage}
        canManage={opts.canManage ?? true}
        confirm={() => opts.confirm ?? true}
        onUnauthorized={onUnauthorized}
        pageBase="http://evcc.local:7080/"
        copy={copy}
      />,
      root,
    );
    await tick();
  });
  return { onUnauthorized, copy };
}

async function click(testId: string) {
  await act(async () => {
    q(testId)?.click();
    await tick();
  });
}

async function type(testId: string, value: string) {
  await act(() => {
    const input = q(testId) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Wählt ein Gerät, z. B. „loadpoint:Carport“ oder „consumer:Kaffeemaschine“ */
async function choose(value: string) {
  await act(async () => {
    const select = q("switch-target") as HTMLSelectElement;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
  });
}

async function fillForm() {
  await choose("loadpoint:Carport");
  await type("switch-field-name", "Lampe");
  await type("switch-field-host", "192.168.1.60");
  await type("switch-field-user", "ich@example.com");
  await type("switch-field-password", "geheim");
}

describe("SwitchesDialog: Liste", () => {
  it("zeigt für Admins Status, Adresse, Ladepunkt und Aktionen", async () => {
    await mount(fakeClient([SWITCH]));
    expect(q("switch-card-a1b2c3d4")?.textContent).toContain("Dyson Luftreiniger");
    expect(q("switch-status")?.textContent).toBe("● an · 35 W");
    expect(q("switch-host")?.textContent).toBe("Tapo · 192.168.1.50");
    expect(q("switch-target")?.textContent).toContain("Ladepunkt „Dyson (Wohnzimmer)“");
    expect(q("switch-edit")).not.toBeNull();
    expect(q("switch-delete")).not.toBeNull();
    expect(q("switches-new")?.textContent).toBe("Steckdose");
    expect(q("switch-target-warning")).toBeNull();
  });

  it("zeigt ohne Admin nur Name, Status und Ladepunkt", async () => {
    await mount(fakeClient([PUBLIC]), { canManage: false });
    expect(q("switch-status")?.textContent).toBe("● an · 35 W");
    expect(q("switch-target")).not.toBeNull();
    for (const id of ["switch-host", "switch-edit", "switch-delete", "switch-yaml-toggle"]) {
      expect(q(id)).toBeNull();
    }
    expect(q("switches-new")).toBeNull();
  });

  it.each([
    [{ ...SWITCH.status, on: false, power: 0 }, "○ aus"],
    [{ ...SWITCH.status, power: null, hasMeter: false }, "● an"],
    [{ ...SWITCH.status, reachable: false, error: "Timeout" }, "nicht erreichbar: Timeout"],
    [{ ...SWITCH.status, reachable: null }, "Status wird gelesen …"],
  ])("zeigt den Status %j", async (status, text) => {
    await mount(fakeClient([{ ...SWITCH, status }]));
    expect(q("switch-status")?.textContent).toBe(text);
  });

  it("warnt bei fehlendem Ladepunkt und fehlgeschlagenem Modus", async () => {
    const status = { ...SWITCH.status, modeError: "Ladepunkt „X“ nicht gefunden" };
    await mount(fakeClient([{ ...SWITCH, targetFound: false, status }]));
    expect(q("switch-target-warning")?.textContent).toBe("⚠ Ladepunkt nicht gefunden");
    expect(q("switch-mode-warning")?.textContent).toBe(
      "⚠ Modus konnte nicht gesetzt werden: Ladepunkt „X“ nicht gefunden",
    );
  });

  it("zeigt den leeren Zustand und Ladefehler", async () => {
    await mount(fakeClient([]));
    expect(q("switches-empty")?.textContent).toContain("Noch keine Steckdosen.");
    render(null, root);
    const failing = fakeClient([], {
      listSwitches: vi.fn(() => Promise.reject(new ApiError(500, "internal", "kaputt"))),
    });
    await mount(failing);
    expect(q("switches-load-error")?.textContent).toBe(
      "Steckdosen konnten nicht geladen werden: kaputt",
    );
  });
});

describe("SwitchesDialog: Formular", () => {
  it("legt eine Steckdose an und lädt die Liste neu", async () => {
    const client = fakeClient([]);
    await mount(client);
    await click("switches-new");
    expect(q("switches")).toBeNull();
    expect(q("switch-form-title")?.textContent).toBe("Steckdose hinzufügen");
    const select = q("switch-target") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(select.options[0].textContent).toBe("– Gerät wählen –");
    const groups = [...select.querySelectorAll("optgroup")].map((group) => [
      group.label,
      [...group.querySelectorAll("option")].map((option) => option.textContent),
    ]);
    expect(groups).toEqual([
      ["Ladepunkte & Heizungen", ["Carport", "Dyson (Wohnzimmer)"]],
      ["Verbraucher", ["Kaffeemaschine", "Kühlschrank"]],
    ]);
    expect(q("switch-field-type")).toBeNull();
    await fillForm();
    await click("switch-form-save");
    expect(client.createSwitch).toHaveBeenCalledWith({
      name: "Lampe",
      type: "tapo",
      host: "192.168.1.60",
      user: "ich@example.com",
      password: "geheim",
      target: { kind: "loadpoint", title: "Carport" },
    });
    expect(q("switch-form")).toBeNull();
    expect(q("switches")).not.toBeNull();
    expect(client.listSwitches).toHaveBeenCalledTimes(2);
  });

  it("kehrt mit „Zurück“ ohne Speichern zur Liste zurück", async () => {
    const client = fakeClient([SWITCH]);
    await mount(client);
    await click("switches-new");
    await type("switch-field-name", "Verworfen");
    await click("switch-form-back");
    expect(q("switch-form")).toBeNull();
    expect(q("switch-card-a1b2c3d4")).not.toBeNull();
    expect(client.createSwitch).not.toHaveBeenCalled();
    expect(client.listSwitches).toHaveBeenCalledTimes(1);
  });

  it("stellt das Gerät an den Anfang und übernimmt Name und Adresse", async () => {
    await mount(fakeClient([]));
    await click("switches-new");
    const first = q("switch-form")?.querySelector("select, input");
    expect(first?.getAttribute("data-testid")).toBe("switch-target");
    await choose("loadpoint:Dyson (Wohnzimmer)");
    expect((q("switch-field-name") as HTMLInputElement).value).toBe("Dyson (Wohnzimmer)");
    expect((q("switch-field-host") as HTMLInputElement).value).toBe("192.168.1.77");
    expect(q("switch-host-unknown")).toBeNull();
  });

  it("weist auf eine unbekannte Adresse hin und lässt eine eingetragene stehen", async () => {
    const failing = vi.fn(() => Promise.reject(new ApiError(401, "evcc-error", "evcc: HTTP 401")));
    await mount(fakeClient([], { listDeviceHosts: failing }));
    await click("switches-new");
    await type("switch-field-host", "10.0.0.5");
    await choose("loadpoint:Carport");
    expect((q("switch-field-name") as HTMLInputElement).value).toBe("Carport");
    expect((q("switch-field-host") as HTMLInputElement).value).toBe("10.0.0.5");
    expect(q("switch-host-unknown")?.textContent).toBe(
      "Adresse nicht in der evcc-Konfiguration gefunden, bitte eintragen.",
    );
  });

  it("bleibt bei Verbindungsfehler im Formular, zurück erst mit „Zurück“", async () => {
    const unreachable = {
      ...SWITCH,
      status: { ...SWITCH.status, reachable: false, error: "Verbindung fehlgeschlagen (KLAP)" },
    };
    const client = fakeClient([], { createSwitch: vi.fn(() => Promise.resolve(unreachable)) });
    await mount(client);
    await click("switches-new");
    await fillForm();
    await click("switch-form-save");
    expect(q("switch-form-warning")?.textContent).toBe(
      "⚠ Gespeichert, aber die Verbindung schlug fehl: Verbindung fehlgeschlagen (KLAP)",
    );
    expect(q("switch-form-save")).toBeNull();
    expect(q("switch-form-back")?.textContent).toBe("Zurück");
    await click("switch-form-back");
    expect(q("switch-form")).toBeNull();
    expect(client.listSwitches).toHaveBeenCalledTimes(2);
  });

  it("zeigt Validierungsfehler im offenen Formular", async () => {
    const invalid = new ApiError(400, "switch-invalid", "Name fehlt");
    await mount(fakeClient([], { createSwitch: vi.fn(() => Promise.reject(invalid)) }));
    await click("switches-new");
    await click("switch-form-save");
    expect(q("switch-form-error")?.textContent).toBe("⚠ Speichern fehlgeschlagen: Name fehlt");
    expect(q("switch-form")).not.toBeNull();
  });

  it("verlässt das Formular bei 401 und meldet onUnauthorized", async () => {
    const unauthorized = new ApiError(401, "login-required", "Bitte anmelden");
    const { onUnauthorized } = await mount(
      fakeClient([], { createSwitch: vi.fn(() => Promise.reject(unauthorized)) }),
    );
    await click("switches-new");
    await click("switch-form-save");
    expect(q("switch-form")).toBeNull();
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("bearbeitet mit leerem Passwort und behält einen nicht gefundenen Ladepunkt", async () => {
    const missing = {
      ...SWITCH,
      target: { kind: "loadpoint" as const, title: "Alt" },
      targetFound: false,
    };
    const client = fakeClient([missing]);
    await mount(client);
    await click("switch-edit");
    expect(q("switch-form-title")?.textContent).toBe("Steckdose bearbeiten");
    expect((q("switch-field-host") as HTMLInputElement).value).toBe("192.168.1.50");
    const password = q("switch-field-password") as HTMLInputElement;
    expect(password.value).toBe("");
    expect(password.placeholder).toBe("leer = unverändert");
    const select = q("switch-target") as HTMLSelectElement;
    expect(select.value).toBe("loadpoint:Alt");
    const loadpoints = select.querySelector("optgroup") as HTMLOptGroupElement;
    expect(loadpoints.querySelector("option")?.textContent).toBe("Alt (nicht gefunden)");
    await click("switch-form-save");
    expect(client.updateSwitch).toHaveBeenCalledWith("a1b2c3d4", {
      name: "Dyson Luftreiniger",
      type: "tapo",
      host: "192.168.1.50",
      user: "ich@example.com",
      password: "",
      target: { kind: "loadpoint", title: "Alt" },
    });
  });

  it("bietet Art und Textfeld, wenn evcc die Geräte nicht liefert", async () => {
    const failing = vi.fn(() => Promise.reject(new ApiError(0, "network", "evcc weg")));
    const client = fakeClient([], { listEvccDevices: failing });
    await mount(client);
    await click("switches-new");
    expect(q("switch-targets-error")?.textContent).toContain("evcc weg");
    await act(() => {
      const kind = q("switch-target-kind") as HTMLSelectElement;
      kind.value = "consumer";
      kind.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await type("switch-target-title", "Kaffee");
    await type("switch-field-host", "192.168.1.60");
    await type("switch-field-user", "ich@example.com");
    await type("switch-field-password", "geheim");
    await click("switch-form-save");
    expect(client.createSwitch).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Kaffee", target: { kind: "consumer", title: "Kaffee" } }),
    );
  });

  it("übernimmt bei einem Verbraucher die Adresse und zeigt den Hinweis je Art", async () => {
    await mount(fakeClient([]));
    await click("switches-new");
    expect(q("switch-target-hint")).toBeNull();
    await choose("consumer:Kaffeemaschine");
    expect((q("switch-field-name") as HTMLInputElement).value).toBe("Kaffeemaschine");
    expect((q("switch-field-host") as HTMLInputElement).value).toBe("192.168.1.51");
    expect(q("switch-target-hint")?.textContent).toBe(
      "Verbraucher: evcc misst über das Gateway, schaltet aber nicht. Schalten mit ⏻ auf der Seite „Verbraucher“.",
    );
    await choose("consumer:Kühlschrank");
    expect(q("switch-host-unknown")).not.toBeNull();
    await choose("loadpoint:Carport");
    expect(q("switch-target-hint")?.textContent).toContain(
      "Ladepunkt: evcc schaltet die Steckdose.",
    );
  });
});

describe("SwitchesDialog: Löschen und evcc-Konfiguration", () => {
  it("löscht nur nach Rückfrage", async () => {
    const client = fakeClient([SWITCH]);
    render(null, root);
    await mount(client, { confirm: false });
    await click("switch-delete");
    expect(client.deleteSwitch).not.toHaveBeenCalled();
    render(null, root);
    await mount(client, { confirm: true });
    await click("switch-delete");
    expect(client.deleteSwitch).toHaveBeenCalledWith("a1b2c3d4");
  });

  it("zeigt die YAML mit Gateway-URL, kopiert sie und erneuert den Token", async () => {
    const client = fakeClient([SWITCH]);
    const { copy } = await mount(client);
    expect(q("switch-yaml")).toBeNull();
    await click("switch-yaml-toggle");
    const yaml = q("switch-yaml")?.textContent ?? "";
    expect(yaml).toContain(
      `uri: http://evcc.local:7080/addons-api/ext/switches-tapo/a1b2c3d4/${TOKEN}/state`,
    );
    expect(q("switch-yaml-hint")?.textContent).toContain("http://127.0.0.1:7080");
    await click("switch-yaml-copy");
    expect(copy).toHaveBeenCalledWith(yaml);
    expect(q("switch-yaml-copied")?.textContent).toBe("Kopiert");
    await click("switch-token-renew");
    expect(client.renewSwitchToken).toHaveBeenCalledWith("a1b2c3d4");
    expect(client.listSwitches).toHaveBeenCalledTimes(2);
  });

  it("markiert die YAML, wenn Kopieren nicht möglich ist", async () => {
    const copy = () => Promise.reject(new Error("Der Browser hat das Kopieren abgelehnt"));
    await mount(fakeClient([SWITCH]), { copy });
    await click("switch-yaml-toggle");
    await click("switch-yaml-copy");
    expect(q("switch-yaml-copied")?.textContent).toBe(
      "Kopieren nicht möglich (Der Browser hat das Kopieren abgelehnt). Die YAML ist markiert, bitte mit ⌘C bzw. Strg+C kopieren.",
    );
    expect(window.getSelection()?.toString()).toContain("enabled:");
  });
});

describe("SwitchesDialog: Hinweis auf den neuen Pfad", () => {
  it("erscheint für Admins mit Steckdose und bleibt nach dem Schließen weg", async () => {
    const storage = memoryStorage();
    await mount(fakeClient([SWITCH]), { storage });
    expect(q("switches-migration-hint")?.textContent).toContain("/addons-api/ext/switches-tapo/");
    await click("switches-migration-hint-close");
    expect(q("switches-migration-hint")).toBeNull();
    expect(storage.getItem(HINT_KEY)).toBe("dismissed");
    render(null, root);
    await mount(fakeClient([SWITCH]), { storage });
    expect(q("switches-migration-hint")).toBeNull();
  });

  it("fehlt ohne Steckdosen und ohne Admin", async () => {
    await mount(fakeClient([]));
    expect(q("switches-migration-hint")).toBeNull();
    render(null, root);
    await mount(fakeClient([PUBLIC]), { canManage: false });
    expect(q("switches-migration-hint")).toBeNull();
  });

  it("lässt sich ohne Speicher schließen", async () => {
    await mount(fakeClient([SWITCH]), { storage: null });
    await click("switches-migration-hint-close");
    expect(q("switches-migration-hint")).toBeNull();
  });
});

describe("SwitchesDialog: Verbraucher-Bindung", () => {
  const COFFEE: SwitchInfo = {
    ...SWITCH,
    id: "c0ffee00",
    name: "Kaffeemaschine",
    target: { kind: "consumer", title: "Kaffeemaschine" },
    status: { ...SWITCH.status, modeError: "alt" },
  };

  it("zeigt „Verbraucher „…““, warnt bei fehlendem Verbraucher und nie wegen des Modus", async () => {
    await mount(fakeClient([{ ...COFFEE, targetFound: false }]));
    expect(q("switch-target")?.textContent).toContain("Verbraucher „Kaffeemaschine“");
    expect(q("switch-target-warning")?.textContent).toBe("⚠ Verbraucher nicht gefunden");
    expect(q("switch-mode-warning")).toBeNull();
  });

  it("zeigt den Zähler-YAML mit Hinweis auf „Benutzerdefiniertes Gerät“", async () => {
    await mount(fakeClient([COFFEE]));
    await click("switch-yaml-toggle");
    const yaml = q("switch-yaml")?.textContent ?? "";
    expect(yaml).toBe(
      "power:\n  source: http\n" +
        `  uri: http://evcc.local:7080/addons-api/ext/switches-tapo/c0ffee00/${TOKEN}/state\n` +
        "  jq: .power // 0\n",
    );
    expect(q("switch-yaml-hint")?.textContent).toContain(
      "Benutzerdefiniertes Gerät, Titel „Kaffeemaschine“",
    );
  });
});
