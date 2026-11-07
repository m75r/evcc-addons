import type { SettingDef } from "@evcc-addons/sdk";
import { describe, expect, it } from "vitest";
import {
  keepValidValues,
  resolveSettingValues,
  validateSettingValues,
} from "../src/addons/settings.js";

const DEFS: SettingDef[] = [
  { key: "showPv", type: "boolean", label: "PV", default: true },
  {
    key: "sort",
    type: "select",
    label: "Sortierung",
    default: "a",
    options: [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ],
  },
];

describe("keepValidValues", () => {
  it("behält nur bekannte Schlüssel mit gültigem Wert, ohne Defaults", () => {
    expect(keepValidValues(DEFS, { showPv: false, sort: "x", other: 1 })).toEqual({
      showPv: false,
    });
    expect(keepValidValues(DEFS, { showPv: "nein", sort: "b" })).toEqual({ sort: "b" });
  });

  it.each([undefined, null, "text", [true]])("liefert {} für %s", (stored) => {
    expect(keepValidValues(DEFS, stored)).toEqual({});
  });

  it("liest keine geerbten Eigenschaften", () => {
    const defs: SettingDef[] = [{ key: "constructor", type: "boolean", label: "x", default: true }];
    expect(keepValidValues(defs, {})).toEqual({});
  });
});

describe("resolveSettingValues", () => {
  it("ergänzt fehlende und ungültige Werte mit dem Default", () => {
    expect(resolveSettingValues(DEFS, undefined)).toEqual({ showPv: true, sort: "a" });
    expect(resolveSettingValues(DEFS, { showPv: false, sort: "zzz", gone: true })).toEqual({
      showPv: false,
      sort: "a",
    });
  });

  it("liefert {} ohne Schema", () => {
    expect(resolveSettingValues([], { showPv: false })).toEqual({});
  });
});

describe("validateSettingValues", () => {
  it("akzeptiert eine Teilmenge", () => {
    expect(validateSettingValues(DEFS, { sort: "b" })).toEqual({ sort: "b" });
    expect(validateSettingValues(DEFS, {})).toEqual({});
  });

  it.each([
    [{ foo: true }, "foo: unbekannte Einstellung"],
    [{ showPv: "ja" }, "showPv: muss true oder false sein"],
    [{ sort: 1 }, "sort: muss ein Text sein"],
    [{ sort: "foo" }, 'sort: unbekannte Option "foo"'],
    ["text", "values: muss ein Objekt sein"],
    [null, "values: muss ein Objekt sein"],
  ])("lehnt %j ab", (input, message) => {
    expect(() => validateSettingValues(DEFS, input)).toThrow(
      expect.objectContaining({ code: "settings-invalid", message }),
    );
  });
});
