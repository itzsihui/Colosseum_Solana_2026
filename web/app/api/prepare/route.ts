import { prepare } from "@/lib/server/demo";
import { handle } from "@/lib/server/route";
export const runtime = "nodejs";
export const POST = () => handle(prepare);
