import { z } from "zod";
import { MAX_SCRIPT_CHARACTERS } from "./script-schema";
import { BeautyRecipeSchema } from "@/lib/youcam/beauty";
import { DetailRecipeSchema } from "@/lib/youcam/details";

export const identifier = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9_-]+$/);
const text = (max = 2000) => z.string().max(max);
const name = z.string().trim().min(1).max(120);
const iso = z.string().datetime({ offset: true });
const nonnegative = z.number().int().min(0).max(100_000_000);
const optionalMeasurement = z.number().finite().positive().max(1000).nullable();
const category = z.enum([
  "full_body",
  "upper_body",
  "lower_body",
  "shoes",
  "outerwear",
]);
const provenance = z.enum(["synthetic", "manual", "observed"]);
const imageUrl = z
  .string()
  .max(200)
  .regex(
    /^\/(?:assets\/(?:cast|garments)\/[a-z0-9-]+\.webp|api\/assets\/[0-9a-f-]{36})$/,
  );
const consent = z
  .object({
    granted: z.boolean(),
    purpose: text(400),
    publicDemo: z.boolean(),
    recordedAt: iso.nullable(),
  })
  .strict();
const requirement = z
  .object({
    id: identifier,
    characterId: identifier,
    text: text(),
    explicit: z.boolean(),
    sourceStart: nonnegative,
    sourceEnd: nonnegative,
    reviewed: z.boolean(),
  })
  .strict();
const occurrence = z
  .object({
    id: identifier,
    sceneId: identifier,
    label: name,
    kind: z.enum(["shoot", "performance", "fitting", "rehearsal"]),
    start: iso,
    end: iso,
    location: text(200),
    order: z.number().int().min(0).max(10000),
  })
  .strict();
const performer = z
  .object({
    id: identifier,
    name,
    pronouns: text(80),
    imageUrl: imageUrl.nullable(),
    assetId: z.string().uuid().nullable(),
    captureVersion: z.literal(1),
    synthetic: z.boolean(),
    consent,
    measurements: z
      .object({
        chestCm: optionalMeasurement,
        waistCm: optionalMeasurement,
        heightCm: optionalMeasurement,
      })
      .strict(),
  })
  .strict();
const fitting = z
  .object({
    performerId: identifier.nullable(),
    status: z.enum([
      "not_measured",
      "provisional",
      "scheduled",
      "confirmed",
      "alteration",
    ]),
    evidence: text(3000),
    provenance,
  })
  .strict();
const availability = z
  .object({
    from: iso,
    to: iso,
    source: text(500),
    checkedAt: iso,
    confirmed: z.boolean(),
    provenance,
  })
  .strict();
const unit = z
  .object({
    id: identifier,
    code: name,
    name,
    category,
    imageUrl: imageUrl.nullable(),
    assetId: z.string().uuid().nullable(),
    color: text(100),
    material: text(200),
    supplier: text(200),
    ownership: z.enum(["owned", "rental"]),
    location: text(300),
    condition: text(500),
    status: z.enum(["available", "unavailable", "maintenance"]),
    measurements: z
      .object({
        chestCm: optionalMeasurement,
        waistCm: optionalMeasurement,
        lengthCm: optionalMeasurement,
      })
      .strict(),
    fitting,
    availability,
    priceCents: nonnegative,
    priceSource: text(500),
    priceValidUntil: iso,
    substitutionFamily: identifier.nullable(),
    approvedSubstituteIds: z.array(identifier).max(50),
    version: z.literal(1),
  })
  .strict();
