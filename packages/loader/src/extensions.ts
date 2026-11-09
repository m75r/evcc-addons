// Erweiterungspunkte zwischen Addons: Anbieter stellen Werte bereit, Nutzer lesen und abonnieren sie
import type { ExtensionEntry } from "@evcc-addons/sdk";

type ErrorHandler = (err: unknown) => void;

interface Listener {
  cb: (entries: ExtensionEntry[]) => void;
  /** Fehlerkanal des abonnierenden Addons */
  onError: ErrorHandler;
}

export class ExtensionRegistry {
  private readonly points = new Map<string, ExtensionEntry[]>();
  private readonly listeners = new Map<string, Set<Listener>>();

  /** Stellt `value` bereit und benachrichtigt die Abonnenten; Rückgabe meldet wieder ab */
  provide(addonId: string, point: string, value: unknown): () => void {
    checkPoint(point);
    const entry: ExtensionEntry = { addonId, value };
    const entries = this.points.get(point) ?? [];
    entries.push(entry);
    this.points.set(point, entries);
    this.notify(point);
    return () => this.withdraw(point, entry);
  }

  /** Kopien der Einträge in Reihenfolge der Registrierung */
  get<T = unknown>(point: string): ExtensionEntry<T>[] {
    const entries = this.points.get(point) ?? [];
    return entries.map((entry) => ({ addonId: entry.addonId, value: entry.value as T }));
  }

  /** Meldet neue und abgemeldete Einträge; Fehler im Callback gehen an `onError` */
  onChange<T = unknown>(
    point: string,
    cb: (entries: ExtensionEntry<T>[]) => void,
    onError: ErrorHandler,
  ): () => void {
    checkPoint(point);
    const listener: Listener = { cb: cb as Listener["cb"], onError };
    const set = this.listeners.get(point) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(point, set);
    return () => void set.delete(listener);
  }

  private withdraw(point: string, entry: ExtensionEntry): void {
    const entries = this.points.get(point) ?? [];
    const index = entries.indexOf(entry);
    if (index < 0) return;
    entries.splice(index, 1);
    this.notify(point);
  }

  private notify(point: string): void {
    for (const listener of [...(this.listeners.get(point) ?? [])]) {
      try {
        listener.cb(this.get(point));
      } catch (err) {
        listener.onError(err);
      }
    }
  }
}

function checkPoint(point: unknown): void {
  if (typeof point !== "string" || point.trim() === "") {
    throw new Error("Erweiterungspunkt muss ein nicht leerer Text sein, z. B. <addon-id>.<punkt>");
  }
}
