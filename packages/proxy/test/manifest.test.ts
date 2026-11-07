import { describe, expect, it } from "vitest";
import { AddonError } from "../src/addons/errors.js";
import { parseManifest } from "../src/addons/manifest.js";
import { manifest } from "./zip-fixtures.js";

function codeOf(raw: unknown): string | undefined {
  try {
    parseManifest(raw);
    return undefined;
  } catch (err) {
    return err instanceof AddonError ? err.code : "other";
  }
}

describe("parseManifest", () => {
  it("akzeptiert ein gültiges Manifest", () => {
    expect(parseManifest(manifest({ description: "Beispiel", extra: 1 }))).toEqual({
      id: "hello",
      name: { de: "Hallo Welt", en: "Hello World" },
      version: "0.1.0",
      description: "Beispiel",
      apiVersion: 1,
      entry: "index.js",
    });
  });

  it.each(["_core", "A", "a", "a".repeat(41), "1abc", "ab_c", "ab/c"])(
    "lehnt die id %s ab",
    (id) => {
      expect(codeOf(manifest({ id }))).toBe("id-invalid");
    },
  );

  it("akzeptiert ids mit Bindestrich und Ziffern", () => {
    expect(codeOf(manifest({ id: "my-addon2" }))).toBeUndefined();
    expect(codeOf(manifest({ id: "a".repeat(40) }))).toBeUndefined();
  });

  it.each(["1.0", "v1.0.0", "1.0.0.0", "1.0.0-"])("lehnt die Version %s ab", (version) => {
    expect(codeOf(manifest({ version }))).toBe("version-invalid");
  });

  it("akzeptiert Vorabversionen", () => {
    expect(codeOf(manifest({ version: "1.0.0-beta.1" }))).toBeUndefined();
  });

  it("lehnt apiVersion 2 ab", () => {
    expect(codeOf(manifest({ apiVersion: 2 }))).toBe("api-version-unsupported");
  });

  it.each([
    ["kein Objekt", "text"],
    ["id fehlt", manifest({ id: undefined })],
    ["name fehlt", manifest({ name: undefined })],
    ["name leer", manifest({ name: {} })],
    ["entry kein js", manifest({ entry: "index.ts" })],
    ["entry absolut", manifest({ entry: "/index.js" })],
    ["entry mit ..", manifest({ entry: "../index.js" })],
    ["apiVersion als Text", manifest({ apiVersion: "1" })],
    ["description leer", manifest({ description: "" })],
  ])("meldet manifest-invalid: %s", (_label, raw) => {
    expect(codeOf(raw)).toBe("manifest-invalid");
  });

  it("nennt das fehlerhafte Feld", () => {
    expect(() => parseManifest(manifest({ entry: 3 }))).toThrow(/entry/);
  });
});

const BOOL_DEF = { key: "showPv", type: "boolean", label: { de: "PV", en: "PV" }, default: true };
const SELECT_DEF = {
  key: "sort",
  type: "select",
  label: "Sortierung",
  default: "a",
  options: [
    { value: "a", label: "A" },
    { value: "b", label: { de: "B", en: "B" } },
  ],
};

function settingsError(settings: unknown): string {
  try {
    parseManifest(manifest({ settings }));
    return "kein Fehler";
  } catch (err) {
    expect(err).toMatchObject({ code: "manifest-invalid" });
    return (err as Error).message;
  }
}

describe("parseManifest: settings", () => {
  it("übernimmt ein gültiges Schema", () => {
    const parsed = parseManifest(manifest({ settings: [BOOL_DEF, SELECT_DEF] }));
    expect(parsed.settings).toEqual([BOOL_DEF, SELECT_DEF]);
  });

  it("lässt das Feld ohne settings weg", () => {
    expect(parseManifest(manifest())).not.toHaveProperty("settings");
  });

  it.each([
    ["keine Liste", { a: 1 }, "settings muss eine Liste sein"],
    ["doppelter Key", [BOOL_DEF, { ...SELECT_DEF, key: "showPv" }], "settings[1].key"],
    ["ungültiger Key", [{ ...BOOL_DEF, key: "1x" }], "settings[0].key"],
    ["Key zu lang", [{ ...BOOL_DEF, key: "a".repeat(41) }], "settings[0].key"],
    ["label fehlt", [{ ...BOOL_DEF, label: undefined }], "settings[0].label"],
    ["falscher Default-Typ", [{ ...BOOL_DEF, default: "ja" }], "settings[0].default"],
    [
      "Default nicht in den Optionen",
      [BOOL_DEF, { ...SELECT_DEF, default: "c" }],
      "settings[1].default muss eine der options sein",
    ],
    ["leere Optionen", [{ ...SELECT_DEF, options: [] }], "settings[0].options"],
    [
      "doppelte Option",
      [{ ...SELECT_DEF, options: [SELECT_DEF.options[0], SELECT_DEF.options[0]] }],
      "settings[0].options[1].value",
    ],
    [
      "Option zu lang",
      [{ ...SELECT_DEF, options: [{ value: "x".repeat(41), label: "X" }] }],
      "settings[0].options[0].value",
    ],
    [
      "mehr als 20 Einträge",
      Array.from({ length: 21 }, (_, i) => ({ ...BOOL_DEF, key: `k${i}` })),
      "höchstens 20",
    ],
    ["unbekannter type", [{ ...BOOL_DEF, type: "number" }], "settings[0].type"],
  ])("meldet manifest-invalid: %s", (_label, settings, expected) => {
    expect(settingsError(settings)).toContain(expected);
  });
});
