import { chat } from "@/lib/server/demo";
import { handle } from "@/lib/server/route";
export const runtime = "nodejs";
export const POST = async (req: Request) => {
  const { message, history } = (await req.json()) as { message: string; history?: string[] };
  return handle(() => chat(String(message ?? "").slice(0, 500), (history ?? []).slice(-6)));
};
