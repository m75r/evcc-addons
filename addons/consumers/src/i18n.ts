// Texte des Verbraucher-Addons (de/en)

const TEXTS = {
  de: {
    title: "Verbraucher",
    switchable: "Schaltbar",
    measured: "Nur Messung",
    power: "Leistung",
    charged: "Geladen (Session)",
    consumed: "Verbraucht",
    status: "Status",
    on: "an",
    off: "aus",
    offline: "offline",
    empty: "Keine Steckdosen-Ladepunkte und Verbraucher in evcc konfiguriert.",
    extensionError: (addonId: string, message: string) =>
      `Erweiterung von ${addonId} fehlgeschlagen: ${message}`,
    loginHint: "Weitere Gerätewerte wie „Geladen (Session)“ erscheinen nach der Anmeldung in evcc.",
    loginHintGeneric: "Weitere Gerätewerte erscheinen nach der Anmeldung in evcc.",
    statusError: "Gerätewerte konnten nicht geladen werden",
  },
  en: {
    title: "Consumers",
    switchable: "Switchable",
    measured: "Measurement only",
    power: "Power",
    charged: "Charged (session)",
    consumed: "Consumed",
    status: "Status",
    on: "on",
    off: "off",
    offline: "offline",
    empty: "No smart-plug loadpoints or consumers configured in evcc.",
    extensionError: (addonId: string, message: string) =>
      `Extension of ${addonId} failed: ${message}`,
    loginHint: "More device values such as “Charged (session)” appear after logging in to evcc.",
    loginHintGeneric: "More device values appear after logging in to evcc.",
    statusError: "Could not load device values",
  },
};

export type Texts = (typeof TEXTS)["de"];

export function texts(locale: string): Texts {
  return locale.toLowerCase().startsWith("de") ? TEXTS.de : TEXTS.en;
}
