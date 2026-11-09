# Addons für evcc-addons entwickeln

Ein Addon ist ein ES-Modul, das im evcc-Fenster läuft. Der Loader importiert es beim Laden der Seite und ruft `activate(api)` auf. Über die API fügt das Addon Tabs, Einträge im Menü „Mehr“ und eigene Seiten hinzu und liest die Live-Daten von evcc.

Ab `apiVersion: 2` darf ein Addon zusätzlich einen [Server-Teil](#server-teil-apiversion-2) mitbringen, der im Prozess des Proxys läuft und eigene HTTP-Routen anbietet.

## Paketformat

Ein Addon wird als ZIP-Datei installiert. Sie enthält:

- `addon.json`, das Manifest
- die Einstiegsdatei (`entry`, z. B. `index.js`) und beliebige weitere Dateien
- optional den Server-Teil (`server`, z. B. `server.mjs`, nur `apiVersion: 2`)

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
  "apiVersion": 2,
  "entry": "index.js"
}
```

| Feld          | Pflicht | Regeln                                                                                            |
| ------------- | ------- | ------------------------------------------------------------------------------------------------- |
| `id`          | ja      | `^[a-z][a-z0-9-]{1,39}$`, eindeutig. Bestimmt URL (`#/addons/<id>`) und Ablageort                 |
| `name`        | ja      | Text oder Objekt `{ "<sprache>": "<text>" }`                                                      |
| `version`     | ja      | `x.y.z` oder `x.y.z-pre`                                                                          |
| `description` | nein    | wie `name`                                                                                        |
| `apiVersion`  | ja      | `1` oder `2`, siehe [Kompatibilität](#kompatibilität)                                             |
| `entry`       | ja      | relativer Pfad auf eine `.js`- oder `.mjs`-Datei im Paket                                         |
| `server`      | nein    | nur bei `apiVersion: 2`: relativer Pfad auf eine `.mjs`-Datei im Paket, siehe Server-Teil         |
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

| Methode                            | Beschreibung                                                                                                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                               | id des Addons                                                                                                                                                                      |
| `addTab(item)`                     | Tab vor „Mehr“ in der Menüleiste. Unter 576 px steht er stattdessen im Menü „Mehr“                                                                                                 |
| `addMoreMenuItem(item)`            | Eintrag im Menü „Mehr“ hinter „Addons“, in Registrierungsreihenfolge                                                                                                               |
| `registerPage(page)`               | Seite unter `#/addons/<id>` bzw. `#/addons/<id>/<page.path>`. Über dem Inhalt steht eine Kopfzeile mit `page.title`                                                                |
| `state.get(key?)`                  | aktueller Wert unter einem Punkt-Schlüssel, z. B. `loadpoints.0.chargePower`, ohne Schlüssel der Gesamtzustand                                                                     |
| `state.subscribe(prefix, cb)`      | `cb(value)` bei jeder Änderung unter `prefix` (und sofort, wenn schon Daten vorliegen). Gibt die Abmeldefunktion zurück                                                            |
| `settings.get(key)`                | Wert einer Einstellung aus `addon.json` → `settings` (mit Default), `undefined` bei unbekanntem Schlüssel                                                                          |
| `settings.all()`                   | alle Einstellungen als Objekt `{ key: wert }` (Kopie)                                                                                                                              |
| `settings.onChange(cb)`            | `cb(values)` nach dem Speichern auf der Seite „Addons“ im selben Fenster. Andere Fenster und Geräte sehen Änderungen erst nach dem nächsten Laden. Gibt die Abmeldefunktion zurück |
| `evccApi(path, init?)`             | `fetch` auf `api/<path>` von evcc, relativ zur Seite, z. B. `evccApi("loadpoints/1/mode/now", { method: "POST" })`                                                                 |
| `extensions.provide(point, value)` | Stellt `value` unter einem [Erweiterungspunkt](#erweiterungspunkte) bereit (apiVersion 2). Gibt die Abmeldefunktion zurück                                                         |
| `extensions.get(point)`            | Einträge `{ addonId, value }` aller Anbieter in Registrierungsreihenfolge (Kopie)                                                                                                  |
| `extensions.onChange(point, cb)`   | `cb(entries)` bei neuen und abgemeldeten Anbietern. Gibt die Abmeldefunktion zurück                                                                                                |
| `addManagerDialog(def)`            | Icon-Button mit [Dialog](#dialoge-auf-der-seite-addons) auf der Karte des Addons in der Seite „Addons“ (apiVersion 2)                                                              |
| `serverApi(path, init?)`           | `fetch` auf die [eigenen Server-Routen](#eigene-server-routen-aufrufen-serverapi) unter `addons-api/ext/<id>/<path>` (apiVersion 2)                                                |
| `locale()`                         | Sprache der evcc-Oberfläche (`<html lang>`)                                                                                                                                        |
| `theme()`                          | `"light"` oder `"dark"`                                                                                                                                                            |
| `onEnvChange(cb)`                  | `cb()` bei Sprach- oder Theme-Wechsel. Gibt die Abmeldefunktion zurück                                                                                                             |

`NavItem`: `label` (Pflicht), `icon` (SVG-Markup, nur Tabs, Standard: Puzzle-Icon), `page` (Unterseite) oder `href` (freies Ziel).

`PageDef.mount(el, ctx)`: `el` ist ein leeres Element, `ctx.subPath` der Pfad unterhalb der registrierten Seite, `ctx.api` die API. Die optionale Rückgabe wird beim Verlassen der Seite aufgerufen.

### Erweiterungspunkte

Addons können einander Funktionen bereitstellen. Ein Addon definiert einen Erweiterungspunkt und dokumentiert den Vertrag, andere Addons stellen Werte dafür bereit:

```ts
// Anbieter
const withdraw = api.extensions.provide("consumers.cardActions", provider);

// Nutzer
const render = () => draw(api.extensions.get<CardActionsProvider>("consumers.cardActions"));
render();
const off = api.extensions.onChange("consumers.cardActions", render);
```

- Name: `<id-des-definierenden-addons>.<punkt>`, z. B. `consumers.cardActions`.
- Die Addons laden parallel, die Reihenfolge ist nicht festgelegt. Nutzer lesen deshalb mit `get` und hören mit `onChange` auf späte Anbieter.
- Werte sind an DOM gebunden, nicht an Preact: Jedes Addon bündelt sein eigenes Preact, Komponenten aus einem fremden Bundle brechen Hooks. Üblich ist ein Objekt mit `mount(el, ctx)`, das `{ update(ctx), destroy() }` zurückgibt; der Anbieter rendert mit seiner eigenen Preact-Instanz in `el`.
- Die Vertragstypen liegen beim definierenden Addon. Anbieter kopieren sie mit Verweis auf die Quelle.
- Ein Fehler in einem `onChange`-Callback erscheint als Fehler des abonnierenden Addons, andere Callbacks laufen weiter.

#### Beispiel: `consumers.cardActions`

Das Addon „Verbraucher“ definiert den Erweiterungspunkt `consumers.cardActions`. Steckdosen-Addons liefern darüber Buttons für Karten der Seite „Verbraucher“. Der Vertrag steht in `addons/consumers/src/extension-contract.ts`:

```ts
type CardRef =
  | { kind: "loadpoint"; index: number; title: string }
  | { kind: "meter"; usage: "consumer" | "aux"; name: string; title: string };

interface CardActionsProvider {
  claims(card: CardRef): boolean;
  subscribe(onChange: () => void): () => void;
  mount(
    slots: { actions: HTMLElement; message: HTMLElement },
    ctx: { card: CardRef; mode: "off" | "smart" | "now" | null; locale: string },
  ): { update(ctx): void; destroy(): void };
}
```

- `claims(card)`: Der Anbieter beansprucht nur Karten seiner eigenen Geräte (z. B. Ladepunkte, an die eine eigene Steckdose gebunden ist). So können mehrere Steckdosen-Addons nebeneinander laufen, ohne doppelte Buttons. Beanspruchte Karten stehen unter „Schaltbar“.
- `subscribe(onChange)`: meldet geänderte Beanspruchungen, z. B. nach dem Laden der eigenen Geräteliste. consumers fragt dann `claims` neu ab, die Karte wechselt ohne Neuladen den Abschnitt.
- `mount`: rendert in zwei leere Elemente, `actions` rechts im Kartenkopf und `message` unter den Zeilen. `update` folgt bei geändertem Modus, Titel oder Sprache, `destroy` beim Freigeben oder Verlassen der Seite.
- `title` ist der angezeigte Titel (`title || #<n>` bei Ladepunkten, `title || name` bei Metern), `mode` bei Meter-Karten `null`.
- Wirft `claims`, `mount`, `update` oder `destroy`, zeigt die Karte „Erweiterung von <id> fehlgeschlagen: …“. Andere Karten und Anbieter laufen weiter.

Ein Anbieter, z. B. `switches-tapo`, kopiert die Typen mit Verweis auf die Quelle und meldet sich in `activate` an: `api.extensions.provide("consumers.cardActions", provider)`.

### Dialoge auf der Seite „Addons“

```ts
api.addManagerDialog({
  label: { de: "Steckdosen", en: "Plugs" },
  title: { de: "Steckdosen", en: "Plugs" },
  icon: "<svg …></svg>",
  mount(el, ctx) {
    render(<Dialog canManage={ctx.canManage} onClose={ctx.close} />, el);
    return () => render(null, el);
  },
});
```

- Der Loader zeigt je Dialog einen Icon-Button auf der Karte des Addons, links neben ⚙, nur solange das Addon aktiv ist (`data-testid="addon-dialog-<n>"`).
- Rahmen, Titel, ✕, Escape und Klick auf den Hintergrund kommen vom Loader (Bootstrap `modal-lg`). Das Addon rendert nur den Inhalt in `el`. Weitere Ansichten, z. B. ein Formular, wechselt es im selben Element statt einen zweiten Dialog zu öffnen.
- `ctx`: `locale`, `canManage` (evcc-Admin angemeldet), `confirm(message)`, `onUnauthorized()` (schließt und zeigt das Anmeldefeld, z. B. nach einer 401-Antwort) und `close()`.
- Ändern sich Login oder Sprache, räumt der Loader auf und ruft `mount` erneut auf.
- Wirft `mount`, zeigt der Dialog die Meldung, und sie erscheint als Fehler auf der Karte.

### Eigene Server-Routen aufrufen (`serverApi`)

```ts
const res = await api.serverApi("items", { method: "POST", body: JSON.stringify(item) });
```

`serverApi` ist `fetch` auf `addons-api/ext/<id>/<path>` relativ zur aktuellen Seite (funktioniert auch unter einem Unterpfad). Cookies von evcc gehen mit, Routen mit `auth.require` sehen also den Admin-Login. Fehler kommen als `{ "error": { "code", "message" } }` mit dem Status aus `httpError`.

### Live-Daten

Die Daten stammen aus dem evcc-WebSocket `/ws`. Die Verbindung öffnet der Loader erst beim ersten `get` oder `subscribe` und teilt sie zwischen allen Addons. Hinweise:

- Ladepunkte sind im WebSocket 0-basiert (`loadpoints.0`), in der REST-API 1-basiert (`api/loadpoints/1/…`).
- `chargePower` und `power` sind in W, `chargedEnergy` in Wh, `energy` von Metern in kWh.
- Übergebene Werte sind Live-Objekte. Bitte nicht verändern.
- evcc gibt für diese Daten keine Kompatibilitätszusage. Felder können sich mit neuen evcc-Versionen ändern.

## Server-Teil (apiVersion 2)

Ein Addon kann Code im Proxy ausführen, z. B. ein Gateway, das evcc abfragt, oder einen Dienst mit eigenen Daten. Das Manifest nennt die Datei:

```json
{ "id": "my-addon", "apiVersion": 2, "entry": "index.js", "server": "server.mjs" }
```

`server.mjs` ist ein ES-Modul für Node 22 und exportiert `activateServer`:

```ts
import type { ServerActivateFn } from "@evcc-addons/sdk/server";

export const activateServer: ServerActivateFn = (server) => {
  server.route("GET", /^\/items$/, (_req, res) => server.http.sendJson(res, 200, []));
  server.route("POST", /^\/items\/([^/]+)$/, async (req, res, [id]) => {
    await server.auth.require(req); // nur für evcc-Admins
    const body = await server.http.readJson(req, 4096);
    if (!body) throw server.httpError(400, "body-invalid", "Body fehlt");
    server.http.sendJson(res, 200, { id });
  });
  const timer = setInterval(() => server.logger.debug("tick"), 5000);
  return { stop: () => clearInterval(timer) };
};
```

`ServerApi`:

| Feld                               | Beschreibung                                                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `id`, `version`                    | aus dem Manifest                                                                                                           |
| `dataDir`                          | eigener Datenordner `<dataDir>/addon-data/<id>/` (Rechte 0700)                                                             |
| `evccUrl`                          | Basis-URL von evcc aus der Konfiguration des Proxys, z. B. `http://127.0.0.1:7070`                                         |
| `logger`                           | `debug`/`info`/`warn`/`error(msg, fields?)`, logfmt im Journal des Proxys, jede Zeile mit `addon=<id>`                     |
| `settings`                         | `get(key)`, `all()`, `onChange(cb)` wie im Browser; `onChange` meldet jedes Speichern auf der Seite „Addons“               |
| `route(method, pattern, handler)`  | Route unter `/addons-api/ext/<id>`. `pattern` prüft den Sub-Pfad (`/` ohne Sub-Pfad), Gruppen kommen dekodiert in `params` |
| `auth.check(req)`                  | `true`, wenn die Anfrage von einem angemeldeten evcc-Admin stammt                                                          |
| `auth.require(req)`                | wirft sonst einen Fehler, den die Plattform mit 401/403/502 beantwortet                                                    |
| `http.readJson(req, limit)`        | liest einen JSON-Body bis `limit` Bytes (sonst 413, ungültiges JSON 400)                                                   |
| `http.sendJson(res, status, body)` | JSON-Antwort mit `cache-control: no-store`                                                                                 |
| `httpError(status, code, message)` | Fehler zum Werfen; die Plattform antwortet mit `status` und `{ "error": { "code", "message" } }`                           |

Routen und Methoden: `GET`, `POST`, `PUT`, `PATCH` und `DELETE`. Passt der Pfad, aber nicht die Methode, kommt 405, sonst 404. Ein Handler, der etwas anderes als `httpError` wirft, ergibt 500. Der Proxy läuft weiter.

Im Browser ruft das Addon seine Routen mit `api.serverApi(path, init?)` auf. Andere Programme, z. B. evcc selbst, erreichen sie unter `http://<proxy>/addons-api/ext/<id>/…`. Ohne `auth.require` ist eine Route für jeden lesbar, der den Proxy erreicht. In Logs schreibt der Proxy nur `/addons-api/ext/<id>/***`, damit Tokens in Pfaden nicht im Journal landen.

Daten:

- Der Datenordner bleibt bei Updates und beim Deaktivieren erhalten.
- Deinstallieren löscht ihn. Die Rückfrage auf der Seite „Addons“ weist darauf hin, wenn er Dateien enthält.
- `server.mjs install --reset` löscht `addon-data/` mit.
- Zugangsdaten bitte mit Rechten 0600 schreiben.

Lebenszyklus:

- Der Proxy lädt den Server-Teil beim Start, nach Installation, Update und Aktivierung.
- Er ruft `stop()` beim Deaktivieren, vor dem Deinstallieren, vor einem Update und beim Beenden. `stop()` darf `async` sein.
- Wirft `activateServer`, fehlt der Export oder lässt sich das Modul nicht laden, betrifft das nur dieses Addon. Die Meldung erscheint als Startfehler auf seiner Karte („Server-Teil: …“), seine Routen antworten mit 404. Ein erneuter Versuch folgt nach dem nächsten Aktivieren, Update oder Neustart.
- Installationen per CLI (`server.mjs install`) laufen in einem eigenen Prozess. Der Proxy gleicht bei jeder Anfrage auf `/addons-api/ext/<id>/…` und beim Laden der Seite „Addons“ mit dem Datenverzeichnis ab und lädt dann neu oder stoppt. Sicher ist `systemctl restart evcc-addons`.
- Neu geladen wird ohne Neustart des Prozesses per `import("…/server.mjs?v=<version>&t=<zeit>")`. Die alte Modulinstanz bleibt bis zum Neustart im Speicher. Timer, Sockets und Listener deshalb in `stop()` beenden.

Gebaut wird `server.mjs` automatisch, wenn das Addon `src/server.ts`, `src/server.js` oder `src/server/index.ts` hat (siehe [Bauen und Packen](#bauen-und-packen)).

## Kompatibilität

| Plattform | `apiVersion` 1 | `apiVersion` 2 |
| --------- | -------------- | -------------- |
| bis 1.2.x | ja             | abgelehnt      |
| ab 2.0.0  | ja             | ja             |

Eine ältere Plattform lehnt Addons mit `apiVersion: 2` beim Installieren mit `api-version-unsupported` ab. Addons mit `apiVersion: 1` laufen unverändert weiter und erhalten im Browser dieselbe API. Das Feld `server` ist nur bei `apiVersion: 2` erlaubt.

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

## Eigenes Addon-Repo aufsetzen

Alles, was ein Addon-Repo zum Bauen und Testen braucht, steckt im SDK-Tarball am GitHub-Release der Plattform. Die SDK-Version ist gleich der Plattform-Version und enthält unter `runtime/` genau diese Plattform (`server.mjs`, `public/loader.js`). Es gibt kein npm-Paket; eingebunden wird die Release-URL:

```json
{
  "type": "module",
  "scripts": {
    "build": "evcc-addon build",
    "test": "vitest run",
    "e2e": "npm run build && playwright test -c e2e"
  },
  "devDependencies": {
    "@evcc-addons/sdk": "https://github.com/m75r/evcc-addons/releases/download/2.0.0/evcc-addons-sdk-2.0.0.tgz"
  }
}
```

Ein Update der Plattform heißt: URL tauschen. Assets eines Releases werden nie ersetzt, der Integrity-Hash im Lockfile bleibt gültig.

Inhalt des SDK:

| Export                                | Inhalt                                                                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `@evcc-addons/sdk`                    | Typen der Browser-API (`ActivateFn`, `AddonApi`, …), `ADDON_API_VERSION`, `SUPPORTED_API_VERSIONS`                         |
| `@evcc-addons/sdk/server`             | Typen des Server-Teils (`ServerActivateFn`, `ServerApi`, …)                                                                |
| `@evcc-addons/sdk/vitest`             | `cssAsText()`: CSS-Importe als Text wie beim Bauen                                                                         |
| `@evcc-addons/sdk/testing/harness`    | `createTestServerApi({ admin, settings, dataDir, evccUrl })` für Unit-Tests von Server-Teilen, `createTestLogger()`        |
| `@evcc-addons/sdk/testing/fake-evcc`  | `startFakeEvcc()`: minimaler evcc mit Login, Ladepunkten, Verbrauchern und WebSocket                                       |
| `@evcc-addons/sdk/testing/server`     | `startTestProxy`, `installAddons`, `resetAddons` (CLI `install`, Daten unter `e2e/.data`)                                  |
| `@evcc-addons/sdk/testing/playwright` | `e2eWebServers(…)`, `login`, `openEvcc`, `openMoreMenu`, `uploadZip`, `installViaUi`, `setAdminPassword`, `ADMIN_PASSWORD` |
| `testing/compose.yml`                 | evcc in Docker (`EVCC_CONFIG`, `EVCC_IMAGE`), von `e2eWebServers` genutzt                                                  |
| `evcc-addon` (bin)                    | CLI zum Bauen, siehe [Bauen und Packen](#bauen-und-packen)                                                                 |

`vitest.config.ts`:

```ts
import { cssAsText } from "@evcc-addons/sdk/vitest";
import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: { jsx: { runtime: "automatic", importSource: "preact" } },
  plugins: [cssAsText()],
  test: { environment: "happy-dom", include: ["test/**/*.test.{ts,tsx}"] },
});
```

`e2e/playwright.config.ts` (evcc in Docker auf 17070, Proxy auf 17080, beide Ports fest):

```ts
import { defineConfig, devices } from "@playwright/test";
import { e2eWebServers, PROXY_URL } from "@evcc-addons/sdk/testing/playwright";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

export default defineConfig({
  testDir: "tests",
  workers: 1,
  use: { baseURL: PROXY_URL, locale: "de-DE" },
  webServer: e2eWebServers({
    root,
    evccConfig: "e2e/evcc.yaml",
    zips: ["dist/my-addon-1.0.0.zip"],
  }),
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    { name: "chromium", use: devices["Desktop Chrome"], dependencies: ["setup"] },
  ],
});
```

- `zips` sind vor jedem Start installiert. `resetAddons({ root, zips })` setzt den Stand in einem Test zurück (löscht auch `addon-data/`).
- `prepare`: Node-Skript, das vor dem Proxy läuft (z. B. Fixtures bauen). `extra`: weitere Webserver, z. B. Fake-Geräte; sie starten vor dem Proxy.
- Im Setup-Projekt `setAdminPassword(request)` aufrufen, damit `login(page)` mit `ADMIN_PASSWORD` funktioniert.
- evcc erreicht den Proxy aus dem Container unter `http://host.docker.internal:17080` (Docker Desktop). Unter Linux ohne Docker Desktop braucht der Container dafür einen Eintrag `host.docker.internal:host-gateway`.

## Bauen und Packen

```sh
evcc-addon build                        # aktuelles Verzeichnis → dist/<id>-<version>.zip
evcc-addon build <dir> --out <ordner>   # anderer Ausgabeordner
evcc-addon build --version 0.2.0        # Version im gepackten Manifest überschreiben
evcc-addon build --legal-dir <ordner>   # LICENSE und THIRD_PARTY_NOTICES.md aus einem anderen Ordner (z. B. für Test-Fixtures)
```

Das CLI bündelt `src/index.tsx`, `src/index.ts` oder `src/index.js` mit esbuild (ESM, JSX für Preact, CSS-Importe als Text). Jedes Addon bündelt seine Abhängigkeiten (z. B. Preact) selbst.

Gibt es `src/server.ts`, `src/server.js` oder `src/server/index.ts`, entsteht zusätzlich `server.mjs` (esbuild, `platform: "node"`, `target: "node22"`, ESM) und das gepackte Manifest erhält `"server": "server.mjs"`.

In die ZIP kommen `addon.json`, die Bundles sowie `LICENSE` und `THIRD_PARTY_NOTICES.md` aus dem Addon-Verzeichnis. Fehlt eine der beiden Dateien, bricht der Build ab. `THIRD_PARTY_NOTICES.md` nennt die Fremdteile, die in den Bundles des Addons stecken.

Installieren lässt sich die ZIP auf der Seite „Addons“ oder per CLI:

```sh
sudo -u evcc-addons node /opt/evcc-addons/server.mjs install --config /etc/evcc-addons/config.json my-addon-1.0.0.zip
```

## Vertrauensmodell

Addons laufen mit vollen Rechten im evcc-Fenster. Sie können alles, was die evcc-Oberfläche kann, auch evcc steuern. Installiert werden sollten daher nur vertrauenswürdige Addons. Installieren darf nur, wer in evcc als Admin angemeldet ist.

Ein Server-Teil läuft im Prozess des Proxys mit den Rechten des Dienst-Users `evcc-addons`. Er kann alle Dateien lesen und schreiben, die dieser User erreicht, also auch die Daten anderer Addons und `state.json`, und Verbindungen ins Netz aufbauen. Der eigene Datenordner ist eine Konvention, keine Sandbox. Für Server-Teile gilt deshalb erst recht: nur installieren, was man kennt.
