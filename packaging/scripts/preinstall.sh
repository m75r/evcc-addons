#!/bin/sh
# Legt den System-User evcc-addons an, falls er noch nicht existiert
set -e

if ! getent passwd evcc-addons >/dev/null; then
  useradd --system --user-group --no-create-home --shell /usr/sbin/nologin evcc-addons
fi
