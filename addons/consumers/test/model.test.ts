import { describe, expect, it } from "vitest";
import {
  cardRef,
  meterPower,
  meterRows,
  normalizeMode,
  sortCards,
  splitByClaim,
  toLoadpointCards,
  toMeterCards,
  type CardItem,
} from "../src/model.js";
import type { SortOrder } from "../src/settings.js";

const loadpoints = [
  { title: "Carport", chargePower: 11000, mode: "now" },
  {
    title: "Wärmepumpe",
    chargerFeatureSwitchDevice: true,
    chargerIcon: "heatpump",
    chargePower: 2,
    chargedEnergy: 1300,
    enabled: true,
    mode: "pv",
  },
  {
    title: "Waschmaschine",
    chargerFeatureSwitchDevice: true,
    chargePower: 0,
    enabled: false,
    mode: "off",
  },
  { title: "Trockner", chargerFeatureSwitchDevice: false, mode: "minpv" },
];

describe("toLoadpointCards", () => {
  it("filtert auf SwitchDevice, behält den 0-basierten Index und sortiert", () => {
    // Deutsche Sortierung: „ä“ zählt wie „a“, daher Wärmepumpe (r) vor Waschmaschine (s)
    expect(toLoadpointCards(loadpoints, "de")).toEqual([
      {
        index: 1,
        title: "Wärmepumpe",
        icon: "heatpump",
        power: 2,
        chargedEnergyWh: 1300,
        enabled: true,
        mode: "smart",
      },
      {
        index: 2,
        title: "Waschmaschine",
        icon: "generic",
        power: 0,
        chargedEnergyWh: undefined,
        enabled: false,
        mode: "off",
      },
    ]);
  });

  it("verträgt fehlende Daten", () => {
    expect(toLoadpointCards(undefined, "de")).toEqual([]);
    expect(toLoadpointCards([null, { chargerFeatureSwitchDevice: true }], "de")).toEqual([
      {
        index: 1,
        title: "#2",
        icon: "generic",
        power: undefined,
        chargedEnergyWh: undefined,
        enabled: false,
        mode: null,
      },
    ]);
  });
});

describe("Icons", () => {
  it("nutzt die evcc-Standard-Icons für consumer und aux", () => {
    const cards = toMeterCards([{ name: "a" }], [{ name: "b" }], "de");
    expect(cards.map((c) => c.icon)).toEqual(["generic", "smartconsumer"]);
  });
});

describe("normalizeMode", () => {
  it("bildet pv und minpv auf smart ab", () => {
    expect(["off", "smart", "now", "pv", "minpv", "x"].map(normalizeMode)).toEqual([
      "off",
      "smart",
      "now",
      "smart",
      "smart",
      null,
    ]);
  });
});

describe("toMeterCards", () => {
  it("nutzt title || name, sortiert und erlaubt fehlende energy", () => {
    const consumers = [
      {
        name: "zirkulation",
        title: "Zirkulationspumpe (Keller)",
        icon: "pump",
        power: 0,
        energy: 57.5,
      },
    ];
    const aux = [{ name: "heizstab", power: 1500 }];
    expect(toMeterCards(consumers, aux, "de")).toEqual([
      {
        usage: "aux",
        name: "heizstab",
        title: "heizstab",
        icon: "smartconsumer",
        power: 1500,
        energyKWh: undefined,
      },
      {
        usage: "consumer",
        name: "zirkulation",
        title: "Zirkulationspumpe (Keller)",
        icon: "pump",
        power: 0,
        energyKWh: 57.5,
      },
    ]);
    expect(toMeterCards(undefined, null, "de")).toEqual([]);
  });
});

