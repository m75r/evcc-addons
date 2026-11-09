import { describe, expect, it } from "vitest";
import { SwitchInputError } from "../../src/server/errors.js";
import { validateSwitchInput } from "../../src/server/model.js";

const INPUT = {
  name: "Kaffeemaschine",
  type: "tapo",
  host: "192.168.1.51",
  user: "ich@example.com",
  password: "geheim",
  target: { kind: "consumer", title: "Kaffeemaschine" },
};

function fieldError(change: Record<string, unknown>): unknown {
  try {
    validateSwitchInput({ ...INPUT, ...change });
    return undefined;
  } catch (err) {
    return err;
  }
}

describe("validateSwitchInput: target", () => {
  it("übernimmt Ladepunkt- und Verbraucher-Bindungen mit getrimmtem Titel", () => {
    expect(validateSwitchInput(INPUT).target).toEqual({
      kind: "consumer",
      title: "Kaffeemaschine",
    });
    const loadpoint = { target: { kind: "loadpoint", title: " Lampe " } };
    expect(validateSwitchInput({ ...INPUT, ...loadpoint }).target).toEqual({
      kind: "loadpoint",
      title: "Lampe",
    });
  });

  it.each([
    ["fehlt", { target: undefined }],
    ["ist kein Objekt", { target: "Lampe" }],
    ["falsche kind", { target: { kind: "charger", title: "Lampe" } }],
    ["leerer Titel", { target: { kind: "loadpoint", title: "" } }],
    ["zu langer Titel", { target: { kind: "consumer", title: "x".repeat(201) } }],
  ])("meldet switch-invalid mit field target: %s", (_label, change) => {
    const error = fieldError(change);
    expect(error).toBeInstanceOf(SwitchInputError);
    expect(error).toMatchObject({ field: "target" });
  });
});
