/** Shared serializable application contract. Monetary values are integer minor units. */
export type Provenance =
  | "synthetic"
  | "recorded_provider"
  | "live_provider"
  | "manual"
  | "observed"
  | "ai_suggestion";
export type EvidenceState =
  "current" | "needs_review" | "stale" | "blocked" | "historical";
export type ProductionMode = "film" | "live_performance";
export type GarmentCategory =
  "full_body" | "upper_body" | "lower_body" | "shoes" | "outerwear";

export interface ScriptRevision {
  id: string;
  label: string;
  title: string;
  text: string;
  sha256: string;
  rightsConfirmed: boolean;
  createdAt: string;
  model: string;
  provenance: Provenance;
}
export interface SceneRequirement {
  id: string;
  characterId: string;
  text: string;
  explicit: boolean;
  sourceStart: number;
  sourceEnd: number;
  reviewed: boolean;
}
export interface Scene {
  id: string;
  number: string;
  title: string;
  heading: string;
  storyDay: number;
  storyDaySource?: "script" | "unspecified" | "reviewed";
  characterIds: string[];
  lookIds: string[];
  requirements: SceneRequirement[];
  sourceStart: number;
  sourceEnd: number;
  reviewed: boolean;
}
export interface Occurrence {
  id: string;
  sceneId: string;
  label: string;
  kind: "shoot" | "performance" | "fitting" | "rehearsal";
  start: string;
  end: string;
  location: string;
  order: number;
}
export interface Performer {
  id: string;
  name: string;
  pronouns: string;
  imageUrl: string | null;
  assetId: string | null;
  captureVersion: number;
  synthetic: boolean;
  consent: {
    granted: boolean;
    purpose: string;
    publicDemo: boolean;
    recordedAt: string | null;
  };
  measurements: {
    chestCm: number | null;
    waistCm: number | null;
    heightCm: number | null;
  };
  faceCapture?: FaceCapture;
}
export interface FaceCapture {
  imageUrl: string | null;
  assetId: string | null;
  version: number;
  synthetic: boolean;
  consent: Performer["consent"];
}
export interface Character {
  id: string;
  name: string;
  description: string;
  performerId: string;
  direction: {
    revision: number;
    text: string;
    palette: string[];
    essential: string[];
    approvedBy: string | null;
  };
}
export interface Preview {
  id: string;
  lookId: string;
  recipeRevision: number;
  performerId: string;
  captureVersion: number;
  imageUrl: string;
  assetId: string | null;
  sourceImageUrl: string;
  unitIds: string[];
  operation: string;
  provenance: "recorded_provider" | "live_provider";
  createdAt: string;
  inputHash: string;
  estimatedUnits: number;
  inspectionNotes: string;
}
export interface AppearanceApproval {
  id: string;
  lookId: string;
  recipeRevision: number;
  previewId: string;
  performerId: string;
  captureVersion: number;
  sceneIds: string[];
  approvedBy: string;
  rationale: string;
  approvedAt: string;
  state: EvidenceState;
  reason: string | null;
}
export interface BeautyRecipe {
  lipColor: string;
  lipIntensity: number;
  blushColor: string;
  blushIntensity: number;
}
export interface BeautyPreview {
  id: string;
  lookId: string;
  beautyRevision: number;
  performerId: string;
  faceCaptureVersion: number;
  imageUrl: string;
  assetId: string | null;
  sourceImageUrl: string;
  operation: string;
  provenance: "recorded_provider" | "live_provider";
  createdAt: string;
  inputHash: string;
  estimatedUnits: number;
  inspectionNotes: string;
}
export interface BeautyApproval {
  id: string;
  lookId: string;
  beautyRevision: number;
  previewId: string;
  performerId: string;
  faceCaptureVersion: number;
  sceneIds: string[];
  approvedBy: string;
  rationale: string;
  approvedAt: string;
  state: EvidenceState;
  reason: string | null;
}
export interface BeautyLook {
  revision: number;
  recipe: BeautyRecipe;
  previews: BeautyPreview[];
  approvals: BeautyApproval[];
  reviewReason: string | null;
}
export interface Look {
  id: string;
  title: string;
  characterId: string;
  performerId: string;
  revision: number;
  sceneIds: string[];
  storyDays: number[];
  unitIds: string[];
  category: GarmentCategory;
  silhouette: string;
  makeup: {
    notes: string;
    palette: string[];
    skinSmoothStrength: 0;
    skinSmoothColorIntensity: 0;
  };
  hair: string;
  accessories: string;
  preparationMinutes: number | null;
  preparationEvidence: "unknown" | "estimate" | "observed";
  previews: Preview[];
  approvals: AppearanceApproval[];
  note: string;
  reviewReason: string | null;
  beauty?: BeautyLook;
}
export interface PhysicalUnit {
  id: string;
  code: string;
  name: string;
  category: GarmentCategory;
  imageUrl: string | null;
  assetId: string | null;
  color: string;
  material: string;
  supplier: string;
  ownership: "owned" | "rental";
  location: string;
  condition: string;
  status: "available" | "unavailable" | "maintenance";
  measurements: {
    chestCm: number | null;
    waistCm: number | null;
    lengthCm: number | null;
  };
  fitting: {
    performerId: string | null;
    status:
      "not_measured" | "provisional" | "scheduled" | "confirmed" | "alteration";
    evidence: string;
    provenance: Provenance;
  };
  availability: {
    from: string;
    to: string;
    source: string;
    checkedAt: string;
    confirmed: boolean;
    provenance: Provenance;
  };
  priceCents: number;
  priceSource: string;
  priceValidUntil: string;
  substitutionFamily: string | null;
  approvedSubstituteIds: string[];
  version: number;
}
export interface Allocation {
  id: string;
  occurrenceId: string;
  lookId: string;
  performerId: string;
  unitId: string;
  start: string;
  end: string;
  state: "proposed" | "allocated" | "blocked" | "historical";
  reason: string | null;
  sourceRevision: number;
}
export interface Transition {
  id: string;
  performerId: string;
  fromOccurrenceId: string;
  toOccurrenceId: string;
  minutes: number | null;
  evidence: "unknown" | "estimate" | "observed";
  crewResource: string | null;
  crewCapacity: number;
  note: string;
}
export interface AllocationFinding {
  id: string;
  severity: "conflict" | "unverified" | "info";
  code: string;
  message: string;
  unitIds: string[];
  occurrenceIds: string[];
  lookIds: string[];
}
export interface AllocationResult {
  status:
    | "FEASIBLE"
    | "OPTIMAL"
    | "INFEASIBLE"
    | "UNKNOWN"
    | "TIME_LIMIT"
    | "INVALID_INPUT";
  sourceRevision: number;
  inputHash: string;
  assignments: Allocation[];
  findings: AllocationFinding[];
  totalCostCents: number;
  independentlyChecked: boolean;
  solver: string;
  policy: string;
  createdAt: string;
}
export interface SourcingRequest {
  id: string;
  unitIds: string[];
  supplier: string;
  from: string;
  to: string;
  status:
    | "draft"
    | "requested"
    | "held"
    | "confirmed"
    | "declined"
    | "received"
    | "returned"
    | "cancelled";
  sourceRevision: number;
  quoteCents: number;
  quoteValidUntil: string;
  provenance: "synthetic" | "manual";
  operator: string | null;
  evidence: string | null;
  externalReference: string | null;
  updatedAt: string;
  stale: boolean;
  note: string;
}
export interface ChangeImpact {
  lookIds: string[];
  sceneIds: string[];
  occurrenceIds: string[];
  allocationIds: string[];
  sourcingIds: string[];
  packIds: string[];
  invalidatedApprovalIds: string[];
  preservedApprovalIds: string[];
  invalidatedBeautyApprovalIds?: string[];
  preservedBeautyApprovalIds?: string[];
  explanation: string[];
  preserved: string[];
}
export interface RepairOption {
  id: string;
  label: string;
  replacementUnitId: string | null;
  replacementPerformerId: string | null;
  costDeltaCents: number;
  requiresVisualApproval: boolean;
  findings: AllocationFinding[];
  feasible: boolean;
  explanation: string;
}
export interface RepairProposal {
  id: string;
  kind: "garment_unavailable" | "recast";
  baseRevision: number;
  inputHash: string;
  status: "proposed" | "adopted" | "stale";
  subjectId: string;
  replacementId: string | null;
  impact: ChangeImpact;
  options: RepairOption[];
  createdAt: string;
  adoptedAt: string | null;
  seeded: boolean;
}
export interface CrewPack {
  id: string;
  title: string;
  occurrenceIds: string[];
  sourceRevision: number;
  generatedAt: string;
  state: "current" | "superseded";
  warnings: string[];
  snapshot: {
    title: string;
    looks: Look[];
    performers: Performer[];
    units: PhysicalUnit[];
    occurrences: Occurrence[];
    scenes: Scene[];
    sourcing: SourcingRequest[];
    characters?: Character[];
    allocations?: Allocation[];
    transitions?: Transition[];
    currency?: Production["currency"];
    timeZone?: string;
    budgetCents?: number;
    script?: ScriptRevision | null;
  };
}
export interface DomainEvent {
  id: string;
  type: string;
  actor: string;
  at: string;
  revision: number;
  summary: string;
  provenance: Provenance;
}
export interface Production {
  id: string;
  title: string;
  subtitle: string;
  mode: ProductionMode;
  currency: "GBP" | "USD" | "EUR" | "INR";
  timeZone: string;
  budgetCents: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  fixture: boolean;
  script: ScriptRevision | null;
  scenes: Scene[];
  occurrences: Occurrence[];
  performers: Performer[];
  characters: Character[];
  looks: Look[];
  units: PhysicalUnit[];
  allocations: Allocation[];
  transitions: Transition[];
  allocationResult: AllocationResult | null;
  sourcing: SourcingRequest[];
  proposals: RepairProposal[];
  packs: CrewPack[];
  events: DomainEvent[];
}

