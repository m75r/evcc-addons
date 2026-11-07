# Addons für evcc-addons entwickeln

Ein Addon ist ein ES-Modul, das im evcc-Fenster läuft. Der Loader importiert es beim Laden der Seite und ruft `activate(api)` auf. Über die API fügt das Addon Tabs, Einträge im Menü „Mehr“ und eigene Seiten hinzu und liest die Live-Daten von evcc.

## Paketformat

Ein Addon wird als ZIP-Datei installiert. Sie enthält:

- `addon.json`, das Manifest
- die Einstiegsdatei (`entry`, z. B. `index.js`) und beliebige weitere Dateien

Liegen alle Dateien in einem gemeinsamen Ordner (z. B. `hello/addon.json`), wird dieser beim Installieren entfernt.

Grenzen: höchstens 10 MB entpackt (`maxUploadBytes` in `config.json`) und 500 Dateien. Pfade mit `..`, absolute Pfade, Backslashes und Laufwerksbuchstaben werden abgelehnt.

Die Dateien eines Addons liefert der Proxy unter `/addons-static/<id>/<pfad>` aus.

## `addon.json`

```json
{
  "id": "hello",
  "name": { "de": "Hallo Welt", "en": "Hello World" },
  "version": "0.1.0",
  "description": { "de": "Beispiel-Addon", "en": "Example addon" },
  "apiVersion": 1,
  "entry": "index.js"
}
```

