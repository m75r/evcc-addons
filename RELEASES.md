# Versionshinweise

Was sich in den einzelnen Versionen von evcc-addons für dich ändert. Installation und Update stehen in der [README](README.md#installation-auf-dem-raspberry-pi).

## 2.2.2 (2026-11-10)

- Der Button „+ Neu“ auf der Seite „Addons“ heißt jetzt „Marketplace“ und öffnet wie bisher „Addon hinzufügen“.
- Die Version eines installierten Addons steht jetzt direkt neben seinem Namen.
- Die Versionsnummer neben dem Titel „Addons“ wird beim Darüberfahren nicht mehr unterstrichen.

## 2.2.1 (2026-11-10)

- Escape schließt Fenster auf der Seite „Addons“ jetzt zuverlässig, auch direkt nach dem Öffnen. Bisher blieb ein Fenster manchmal offen, wenn man Escape sofort drückte.

## 2.2.0 (2026-11-10)

**evcc-addons aktualisiert sich selbst.** Neben der Versionsnummer auf der Seite „Addons“ siehst du als Admin, wenn es eine neue Version gibt.

- Das Badge „Update verfügbar“ oder ein Klick auf die Versionsnummer öffnet das Popup „evcc-addons aktualisieren“. Dort stehen installierte und neue Version, das Datum und ein Link zu diesen Versionshinweisen. „Jetzt prüfen“ fragt sofort bei GitHub nach.
- „Aktualisieren“ installiert die neue Version direkt aus dem Browser. Das Popup zeigt den Fortschritt, der Dienst startet neu, und die Seite lädt danach von selbst. Installierte Addons, ihre Einstellungen und deine Konfiguration bleiben erhalten.
- Vor der Installation wird das Paket geprüft: Version, Prüfsumme und Inhalt müssen zum Release auf GitHub passen. Würde das Update andere Pakete ändern (z. B. eine neuere Node-Version), bricht es ab, und die bisherige Version läuft weiter.
- Ohne Anmeldung fragt evcc-addons nie bei GitHub nach.

**Wichtig:** Das Update auf 2.2.0 selbst ist noch einmal von Hand nötig (`sudo apt install ./evcc-addons_2.2.0_all.deb`), denn erst dieses Paket bringt die Aktualisierung aus dem Browser mit. Ab dann geht es per Klick.

## 2.1.0 (2026-11-10)

**Addons aus dem Katalog installieren.** „+ Neu“ auf der Seite „Addons“ öffnet „Addon hinzufügen“ mit allen verfügbaren Addons.

- „Installieren“ und „Aktualisieren“ laden das Addon direkt von GitHub und prüfen es vor der Installation. Eine ZIP musst du nicht mehr selbst herunterladen.
- Jeder Eintrag zeigt, ob das Addon schon installiert ist, ob es eine neuere Version gibt oder ob es eine neuere Version von evcc-addons braucht.
- Eine ZIP-Datei lässt sich weiterhin hochladen, über das Upload-Symbol oben rechts im Fenster.

## 2.0.0 (2026-11-09)

**Addons sind jetzt eigenständig.** Jedes Addon hat ein eigenes Repository und eigene Versionen. Das Paket von evcc-addons enthält keine Addons mehr.

- Addons können einen Server-Teil mitbringen, eigene Dialoge auf ihrer Karte öffnen und einander ergänzen.
- Das Gateway für Tapo-Steckdosen ist jetzt das Addon „Tapo-Steckdosen“. „Verbraucher“ zeigt Schalt-Buttons, sobald ein Steckdosen-Addon sie liefert.
- Startfehler eines Addons erscheinen nur auf dessen Karte, alle anderen Addons laufen weiter.

**Beim Update von 1.x:** Deine Tapo-Steckdosen werden übernommen. Installiere danach das Addon „Tapo-Steckdosen“ und kopiere die evcc-Konfiguration der Steckdosen neu, denn ihre Adresse hat sich geändert.

## 1.2.1 (2026-11-09)

- Tapo-Steckdosen mit aktueller Firmware (z. B. P110) verbinden sich wieder.
- „Kopieren“ der evcc-Konfiguration funktioniert auch, wenn evcc über `http://` aufgerufen wird.
- Im Formular „Steckdose“ steht der Ladepunkt oben und übernimmt Name und, falls bekannt, die Adresse der Steckdose.

## 1.2.0 (2026-11-08)

**Tapo-Steckdosen am Gerät schalten.** Schaltest du eine Tapo-Steckdose direkt am Gerät, schaltet evcc nicht mehr zurück, sondern übernimmt den Modus (aus → „Aus“, ein → „Schnell“).

- Neuer Abschnitt „Steckdosen“ auf der Seite „Addons“ zum Anlegen und Bearbeiten, mit fertiger Konfiguration für evcc zum Kopieren.

## 1.1.1 (2026-11-07)

- Erstes Release auf GitHub. Paket und Addons enthalten jetzt die Lizenzhinweise, sonst unverändert.

## 1.1.0 (2026-11-07)

- Addons können Einstellungen haben. Du änderst sie als Admin auf der Seite „Addons“ über das Schieberegler-Symbol auf der Karte.
- „Verbraucher“: neue Einstellungen „Verbraucht anzeigen“ und „Sortierung“, Badge „offline“ für nicht erreichbare Messgeräte und Modus-Buttons ⏻ und ☀ im Kartenkopf.
- Neben dem Titel der Seite „Addons“ steht die Version von evcc-addons.

## 1.0.0 (2026-11-06)

- Erste Version: evcc-addons sitzt vor evcc und erweitert die Oberfläche um installierbare Addons, ohne evcc zu verändern.
- Eintrag „Addons“ im Menü „Mehr“ zum Installieren, Aktivieren und Deinstallieren, nur mit dem Admin-Login von evcc.
- Addon „Verbraucher“ mit schaltbaren Steckdosen und Messgeräten.
