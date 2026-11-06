// Gerätewerte der Verbraucher-Meter wie auf der evcc-Konfigurationsseite
// (GET api/config/devices/meter/<name>/status, nur mit Admin-Login)
import type { AddonApi } from "@evcc-addons/sdk";

/** Ein Wert mit optionalem Lesefehler des Geräts (evcc testResult) */
export interface StatusField {
  value?: number;
  error?: string;
}

export interface MeterStatus {
  power?: StatusField;
  energy?: StatusField;
  /** kWh */
  chargedEnergy?: StatusField;
}

export type StatusResult =
  { kind: "ok"; status: MeterStatus } | { kind: "unauthorized" } | { kind: "missing" };

const FIELDS = ["power", "energy", "chargedEnergy"] as const;

function parseField(raw: unknown): StatusField | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const { value, error } = raw as { value?: unknown; error?: unknown };
  const field: StatusField = {};
  if (typeof value === "number") field.value = value;
  if (typeof error === "string" && error !== "") field.error = error;
  return field.value === undefined && field.error === undefined ? undefined : field;
}

export function parseStatus(raw: unknown): MeterStatus {
  const status: MeterStatus = {};
  if (typeof raw !== "object" || raw === null) return status;
  for (const key of FIELDS) {
    const field = parseField((raw as Record<string, unknown>)[key]);
    if (field) status[key] = field;
  }
  return status;
}

/** 401/403: nicht angemeldet, 404: Gerät deaktiviert oder unbekannt */
export async function fetchMeterStatus(api: AddonApi, name: string): Promise<StatusResult> {
  const res = await api.evccApi(`config/devices/meter/${encodeURIComponent(name)}/status`);
  if (res.status === 401 || res.status === 403) return { kind: "unauthorized" };
  if (res.status === 404) return { kind: "missing" };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { kind: "ok", status: parseStatus(await res.json()) };
}

/** Abfrageintervall wie evcc (Site-Intervall, sonst 30 s), mindestens 5 s zum Schutz der Geräte */
export function pollIntervalMs(api: AddonApi): number {
  const seconds = api.state.get("interval");
  const value = typeof seconds === "number" && seconds > 0 ? seconds : 30;
  return Math.max(value, 5) * 1000;
}
