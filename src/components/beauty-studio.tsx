"use client";
import { useCallback, useRef, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import type { Look } from "@/lib/types";
import {
  getCurrentBeautyApproval,
  getCurrentBeautyPreview,
} from "@/lib/domain/selectors";
import { revision } from "@/lib/format";
import { useProduction } from "./production-context";
import { usePreviewJob } from "./use-preview-job";
import { BeautyInspector } from "./beauty-inspector";
import { BeautyApprovalDialog } from "./beauty-approval-dialog";
import { BeautyImage, type BeautyView } from "./beauty-image";
import { FaceSourceDialog } from "./face-source-dialog";
import { Badge, Button, Notice } from "./ui";

export function BeautyStudio({ look }: { look: Look }) {
  const { project, busy, setError } = useProduction();
  const character = project.characters.find(
    (item) => item.id === look.characterId,
  );
  const performer = project.performers.find(
    (item) => item.id === look.performerId,
  );
  const preview = getCurrentBeautyPreview(look);
  const approval = getCurrentBeautyApproval(look);
  const [view, setView] = useState<BeautyView>(preview ? "preview" : "source");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourcePerformerId, setSourcePerformerId] = useState(look.performerId);
  const openSource = () => {
    setSourcePerformerId(look.performerId);
    setSourceOpen(true);
  };
  const [approving, setApproving] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);
  const viewChosen = useRef(false);
  const showPreview = useCallback(() => {
    if (!viewChosen.current) setView("preview");
  }, []);
  const selectView = (next: "source" | "preview" | "compare") => {
    viewChosen.current = true;
    setView(next);
  };
  const state = usePreviewJob(look.id, "beauty", showPreview);
  return (
    <>
      <section className="look-canvas beauty-canvas">
        <header className="look-heading">
          <div>
            <p className="eyebrow">
              {look.title} / MAKEUP {revision(look.beauty?.revision || 1)}
            </p>
            <h1>{character?.name || "Character makeup"}</h1>
            <p>
              {performer?.name || "Assign a performer"}
              <span>·</span>
              {look.sceneIds
                .map(
                  (id) =>
                    project.scenes.find((scene) => scene.id === id)?.number,
                )
                .filter(Boolean)
                .map((number) => `SC ${number}`)
                .join(" / ")}
            </p>
          </div>
          <Badge tone={approval ? "success" : "warning"}>
            {approval
              ? "Makeup approved"
              : preview
                ? "Makeup review needed"
                : "Makeup detail needed"}
          </Badge>
        </header>
        <BeautyImage
          performer={performer}
          preview={preview}
          characterName={character?.name || "Character"}
          view={view}
          setView={selectView}
          onSource={openSource}
        />
        {look.beauty?.reviewReason && (
          <Notice tone="warning" title="The makeup detail needs review.">
            {look.beauty.reviewReason}
          </Notice>
        )}
        {preview && (
          <details className="inspection-notes">
            <summary>What to inspect in the makeup detail</summary>
            <p>
              {preview.inspectionNotes ||
                "Compare lip edges, blush placement, colour, skin texture and identity cues against the independent face source."}
            </p>
            <p className="muted">
              Smoothing and lip reshaping are set to zero. Generated pixels may
              still differ; inspect the actual result before approving.
            </p>
          </details>
        )}
        <section className="appearance-approval">
          <div>
            <span className="eyebrow">THE MAKEUP DECISION</span>
            <h3>
              {approval
                ? "Approved for this face and these scenes."
                : "Does this palette carry the character?"}
            </h3>
            <p>
              {approval
                ? `${approval.approvedBy} · ${approval.rationale}`
                : "Review the exact face source, makeup recipe and result as a separate creative decision."}
            </p>
          </div>
          <Button
            variant={approval ? "default" : "primary"}
            disabled={!preview || busy}
            onClick={() => {
              setTargetId(preview?.id || null);
              setError(null);
              setApproving(true);
            }}
          >
            {approval ? (
              <>
                <Check size={16} />
                Review makeup approval
              </>
            ) : (
              <>
                Approve makeup detail
                <ArrowRight size={15} />
              </>
            )}
          </Button>
        </section>
        <details className="look-history">
          <summary>
            Makeup evidence history{" "}
            <span className="mono">
              {look.beauty?.previews.length || 0} OUTPUTS ·{" "}
              {look.beauty?.approvals.length || 0} DECISIONS
            </span>
          </summary>
          {look.beauty?.approvals.map((entry) => (
            <div key={entry.id}>
              <Badge tone={entry.state === "current" ? "success" : "neutral"}>
                {entry.state.replaceAll("_", " ")}
              </Badge>
              <p>
                {entry.approvedBy} · makeup {revision(entry.beautyRevision)} ·
                face capture {entry.faceCaptureVersion}
              </p>
              <p className="muted">
                {entry.rationale}
                {entry.reason ? ` · ${entry.reason}` : ""}
              </p>
            </div>
          ))}
          {!look.beauty?.approvals.length && (
            <p className="muted">No makeup approval has been recorded.</p>
          )}
        </details>
      </section>
      <BeautyInspector
        key={`${look.id}-${look.beauty?.revision || 0}`}
        look={look}
        state={{
          ...state,
          generate: (mode) => {
            viewChosen.current = false;
            return state.generate(mode);
          },
        }}
        onSource={openSource}
      />
      <FaceSourceDialog
        open={sourceOpen}
        onClose={() => setSourceOpen(false)}
        performerId={sourcePerformerId}
      />
      <BeautyApprovalDialog
        look={look}
        open={approving}
        onClose={() => setApproving(false)}
        targetId={targetId}
      />
    </>
  );
}
