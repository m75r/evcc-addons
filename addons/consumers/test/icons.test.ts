import { describe, expect, it } from "vitest";
import { DEVICE_ICONS } from "../src/device-icons.js";
import { deviceIcon } from "../src/icons.js";

describe("deviceIcon", () => {
  it("liefert das evcc-Icon zum Namen", () => {
    expect(deviceIcon("dryer")).toBe(DEVICE_ICONS.dryer);
    expect(deviceIcon("dryer")).toMatch(/^<svg aria-hidden="true" width="24" height="24"/);
  });

  it("weicht bei unbekannten Namen auf generic aus", () => {
    expect(deviceIcon("car")).toBe(DEVICE_ICONS.generic);
    expect(deviceIcon("")).toBe(DEVICE_ICONS.generic);
  });

  it("enthält alle evcc-Geräte-Icons", () => {
    for (const name of [
      "generic",
      "smartconsumer",
      "heatpump",
      "bike",
      "microwave",
      "airpurifier",
    ]) {
      expect(DEVICE_ICONS[name]).toContain("<svg");
    }
  });
});
