import { describe, expect, it } from "vitest";
import { formatEnergyKWh, formatEnergyWh, formatPower } from "../src/format.js";

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
