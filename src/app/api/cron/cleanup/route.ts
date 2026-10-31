import { cleanup, requireCron } from "@/lib/server/cleanup";
import { handle, json } from "@/lib/server/http";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  return handle(async () => {
    requireCron(request);
    return json(await cleanup());
  });
}
