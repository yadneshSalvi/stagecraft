import { z } from "zod";
import { TransportUrlSchema } from "./schemas";
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const savedFile = z
  .object({
    intentAt: z.string().datetime().optional(),
    uploaded: z.boolean(),
    registration: z
      .object({
        fileId: z.string().min(1).max(2048),
        request: z
          .object({
            url: TransportUrlSchema,
            method: z.enum(["PUT", "POST"]),
            headers: z.record(z.string(), z.string()),
          })
          .strict(),
      })
      .strict()
      .optional(),
  })
  .strict();
export const RecordingLedgerSchema = z
  .object({
    version: z.literal(1),
    matrixSha256: sha,
    balanceBefore: z.number().finite().nonnegative().optional(),
    balanceAfter: z.number().finite().nonnegative().optional(),
    costsVerified: z.boolean(),
    items: z
      .array(
        z
          .object({
            id: z.string().min(1).max(120),
            inputHash: sha,
            state: z.enum([
              "planned",
              "submitting",
              "polling",
              "success",
              "failed",
              "ambiguous",
            ]),
            files: z
              .object({
                source: savedFile.optional(),
                reference: savedFile.optional(),
              })
              .strict(),
            submissionStartedAt: z.string().datetime().optional(),
            taskId: z.string().min(1).max(2048).optional(),
            errorCode: z.string().max(120).optional(),
            record: z.unknown().optional(),
          })
          .strict(),
      )
      .max(30),
  })
  .strict()
  .superRefine((ledger, context) => {
    for (const item of ledger.items)
      if (
        (item.state === "success" &&
          (!item.record || !item.taskId || !item.submissionStartedAt)) ||
        (item.taskId && !item.submissionStartedAt)
      )
        context.addIssue({
          code: "custom",
          message: "Saved task lineage is incomplete.",
        });
  });
export type RecordingLedger = z.infer<typeof RecordingLedgerSchema>;
export function maySubmitRecording(item: RecordingLedger["items"][number]) {
  return item.state === "planned" && !item.submissionStartedAt && !item.taskId;
}
export function parseRecordingLedger(
  raw: string,
  matrixSha256: string,
  expected: { id: string; inputHash: string }[],
): RecordingLedger {
  let ledger: RecordingLedger;
  try {
    ledger = RecordingLedgerSchema.parse(JSON.parse(raw));
  } catch {
    throw new Error(
      "The private recording ledger is unreadable; it will not be reset or resubmitted.",
    );
  }
  if (
    ledger.matrixSha256 !== matrixSha256 ||
    ledger.items.length !== expected.length ||
    ledger.items.some(
      (item, index) =>
        item.id !== expected[index].id ||
        item.inputHash !== expected[index].inputHash,
    )
  )
    throw new Error(
      "The saved recording plan does not match the approved inputs.",
    );
  return ledger;
}
