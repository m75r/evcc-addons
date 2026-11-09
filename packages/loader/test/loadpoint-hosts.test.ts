import { describe, expect, it } from "vitest";
import { loadpointHosts } from "../src/addons-client.js";

// Ausschnitte aus GET /api/config/loadpoints und /api/config/devices/charger (evcc 0.318)
const LOADPOINTS = [
  { id: 1, name: "db:1", title: "Dyson Luftreiniger", charger: "db:3" },
  { id: 2, name: "db:2", title: "Wallbox", charger: "db:4" },
  { name: "0", title: "Aus YAML", charger: "yaml_tapo" },
];

const CHARGERS = [
  {
    id: 3,
    name: "db:3",
    type: "template",
    config: { template: "tapo", host: "192.168.1.50", user: "ich@example.com", password: "***" },
  },
  { id: 4, name: "db:4", type: "template", config: { template: "go-e", host: "192.168.1.9" } },
  { name: "yaml_tapo", type: "tapo" },
];

describe("loadpointHosts", () => {
  it("liefert die Adresse nur für Tapo-Charger mit bekannter Konfiguration", () => {
    expect(loadpointHosts(LOADPOINTS, CHARGERS)).toEqual({ "Dyson Luftreiniger": "192.168.1.50" });
  });

  it("verträgt unerwartete Antworten", () => {
    expect(loadpointHosts(null, { error: "x" })).toEqual({});
    expect(loadpointHosts([null, 1, { title: "A" }], [{ name: "x", config: null }])).toEqual({});
  });
});
