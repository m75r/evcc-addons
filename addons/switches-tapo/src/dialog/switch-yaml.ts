// YAML für evcc: Charger „Benutzerdefinierte schaltbare Steckdose“ über das Schalt-Gateway
import type { SwitchInfo } from "./client.js";

/** Präfix des Gateways seit 1.0.0 (vorher /addons-api/switches/ im Kern des Proxys) */
export const GATEWAY_PREFIX = "addons-api/ext/switches-tapo/";

/** Basis der Gateway-URLs, z. B. http://evcc.local/addons-api/ext/switches-tapo/<id>/<token>/ */
export function gatewayBase(info: SwitchInfo, pageBase: string): string {
  const path = `${GATEWAY_PREFIX}${encodeURIComponent(info.id)}/${info.token ?? ""}/`;
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

/** Zähler-YAML für evcc „Benutzerdefiniertes Gerät“ eines Verbrauchers: nur Leistung, evcc schaltet nie */
export function buildMeterYaml(info: SwitchInfo, pageBase: string): string {
  const base = gatewayBase(info, pageBase);
  return ["power:", "  source: http", `  uri: ${base}state`, "  jq: .power // 0"].join("\n") + "\n";
}

/** YAML passend zur Bindung */
export function buildYaml(info: SwitchInfo, pageBase: string): string {
  return info.target.kind === "consumer"
    ? buildMeterYaml(info, pageBase)
    : buildSwitchYaml(info, pageBase);
}
