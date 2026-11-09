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
                       ├─ /addons-api/ext/<id>/*    Server-Teile der Addons (z. B. Tapo-Gateway)
                       ├─ /addons-api/*             Verwaltung
                       └─ alles andere              → evcc :7070 (unverändert)
Browser ──HTTP :7070─► evcc direkt (ohne Addons)

evcc ──HTTP──► /addons-api/ext/switches-tapo/<id>/<token>/… ──► Addon switches-tapo ──KLAP──► Tapo-Steckdose
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

- Programm: `/opt/evcc-addons/` (Server und Loader; Addons gehören nicht zum Paket)
- Konfiguration: `/etc/evcc-addons/config.json`
- Daten (installierte Addons, Zustand, Daten der Addons unter `addon-data/<id>/`): `/var/lib/evcc-addons/`
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

### Addons installieren

Das Paket enthält keine Addons. Jedes Addon hat ein eigenes Repository mit Releases, dort liegt die ZIP `<id>-<version>.zip` (siehe [Addons](#addons)).

Variante A, im Browser: ZIP herunterladen und unter „Mehr“ → „Addons“ → „+ Neu“ hochladen.

Variante B, direkt auf dem Pi:

```sh
sudo -u evcc-addons node /opt/evcc-addons/server.mjs install --config /etc/evcc-addons/config.json consumers-2.0.0.zip
```

Wichtig: Immer als User `evcc-addons` ausführen, nie mit `sudo` als root. Sonst entstehen Dateien, die der Dienst nicht mehr ändern oder löschen kann. Der Befehl verweigert die Ausführung, wenn der aufrufende User nicht Eigentümer von `/var/lib/evcc-addons` ist. Addons mit Server-Teil (z. B. „Tapo-Steckdosen“) startet der laufende Dienst beim nächsten Aufruf seiner Routen oder der Seite „Addons“; sicher ist `sudo systemctl restart evcc-addons`.

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
- Addons mit Server-Teil (z. B. „Tapo-Steckdosen“) laufen zusätzlich im Proxy mit den Rechten des Dienst-Users `evcc-addons`.
- Installieren, Umschalten, Einstellungen ändern und Deinstallieren erfordern den evcc-Admin-Login. Geprüft wird serverseitig über `api/auth/status` von evcc.
- Ist die Authentifizierung in evcc deaktiviert, ist auch die Addon-Verwaltung offen.

## Addons verwalten

Die Seite „Addons“ (Menü „Mehr“ → „Addons“, `#/addons`) listet alle installierten Addons mit Version, Beschreibung, Aktiv-Zustand und eventuellen Startfehlern. Neben dem Titel steht in Grau die laufende Version von evcc-addons (z. B. „Addons v1.0.0“). Lesen ist ohne Anmeldung möglich, Ändern nur mit dem Admin-Login von evcc.

- **Anmelden:** Ohne Login zeigt die Seite das Feld „Zum Verwalten anmelden“. Das Passwort ist das evcc-Admin-Passwort. Die Anmeldung gilt danach auch in evcc selbst (Menü „Mehr“ zeigt „Abmelden“), und „Abmelden“ in evcc beendet auch die Verwaltung. Der Proxy speichert kein Passwort, er fragt für jede Änderung `api/auth/status` bei evcc ab.
- **Installieren:** „+ Neu“ rechts neben dem Titel blendet statt des Einleitungstexts das Formular „Addon installieren“ ein (erneuter Klick blendet es wieder aus). ZIP-Datei auswählen und „Installieren“ drücken. Neu installierte Addons sind sofort aktiv, die Seite lädt dazu neu.
- **Aktualisieren:** Eine neuere ZIP desselben Addons hochladen. Die Seite meldet „Aktualisiert von <alt> auf <neu>“, der Aktiv-Zustand bleibt erhalten. Dieselbe Version erneut hochzuladen ist erlaubt („Neu installiert“).
- **Deaktivieren/Aktivieren:** Schalter auf der Karte. Nach dem Neuladen ist das Addon (nicht) mehr geladen.
- **Einstellungen:** Addons mit Einstellungen haben auf der Karte einen Button mit Schieberegler-Icon. Er öffnet das Modal „Einstellungen <Name>“. „Speichern“ übernimmt die Werte ohne Neuladen. Die Werte gelten für alle Geräte, ändern dürfen sie nur Admins. Ohne Login zeigt das Modal die Werte schreibgeschützt.
- **Dialoge:** Manche Addons bringen auf ihrer Karte einen eigenen Icon-Button links neben den Einstellungen mit, z. B. „Tapo-Steckdosen“. Er öffnet einen Dialog des Addons.
- **Deinstallieren:** Button „Deinstallieren“ auf der Karte, mit Rückfrage. Hat das Addon Daten gespeichert (`addon-data/<id>/`), weist die Rückfrage darauf hin; sie werden mit gelöscht.

Ungültige Pakete werden mit einer Meldung abgelehnt: unzulässige Pfade (Zip-Slip), mehr als 10 MB oder 500 Dateien, fehlendes oder ungültiges `addon.json`, fehlende Einstiegsdatei oder eine nicht unterstützte `apiVersion`.

Hinweise:

- Ist in evcc noch kein Admin-Passwort gesetzt, erscheint „Bitte in evcc ein Admin-Passwort setzen.“
- Ist die Authentifizierung in evcc deaktiviert, meldet evcc jeden Aufruf als angemeldet. Dann ist auch die Addon-Verwaltung ohne Passwort offen.
- Wie Addons gebaut werden, steht in [ADDON-DEVELOPMENT.md](ADDON-DEVELOPMENT.md).

## Addons

Die Addons haben eigene Repositories, Versionen und Releases. Bis zur Ausgliederung liegen sie unter [addons/](addons/), jeweils mit eigener README.

- **Verbraucher** (`consumers`, [README](addons/consumers/README.md), [Releases](https://github.com/m75r/evcc-addon-consumers/releases)): Tab „Verbraucher“ mit Ladepunkten mit Steckdose und Verbraucher-Metern aus evcc, live, gegliedert nach „Schaltbar“ und „Nur Messung“. Buttons liefern Steckdosen-Addons über den Erweiterungspunkt `consumers.cardActions`.
- **Tapo-Steckdosen** (`switches-tapo`, [README](addons/switches-tapo/README.md), [Releases](https://github.com/m75r/evcc-addon-switches-tapo/releases)): Gateway für TP-Link-Tapo-Steckdosen (KLAP) als Server-Teil. Erkennt Schaltungen am Gerät und stellt den Modus des Ladepunkts um, misst Verbraucher, liefert ⏻ ☀ bzw. ⏻ für „Verbraucher“. Verwaltung im Dialog „Tapo-Steckdosen“.
- **Hallo Welt** (`hello`, [README](addons/hello/README.md), [Releases](https://github.com/m75r/evcc-addon-hello/releases)): Beispiel-Addon mit Menüeintrag und einer Seite mit der PV-Leistung.

## Upgrade auf 2.0.0

Mit 2.0.0 ist das Tapo-Gateway aus dem Kern in das Addon „Tapo-Steckdosen“ (`switches-tapo`) gezogen.

1. Paket 2.0.0 installieren. Beim ersten Start verschiebt der Dienst `/var/lib/evcc-addons/switches.json` nach `/var/lib/evcc-addons/addon-data/switches-tapo/switches.json` (Log: `legacy switches migrated`). IDs, Tokens und Zugangsdaten bleiben.
2. Das Addon `switches-tapo` von seiner [Release-Seite](https://github.com/m75r/evcc-addon-switches-tapo/releases) installieren, im Browser über „+ Neu“ oder auf dem Pi:
   ```sh
   sudo -u evcc-addons node /opt/evcc-addons/server.mjs install --config /etc/evcc-addons/config.json switches-tapo-<version>.zip
   sudo systemctl restart evcc-addons
   ```
   Der laufende Dienst bemerkt eine Installation per CLI beim nächsten Aufruf des Gateways oder der Seite „Addons“; sicher ist der Neustart.
3. Die YAML jeder Steckdose im Dialog „Tapo-Steckdosen“ neu kopieren und in evcc einfügen. Geändert hat sich nur der Pfad: `/addons-api/switches/` → `/addons-api/ext/switches-tapo/`. Bis dahin erreicht evcc die Steckdosen nicht. Der Dialog weist darauf hin.
4. Das Addon `consumers` auf 2.0.0 aktualisieren. Version 1.1.0 läuft weiter, schaltet aber noch selbst; ab 2.0.0 kommen die Buttons von „Tapo-Steckdosen“. Ladepunkte mit anderen Steckdosen (z. B. Shelly) haben dann keine Buttons mehr, bis es ein eigenes Addon dafür gibt.

Ein ungültiges `switches.json` verhindert nicht mehr den Start des Proxys. Es erscheint als Startfehler auf der Karte „Tapo-Steckdosen“, das Gateway antwortet bis zur Korrektur mit 404.

## Entwicklung

Voraussetzungen: Node.js ≥ 22, für E2E-Tests Docker.

```sh
npm install
npm run build
npm test          # Unit- und Integrationstests
npm run lint      # ESLint, Prettier, tsc
npm run e2e       # Playwright gegen evcc/evcc:latest in Docker (EVCC_IMAGE überschreibt das Image)
npm run package   # dist/evcc-addons_<version>_all.deb (nfpm per Docker) und dist/evcc-addons-sdk-<version>.tgz
npm run test:package  # Paket bauen und in Debian-Containern prüfen (Inhalt, Server-Addon, Purge, Shellcheck, SDK)
```

### Dev-Server

`npm run dev` baut alles, installiert das Test-Addon `menu-addon` und startet den Proxy mit [dev/config.json](dev/config.json) auf `http://localhost:7080`. Erwartet wird evcc unter `http://127.0.0.1:17070`, z. B. per

```sh
EVCC_CONFIG=$PWD/e2e/fixtures/evcc.yaml docker compose -f packages/sdk/testing/compose.yml up
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

### SDK für Addon-Repos

`packages/sdk` wird beim Release als `evcc-addons-sdk-<version>.tgz` an das GitHub-Release gehängt. Es enthält die Typen, das CLI `evcc-addon build`, Test-Helfer (Vitest, Playwright, Fake-evcc, Docker-Compose für evcc) und unter `runtime/` den Proxy und den Loader dieser Version. Wie ein Addon-Repo es nutzt, steht in [ADDON-DEVELOPMENT.md](ADDON-DEVELOPMENT.md#eigenes-addon-repo-aufsetzen).

## Lizenz

evcc-addons steht unter der [MIT-Lizenz](LICENSE), Copyright (c) 2026 Matthias Gasser.

Die ausgelieferten Dateien enthalten Fremdkomponenten unter eigenen Lizenzen: [Preact](https://github.com/preactjs/preact) und [fflate](https://github.com/101arrowz/fflate) (MIT) sowie Icons aus [@h2d2/shopicons](https://github.com/H2D2-Design/h2d2-shopicons) (Apache-2.0). Die Lizenztexte stehen in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Das Debian-Paket installiert beide Dateien nach `/usr/share/doc/evcc-addons/`, das SDK-Tarball enthält sie ebenfalls. Jedes Addon bringt eigene Hinweise für seine Bundles mit.
