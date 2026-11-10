#!/bin/sh
# Veröffentlichung nach Commit und Tag: dünner Wrapper um scripts/publish.mjs (Details: README, Abschnitt „Release“)
# Aufruf: bin/release.sh [--push] [--skip-addons] [--skip-tests] [--help]
set -e

cd "$(dirname "$0")/.."
exec node scripts/publish.mjs "$@"
