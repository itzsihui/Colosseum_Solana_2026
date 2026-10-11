/**
 * Stand up a full demo world on a local validator or devnet:
 * a mock NVDAx mint (8 decimals, like xStocks), a mock USDC mint, the Intatto market,
 * a funded lending pool, Borneo's checkout config, and a buyer holding 10 NVDAx.
 */
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { defaultParams, pda, programs, sessionIndex, SessionName, MarketAccounts } from "./client";

export const NVDA_DECIMALS = 8;
export const USDC_DECIMALS = 6;
export const usdc = (n: number) => new BN(Math.round(n * 10 ** USDC_DECIMALS));
export const nvda = (n: number) => new BN(Math.round(n * 10 ** NVDA_DECIMALS));

export type World = MarketAccounts & {
  admin: Keypair;
  keeper: Keypair;
  quoteAuthority: Keypair;
  buyer: Keypair;
};

export async function fund(provider: anchor.AnchorProvider, to: PublicKey, sol = 2) {
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: provider.wallet.publicKey, toPubkey: to, lamports: sol * 1e9 }),
  );
  await provider.sendAndConfirm(tx);
}

export async function bootstrap(
  provider: anchor.AnchorProvider,
  opts: { price?: number; session?: SessionName; poolUsdc?: number; buyerNvda?: number; buyerUsdc?: number } = {},
): Promise<World> {
  const { intatto, checkout } = programs(provider);
  const conn = provider.connection;
  const admin = (provider.wallet as anchor.Wallet).payer;
  const keeper = Keypair.generate();
  const quoteAuthority = Keypair.generate();
  const buyer = Keypair.generate();
  await fund(provider, keeper.publicKey, 1);
  await fund(provider, quoteAuthority.publicKey, 2);
  await fund(provider, buyer.publicKey, 1);

  const collateralMint = await createMint(conn, admin, admin.publicKey, null, NVDA_DECIMALS);
  const usdcMint = await createMint(conn, admin, admin.publicKey, null, USDC_DECIMALS);
  const market = pda.market(collateralMint, usdcMint);

  await intatto.methods
    .initMarket(defaultParams(keeper.publicKey))
    .accountsPartial({
      admin: admin.publicKey,
      collateralMint,
      usdcMint,
      market,
      collateralVault: pda.collateralVault(market),
      usdcVault: pda.usdcVault(market),
      collateralProgram: TOKEN_PROGRAM_ID,
      usdcProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  await intatto.methods
    .updateMarket(usdc(opts.price ?? 226), sessionIndex(opts.session ?? "Overnight"))
    .accountsPartial({ keeper: keeper.publicKey, market })
    .signers([keeper])
    .rpc();

  // Lending pool
  const adminUsdc = await getOrCreateAssociatedTokenAccount(conn, admin, usdcMint, admin.publicKey);
  await mintTo(conn, admin, usdcMint, adminUsdc.address, admin, BigInt(usdc(1_000_000).toString()));
  await intatto.methods
    .supply(usdc(opts.poolUsdc ?? 100_000))
    .accountsPartial({
      lender: admin.publicKey,
      market,
      usdcMint,
      lenderUsdc: adminUsdc.address,
      usdcVault: pda.usdcVault(market),
      usdcProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

  // Borneo checkout config (idempotent: one per deployment)
  const config = pda.config();
  const existing = await checkout.account.config.fetchNullable(config);
  if (!existing) {
    await checkout.methods.initConfig(quoteAuthority.publicKey).accountsPartial({ admin: admin.publicKey, usdcMint, config }).rpc();
  } else {
    throw new Error("Borneo config already exists on this cluster; restart the validator with --reset for a fresh demo world");
  }

  // Buyer: 10 NVDAx and a little cash
  const buyerNvda = await getOrCreateAssociatedTokenAccount(conn, admin, collateralMint, buyer.publicKey);
  await mintTo(conn, admin, collateralMint, buyerNvda.address, admin, BigInt(nvda(opts.buyerNvda ?? 10).toString()));
  const buyerUsdc = await getOrCreateAssociatedTokenAccount(conn, admin, usdcMint, buyer.publicKey);
  if ((opts.buyerUsdc ?? 100) > 0) {
    await mintTo(conn, admin, usdcMint, buyerUsdc.address, admin, BigInt(usdc(opts.buyerUsdc ?? 100).toString()));
  }

  return { admin, keeper, quoteAuthority, buyer, market, collateralMint, usdcMint };
}
