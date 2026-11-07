import { describe, expect, it } from "vitest";
import {
  displayEnergyWh,
  displayPower,
  formatEnergyKWh,
  formatEnergyWh,
  formatPower,
} from "../src/format.js";

describe("displayPower / displayEnergyWh", () => {
  const blank = { text: "–", muted: true };

  it.each([undefined, 0, 0.4, -0.4, Number.NaN])("zeigt %s als „–“ grau", (value) => {
    expect(displayPower(value, "de")).toEqual(blank);
    expect(displayEnergyWh(value, "de")).toEqual(blank);
  });

  it.each([
    [0.5, "1 W", "1 Wh"],
    [150, "150 W", "150 Wh"],
    [2100, "2,1 kW", "2,1 kWh"],
  ])("zeigt %s normal", (value, power, energy) => {
    expect(displayPower(value, "de")).toEqual({ text: power, muted: false });
    expect(displayEnergyWh(value, "de")).toEqual({ text: energy, muted: false });
  });
});

describe("format", () => {
  it("formatiert Leistung wie evcc", () => {
    expect(formatPower(0, "de")).toBe("0,0 kW");
    expect(formatPower(24, "de")).toBe("24 W");
    expect(formatPower(1300, "de")).toBe("1,3 kW");
    expect(formatPower(undefined, "de")).toBe("–");
  });

  it("formatiert Energie", () => {
    expect(formatEnergyWh(499, "de")).toBe("499 Wh");
    expect(formatEnergyKWh(1.3, "de")).toBe("1,3 kWh");
    expect(formatEnergyKWh(57.5, "de")).toBe("57,5 kWh");
    expect(formatEnergyKWh(undefined, "de")).toBe("–");
  });

  it("nutzt in en einen Punkt", () => {
    expect(formatPower(1300, "en")).toBe("1.3 kW");
    expect(formatEnergyKWh(1.3, "en-US")).toBe("1.3 kWh");
  });
});
