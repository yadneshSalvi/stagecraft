"use client";
import { ArrowRight, ScanFace } from "lucide-react";
import type { BeautyPreview, Performer } from "@/lib/types";
import { Button, Photo } from "./ui";
import { ImageComparison } from "./image-comparison";

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
            Preview
          </button>
          <button
            aria-pressed={view === "source"}
            className={view === "source" ? "active" : ""}
            onClick={() => setView("source")}
          >
            Source
          </button>
          <button
            aria-pressed={view === "compare"}
            className={view === "compare" ? "active" : ""}
            disabled={!preview}
            onClick={() => setView("compare")}
          >
            Compare
          </button>
        </div>
      </div>
      {source ? (
        <div className="face-image-stage">
          {view === "compare" && preview ? (
            <ImageComparison
              sourceUrl={source}
              previewUrl={preview.imageUrl}
              sourceAlt={`${performer?.name}, original face source`}
              previewAlt={`${characterName}, actual YouCam Makeup VTO result`}
              aspectRatio={4 / 5}
            />
          ) : (
            <Photo
              original
              natural
              aspectRatio={4 / 5}
              priority
              src={view === "source" ? source : preview?.imageUrl || source}
              alt={
                view === "source"
                  ? `${performer?.name}, original face source`
                  : `${characterName}, ${preview ? "actual YouCam Makeup VTO result" : "face source awaiting makeup preview"}`
              }
            />
          )}
        </div>
      ) : (
        <div className="beauty-source-empty">
          <ScanFace size={42} />
          <h2>Face source needed</h2>
          <Button variant="primary" onClick={onSource}>
            Add face source
            <ArrowRight size={15} />
          </Button>
        </div>
      )}
    </>
  );
}
