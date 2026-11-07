import { describe, expect, it } from "vitest";
import { loaderVersion } from "../src/version.js";

const BASE = "http://pi:7070/addons-static/_core/loader.js";

describe("loaderVersion", () => {
  it("liest v aus der Loader-URL", () => {
    expect(loaderVersion(`${BASE}?v=1.0.0`)).toBe("1.0.0");
  });

  it("dekodiert URL-kodierte Werte", () => {
    expect(loaderVersion(`${BASE}?v=${encodeURIComponent("1.0.0-rc.1")}`)).toBe("1.0.0-rc.1");
  });

  it.each([BASE, `${BASE}?v=`, `${BASE}?x=1`])("liefert null für %s", (url) => {
    expect(loaderVersion(url)).toBeNull();
  });
});
