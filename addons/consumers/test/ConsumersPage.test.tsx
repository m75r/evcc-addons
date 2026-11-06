import type { AddonApi } from "@evcc-addons/sdk";
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

/** Fake-AddonApi mit steuerbaren Live-Daten */
function fakeApi(evccApi = routedEvccApi(notLoggedIn)) {
  const state: Record<string, unknown> = {};
  const listeners = new Map<string, Set<Listener>>();
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
    evccApi,
    locale: () => "de",
    theme: () => "light" as const,
    onEnvChange: () => () => undefined,
  } satisfies AddonApi;
  const push = (key: string, value: unknown) => {
    state[key] = value;
    for (const cb of listeners.get(key) ?? []) cb(value);
  };
  return { api, push, listeners, evccApi };
}

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement("div");
  document.body.replaceChildren(root);
});

afterEach(() => render(null, root));

const q = (sel: string) => root.querySelector<HTMLElement>(sel);
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
    const active = q('[data-testid="consumer-mode-1"] [aria-pressed="true"]');
    expect(active?.textContent).toBe("Aus");
    await act(async () => {
      [...root.querySelectorAll<HTMLButtonElement>('[data-testid="consumer-mode-1"] button')]
        .find((b) => b.textContent === "Schnell")
        ?.click();
      await Promise.resolve();
    });
    expect(evccApi).toHaveBeenCalledWith("loadpoints/2/mode/now", { method: "POST" });
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
    await act(async () => {
      root.querySelector<HTMLButtonElement>('[data-testid="consumer-mode-0"] button')?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(q('[data-testid="consumer-error"]')?.textContent).toBe(
      "Modus konnte nicht gesetzt werden: HTTP 500",
    );
  });

  it("meldet sich beim Unmount ab", async () => {
    const { api, listeners } = fakeApi();
    await act(() => render(<ConsumersPage api={api} />, root));
    expect(listeners.get("loadpoints")?.size).toBe(1);
    await act(() => render(null, root));
    expect(listeners.get("loadpoints")?.size).toBe(0);
  });
});
