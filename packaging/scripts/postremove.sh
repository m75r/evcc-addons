#!/bin/sh
# Bei purge auch installierte Addons und Zustand löschen
set -e

if [ "$1" = "purge" ]; then
  rm -rf /var/lib/evcc-addons
fi

if [ -d /run/systemd/system ]; then
  systemctl daemon-reload || true
fi
