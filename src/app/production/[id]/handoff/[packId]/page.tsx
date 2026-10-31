import { CrewPackView } from "@/components/crew-pack";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string; packId: string }>;
}) {
  const { packId } = await params;
  return <CrewPackView packId={packId} />;
}
