import type { AddonApi, SettingValues } from "@evcc-addons/sdk";
import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsumersPage } from "../src/ConsumersPage.js";

type Listener = (value: unknown) => void;

/** Antworten der Status-Endpunkte je Meter; Standard: nicht angemeldet */
type StatusResponder = (name: string) => Response;
const notLoggedIn: StatusResponder = () => new Response(null, { status: 401 });

function routedEvccApi(statusFor: StatusResponder) {
  return vi.fn((path: string, _init?: RequestInit) => {
    const meter = /^config\/devices\/meter\/([^/]+)\/status$/.exec(path)?.[1];
    if (meter) return Promise.resolve(statusFor(decodeURIComponent(meter)));
    return Promise.resolve(new Response(null, { status: 200 }));
  });
}

/** Steuerbare Einstellungen wie api.settings des Loaders */
function fakeSettings(initial: SettingValues) {
  let values: SettingValues = { ...initial };
  const listeners = new Set<(values: SettingValues) => void>();
  const settings = {
    get: (key: string) => values[key],
    all: () => ({ ...values }),
    onChange: (cb: (values: SettingValues) => void) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
  };
  const pushSettings = (next: SettingValues) => {
    values = { ...next };
    for (const cb of listeners) cb({ ...values });
  };
  return { settings, pushSettings, settingListeners: listeners };
}

/** Fake-AddonApi mit steuerbaren Live-Daten und Einstellungen */
function fakeApi(evccApi = routedEvccApi(notLoggedIn), initialSettings: SettingValues = {}) {
  const state: Record<string, unknown> = {};
  const listeners = new Map<string, Set<Listener>>();
  const { settings, pushSettings, settingListeners } = fakeSettings(initialSettings);
  const api = {
    id: "consumers",
    addTab: vi.fn(),
    addMoreMenuItem: vi.fn(),
    registerPage: vi.fn(),
    state: {
      get: (key?: string) => (key ? state[key] : state),
      subscribe: (key: string, cb: Listener) => {
        if (!listeners.has(key)) listeners.set(key, new Set());
        listeners.get(key)?.add(cb);
        return () => listeners.get(key)?.delete(cb);
      },
    },
    settings,
    evccApi,
    locale: () => "de",
    theme: () => "light" as const,
    onEnvChange: () => () => undefined,
  } satisfies AddonApi;
  const push = (key: string, value: unknown) => {
    state[key] = value;
    for (const cb of listeners.get(key) ?? []) cb(value);
  };
  return { api, push, listeners, evccApi, pushSettings, settingListeners };
}

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement("div");
  document.body.replaceChildren(root);
});

afterEach(() => render(null, root));

const q = (sel: string) => root.querySelector<HTMLElement>(sel);

const modeButton = (index: number, button: "power" | "smart") =>
  q(`[data-testid="consumer-mode-${index}"] [data-testid="consumer-mode-${button}"]`);

