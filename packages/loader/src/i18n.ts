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
  "manager.marketplace": { de: "Marketplace", en: "Marketplace" },
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
  "manager.install.title": { de: "Aus Datei installieren", en: "Install from file" },
  "catalog.title": { de: "Addon hinzufügen", en: "Add addon" },
  "catalog.loading": { de: "Katalog wird geladen …", en: "Loading catalog …" },
  "catalog.loadError": {
    de: "Katalog nicht geladen: {message}",
    en: "Catalog not loaded: {message}",
  },
  "catalog.empty": { de: "Keine Addons im Katalog.", en: "No addons in the catalog." },
  "catalog.install": { de: "Installieren", en: "Install" },
  "catalog.update": { de: "Aktualisieren", en: "Update" },
  "catalog.reinstall": { de: "Neu installieren", en: "Reinstall" },
  "catalog.installed": { de: "✓ Installiert", en: "✓ Installed" },
  "catalog.installedVersion": { de: "Installiert: v{version}", en: "Installed: v{version}" },
  "catalog.incompatible": {
    de: "Benötigt eine neuere Version von evcc-addons",
    en: "Requires a newer version of evcc-addons",
  },
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
  "manager.uninstall.confirmData": {
    de: "Gespeicherte Daten des Addons werden gelöscht.",
    en: "Data stored by the addon will be deleted.",
  },
  "manager.actionError": { de: "Aktion fehlgeschlagen: {message}", en: "Action failed: {message}" },
  "manager.settings": { de: "Einstellungen", en: "Settings" },
  "manager.dialog.mountError": {
    de: "Der Dialog konnte nicht angezeigt werden: {message}",
    en: "The dialog could not be displayed: {message}",
  },
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
  "error.catalog-unavailable": {
    de: "Der Katalog ist nicht erreichbar ({message}).",
    en: "The catalog is unreachable ({message}).",
  },
  "error.download-failed": {
    de: "Download fehlgeschlagen ({message}).",
    en: "Download failed ({message}).",
  },
  "error.checksum-mismatch": {
    de: "Die Prüfsumme des Downloads stimmt nicht mit dem Katalog überein.",
    en: "The checksum of the download does not match the catalog.",
  },
  "error.catalog-mismatch": {
    de: "Das Paket passt nicht zum Katalog: {message}",
    en: "The package does not match the catalog: {message}",
  },
  "error.catalog-incompatible": {
    de: "Das Addon benötigt eine neuere Version von evcc-addons.",
    en: "The addon requires a newer version of evcc-addons.",
  },
  "error.downgrade": {
    de: "Kein Downgrade über den Katalog: {message}",
    en: "No downgrade via the catalog: {message}",
  },
  "platform.badge": { de: "Update verfügbar", en: "Update available" },
  "platform.title": { de: "evcc-addons aktualisieren", en: "Update evcc-addons" },
  "platform.installed": { de: "Installiert", en: "Installed" },
  "platform.available": { de: "Verfügbar", en: "Available" },
  "platform.published": { de: "veröffentlicht am {date}", en: "published on {date}" },
  "platform.notes": { de: "Versionshinweise auf GitHub", en: "Release notes on GitHub" },
  "platform.upToDate": {
    de: "evcc-addons ist aktuell (v{version}).",
    en: "evcc-addons is up to date (v{version}).",
  },
  "platform.check": { de: "Jetzt prüfen", en: "Check now" },
  "platform.checking": { de: "Wird geprüft …", en: "Checking …" },
  "platform.checkError": {
    de: "Prüfung fehlgeschlagen: {message}",
    en: "Check failed: {message}",
  },
  "platform.manual": {
    de: "Automatische Installation ist hier nicht verfügbar.",
    en: "Automatic installation is not available here.",
  },
  "platform.download": { de: "Paket herunterladen", en: "Download package" },
  "platform.manualCommand": { de: "und auf dem Pi installieren:", en: "and install it on the Pi:" },
  "platform.versionLabel": {
    de: "Version von evcc-addons prüfen",
    en: "Check evcc-addons version",
  },
  "platform.update": { de: "Aktualisieren", en: "Update" },
  "platform.restartHint": {
    de: "Der Dienst startet während der Installation neu, die Seite lädt danach automatisch neu.",
    en: "The service restarts during installation, the page reloads automatically afterwards.",
  },
  "platform.phase.starting": { de: "Aktualisierung wird gestartet …", en: "Starting update …" },
  "platform.phase.downloading": {
    de: "v{version} wird heruntergeladen …",
    en: "Downloading v{version} …",
  },
  "platform.phase.installing": {
    de: "v{version} wird installiert …",
    en: "Installing v{version} …",
  },
  "platform.phase.restarting": { de: "Dienst startet neu …", en: "Service restarting …" },
  "platform.failed": {
    de: "Aktualisierung fehlgeschlagen: {message}",
    en: "Update failed: {message}",
  },
  "platform.timeout": {
    de: "Die Aktualisierung dauert ungewöhnlich lange.",
    en: "The update is taking unusually long.",
  },
  "platform.journal": {
    de: "Details: journalctl -u evcc-addons-update",
    en: "Details: journalctl -u evcc-addons-update",
  },
  "error.update-unavailable": {
    de: "Kein Update möglich: {message}",
    en: "No update possible: {message}",
  },
  "error.update-running": {
    de: "Es läuft bereits eine Aktualisierung.",
    en: "An update is already running.",
  },
  "error.release-unavailable": {
    de: "GitHub ist nicht erreichbar ({message}).",
    en: "GitHub is unreachable ({message}).",
  },
  "error.release-invalid": {
    de: "Die Antwort von GitHub ist ungültig: {message}",
    en: "Invalid response from GitHub: {message}",
  },
} satisfies Record<string, Record<"de" | "en", string>>;

export type MessageKey = keyof typeof MESSAGES;

/** Kerntext in der gewünschten Sprache, `{name}`-Platzhalter werden ersetzt */
export function t(key: MessageKey, lang: string, params: Record<string, string> = {}): string {
  const text = localize(MESSAGES[key], lang);
  return text.replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match);
}
