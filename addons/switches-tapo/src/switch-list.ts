// Liste der Steckdosen für Dialog und Kartenaktionen: lädt `GET /` im Takt der Einstellung pollSeconds,
// solange es Abonnenten gibt und der Tab sichtbar ist
import type { AddonSettings } from "@evcc-addons/sdk";
import type { SwitchInfo } from "./dialog/client.js";

export type SwitchListState =
  { kind: "loading" } | { kind: "error"; error: unknown } | { kind: "ready"; value: SwitchInfo[] };

const DEFAULT_POLL_SECONDS = 5;

export interface SwitchListDeps {
  load: () => Promise<SwitchInfo[]>;
  settings: Pick<AddonSettings, "get" | "onChange">;
  /** Standard: `document.visibilityState === "visible"` */
  isVisible?: () => boolean;
}

/** Einstellung `pollSeconds` in ms, ungültige Werte ergeben 5 s */
export function pollMs(value: unknown): number {
  const seconds = Number(value);
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_POLL_SECONDS) * 1000;
}

export class SwitchListStore {
  private state: SwitchListState = { kind: "loading" };
  private readonly listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private offSettings: (() => void) | undefined;
  private generation = 0;

  constructor(private readonly deps: SwitchListDeps) {}

  current(): SwitchListState {
    return this.state;
  }

  /** Der erste Abonnent startet Laden und Takt, der letzte hält beides an */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.start();
    return () => {
      if (this.listeners.delete(listener) && this.listeners.size === 0) this.stop();
    };
  }

  /** Lädt sofort; eine ältere, später eintreffende Antwort wird verworfen */
  async refresh(): Promise<void> {
    const generation = ++this.generation;
    try {
      const value = await this.deps.load();
      if (generation === this.generation) this.set({ kind: "ready", value });
    } catch (err) {
      if (generation === this.generation) this.set({ kind: "error", error: err });
    }
  }

  private start(): void {
    void this.refresh();
    this.startTimer();
    this.offSettings = this.deps.settings.onChange(() => this.startTimer());
  }

  private stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.offSettings?.();
    this.offSettings = undefined;
  }

  private startTimer(): void {
    clearInterval(this.timer);
    const visible = this.deps.isVisible ?? (() => document.visibilityState === "visible");
    const tick = () => void (visible() && this.refresh());
    this.timer = setInterval(tick, pollMs(this.deps.settings.get("pollSeconds")));
  }

  /** Ein fehlerhafter Abonnent hält die anderen nicht auf; sein Fehler erscheint in der Konsole */
  private set(state: SwitchListState): void {
    this.state = state;
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (err) {
        setTimeout(() => {
          throw err;
        });
      }
    }
  }
}
