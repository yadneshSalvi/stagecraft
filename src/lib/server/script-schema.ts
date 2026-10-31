import { z } from "zod";
export const MAX_SCRIPT_CHARACTERS = 60_000;
const name = z.string().trim().min(1).max(120);
export const ExtractedScriptSchema = z
  .object({
    characters: z
      .array(z.object({ name, description: z.string().max(2000) }).strict())
      .max(40),
    scenes: z
      .array(
        z
          .object({
            number: z.string().min(1).max(20),
            title: name,
            heading: z.string().min(1).max(400),
            storyDay: z.number().int().min(1).max(10000).nullable(),
            characters: z.array(name).max(40),
            requirements: z
              .array(
                z
                  .object({
                    character: name,
                    quote: z.string().min(1).max(2000),
                    explicit: z.boolean(),
                    suggestion: z.string().max(2000),
                  })
                  .strict(),
              )
              .max(30),
          })
          .strict(),
      )
      .min(1)
      .max(60),
  })
  .strict();
