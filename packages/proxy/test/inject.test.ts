import { describe, expect, it } from "vitest";
import { injectLoader, isIndexRequest, loaderTag } from "../src/proxy/inject.js";

const TAG = "<script>x</script>";

describe("injectLoader", () => {
  it("fügt vor </head> ein", () => {
    const result = injectLoader("<html><head><title>t</title></head><body></body></html>", TAG);
    expect(result).toEqual({
      html: `<html><head><title>t</title>${TAG}</head><body></body></html>`,
      injected: true,
    });
  });

  it("weicht auf </body> aus", () => {
    expect(injectLoader("<body><p>x</p></body>", TAG).html).toBe(`<body><p>x</p>${TAG}</body>`);
  });

  it("lässt HTML ohne </head> und </body> unverändert", () => {
    expect(injectLoader("<p>nur text</p>", TAG)).toEqual({
      html: "<p>nur text</p>",
      injected: false,
    });
  });

  it("nutzt nur das erste Vorkommen", () => {
    const html = "<head></head><script>'</head>'</script>";
    expect(injectLoader(html, TAG).html).toBe(`<head>${TAG}</head><script>'</head>'</script>`);
  });

  it("ignoriert Groß- und Kleinschreibung", () => {
    expect(injectLoader("<HEAD></HEAD>", TAG).html).toBe(`<HEAD>${TAG}</HEAD>`);
  });
});

describe("isIndexRequest", () => {
  it("erkennt nur GET /", () => {
    expect(isIndexRequest({ method: "GET", url: "/" })).toBe(true);
    expect(isIndexRequest({ method: "GET", url: "/?foo=1" })).toBe(true);
    expect(isIndexRequest({ method: "HEAD", url: "/" })).toBe(false);
    expect(isIndexRequest({ method: "GET", url: "/api/state" })).toBe(false);
  });
});

describe("loaderTag", () => {
  it("enthält die Version", () => {
    expect(loaderTag("0.1.0")).toBe(
      '<script type="module" src="./addons-static/_core/loader.js?v=0.1.0"></script>',
    );
  });
});
