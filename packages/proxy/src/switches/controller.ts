// Steuerung einer Steckdose: Lesecache, Befehle von evcc, Erkennung von Schaltungen am Gerät
import type { Logger } from "../logger.js";
import { errorMessage } from "../util.js";
import type { LoadpointApi } from "./evcc-client.js";
import { initialStatus, type SwitchConfig, type SwitchStatus } from "./model.js";
import type { DeviceState, SwitchDevice } from "./tapo/client.js";

export interface ControllerDeps {
  config: SwitchConfig;
  device: SwitchDevice;
  evcc: LoadpointApi;
  logger: Logger;
  now?: () => number;
}

export interface CommandResult {
  on: boolean;
  suppressed: boolean;
}

/** Halt nach einer Schaltung am Gerät: Gegenbefehle von evcc werden nicht ausgeführt */
interface Hold {
  state: boolean;
  /** Zeitpunkt, zu dem der passende Modus in evcc gesetzt wurde */
  modeAppliedAt: number | null;
}

/** Lesewerte gelten so lange für alle Leser (evcc liest Zustand und Leistung getrennt) */
export const READ_CACHE_MS = 1000;
/** Ein veralteter Rückschaltbefehl kann kurz nach dem gesetzten Modus eintreffen (SetMode-Race) */
export const HOLD_AFTER_MODE_MS = 2000;

export class SwitchController {
  readonly status: SwitchStatus = initialStatus();
  /** Zuletzt bestätigter Zustand; null bis zum ersten Lesen */
  private known: boolean | null = null;
  private hold: Hold | null = null;
  private cache: { at: number; value: DeviceState } | null = null;
  private pending: Promise<DeviceState> | null = null;
  /** Ändert sich bei Beginn und Ende jedes Befehls; Lesewerte aus der Zeit davor sind veraltet */
  private commandGeneration = 0;
  private commandsInFlight = 0;
  private applying = false;
  private polling = false;
  private readonly now: () => number;

  constructor(private readonly deps: ControllerDeps) {
    this.now = deps.now ?? Date.now;
  }

  get config(): SwitchConfig {
    return this.deps.config;
  }

  /** Nur für Änderungen ohne Einfluss auf das Gerät (Token) */
  set config(config: SwitchConfig) {
    this.deps.config = config;
  }

  /** Zustand und Leistung; parallele Aufrufe und Aufrufe innerhalb von 1 s teilen sich ein Ergebnis */
  read(): Promise<DeviceState> {
    if (this.cache && this.now() - this.cache.at < READ_CACHE_MS) {
      return Promise.resolve(this.cache.value);
    }
    if (this.pending) return this.pending;
    const pending = this.fetchState().finally(() => {
      if (this.pending === pending) this.pending = null;
    });
    this.pending = pending;
    return pending;
  }

  /** Schaltbefehl von evcc; gegenläufige Befehle während eines Halts werden unterdrückt */
  async command(on: boolean): Promise<CommandResult> {
    this.expireHold();
    if (this.hold && on !== this.hold.state) return this.suppress(on, this.hold);
    if (this.hold) this.endHold();
    await this.execute(on);
    return { on, suppressed: false };
  }

  /** Regelmäßige Abfrage; überspringt, solange die vorige noch läuft */
  async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      await this.read();
    } catch {
      // Der Fehler steht bereits in `status` und wurde beim Wechsel geloggt
    } finally {
      this.polling = false;
    }
    await this.applyMode();
  }

  private async fetchState(): Promise<DeviceState> {
    const generation = this.commandGeneration;
    let state: DeviceState;
    try {
      state = await this.deps.device.getState();
    } catch (err) {
      this.markUnreachable(err);
      throw err;
    }
    if (generation !== this.commandGeneration || this.commandsInFlight > 0) return state;
    this.cache = { at: this.now(), value: state };
    this.markReachable(state);
    this.observe(state.on);
    void this.applyMode();
    return state;
  }

  /** Abweichung vom bestätigten Zustand ohne laufenden Befehl = Schaltung am Gerät */
  private observe(actual: boolean): void {
    this.expireHold();
    if (this.known === null) return void (this.known = actual);
    if (actual === this.known) return;
    this.known = actual;
    this.hold = { state: actual, modeAppliedAt: null };
    this.status.held = true;
    this.deps.logger.info("switch pressed on device", {
      switch: this.config.id,
      state: onOff(actual),
    });
  }

  /** Setzt den Modus des Ladepunkts passend zum Halt; Fehler bleiben in `modeError` stehen */
  private async applyMode(): Promise<void> {
    const hold = this.hold;
    if (!hold || hold.modeAppliedAt !== null || this.applying) return;
    this.applying = true;
    const mode = hold.state ? "now" : "off";
    try {
      const position = await this.deps.evcc.resolveLoadpoint(this.config.loadpoint);
      await this.deps.evcc.setMode(position, mode);
      hold.modeAppliedAt = this.now();
      this.status.modeError = null;
      this.deps.logger.info("loadpoint mode set", {
        switch: this.config.id,
        loadpoint: position,
        mode,
      });
    } catch (err) {
      this.modeFailed(err);
    } finally {
      this.applying = false;
    }
    if (this.hold && this.hold !== hold) await this.applyMode();
  }

  private modeFailed(err: unknown): void {
    this.status.modeError = errorMessage(err);
    this.deps.logger.warn("loadpoint mode failed", {
      switch: this.config.id,
      title: this.config.loadpoint,
      error: this.status.modeError,
    });
  }

  private suppress(requested: boolean, hold: Hold): CommandResult {
    this.deps.logger.info("evcc command suppressed", {
      switch: this.config.id,
      requested: onOff(requested),
      held: onOff(hold.state),
    });
    void this.applyMode();
    return { on: hold.state, suppressed: true };
  }

  private async execute(on: boolean): Promise<void> {
    this.deps.logger.debug("switch command", { switch: this.config.id, on });
    this.beginCommand();
    try {
      await this.deps.device.setOn(on);
      this.known = on;
      this.status.on = on;
    } catch (err) {
      // Ob das Gerät geschaltet hat, ist unklar: Der nächste Lesewert gilt als bestätigt
      this.known = null;
      throw err;
    } finally {
      this.commandsInFlight--;
      this.commandGeneration++;
    }
  }

  private beginCommand(): void {
    this.commandsInFlight++;
    this.commandGeneration++;
    this.cache = null;
    this.pending = null;
  }

  /** Der Halt endet 2 s nach erfolgreich gesetztem Modus */
  private expireHold(): void {
    const applied = this.hold?.modeAppliedAt;
    if (applied != null && this.now() - applied >= HOLD_AFTER_MODE_MS) this.endHold();
  }

  private endHold(): void {
    this.hold = null;
    this.status.held = false;
  }

  private markReachable(state: DeviceState): void {
    if (this.status.reachable === false) {
      this.deps.logger.info("switch reachable", { switch: this.config.id });
    }
    Object.assign(this.status, { reachable: true, ...state, error: null });
    this.status.updatedAt = new Date(this.now()).toISOString();
  }

  private markUnreachable(err: unknown): void {
    const error = errorMessage(err);
    if (this.status.reachable !== false) {
      this.deps.logger.warn("switch unreachable", { switch: this.config.id, error });
    }
    Object.assign(this.status, { reachable: false, error });
    this.status.updatedAt = new Date(this.now()).toISOString();
  }
}

function onOff(on: boolean): string {
  return on ? "on" : "off";
}
