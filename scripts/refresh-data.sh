#!/usr/bin/env bash
# Earth Pulse — denní refresh živých dat snapshotů
# Aktualizuje jen data, která se mění často (TLE orbity). Statické katalogy
# (měsíce, sopky, hvězdy) se nechávají — mění se řádově rok v roce.
# Výstup potlačen; při chybě vypíše reason (cron mu pošle mail / Hermes alert).
set -uo pipefail

source "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true
nvm use default >/dev/null 2>&1 || true

cd "$HOME/dev/projects/earth-pulse" || { echo "EP-REFRESH: project dir missing"; exit 1; }

CHANGED=()

# Starlink TLE (nejdůležitější — drift 2+ týdny = test FAIL)
if node scripts/fetch-starlink.mjs >/dev/null 2>&1; then
  CHANGED+=("starlink")
else
  echo "EP-REFRESH: fetch-starlink FAILED"
fi

# Famous sats TLE (ISS, Hubble, Sentinely...) — taky orbit drift
if node scripts/fetch-famous.mjs >/dev/null 2>&1; then
  CHANGED+=("famous")
else
  echo "EP-REFRESH: fetch-famous FAILED"
fi

# Probes TLE (hluboký vesmír — mění se pomalu, ale levné)
if node scripts/fetch-probes.mjs >/dev/null 2>&1; then
  CHANGED+=("probes")
else
  echo "EP-REFRESH: fetch-probes FAILED"
fi

if [ ${#CHANGED[@]} -eq 0 ]; then
  echo "EP-REFRESH: all fetches failed"
  exit 1
fi

# Commit jen když se něco reálně změnilo
if ! git diff --quiet -- public/tle/; then
  git add public/tle/
  git commit -m "🛰 auto-refresh TLE data ($(date +%d.%m.%Y)): ${CHANGED[*]}" --quiet \
    || { echo "EP-REFRESH: commit failed"; exit 1; }
  echo "EP-REFRESH: committed ${CHANGED[*]}"
else
  echo "EP-REFRESH: no changes"
fi
