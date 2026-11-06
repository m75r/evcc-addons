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
