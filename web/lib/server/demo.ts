import { BN } from "@coral-xyz/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  anchorErrorName,
  newQuoteId,
  payWithCreditIxs,
  pda,
  repayIx,
  sessionIndex,
  skuHash,
  snapshot,
  type SessionName,
} from "@sdk/client";
import { bootstrap, nvda, usdc } from "@sdk/bootstrap";
import { shop, type Pick } from "./agent";
import {
  clients,
  explorerTx,
  kp,
  marketAccounts,
  newMerchantWallets,
  readWorld,
  updateWorld,
  writeWorld,
  type QuoteRecord,
  type WorldFile,
} from "./world";

const DAY_SESSION: Record<WorldFile["day"], SessionName> = { weekday: "Overnight", saturday: "Closed" };

/** Error names from the programs, explained for the shopper. */
const EXPLAIN: Record<string, string> = {
  SessionLimit:
    "the US market is closed, so NVIDIA's real price can't be checked until Monday and new borrowing is lowered. Your loan is safe and repay still works.",
  StalePrice: "the price feed hasn't updated recently, so new borrowing is paused. Repay still works.",
  MerchantMismatch: "a merchant account didn't match the locked quote.",
  InsufficientFunds: "there isn't enough in the wallet.",
};

// ------------------------------------------------------------------ prepare

export async function prepare() {
  const { provider } = clients();
  const w = await bootstrap(provider, { price: 226, session: "Overnight", buyerNvda: 10, buyerUsdc: 100 });
  const world: WorldFile = {
    createdAt: Date.now(),
    keeper: Array.from(w.keeper.secretKey),
    quoteAuthority: Array.from(w.quoteAuthority.secretKey),
    buyer: Array.from(w.buyer.secretKey),
    market: w.market.toBase58(),
    collateralMint: w.collateralMint.toBase58(),
    usdcMint: w.usdcMint.toBase58(),
    merchants: newMerchantWallets(),
    price: 226,
    day: "weekday",
    quotes: {},
    txs: [],
  };
  writeWorld(world);
  return state();
}

// ------------------------------------------------------------------ state

export async function state() {
  const w = readWorld();
  if (!w) return { ready: false as const };
  const { connection, intatto } = clients();
  try {
    const m = marketAccounts(w);
    const buyer = kp(w.buyer).publicKey;
    const snap = await snapshot(intatto, m, buyer);
    const bal = async (mint: PublicKey, dec: number) => {
      try {
        return Number((await getAccount(connection, getAssociatedTokenAddressSync(mint, buyer))).amount) / 10 ** dec;
      } catch {
        return 0;
      }
    };
    return {
      ready: true as const,
      day: w.day,
      buyer: buyer.toBase58(),
      market: w.market,
      walletNvda: await bal(m.collateralMint, 8),
      cash: await bal(m.usdcMint, 6),
      snap,
      txs: w.txs.slice(-12).map((t) => ({ ...t, url: explorerTx(t.signature) })),
    };
  } catch (e) {
    return { ready: false as const, error: `Validator not reachable or world is stale: ${(e as Error).message}` };
  }
}

// ------------------------------------------------------------------ chat: find, lock, credit check

export async function chat(message: string, history: string[]) {
  const w = readWorld();
  if (!w) throw new Error("Press Prepare demo first");
  const agent = await shop(message, history);
  if (!agent.picks.length) return { reply: agent.reply, source: agent.source };

  const quote = await lockQuote(w, agent.picks);
  const credit = await creditCheck(quote);
  return { reply: agent.reply, source: agent.source, products: quote.lines, quote, credit };
}

async function lockQuote(w: WorldFile, picks: Pick[]): Promise<QuoteRecord> {
  const { checkout } = clients();
  const buyer = kp(w.buyer).publicKey;
  const qa = kp(w.quoteAuthority);
  const id = newQuoteId();
  const address = pda.quote(buyer, Uint8Array.from(id));
  const lines = picks.map((p) => ({
    storeSlug: p.store.slug,
    storeName: p.store.name,
    skuId: p.sku.id,
    title: p.sku.title,
    usd: p.sku.usd, // price comes from the merchant catalog, never from the agent
    merchant: w.merchants[p.store.slug],
  }));
  await checkout.methods
    .lockQuote(
      id,
      lines.map((l) => ({ merchant: new PublicKey(l.merchant), amount: usdc(l.usd), skuHash: skuHash(l.storeSlug, l.skuId) })),
      new BN(Math.floor(Date.now() / 1000) + 30 * 60),
    )
    .accountsPartial({ quoteAuthority: qa.publicKey, config: pda.config(new PublicKey(w.usdcMint)), buyer, quote: address })
    .signers([qa])
    .rpc();
  const q: QuoteRecord = { id, address: address.toBase58(), lines, total: lines.reduce((s, l) => s + l.usd, 0), createdAt: Date.now() };
  updateWorld((x) => {
    x.quotes[q.address] = q;
  });
  return q;
}

