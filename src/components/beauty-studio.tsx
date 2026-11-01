"use client";
import { useCallback, useRef, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import type { Look } from "@/lib/types";
import {
  getCurrentBeautyApproval,
  getCurrentBeautyPreview,
} from "@/lib/domain/selectors";
import {
  displayApproval,
  displayInspectionNotes,
} from "@/lib/presentation-copy";
import { appearanceIntentHash } from "@/lib/domain/lineage";
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
  const inspectionNotes = displayInspectionNotes(preview?.inspectionNotes);
  const [viewOverride, setView] = useState<BeautyView | null>(null);
  const view: BeautyView = !preview ? "source" : viewOverride || "preview";
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourcePerformerId, setSourcePerformerId] = useState(look.performerId);
  const openSource = () => {
    setSourcePerformerId(look.performerId);
    setSourceOpen(true);
  };
  const [approving, setApproving] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [targetIntent, setTargetIntent] = useState<string | null>(null);
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
            <h2>{character?.name || "Makeup"}</h2>
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
          <div className="appearance-approval detail-approval-action">
            <Badge tone={approval ? "success" : "warning"}>
              {approval ? "Approved" : preview ? "To review" : "No preview"}
            </Badge>
            <Button
              variant={approval ? "default" : "primary"}
              disabled={!preview || busy}
              onClick={() => {
                setTargetId(preview?.id || null);
                setTargetIntent(appearanceIntentHash(project, [look.id]));
                setView("preview");
                setError(null);
                setApproving(true);
              }}
            >
              {approval ? (
                <>
                  <Check size={16} />
                  Review approval
                </>
              ) : (
                <>
                  Approve makeup
                  <ArrowRight size={15} />
                </>
              )}
            </Button>
          </div>
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
          <Notice tone="warning" title="Needs re-review">
            {look.beauty.reviewReason}
          </Notice>
        )}
        {inspectionNotes && (
          <details className="inspection-notes">
            <summary>Inspection notes</summary>
            <p>{inspectionNotes}</p>
          </details>
        )}
        <details className="look-history">
          <summary>History</summary>
          {look.beauty?.approvals.map((entry) => (
            <div key={entry.id}>
              <Badge tone={entry.id === approval?.id ? "success" : "neutral"}>
                {entry.id === approval?.id
                  ? "Current approval"
                  : entry.state === "current"
                    ? "Earlier output"
                    : entry.state.replaceAll("_", " ")}
              </Badge>
              <p>{displayApproval(entry).approvedBy}</p>
              <p className="muted">
                {displayApproval(entry).rationale}
                {entry.reason ? ` · ${entry.reason}` : ""}
              </p>
            </div>
          ))}
          {!look.beauty?.approvals.length && (
            <p className="muted">No decisions yet.</p>
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
        targetIntent={targetIntent}
      />
    </>
  );
}
