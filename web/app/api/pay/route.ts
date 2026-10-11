import { pay } from "@/lib/server/demo";
import { handle } from "@/lib/server/route";
export const runtime = "nodejs";
export const POST = async (req: Request) => {
  const { quote } = (await req.json()) as { quote: string };
  return handle(() => pay(quote));
};
