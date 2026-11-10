#!/bin/sh
# Beim Entfernen (nicht beim Update) den Dienst und die Path-Unit des Updaters stoppen und deaktivieren
set -e

if [ "$1" = "remove" ] && [ -d /run/systemd/system ]; then
  systemctl disable --now evcc-addons.service || true
  systemctl disable --now evcc-addons-update.path || true
fi
