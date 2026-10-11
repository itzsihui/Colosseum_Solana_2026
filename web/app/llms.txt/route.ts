import { STORES } from "@/lib/catalog";

/** Borneo discovery file: agents read this and the JSON catalogs, never HTML. */
export async function GET() {
  const body = [
    "# Borneo merchant network",
    "",
    "Agents: read the JSON catalogs below. Do not scrape HTML.",
    "Payment: Borneo locks a quote onchain (Solana, borneo_checkout). Payees and amounts come only from that quote.",
    "",
    ...STORES.map((s) => `- [${s.name}](/s/${s.slug}/catalog.json)`),
  ].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
