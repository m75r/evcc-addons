import { describe, expect, it } from "vitest";
import { meterRows, normalizeMode, toMeterCards, toSwitchCards } from "../src/model.js";

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

describe("toSwitchCards", () => {
  it("filtert auf SwitchDevice, behält den 0-basierten Index und sortiert", () => {
    // Deutsche Sortierung: „ä“ zählt wie „a“, daher Wärmepumpe (r) vor Waschmaschine (s)
    expect(toSwitchCards(loadpoints, "de")).toEqual([
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
    expect(toSwitchCards(undefined, "de")).toEqual([]);
    expect(toSwitchCards([null, { chargerFeatureSwitchDevice: true }], "de")).toEqual([
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
        name: "heizstab",
        title: "heizstab",
        icon: "smartconsumer",
        power: 1500,
        energyKWh: undefined,
      },
      {
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
  const card = { name: "dyson", title: "Dyson", icon: "airpurifier", power: 24 };

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
});
