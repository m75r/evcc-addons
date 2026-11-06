#!/bin/sh
# Beim Entfernen (nicht beim Update) den Dienst stoppen und deaktivieren
set -e

if [ "$1" = "remove" ] && [ -d /run/systemd/system ]; then
  systemctl disable --now evcc-addons.service || true
fi
