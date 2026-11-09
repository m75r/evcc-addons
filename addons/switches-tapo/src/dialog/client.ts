// Client des Dialogs: Gateway über api.serverApi, Ladepunkte und Charger über api.evccApi
// (Teile übernommen aus packages/loader/src/addons-client.ts)
import type { AddonApi } from "@evcc-addons/sdk";

export interface SwitchStatus {
  /** null, solange der Proxy die Steckdose noch nicht gelesen hat */
  reachable: boolean | null;
  on: boolean | null;
  power: number | null;
  hasMeter: boolean | null;
  error: string | null;
  held: boolean;
  modeError: string | null;
  updatedAt: string | null;
}

export type TargetKind = "loadpoint" | "consumer";

/** Gebundenes evcc-Gerät über seinen Titel (Verbraucher ohne Titel: `name`) */
export interface SwitchTarget {
  kind: TargetKind;
  title: string;
}

/** Steckdose aus Sicht der Oberfläche; host, user und token nur mit Admin-Login */
export interface SwitchInfo {
  id: string;
  name: string;
  type: "tapo";
  target: SwitchTarget;
  /** Titel genau einmal in evcc vorhanden; null, wenn evcc nicht erreichbar war */
  targetFound: boolean | null;
  status: SwitchStatus;
  host?: string;
  user?: string;
  token?: string;
}

export interface SwitchInput {
  name: string;
  type: "tapo";
  host: string;
  user: string;
  /** Beim Bearbeiten leer = unverändert */
  password: string;
  target: SwitchTarget;
}

/** Titel der Ladepunkte und Verbraucher von evcc, wie consumers sie anzeigt */
export interface EvccDevices {
  loadpoints: string[];
  consumers: string[];
}

/** Adresse der Tapo-Steckdose je Titel und Art, aus der evcc-Konfiguration */
export type DeviceHosts = Record<TargetKind, Record<string, string>>;

export class ApiError extends Error {
  override name = "ApiError";

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Alle Aufrufe des Dialogs, austauschbar für Tests */
export interface SwitchClient {
  listSwitches: () => Promise<SwitchInfo[]>;
  createSwitch: (input: SwitchInput) => Promise<SwitchInfo>;
  updateSwitch: (id: string, input: SwitchInput) => Promise<SwitchInfo>;
  deleteSwitch: (id: string) => Promise<void>;
  renewSwitchToken: (id: string) => Promise<string>;
  /** ⏻ für Steckdosen an Verbrauchern (ohne Login) */
  setPower: (id: string, on: boolean) => Promise<boolean>;
  listEvccDevices: () => Promise<EvccDevices>;
  /** Adressen nur mit Admin-Login, sonst schlägt der Aufruf fehl */
  listDeviceHosts: () => Promise<DeviceHosts>;
}

type Api = Pick<AddonApi, "serverApi" | "evccApi">;

export function createSwitchClient(api: Api): SwitchClient {
  const json = async <T>(path: string, init?: RequestInit) =>
    (await (await request(api, path, init)).json()) as T;
  const id = (value: string) => encodeURIComponent(value);
  return {
    listSwitches: async () => (await json<{ switches: SwitchInfo[] }>("")).switches,
    createSwitch: (input) => json<SwitchInfo>("", jsonInit("POST", input)),
    updateSwitch: (key, input) => json<SwitchInfo>(id(key), jsonInit("PATCH", input)),
    deleteSwitch: async (key) => void (await request(api, id(key), { method: "DELETE" })),
    renewSwitchToken: async (key) =>
      (await json<{ token: string }>(`${id(key)}/token`, { method: "POST" })).token,
    setPower: async (key, on) =>
      (await json<{ on: boolean }>(`${id(key)}/power`, jsonInit("POST", { on }))).on,
    listEvccDevices: () => listEvccDevices(api),
    listDeviceHosts: () => listDeviceHosts(api),
  };
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

/** Fetch auf den Server-Teil mit einheitlicher Fehlerbehandlung (`{ error: { code, message } }`) */
async function request(api: Api, path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await api.serverApi(path, init);
  } catch (err) {
    throw new ApiError(0, "network", `Addon-Proxy nicht erreichbar: ${(err as Error).message}`);
  }
  if (!res.ok) throw await toApiError(res);
  return res;
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    return new ApiError(
      res.status,
      body.error?.code ?? "unknown",
      body.error?.message ?? res.statusText,
    );
  } catch {
    return new ApiError(res.status, "unknown", `HTTP ${res.status} ${res.statusText}`);
  }
}

