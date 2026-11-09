import { describe, expect, it } from "vitest";
import type { SwitchInfo } from "../src/dialog/client.js";
import { buildMeterYaml, buildSwitchYaml } from "../src/dialog/switch-yaml.js";

const TOKEN = "ab".repeat(32);

function info(hasMeter: boolean): SwitchInfo {
  return {
    id: "a1b2c3d4",
    name: "Lampe",
    type: "tapo",
    target: { kind: "loadpoint", title: "Lampe" },
    targetFound: true,
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

const BASE = `http://evcc.local/addons-api/ext/switches-tapo/a1b2c3d4/${TOKEN}`;

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
      `uri: https://haus.example:8443/evcc/addons-api/ext/switches-tapo/a1b2c3d4/${TOKEN}/state`,
    );
  });
});

describe("buildMeterYaml", () => {
  it("liest nur die Leistung über das Gateway, 0 ohne Messwert", () => {
    const consumer = { ...info(true), target: { kind: "consumer" as const, title: "Kaffee" } };
    expect(buildMeterYaml(consumer, "http://evcc.local/")).toBe(
      ["power:", "  source: http", `  uri: ${BASE}/state`, "  jq: .power // 0", ""].join("\n"),
    );
  });
});
