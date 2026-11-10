import { describe, expect, it } from "vitest";
import { AddonError } from "../src/addons/errors.js";
import { parseCatalogFile } from "../src/catalog/entry.js";
import { catalogYaml } from "./catalog-fixtures.js";

function parseError(text: string, fileName = "hello.yaml"): AddonError {
  try {
    parseCatalogFile(text, fileName);
  } catch (err) {
    if (err instanceof AddonError) return err;
    throw err;
  }
  throw new Error("kein Fehler");
}

describe("parseCatalogFile", () => {
  it("liest einen gültigen Eintrag und ersetzt {version} in url", () => {
    expect(parseCatalogFile(catalogYaml({ unbekannt: 1 }), "hello.yaml")).toEqual({
      id: "hello",
      name: { de: "Hallo Welt", en: "Hello World" },
      description: { de: "Beispiel", en: "Example" },
      homepage: "https://example.com/hello",
      version: "0.1.0",
      apiVersion: 1,
      url: "https://example.com/releases/0.1.0/hello-0.1.0.zip",
      sha256: "a".repeat(64),
    });
  });

  it("schreibt sha256 klein und akzeptiert http-URLs", () => {
    const entry = parseCatalogFile(
      catalogYaml({ sha256: "AB".repeat(32), url: "http://127.0.0.1:1/x.zip" }),
      "hello.yaml",
    );
    expect(entry.sha256).toBe("ab".repeat(32));
    expect(entry.url).toBe("http://127.0.0.1:1/x.zip");
  });

  it.each([
    [{ id: "other" }, "hello.yaml", /id "other" muss dem Dateinamen hello entsprechen/],
    [{ id: "Hello" }, "Hello.yaml", /id "Hello" ist keine gültige Addon-id/],
    [{ url: "ftp://example.com/x.zip" }, "hello.yaml", /url muss eine http\(s\)-URL sein/],
    [{ homepage: "kein-url" }, "hello.yaml", /homepage muss eine http\(s\)-URL sein/],
    [{ sha256: undefined }, "hello.yaml", /sha256 fehlt/],
    [{ sha256: "abc" }, "hello.yaml", /sha256 muss 64 Hex-Zeichen haben/],
    [{ version: "1.0" }, "hello.yaml", /version "1.0" ist keine Version/],
    [{ version: 1 }, "hello.yaml", /version fehlt oder ist kein Text/],
    [{ apiVersion: 0 }, "hello.yaml", /apiVersion muss eine ganze Zahl ≥ 1 sein/],
    [{ name: 42 }, "hello.yaml", /name muss ein Text oder ein Objekt/],
    [{ description: undefined }, "hello.yaml", /description muss ein Text oder ein Objekt/],
  ])("lehnt %o ab", (overrides, fileName, message) => {
    const error = parseError(catalogYaml(overrides), fileName);
    expect(error.code).toBe("catalog-invalid");
    expect(error.message).toMatch(new RegExp(`^Ungültiger Katalogeintrag ${fileName}: `));
    expect(error.message).toMatch(message);
  });

  it("meldet kaputtes YAML mit Dateinamen", () => {
    const error = parseError("id: [kaputt", "broken.yaml");
    expect(error.code).toBe("catalog-invalid");
    expect(error.message).toMatch(/^Ungültiger Katalogeintrag broken.yaml: YAML ungültig/);
  });

  it("lehnt eine Liste statt eines Objekts ab", () => {
    expect(parseError("- a\n- b\n").message).toMatch(/muss ein YAML-Objekt sein/);
  });
});
