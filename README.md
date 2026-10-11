# Borneo × Intatto

**Shopping agents that pay with your stocks without selling them, and never touch the money.**

AI agents can already shop for you. But most people's money isn't sitting in cash; it's in assets like stocks. Today an agent's only way to pay is to sell them. Borneo × Intatto lets the agent buy now against tokenized stock (NVDAx), with two hard rules enforced onchain on Solana:

- **Borneo controls *what* the agent buys.** Borneo prices the cart from real merchant catalogs and locks the quote onchain: store, item, price, merchant wallet. The agent can settle that quote. It can't change who gets paid or how much.
- **Intatto controls *how* it pays.** The shopper posts NVDAx as collateral and borrows USDC. The borrow limit follows the US market session: lower overnight, lowest on weekends when Nasdaq is closed and weekend news only reaches the real price at Monday's open. Repaying always works.

> The AI proposes; the rules decide.

Built for the Colosseum Crypto World's Fair hackathon. It started as a joint project at OKX Dev Day on X Layer. For Colosseum we rebuilt both halves natively on Solana as Anchor programs, wrote a new demo app and test suite, and added the per-USDC-mint checkout config. See [What's new for Colosseum](#whats-new-for-colosseum).

## Demo flow (≈2:50)

| Beat | What happens onchain |
|---|---|
| "Linen outfit for a weekend in Bali, around $400" | Agent picks 3 items across 3 stores. Borneo's quote authority calls `lock_quote`: payees and amounts are stored in a Quote account. |
| Pay $349 with stock credit | One atomic transaction: `intatto::deposit` 4.5 NVDAx → `intatto::borrow` $349 → `borneo_checkout::settle_quote` pays 3 merchants. LTV 34%, under the 40% overnight limit; liquidation only if NVIDIA falls 47%. |
| Jump to Saturday | The keeper relays `session = Closed`; the new-borrow limit drops to 28%, below the loan's 34%. |
| "Add a sun hat" | The credit agent simulates the borrow; the program returns `SessionLimit`. Nothing is signed. |
| Repay $100 | `intatto::repay` works on Saturday; LTV drops to 24%. |

## Repo layout

```
programs/intatto/          Anchor program: stock-backed credit with session-aware limits
programs/borneo-checkout/  Anchor program: locked quotes the agent can settle but not alter
sdk/                       TypeScript client: IDLs, PDAs, the atomic pay-with-credit transaction, demo bootstrap
tests/demo-flow.ts         End-to-end tests of every beat above, plus attack and failure cases
web/                       Next.js demo app (chat, locked quote, credit agent, LTV gauge)
scripts/                   Local validator and test runners
```

## Run it locally

Prerequisites: Rust, Solana CLI 2.3.x (Agave), Anchor CLI 0.31.1, Node 20+.

```bash
npm install                 # SDK + test deps
cargo build-sbf             # builds target/deploy/intatto.so and borneo_checkout.so
scripts/validator.sh        # terminal 1: local validator with both programs preloaded
scripts/test.sh             # terminal 2: 9 end-to-end tests

cd web && npm install && cp .env.example .env.local
npm run dev                 # http://localhost:3000 → Prepare demo → wait for Ready
```

Optional: set `ANTHROPIC_API_KEY` in `web/.env.local` and Claude picks the products. Without it, a deterministic rules picker runs, so the demo never depends on an LLM call.

`anchor keys sync` regenerates program IDs if you deploy under your own keypairs. To regenerate IDLs after changing a program: `anchor idl build -p intatto -o sdk/idl/intatto.json -t sdk/idl/intatto.ts` (same for `borneo_checkout`).

## Intatto: how the risk engine works

| Parameter | Default |
|---|---|
| New-borrow LTV limit: Regular / Extended / Overnight / Closed | 50% / 45% / 40% / 28% |
| Liquidation threshold | 65% LTV |
| Liquidation bonus / max slice per call | 5% / 50% of debt |
| Max price move per keeper update | 20% |
| Price staleness before borrowing pauses | 1 hour |

- **Borrow** needs a fresh price and a post-borrow LTV under the current session's limit.
- **Repay** has no price or session checks. If the keeper goes quiet, borrowing stops and repay stays open.
- **Withdraw** follows the same limit as borrowing while there is debt.
- **Liquidate** runs in slices once LTV passes 65%. If collateral runs out, the remainder is written off and recorded as `bad_debt`, so lenders can see the loss.
- **Keeper trust:** the keeper relays price and session. It's a trusted relayer, stated openly, and bounded onchain: one update can't move the price more than 20%, and only the admin can change parameters.

## Borneo checkout: why the agent can't redirect money

- Only the configured `quote_authority` (Borneo's quote service) can lock a quote, and it prices lines from merchant catalogs, not from the agent.
- `settle_quote` takes merchant token accounts in line order and checks each one's owner against the locked merchant. A wrong payee fails with `MerchantMismatch` (tested).
- A quote can be settled once, by its buyer, before it expires.
- Each line stores `sha256(store/sku)`, so every order is auditable onchain.

## What's new for Colosseum

- Both programs rewritten from scratch in Anchor for Solana (the Dev Day version was EVM on X Layer).
- Token-interface accounts, so the same code accepts SPL Token and Token-2022 mints (xStocks are Token-2022).
- One atomic Solana transaction for deposit, borrow and multi-merchant settlement, replacing six separate EVM transactions.
- New test suite covering the demo story, payee-redirect attempts, double settlement, keeper bounds, stale-price pause and sliced liquidation.
- New demo app on Solana, with Borneo's catalogs and agentic storefront endpoints (`/llms.txt`, `/s/{slug}/catalog.json`).

## Honest limits

- The demo runs on a local validator with a mock NVDAx mint (8 decimals, like xStocks) and mock USDC. Nothing here has moved mainnet funds.
- The keeper is a trusted relayer. Lenders earn no interest yet, and there is no gap reserve yet; bad debt is recorded, not covered.
- The demo server holds the shopper's agent key so the flow can be clicked through; in production the shopper's wallet or a delegated session key signs.

## Roadmap

1. Devnet deployment, then mainnet with real xStocks (NVDAx is a Token-2022 mint on Solana).
2. Replace the trusted keeper with Pyth's US equity price feeds and their market-hours data, keeping the keeper only as a fallback.
3. Interest-bearing lender shares and a gap reserve funded by a slice of interest.
4. Credit checks paid per call over x402, so any shopping agent can use Intatto, not just Borneo.

## Team

Borneo (agent commerce) and Intatto (stock-backed credit).