| Feld          | Pflicht | Regeln                                                                                            |
| ------------- | ------- | ------------------------------------------------------------------------------------------------- |
| `id`          | ja      | `^[a-z][a-z0-9-]{1,39}$`, eindeutig. Bestimmt URL (`#/addons/<id>`) und Ablageort                 |
| `name`        | ja      | Text oder Objekt `{ "<sprache>": "<text>" }`                                                      |
| `version`     | ja      | `x.y.z` oder `x.y.z-pre`                                                                          |
| `description` | nein    | wie `name`                                                                                        |
| `apiVersion`  | ja      | `1`                                                                                               |
| `entry`       | ja      | relativer Pfad auf eine `.js`- oder `.mjs`-Datei im Paket                                         |
| `settings`    | nein    | Einstellungen, die ein Admin auf der Seite „Addons“ ändert, siehe [Einstellungen](#einstellungen) |

Texte vom Typ `Localized` werden so aufgelöst: exakte Sprache (`de-DE`), dann Basissprache (`de`), dann `en`, dann der erste Eintrag.

## Einstellungen

Ein Addon kann in `addon.json` Einstellungen deklarieren. Die Seite „Addons“ zeigt dann auf der Karte des Addons einen Einstellungs-Button, der ein Modal mit einem Formular öffnet. Das Formular entsteht aus dem Schema. Es funktioniert deshalb auch für deaktivierte oder beim Start fehlgeschlagene Addons.

```json
"settings": [
  { "key": "showEnergy", "type": "boolean", "label": { "de": "Verbraucht anzeigen", "en": "Show consumption" }, "default": true },
  {
    "key": "sort",
    "type": "select",
    "label": { "de": "Sortierung", "en": "Sort order" },
    "default": "name-asc",
    "options": [
      { "value": "name-asc", "label": "Name A–Z" },
      { "value": "name-desc", "label": "Name Z–A" }
    ]
  }
]
```

Regeln (sonst lehnt die Installation das Paket mit `manifest-invalid` ab, die Meldung nennt das Feld, z. B. `settings[1].default`):

- höchstens 20 Einträge, `key` passt auf `^[a-zA-Z][a-zA-Z0-9_-]{0,39}$` und ist eindeutig
- `label` ist ein `Localized`
- `type: "boolean"`: Schalter, `default` ist `true` oder `false`
- `type: "select"`: Auswahlliste mit 1–20 `options`. Jede Option hat einen eindeutigen `value` (Text, 1–40 Zeichen) und ein `label` (`Localized`). `default` ist einer der `value`s.

Speicherung und Rechte:

- Die Werte liegen im Proxy in `state.json` unter `addons.<id>.settings` und gelten damit für alle Geräte.
- Lesen darf jeder, ändern nur ein in evcc angemeldeter Admin (`PATCH /addons-api/addons/<id>/settings` mit `{ "values": { … } }`).
- Gespeichert werden nur ausdrücklich gesetzte Werte. Fehlende Werte erhalten den `default`, auch wenn ein Update ihn ändert.
- Aktivieren, Deaktivieren und Updates behalten die Werte. Deinstallieren löscht sie.
- Kennt ein Update einen Schlüssel nicht mehr oder ist ein gespeicherter Wert nicht mehr gültig (z. B. eine entfernte Option), fällt er beim Lesen weg.

Lesen im Addon:

```ts
const show = api.settings.get("showEnergy") !== false;
const off = api.settings.onChange((values) => render(values));
```

Wer ein Addon mit Einstellungen auch in älteren Versionen von evcc-addons ohne `api.settings` installierbar halten will, prüft vorher, ob `api.settings` vorhanden ist, und nutzt sonst die Defaults.

## `activate(api)`

```ts
import type { ActivateFn } from "@evcc-addons/sdk";

export const activate: ActivateFn = (api) => {
  api.addTab({ label: { de: "Verbraucher", en: "Consumers" }, icon: "<svg …></svg>" });
  api.addMoreMenuItem({ label: "Details", page: "detail" });
  api.registerPage({
    title: { de: "Verbraucher", en: "Consumers" },
    mount(el, ctx) {
      el.textContent = "…";
      const off = ctx.api.state.subscribe("pvPower", (value) => {
        el.textContent = `PV: ${String(value)} W`;
      });
      return off; // Aufräumen beim Verlassen der Seite
    },
  });
};
```

`activate` darf `async` sein. Wirft es oder fehlt der Export, gilt das Addon als nicht gestartet. Der Fehler erscheint dann auf der Seite „Addons“, andere Addons laden trotzdem.

## API

| Methode                       | Beschreibung                                                                                                                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                          | id des Addons                                                                                                                                                                      |
| `addTab(item)`                | Tab vor „Mehr“ in der Menüleiste. Unter 576 px steht er stattdessen im Menü „Mehr“                                                                                                 |
| `addMoreMenuItem(item)`       | Eintrag im Menü „Mehr“ hinter „Addons“, in Registrierungsreihenfolge                                                                                                               |
| `registerPage(page)`          | Seite unter `#/addons/<id>` bzw. `#/addons/<id>/<page.path>`. Über dem Inhalt steht eine Kopfzeile mit `page.title`                                                                |
| `state.get(key?)`             | aktueller Wert unter einem Punkt-Schlüssel, z. B. `loadpoints.0.chargePower`, ohne Schlüssel der Gesamtzustand                                                                     |
| `state.subscribe(prefix, cb)` | `cb(value)` bei jeder Änderung unter `prefix` (und sofort, wenn schon Daten vorliegen). Gibt die Abmeldefunktion zurück                                                            |
| `settings.get(key)`           | Wert einer Einstellung aus `addon.json` → `settings` (mit Default), `undefined` bei unbekanntem Schlüssel                                                                          |
| `settings.all()`              | alle Einstellungen als Objekt `{ key: wert }` (Kopie)                                                                                                                              |
| `settings.onChange(cb)`       | `cb(values)` nach dem Speichern auf der Seite „Addons“ im selben Fenster. Andere Fenster und Geräte sehen Änderungen erst nach dem nächsten Laden. Gibt die Abmeldefunktion zurück |
| `evccApi(path, init?)`        | `fetch` auf `api/<path>` von evcc, relativ zur Seite, z. B. `evccApi("loadpoints/1/mode/now", { method: "POST" })`                                                                 |
| `locale()`                    | Sprache der evcc-Oberfläche (`<html lang>`)                                                                                                                                        |
| `theme()`                     | `"light"` oder `"dark"`                                                                                                                                                            |
| `onEnvChange(cb)`             | `cb()` bei Sprach- oder Theme-Wechsel. Gibt die Abmeldefunktion zurück                                                                                                             |

`NavItem`: `label` (Pflicht), `icon` (SVG-Markup, nur Tabs, Standard: Puzzle-Icon), `page` (Unterseite) oder `href` (freies Ziel).

`PageDef.mount(el, ctx)`: `el` ist ein leeres Element, `ctx.subPath` der Pfad unterhalb der registrierten Seite, `ctx.api` die API. Die optionale Rückgabe wird beim Verlassen der Seite aufgerufen.

### Live-Daten

Die Daten stammen aus dem evcc-WebSocket `/ws`. Die Verbindung öffnet der Loader erst beim ersten `get` oder `subscribe` und teilt sie zwischen allen Addons. Hinweise:

- Ladepunkte sind im WebSocket 0-basiert (`loadpoints.0`), in der REST-API 1-basiert (`api/loadpoints/1/…`).
- `chargePower` und `power` sind in W, `chargedEnergy` in Wh, `energy` von Metern in kWh.
- Übergebene Werte sind Live-Objekte. Bitte nicht verändern.
- evcc gibt für diese Daten keine Kompatibilitätszusage. Felder können sich mit neuen evcc-Versionen ändern.

## Routen

| Route                      | Inhalt                                  |
| -------------------------- | --------------------------------------- |
| `#/addons`                 | Seite „Addons“ (Verwaltung)             |
| `#/addons/<id>`            | Seite ohne `path`                       |
| `#/addons/<id>/<path>[/…]` | Seite mit `path`, Rest in `ctx.subPath` |

## Stil

Addons laufen im Light DOM des evcc-Fensters und können dessen Styles nutzen:

- Bootstrap-5-Klassen (`btn`, `btn-group`, `form-check form-switch`, `text-muted`, …)
- CSS-Variablen von evcc, z. B. `--evcc-box`, `--evcc-default-text`, `--evcc-gray`, `--evcc-green`, `--bs-primary`. Sie wechseln automatisch mit dem Dark-Mode.
- `.round-box` für Karten wie auf der evcc-Konfigurationsseite

Eigenes CSS am besten beim `mount` als `<style>` einfügen und mit einer Klasse des Addons präfixen.

## Bauen und Packen

```sh
node scripts/build-addon.mjs addons/hello              # → dist/addons/hello-0.1.0.zip
node scripts/build-addon.mjs <dir> --out <ordner>      # anderer Ausgabeordner
node scripts/build-addon.mjs <dir> --version 0.2.0     # Version im gepackten Manifest überschreiben
```

Das Skript bündelt `src/index.tsx`, `src/index.ts` oder `src/index.js` mit esbuild (ESM, JSX für Preact, CSS-Importe als Text) und packt Bundle und `addon.json` in eine ZIP. Jedes Addon bündelt seine Abhängigkeiten (z. B. Preact) selbst.

Installieren lässt sich die ZIP auf der Seite „Addons“ oder per CLI:

```sh
sudo -u evcc-addons node /opt/evcc-addons/server.mjs install --config /etc/evcc-addons/config.json hello-0.1.0.zip
```

## Vertrauensmodell

Addons laufen mit vollen Rechten im evcc-Fenster. Sie können alles, was die evcc-Oberfläche kann, auch evcc steuern. Installiert werden sollten daher nur vertrauenswürdige Addons. Installieren darf nur, wer in evcc als Admin angemeldet ist.
