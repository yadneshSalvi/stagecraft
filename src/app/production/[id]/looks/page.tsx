import { Suspense } from "react";
import { LooksStudio } from "@/components/looks-studio";
export default function Page() {
  return (
    <Suspense fallback={<p role="status">Opening the look studio…</p>}>
      <LooksStudio />
    </Suspense>
  );
}
