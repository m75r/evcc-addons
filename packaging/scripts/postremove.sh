#!/bin/sh
# Bei purge auch installierte Addons, Zustand und Status des Updaters löschen
set -e

if [ "$1" = "purge" ]; then
  rm -rf /var/lib/evcc-addons
  rm -rf /var/lib/evcc-addons-update
fi

if [ -d /run/systemd/system ]; then
  systemctl daemon-reload || true
fi
