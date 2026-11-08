import { describe, expect, it } from "vitest";
import type { SwitchInfo } from "../src/addons-client.js";
import { buildSwitchYaml } from "../src/manager/switch-yaml.js";

const TOKEN = "ab".repeat(32);

function info(hasMeter: boolean): SwitchInfo {
  return {
    id: "a1b2c3d4",
    name: "Lampe",
    type: "tapo",
    loadpoint: "Lampe",
    loadpointFound: true,
    status: {
      reachable: true,
      on: true,
      power: hasMeter ? 35 : null,
      hasMeter,
      error: null,
      held: false,
      modeError: null,
      updatedAt: null,
    },
    token: TOKEN,
  };
}

const BASE = `http://evcc.local/addons-api/switches/a1b2c3d4/${TOKEN}`;

describe("buildSwitchYaml", () => {
  it("erzeugt YAML mit Messung", () => {
    expect(buildSwitchYaml(info(true), "http://evcc.local/")).toBe(
      [
        "enabled:",
        "  source: http",
        `  uri: ${BASE}/state`,
        "  jq: .on",
        "enable:",
        "  source: http",
        `  uri: ${BASE}/set?on={{.enable}}`,
        "  method: POST",
        "power:",
        "  source: http",
        `  uri: ${BASE}/state`,
        "  jq: .power",
        "standbypower: 0",
        "features:",
        "  - switchdevice",
        "  - integrateddevice",
        "",
      ].join("\n"),
    );
  });

  it("ersetzt ohne Messung power durch eine feste Leistung", () => {
    const yaml = buildSwitchYaml(info(false), "http://evcc.local/");
    expect(yaml).not.toContain("power:\n");
    expect(yaml).not.toContain("jq: .power");
    expect(yaml).toContain("standbypower: -100 # feste Leistung in W, bitte anpassen");
  });

  it("übernimmt Port und Unterpfad der Seite", () => {
    const yaml = buildSwitchYaml(info(true), "https://haus.example:8443/evcc/");
    expect(yaml).toContain(
      `uri: https://haus.example:8443/evcc/addons-api/switches/a1b2c3d4/${TOKEN}/state`,
    );
  });
});
