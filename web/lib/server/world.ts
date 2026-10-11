import fs from "fs";
import os from "os";
import path from "path";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { programs } from "@sdk/client";
import { STORES } from "@/lib/catalog";

const DEMO_DIR = path.resolve(process.cwd(), "..", ".demo");
const WORLD_FILE = path.join(DEMO_DIR, "world.json");

export const RPC_URL = process.env.SOLANA_RPC_URL || "http://127.0.0.1:8899";

export type QuoteLineRecord = {
  storeSlug: string;
  storeName: string;
  skuId: string;
  title: string;
  usd: number;
  merchant: string;
};

export type QuoteRecord = {
  id: number[];
  address: string;
  lines: QuoteLineRecord[];
  total: number;
  createdAt: number;
  paid?: boolean;
  signature?: string;
};

export type TxRecord = { label: string; signature: string; at: number; ok: boolean };

export type WorldFile = {
  createdAt: number;
  keeper: number[];
  quoteAuthority: number[];
  buyer: number[];
  market: string;
  collateralMint: string;
  usdcMint: string;
  merchants: Record<string, string>; // store slug -> wallet
  price: number;
  /** "weekday" shows the overnight session, "saturday" the closed session. */
  day: "weekday" | "saturday";
  quotes: Record<string, QuoteRecord>; // address -> quote
  txs: TxRecord[];
};

export function loadAdmin(): Keypair {
  const file = process.env.SOLANA_WALLET || path.join(os.homedir(), ".config", "solana", "id.json");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8"))));
}

export function provider() {
  const connection = new Connection(RPC_URL, "confirmed");
  return new anchor.AnchorProvider(connection, new anchor.Wallet(loadAdmin()), { commitment: "confirmed" });
}

export function clients() {
  const p = provider();
  return { provider: p, connection: p.connection, ...programs(p) };
}

export function readWorld(): WorldFile | null {
  try {
    return JSON.parse(fs.readFileSync(WORLD_FILE, "utf8")) as WorldFile;
  } catch {
    return null;
  }
}

export function writeWorld(w: WorldFile) {
  fs.mkdirSync(DEMO_DIR, { recursive: true });
  fs.writeFileSync(WORLD_FILE, JSON.stringify(w, null, 2));
}

export function updateWorld(fn: (w: WorldFile) => void) {
  const w = readWorld();
  if (!w) throw new Error("Demo world not prepared");
  fn(w);
  writeWorld(w);
  return w;
}

export const kp = (secret: number[]) => Keypair.fromSecretKey(Uint8Array.from(secret));

export function marketAccounts(w: WorldFile) {
  return {
    market: new PublicKey(w.market),
    collateralMint: new PublicKey(w.collateralMint),
    usdcMint: new PublicKey(w.usdcMint),
  };
}

export function newMerchantWallets() {
  return Object.fromEntries(STORES.map((s) => [s.slug, Keypair.generate().publicKey.toBase58()]));
}

export function explorerTx(sig: string) {
  const local = RPC_URL.includes("127.0.0.1") || RPC_URL.includes("localhost");
  if (local) return `https://explorer.solana.com/tx/${sig}?cluster=custom&customUrl=${encodeURIComponent(RPC_URL)}`;
  const cluster = RPC_URL.includes("devnet") ? "devnet" : RPC_URL.includes("testnet") ? "testnet" : "mainnet-beta";
  return `https://explorer.solana.com/tx/${sig}?cluster=${cluster}`;
}
