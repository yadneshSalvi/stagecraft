import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { ProjectList, ProductionEntry } from "@/components/production-entry";
export const metadata: Metadata = { title: "My productions" };
export default function ProductionsPage() {
  return (
    <>
      <header className="site-header">
        <Brand />
        <Link href="/evidence">Evidence & privacy</Link>
      </header>
      <main id="main-content" className="productions-home">
        <p className="eyebrow">YOUR PRIVATE WORKSPACE</p>
        <h1>The working books.</h1>
        <p className="page-deck">
          A place for every story you’re bringing to life.
        </p>
        <ProjectList />
        <div className="new-project-block">
          <h2>Set another scene.</h2>
          <ProductionEntry compact />
        </div>
      </main>
    </>
  );
}
