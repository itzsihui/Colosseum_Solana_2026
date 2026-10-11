import { setDay } from "@/lib/server/demo";
import { handle } from "@/lib/server/route";
export const runtime = "nodejs";
export const POST = async (req: Request) => {
  const { day } = (await req.json()) as { day: "weekday" | "saturday" };
  return handle(() => setDay(day === "saturday" ? "saturday" : "weekday"));
};
