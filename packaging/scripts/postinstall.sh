#!/bin/sh
# Datenverzeichnis anlegen und den Dienst (neu) starten, sofern systemd läuft
set -e

install -d -o evcc-addons -g evcc-addons -m 0750 /var/lib/evcc-addons

if [ -d /run/systemd/system ]; then
  systemctl daemon-reload
  systemctl enable evcc-addons.service
  if ! systemctl restart evcc-addons.service; then
    echo "evcc-addons konnte nicht gestartet werden, siehe: journalctl -u evcc-addons" >&2
  fi
fi