type Plan = { deposit: number; borrow: number };

/** Intatto's credit agent: how much collateral to post and what to borrow for this quote. */
async function plan(w: WorldFile, total: number): Promise<Plan & { ltvAfter: number; limit: number; liqDrop: number; session: SessionName }> {
  const { intatto } = clients();
  const s = await snapshot(intatto, marketAccounts(w), kp(w.buyer).publicKey);
  const debt = s.debt + total;
  let deposit = 0;
  if (s.collateral === 0) {
    // First purchase: post enough stock to land ~14% under the current limit, in 0.5 steps.
    const target = (s.limitPct / 100) * 0.86;
    deposit = Math.ceil((debt / (s.price * target)) * 2) / 2;
  }
  const coll = s.collateral + deposit;
  const ltvAfter = (debt / (coll * s.price)) * 100;
  return { deposit, borrow: total, ltvAfter, limit: s.limitPct, liqDrop: Math.max(0, (1 - ltvAfter / s.liqPct) * 100), session: s.session };
}

async function buildPayTx(w: WorldFile, q: QuoteRecord, p: Plan) {
  const { intatto, checkout, connection } = clients();
  const buyer = kp(w.buyer);
  const ixs = await payWithCreditIxs({
    intatto,
    checkout,
    m: marketAccounts(w),
    owner: buyer.publicKey,
    depositAmount: nvda(p.deposit),
    borrowAmount: usdc(p.borrow),
    quote: new PublicKey(q.address),
    merchants: q.lines.map((l) => new PublicKey(l.merchant)),
  });
  const tx = new Transaction().add(...ixs);
  tx.feePayer = buyer.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.sign(buyer);
  return tx;
}

export async function creditCheck(q: QuoteRecord) {
  const w = readWorld()!;
  const p = await plan(w, q.total);
  const { connection } = clients();
  const sim = await connection.simulateTransaction(await buildPayTx(w, q, p));
  const error = sim.value.err ? anchorErrorName({ logs: sim.value.logs ?? [] }) ?? "Refused" : null;
  return {
    ...p,
    ok: !error,
    error,
    explain: error ? EXPLAIN[error] ?? "the contract refused this payment." : null,
  };
}

// ------------------------------------------------------------------ pay, day switch, repay

export async function pay(quoteAddress: string) {
  const w = readWorld();
  if (!w) throw new Error("Press Prepare demo first");
  const q = w.quotes[quoteAddress];
  if (!q) throw new Error("Unknown quote");
  if (q.paid) throw new Error("Quote already paid");
  const p = await plan(w, q.total);
  const { connection } = clients();
  const tx = await buildPayTx(w, q, p);
  try {
    const sig = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(sig, "confirmed");
    const steps = [
      ...(p.deposit ? [`Deposit ${p.deposit} NVDAx as collateral`] : []),
      `Borrow ${p.borrow.toFixed(2)} USDC from Intatto`,
      ...q.lines.map((l) => `Pay ${l.storeName} ${l.usd.toFixed(2)} USDC`),
    ];
    updateWorld((x) => {
      x.quotes[quoteAddress].paid = true;
      x.quotes[quoteAddress].signature = sig;
      x.txs.push({ label: `Pay $${q.total} with stock credit`, signature: sig, at: Date.now(), ok: true });
    });
    return { ok: true, signature: sig, url: explorerTx(sig), steps, plan: p };
  } catch (e) {
    const err = anchorErrorName(e) ?? "Refused";
    return { ok: false, error: err, explain: EXPLAIN[err] ?? "the contract refused this payment." };
  }
}

/** The keeper relays the market session. "Jump to Saturday" = Nasdaq closed. */
export async function setDay(day: WorldFile["day"]) {
  const w = readWorld();
  if (!w) throw new Error("Press Prepare demo first");
  const { intatto } = clients();
  const keeper = kp(w.keeper);
  const sig = await intatto.methods
    .updateMarket(usdc(w.price), sessionIndex(DAY_SESSION[day]))
    .accountsPartial({ keeper: keeper.publicKey, market: new PublicKey(w.market) })
    .signers([keeper])
    .rpc();
  updateWorld((x) => {
    x.day = day;
    x.txs.push({ label: `Keeper: market session → ${DAY_SESSION[day]}`, signature: sig, at: Date.now(), ok: true });
  });
  return state();
}

export async function repay(amount: number) {
  const w = readWorld();
  if (!w) throw new Error("Press Prepare demo first");
  const { intatto, provider } = clients();
  const buyer = kp(w.buyer);
  const ix = await repayIx(intatto, marketAccounts(w), buyer.publicKey, buyer.publicKey, usdc(amount));
  const sig = await provider.sendAndConfirm(new Transaction().add(ix), [buyer]);
  updateWorld((x) => {
    x.txs.push({ label: `Repay $${amount}`, signature: sig, at: Date.now(), ok: true });
  });
  return { signature: sig, url: explorerTx(sig), state: await state() };
}
