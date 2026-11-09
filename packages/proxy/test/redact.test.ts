import { describe, expect, it } from "vitest";
import { redactPath } from "../src/http/redact.js";

describe("redactPath", () => {
  it("schwärzt den Sub-Pfad von /addons-api/ext/<id>/…", () => {
    expect(redactPath("/addons-api/ext/x/a/b?c")).toBe("/addons-api/ext/x/***");
    expect(redactPath("/addons-api/ext/x/")).toBe("/addons-api/ext/x/***");
    expect(redactPath("/addons-api/ext/x?token=1")).toBe("/addons-api/ext/x/***");
  });

  it("lässt andere Pfade unverändert", () => {
    expect(redactPath("/addons-api/ext/x")).toBe("/addons-api/ext/x");
    expect(redactPath("/addons-api/addons/x")).toBe("/addons-api/addons/x");
    expect(redactPath(undefined)).toBeUndefined();
  });
});