/** GET auf die evcc-API mit einheitlichen Fehlern */
async function evccJson(api: Api, path: string): Promise<unknown> {
  let res: Response;
  try {
    res = await api.evccApi(path);
  } catch (err) {
    throw new ApiError(0, "network", `evcc nicht erreichbar: ${(err as Error).message}`);
  }
  if (!res.ok) throw new ApiError(res.status, "evcc-error", `evcc: HTTP ${res.status}`);
  try {
    return await res.json();
  } catch (err) {
    throw new ApiError(res.status, "evcc-error", `Antwort nicht lesbar: ${(err as Error).message}`);
  }
}

/** Titel der evcc-Ladepunkte in evcc-Reihenfolge (ohne Anmeldung lesbar) */
async function listLoadpointTitles(api: Api): Promise<string[]> {
  const titles = await evccJson(api, `state?jq=${encodeURIComponent("[.loadpoints[].title]")}`);
  if (!Array.isArray(titles)) throw new ApiError(200, "evcc-error", "Keine Ladepunkt-Liste");
  return titles.map((title) => (typeof title === "string" ? title : ""));
}

const CONSUMERS_QUERY = "[.consumers[]? | {name, title}]";

interface ConsumerRef {
  name: string;
  /** `title || name`, wie consumers ihn anzeigt */
  title: string;
}

/** Verbraucher-Meter aus `api/state` (ohne Anmeldung lesbar) */
async function listConsumers(api: Api): Promise<ConsumerRef[]> {
  const list = await evccJson(api, `state?jq=${encodeURIComponent(CONSUMERS_QUERY)}`);
  if (!Array.isArray(list)) throw new ApiError(200, "evcc-error", "Keine Verbraucher-Liste");
  return objects(list).map((entry) => {
    const name = typeof entry.name === "string" ? entry.name : "";
    const title = typeof entry.title === "string" && entry.title !== "" ? entry.title : name;
    return { name, title };
  });
}

async function listEvccDevices(api: Api): Promise<EvccDevices> {
  const [loadpoints, consumers] = await Promise.all([listLoadpointTitles(api), listConsumers(api)]);
  return { loadpoints, consumers: consumers.map((consumer) => consumer.title) };
}

/** Bekannt nur für Geräte mit Template `tapo`, die in der evcc-Oberfläche angelegt wurden */
async function listDeviceHosts(api: Api): Promise<DeviceHosts> {
  const [loadpoints, chargers, meters, consumers] = await Promise.all([
    evccJson(api, "config/loadpoints"),
    evccJson(api, "config/devices/charger"),
    evccJson(api, "config/devices/meter"),
    listConsumers(api),
  ]);
  return {
    loadpoint: loadpointHosts(loadpoints, chargers),
    consumer: consumerHosts(consumers, meters),
  };
}

type JsonObject = Record<string, unknown>;

function objects(value: unknown): JsonObject[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is JsonObject => typeof entry === "object" && entry !== null);
}

/** Host eines Tapo-Geräts (Template `tapo` oder Typ `tapo`), sonst null */
function tapoHost(device: JsonObject): string | null {
  const config = (device.config ?? {}) as JsonObject;
  const isTapo = config.template === "tapo" || device.type === "tapo";
  return isTapo && typeof config.host === "string" && config.host !== "" ? config.host : null;
}

/** Host je Gerätename (`name` aus `config/devices/<klasse>`) */
function hostsByName(devices: unknown): Map<string, string> {
  const hosts = new Map<string, string>();
  for (const device of objects(devices)) {
    const host = tapoHost(device);
    if (host && typeof device.name === "string") hosts.set(device.name, host);
  }
  return hosts;
}

/** Verknüpft Verbraucher (name, title) mit den Metern (name, config.host) */
export function consumerHosts(consumers: ConsumerRef[], meters: unknown): Record<string, string> {
  const hosts = hostsByName(meters);
  const result: Record<string, string> = {};
  for (const consumer of consumers) {
    const host = hosts.get(consumer.name);
    if (host) result[consumer.title] = host;
  }
  return result;
}

/** Verknüpft Ladepunkte (title, charger) mit den Chargern (name, config.host) */
export function loadpointHosts(loadpoints: unknown, chargers: unknown): Record<string, string> {
  const hosts = hostsByName(chargers);
  const result: Record<string, string> = {};
  for (const lp of objects(loadpoints)) {
    const host = typeof lp.charger === "string" ? hosts.get(lp.charger) : undefined;
    if (host && typeof lp.title === "string") result[lp.title] = host;
  }
  return result;
}
