import { requireOwner } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/limits";
import { handle, json } from "@/lib/server/http";
import { createExampleProduction } from "@/lib/domain";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return handle(async () => {
    const owner = await requireOwner(request);
    await rateLimit(`library:${owner}`, 120, 300);
    const example = createExampleProduction("example-library");
    return json({
      performers: example.performers.map(
        ({ id, name, imageUrl, synthetic, faceCapture }) => ({
          id,
          name,
          imageUrl,
          synthetic,
          ...(faceCapture
            ? {
                faceCapture: {
                  imageUrl: faceCapture.imageUrl,
                  synthetic: faceCapture.synthetic,
                },
              }
            : {}),
        }),
      ),
      units: example.units.map(
        ({
          id,
          code,
          name,
          category,
          imageUrl,
          material,
          color,
          priceCents,
        }) => ({
          id,
          code,
          name,
          category,
          imageUrl,
          material,
          color,
          priceCents,
        }),
      ),
    });
  });
}
