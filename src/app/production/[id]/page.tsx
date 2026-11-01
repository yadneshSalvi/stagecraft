import { ProductionBoard } from "@/components/production-board";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const initialUnitId =
    typeof query.change === "string" ? query.change : undefined;
  const initialCharacterId =
    typeof query.recast === "string" ? query.recast : undefined;
  const initialReplacementId =
    typeof query.performer === "string" ? query.performer : undefined;
  const refreshImpactOnOpen = query.impact === "refresh";
  return (
    <ProductionBoard
      key={`${initialUnitId || ""}:${initialCharacterId || ""}:${initialReplacementId || ""}:${refreshImpactOnOpen}`}
      initialUnitId={initialUnitId}
      initialCharacterId={initialCharacterId}
      initialReplacementId={initialReplacementId}
      refreshImpactOnOpen={refreshImpactOnOpen}
    />
  );
}