export type ProductionCommand =
  | {
      type: "update_production";
      title?: string;
      subtitle?: string;
      budgetCents?: number;
      mode?: ProductionMode;
      timeZone?: string;
    }
  | {
      type: "review_scene";
      sceneId: string;
      title: string;
      storyDay: number;
      requirements: SceneRequirement[];
    }
  | {
      type: "adopt_script";
      script: ScriptRevision;
      scenes: Scene[];
      characters: Character[];
    }
  | { type: "update_occurrence"; occurrence: Occurrence }
  | { type: "add_performer"; performer: Performer }
  | { type: "add_character"; character: Character }
  | {
      type: "update_performer";
      performerId: string;
      name?: string;
      imageUrl?: string;
      assetId?: string;
      consent?: Performer["consent"];
    }
  | { type: "withdraw_consent"; performerId: string }
  | {
      type: "update_face_capture";
      performerId: string;
      faceCapture: FaceCapture;
    }
  | { type: "withdraw_face_consent"; performerId: string }
  | {
      type: "update_direction";
      characterId: string;
      text: string;
      essential: string[];
      approvedBy: string;
    }
  | {
      type: "update_look";
      lookId: string;
      unitIds?: string[];
      category?: GarmentCategory;
      silhouette?: string;
      makeupNotes?: string;
      hair?: string;
      accessories?: string;
      note?: string;
      preparationMinutes?: number | null;
    }
  | { type: "create_look"; look: Look }
  | { type: "add_preview"; lookId: string; preview: Preview }
  | {
      type: "approve_look";
      lookId: string;
      previewId: string;
      approvedBy: string;
      rationale: string;
    }
  | { type: "update_beauty"; lookId: string; recipe: BeautyRecipe }
  | { type: "add_beauty_preview"; lookId: string; preview: BeautyPreview }
  | {
      type: "approve_beauty";
      lookId: string;
      previewId: string;
      approvedBy: string;
      rationale: string;
    }
  | { type: "add_unit"; unit: PhysicalUnit }
  | {
      type: "update_unit";
      unitId: string;
      status?: PhysicalUnit["status"];
      location?: string;
      priceCents?: number;
      priceSource?: string;
      priceValidUntil?: string;
      condition?: string;
      availability?: PhysicalUnit["availability"];
      fitting?: PhysicalUnit["fitting"];
      imageUrl?: string;
      assetId?: string;
    }
  | { type: "solve_allocation" }
  | { type: "adopt_allocation"; inputHash: string }
  | {
      type: "create_sourcing";
      unitIds: string[];
      supplier: string;
      from: string;
      to: string;
      note: string;
    }
  | {
      type: "update_sourcing";
      requestId: string;
      status: SourcingRequest["status"];
      operator: string;
      evidence: string;
      externalReference: string;
      provenance: "synthetic" | "manual";
    }
  | {
      type: "propose_change";
      kind: RepairProposal["kind"];
      subjectId: string;
      replacementId?: string;
      seeded: boolean;
    }
  | { type: "adopt_repair"; proposalId: string; optionId: string }
  | { type: "create_pack"; occurrenceIds: string[]; title: string }
  | { type: "update_transition"; transition: Transition };

export type JobState =
  | "queued"
  | "preparing"
  | "submitting"
  | "ambiguous"
  | "polling"
  | "storing"
  | "succeeded"
  | "failed"
  | "cancelled";
export interface PreviewJob {
  id: string;
  projectId: string;
  lookId: string;
  state: JobState;
  kind?: "garment" | "beauty";
  createdAt: string;
  updatedAt: string;
  message: string;
  estimatedUnits: number;
  resultPreviewId: string | null;
  errorCode: string | null;
}
export interface AppConfig {
  database: boolean;
  storage: boolean;
  youcam: boolean;
  extraction: boolean;
  generationPaused: boolean;
  dailyJobLimit: number;
  ownerDailyJobLimit: number;
  recordedPreviews: number;
  recordedBeautyPreviews?: number;
}
export interface Readiness {
  appearanceApproved: number;
  looksTotal: number;
  blockedAllocations: number;
  beautyApproved: number;
  beautyTotal: number;
  pendingSourcing: number;
  pendingFittings: number;
  currentPacks: number;
  nextAction: string;
  ready: boolean;
}
