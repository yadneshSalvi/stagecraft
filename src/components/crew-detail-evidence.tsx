"use client";
import type { Look, Performer, Production } from "@/lib/types";
import {
  getCurrentDetailApproval,
  getCurrentDetailPreview,
} from "@/lib/domain/details";
import {
  displayApproval,
  displayFixtureText,
  displayInspectionNotes,
} from "@/lib/presentation-copy";
import { Badge, Photo } from "./ui";

export function CrewDetailEvidence({
  look,
  currentPerformer,
  frozenProject,
}: {
  look: Look;
  currentPerformer?: Performer;
  frozenProject: Production;
}) {
  const permitted = currentPerformer?.faceCapture?.consent.granted;
  return (
    <>
      {look.details?.map((detail) => {
        const preview = getCurrentDetailPreview(
          look,
          detail.kind,
          frozenProject,
        );
        const approval = getCurrentDetailApproval(
          look,
          detail.kind,
          frozenProject,
        );
        const name = detail.kind === "hair_color" ? "Hair colour" : "Necklace";
        return (
          <section
            className="crew-beauty-evidence crew-independent-detail"
            aria-label={`Separate ${name.toLowerCase()} evidence`}
            key={detail.kind}
          >
            <figure>
              <Photo
                natural
                priority
                src={permitted ? preview?.imageUrl : null}
                alt={`${look.title}, separate generated ${name.toLowerCase()} detail`}
              />
              <figcaption>
                {!permitted
                  ? "Permission withdrawn"
                  : preview
                    ? name
                    : `No ${name.toLowerCase()} preview`}
              </figcaption>
            </figure>
            <div>
              <div className="crew-beauty-title">
                <Badge tone={approval && permitted ? "success" : "warning"}>
                  {!permitted
                    ? "Permission missing"
                    : approval
                      ? "Approved"
                      : "Review needed"}
                </Badge>
              </div>
              <p>
                {detail.recipe.kind === "hair_color"
                  ? `Preset: ${detail.recipe.preset}`
                  : `Reference: ${displayFixtureText(frozenProject.detailReferences?.find((item) => item.id === (detail.recipe as { referenceId: string }).referenceId)?.name || "Necklace reference", frozenProject.fixture)}`}
              </p>
              {approval && (
                <p>
                  {displayApproval(approval).approvedBy} ·{" "}
                  {displayApproval(approval).rationale}
                </p>
              )}
              {preview?.inspectionNotes && (
                <small>{displayInspectionNotes(preview.inspectionNotes)}</small>
              )}
            </div>
          </section>
        );
      })}
    </>
  );
}
