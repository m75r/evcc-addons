import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  type ManagerClient,
  type SwitchInfo,
  type SwitchInput,
} from "../src/addons-client.js";
import { SwitchSection } from "../src/manager/SwitchSection.js";

const TOKEN = "ab".repeat(32);

const SWITCH: SwitchInfo = {
  id: "a1b2c3d4",
  name: "Dyson Luftreiniger",
  type: "tapo",
  loadpoint: "Dyson (Wohnzimmer)",
  loadpointFound: true,
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

function fakeClient(list: SwitchInfo[], overrides: Partial<ManagerClient> = {}) {
  return {
    listSwitches: vi.fn(() => Promise.resolve(list)),
    createSwitch: vi.fn((input: SwitchInput) => Promise.resolve({ ...SWITCH, name: input.name })),
    updateSwitch: vi.fn(() => Promise.resolve(SWITCH)),
    deleteSwitch: vi.fn(() => Promise.resolve()),
    renewSwitchToken: vi.fn(() => Promise.resolve("cd".repeat(32))),
    listLoadpointTitles: vi.fn(() => Promise.resolve(["Carport", "Dyson (Wohnzimmer)"])),
    listLoadpointHosts: vi.fn(() => Promise.resolve({ "Dyson (Wohnzimmer)": "192.168.1.77" })),
    ...overrides,
  } as unknown as ManagerClient;
}

interface MountOptions {
  canManage?: boolean;
  confirm?: boolean;
  copy?: (text: string) => Promise<void>;
}

async function mount(client: ManagerClient, opts: MountOptions = {}) {
  const onUnauthorized = vi.fn();
  const copy = vi.fn(opts.copy ?? (() => Promise.resolve()));
  await act(async () => {
    render(
      <SwitchSection
        locale="de"
        client={client}
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

async function choose(title: string) {
  await act(async () => {
    const select = q("switch-field-loadpoint") as HTMLSelectElement;
    select.value = title;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
  });
}

async function fillForm() {
  await choose("Carport");
  await type("switch-field-name", "Lampe");
  await type("switch-field-host", "192.168.1.60");
  await type("switch-field-user", "ich@example.com");
  await type("switch-field-password", "geheim");
}

describe("SwitchSection: Karten", () => {
  it("zeigt für Admins Status, Adresse, Ladepunkt und Aktionen", async () => {
    await mount(fakeClient([SWITCH]));
    expect(q("switch-card-a1b2c3d4")?.textContent).toContain("Dyson Luftreiniger");
    expect(q("switch-status")?.textContent).toBe("● an · 35 W");
    expect(q("switch-host")?.textContent).toBe("Tapo · 192.168.1.50");
    expect(q("switch-loadpoint")?.textContent).toContain("Ladepunkt „Dyson (Wohnzimmer)“");
    expect(q("switch-edit")).not.toBeNull();
    expect(q("switch-delete")).not.toBeNull();
    expect(q("switches-new")?.textContent).toBe("Steckdose");
    expect(q("switch-loadpoint-warning")).toBeNull();
  });

  it("zeigt ohne Admin nur Name, Status und Ladepunkt", async () => {
    await mount(fakeClient([PUBLIC]), { canManage: false });
    expect(q("switch-status")?.textContent).toBe("● an · 35 W");
    expect(q("switch-loadpoint")).not.toBeNull();
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
    await mount(fakeClient([{ ...SWITCH, loadpointFound: false, status }]));
    expect(q("switch-loadpoint-warning")?.textContent).toBe("⚠ Ladepunkt nicht gefunden");
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

  it("lädt alle 5 s neu, nur bei sichtbarer Seite", async () => {
    vi.useFakeTimers();
    try {
      const client = fakeClient([SWITCH]);
      const section = (
        <SwitchSection
          locale="de"
          client={client}
          canManage
          confirm={() => true}
          onUnauthorized={vi.fn()}
        />
      );
      await act(() => render(section, root));
      expect(client.listSwitches).toHaveBeenCalledTimes(1);
      await act(() => void vi.advanceTimersByTime(5000));
      expect(client.listSwitches).toHaveBeenCalledTimes(2);
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      await act(() => void vi.advanceTimersByTime(5000));
      expect(client.listSwitches).toHaveBeenCalledTimes(2);
    } finally {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      vi.useRealTimers();
    }
  });
});

describe("SwitchSection: Formular", () => {
  it("legt eine Steckdose an und lädt die Liste neu", async () => {
    const client = fakeClient([]);
    await mount(client);
    await click("switches-new");
    expect(q("switch-modal")?.textContent).toContain("Steckdose hinzufügen");
    const select = q("switch-field-loadpoint") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(select.options[0].textContent).toBe("– Ladepunkt wählen –");
    expect((q("switch-field-type") as HTMLSelectElement).value).toBe("tapo");
    await fillForm();
    await click("switch-modal-save");
    expect(client.createSwitch).toHaveBeenCalledWith({
      name: "Lampe",
      type: "tapo",
      host: "192.168.1.60",
      user: "ich@example.com",
      password: "geheim",
      loadpoint: "Carport",
    });
    expect(q("switch-modal")).toBeNull();
    expect(client.listSwitches).toHaveBeenCalledTimes(2);
  });

  it("stellt den Ladepunkt an den Anfang und übernimmt Name und Adresse", async () => {
    await mount(fakeClient([]));
    await click("switches-new");
    const ids = [...root.querySelectorAll("[data-testid^='switch-field-']")].map((el) =>
      el.getAttribute("data-testid"),
    );
    expect(ids[0]).toBe("switch-field-loadpoint");
    await choose("Dyson (Wohnzimmer)");
    expect((q("switch-field-name") as HTMLInputElement).value).toBe("Dyson (Wohnzimmer)");
    expect((q("switch-field-host") as HTMLInputElement).value).toBe("192.168.1.77");
    expect(q("switch-host-unknown")).toBeNull();
  });

  it("weist auf eine unbekannte Adresse hin und lässt eine eingetragene stehen", async () => {
    const failing = vi.fn(() => Promise.reject(new ApiError(401, "evcc-error", "evcc: HTTP 401")));
    await mount(fakeClient([], { listLoadpointHosts: failing }));
    await click("switches-new");
    await type("switch-field-host", "10.0.0.5");
    await choose("Carport");
    expect((q("switch-field-name") as HTMLInputElement).value).toBe("Carport");
    expect((q("switch-field-host") as HTMLInputElement).value).toBe("10.0.0.5");
    expect(q("switch-host-unknown")?.textContent).toBe(
      "Adresse nicht in der evcc-Konfiguration gefunden, bitte eintragen.",
    );
  });

  it("bleibt bei Verbindungsfehler offen und schließt erst mit „Schließen“", async () => {
    const unreachable = {
      ...SWITCH,
      status: { ...SWITCH.status, reachable: false, error: "Verbindung fehlgeschlagen (KLAP)" },
    };
    const client = fakeClient([], { createSwitch: vi.fn(() => Promise.resolve(unreachable)) });
    await mount(client);
    await click("switches-new");
    await fillForm();
    await click("switch-modal-save");
    expect(q("switch-modal-warning")?.textContent).toBe(
      "⚠ Gespeichert, aber die Verbindung schlug fehl: Verbindung fehlgeschlagen (KLAP)",
    );
    expect(q("switch-modal-save")).toBeNull();
    expect(q("switch-modal-cancel")?.textContent).toBe("Schließen");
    await click("switch-modal-cancel");
    expect(q("switch-modal")).toBeNull();
    expect(client.listSwitches).toHaveBeenCalledTimes(2);
  });

  it("zeigt Validierungsfehler im offenen Modal", async () => {
    const invalid = new ApiError(400, "switch-invalid", "Name fehlt");
    await mount(fakeClient([], { createSwitch: vi.fn(() => Promise.reject(invalid)) }));
    await click("switches-new");
    await click("switch-modal-save");
    expect(q("switch-modal-error")?.textContent).toBe("⚠ Speichern fehlgeschlagen: Name fehlt");
    expect(q("switch-modal")).not.toBeNull();
  });

  it("schließt bei 401 und meldet onUnauthorized", async () => {
    const unauthorized = new ApiError(401, "login-required", "Bitte anmelden");
    const { onUnauthorized } = await mount(
      fakeClient([], { createSwitch: vi.fn(() => Promise.reject(unauthorized)) }),
    );
    await click("switches-new");
    await click("switch-modal-save");
    expect(q("switch-modal")).toBeNull();
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("bearbeitet mit leerem Passwort und behält einen nicht gefundenen Ladepunkt", async () => {
    const missing = { ...SWITCH, loadpoint: "Alt", loadpointFound: false };
    const client = fakeClient([missing]);
    await mount(client);
    await click("switch-edit");
    expect(q("switch-modal")?.textContent).toContain("Steckdose bearbeiten");
    expect((q("switch-field-host") as HTMLInputElement).value).toBe("192.168.1.50");
    const password = q("switch-field-password") as HTMLInputElement;
    expect(password.value).toBe("");
    expect(password.placeholder).toBe("leer = unverändert");
    const select = q("switch-field-loadpoint") as HTMLSelectElement;
    expect(select.value).toBe("Alt");
    expect(select.options[0].textContent).toBe("Alt (nicht gefunden)");
    await click("switch-modal-save");
    expect(client.updateSwitch).toHaveBeenCalledWith("a1b2c3d4", {
      name: "Dyson Luftreiniger",
      type: "tapo",
      host: "192.168.1.50",
      user: "ich@example.com",
      password: "",
      loadpoint: "Alt",
    });
  });

  it("bietet ein Textfeld, wenn evcc die Ladepunkte nicht liefert", async () => {
    const failing = vi.fn(() => Promise.reject(new ApiError(0, "network", "evcc weg")));
    await mount(fakeClient([], { listLoadpointTitles: failing }));
    await click("switches-new");
    expect(q("switch-field-loadpoint")?.tagName).toBe("INPUT");
    expect(q("switch-loadpoints-error")?.textContent).toContain("evcc weg");
  });
});

describe("SwitchSection: Löschen und evcc-Konfiguration", () => {
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
      `uri: http://evcc.local:7080/addons-api/switches/a1b2c3d4/${TOKEN}/state`,
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
