// Einstellungen des Verbraucher-Addons (addon.json → settings), geändert auf der Seite „Addons“
import type { AddonApi, AddonSettings, SettingValues } from "@evcc-addons/sdk";
import { useEffect, useState } from "preact/hooks";

export type SortOrder = "name-asc" | "name-desc" | "power-desc" | "power-asc";

export interface ConsumerSettings {
  showEnergy: boolean;
  sort: SortOrder;
}

export const DEFAULT_SETTINGS: ConsumerSettings = { showEnergy: true, sort: "name-asc" };

const SORT_ORDERS: readonly string[] = ["name-asc", "name-desc", "power-desc", "power-asc"];

/** Ältere Loader ohne settings liefern kein `api.settings` */
function settingsApi(api: AddonApi): AddonSettings | undefined {
  return (api as Partial<AddonApi>).settings;
}

/** Prüft die Typen, unbekannte oder fehlende Werte ergeben die Defaults */
export function toConsumerSettings(values: SettingValues): ConsumerSettings {
  const { showEnergy, sort } = values;
  return {
    showEnergy: typeof showEnergy === "boolean" ? showEnergy : DEFAULT_SETTINGS.showEnergy,
    sort:
      typeof sort === "string" && SORT_ORDERS.includes(sort)
        ? (sort as SortOrder)
        : DEFAULT_SETTINGS.sort,
  };
}

export function readSettings(api: AddonApi): ConsumerSettings {
  return toConsumerSettings(settingsApi(api)?.all() ?? {});
}

/** Aktuelle Einstellungen; Änderungen im selben Fenster rendern ohne Remount neu */
export function useSettings(api: AddonApi): ConsumerSettings {
  const [settings, setSettings] = useState(() => readSettings(api));
  useEffect(
    () => settingsApi(api)?.onChange((values) => setSettings(toConsumerSettings(values))),
    [api],
  );
  return settings;
}
