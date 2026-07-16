#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ELECTRON_APP="${PROJECT_ROOT}/node_modules/electron/dist/Electron.app"
ENTRYPOINT="${PROJECT_ROOT}/desktop/main.js"

if [[ ! -d "${ELECTRON_APP}" ]]; then
    echo "Electron.app not found at ${ELECTRON_APP}"
    echo "Run 'npm install' in ${PROJECT_ROOT} first."
    exit 1
fi

if [[ ! -f "${ENTRYPOINT}" ]]; then
    echo "Electron entrypoint not found at ${ENTRYPOINT}"
    exit 1
fi

open -n "${ELECTRON_APP}" --args "${ENTRYPOINT}"
