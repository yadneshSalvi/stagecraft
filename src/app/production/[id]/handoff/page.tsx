import { Suspense } from "react";
import { HandoffWorkspace } from "@/components/handoff-workspace";
export default function Page() {
  return (
    <Suspense fallback={<p role="status">Opening the handoff book…</p>}>
      <HandoffWorkspace />
    </Suspense>
  );
}