const look = z
  .object({
    id: identifier,
    title: name,
    characterId: identifier,
    performerId: identifier,
    revision: z.literal(1),
    sceneIds: z.array(identifier).max(100),
    storyDays: z.array(z.number().int().min(1).max(10000)).max(100),
    unitIds: z.array(identifier).max(10),
    category,
    silhouette: text(1000),
    makeup: z
      .object({
        notes: text(),
        palette: z.array(z.string().regex(/^#[\dA-Fa-f]{6}$/)).max(10),
        skinSmoothStrength: z.literal(0),
        skinSmoothColorIntensity: z.literal(0),
      })
      .strict(),
    hair: text(),
    accessories: text(),
    preparationMinutes: z.number().int().min(0).max(1440).nullable(),
    preparationEvidence: z.enum(["unknown", "estimate", "observed"]),
    previews: z.array(z.never()).length(0),
    approvals: z.array(z.never()).length(0),
    note: text(),
    reviewReason: text().nullable(),
    beauty: z
      .object({
        revision: z.literal(1),
        recipe: BeautyRecipeSchema,
        previews: z.array(z.never()).length(0),
        approvals: z.array(z.never()).length(0),
        reviewReason: text().nullable(),
      })
      .strict()
      .optional(),
  })
  .strict();
const transition = z
  .object({
    id: identifier,
    performerId: identifier,
    fromOccurrenceId: identifier,
    toOccurrenceId: identifier,
    minutes: z.number().finite().min(0).max(1440).nullable(),
    evidence: z.enum(["unknown", "estimate", "observed"]),
    crewResource: text(120).nullable(),
    crewCapacity: z.number().int().min(1).max(100),
    note: text(),
  })
  .strict();

/** Provider results and extracted script adoption are server-only commands. */
export const commandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("create_candidate"),
      lookId: identifier,
      unitIds: z.array(identifier).min(1).max(8),
      performerId: identifier.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("approve_candidate"),
      candidateId: identifier,
      previewId: identifier,
      approvedBy: name,
      rationale: text(3000),
    })
    .strict(),
  z
    .object({
      type: z.literal("revoke_candidate_approval"),
      candidateId: identifier,
      approvalId: identifier,
    })
    .strict(),
  z
    .object({ type: z.literal("adopt_candidate"), candidateId: identifier })
    .strict(),
  z
    .object({ type: z.literal("set_example_decisions"), enabled: z.boolean() })
    .strict(),
  z
    .object({
      type: z.literal("edit_direction"),
      characterId: identifier,
      text: text(3000),
      essential: z.array(text(300)).max(30),
      palette: z
        .array(z.string().regex(/^#[\dA-Fa-f]{6}$/))
        .max(10)
        .optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("import_example_performer"),
      sourcePerformerId: identifier,
    })
    .strict(),
  z
    .object({
      type: z.literal("import_example_unit"),
      sourceUnitId: identifier,
    })
    .strict(),
  z
    .object({
      type: z.literal("set_own_clothes"),
      characterId: identifier,
      ownClothes: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("draft_schedule"),
      start: iso,
      sceneMinutes: z.number().int().min(1).max(1440),
      gapMinutes: z.number().int().min(0).max(1440),
      location: name,
    })
    .strict(),
  z
    .object({
      type: z.literal("update_detail"),
      lookId: identifier,
      recipe: DetailRecipeSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("approve_detail"),
      lookId: identifier,
      kind: z.enum(["hair_color", "necklace"]),
      previewId: identifier,
      approvedBy: name,
      rationale: text(3000),
    })
    .strict(),
  z
    .object({
      type: z.literal("update_production"),
      title: name.optional(),
      subtitle: text(500).optional(),
      budgetCents: nonnegative.optional(),
      mode: z.enum(["film", "live_performance"]).optional(),
      timeZone: text(80).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("review_scene"),
      sceneId: identifier,
      title: name,
      storyDay: z.number().int().min(1).max(10000),
      requirements: z.array(requirement).max(100),
    })
    .strict(),
  z.object({ type: z.literal("update_occurrence"), occurrence }).strict(),
  z.object({ type: z.literal("add_performer"), performer }).strict(),
  z
    .object({
      type: z.literal("add_character"),
      character: z
        .object({
          id: identifier,
          name,
          description: text(),
          performerId: z.union([identifier, z.literal("")]),
          direction: z
            .object({
              revision: z.literal(1),
              text: text(3000),
              palette: z.array(z.string().regex(/^#[\dA-Fa-f]{6}$/)).max(10),
              essential: z.array(text(300)).max(30),
              approvedBy: z.null(),
            })
            .strict(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("update_performer"),
      performerId: identifier,
      name: name.optional(),
      imageUrl: imageUrl.optional(),
      assetId: z.string().uuid().optional(),
      consent: consent.optional(),
    })
    .strict(),
  z
    .object({ type: z.literal("withdraw_consent"), performerId: identifier })
    .strict(),
  z
    .object({
      type: z.literal("withdraw_face_consent"),
      performerId: identifier,
    })
    .strict(),
  z
    .object({
      type: z.literal("update_beauty"),
      lookId: identifier,
      recipe: BeautyRecipeSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("approve_beauty"),
      lookId: identifier,
      previewId: identifier,
      approvedBy: name,
      rationale: z.string().trim().min(1).max(3000),
    })
    .strict(),
  z
    .object({
      type: z.literal("update_direction"),
      characterId: identifier,
      text: text(3000),
      essential: z.array(text(300)).max(30),
      approvedBy: name,
    })
    .strict(),
  z
    .object({
      type: z.literal("update_look"),
      lookId: identifier,
      unitIds: z.array(identifier).max(10).optional(),
      category: category.optional(),
      silhouette: text().optional(),
      makeupNotes: text().optional(),
      hair: text().optional(),
      accessories: text().optional(),
      note: text().optional(),
      preparationMinutes: z
        .number()
        .int()
        .min(0)
        .max(1440)
        .nullable()
        .optional(),
    })
    .strict(),
  z.object({ type: z.literal("create_look"), look }).strict(),
  z
    .object({
      type: z.literal("approve_look"),
      lookId: identifier,
      previewId: identifier,
      approvedBy: name,
      rationale: z.string().trim().min(1).max(3000),
    })
    .strict(),
  z.object({ type: z.literal("add_unit"), unit }).strict(),
  z
    .object({
      type: z.literal("update_unit"),
      unitId: identifier,
      status: z.enum(["available", "unavailable", "maintenance"]).optional(),
      location: text(300).optional(),
      priceCents: nonnegative.optional(),
      priceSource: text(500).optional(),
      priceValidUntil: iso.optional(),
      condition: text(500).optional(),
      availability: availability.optional(),
      fitting: fitting.optional(),
      imageUrl: imageUrl.optional(),
      assetId: z.string().uuid().optional(),
    })
    .strict(),
  z.object({ type: z.literal("solve_allocation") }).strict(),
  z
    .object({
      type: z.literal("adopt_allocation"),
      inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      type: z.literal("create_sourcing"),
      unitIds: z.array(identifier).min(1).max(100),
      supplier: name,
      from: iso,
      to: iso,
      note: text(),
    })
    .strict(),
  z
    .object({
      type: z.literal("update_sourcing"),
      requestId: identifier,
      status: z.enum([
        "draft",
        "requested",
        "held",
        "confirmed",
        "declined",
        "received",
        "returned",
        "cancelled",
      ]),
      operator: name,
      evidence: text(3000),
      externalReference: text(200),
      provenance: z.enum(["synthetic", "manual"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("propose_change"),
      kind: z.enum(["garment_unavailable", "recast"]),
      subjectId: identifier,
      replacementId: identifier.optional(),
      seeded: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("adopt_repair"),
      proposalId: identifier,
      optionId: identifier,
    })
    .strict(),
  z
    .object({
      type: z.literal("create_pack"),
      occurrenceIds: z.array(identifier).min(1).max(200),
      title: name,
    })
    .strict(),
  z.object({ type: z.literal("update_transition"), transition }).strict(),
]);

export const commandEnvelopeSchema = z
  .object({
    expectedRevision: nonnegative,
    commandId: identifier,
    command: commandSchema,
  })
  .strict();
export const createProjectSchema = z
  .object({ mode: z.enum(["example", "blank"]), title: name.optional() })
  .strict();
export const previewRequestSchema = z
  .object({
    lookId: identifier,
    mode: z.enum(["live", "recorded"]),
    kind: z.enum(["garment", "beauty", "hair_color", "necklace"]).optional(),
    candidateId: identifier.optional(),
    commandId: identifier,
    expectedRevision: nonnegative,
  })
  .strict();
export const uploadIntentSchema = z
  .object({
    projectId: z.string().uuid(),
    purpose: z.enum(["performer", "garment", "face"]),
    subjectId: identifier,
    contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    bytes: z.number().int().positive().max(9_999_999),
    consent: z.literal(true),
    rightsConfirmed: z.literal(true),
  })
  .strict();
export const finalizeSchema = z
  .object({
    pathname: z.string().min(1).max(300),
    projectId: z.string().uuid(),
    purpose: z.enum(["performer", "garment", "face"]),
    subjectId: identifier,
  })
  .strict();
export const scriptRequestSchema = z
  .object({
    text: z
      .string()
      .min(20)
      .max(MAX_SCRIPT_CHARACTERS)
      .refine((value) => value.trim().length >= 20),
    title: name,
    label: name,
    rightsConfirmed: z.literal(true),
    expectedRevision: nonnegative,
    commandId: identifier,
  })
  .strict();
export const scriptAdoptSchema = z
  .object({
    draftId: z.string().uuid(),
    expectedRevision: nonnegative,
    commandId: identifier,
  })
  .strict();
