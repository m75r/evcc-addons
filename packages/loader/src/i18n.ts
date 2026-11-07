// Lokalisierung: Localized-Werte und Kerntexte des Loaders (de/en)
import type { Localized } from "@evcc-addons/sdk";

/** Exakte Sprache, dann Basissprache, dann `en`, dann erster Eintrag */
export function localize(value: Localized | undefined, lang: string): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  const base = lang.split("-")[0];
  return value[lang] ?? value[base] ?? value.en ?? Object.values(value)[0] ?? "";
}

export const MESSAGES = {
  "addons.title": { de: "Addons", en: "Addons" },
  "addons.empty": { de: "Noch keine Addons installiert.", en: "No addons installed yet." },
  "addons.subtitle": {
    de: "Addons erweitern evcc um eigene Tabs, Seiten und Menüeinträge. Installieren, Einstellen und Deinstallieren ist nur mit dem Admin-Login von evcc möglich.",
    en: "Addons extend evcc with their own tabs, pages and menu items. Installing, configuring and uninstalling requires the evcc admin login.",
  },
  "manager.new": { de: "Neu", en: "New" },
  "page.notFound": { de: "Seite nicht gefunden", en: "Page not found" },
  "page.mountError": {
    de: "Die Seite konnte nicht angezeigt werden:",
    en: "The page could not be displayed:",
  },
  "core.error": { de: "Fehler im Addon-Loader:", en: "Addon loader error:" },
  "manager.installed": { de: "Installiert", en: "Installed" },
  "manager.loading": { de: "Addons werden geladen …", en: "Loading addons …" },
  "manager.loadError": {
    de: "Addons konnten nicht geladen werden: {message}",
    en: "Could not load addons: {message}",
  },
  "manager.startError": { de: "Fehler beim Start: {message}", en: "Failed to start: {message}" },
  "manager.enabled": { de: "Aktiv", en: "Enabled" },
  "manager.install.title": { de: "Addon installieren", en: "Install addon" },
  "manager.install.button": { de: "Installieren", en: "Install" },
  "manager.install.uploading": { de: "Wird installiert …", en: "Installing …" },
  "manager.install.installed": {
    de: "Installiert: {name} {version}",
    en: "Installed: {name} {version}",
  },
  "manager.install.reinstalled": {
    de: "Neu installiert: {name} {version}",
    en: "Reinstalled: {name} {version}",
  },
  "manager.install.updated": {
    de: "Aktualisiert von {previous} auf {version}",
    en: "Updated from {previous} to {version}",
  },
  "manager.uninstall": { de: "Deinstallieren", en: "Uninstall" },
  "manager.uninstall.confirm": {
    de: "{name} wirklich deinstallieren?",
    en: "Really uninstall {name}?",
  },
  "manager.actionError": { de: "Aktion fehlgeschlagen: {message}", en: "Action failed: {message}" },
  "manager.settings": { de: "Einstellungen", en: "Settings" },
  "manager.settings.title": { de: "Einstellungen {name}", en: "Settings {name}" },
  "manager.settings.save": { de: "Speichern", en: "Save" },
  "manager.settings.saving": { de: "Wird gespeichert …", en: "Saving …" },
  "manager.settings.cancel": { de: "Abbrechen", en: "Cancel" },
  "manager.settings.close": { de: "Schließen", en: "Close" },
  "manager.settings.readonly": {
    de: "Zum Ändern in evcc anmelden.",
    en: "Log in to evcc to change settings.",
  },
  "manager.settings.error": {
    de: "Speichern fehlgeschlagen: {message}",
    en: "Saving failed: {message}",
  },
  "manager.settings.tooLarge": {
    de: "Die Einstellungen sind zu groß (höchstens 4 KB).",
    en: "The settings are too large (4 KB max).",
  },
  "login.title": { de: "Zum Verwalten anmelden", en: "Log in to manage addons" },
  "login.password": { de: "Admin-Passwort von evcc", en: "evcc admin password" },
  "login.button": { de: "Anmelden", en: "Log in" },
  "login.wrongPassword": { de: "Passwort falsch", en: "Wrong password" },
  "login.failed": { de: "Anmeldung fehlgeschlagen: {message}", en: "Login failed: {message}" },
  "session.admin-password-missing": {
    de: "Bitte in evcc ein Admin-Passwort setzen.",
    en: "Please set an admin password in evcc.",
  },
  "session.demo-mode": {
    de: "evcc läuft im Demo-Modus, Addons lassen sich nicht verwalten.",
    en: "evcc runs in demo mode, addons cannot be managed.",
  },
  "session.evcc-unreachable": {
    de: "evcc ist nicht erreichbar, Addons lassen sich gerade nicht verwalten.",
    en: "evcc is unreachable, addons cannot be managed right now.",
  },
  "error.zip-slip": {
    de: "Das Paket enthält unzulässige Dateipfade.",
    en: "The package contains invalid file paths.",
  },
  "error.too-large": {
    de: "Das Paket ist zu groß (höchstens 10 MB).",
    en: "The package is too large (10 MB max).",
  },
  "error.too-many-files": {
    de: "Das Paket enthält zu viele Dateien (höchstens 500).",
    en: "The package contains too many files (500 max).",
  },
  "error.manifest-missing": {
    de: "Im Paket fehlt die Datei addon.json.",
    en: "The package has no addon.json.",
  },
  "error.manifest-invalid": {
    de: "addon.json ist ungültig: {message}",
    en: "Invalid addon.json: {message}",
  },
  "error.entry-missing": {
    de: "Die Einstiegsdatei aus addon.json fehlt im Paket.",
    en: "The entry file from addon.json is missing.",
  },
  "error.id-invalid": {
    de: "Die id in addon.json ist ungültig.",
    en: "The id in addon.json is invalid.",
  },
  "error.version-invalid": {
    de: "Die Version in addon.json ist ungültig (x.y.z).",
    en: "The version in addon.json is invalid (x.y.z).",
  },
  "error.api-version-unsupported": {
    de: "Das Addon benötigt eine neuere Addon-API.",
    en: "The addon requires a newer addon API.",
  },
  "error.settings-invalid": {
    de: "Ungültiger Wert für {message}",
    en: "Invalid value for {message}",
  },
  "error.zip-invalid": {
    de: "Die Datei ist keine gültige ZIP-Datei.",
    en: "The file is not a valid ZIP file.",
  },
} satisfies Record<string, Record<"de" | "en", string>>;

export type MessageKey = keyof typeof MESSAGES;

/** Kerntext in der gewünschten Sprache, `{name}`-Platzhalter werden ersetzt */
export function t(key: MessageKey, lang: string, params: Record<string, string> = {}): string {
  const text = localize(MESSAGES[key], lang);
  return text.replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match);
}
