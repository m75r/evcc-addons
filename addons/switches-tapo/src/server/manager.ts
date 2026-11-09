// Verwaltung aller Steckdosen: Speicher, Controller je Steckdose und Polling im eingestellten Takt
import type { ServerLogger } from "@evcc-addons/sdk/server";
import { timingSafeEqual } from "node:crypto";
import { SwitchNotFoundError, SwitchTargetError } from "./errors.js";
import { SwitchController } from "./controller.js";
import { EvccClient, type EvccApi } from "./evcc-client.js";
import { validateSwitchInput, type SwitchConfig } from "./model.js";
import { SwitchStore } from "./store.js";
import { TapoClient, type SwitchDevice } from "./tapo/client.js";

export interface SwitchManagerOptions {
  dataDir: string;
  evccUrl: string;
  logger: ServerLogger;
  /** Abfrageintervall, Standard DEFAULT_POLL_SECONDS */
  pollMs?: number;
  /** Austauschbar für Tests */
  createDevice?: (config: SwitchConfig) => SwitchDevice;
  evcc?: EvccApi;
  now?: () => number;
}

export const DEFAULT_POLL_SECONDS = 5;
/** Erlaubte Werte der Einstellung „Abfrageintervall“ (`pollSeconds`) */
export const POLL_SECONDS = [3, 5, 10, 15, 20, 30] as const;

/** Einstellung `pollSeconds` („3“ … „30“) in ms; unbekannte Werte ergeben den Standard */
export function pollMsFromSetting(value: unknown): number {
  const seconds = Number(value);
  const valid = (POLL_SECONDS as readonly number[]).includes(seconds);
  return (valid ? seconds : DEFAULT_POLL_SECONDS) * 1000;
}

export class SwitchManager {
  readonly store: SwitchStore;
  readonly evcc: EvccApi;
  private readonly controllers = new Map<string, SwitchController>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private pollMs: number;

  constructor(private readonly opts: SwitchManagerOptions) {
    this.store = new SwitchStore(opts.dataDir, opts.logger);
    this.evcc = opts.evcc ?? new EvccClient(opts.evccUrl);
    this.pollMs = opts.pollMs ?? DEFAULT_POLL_SECONDS * 1000;
  }

  /** Neues Abfrageintervall; ersetzt die Timer aller Steckdosen ohne Neustart */
  setPollMs(ms: number): void {
    if (ms === this.pollMs) return;
    this.pollMs = ms;
    for (const controller of this.controllers.values()) this.startTimer(controller);
    this.opts.logger.info("poll interval changed", { ms });
  }

  /** Lädt switches.json und startet das Polling; Fehler beim Laden brechen den Start ab */
  async start(): Promise<void> {
    await this.store.load();
    for (const config of this.store.list()) this.attach(config);
  }

  stop(): void {
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
  }

  list(): SwitchController[] {
    return this.store.list().map((config) => this.get(config.id));
  }

  get(id: string): SwitchController {
    const controller = this.controllers.get(id);
    if (!controller) throw new SwitchNotFoundError(id);
    return controller;
  }

  /** Controller zu ID und Token; null bei unbekannter ID oder falschem Token */
  findByToken(id: string, token: string): SwitchController | null {
    const controller = this.controllers.get(id);
    if (!controller) return null;
    const expected = Buffer.from(controller.config.token);
    const given = Buffer.from(token);
    if (given.length !== expected.length) return null;
    return timingSafeEqual(given, expected) ? controller : null;
  }

  /** Legt an und prüft sofort die Verbindung; ein Verbindungsfehler steht danach im Status */
  async create(raw: unknown): Promise<SwitchController> {
    const config = await this.store.create(validateSwitchInput(raw));
    const controller = this.attach(config);
    this.opts.logger.info("switch created", {
      switch: config.id,
      name: config.name,
      host: config.host,
    });
    await probe(controller);
    return controller;
  }

  async update(id: string, raw: unknown): Promise<SwitchController> {
    const config = await this.store.update(id, validateSwitchInput(raw, this.store.get(id)));
    const controller = this.attach(config);
    this.opts.logger.info("switch updated", { switch: id, name: config.name, host: config.host });
    await probe(controller);
    return controller;
  }

  /** ⏻ in consumers: schaltet direkt, nur Steckdosen mit Verbraucher-Bindung */
  async power(id: string, on: boolean): Promise<SwitchController> {
    const controller = this.get(id);
    if (controller.config.target.kind !== "consumer") throw new SwitchTargetError();
    await controller.switchDirect(on);
    return controller;
  }

  async remove(id: string): Promise<void> {
    await this.store.remove(id);
    this.detach(id);
    this.opts.logger.info("switch removed", { switch: id });
  }

  /** Neuer Token; der Controller behält seinen Zustand */
  async renewToken(id: string): Promise<SwitchController> {
    const config = await this.store.renewToken(id);
    const controller = this.get(id);
    controller.config = config;
    this.opts.logger.info("switch token renewed", { switch: id });
    return controller;
  }

  private attach(config: SwitchConfig): SwitchController {
    this.detach(config.id);
    const controller = new SwitchController({
      config,
      device: this.createDevice(config),
      evcc: this.evcc,
      logger: this.opts.logger,
      now: this.opts.now,
    });
    this.controllers.set(config.id, controller);
    this.startTimer(controller);
    void controller.poll();
    return controller;
  }

  private startTimer(controller: SwitchController): void {
    const { id } = controller.config;
    clearInterval(this.timers.get(id));
    const timer = setInterval(() => void controller.poll(), this.pollMs);
    timer.unref();
    this.timers.set(id, timer);
  }

  private detach(id: string): void {
    clearInterval(this.timers.get(id));
    this.timers.delete(id);
    this.controllers.delete(id);
  }

  private createDevice(config: SwitchConfig): SwitchDevice {
    if (this.opts.createDevice) return this.opts.createDevice(config);
    return new TapoClient({ host: config.host, user: config.user, password: config.password });
  }
}

/** Erster Lesevorgang nach dem Speichern; Fehler zeigt die Karte über den Status */
async function probe(controller: SwitchController): Promise<void> {
  try {
    await controller.read();
  } catch {
    // Steht in controller.status.error und wurde geloggt
  }
}
