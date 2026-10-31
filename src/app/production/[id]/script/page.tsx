import { Suspense } from "react";
import { ScriptBreakdown } from "@/components/script-breakdown";
export default function Page() {
  return (
    <Suspense fallback={<p role="status">Opening the script…</p>}>
      <ScriptBreakdown />
    </Suspense>
  );
}
