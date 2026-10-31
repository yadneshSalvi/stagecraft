"use client";
import type { Look, Performer } from "@/lib/types";
import {
  getCurrentBeautyApproval,
  getCurrentBeautyPreview,
} from "@/lib/domain/selectors";
import { revision } from "@/lib/format";
import { Badge, Photo } from "./ui";

export function CrewBeautyEvidence({
  look,
  currentPerformer,
}: {
  look: Look;
  currentPerformer?: Performer;
}) {
  if (!look.beauty)
    return (
      <p className="crew-beauty-unrendered">
        Makeup is text direction only; no rendered makeup detail is part of this
        frozen look.
      </p>
    );
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
          priority
          src={permitted ? preview?.imageUrl : null}
          alt={`${look.title}: separate generated makeup detail`}
        />
        <figcaption>
          {!permitted
            ? "FACE PERMISSION WITHDRAWN"
            : preview
              ? `${preview.provenance === "recorded_provider" ? "RECORDED " : ""}YOUCAM MAKEUP`
              : "MAKEUP PREVIEW NEEDED"}
        </figcaption>
      </figure>
      <div>
        <div className="crew-beauty-title">
          <span className="mono">
            MAKEUP {revision(look.beauty.revision)}
            {preview ? ` · FACE ${preview.faceCaptureVersion}` : ""}
          </span>
          <Badge tone={approval && permitted ? "success" : "warning"}>
            {!permitted
              ? "Permission missing"
              : approval
                ? "Makeup approved"
                : "Makeup not approved"}
          </Badge>
        </div>
        <p>
          {approval
            ? `Approval at source revision: ${approval.approvedBy} · ${approval.rationale}`
            : "The makeup detail needs its own exact-output approval."}
        </p>
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
        <small>
          Matte lip and blush. Smoothing and reshaping set to zero. Provider
          intensity is not a physical product amount.
        </small>
      </div>
    </section>
  );
}
