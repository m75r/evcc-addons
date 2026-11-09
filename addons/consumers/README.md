# Verbraucher (`consumers`)

Addon für [evcc-addons](https://github.com/m75r/evcc-addons) ab 2.0.0 (`apiVersion: 2`).

Das Addon `consumers` fügt den Tab „Verbraucher“ hinzu (`#/addons/consumers`, unter 576 px im Menü „Mehr“). Alle Werte kommen live über den evcc-WebSocket. Es zeigt zwei Arten von Karten:

- **Ladepunkte mit Steckdosen-Charger** (in evcc Feature „switchdevice“, z. B. Tapo-, Shelly-, Tasmota- oder FritzDECT-Steckdosen) mit Leistung, „Geladen (Session)“ und Status (an/aus).
- **Verbraucher-Meter** von evcc (`consumer` und `aux`, wie im Abschnitt „Verbraucher“ der evcc-Konfiguration) mit Leistung sowie „Verbraucht“ bzw. „Geladen (Session)“, je nachdem, was das Gerät liefert.
  - Leistung und „Verbraucht“ kommen live aus dem WebSocket.
  - „Geladen (Session)“ und Lesefehler der Geräte liefert evcc nur angemeldeten Admins. Das Addon fragt sie dann wie die evcc-Konfigurationsseite im evcc-Intervall ab (mindestens alle 5 s, nur solange die Seite sichtbar ist). Ohne Anmeldung erscheint stattdessen ein Hinweis.
  - Ist ein Messgerät nicht erreichbar, steht statt der Leistung ein graues Badge „offline“ mit der Gerätemeldung als Tooltip. Weil evcc den Gerätestatus nur Admins liefert, erscheint das Badge nur mit Admin-Login. Andere Lesefehler erscheinen rot, ebenfalls mit Tooltip.

Leistung und „Geladen (Session)“ unter 0,5 W bzw. 0,5 Wh erscheinen als „–“ in Grau. „Verbraucht“ zeigt immer den Zählerstand.

Gegliedert wird nach Schaltbarkeit:

- **Schaltbar:** Karten, für die ein Steckdosen-Addon Buttons liefert, Ladepunkte und Meter gemischt. Heute ist das „Tapo-Steckdosen“: ⏻ ☀ an Ladepunkten, an die eine Tapo-Steckdose des Addons gebunden ist.
- **Nur Messung:** alle übrigen Karten, ohne Buttons.

Leere Abschnitte entfallen. Installiert, entfernt oder bindet man eine Steckdose, wechselt die Karte ohne Neuladen den Abschnitt. Ohne Steckdosen-Addon steht alles unter „Nur Messung“. consumers selbst enthält keinen Code zum Schalten; die Buttons kommen über den Erweiterungspunkt `consumers.cardActions` (Vertrag siehe unten). Ladepunkte mit anderen Steckdosen (z. B. Shelly) bleiben ohne Buttons, bis es ein eigenes Addon dafür gibt.

Einstellungen (Seite „Addons“ → Einstellungs-Button auf der Karte „Verbraucher“, ändern nur Admins, gelten für alle Geräte):

- **Verbraucht anzeigen** (Standard: an): blendet die Energiewerte „Verbraucht“ und „Geladen (Session)“ auf beiden Kartentypen ein oder aus. Die Leistung bleibt immer sichtbar.
- **Sortierung** (Standard: Name A–Z): Name A–Z, Name Z–A, Leistung absteigend oder Leistung aufsteigend. Sie gilt je Abschnitt („Schaltbar“, „Nur Messung“), Ladepunkte und Meter gemischt. Bei Leistung wird live umsortiert, Karten ohne Leistungswert stehen am Ende, bei gleicher Leistung entscheidet der Name.

Die Karten zeigen die Geräte-Icons, die in evcc für den Verbraucher bzw. den Charger eingestellt sind (ohne Einstellung wie evcc: Stecker bzw. „Smart Consumer“). Die Icons stammen aus evcc (MIT-Lizenz) und lassen sich mit im Addon-Verzeichnis mit `node scripts/import-evcc-icons.mjs <pfad-zum-evcc-repo>` aktualisieren.

Die Buttons ⏻ ☀ von „Tapo-Steckdosen“ setzen die Modi des Ladepunkts in evcc: ⏻ aktiv = `now` (Schnell), ☀ aktiv = `smart` (PV-Überschuss bzw. Tarif), keiner aktiv = `off`. Ein Klick auf den aktiven Button schaltet aus. Die veralteten Modi `pv` und `minpv` gelten als Smart. evcc legt die Steuer-Endpunkte für Ladepunkte nur beim Start an: Nach dem Anlegen eines neuen Ladepunkts **evcc neu starten**, sonst schlägt das Umschalten fehl.

## Installation

ZIP `consumers-<version>.zip` von der [Release-Seite](https://github.com/m75r/evcc-addon-consumers/releases) herunterladen und auf der Seite „Addons“ über „+ Neu“ hochladen, oder auf dem Pi:

```sh
sudo -u evcc-addons node /opt/evcc-addons/server.mjs install --config /etc/evcc-addons/config.json consumers-<version>.zip
```

## Erweiterungspunkt `consumers.cardActions`

Steckdosen-Addons liefern Buttons für einzelne Karten. Der Vertrag steht in [src/extension-contract.ts](src/extension-contract.ts); Anbieter kopieren die Typen mit Verweis auf diese Datei.

- `claims(card)`: nur Karten der eigenen Geräte beanspruchen. Beanspruchte Karten stehen unter „Schaltbar“.
- `subscribe(onChange)`: geänderte Beanspruchungen melden, die Karte wechselt dann ohne Neuladen den Abschnitt.
- `mount(slots, ctx)`: mit eigener Preact-Instanz in `slots.actions` (Kartenkopf) und `slots.message` (unter den Zeilen) rendern; Rückgabe `{ update(ctx), destroy() }`.
- `card`: `{ kind: "loadpoint", index, title }` oder `{ kind: "meter", usage, name, title }`, `title` wie angezeigt (`title || #<n>` bzw. `title || name`). `ctx.mode` ist bei Meter-Karten `null`.
- Fehler eines Anbieters erscheinen auf der Karte als „Erweiterung von <id> fehlgeschlagen: …“, andere Karten laufen weiter.

## Entwicklung

Im Monorepo von evcc-addons: `npm test`, `npm run lint`, `npm run e2e` (Spec `e2e/tests/consumers.spec.ts`). Gebaut wird mit `evcc-addon build` aus dem SDK.
