import type {
  FaceCapture,
  GarmentCategory,
  Performer,
  PhysicalUnit,
} from "./types";

export type LibraryPerformer = Pick<
  Performer,
  "id" | "name" | "imageUrl" | "synthetic"
> & {
  faceCapture?: Pick<FaceCapture, "imageUrl" | "synthetic">;
};
export type LibraryUnit = Pick<
  PhysicalUnit,
  | "id"
  | "code"
  | "name"
  | "category"
  | "imageUrl"
  | "material"
  | "color"
  | "priceCents"
>;
export interface LibraryReadyPair {
  performerId: string;
  unitId: string;
  category: GarmentCategory;
  previewImageUrl: string;
}
export interface LibraryPairSuggestion extends LibraryReadyPair {
  change: "garment" | "performer" | "both";
  projectPerformerId?: string;
  projectUnitId?: string;
}
export type LibrarySelectionReason =
  | "ready"
  | "no_recording"
  | "unverified_lineage"
  | "source_unavailable"
  | "permission_required";
export interface LibrarySelection {
  performerId: string;
  unitId: string;
  category: GarmentCategory;
  ready: boolean;
  reason: LibrarySelectionReason;
  message: string;
  previewImageUrl?: string;
  suggestions: LibraryPairSuggestion[];
}
export interface LibraryProjectBindings {
  revision: number;
  performerBindings: { performerId: string; libraryPerformerId: string }[];
  unitBindings: { unitId: string; libraryUnitId: string }[];
}
export interface LibraryCatalog {
  performers: LibraryPerformer[];
  units: LibraryUnit[];
  readyPairs: LibraryReadyPair[];
  project?: LibraryProjectBindings;
  selection?: LibrarySelection;
}
