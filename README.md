# evcc-addons

Ein eigenständiger Dienst, der vor [evcc](https://evcc.io) sitzt und die evcc-Oberfläche um installierbare Addons erweitert, ohne evcc zu verändern.

- Alle Anfragen inkl. WebSocket (`/ws`) gehen unverändert an evcc.
- In die evcc-Startseite wird ein Loader eingeschleust.
- Im Menü „Mehr“ erscheint der Eintrag „Addons“ (`#/addons`).

> **Inoffizielles Projekt:** evcc-addons ist ein privates Projekt und steht in keiner Verbindung zu evcc.io oder den evcc-Entwicklern. „evcc“ bezeichnet hier nur die Software, die erweitert wird.

## Architektur

```
Browser ──HTTP :80──► evcc-addons (Node ≥ 22)
                       ├─ GET /                     → evcc, Loader-Tag vor </head>
                       ├─ /ws (Upgrade)             → evcc (Socket-Piping)
                       ├─ /addons-static/_core/*    Loader-Bundle
                       ├─ /addons-static/<id>/*     Dateien installierter Addons
                       ├─ /addons-api/switches/*    Steckdosen (Verwaltung und Gateway für evcc)
                       ├─ /addons-api/*             Verwaltung
                       └─ alles andere              → evcc :7070 (unverändert)
Browser ──HTTP :7070─► evcc direkt (ohne Addons)

evcc ──HTTP──► /addons-api/switches/<id>/<token>/… ──► evcc-addons ──KLAP──► Tapo-Steckdose
```

## Installation auf dem Raspberry Pi

### Voraussetzungen

evcc läuft bereits (apt-Paket, Port 7070). evcc-addons braucht **Node.js ≥ 22**. Das `nodejs`-Paket von Debian (Bookworm: 18, Trixie: 20) ist zu alt, `apt` lehnt das Paket dann mit einer Abhängigkeitsmeldung ab. Node 22 über NodeSource installieren:

```sh
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install nodejs
node --version   # v22.x oder neuer
```

### Paket installieren

Das Paket wird mit `npm run package` gebaut (`dist/evcc-addons_<version>_all.deb`, siehe [Entwicklung](#entwicklung)) und auf den Pi kopiert:

```sh
sudo apt install ./evcc-addons_<version>_all.deb
```

Danach läuft der Dienst `evcc-addons` und evcc ist mit Addons unter `http://<pi>/` erreichbar.

- Programm: `/opt/evcc-addons/` (Server, Loader, mitgelieferte Addon-ZIPs unter `addons/`)
- Konfiguration: `/etc/evcc-addons/config.json`
- Daten (installierte Addons, Zustand, Steckdosen in `switches.json`): `/var/lib/evcc-addons/`
- Dienst: `evcc-addons.service`, User `evcc-addons`

### Konfiguration

`/etc/evcc-addons/config.json`:

```json
{
  "listen": { "host": "0.0.0.0", "port": 80 },
  "evccUrl": "http://127.0.0.1:7070",
  "dataDir": "/var/lib/evcc-addons",
  "publicDir": "/opt/evcc-addons/public",
  "logLevel": "info"
}
```

Optional: `maxUploadBytes` (Standard 10485760) und `logLevel: "debug"` (loggt jede Anfrage). Relative Pfade gelten relativ zur Konfigurationsdatei. Die Datei ist ein Conffile, Updates überschreiben eigene Änderungen nicht.

**Port 80 belegt?** `listen.port` z. B. auf `7080` setzen und den Dienst neu starten:

```sh
sudo systemctl restart evcc-addons
```

### Verbraucher-Addon installieren

Das Paket bringt die Addon-ZIPs mit, installiert sie aber nicht automatisch.

Variante A, direkt auf dem Pi:

```sh
sudo -u evcc-addons node /opt/evcc-addons/server.mjs install --config /etc/evcc-addons/config.json /opt/evcc-addons/addons/consumers-*.zip
```

Wichtig: Immer als User `evcc-addons` ausführen, nie mit `sudo` als root. Sonst entstehen Dateien, die der Dienst nicht mehr ändern oder löschen kann. Der Befehl verweigert die Ausführung, wenn der aufrufende User nicht Eigentümer von `/var/lib/evcc-addons` ist.

Variante B, im Browser: ZIP vom Pi holen (`scp pi:/opt/evcc-addons/addons/consumers-1.1.0.zip .`) und unter „Mehr“ → „Addons“ → „+ Neu“ hochladen.

### Logs

```sh
journalctl -u evcc-addons -f
```

### Update

Neues Paket per `sudo apt install ./evcc-addons_<neu>_all.deb` installieren. Konfiguration und installierte Addons bleiben erhalten, der Dienst startet neu.

### Rückbau

```sh
sudo apt remove evcc-addons   # Dienst und Programm weg, Addons in /var/lib/evcc-addons bleiben
sudo apt purge evcc-addons    # zusätzlich Konfiguration und Addons löschen
```

evcc selbst ist davon nie betroffen und läuft unter `:7070` normal weiter.

## Grenzen

Addons erscheinen nur, wenn evcc über den Proxy aufgerufen wird:

- **evcc-Cloud-Fernzugriff:** Der Tunnel erreicht den internen evcc-Router direkt, am Proxy vorbei. Dort gibt es keine Addons.
- **evcc-App:** Die App findet evcc per mDNS unter `:7070`. In der App lässt sich die Adresse gegebenenfalls manuell auf `http://<pi>/` setzen.
- **Direktaufruf `http://<pi>:7070/`:** zeigt evcc ohne Addons. Das ist gewollt, denn so bleibt evcc auch ohne Proxy nutzbar.
- **Steckdosen über das Schalt-Gateway:** Läuft evcc-addons nicht, kann evcc diese Steckdosen weder lesen noch schalten. Wird währenddessen am Gerät geschaltet, gilt nach dem Neustart der erste gelesene Zustand als bekannt; das wird nicht als Tastendruck erkannt, evcc kann dann einmal zurückschalten.

## Sicherheit

- Addons laufen mit vollen Rechten im evcc-Fenster und können alles, was die evcc-Oberfläche kann. Nur vertrauenswürdige Addons installieren.
- Installieren, Umschalten, Einstellungen ändern und Deinstallieren erfordern den evcc-Admin-Login. Geprüft wird serverseitig über `api/auth/status` von evcc.
- Ist die Authentifizierung in evcc deaktiviert, ist auch die Addon-Verwaltung offen.
- Tapo-Passwörter liegen im Klartext in `/var/lib/evcc-addons/switches.json` (Dateirechte `0600`, User `evcc-addons`). Verschlüsseln brächte nichts, weil der Schlüssel auf demselben Rechner läge. Die API und das Log geben das Passwort nie aus.
- Die Gateway-URLs für evcc enthalten pro Steckdose einen zufälligen Token (256 Bit). Wer die URL kennt, kann die Steckdose schalten. Ein falscher Token ergibt 404, im Log steht statt des Tokens `***`. Über „Token erneuern“ wird er ausgetauscht.

## Addons verwalten

Die Seite „Addons“ (Menü „Mehr“ → „Addons“, `#/addons`) listet alle installierten Addons mit Version, Beschreibung, Aktiv-Zustand und eventuellen Startfehlern. Neben dem Titel steht in Grau die laufende Version von evcc-addons (z. B. „Addons v1.0.0“). Lesen ist ohne Anmeldung möglich, Ändern nur mit dem Admin-Login von evcc.

- **Anmelden:** Ohne Login zeigt die Seite das Feld „Zum Verwalten anmelden“. Das Passwort ist das evcc-Admin-Passwort. Die Anmeldung gilt danach auch in evcc selbst (Menü „Mehr“ zeigt „Abmelden“), und „Abmelden“ in evcc beendet auch die Verwaltung. Der Proxy speichert kein Passwort, er fragt für jede Änderung `api/auth/status` bei evcc ab.
- **Installieren:** „+ Neu“ rechts neben dem Titel blendet statt des Einleitungstexts das Formular „Addon installieren“ ein (erneuter Klick blendet es wieder aus). ZIP-Datei auswählen und „Installieren“ drücken. Neu installierte Addons sind sofort aktiv, die Seite lädt dazu neu.
- **Aktualisieren:** Eine neuere ZIP desselben Addons hochladen. Die Seite meldet „Aktualisiert von <alt> auf <neu>“, der Aktiv-Zustand bleibt erhalten. Dieselbe Version erneut hochzuladen ist erlaubt („Neu installiert“).
- **Deaktivieren/Aktivieren:** Schalter auf der Karte. Nach dem Neuladen ist das Addon (nicht) mehr geladen.
- **Einstellungen:** Addons mit Einstellungen haben auf der Karte einen Button mit Schieberegler-Icon. Er öffnet das Modal „Einstellungen <Name>“. „Speichern“ übernimmt die Werte ohne Neuladen. Die Werte gelten für alle Geräte, ändern dürfen sie nur Admins. Ohne Login zeigt das Modal die Werte schreibgeschützt.
- **Deinstallieren:** Button „Deinstallieren“ auf der Karte, mit Rückfrage.

Ungültige Pakete werden mit einer Meldung abgelehnt: unzulässige Pfade (Zip-Slip), mehr als 10 MB oder 500 Dateien, fehlendes oder ungültiges `addon.json`, fehlende Einstiegsdatei oder eine nicht unterstützte `apiVersion`.

Hinweise:

- Ist in evcc noch kein Admin-Passwort gesetzt, erscheint „Bitte in evcc ein Admin-Passwort setzen.“
- Ist die Authentifizierung in evcc deaktiviert, meldet evcc jeden Aufruf als angemeldet. Dann ist auch die Addon-Verwaltung ohne Passwort offen.
- Wie Addons gebaut werden, steht in [ADDON-DEVELOPMENT.md](ADDON-DEVELOPMENT.md).

## Verbraucher-Addon

Das mitgelieferte Addon `consumers` fügt den Tab „Verbraucher“ hinzu (`#/addons/consumers`, unter 576 px im Menü „Mehr“). Alle Werte kommen live über den evcc-WebSocket.

- **Schaltbar:** Ladepunkte mit Steckdosen-Charger (in evcc Feature „switchdevice“, z. B. Shelly-, Tasmota- oder FritzDECT-Steckdosen). Angezeigt werden Leistung, „Geladen (Session)“ und Status (an/aus). Rechts im Kartenkopf stehen zwei Icon-Buttons, mit denen sich der Modus direkt umschalten lässt: ⏻ schaltet zwischen Schnell und Aus, ☀ zwischen Smart und Aus. Höchstens einer ist aktiv (invertiert dargestellt).
- **Nur Messung:** die Verbraucher-Meter von evcc (`consumer` und `aux`, wie im Abschnitt „Verbraucher“ der evcc-Konfiguration) mit Leistung sowie „Verbraucht“ bzw. „Geladen (Session)“, je nachdem, was das Gerät liefert.
  - Leistung und „Verbraucht“ kommen live aus dem WebSocket.
  - „Geladen (Session)“ und Lesefehler der Geräte liefert evcc nur angemeldeten Admins. Das Addon fragt sie dann wie die evcc-Konfigurationsseite im evcc-Intervall ab (mindestens alle 5 s, nur solange die Seite sichtbar ist). Ohne Anmeldung erscheint stattdessen ein Hinweis.
  - Ist ein Messgerät nicht erreichbar, steht statt der Leistung ein graues Badge „offline“ mit der Gerätemeldung als Tooltip. Weil evcc den Gerätestatus nur Admins liefert, erscheint das Badge nur mit Admin-Login. Andere Lesefehler erscheinen rot, ebenfalls mit Tooltip.

Leistung und „Geladen (Session)“ unter 0,5 W bzw. 0,5 Wh erscheinen als „–“ in Grau. „Verbraucht“ zeigt immer den Zählerstand.

Einstellungen (Seite „Addons“ → Einstellungs-Button auf der Karte „Verbraucher“, ändern nur Admins, gelten für alle Geräte):

- **Verbraucht anzeigen** (Standard: an): blendet die Energiewerte „Verbraucht“ und „Geladen (Session)“ auf beiden Kartentypen ein oder aus. Die Leistung bleibt immer sichtbar.
- **Sortierung** (Standard: Name A–Z): Name A–Z, Name Z–A, Leistung absteigend oder Leistung aufsteigend. Sie gilt für „Schaltbar“ und „Nur Messung“ getrennt. Bei Leistung wird live umsortiert, Karten ohne Leistungswert stehen am Ende, bei gleicher Leistung entscheidet der Name.

Die Karten zeigen die Geräte-Icons, die in evcc für den Verbraucher bzw. den Charger eingestellt sind (ohne Einstellung wie evcc: Stecker bzw. „Smart Consumer“). Die Icons stammen aus evcc (MIT-Lizenz) und lassen sich mit `node scripts/import-evcc-icons.mjs <pfad-zum-evcc-repo>` aktualisieren.

Warum nur Ladepunkte schaltbar sind: evcc schaltet `consumer`-Meter nie und bietet dafür keine HTTP-Schnittstelle. Ein Gerät, das gesteuert werden soll (z. B. Waschmaschine an einer Steckdose), wird in evcc daher als **Ladepunkt mit Steckdosen-Charger** angelegt. Danach erscheint es unter „Schaltbar“. evcc legt die Steuer-Endpunkte für Ladepunkte nur beim Start an: Nach dem Anlegen eines neuen Ladepunkts **evcc neu starten**, sonst schlägt das Umschalten fehl.

Die Buttons setzen die Modi von evcc: ⏻ aktiv = `now` (Schnell), ☀ aktiv = `smart` (PV-Überschuss bzw. Tarif), keiner aktiv = `off`. Ein Klick auf den aktiven Button schaltet aus. Die veralteten Modi `pv` und `minpv` gelten als Smart.

## Steckdosen (Schalt-Gateway)

Wozu: Eine Tapo-Steckdose, die evcc direkt als Ladepunkt anspricht, lässt sich nicht sinnvoll am Gerät schalten. evcc liest in jedem Zyklus den Zustand und schaltet sofort zurück, solange der Modus etwas anderes verlangt. Über das Gateway spricht evcc die Steckdose stattdessen über evcc-addons an. evcc-addons erkennt Schaltungen am Gerät, führt den Rückschaltbefehl von evcc nicht aus und stellt den Modus des Ladepunkts passend um.

Unterstützt werden TP-Link-Tapo-Steckdosen mit aktueller Firmware (KLAP-Protokoll, z. B. P110, P115, P100). Ältere Firmware mit dem passthrough-Protokoll wird nicht unterstützt; die Karte zeigt dann „Verbindung fehlgeschlagen (nur Tapo-Firmware mit KLAP-Protokoll wird unterstützt)“ mit der Ursache.

### Einrichten

1. **Steckdose anlegen:** Seite „Addons“ → Abschnitt „Steckdosen“ → „+ Steckdose“ (nur mit Admin-Login). Zuerst den evcc-Ladepunkt wählen: Sein Titel wird als Name übernommen und, wenn der Ladepunkt einen in der evcc-Oberfläche angelegten Tapo-Charger hat, auch dessen Adresse. Sonst die Adresse (IP oder Hostname, optional mit `:port`) von Hand eintragen. Dazu Tapo-E-Mail und Tapo-Passwort (die Zugangsdaten der Tapo-App). „Speichern“ prüft sofort die Verbindung; schlägt sie fehl, wird trotzdem gespeichert und die Karte zeigt den Fehler. Beim Bearbeiten bleibt ein leeres Passwortfeld unverändert.
2. **YAML kopieren:** Auf der Karte „evcc-Konfiguration“ aufklappen und „Kopieren“ drücken. Die Adresse in der YAML stammt aus der Browserzeile. Läuft evcc auf demselben Rechner wie evcc-addons, geht auch `http://127.0.0.1:<Port>`.
3. **evcc umstellen:** In der evcc-Konfiguration den Charger des Ladepunkts auf „Benutzerdefinierte schaltbare Steckdose“ umstellen und die YAML einfügen. `standbypower`, `features` und `icon` vom bisherigen Tapo-Charger übernehmen. Steckdosen ohne Messung (P100) bekommen statt `power` eine feste Leistung (`standbypower: -100`, Wert anpassen). evcc neu starten, wenn evcc darum bittet.
4. Optional: Den Ladepunkt auf der Startseite über evcc „Benutzeroberfläche → Ladepunkte“ ausblenden (gilt pro Browser). Schalten lässt er sich weiter über das Verbraucher-Addon.

Danach spricht nur noch evcc-addons mit der Steckdose. Ein und Aus aus der App, Smart/PV und Pläne laufen wie bisher, evcc-addons führt sie aus.

### Schaltungen am Gerät

evcc-addons liest jede Steckdose alle 5 s. Weicht der Zustand vom zuletzt bestätigten ab, ohne dass gerade ein Befehl läuft, wurde am Gerät geschaltet:

- **Am Gerät aus** → Modus des Ladepunkts „Aus“ (`off`).
- **Am Gerät ein** → Modus „Schnell“ (`now`).

Das gilt unabhängig vom bisherigen Modus, ein eingestelltes „Smart“ geht durch einen Tastendruck verloren. Die Steckdose schaltet dabei nie zurück, auch nicht kurz: Gegenläufige Befehle von evcc werden unterdrückt, bis evcc den passenden Befehl schickt oder 2 s nach dem gesetzten Modus vergangen sind. Die App zeigt die Änderung nach höchstens etwa 5 s.

Die Karte zeigt Zustand und Leistung („● an · 35 W“, „○ aus“, „nicht erreichbar: …“) und warnt bei Problemen:

- **Ladepunkt nicht gefunden:** Der gespeicherte Titel existiert in evcc nicht (mehr), z. B. nach einer Umbenennung. Über „Bearbeiten“ den Ladepunkt neu wählen.
- **Modus konnte nicht gesetzt werden:** evcc war nicht erreichbar, der Titel ist nicht eindeutig oder evcc hat abgelehnt. Das Zurückschalten bleibt unterdrückt, evcc-addons versucht es bei jeder Abfrage erneut.

Zuordnung: Gespeichert wird der Titel des Ladepunkts, nicht seine Position, damit Löschen oder Umsortieren in evcc nichts verschiebt. Die Modus-Endpunkte von evcc brauchen keine Anmeldung.

## Entwicklung

Voraussetzungen: Node.js ≥ 22, für E2E-Tests Docker.

```sh
npm install
npm run build
npm test          # Unit- und Integrationstests
npm run lint      # ESLint, Prettier, tsc
npm run e2e       # Playwright gegen evcc/evcc:latest in Docker (EVCC_IMAGE überschreibt das Image)
npm run package   # dist/evcc-addons_<version>_all.deb (nfpm per Docker)
npm run test:package  # Paket bauen und in Debian-Containern prüfen (Inhalt, Installation, Purge, Shellcheck)
```

### Dev-Server

`npm run dev` baut alles und startet den Proxy mit [dev/config.json](dev/config.json) auf `http://localhost:7080`. Erwartet wird evcc unter `http://127.0.0.1:17070`, z. B. per

```sh
docker compose -f e2e/docker-compose.yml up
```

Um gegen das evcc auf dem Raspberry Pi zu entwickeln, eine eigene Konfiguration anlegen (z. B. `.dev/pi.json`, Pfade relativ zur Datei) und den Proxy damit starten:

```json
{
  "listen": { "host": "0.0.0.0", "port": 7080 },
  "evccUrl": "http://<pi>:7070",
  "dataDir": "data",
  "publicDir": "../packages/loader/dist",
  "logLevel": "debug"
}
```

```sh
npm run build && node packages/proxy/dist/server.mjs --config .dev/pi.json
```

## Lizenz

evcc-addons steht unter der [MIT-Lizenz](LICENSE), Copyright (c) 2026 Matthias Gasser.

Die ausgelieferten Dateien enthalten Fremdkomponenten unter eigenen Lizenzen: [Preact](https://github.com/preactjs/preact) und [fflate](https://github.com/101arrowz/fflate) (MIT), eine Portierung des KLAP-Protokolls aus [insomniacslk/tapo](https://github.com/insomniacslk/tapo) (MIT), Geräte-Icons aus [evcc](https://github.com/evcc-io/evcc) (MIT) und Icons aus [@h2d2/shopicons](https://github.com/H2D2-Design/h2d2-shopicons) (Apache-2.0). Die Lizenztexte stehen in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Beide Dateien liegen jeder Addon-ZIP bei, das Debian-Paket installiert sie nach `/usr/share/doc/evcc-addons/`.
