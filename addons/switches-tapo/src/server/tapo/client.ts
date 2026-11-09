// Tapo-Steckdose über KLAP: Zustand und Leistung lesen, schalten
import { errorMessage, isRecord } from "../util.js";
import { KlapError, KlapSession } from "./klap.js";

export interface DeviceState {
  on: boolean;
  /** Leistung in W, null ohne Messung */
  power: number | null;
  hasMeter: boolean;
}

/** Schnittstelle des Controllers zum Gerät (im Test austauschbar) */
export interface SwitchDevice {
  getState(): Promise<DeviceState>;
  setOn(on: boolean): Promise<void>;
}

/** Fehler des Geräts mit verständlicher Meldung für Karte und Log */
export class DeviceError extends Error {
  override name = "DeviceError";
}

/** Fehlercode in der Antwort der Tapo-Firmware */
export class TapoStatusError extends Error {
  override name = "TapoStatusError";

  constructor(
    readonly method: string,
    readonly code: number,
  ) {
    super(`Tapo-Fehler ${code} bei ${method}`);
  }
}

export interface TapoClientOptions {
  host: string;
  user: string;
  password: string;
  timeoutMs?: number;
}

const TIMEOUT_MS = 5000;
/** Sitzung abgelaufen bzw. Kommunikationsfehler: neu anmelden und einmal wiederholen */
const SESSION_CODES = new Set([9999, 1003]);
/** Gerät ohne Messung (P100) */
const NO_METER_CODE = -1001;
export const KLAP_HINT =
  "Verbindung fehlgeschlagen (nur Tapo-Firmware mit KLAP-Protokoll wird unterstützt)";

export class TapoClient implements SwitchDevice {
  private session: KlapSession | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly opts: TapoClientOptions) {}

  getState(): Promise<DeviceState> {
    return this.run(async () => {
      const info = await this.call("get_device_info");
      if (typeof info.device_on !== "boolean") {
        throw new DeviceError("Antwort von get_device_info ohne device_on");
      }
      return { on: info.device_on, ...(await this.readPower()) };
    });
  }

  setOn(on: boolean): Promise<void> {
    return this.run(async () => {
      await this.call("set_device_info", { device_on: on });
    });
  }

  private async readPower(): Promise<Pick<DeviceState, "power" | "hasMeter">> {
    try {
      const usage = await this.call("get_energy_usage");
      const milliwatt = typeof usage.current_power === "number" ? usage.current_power : 0;
      return { power: milliwatt / 1000, hasMeter: true };
    } catch (err) {
      if (err instanceof TapoStatusError && err.code === NO_METER_CODE) {
        return { power: null, hasMeter: false };
      }
      throw err;
    }
  }

  /** Anfrage mit einmaliger Wiederholung nach Neu-Anmeldung */
  private async call(method: string, params?: unknown): Promise<Record<string, unknown>> {
    try {
      return await this.attempt(method, params);
    } catch (err) {
      if (!isSessionError(err)) throw err;
      this.session = null;
    }
    return this.attempt(method, params);
  }

  private async attempt(method: string, params?: unknown): Promise<Record<string, unknown>> {
    const session = await this.ensureSession();
    const payload = { method, ...(params ? { params } : {}), requestTimeMils: Date.now() };
    let response: Record<string, unknown>;
    try {
      response = await session.request(payload);
    } catch (err) {
      // Nach Netz- oder Protokollfehlern kann die Sequenz nicht mehr passen
      this.session = null;
      throw err;
    }
    return resultOf(method, response);
  }

  private async ensureSession(): Promise<KlapSession> {
    if (this.session && !this.session.expired) return this.session;
    this.session = null;
    try {
      this.session = await KlapSession.open({ ...this.opts, timeoutMs: this.timeoutMs });
    } catch (err) {
      throw handshakeError(err);
    }
    return this.session;
  }

  private get timeoutMs(): number {
    return this.opts.timeoutMs ?? TIMEOUT_MS;
  }

  /** KLAP-Sequenznummern verlangen eine Anfrage nach der anderen; Fehler werden zu DeviceError */
  private run<T>(task: () => Promise<T>): Promise<T> {
    const wrapped = async () => {
      try {
        return await task();
      } catch (err) {
        throw toDeviceError(err);
      }
    };
    const result = this.queue.then(wrapped, wrapped);
    this.queue = result.catch(() => undefined);
    return result;
  }
}

function resultOf(method: string, response: Record<string, unknown>): Record<string, unknown> {
  const code = typeof response.error_code === "number" ? response.error_code : 0;
  if (code !== 0) throw new TapoStatusError(method, code);
  return isRecord(response.result) ? response.result : {};
}

function isSessionError(err: unknown): boolean {
  if (err instanceof KlapError) return err.kind === "forbidden";
  return err instanceof TapoStatusError && SESSION_CODES.has(err.code);
}

function handshakeError(err: unknown): DeviceError {
  if (err instanceof KlapError && err.kind === "network") {
    return new DeviceError(`Steckdose nicht erreichbar: ${err.message}`, { cause: err });
  }
  return new DeviceError(`${KLAP_HINT}: ${errorMessage(err)}`, { cause: err });
}

function toDeviceError(err: unknown): DeviceError {
  if (err instanceof DeviceError) return err;
  if (err instanceof KlapError && err.kind === "network") {
    return new DeviceError(`Steckdose nicht erreichbar: ${err.message}`, { cause: err });
  }
  return new DeviceError(errorMessage(err), { cause: err });
}
