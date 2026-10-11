#!/usr/bin/env bash
# Run the program tests against a local validator on :8899 (start it with scripts/validator.sh).
set -euo pipefail
cd "$(dirname "$0")/.."
export ANCHOR_PROVIDER_URL=${ANCHOR_PROVIDER_URL:-http://127.0.0.1:8899}
export ANCHOR_WALLET=${ANCHOR_WALLET:-$HOME/.config/solana/id.json}
npx ts-mocha -p ./tsconfig.json -t 1000000 'tests/**/*.ts'
