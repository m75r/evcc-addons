import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cardActions } from "../src/actions/cardActions.js";
import type { CardActionContext, CardActionHandle, CardRef } from "../src/actions/contract.js";
import { nextMode } from "../src/actions/model.js";
import type { SwitchInfo } from "../src/dialog/client.js";
import { SwitchListStore } from "../src/switch-list.js";

function switchInfo(id: string, target: SwitchInfo["target"], on = false): SwitchInfo {
  const status = {
    reachable: true,
    on,
    power: 0,
    hasMeter: true,
    error: null,
    held: false,
    modeError: null,
    updatedAt: null,
  };
  return { id, name: target.title, type: "tapo", target, targetFound: true, status };
}

const LAMP_SWITCH = switchInfo("lampe", { kind: "loadpoint", title: "Lampe" });
const COFFEE_SWITCH = switchInfo("kaffee", { kind: "consumer", title: "kaffee" });
const LAMP: CardRef = { kind: "loadpoint", index: 2, title: "Lampe" };
const WASHER: CardRef = { kind: "loadpoint", index: 1, title: "Waschmaschine" };
const LAMP_METER: CardRef = { kind: "meter", usage: "consumer", name: "x", title: "Lampe" };
const COFFEE: CardRef = { kind: "meter", usage: "consumer", name: "kaffee", title: "kaffee" };
const COFFEE_AUX: CardRef = { kind: "meter", usage: "aux", name: "kaffee", title: "kaffee" };

const settings = { get: () => "5", onChange: () => () => undefined };

function setup(list: SwitchInfo[] = [LAMP_SWITCH, COFFEE_SWITCH], evccStatus = 200) {
  const evccApi = vi.fn(() => Promise.resolve(new Response(null, { status: evccStatus })));
  const setPower = vi.fn((_id: string, on: boolean) => Promise.resolve(on));
  const load = vi.fn(() => Promise.resolve(list));
  const store = new SwitchListStore({ load, settings });
  const provider = cardActions({ api: { evccApi }, client: { setPower }, store });
  return { provider, store, evccApi, setPower, load };
}

async function loaded(store: SwitchListStore): Promise<void> {
  await act(async () => {
    await store.refresh();
  });
}

let slots: { actions: HTMLElement; message: HTMLElement };
let handle: CardActionHandle | undefined;

beforeEach(() => {
  slots = { actions: document.createElement("div"), message: document.createElement("div") };
  document.body.replaceChildren(slots.actions, slots.message);
});

afterEach(() => act(() => handle?.destroy()));

function context(mode: CardActionContext["mode"]): CardActionContext {
  return { card: LAMP, mode, locale: "de" };
}

const button = (name: "power" | "smart") =>
  slots.actions.querySelector<HTMLButtonElement>(`[data-testid="consumer-mode-${name}"]`);

