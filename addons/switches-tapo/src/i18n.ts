// Texte des Addons (de/en); Teile übernommen aus packages/loader/src/i18n.ts
import type { Localized } from "@evcc-addons/sdk";

/** Exakte Sprache, dann Basissprache, dann `en`, dann erster Eintrag */
export function localize(value: Localized | undefined, lang: string): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  const base = lang.split("-")[0];
  return value[lang] ?? value[base] ?? value.en ?? Object.values(value)[0] ?? "";
}

export const MESSAGES = {
  "manager.actionError": { de: "Aktion fehlgeschlagen: {message}", en: "Action failed: {message}" },
  "manager.settings.save": { de: "Speichern", en: "Save" },
  "manager.settings.saving": { de: "Wird gespeichert …", en: "Saving …" },
  "manager.settings.cancel": { de: "Abbrechen", en: "Cancel" },
  "manager.settings.close": { de: "Schließen", en: "Close" },
  "manager.settings.error": {
    de: "Speichern fehlgeschlagen: {message}",
    en: "Saving failed: {message}",
  },
  "switches.new": { de: "Steckdose", en: "Smart plug" },
  "switches.empty": {
    de: "Noch keine Steckdosen. Mit „+ Steckdose“ eine Tapo-Steckdose anlegen.",
    en: "No smart plugs yet. Use “+ Smart plug” to add a Tapo plug.",
  },
  "switches.loading": { de: "Steckdosen werden geladen …", en: "Loading smart plugs …" },
  "switches.loadError": {
    de: "Steckdosen konnten nicht geladen werden: {message}",
    en: "Could not load smart plugs: {message}",
  },
  "switches.reading": { de: "Status wird gelesen …", en: "Reading status …" },
  "switches.on": { de: "an", en: "on" },
  "switches.off": { de: "aus", en: "off" },
  "switches.unreachable": { de: "nicht erreichbar: {message}", en: "unreachable: {message}" },
  "switches.loadpoint": { de: "Ladepunkt „{title}“", en: "Loadpoint “{title}”" },
  "switches.loadpointMissing": {
    de: "Ladepunkt nicht gefunden",
    en: "Loadpoint not found",
  },
  "switches.modeError": {
    de: "Modus konnte nicht gesetzt werden: {message}",
    en: "Could not set the mode: {message}",
  },
  "switches.edit": { de: "Bearbeiten", en: "Edit" },
  "switches.delete": { de: "Löschen", en: "Delete" },
  "switches.delete.confirm": {
    de: "{name} wirklich löschen? evcc kann die Steckdose danach nicht mehr schalten.",
    en: "Really delete {name}? evcc will no longer be able to switch the plug.",
  },
  "switches.yaml": { de: "evcc-Konfiguration", en: "evcc configuration" },
  "switches.copy": { de: "Kopieren", en: "Copy" },
  "switches.copied": { de: "Kopiert", en: "Copied" },
  "switches.copyError": {
    de: "Kopieren nicht möglich ({message}). Die YAML ist markiert, bitte mit ⌘C bzw. Strg+C kopieren.",
    en: "Could not copy ({message}). The YAML is selected, please copy it with ⌘C or Ctrl+C.",
  },
  "switches.renew": { de: "Token erneuern", en: "Renew token" },
  "switches.renew.confirm": {
    de: "Token erneuern? evcc kann die Steckdose erst wieder schalten, wenn die neue YAML in evcc eingetragen ist.",
    en: "Renew the token? evcc can only switch the plug again once the new YAML has been entered in evcc.",
  },
  "switches.yamlHint": {
    de: "In evcc den Charger des Ladepunkts auf „Benutzerdefinierte schaltbare Steckdose“ umstellen und diese YAML einfügen. Die Adresse stammt aus der Browserzeile; läuft evcc auf demselben Rechner, geht auch {local}.",
    en: "In evcc, change the loadpoint's charger to “custom switchable socket” and paste this YAML. The address is taken from the browser; if evcc runs on the same machine, {local} works too.",
  },
  "switches.modal.create": { de: "Steckdose hinzufügen", en: "Add smart plug" },
  "switches.modal.edit": { de: "Steckdose bearbeiten", en: "Edit smart plug" },
  "switches.field.name": { de: "Name", en: "Name" },
  "switches.field.host": { de: "Adresse", en: "Address" },
  "switches.field.user": { de: "Tapo-E-Mail", en: "Tapo email" },
  "switches.field.password": { de: "Tapo-Passwort", en: "Tapo password" },
  "switches.password.keep": { de: "leer = unverändert", en: "empty = unchanged" },
  "switches.host.unknown": {
    de: "Adresse nicht in der evcc-Konfiguration gefunden, bitte eintragen.",
    en: "Address not found in the evcc configuration, please enter it.",
  },
  "switches.saved.unreachable": {
    de: "Gespeichert, aber die Verbindung schlug fehl: {message}",
    en: "Saved, but the connection failed: {message}",
  },
  "switches.form.back": { de: "Zurück", en: "Back" },
  "switches.consumer": { de: "Verbraucher „{title}“", en: "Consumer “{title}”" },
  "switches.consumerMissing": { de: "Verbraucher nicht gefunden", en: "Consumer not found" },
  "switches.field.target": { de: "Gerät aus evcc", en: "Device from evcc" },
  "switches.group.loadpoints": { de: "Ladepunkte & Heizungen", en: "Loadpoints & heaters" },
  "switches.group.consumers": { de: "Verbraucher", en: "Consumers" },
  "switches.kind.loadpoint": { de: "Ladepunkt", en: "Loadpoint" },
  "switches.kind.consumer": { de: "Verbraucher", en: "Consumer" },
  "switches.target.choose": { de: "– Gerät wählen –", en: "– Choose device –" },
  "switches.target.loading": { de: "Geräte werden geladen …", en: "Loading devices …" },
  "switches.target.notFound": { de: "{title} (nicht gefunden)", en: "{title} (not found)" },
  "switches.target.unavailable": {
    de: "Geräte konnten nicht geladen werden ({message}). Art wählen und Titel von Hand eintragen.",
    en: "Could not load devices ({message}). Choose the kind and enter the title manually.",
  },
  "switches.target.hint.loadpoint": {
    de: "Ladepunkt: evcc schaltet die Steckdose. Ein Tastendruck am Gerät stellt den Modus des Ladepunkts um.",
    en: "Loadpoint: evcc switches the plug. Pressing the button on the device changes the loadpoint mode.",
  },
  "switches.target.hint.consumer": {
    de: "Verbraucher: evcc misst über das Gateway, schaltet aber nicht. Schalten mit ⏻ auf der Seite „Verbraucher“.",
    en: "Consumer: evcc measures through the gateway but never switches. Switch with ⏻ on the “Consumers” page.",
  },
  "switches.meterYamlHint": {
    de: "In evcc: Verbraucher hinzufügen → Benutzerdefiniertes Gerät, Titel „{title}“, YAML einfügen. Einen bisherigen Tapo-Verbraucher mit demselben Gerät vorher löschen. Die Adresse stammt aus der Browserzeile; läuft evcc auf demselben Rechner, geht auch {local}.",
    en: "In evcc: add consumer → custom device, title “{title}”, paste this YAML. Delete a previous Tapo consumer for the same device first. The address is taken from the browser; if evcc runs on the same machine, {local} works too.",
  },
  "actions.consumerPower": { de: "An/Aus", en: "On/Off" },
  "actions.unreachable": {
    de: "Steckdose nicht erreichbar: {message}",
    en: "Plug unreachable: {message}",
  },
  "actions.powerError": {
    de: "Schalten fehlgeschlagen: {message}",
    en: "Switching failed: {message}",
  },
  "actions.power": { de: "An/Aus (Schnell)", en: "On/Off (Fast)" },
  "actions.smart": { de: "Smart", en: "Smart" },
  "actions.modeError": { de: "Modus konnte nicht gesetzt werden", en: "Could not set mode" },
  "switches.hint.ext": {
    de: "Seit Version 1.0.0 lautet der Pfad /addons-api/ext/switches-tapo/…. Die YAML in evcc bitte neu kopieren.",
    en: "Since version 1.0.0 the path is /addons-api/ext/switches-tapo/…. Please copy the YAML into evcc again.",
  },
  "switches.hint.close": { de: "Hinweis schließen", en: "Close hint" },
} satisfies Record<string, Record<"de" | "en", string>>;

export type MessageKey = keyof typeof MESSAGES;

/** Text in der gewünschten Sprache, `{name}`-Platzhalter werden ersetzt */
export function t(key: MessageKey, lang: string, params: Record<string, string> = {}): string {
  const text = localize(MESSAGES[key], lang);
  return text.replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match);
}
