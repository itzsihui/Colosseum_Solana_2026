/**
 * Shared client for the Intatto and Borneo checkout programs.
 * Used by the tests and by the demo app's server routes.
 */
import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { createHash } from "crypto";
import intattoIdl from "./idl/intatto.json";
import checkoutIdl from "./idl/borneo_checkout.json";
import type { Intatto } from "./idl/intatto";
import type { BorneoCheckout } from "./idl/borneo_checkout";

export type { Intatto, BorneoCheckout };

export const INTATTO_ID = new PublicKey(intattoIdl.address);
export const CHECKOUT_ID = new PublicKey(checkoutIdl.address);

export const SESSIONS = ["Regular", "Extended", "Overnight", "Closed"] as const;
export type SessionName = (typeof SESSIONS)[number];
export const sessionIndex = (s: SessionName) => SESSIONS.indexOf(s);

/** Default risk parameters, matching the pitch: 50/45/40/28% limits, liquidation at 65%. */
export function defaultParams(keeper: PublicKey) {
  return {
    keeper,
    limitBps: [5000, 4500, 4000, 2800],
    liqBps: 6500,
    liqBonusBps: 500,
    maxSliceBps: 5000,
    maxPriceMoveBps: 2000,
    maxStalenessSecs: new BN(3600),
  };
}

export function programs(provider: anchor.AnchorProvider) {
  return {
    intatto: new Program<Intatto>(intattoIdl as Intatto, provider),
    checkout: new Program<BorneoCheckout>(checkoutIdl as BorneoCheckout, provider),
  };
}

// ------------------------------------------------------------------ PDAs

export const pda = {
  market: (collateralMint: PublicKey, usdcMint: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("market"), collateralMint.toBuffer(), usdcMint.toBuffer()],
      INTATTO_ID,
    )[0],
  collateralVault: (market: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("collateral_vault"), market.toBuffer()], INTATTO_ID)[0],
  usdcVault: (market: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("usdc_vault"), market.toBuffer()], INTATTO_ID)[0],
  position: (market: PublicKey, owner: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("position"), market.toBuffer(), owner.toBuffer()],
      INTATTO_ID,
    )[0],
  config: () => PublicKey.findProgramAddressSync([Buffer.from("config")], CHECKOUT_ID)[0],
  quote: (buyer: PublicKey, quoteId: Uint8Array) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("quote"), buyer.toBuffer(), Buffer.from(quoteId)],
      CHECKOUT_ID,
    )[0],
};

export const skuHash = (storeSlug: string, skuId: string) =>
  Array.from(createHash("sha256").update(`${storeSlug}/${skuId}`).digest());

export const newQuoteId = () => Array.from(anchor.web3.Keypair.generate().publicKey.toBytes().slice(0, 16));

export type MarketAccounts = {
  market: PublicKey;
  collateralMint: PublicKey;
  usdcMint: PublicKey;
  collateralProgram?: PublicKey;
  usdcProgram?: PublicKey;
};

const progs = (m: MarketAccounts) => ({
  collateralProgram: m.collateralProgram ?? TOKEN_PROGRAM_ID,
  usdcProgram: m.usdcProgram ?? TOKEN_PROGRAM_ID,
});

// ------------------------------------------------------------------ instructions

export type QuoteLineInput = { merchant: PublicKey; amount: BN; storeSlug: string; skuId: string };

/**
 * One atomic "pay with stock credit" transaction:
 *   deposit collateral -> borrow USDC -> settle the locked Borneo quote.
 * If Intatto refuses the borrow (session limit, stale price), nothing happens at all.
 */
