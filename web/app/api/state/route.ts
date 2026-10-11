import { state } from "@/lib/server/demo";
import { handle } from "@/lib/server/route";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = () => handle(state);
