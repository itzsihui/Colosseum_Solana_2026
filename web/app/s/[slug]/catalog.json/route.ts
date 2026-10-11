import { NextResponse } from "next/server";
import { STORES } from "@/lib/catalog";

/** Borneo agentic storefront protocol: machine-readable catalog per store. */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const store = STORES.find((s) => s.slug === slug);
  if (!store) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    store: store.slug,
    name: store.name,
    currency: "USDC",
    settlement: "solana: borneo_checkout locked quote",
    skus: store.skus,
  });
}
