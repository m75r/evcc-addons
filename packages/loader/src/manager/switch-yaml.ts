// YAML für evcc: Charger „Benutzerdefinierte schaltbare Steckdose“ über das Schalt-Gateway
import type { SwitchInfo } from "../addons-client.js";

/** Basis der Gateway-URLs, z. B. http://evcc.local/addons-api/switches/<id>/<token>/ */
export function gatewayBase(info: SwitchInfo, pageBase: string): string {
  const path = `addons-api/switches/${encodeURIComponent(info.id)}/${info.token ?? ""}/`;
  return new URL(path, pageBase).href;
}

/** Ohne Messung (P100) eine feste Leistung als Platzhalter statt `power` */
export function buildSwitchYaml(info: SwitchInfo, pageBase: string): string {
  const base = gatewayBase(info, pageBase);
  const lines = [
    "enabled:",
    "  source: http",
    `  uri: ${base}state`,
    "  jq: .on",
    "enable:",
    "  source: http",
    `  uri: ${base}set?on={{.enable}}`,
    "  method: POST",
    ...powerLines(info, base),
    "features:",
    "  - switchdevice",
    "  - integrateddevice",
  ];
  return lines.join("\n") + "\n";
}

function powerLines(info: SwitchInfo, base: string): string[] {
  if (info.status.hasMeter === false) {
    return ["standbypower: -100 # feste Leistung in W, bitte anpassen"];
  }
  return ["power:", "  source: http", `  uri: ${base}state`, "  jq: .power", "standbypower: 0"];
}
