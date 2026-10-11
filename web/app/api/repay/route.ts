import { repay } from "@/lib/server/demo";
import { handle } from "@/lib/server/route";
export const runtime = "nodejs";
export const POST = async (req: Request) => {
  const { amount } = (await req.json()) as { amount: number };
  return handle(() => repay(Math.max(0.01, Number(amount) || 100)));
};