async function clickMode(index: number, button: "power" | "smart") {
  await act(async () => {
    modeButton(index, button)?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
const SOCKET = {
  title: "Waschmaschine",
  chargerFeatureSwitchDevice: true,
  chargePower: 150,
  enabled: true,
  mode: "off",
};

describe("ConsumersPage", () => {
  it("zeigt Leertexte ohne Daten", async () => {
    const { api } = fakeApi();
    await act(() => render(<ConsumersPage api={api} />, root));
    expect(q('[data-testid="consumers-empty-switchable"]')?.textContent).toContain(
      "Ladepunkt mit Steckdose",
    );
    expect(q('[data-testid="consumers-empty-measured"]')).not.toBeNull();
  });

  it("zeigt Karten nach Live-Daten und aktualisiert sie", async () => {
    const { api, push } = fakeApi();
    await act(() => render(<ConsumersPage api={api} />, root));
    await act(() => {
      push("loadpoints", [{ title: "Carport" }, SOCKET]);
      push("consumers", [{ name: "kuehlschrank", power: 120, energy: 57.5 }]);
    });
    expect(q('[data-testid="consumer-switch-1"] [data-testid="consumer-power"]')?.textContent).toBe(
      "150 W",
    );
    expect(q('[data-testid="consumer-switch-0"]')).toBeNull();
    const meter = q('[data-testid="consumer-meter-kuehlschrank"]');
    expect(meter?.querySelector('[data-testid="consumer-icon"] svg')).not.toBeNull();
    expect(meter?.querySelector('[data-testid="consumer-consumed"]')?.textContent).toBe("57,5 kWh");
    await act(() => push("loadpoints", [{ title: "Carport" }, { ...SOCKET, chargePower: 1300 }]));
    expect(q('[data-testid="consumer-switch-1"] [data-testid="consumer-power"]')?.textContent).toBe(
      "1,3 kW",
    );
  });

  it("setzt den Modus per evccApi (1-basiert)", async () => {
    const { api, push, evccApi } = fakeApi();
    await act(() => render(<ConsumersPage api={api} />, root));
    await act(() => push("loadpoints", [{ title: "Carport" }, SOCKET]));
    expect(q('[data-testid="consumer-mode-1"] [aria-pressed="true"]')).toBeNull();
    await clickMode(1, "power");
    expect(evccApi).toHaveBeenCalledWith("loadpoints/2/mode/now", { method: "POST" });
  });

  it.each([
    ["now", "true", "false"],
    ["smart", "false", "true"],
    ["off", "false", "false"],
    [null, "false", "false"],
  ])("zeigt bei Modus %s die Buttons ⏻ %s und ☀ %s", async (mode, power, smart) => {
    const { api, push } = fakeApi();
    push("loadpoints", [{ ...SOCKET, mode }]);
    await act(() => render(<ConsumersPage api={api} />, root));
    expect(modeButton(0, "power")?.getAttribute("aria-pressed")).toBe(power);
    expect(modeButton(0, "smart")?.getAttribute("aria-pressed")).toBe(smart);
    expect(modeButton(0, "power")?.getAttribute("title")).toBe("An/Aus (Schnell)");
    expect(modeButton(0, "smart")?.getAttribute("title")).toBe("Smart");
  });

  it.each([
    ["off", "power", "now"],
    ["now", "power", "off"],
    ["smart", "smart", "off"],
    ["off", "smart", "smart"],
  ] as const)("schaltet bei %s per %s auf %s", async (mode, button, target) => {
    const { api, push, evccApi } = fakeApi();
    push("loadpoints", [{ ...SOCKET, mode }]);
    await act(() => render(<ConsumersPage api={api} />, root));
    await clickMode(0, button);
    expect(evccApi).toHaveBeenCalledWith(`loadpoints/1/mode/${target}`, { method: "POST" });
  });

  it("zeigt die Modus-Buttons im Kartenkopf statt des alten Moduswählers", async () => {
    const { api, push } = fakeApi();
    push("loadpoints", [SOCKET]);
    await act(() => render(<ConsumersPage api={api} />, root));
    const card = q('[data-testid="consumer-switch-0"]');
    expect(
      card?.querySelector('.evcc-consumers-head [data-testid="consumer-mode-0"]'),
    ).not.toBeNull();
    expect(card?.querySelector(".btn-group")).toBeNull();
    expect(card?.textContent).not.toMatch(/Schnell|Aus\b/);
    expect(card?.querySelector('[data-testid="consumer-status"]')?.textContent).toBe("an");
  });

  it("zeigt mit Login „Geladen (Session)“ und Lesefehler aus dem Gerätestatus", async () => {
    const statuses: Record<string, unknown> = {
      dyson: { power: { value: 24 }, chargedEnergy: { value: 0.313 } },
      mikrowelle: {
        power: { value: 0, error: "timeout" },
        chargedEnergy: { value: 0, error: "timeout" },
      },
    };
    const { api, push } = fakeApi(routedEvccApi((name) => Response.json(statuses[name])));
    push("consumers", [
      { name: "dyson", title: "Dyson", power: 24 },
      { name: "mikrowelle", title: "Mikrowelle", power: 0 },
    ]);
    await act(async () => {
      render(<ConsumersPage api={api} />, root);
      // Geräte werden nacheinander abgefragt
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const dyson = q('[data-testid="consumer-meter-dyson"]');
    expect(dyson?.querySelector('[data-testid="consumer-charged"]')?.textContent).toBe("313 Wh");
    expect(dyson?.querySelector('[data-testid="consumer-consumed"]')).toBeNull();
    const error = q('[data-testid="consumer-meter-mikrowelle"] [data-testid="consumer-charged"]');
    expect(error?.classList.contains("is-error")).toBe(true);
    expect(error?.getAttribute("title")).toBe("timeout");
    expect(q('[data-testid="consumers-login-hint"]')).toBeNull();
  });

  it("zeigt ohne Login einen Hinweis und fragt nur ein Gerät ab", async () => {
    const { api, push, evccApi } = fakeApi();
    push("consumers", [
      { name: "a", power: 1 },
      { name: "b", power: 2 },
    ]);
    await act(async () => {
      render(<ConsumersPage api={api} />, root);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(q('[data-testid="consumers-login-hint"]')?.textContent).toContain("Anmeldung in evcc");
    expect(evccApi.mock.calls.filter(([path]) => path.startsWith("config/"))).toHaveLength(1);
  });

  it("zeigt eine Fehlermeldung, wenn der Modus nicht gesetzt werden kann", async () => {
    const { api, push } = fakeApi(
      vi.fn(() => Promise.resolve(new Response(null, { status: 500 }))),
    );
    await act(() => render(<ConsumersPage api={api} />, root));
    await act(() => push("loadpoints", [SOCKET]));
    await clickMode(0, "smart");
    expect(q('[data-testid="consumer-error"]')?.textContent).toBe(
      "Modus konnte nicht gesetzt werden: HTTP 500",
    );
  });

  it("meldet sich beim Unmount ab", async () => {
    const { api, listeners, settingListeners } = fakeApi();
    await act(() => render(<ConsumersPage api={api} />, root));
    expect(listeners.get("loadpoints")?.size).toBe(1);
    expect(settingListeners.size).toBe(1);
    await act(() => render(null, root));
    expect(listeners.get("loadpoints")?.size).toBe(0);
    expect(settingListeners.size).toBe(0);
  });
});

/** Testids der Karten eines Abschnitts in Anzeige-Reihenfolge */
function order(section: "consumers-switchable" | "consumers-measured"): string[] {
  return [...root.querySelectorAll(`[data-testid="${section}"] > [data-testid]`)].map(
    (el) => el.getAttribute("data-testid") ?? "",
  );
}

const SOCKETS = [
  { ...SOCKET, title: "Bügeleisen", chargePower: 50 },
  { ...SOCKET, title: "Aquarium", chargePower: 2000 },
  { ...SOCKET, title: "Cafe", chargePower: undefined },
];

const METERS = [
  { name: "a", title: "Alpha", power: 10 },
  { name: "b", title: "Beta", power: 300 },
  { name: "c", title: "Gamma", power: 20 },
];

async function renderPage(api: AddonApi, wait = false) {
  await act(async () => {
    render(<ConsumersPage api={api} />, root);
    if (wait) await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

describe("ConsumersPage: Einstellungen", () => {
  it("blendet bei showEnergy = false „Verbraucht“ und „Geladen“ auf beiden Kartentypen aus", async () => {
    const statuses = (_name: string) =>
      Response.json({ power: { value: 24 }, chargedEnergy: { value: 0.313 } });
    const { api, push } = fakeApi(routedEvccApi(statuses), { showEnergy: false });
    push("loadpoints", [SOCKET]);
    push("consumers", [
      { name: "dyson", title: "Dyson" },
      { name: "shelly", title: "Luftentfeuchter", power: 35, energy: 79.8 },
    ]);
    await renderPage(api, true);
    expect(q('[data-testid="consumer-switch-0"] [data-testid="consumer-power"]')).not.toBeNull();
    // Leistung aus dem Gerätestatus: der Status mit chargedEnergy ist geladen
    expect(
      q('[data-testid="consumer-meter-dyson"] [data-testid="consumer-power"]')?.textContent,
    ).toBe("24 W");
    expect(
      q('[data-testid="consumer-meter-shelly"] [data-testid="consumer-power"]'),
    ).not.toBeNull();
    expect(q('[data-testid="consumer-charged"]')).toBeNull();
    expect(q('[data-testid="consumer-consumed"]')).toBeNull();
    expect(q('[data-testid="consumers-login-hint"]')).toBeNull();
  });

  it("zeigt bei showEnergy = false den neutralen Login-Hinweis", async () => {
    const { api, push } = fakeApi(undefined, { showEnergy: false });
    push("consumers", [{ name: "a", power: 1 }]);
    await renderPage(api, true);
    expect(q('[data-testid="consumers-login-hint"]')?.textContent).toBe(
      "Weitere Gerätewerte erscheinen nach der Anmeldung in evcc.",
    );
  });

  it("rendert mit Defaults, wenn ein älterer Loader kein api.settings liefert", async () => {
    const { api, push } = fakeApi();
    const legacy: Partial<AddonApi> = { ...api };
    delete legacy.settings;
    push("loadpoints", [SOCKET]);
    await renderPage(legacy as unknown as AddonApi);
    expect(q('[data-testid="consumer-switch-0"] [data-testid="consumer-charged"]')).not.toBeNull();
  });

  it("sortiert bei power-desc nach Leistung und sortiert live um", async () => {
    const { api, push } = fakeApi(undefined, { sort: "power-desc" });
    push("loadpoints", SOCKETS);
    push("consumers", METERS);
    await renderPage(api);
    expect(order("consumers-switchable")).toEqual([
      "consumer-switch-1",
      "consumer-switch-0",
      "consumer-switch-2",
    ]);
    expect(order("consumers-measured")).toEqual([
      "consumer-meter-b",
      "consumer-meter-c",
      "consumer-meter-a",
    ]);
    await act(() => push("consumers", [{ ...METERS[0], power: 5000 }, METERS[1], METERS[2]]));
    expect(order("consumers-measured")).toEqual([
      "consumer-meter-a",
      "consumer-meter-b",
      "consumer-meter-c",
    ]);
  });

  it("sortiert bei name-desc umgekehrt alphabetisch", async () => {
    const { api, push } = fakeApi(undefined, { sort: "name-desc" });
    push("loadpoints", SOCKETS);
    push("consumers", METERS);
    await renderPage(api);
    expect(order("consumers-switchable")).toEqual([
      "consumer-switch-2",
      "consumer-switch-0",
      "consumer-switch-1",
    ]);
    expect(order("consumers-measured")).toEqual([
      "consumer-meter-c",
      "consumer-meter-b",
      "consumer-meter-a",
    ]);
  });

  it("rendert nach onChange ohne Remount neu", async () => {
    const { api, push, pushSettings } = fakeApi();
    push("loadpoints", [SOCKET]);
    push("consumers", METERS);
    await renderPage(api);
    const page = q('[data-testid="consumers-page"]');
    expect(order("consumers-measured")[0]).toBe("consumer-meter-a");
    expect(q('[data-testid="consumer-charged"]')).not.toBeNull();
    await act(() => pushSettings({ showEnergy: false, sort: "name-desc" }));
    expect(q('[data-testid="consumers-page"]')).toBe(page);
    expect(order("consumers-measured")[0]).toBe("consumer-meter-c");
    expect(q('[data-testid="consumer-charged"]')).toBeNull();
  });
});

describe("ConsumersPage: Anzeige", () => {
  it("zeigt 0 W und 0 Wh auf der Karte „Schaltbar“ als „–“ in Grau", async () => {
    const { api, push } = fakeApi();
    push("loadpoints", [{ ...SOCKET, chargePower: 0, chargedEnergy: 0 }]);
    await act(() => render(<ConsumersPage api={api} />, root));
    for (const testId of ["consumer-power", "consumer-charged"]) {
      const value = q(`[data-testid="consumer-switch-0"] [data-testid="${testId}"]`);
      expect(value?.textContent).toBe("–");
      expect(value?.classList.contains("is-muted")).toBe(true);
    }
  });

  it("lässt „Verbraucht“ 0 kWh unverändert", async () => {
    const { api, push } = fakeApi();
    push("consumers", [{ name: "a", title: "A", power: 0, energy: 0 }]);
    await act(() => render(<ConsumersPage api={api} />, root));
    const meter = q('[data-testid="consumer-meter-a"]');
    expect(meter?.querySelector('[data-testid="consumer-consumed"]')?.textContent).toBe("0,0 kWh");
    expect(meter?.querySelector('[data-testid="consumer-power"]')?.textContent).toBe("–");
  });

  it("zeigt bei Lesefehler das Badge „offline“ und stellt die Karte bei power-desc ans Ende", async () => {
    const statuses: Record<string, unknown> = {
      a: { power: { value: 0, error: "Gerät nicht erreichbar" } },
      b: { power: { value: 5 } },
    };
    const { api, push } = fakeApi(
      routedEvccApi((name) => Response.json(statuses[name])),
      {
        sort: "power-desc",
      },
    );
    push("consumers", [
      { name: "a", title: "Alpha", power: 999 },
      { name: "b", title: "Beta", power: 5 },
    ]);
    await renderPage(api, true);
    const power = q('[data-testid="consumer-meter-a"] [data-testid="consumer-power"]');
    const badge = power?.querySelector('[data-testid="consumer-offline"]');
    expect(badge?.textContent).toBe("offline");
    expect(badge?.getAttribute("title")).toBe("Gerät nicht erreichbar");
    expect(badge?.classList.contains("badge")).toBe(true);
    expect(power?.classList.contains("is-error")).toBe(false);
    expect(order("consumers-measured")).toEqual(["consumer-meter-b", "consumer-meter-a"]);
  });
});
