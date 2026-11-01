"use client";
import type { Look, Performer } from "@/lib/types";
import {
  getCurrentBeautyApproval,
  getCurrentBeautyPreview,
} from "@/lib/domain/selectors";
import { displayApproval } from "@/lib/presentation-copy";
import { Badge, Photo } from "./ui";

export function CrewBeautyEvidence({
  look,
  currentPerformer,
}: {
  look: Look;
  currentPerformer?: Performer;
}) {
  if (!look.beauty) return null;
  const preview = getCurrentBeautyPreview(look);
  const approval = getCurrentBeautyApproval(look);
  const permitted = currentPerformer?.faceCapture?.consent.granted;
  return (
    <section
      className="crew-beauty-evidence"
      aria-label="Separate makeup evidence"
    >
      <figure>
        <Photo
          natural
          priority
          src={permitted ? preview?.imageUrl : null}
          alt={`${look.title}: separate generated makeup detail`}
        />
        <figcaption>
          {!permitted
            ? "Permission withdrawn"
            : preview
              ? "Makeup"
              : "No makeup preview"}
        </figcaption>
      </figure>
      <div>
        <div className="crew-beauty-title">
          <Badge tone={approval && permitted ? "success" : "warning"}>
            {!permitted
              ? "Permission missing"
              : approval
                ? "Approved"
                : "Not approved"}
          </Badge>
        </div>
        {approval && (
          <p>
            {displayApproval(approval).approvedBy} ·{" "}
            {displayApproval(approval).rationale}
          </p>
        )}
        <div className="crew-palette">
          <span>
            <i style={{ background: look.beauty.recipe.lipColor }} />
            Lip {look.beauty.recipe.lipColor} ·{" "}
            {look.beauty.recipe.lipIntensity}%
          </span>
          <span>
            <i style={{ background: look.beauty.recipe.blushColor }} />
            Blush {look.beauty.recipe.blushColor} ·{" "}
            {look.beauty.recipe.blushIntensity}%
          </span>
        </div>
        <small>Matte lip and blush.</small>
      </div>
    </section>
  );
}
