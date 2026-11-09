import { strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { AddonError } from "../src/addons/errors.js";
import { readAddonZip } from "../src/addons/package.js";
import { LIMITS, addonZip, manifest, rawZip } from "./zip-fixtures.js";

function codeOf(zip: Uint8Array, limits = LIMITS): string | undefined {
  try {
    readAddonZip(zip, limits);
    return undefined;
  } catch (err) {
    return err instanceof AddonError ? err.code : `other: ${String(err)}`;
  }
}

const js = strToU8("export {}");

/** Setzt `originalSize` aller Einträge im Central Directory auf einen großen Wert */
function forgeOriginalSize(zip: Uint8Array, size: number): Uint8Array {
  const copy = zip.slice();
  const view = new DataView(copy.buffer);
  for (let i = 0; i < copy.length - 4; i++) {
    if (view.getUint32(i, true) === 0x02014b50) view.setUint32(i + 24, size, true);
  }
  return copy;
}

/** Ersetzt einen Eintragsnamen in Local Header und Central Directory (gleiche Länge) */
function renameEntry(zip: Uint8Array, from: string, to: string): Uint8Array {
  const copy = zip.slice();
  const [a, b] = [strToU8(from), strToU8(to)];
  for (let i = 0; i <= copy.length - a.length; i++) {
    if (a.every((byte, j) => copy[i + j] === byte)) copy.set(b, i);
  }
  return copy;
}

describe("readAddonZip", () => {
  it("liest Manifest und Dateien", () => {
    const pkg = readAddonZip(addonZip(), LIMITS);
    expect(pkg.manifest.id).toBe("hello");
    expect([...pkg.files.keys()].sort()).toEqual(["addon.json", "index.js"]);
  });

  it.each(["../evil.js", "/abs.js", "a\\b.js", "C:/x.js", "a/../../b.js"])(
    "meldet zip-slip für %s",
    (name) => {
      expect(codeOf(addonZip({}, { [name]: js }))).toBe("zip-slip");
    },
  );

  it("meldet zip-slip für __proto__", () => {
    // fflate kann keinen Eintrag __proto__ schreiben: Platzhalter gleicher Länge ersetzen
    expect(codeOf(renameEntry(addonZip({}, { __protoX_: js }), "__protoX_", "__proto__"))).toBe(
      "zip-slip",
    );
  });

  it("meldet too-large bei zu großem Inhalt", () => {
    const big = new Uint8Array(2 * 1024 * 1024);
    expect(codeOf(addonZip({}, { "big.bin": big }), { ...LIMITS, maxBytes: 1024 * 1024 })).toBe(
      "too-large",
    );
  });

  it("bricht bei manipuliertem originalSize vor der Allokation ab", () => {
    expect(codeOf(forgeOriginalSize(addonZip(), 0xfffffff0))).toBe("too-large");
  });

  it("meldet too-many-files ab 501 Dateien", () => {
    const files: Record<string, Uint8Array> = {};
    for (let i = 0; i < 500; i++) files[`f${i}.js`] = js;
    expect(codeOf(addonZip({}, files))).toBe("too-many-files");
  });

  it("meldet manifest-missing, entry-missing und zip-invalid", () => {
    expect(codeOf(rawZip({ "index.js": js }))).toBe("manifest-missing");
    expect(codeOf(rawZip({ "addon.json": strToU8(JSON.stringify(manifest())) }))).toBe(
      "entry-missing",
    );
    expect(codeOf(strToU8("das ist keine zip-datei, sondern müll"))).toBe("zip-invalid");
    expect(codeOf(rawZip({ "addon.json": strToU8("{kaputt"), "index.js": js }))).toBe(
      "manifest-invalid",
    );
  });

  it("meldet entry-missing, wenn die Datei aus server fehlt", () => {
    const zip = addonZip({ apiVersion: 2, server: "server.mjs" });
    expect(codeOf(zip)).toBe("entry-missing");
    expect(() => readAddonZip(zip, LIMITS)).toThrow("server.mjs fehlt im Paket");
    const complete = addonZip({ apiVersion: 2, server: "server.mjs" }, { "server.mjs": js });
    expect(readAddonZip(complete, LIMITS).manifest.server).toBe("server.mjs");
  });

  it("ignoriert Verzeichniseinträge", () => {
    const pkg = readAddonZip(addonZip({}, { "foo/": new Uint8Array(0) }), LIMITS);
    expect([...pkg.files.keys()].sort()).toEqual(["addon.json", "index.js"]);
  });

  it("entfernt einen gemeinsamen Wurzelordner", () => {
    const zip = rawZip({
      "hello/": new Uint8Array(0),
      "hello/addon.json": strToU8(JSON.stringify(manifest({ entry: "dist/index.js" }))),
      "hello/dist/index.js": js,
    });
    const pkg = readAddonZip(zip, LIMITS);
    expect([...pkg.files.keys()].sort()).toEqual(["addon.json", "dist/index.js"]);
  });
});
