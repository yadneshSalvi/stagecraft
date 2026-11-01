import type { Metadata } from "next";
import { Brand } from "@/components/brand";
import { ProjectList, ProductionEntry } from "@/components/production-entry";
export const metadata: Metadata = { title: "My productions" };
export default function ProductionsPage() {
  return (
    <>
      <header className="site-header">
        <Brand />
      </header>
      <main id="main-content" className="productions-home">
        <h1>Productions</h1>
        <ProjectList />
        <div className="new-project-block">
          <ProductionEntry compact />
        </div>
      </main>
    </>
  );
}
