// Zugriff auf evcc für das Schalt-Gateway: Ladepunkt-Titel lesen, Modus setzen (ohne Anmeldung)
import { fetchErrorMessage } from "../util.js";

export type LoadpointMode = "off" | "now";

/** Schnittstelle des Controllers zu evcc (im Test austauschbar) */
export interface LoadpointApi {
  loadpointTitles(): Promise<string[]>;
  resolveLoadpoint(title: string): Promise<number>;
  setMode(position: number, mode: LoadpointMode): Promise<void>;
}

const TIMEOUT_MS = 3000;
const TITLES_QUERY = "[.loadpoints[].title]";

export class EvccClient implements LoadpointApi {
  constructor(
    private readonly evccUrl: string,
    private readonly timeoutMs = TIMEOUT_MS,
  ) {}

  async loadpointTitles(): Promise<string[]> {
    const res = await this.send(`/api/state?jq=${encodeURIComponent(TITLES_QUERY)}`, "GET");
    let body: unknown;
    try {
      body = await res.json();
    } catch (err) {
      throw new Error(`Antwort von evcc nicht lesbar: ${(err as Error).message}`, { cause: err });
    }
    if (!Array.isArray(body)) throw new Error("evcc lieferte keine Liste der Ladepunkte");
    return body.map((title) => (typeof title === "string" ? title : ""));
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
