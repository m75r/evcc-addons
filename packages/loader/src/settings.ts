// Gemeinsame Ablage der Addon-Einstellungen im Fenster: Seite „Addons“ schreibt, api.settings liest
import type { SettingValues } from "@evcc-addons/sdk";

type Listener = (values: SettingValues) => void;

/** Ohne eigene Fehlerbehandlung: Fehler in Callbacks fängt api.settings.onChange ab */
export class SettingsRegistry {
  private readonly values = new Map<string, SettingValues>();
  private readonly listeners = new Map<string, Set<Listener>>();

  /** Übernimmt die Werte aus `GET /addons-api/addons` */
  load(list: readonly { id: string; settingValues?: SettingValues }[]): void {
    for (const addon of list) this.values.set(addon.id, { ...addon.settingValues });
  }

  /** Kopie der Werte; unbekannte ids ergeben {} */
  get(id: string): SettingValues {
    return { ...this.values.get(id) };
  }

  /** Setzt die Werte und benachrichtigt alle Abonnenten der id */
  set(id: string, values: SettingValues): void {
    this.values.set(id, { ...values });
    for (const listener of [...(this.listeners.get(id) ?? [])]) listener(this.get(id));
  }

  /** Meldet Änderungen der id, gibt die Abmeldefunktion zurück */
  subscribe(id: string, listener: Listener): () => void {
    const set = this.listeners.get(id) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(id, set);
    return () => void set.delete(listener);
  }
}
