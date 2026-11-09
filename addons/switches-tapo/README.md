# Tapo-Steckdosen (`switches-tapo`)

Addon für [evcc-addons](https://github.com/m75r/evcc-addons) ab 2.0.0 (`apiVersion: 2`, mit Server-Teil).

Das Addon `switches-tapo` bringt ein Gateway für Tapo-Steckdosen mit. Es läuft als Server-Teil im Proxy, verwaltet wird es im Dialog „Tapo-Steckdosen“ auf seiner Karte der Seite „Addons“.

Wozu: Eine Tapo-Steckdose, die evcc direkt als Ladepunkt anspricht, lässt sich nicht sinnvoll am Gerät schalten. evcc liest in jedem Zyklus den Zustand und schaltet sofort zurück, solange der Modus etwas anderes verlangt. Über das Gateway spricht evcc die Steckdose stattdessen über evcc-addons an. Das Addon erkennt Schaltungen am Gerät, führt den Rückschaltbefehl von evcc nicht aus und stellt den Modus des Ladepunkts passend um.

Unterstützt werden TP-Link-Tapo-Steckdosen mit aktueller Firmware (KLAP-Protokoll, z. B. P110, P115, P100). Ältere Firmware mit dem passthrough-Protokoll wird nicht unterstützt; die Karte zeigt dann „Verbindung fehlgeschlagen (nur Tapo-Firmware mit KLAP-Protokoll wird unterstützt)“ mit der Ursache.

## Einrichten

1. **Steckdose anlegen:** Seite „Addons“ → Karte „Tapo-Steckdosen“ → Steckdosen-Button links neben den Einstellungen → Dialog „Tapo-Steckdosen“ → „+ Steckdose“ (nur mit Admin-Login). Das Formular erscheint im selben Dialog, „Zurück“ führt zur Liste. Zuerst unter „Gerät aus evcc“ den Ladepunkt wählen (Gruppe „Ladepunkte & Heizungen“): Sein Titel wird als Name übernommen und, wenn der Ladepunkt einen in der evcc-Oberfläche angelegten Tapo-Charger hat, auch dessen Adresse. Sonst die Adresse (IP oder Hostname, optional mit `:port`) von Hand eintragen. Dazu Tapo-E-Mail und Tapo-Passwort (die Zugangsdaten der Tapo-App). „Speichern“ prüft sofort die Verbindung; schlägt sie fehl, wird trotzdem gespeichert und das Formular zeigt den Fehler. Beim Bearbeiten bleibt ein leeres Passwortfeld unverändert.
2. **YAML kopieren:** Im Dialog auf der Karte der Steckdose „evcc-Konfiguration“ aufklappen und „Kopieren“ drücken. Die URLs beginnen mit `/addons-api/ext/switches-tapo/`. Die Adresse in der YAML stammt aus der Browserzeile. Läuft evcc auf demselben Rechner wie evcc-addons, geht auch `http://127.0.0.1:<Port>`.
3. **evcc umstellen:** In der evcc-Konfiguration den Charger des Ladepunkts auf „Benutzerdefinierte schaltbare Steckdose“ umstellen und die YAML einfügen. `standbypower`, `features` und `icon` vom bisherigen Tapo-Charger übernehmen. Steckdosen ohne Messung (P100) bekommen statt `power` eine feste Leistung (`standbypower: -100`, Wert anpassen). evcc neu starten, wenn evcc darum bittet.
4. Optional: Den Ladepunkt auf der Startseite über evcc „Benutzeroberfläche → Ladepunkte“ ausblenden (gilt pro Browser). Schalten lässt er sich weiter über das Verbraucher-Addon.

Danach spricht nur noch evcc-addons mit der Steckdose. Ein und Aus aus der App, Smart/PV und Pläne laufen wie bisher, evcc-addons führt sie aus.

Auf der Seite „Verbraucher“ erscheint der Ladepunkt unter „Schaltbar“ mit ⏻ ☀ (nur mit installiertem Addon „Verbraucher“). Das gilt nur für Ladepunkte, an die eine Steckdose dieses Addons gebunden ist. Ladepunkte mit Shelly- oder anderen Steckdosen bekommen keine Buttons.

Ohne Admin-Login zeigt der Dialog die Steckdosen schreibgeschützt (Name, Zustand, Ladepunkt, ohne Adresse, E-Mail und YAML).

Einstellung (Seite „Addons“ → Einstellungs-Button auf der Karte „Tapo-Steckdosen“):

- **Abfrageintervall** (3, 5, 10, 15, 20 oder 30 s, Standard 5 s): wie oft das Gateway jede Steckdose liest und wie oft der Dialog neu lädt. Gilt nach dem Speichern sofort, ohne Neustart.

## An einen Verbraucher binden

Statt an einen Ladepunkt lässt sich eine Steckdose an einen evcc-Verbraucher binden. Sinnvoll ist das für Geräte, die evcc nur messen, aber nie schalten soll (z. B. Kaffeemaschine, Kühlschrank), die man aber von Hand schalten möchte.

1. Im Formular unter „Gerät aus evcc“ in der Gruppe „Verbraucher“ den Verbraucher wählen. Alle Verbraucher aus evcc stehen dort, der Titel wird übernommen. Ist der Verbraucher in evcc als Tapo-Gerät angelegt, wird auch die Adresse übernommen.
2. Auf der Karte „evcc-Konfiguration“ aufklappen: Statt des Charger-YAML erscheint ein Zähler-YAML (`power` über `http`, `jq: .power // 0`).
3. In evcc „Verbraucher hinzufügen“ → „Benutzerdefiniertes Gerät“ wählen, denselben Titel vergeben und die YAML einfügen. Einen bisherigen Tapo-Verbraucher für dasselbe Gerät vorher löschen, damit nur das Gateway mit der Steckdose spricht.

Danach misst evcc über das Gateway. Ohne laufendes evcc-addons zeigt evcc für diesen Verbraucher einen Lesefehler. Geschaltet wird nur von Hand: Auf der Seite „Verbraucher“ steht die Karte unter „Schaltbar“ mit einem ⏻, der die Steckdose direkt schaltet, auch ohne Login. Einen Smart-Modus gibt es dafür nicht, und eine Schaltung am Gerät ändert keinen Modus. Gebunden wird über den Titel (bei Verbrauchern ohne Titel über den Namen), weil in der evcc-Oberfläche angelegte Geräte intern `db:<n>` heißen und beim Neuanlegen den Namen wechseln.

## Schaltungen am Gerät

Das Gateway liest jede Steckdose im eingestellten Abfrageintervall (Standard 5 s). Bei Ladepunkt-Bindung gilt: Weicht der Zustand vom zuletzt bestätigten ab, ohne dass gerade ein Befehl läuft, wurde am Gerät geschaltet:

- **Am Gerät aus** → Modus des Ladepunkts „Aus“ (`off`).
- **Am Gerät ein** → Modus „Schnell“ (`now`).

Das gilt unabhängig vom bisherigen Modus, ein eingestelltes „Smart“ geht durch einen Tastendruck verloren. Die Steckdose schaltet dabei nie zurück, auch nicht kurz: Gegenläufige Befehle von evcc werden unterdrückt, bis evcc den passenden Befehl schickt oder 2 s nach dem gesetzten Modus vergangen sind. Die App zeigt die Änderung nach höchstens etwa einem Abfrageintervall.

Die Karte im Dialog zeigt Zustand und Leistung („● an · 35 W“, „○ aus“, „nicht erreichbar: …“) und warnt bei Problemen:

- **Ladepunkt nicht gefunden:** Der gespeicherte Titel existiert in evcc nicht (mehr), z. B. nach einer Umbenennung. Über „Bearbeiten“ den Ladepunkt neu wählen.
- **Modus konnte nicht gesetzt werden:** evcc war nicht erreichbar, der Titel ist nicht eindeutig oder evcc hat abgelehnt. Das Zurückschalten bleibt unterdrückt, evcc-addons versucht es bei jeder Abfrage erneut.

Zuordnung: Gespeichert wird der Titel des Ladepunkts, nicht seine Position, damit Löschen oder Umsortieren in evcc nichts verschiebt. Die Modus-Endpunkte von evcc brauchen keine Anmeldung.

## Installation

ZIP `switches-tapo-<version>.zip` von der [Release-Seite](https://github.com/m75r/evcc-addon-switches-tapo/releases) herunterladen und auf der Seite „Addons“ über „+ Neu“ hochladen, oder auf dem Pi:

```sh
sudo -u evcc-addons node /opt/evcc-addons/server.mjs install --config /etc/evcc-addons/config.json switches-tapo-<version>.zip
sudo systemctl restart evcc-addons
```

## Umstieg von evcc-addons 1.x

Bis evcc-addons 1.2.x war das Gateway Teil des Proxys. Die Plattform 2.0.0 verschiebt `/var/lib/evcc-addons/switches.json` beim ersten Start nach `/var/lib/evcc-addons/addon-data/switches-tapo/switches.json`; IDs, Tokens und Zugangsdaten bleiben. Das Addon liest das alte Format (Bindung an einen Ladepunkt) und schreibt bei der nächsten Änderung das neue.

In der evcc-YAML ändert sich nur der Pfad: `/addons-api/switches/` → `/addons-api/ext/switches-tapo/`. Die YAML jeder Steckdose im Dialog neu kopieren und in evcc einfügen; bis dahin erreicht evcc die Steckdosen nicht. Der Dialog weist Admins darauf hin, bis man den Hinweis schließt.

## Grenzen

- Läuft evcc-addons nicht oder ist das Addon deaktiviert, kann evcc diese Steckdosen weder lesen noch schalten. Wird währenddessen am Gerät geschaltet, gilt nach dem Neustart der erste gelesene Zustand als bekannt; das wird nicht als Tastendruck erkannt, evcc kann dann einmal zurückschalten.
- Nur Tapo. Für andere Steckdosen (z. B. Shelly) ist ein eigenes Addon vorgesehen; deren Ladepunkte bleiben in „Verbraucher“ ohne Buttons.

## Sicherheit

- Tapo-Passwörter liegen im Klartext in `/var/lib/evcc-addons/addon-data/switches-tapo/switches.json` (Dateirechte `0600`, Ordner `0700`, User `evcc-addons`). Verschlüsseln brächte nichts, weil der Schlüssel auf demselben Rechner läge. Die API und das Log geben das Passwort nie aus.
- ⏻ an Verbrauchern (Addon „Tapo-Steckdosen“, Seite „Verbraucher“) funktioniert wie die Modus-Buttons von evcc ohne Login. Wer die evcc-Seite über den Proxy erreicht, kann diese Steckdosen schalten.
- Die Gateway-URLs für evcc enthalten pro Steckdose einen zufälligen Token (256 Bit). Wer die URL kennt, kann die Steckdose schalten. Ein falscher Token ergibt 404, im Log steht statt des Tokens `***`. Über „Token erneuern“ wird er ausgetauscht.
- Der Server-Teil läuft im Proxy mit den Rechten des Dienst-Users `evcc-addons`.

## Entwicklung

Im Monorepo von evcc-addons: `npm test` (Projekte `addons`, `addons-server`), `npm run lint`, `npm run e2e` (Specs `e2e/tests/switches-tapo.spec.ts`, `e2e/tests/consumers.spec.ts`). Fake-Tapo für Tests: `test/server/fake-tapo.ts`.
