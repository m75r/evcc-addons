// Steckdosen des Schalt-Gateways: gespeicherte Konfiguration, Eingaben und Laufzeitstatus
import { SwitchInputError } from "./errors.js";
import { isRecord } from "./util.js";

export const SWITCH_TYPES = ["tapo"] as const;
export type SwitchType = (typeof SWITCH_TYPES)[number];

export const TARGET_KINDS = ["loadpoint", "consumer"] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

/** Gebundenes evcc-Gerät, über seinen Titel (Verbraucher ohne Titel: `name`) */
export interface SwitchTarget {
  kind: TargetKind;
  title: string;
}

export interface SwitchConfig {
  id: string;
  name: string;
  type: SwitchType;
  /** `host[:port]` ohne Schema und Pfad */
  host: string;
  user: string;
  password: string;
  /** Ladepunkt: evcc schaltet und setzt bei Schaltung am Gerät den Modus; Verbraucher: nur Messung */
  target: SwitchTarget;
  /** Geheimnis in den Gateway-URLs für evcc (64 Hex-Zeichen) */
  token: string;
}

/** Bearbeitbare Felder einer Steckdose */
export type SwitchFields = Omit<SwitchConfig, "id" | "token">;

export interface SwitchStatus {
  /** null, solange noch nicht gelesen wurde */
  reachable: boolean | null;
  on: boolean | null;
  /** Leistung in W, null ohne Messung oder unbekannt */
  power: number | null;
  hasMeter: boolean | null;
  error: string | null;
  /** Halt nach einer Schaltung am Gerät aktiv (evcc-Gegenbefehle werden unterdrückt) */
  held: boolean;
  /** Letzter Fehler beim Setzen des Ladepunkt-Modus */
  modeError: string | null;
  updatedAt: string | null;
}

export const MAX_SWITCHES = 50;
const HOST_PATTERN = /^[A-Za-z0-9.-]+(:(\d{1,5}))?$/;

export function initialStatus(): SwitchStatus {
  return {
    reachable: null,
    on: null,
    power: null,
    hasMeter: null,
    error: null,
    held: false,
    modeError: null,
    updatedAt: null,
  };
}

/** Prüft eine Eingabe; beim Bearbeiten bleibt ein leeres Passwort unverändert */
export function validateSwitchInput(raw: unknown, existing?: SwitchConfig): SwitchFields {
  if (!isRecord(raw)) throw invalid("body", "Erwartet ein JSON-Objekt");
  return {
    name: textField(raw.name, "name", "Name", 60),
    type: typeField(raw.type),
    host: hostField(raw.host),
    user: textField(raw.user, "user", "Tapo-E-Mail", 200),
    password: passwordField(raw.password, existing),
    target: targetField(raw.target),
  };
}

function textField(value: unknown, field: string, label: string, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length === 0) throw invalid(field, `${label} fehlt`);
  if (text.length > max) throw invalid(field, `${label} ist länger als ${max} Zeichen`);
  return text;
}

/** `{ kind: "loadpoint" | "consumer", title }` mit Titel 1–200 Zeichen */
export function targetField(value: unknown): SwitchTarget {
  if (!isRecord(value) || !TARGET_KINDS.includes(value.kind as TargetKind)) {
    throw invalid("target", "Gerät aus evcc fehlt (Ladepunkt oder Verbraucher)");
  }
  return {
    kind: value.kind as TargetKind,
    title: textField(value.title, "target", "Gerät aus evcc", 200),
  };
}

function typeField(value: unknown): SwitchType {
  if (!SWITCH_TYPES.includes(value as SwitchType)) {
    throw invalid("type", `Typ ${JSON.stringify(value)} wird nicht unterstützt (erlaubt: tapo)`);
  }
  return value as SwitchType;
}

function hostField(value: unknown): string {
  const host = typeof value === "string" ? value.trim() : "";
  const match = HOST_PATTERN.exec(host);
  if (!match || (match[2] !== undefined && Number(match[2]) > 65535)) {
    throw invalid(
      "host",
      "Adresse muss die Form host oder host:port haben (ohne http:// und Pfad)",
    );
  }
  return host;
}

/** Passwörter werden nicht getrimmt; leer ist nur beim Bearbeiten erlaubt */
function passwordField(value: unknown, existing?: SwitchConfig): string {
  const password = typeof value === "string" ? value : "";
  if (password === "" && existing) return existing.password;
  if (password === "") throw invalid("password", "Tapo-Passwort fehlt");
  if (password.length > 200) throw invalid("password", "Tapo-Passwort ist länger als 200 Zeichen");
  return password;
}

function invalid(field: string, message: string): SwitchInputError {
  return new SwitchInputError(message, field);
}
