import { getAuth } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return handle(() => getAuth().handler(request));
}
export async function POST(request: Request) {
  return handle(() => getAuth().handler(request));
}
