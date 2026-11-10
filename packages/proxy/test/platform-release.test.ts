import { describe, expect, it } from "vitest";
import { AddonError } from "../src/addons/errors.js";
import { debAssetName, isDebAsset, parseRelease } from "../src/platform/release.js";
import { releaseJson } from "./release-fixtures.js";

const HTTPS_URL = "https://api.github.com/repos/m75r/evcc-addons/releases/latest";
const HTTP_URL = "http://127.0.0.1:1234/releases/latest";
const SHA = "a".repeat(64);

function parse(fields: Record<string, unknown> = {}, url = HTTPS_URL) {
  return parseRelease(JSON.stringify(releaseJson({ ...fields })), url);
}

function invalidMessage(run: () => unknown): string {
  try {
    run();
  } catch (err) {
    expect(err).toBeInstanceOf(AddonError);
    expect((err as AddonError).code).toBe("release-invalid");
    return (err as Error).message;
  }
  throw new Error("kein Fehler geworfen");
}

describe("parseRelease", () => {
  it("liest Version, Datum, Versionshinweise und .deb", () => {
    expect(parse()).toEqual({
      version: "2.2.0",
      publishedAt: "2026-11-12T10:00:00Z",
      notesUrl: "https://github.com/m75r/evcc-addons/releases/tag/v2.2.0",
      deb: {
        url: "https://github.com/m75r/evcc-addons/releases/download/v2.2.0/evcc-addons_2.2.0_all.deb",
        sha256: SHA,
      },
    });
  });

  it("entfernt ein führendes v im Tag und akzeptiert Tags ohne v", () => {
    expect(parse({ tag_name: "v2.2.0" }).version).toBe("2.2.0");
    expect(parse({ tag_name: "2.2.0" }).version).toBe("2.2.0");
  });

  it("lehnt Text ohne JSON ab", () => {
    expect(invalidMessage(() => parseRelease("<html>", HTTPS_URL))).toMatch(/^kein JSON/);
    expect(invalidMessage(() => parseRelease("[]", HTTPS_URL))).toBe("kein JSON-Objekt");
  });

  it.each(["latest", "v2.2", "2.2.0+build"])("lehnt tag_name %s ab", (tag) => {
    expect(invalidMessage(() => parse({ tag_name: tag }))).toContain("keine Version");
  });

  it.each(["md5:" + SHA, "sha256:xyz", SHA, 42])("lehnt digest %s ab", (digest) => {
    expect(invalidMessage(() => parse({ digest }))).toContain("sha256:<64 hex>");
  });

  it.each([
    ["browser_download_url", { downloadUrl: "http://example.com/x.deb" }],
    ["html_url", { html_url: "http://github.com/x" }],
    ["html_url", { html_url: "ftp://github.com/x" }],
  ])("lehnt eine %s ohne https ab", (field, fields) => {
    expect(invalidMessage(() => parse(fields))).toBe(`${field} ist keine https-URL`);
  });

  it("erlaubt http-URLs nur bei http-releaseUrl", () => {
    const fields = { html_url: "http://127.0.0.1/notes", downloadUrl: "http://127.0.0.1/x.deb" };
    expect(parse(fields, HTTP_URL)).toMatchObject({
      notesUrl: "http://127.0.0.1/notes",
      deb: { url: "http://127.0.0.1/x.deb" },
    });
  });

  it("lehnt fehlende Pflichtfelder ab", () => {
    expect(invalidMessage(() => parse({ published_at: undefined }))).toBe("published_at fehlt");
    expect(invalidMessage(() => parse({ html_url: "" }))).toBe("html_url fehlt");
  });

  it("liefert deb null ohne Asset, ohne digest und bei digest null", () => {
    expect(parse({ assets: [] }).deb).toBeNull();
    expect(parse({ assetName: "evcc-addons_2.1.0_all.deb" }).deb).toBeNull();
    expect(parse({ digest: null }).deb).toBeNull();
    expect(parse({ digest: undefined }).deb).toBeNull();
  });

  it("findet das Asset einer Vorabversion in Debian-Schreibweise", () => {
    const release = parse({ tag_name: "v2.2.0-rc.1", assetName: "evcc-addons_2.2.0~rc.1_all.deb" });
    expect(release.version).toBe("2.2.0-rc.1");
    expect(release.deb?.sha256).toBe(SHA);
  });
});

describe("Asset-Namen", () => {
  it("erkennt beide Schreibweisen einer Vorabversion", () => {
    expect(isDebAsset("evcc-addons_2.2.0-rc.1_all.deb", "2.2.0-rc.1")).toBe(true);
    expect(isDebAsset("evcc-addons_2.2.0~rc.1_all.deb", "2.2.0-rc.1")).toBe(true);
    expect(isDebAsset("evcc-addons_2.2.0_all.deb", "2.2.0")).toBe(true);
    expect(isDebAsset("evcc-addons_2.2.0_arm64.deb", "2.2.0")).toBe(false);
    expect(isDebAsset("evcc-addons-sdk-2.2.0.tgz", "2.2.0")).toBe(false);
  });

  it("schreibt den Dateinamen wie nfpm", () => {
    expect(debAssetName("2.2.0")).toBe("evcc-addons_2.2.0_all.deb");
    expect(debAssetName("2.2.0-rc.1")).toBe("evcc-addons_2.2.0~rc.1_all.deb");
  });
});