async function click(name: "power" | "smart") {
  await act(async () => {
    button(name)?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("cardActions: claims", () => {
  it("beansprucht nur Karten mit passender Bindung, vor dem Laden keine", async () => {
    const { provider, store } = setup();
    expect(provider.claims(LAMP)).toBe(false);
    await loaded(store);
    expect(provider.claims(LAMP)).toBe(true);
    expect(provider.claims(WASHER)).toBe(false);
    expect(provider.claims(COFFEE)).toBe(true);
    // gleicher Titel, aber andere Art der Bindung bzw. aux-Meter
    expect(provider.claims(LAMP_METER)).toBe(false);
    expect(provider.claims(COFFEE_AUX)).toBe(false);
  });

  it("meldet eine neue Liste an die Abonnenten", async () => {
    const { provider, store } = setup();
    const onChange = vi.fn();
    const off = provider.subscribe(onChange);
    await loaded(store);
    expect(onChange).toHaveBeenCalled();
    off();
  });
});

describe("cardActions: Buttons ⏻ ☀", () => {
  it.each([
    ["now", "true", "false"],
    ["smart", "false", "true"],
    ["off", "false", "false"],
    [null, "false", "false"],
  ] as const)("zeigt bei Modus %s ⏻ %s und ☀ %s", async (mode, power, smart) => {
    const { provider } = setup();
    await act(() => void (handle = provider.mount(slots, context(mode))));
    expect(slots.actions.querySelector('[data-testid="consumer-mode-2"]')).not.toBeNull();
    expect(button("power")?.getAttribute("aria-pressed")).toBe(power);
    expect(button("smart")?.getAttribute("aria-pressed")).toBe(smart);
    expect(button("power")?.getAttribute("title")).toBe("An/Aus (Schnell)");
    expect(button("smart")?.getAttribute("title")).toBe("Smart");
  });

  it.each([
    ["off", "power", "now"],
    ["now", "power", "off"],
    ["smart", "smart", "off"],
    ["off", "smart", "smart"],
  ] as const)("schaltet bei %s per %s auf %s (REST 1-basiert)", async (mode, name, target) => {
    const { provider, evccApi } = setup();
    await act(() => void (handle = provider.mount(slots, context(mode))));
    await click(name);
    expect(evccApi).toHaveBeenCalledWith(`loadpoints/3/mode/${target}`, { method: "POST" });
  });

  it("übernimmt mit update den neuen Modus", async () => {
    const { provider } = setup();
    await act(() => void (handle = provider.mount(slots, context("off"))));
    await act(() => handle?.update(context("now")));
    expect(button("power")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("zeigt einen Fehler im Slot message", async () => {
    const { provider } = setup([LAMP_SWITCH], 500);
    await act(() => void (handle = provider.mount(slots, context("off"))));
    await click("smart");
    expect(slots.message.querySelector('[data-testid="consumer-error"]')?.textContent).toBe(
      "Modus konnte nicht gesetzt werden: HTTP 500",
    );
  });

  it("sperrt die Buttons während der Anfrage", async () => {
    let finish: (res: Response) => void = () => undefined;
    const evccApi = vi.fn(() => new Promise<Response>((resolve) => (finish = resolve)));
    const store = new SwitchListStore({ load: () => Promise.resolve([]), settings });
    const provider = cardActions({ api: { evccApi }, client: { setPower: vi.fn() }, store });
    await act(() => void (handle = provider.mount(slots, context("off"))));
    await act(() => button("power")?.click());
    expect(button("power")?.disabled).toBe(true);
    expect(button("smart")?.disabled).toBe(true);
    await act(async () => {
      finish(new Response(null, { status: 200 }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(button("power")?.disabled).toBe(false);
  });

  it("räumt mit destroy beide Slots ab", async () => {
    const { provider } = setup([LAMP_SWITCH], 500);
    const mounted = provider.mount(slots, context("off"));
    await click("power");
    await act(() => mounted.destroy());
    expect(slots.actions.childElementCount).toBe(0);
    expect(slots.message.childElementCount).toBe(0);
  });
});

describe("cardActions: ⏻ an Verbrauchern", () => {
  const coffee = (): CardActionContext => ({ card: COFFEE, mode: null, locale: "de" });
  const power = () =>
    slots.actions.querySelector<HTMLButtonElement>('[data-testid="consumer-switch-power"]');
  const message = () => slots.message.querySelector('[data-testid="consumer-error"]')?.textContent;

  async function mountCoffee(list: SwitchInfo[]) {
    const fake = setup(list);
    await loaded(fake.store);
    await act(() => void (handle = fake.provider.mount(slots, coffee())));
    return fake;
  }

  it("zeigt einen ⏻ mit dem Zustand der Steckdose", async () => {
    await mountCoffee([switchInfo("kaffee", COFFEE_SWITCH.target, true)]);
    expect(slots.actions.querySelectorAll("button")).toHaveLength(1);
    expect(power()?.getAttribute("aria-pressed")).toBe("true");
    expect(power()?.getAttribute("title")).toBe("An/Aus");
  });

  it("schaltet mit dem umgekehrten Wert und lädt danach neu", async () => {
    const { setPower, load } = await mountCoffee([COFFEE_SWITCH]);
    const before = load.mock.calls.length;
    await act(async () => {
      power()?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(setPower).toHaveBeenCalledWith("kaffee", true);
    expect(load.mock.calls.length).toBe(before + 1);
  });

  it("sperrt ⏻ und meldet „nicht erreichbar“, wenn die Steckdose nicht antwortet", async () => {
    const offline = switchInfo("kaffee", COFFEE_SWITCH.target);
    offline.status = { ...offline.status, reachable: false, error: "Timeout" };
    await mountCoffee([offline]);
    expect(power()?.disabled).toBe(true);
    expect(message()).toBe("Steckdose nicht erreichbar: Timeout");
  });

  it("zeigt einen Fehler beim Schalten im Slot message", async () => {
    const fake = setup([COFFEE_SWITCH]);
    fake.setPower.mockImplementation(() => Promise.reject(new Error("HTTP 502")));
    await loaded(fake.store);
    await act(() => void (handle = fake.provider.mount(slots, coffee())));
    await act(async () => {
      power()?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(message()).toBe("Schalten fehlgeschlagen: HTTP 502");
    expect(power()?.disabled).toBe(false);
  });
});

describe("nextMode", () => {
  it.each([
    ["now", "power", "off"],
    ["now", "smart", "smart"],
    ["smart", "power", "now"],
    ["smart", "smart", "off"],
    ["off", "power", "now"],
    ["off", "smart", "smart"],
    [null, "power", "now"],
    [null, "smart", "smart"],
  ] as const)("%s + %s → %s", (current, name, expected) => {
    expect(nextMode(current, name)).toBe(expected);
  });
});
