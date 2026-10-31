"use client";
import { ArrowRight, Image as ImageIcon, ScanFace } from "lucide-react";
import type { BeautyPreview, Performer } from "@/lib/types";
import { provenanceLabel } from "@/lib/format";
import { Button, Photo } from "./ui";

export type BeautyView = "preview" | "source" | "compare";
export function BeautyImage({
  performer,
  preview,
  characterName,
  view,
  setView,
  onSource,
}: {
  performer?: Performer;
  preview?: BeautyPreview;
  characterName: string;
  view: BeautyView;
  setView: (view: BeautyView) => void;
  onSource: () => void;
}) {
  const face = performer?.faceCapture;
  const source = face?.consent.granted ? face.imageUrl : null;
  return (
    <>
      <div className="look-view-tabs">
        <div className="segmented" aria-label="Makeup image view">
          <button
            aria-pressed={view === "preview"}
            className={view === "preview" ? "active" : ""}
            disabled={!preview}
            onClick={() => setView("preview")}
          >
            Makeup preview
          </button>
          <button
            aria-pressed={view === "source"}
            className={view === "source" ? "active" : ""}
            onClick={() => setView("source")}
          >
            Face source
          </button>
          <button
            aria-pressed={view === "compare"}
            className={view === "compare" ? "active" : ""}
            disabled={!preview}
            onClick={() => setView("compare")}
          >
            Compare makeup
          </button>
        </div>
        <span className="mono">FACE / SEPARATE DETAIL</span>
      </div>
      {source ? (
        <div
          className={`look-image-stage beauty-image-stage ${view === "compare" ? "comparison-stage" : ""}`}
        >
          {view === "compare" && (
            <figure>
              <Photo
                original
                src={source}
                alt={`Original face source of ${performer?.name}`}
              />
              <figcaption>
                {face?.synthetic
                  ? "SYNTHETIC FACE SOURCE"
                  : "PERMITTED FACE SOURCE"}
              </figcaption>
            </figure>
          )}
          <figure>
            <Photo
              original
              priority
              src={view === "source" ? source : preview?.imageUrl || source}
              alt={
                view === "source"
                  ? `${performer?.name}, original face source`
                  : `${characterName}, ${preview ? "actual YouCam Makeup VTO result" : "face source awaiting makeup preview"}`
              }
            />
            <figcaption>
              {view === "source"
                ? face?.synthetic
                  ? "SYNTHETIC FACE SOURCE"
                  : "PERMITTED FACE SOURCE"
                : preview
                  ? `${provenanceLabel(preview.provenance).toUpperCase()} / MAKEUP`
                  : "FACE SOURCE · DETAIL NEEDED"}
            </figcaption>
          </figure>
        </div>
      ) : (
        <div className="beauty-source-empty">
          <ScanFace size={42} />
          <h2>The face deserves its own frame.</h2>
          <p>
            Add an independently permitted face source to inspect the makeup at
            useful detail.
          </p>
          <Button variant="primary" onClick={onSource}>
            Add a separate face source
            <ArrowRight size={15} />
          </Button>
        </div>
      )}
      <div className="look-image-footer">
        <span>
          <ImageIcon size={13} />
          Separate source and output. Garment and makeup approvals stay
          distinct.
        </span>
      </div>
    </>
  );
}
