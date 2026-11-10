#!/bin/sh
# Daten- und Anforderungsverzeichnis anlegen, den Dienst (neu) starten und die Path-Unit des Updaters
# aktivieren, sofern systemd läuft
set -e

install -d -o evcc-addons -g evcc-addons -m 0750 /var/lib/evcc-addons
install -d -o evcc-addons -g evcc-addons -m 0750 /var/lib/evcc-addons/update

if [ -d /run/systemd/system ]; then
  systemctl daemon-reload
  systemctl enable evcc-addons.service
  if ! systemctl restart evcc-addons.service; then
    echo "evcc-addons konnte nicht gestartet werden, siehe: journalctl -u evcc-addons" >&2
  fi
  # start auf die laufende Path-Unit ist ein No-op und unterbricht einen gerade laufenden Updater nicht
  if ! systemctl enable --now evcc-addons-update.path; then
    echo "Updates aus der Oberfläche nicht aktiviert, siehe: journalctl -u evcc-addons-update.path" >&2
  fi
fi
