import { ProductionProvider } from "@/components/production-context";
import { WorkspaceChrome } from "@/components/workspace-chrome";
export default async function ProductionLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <ProductionProvider id={id}>
      <WorkspaceChrome>{children}</WorkspaceChrome>
    </ProductionProvider>
  );
}
