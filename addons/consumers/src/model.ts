// Reine Umrechnung der evcc-Live-Daten in Kartendaten
import type { CardRef } from "./extension-contract.js";
import type { MeterStatus } from "./meter-status.js";
import type { SortOrder } from "./settings.js";

export type Mode = "off" | "smart" | "now";

export interface LoadpointCardData {
  /** 0-basierter Index wie im WebSocket (REST-API: index + 1) */
  index: number;
  title: string;
  /** evcc-Icon-Name (`chargerIcon`), Standard `generic` */
  icon: string;
  power?: number;
  chargedEnergyWh?: number;
  enabled: boolean;
  mode: Mode | null;
}

export interface MeterCardData {
  usage: "consumer" | "aux";
  name: string;
  title: string;
  /** evcc-Icon-Name; Standard wie evcc: consumer `generic`, aux `smartconsumer` */
  icon: string;
  power?: number;
  energyKWh?: number;
}

type Raw = Record<string, unknown>;

const isObject = (value: unknown): value is Raw => typeof value === "object" && value !== null;
const num = (value: unknown) => (typeof value === "number" ? value : undefined);
const str = (value: unknown) => (typeof value === "string" ? value : "");

/** evcc kennt nur off/smart/now; die veralteten Werte pv und minpv gelten als smart */
export function normalizeMode(mode: unknown): Mode | null {
  if (mode === "off" || mode === "smart" || mode === "now") return mode;
  if (mode === "pv" || mode === "minpv") return "smart";
  return null;
}

/** Ladepunkte mit Steckdosen-Charger (Feature SwitchDevice) */
export function toLoadpointCards(loadpoints: unknown, locale: string): LoadpointCardData[] {
  if (!Array.isArray(loadpoints)) return [];
  const cards: LoadpointCardData[] = [];
  loadpoints.forEach((lp: unknown, index) => {
    if (!isObject(lp) || lp.chargerFeatureSwitchDevice !== true) return;
    cards.push({
      index,
      title: str(lp.title) || `#${index + 1}`,
      icon: str(lp.chargerIcon) || "generic",
      power: num(lp.chargePower),
      chargedEnergyWh: num(lp.chargedEnergy),
      enabled: lp.enabled === true,
      mode: normalizeMode(lp.mode),
    });
  });
  return sortByTitle(cards, locale);
}

/** consumer- und aux-Meter, angezeigt mit `title || name` */
export function toMeterCards(consumers: unknown, aux: unknown, locale: string): MeterCardData[] {
  const cards = [
    ...meterCards(consumers, "consumer", "generic"),
    ...meterCards(aux, "aux", "smartconsumer"),
  ];
  return sortByTitle(cards, locale);
}

function meterCards(
  list: unknown,
  usage: MeterCardData["usage"],
  defaultIcon: string,
): MeterCardData[] {
  if (!Array.isArray(list)) return [];
  return (list as unknown[]).filter(isObject).map((m) => ({
    usage,
    name: str(m.name),
    title: str(m.title) || str(m.name),
    icon: str(m.icon) || defaultIcon,
    power: num(m.power),
    energyKWh: num(m.energy),
  }));
}

/** Basisordnung nach Name, auch für die Abfrage-Reihenfolge der Gerätewerte */
function sortByTitle<T extends { title: string }>(cards: T[], locale: string): T[] {
  return [...cards].sort((a, b) => a.title.localeCompare(b.title, locale));
}

/**
 * Anzeige-Reihenfolge je Abschnitt. Bei Leistung stehen Karten ohne Wert (oder offline) in beiden
 * Richtungen am Ende, Gleichstand entscheidet der Name A–Z.
 */
export function sortCards<T extends { title: string }>(
  cards: T[],
  order: SortOrder,
  locale: string,
  powerOf: (card: T) => number | undefined,
): T[] {
  const byName = (a: T, b: T) => a.title.localeCompare(b.title, locale);
  if (order === "name-asc") return [...cards].sort(byName);
  if (order === "name-desc") return [...cards].sort((a, b) => byName(b, a));
  const direction = order === "power-desc" ? -1 : 1;
  return [...cards].sort((a, b) => comparePower(powerOf(a), powerOf(b), direction) || byName(a, b));
}

function comparePower(a: number | undefined, b: number | undefined, direction: number): number {
  if (a === undefined || b === undefined) {
    return (a === undefined ? 1 : 0) - (b === undefined ? 1 : 0);
  }
  return (a - b) * direction;
}

/** Karte der Seite, gleich welcher Art; `title` für die Sortierung */
export type CardItem =
  | { kind: "loadpoint"; title: string; card: LoadpointCardData }
  | { kind: "meter"; title: string; card: MeterCardData };

/** Karte für den Erweiterungspunkt consumers.cardActions */
export function cardRef(item: CardItem): CardRef {
  if (item.kind === "loadpoint") {
    return { kind: "loadpoint", index: item.card.index, title: item.card.title };
  }
  const { usage, name, title } = item.card;
  return { kind: "meter", usage, name, title };
}

export interface SplitOptions {
  isClaimed: (item: CardItem) => boolean;
  sort: SortOrder;
  locale: string;
  powerOf: (item: CardItem) => number | undefined;
}

/** „Schaltbar“ = von einem Anbieter beansprucht, „Nur Messung“ = Rest; beide nach `sort` */
export function splitByClaim(
  loadpoints: LoadpointCardData[],
  meters: MeterCardData[],
  opts: SplitOptions,
): { switchable: CardItem[]; measured: CardItem[] } {
  const items: CardItem[] = [
    ...loadpoints.map((card) => ({ kind: "loadpoint" as const, title: card.title, card })),
    ...meters.map((card) => ({ kind: "meter" as const, title: card.title, card })),
  ];
  const result = { switchable: [] as CardItem[], measured: [] as CardItem[] };
  for (const item of sortCards(items, opts.sort, opts.locale, opts.powerOf)) {
    (opts.isClaimed(item) ? result.switchable : result.measured).push(item);
  }
  return result;
}

/** Leistung einer Messkarte für die Sortierung; offline (Lesefehler) ergibt undefined */
export function meterPower(card: MeterCardData, status?: MeterStatus): number | undefined {
  if (status?.power?.error) return undefined;
  return card.power ?? status?.power?.value;
}

export type MeterRowKind = "power" | "energy" | "chargedEnergy";

/** Zeile einer Meter-Karte: Leistung in W, Energien in kWh */
export interface MeterRow {
  kind: MeterRowKind;
  value?: number;
  error?: string;
}

/**
 * Zeilen wie evcc DeviceTags: Leistung immer, „Verbraucht“ und „Geladen (Session)“ nur, wenn
 * das Gerät sie liefert. Live-Werte aus dem WebSocket haben Vorrang vor dem Gerätestatus.
 * Mit `showEnergy = false` (Einstellung „Verbraucht anzeigen“) fehlen beide Energiezeilen.
 */
export function meterRows(
  card: MeterCardData,
  status?: MeterStatus,
  showEnergy = true,
): MeterRow[] {
  const rows: MeterRow[] = [
    { kind: "power", value: card.power ?? status?.power?.value, error: status?.power?.error },
  ];
  if (!showEnergy) return rows;
  if (card.energyKWh !== undefined || status?.energy) {
    rows.push({
      kind: "energy",
      value: card.energyKWh ?? status?.energy?.value,
      error: status?.energy?.error,
    });
  }
  if (status?.chargedEnergy) {
    rows.push({ kind: "chargedEnergy", ...status.chargedEnergy });
  }
  return rows;
}
