#!/usr/bin/env bash
# Start a fresh local validator with both programs preloaded.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .demo
exec solana-test-validator --reset --quiet --ledger .demo/ledger \
  --bpf-program 6SPpSd6984j65tmNMJh3SgUxqeUbFFrDXaiisSu9oX1C target/deploy/intatto.so \
  --bpf-program Eywhc9M2P3DVhq99LSaVbSye5apTYf6dSwk6uLCTJDEJ target/deploy/borneo_checkout.so
