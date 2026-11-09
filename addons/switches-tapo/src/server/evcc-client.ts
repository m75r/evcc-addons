// Zugriff auf evcc für das Gateway: Titel von Ladepunkten und Verbrauchern lesen, Modus setzen (ohne Anmeldung)
import { fetchErrorMessage } from "./util.js";

export type LoadpointMode = "off" | "now";

/** Schnittstelle des Gateways zu evcc (im Test austauschbar) */
export interface EvccApi {
  loadpointTitles(): Promise<string[]>;
  /** Angezeigte Titel der Verbraucher-Meter: `title || name` */
  consumerTitles(): Promise<string[]>;
  resolveLoadpoint(title: string): Promise<number>;
  setMode(position: number, mode: LoadpointMode): Promise<void>;
}

const TIMEOUT_MS = 3000;
const TITLES_QUERY = "[.loadpoints[].title]";
const CONSUMERS_QUERY = "[.consumers[]? | {name, title}]";

export class EvccClient implements EvccApi {
  constructor(
    private readonly evccUrl: string,
    private readonly timeoutMs = TIMEOUT_MS,
  ) {}

  async loadpointTitles(): Promise<string[]> {
    const body = await this.query(TITLES_QUERY, "der Ladepunkte");
    return body.map((title) => (typeof title === "string" ? title : ""));
  }

  async consumerTitles(): Promise<string[]> {
    const body = await this.query(CONSUMERS_QUERY, "der Verbraucher");
    return body.map((entry) => displayTitle(entry));
  }

  /** `GET /api/state?jq=…`, das Ergebnis muss eine Liste sein */
  private async query(jq: string, what: string): Promise<unknown[]> {
    const res = await this.send(`/api/state?jq=${encodeURIComponent(jq)}`, "GET");
    let body: unknown;
    try {
      body = await res.json();
    } catch (err) {
      throw new Error(`Antwort von evcc nicht lesbar: ${(err as Error).message}`, { cause: err });
    }
    if (!Array.isArray(body)) throw new Error(`evcc lieferte keine Liste ${what}`);
    return body as unknown[];
  }

  /** 1-basierte Position des Ladepunkts mit genau diesem Titel */
  async resolveLoadpoint(title: string): Promise<number> {
    const titles = await this.loadpointTitles();
    const positions = titles.flatMap((entry, index) => (entry === title ? [index + 1] : []));
    if (positions.length === 0) throw new Error(`Ladepunkt „${title}“ nicht gefunden`);
    if (positions.length > 1) throw new Error(`Ladepunkt „${title}“ ist nicht eindeutig`);
    return positions[0];
  }

  async setMode(position: number, mode: LoadpointMode): Promise<void> {
    const res = await this.send(`/api/loadpoints/${position}/mode/${mode}`, "POST");
    await res.body?.cancel();
  }

  private async send(path: string, method: string): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(`${this.evccUrl}${path}`, {
        method,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new Error(`evcc nicht erreichbar: ${fetchErrorMessage(err, this.timeoutMs)}`, {
        cause: err,
      });
    }
    if (res.status !== 200) {
      await res.body?.cancel();
      throw new Error(`evcc antwortete mit HTTP ${res.status} auf ${method} ${path}`);
    }
    return res;
  }
}

/** Titel wie in consumers: `title || name` */
function displayTitle(entry: unknown): string {
  if (typeof entry !== "object" || entry === null) return "";
  const { name, title } = entry as { name?: unknown; title?: unknown };
  if (typeof title === "string" && title !== "") return title;
  return typeof name === "string" ? name : "";
}
