#!/usr/bin/env bash
# Deploy both programs to devnet with the keypairs in target/deploy.
# Needs ~6 SOL on the deploy wallet: solana airdrop 2 -u devnet (repeat) or https://faucet.solana.com
set -euo pipefail
cd "$(dirname "$0")/.."
cargo build-sbf
solana program deploy -u devnet --program-id target/deploy/intatto-keypair.json target/deploy/intatto.so
solana program deploy -u devnet --program-id target/deploy/borneo_checkout-keypair.json target/deploy/borneo_checkout.so
echo "Deployed. Run the app with SOLANA_RPC_URL=https://api.devnet.solana.com"
