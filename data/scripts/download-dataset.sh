#!/usr/bin/env bash
# Downloads the CGM + food-log files for the given participant IDs from
# PhysioNet's BIG IDEAs Lab Glycemic Variability dataset (v1.1.2).
#
# Deliberately does NOT fetch the Empatica E4 wearable files (ACC/BVP/EDA/
# HR/IBI/TEMP) — they're large (hundreds of MB to multiple GB per
# participant) and unused until a later phase adds activity correlation.
#
# Usage: ./data/scripts/download-dataset.sh 001 002 003
set -euo pipefail

VERSION="1.1.2"
BASE_URL="https://physionet.org/files/big-ideas-glycemic-wearable/${VERSION}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAW_DIR="${SCRIPT_DIR}/../raw"

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <participant-id> [participant-id ...]" >&2
  echo "Example: $0 001 002 003" >&2
  exit 1
fi

mkdir -p "${RAW_DIR}"

for id in "$@"; do
  echo "Fetching participant ${id}..."
  mkdir -p "${RAW_DIR}/${id}"
  curl -fSL --retry 3 "${BASE_URL}/${id}/Dexcom_${id}.csv" -o "${RAW_DIR}/${id}/Dexcom_${id}.csv"
  curl -fSL --retry 3 "${BASE_URL}/${id}/Food_Log_${id}.csv" -o "${RAW_DIR}/${id}/Food_Log_${id}.csv"
done

echo "Done. Raw files are in ${RAW_DIR}/ (gitignored)."
