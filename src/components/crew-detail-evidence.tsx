"use client";
import type { Look, Performer, Production } from "@/lib/types";
import {
  getCurrentDetailApproval,
  getCurrentDetailPreview,
} from "@/lib/domain/details";
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
                priority
                src={permitted ? preview?.imageUrl : null}
                alt={`${look.title}, separate generated ${name.toLowerCase()} detail`}
              />
              <figcaption>
                {!permitted
                  ? "FACE PERMISSION WITHDRAWN"
                  : preview
                    ? `${preview.provenance === "recorded_provider" ? "RECORDED " : ""}YOUCAM ${name.toUpperCase()}`
                    : `${name.toUpperCase()} PREVIEW NEEDED`}
              </figcaption>
            </figure>
            <div>
              <div className="crew-beauty-title">
                <span className="mono">
                  {name.toUpperCase()} · R{detail.revision}
                  {preview ? ` · FACE ${preview.faceCaptureVersion}` : ""}
                </span>
                <Badge tone={approval && permitted ? "success" : "warning"}>
                  {!permitted
                    ? "Permission missing"
                    : approval
                      ? `${name} approved`
                      : "Review needed"}
                </Badge>
              </div>
              <p>
                {detail.recipe.kind === "hair_color"
                  ? `Requested colour preset: ${detail.recipe.preset}`
                  : `Exact reference: ${frozenProject.detailReferences?.find((item) => item.id === (detail.recipe as { referenceId: string }).referenceId)?.name || "Necklace reference"}`}
              </p>
              <p>
                {approval
                  ? `Approval at source revision: ${approval.approvedBy} · ${approval.rationale}`
                  : "This detail needs its own exact-output decision."}
              </p>
              {preview?.inspectionNotes && (
                <small>{preview.inspectionNotes}</small>
              )}
            </div>
          </section>
        );
      })}
    </>
  );
}
