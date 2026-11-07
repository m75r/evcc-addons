# evcc-addons

Ein eigenständiger Dienst, der vor [evcc](https://evcc.io) sitzt und die evcc-Oberfläche um installierbare Addons erweitert, ohne evcc zu verändern.

- Alle Anfragen inkl. WebSocket (`/ws`) gehen unverändert an evcc.
- In die evcc-Startseite wird ein Loader eingeschleust.
- Im Menü „Mehr“ erscheint der Eintrag „Addons“ (`#/addons`).

## Architektur

```
Browser ──HTTP :80──► evcc-addons (Node ≥ 22)
                       ├─ GET /                     → evcc, Loader-Tag vor </head>
                       ├─ /ws (Upgrade)             → evcc (Socket-Piping)
                       ├─ /addons-static/_core/*    Loader-Bundle
                       ├─ /addons-static/<id>/*     Dateien installierter Addons
                       ├─ /addons-api/*             Verwaltung
                       └─ alles andere              → evcc :7070 (unverändert)
Browser ──HTTP :7070─► evcc direkt (ohne Addons)
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
- Daten (installierte Addons, Zustand): `/var/lib/evcc-addons/`
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

## Sicherheit

- Addons laufen mit vollen Rechten im evcc-Fenster und können alles, was die evcc-Oberfläche kann. Nur vertrauenswürdige Addons installieren.
- Installieren, Umschalten, Einstellungen ändern und Deinstallieren erfordern den evcc-Admin-Login. Geprüft wird serverseitig über `api/auth/status` von evcc.
- Ist die Authentifizierung in evcc deaktiviert, ist auch die Addon-Verwaltung offen.

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
- Wie Addons gebaut werden, steht in [docs/addon-development.md](docs/addon-development.md).

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
