import { describe, expect, it } from "vitest";
import { compareVersions } from "../src/addons/version.js";

describe("compareVersions", () => {
  it.each([
    ["1.10.0", "1.9.0"],
    ["2.0.0", "1.99.99"],
    ["1.0.1", "1.0.0"],
    ["1.0.0", "1.0.0-beta"],
    ["1.0.0-alpha.10", "1.0.0-alpha.2"],
    ["1.0.0-beta", "1.0.0-alpha"],
    ["1.0.0-alpha", "1.0.0-1"],
    ["1.0.0-alpha.1", "1.0.0-alpha"],
    ["1.0.0-rc.1", "1.0.0-beta.11"],
  ])("%s > %s", (newer, older) => {
    expect(compareVersions(newer, older)).toBeGreaterThan(0);
    expect(compareVersions(older, newer)).toBeLessThan(0);
  });

  it.each(["1.2.3", "1.0.0-alpha.1"])("%s ist gleich zu sich selbst", (version) => {
    expect(compareVersions(version, version)).toBe(0);
  });
});