export async function payWithCreditIxs(args: {
  intatto: Program<Intatto>;
  checkout: Program<BorneoCheckout>;
  m: MarketAccounts;
  owner: PublicKey;
  depositAmount: BN;
  borrowAmount: BN;
  quote: PublicKey;
  merchants: PublicKey[];
}): Promise<TransactionInstruction[]> {
  const { intatto, checkout, m, owner } = args;
  const { collateralProgram, usdcProgram } = progs(m);
  const ownerCollateral = getAssociatedTokenAddressSync(m.collateralMint, owner, false, collateralProgram);
  const ownerUsdc = getAssociatedTokenAddressSync(m.usdcMint, owner, false, usdcProgram);
  const ixs: TransactionInstruction[] = [
    createAssociatedTokenAccountIdempotentInstruction(owner, ownerUsdc, owner, m.usdcMint, usdcProgram),
  ];
  for (const merchant of args.merchants) {
    const ata = getAssociatedTokenAddressSync(m.usdcMint, merchant, true, usdcProgram);
    ixs.push(createAssociatedTokenAccountIdempotentInstruction(owner, ata, merchant, m.usdcMint, usdcProgram));
  }
  if (!args.depositAmount.isZero()) {
    ixs.push(
      await intatto.methods
        .deposit(args.depositAmount)
        .accountsPartial({
          owner,
          market: m.market,
          position: pda.position(m.market, owner),
          collateralMint: m.collateralMint,
          ownerCollateral,
          collateralVault: pda.collateralVault(m.market),
          collateralProgram,
        })
        .instruction(),
    );
  }
  if (!args.borrowAmount.isZero()) {
    ixs.push(await borrowIx(intatto, m, owner, args.borrowAmount));
  }
  ixs.push(
    await checkout.methods
      .settleQuote()
      .accountsPartial({ buyer: owner, quote: args.quote, usdcMint: m.usdcMint, buyerUsdc: ownerUsdc, usdcProgram })
      .remainingAccounts(
        args.merchants.map((merchant) => ({
          pubkey: getAssociatedTokenAddressSync(m.usdcMint, merchant, true, usdcProgram),
          isSigner: false,
          isWritable: true,
        })),
      )
      .instruction(),
  );
  return ixs;
}

export async function borrowIx(intatto: Program<Intatto>, m: MarketAccounts, owner: PublicKey, amount: BN) {
  const { usdcProgram } = progs(m);
  return intatto.methods
    .borrow(amount)
    .accountsPartial({
      owner,
      market: m.market,
      position: pda.position(m.market, owner),
      usdcMint: m.usdcMint,
      ownerUsdc: getAssociatedTokenAddressSync(m.usdcMint, owner, false, usdcProgram),
      usdcVault: pda.usdcVault(m.market),
      usdcProgram,
    })
    .instruction();
}

export async function repayIx(intatto: Program<Intatto>, m: MarketAccounts, payer: PublicKey, owner: PublicKey, amount: BN) {
  const { usdcProgram } = progs(m);
  return intatto.methods
    .repay(amount)
    .accountsPartial({
      payer,
      market: m.market,
      position: pda.position(m.market, owner),
      usdcMint: m.usdcMint,
      payerUsdc: getAssociatedTokenAddressSync(m.usdcMint, payer, false, usdcProgram),
      usdcVault: pda.usdcVault(m.market),
      usdcProgram,
    })
    .instruction();
}

// ------------------------------------------------------------------ reads

export type Snapshot = {
  price: number; // USD per whole token
  session: SessionName;
  limitPct: number;
  liqPct: number;
  priceAgeSecs: number;
  collateral: number; // whole tokens
  debt: number; // USD
  ltvPct: number;
  /** % fall in the stock price that would make this position liquidatable. */
  liqDropPct: number | null;
};

export async function snapshot(intatto: Program<Intatto>, m: MarketAccounts, owner: PublicKey): Promise<Snapshot> {
  const mk = await intatto.account.market.fetch(m.market);
  const pos = await intatto.account.position.fetchNullable(pda.position(m.market, owner));
  const cDec = 10 ** mk.collateralDecimals;
  const uDec = 10 ** mk.usdcDecimals;
  const price = mk.price.toNumber() / uDec;
  const collateral = pos ? pos.collateral.toNumber() / cDec : 0;
  const debt = pos ? pos.debt.toNumber() / uDec : 0;
  const value = collateral * price;
  const ltvPct = debt === 0 ? 0 : value === 0 ? Infinity : (debt / value) * 100;
  const liqPct = mk.liqBps / 100;
  return {
    price,
    session: SESSIONS[mk.session],
    limitPct: mk.limitBps[mk.session] / 100,
    liqPct,
    priceAgeSecs: Math.floor(Date.now() / 1000) - mk.priceUpdatedAt.toNumber(),
    collateral,
    debt,
    ltvPct,
    liqDropPct: debt === 0 ? null : Math.max(0, (1 - ltvPct / liqPct) * 100),
  };
}

/** Pull an Anchor error name out of a failed send or simulation. */
export function anchorErrorName(e: unknown): string | null {
  const any = e as { error?: { errorCode?: { code?: string } }; logs?: string[]; message?: string; transactionLogs?: string[] };
  if (any?.error?.errorCode?.code) return any.error.errorCode.code;
  const text = [any?.message ?? "", ...(any?.logs ?? []), ...(any?.transactionLogs ?? [])].join("\n");
  const m = text.match(/Error Code: (\w+)/);
  return m ? m[1] : null;
}