describe("meterRows", () => {
  const card = {
    usage: "consumer" as const,
    name: "dyson",
    title: "Dyson",
    icon: "airpurifier",
    power: 24,
  };

  it("zeigt ohne Gerätestatus nur Leistung und vorhandene Energie", () => {
    expect(meterRows(card)).toEqual([{ kind: "power", value: 24, error: undefined }]);
    expect(meterRows({ ...card, energyKWh: 78.1 }).map((r) => r.kind)).toEqual(["power", "energy"]);
  });

  it("ergänzt „Geladen (Session)“ und Lesefehler aus dem Gerätestatus", () => {
    const rows = meterRows(card, {
      power: { value: 0, error: "timeout" },
      chargedEnergy: { value: 0.313 },
    });
    expect(rows).toEqual([
      { kind: "power", value: 24, error: "timeout" },
      { kind: "chargedEnergy", value: 0.313 },
    ]);
  });

  it("nimmt Energie aus dem Gerätestatus, wenn der WebSocket keine liefert", () => {
    expect(meterRows(card, { energy: { value: 5 } })[1]).toEqual({
      kind: "energy",
      value: 5,
      error: undefined,
    });
  });

  it("lässt „Verbraucht“ und „Geladen (Session)“ bei showEnergy = false weg", () => {
    const withEnergy = { ...card, energyKWh: 79.8 };
    const status = { chargedEnergy: { value: 0.313 } };
    expect(meterRows(withEnergy, status, false).map((r) => r.kind)).toEqual(["power"]);
    expect(meterRows(withEnergy, status, true).map((r) => r.kind)).toEqual([
      "power",
      "energy",
      "chargedEnergy",
    ]);
  });
});

describe("meterPower", () => {
  const card = { usage: "consumer" as const, name: "a", title: "A", icon: "generic" };

  it("nimmt den Live-Wert, sonst den Gerätestatus", () => {
    expect(meterPower({ ...card, power: 24 }, { power: { value: 5 } })).toBe(24);
    expect(meterPower(card, { power: { value: 5 } })).toBe(5);
    expect(meterPower(card)).toBeUndefined();
  });

  it("liefert bei Lesefehler undefined", () => {
    expect(meterPower({ ...card, power: 0 }, { power: { value: 0, error: "timeout" } })).toBe(
      undefined,
    );
  });
});

describe("sortCards", () => {
  const cards = [
    { title: "Berta", power: 100 },
    { title: "Anton", power: undefined },
    { title: "Dora", power: 100 },
    { title: "Cäsar", power: 0 },
    { title: "Emil", power: 2000 },
  ];
  const order = (sort: SortOrder) =>
    sortCards(cards, sort, "de", (c) => c.power).map((c) => c.title);

  it("sortiert nach Name auf- und absteigend", () => {
    expect(order("name-asc")).toEqual(["Anton", "Berta", "Cäsar", "Dora", "Emil"]);
    expect(order("name-desc")).toEqual(["Emil", "Dora", "Cäsar", "Berta", "Anton"]);
  });

  it("sortiert nach Leistung, ohne Wert am Ende, Gleichstand nach Name", () => {
    expect(order("power-desc")).toEqual(["Emil", "Berta", "Dora", "Cäsar", "Anton"]);
    expect(order("power-asc")).toEqual(["Cäsar", "Berta", "Dora", "Emil", "Anton"]);
  });

  it("ändert die Eingabe nicht", () => {
    order("name-desc");
    expect(cards[0].title).toBe("Berta");
  });
});

describe("splitByClaim", () => {
  const lps = toLoadpointCards(loadpoints, "de");
  const meters = toMeterCards([{ name: "kuehl", title: "Kühlschrank", power: 120 }], [], "de");
  const split = (claimed: string[], sort: SortOrder = "name-asc") =>
    splitByClaim(lps, meters, {
      isClaimed: (item) => claimed.includes(item.title),
      sort,
      locale: "de",
      powerOf: (item) => item.card.power,
    });
  const titles = (items: CardItem[]) => items.map((item) => item.title);

  it("trennt beanspruchte und übrige Karten, gemischt nach Art", () => {
    const result = split(["Waschmaschine", "Kühlschrank"]);
    expect(titles(result.switchable)).toEqual(["Kühlschrank", "Waschmaschine"]);
    expect(titles(result.measured)).toEqual(["Wärmepumpe"]);
    expect(result.switchable.map((item) => item.kind)).toEqual(["meter", "loadpoint"]);
  });

  it("sortiert beide Abschnitte nach der Einstellung", () => {
    const result = split([], "power-desc");
    expect(result.switchable).toEqual([]);
    expect(titles(result.measured)).toEqual(["Kühlschrank", "Wärmepumpe", "Waschmaschine"]);
  });

  it("liefert die CardRef je Art", () => {
    const [kuehl, , wasch] = split([]).measured;
    expect(cardRef(kuehl)).toEqual({
      kind: "meter",
      usage: "consumer",
      name: "kuehl",
      title: "Kühlschrank",
    });
    expect(cardRef(wasch)).toEqual({ kind: "loadpoint", index: 2, title: "Waschmaschine" });
  });
});
