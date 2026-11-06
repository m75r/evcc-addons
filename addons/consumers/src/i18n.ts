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
    modeOff: "Aus",
    modeSmart: "Smart",
    modeNow: "Schnell",
    emptySwitchable:
      "Keine schaltbaren Verbraucher – in evcc einen Ladepunkt mit Steckdose anlegen.",
    emptyMeasured: "Keine Verbraucher-Meter (consumer/aux) in evcc konfiguriert.",
    modeError: "Modus konnte nicht gesetzt werden",
    loginHint: "Weitere Gerätewerte wie „Geladen (Session)“ erscheinen nach der Anmeldung in evcc.",
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
    modeOff: "Off",
    modeSmart: "Smart",
    modeNow: "Fast",
    emptySwitchable: "No switchable consumers – add a loadpoint with a smart socket in evcc.",
    emptyMeasured: "No consumer meters (consumer/aux) configured in evcc.",
    modeError: "Could not set mode",
    loginHint: "More device values such as “Charged (session)” appear after logging in to evcc.",
    statusError: "Could not load device values",
  },
};

export type Texts = (typeof TEXTS)["de"];

export function texts(locale: string): Texts {
  return locale.toLowerCase().startsWith("de") ? TEXTS.de : TEXTS.en;
}
