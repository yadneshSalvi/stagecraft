import { getWorkflowMetadata, sleep } from "workflow";
import {
  bindRunStep,
  prepareFilesStep,
  submitPreviewStep,
  pollPreviewStep,
  interruptedStep,
  timeoutStep,
} from "./preview-steps";

export async function previewWorkflow(jobId: string) {
  "use workflow";
  const { workflowRunId } = getWorkflowMetadata();
  try {
    if (!(await bindRunStep(jobId, workflowRunId))) return;
    if (!(await prepareFilesStep(jobId))) return;
    if (!(await submitPreviewStep(jobId))) return;
    for (let attempt = 0; attempt < 40; attempt++) {
      await sleep(attempt < 3 ? "10s" : attempt < 10 ? "15s" : "30s");
      if ((await pollPreviewStep(jobId)) === "finished") return;
    }
    await timeoutStep(jobId);
  } catch {
    await interruptedStep(jobId, workflowRunId);
  }
}
