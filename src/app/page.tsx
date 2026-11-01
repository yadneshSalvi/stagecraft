import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Layers3,
  ScanLine,
  GitBranch,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { ProductionEntry } from "@/components/production-entry";
import { Photo } from "@/components/ui";
import { LandingLookPair } from "@/components/landing-look-pair";

export default function HomePage() {
  return (
    <div className="landing">
      <header className="site-header">
        <Brand />
        <nav aria-label="Main navigation">
          <Link className="nav-workspace" href="/productions">
            My productions <ArrowRight size={15} />
          </Link>
        </nav>
      </header>
      <main id="main-content">
        <section className="landing-hero">
          <div className="hero-image">
            <Photo
              src="/assets/theatre-atmosphere.webp"
              alt="An empty theatre with a warmly lit stage and deep red curtains; AI-created scene-setting image"
              fit="cover"
              priority
              sizes="(max-width: 760px) 100vw, 69vw"
            />
          </div>
          <div className="hero-copy">
            <h1>
              A story in
              <br />
              every <em>look.</em>
            </h1>
            <p className="hero-deck">
              Script, cast, looks and wardrobe in one production.
            </p>
            <ProductionEntry />
            <p className="sponsor-credit">
              ✳ <span>Powered by YouCam</span>
            </p>
          </div>
          <a
            href="#inside"
            className="hero-scroll"
            aria-label="Explore the working book"
          >
            <ArrowDown size={20} />
          </a>
        </section>
        <section
          id="inside"
          className="landing-workbook"
          aria-labelledby="sample-title"
        >
          <div className="workbook-head">
            <h2 id="sample-title">The Last Light</h2>
          </div>
          <div className="landing-cast">
            {[
              { image: "nora-oxblood", name: "Nora" },
              { image: "elias-ivory", name: "Elias" },
              { image: "mae-midnight", name: "Mae" },
              { image: "julian-olive", name: "Julian" },
              { image: "ruth-ivory", name: "Ruth" },
            ].map((cast) => (
              <div key={cast.name} className="landing-cast-person">
                <Photo
                  src={`/examples/previews/${cast.image}.webp`}
                  alt={`${cast.name}, actual recorded YouCam costume preview on a synthetic adult source`}
                />
                <div>
                  <h3>{cast.name}</h3>
                </div>
              </div>
            ))}
          </div>
          <div className="workbook-foot">
            <ProductionEntry exampleOnly />
          </div>
        </section>
        <LandingLookPair />
        <section className="landing-steps" aria-label="Production workflow">
          <article>
            <Layers3 size={24} />
            <h3>Find the story.</h3>
          </article>
          <article>
            <ScanLine size={24} />
            <h3>See the look.</h3>
          </article>
          <article>
            <GitBranch size={24} />
            <h3>Follow the change.</h3>
          </article>
        </section>
      </main>
      <footer className="site-footer">
        <Brand />
        <Link href="/evidence">Evidence &amp; limits</Link>
        <a
          href="https://github.com/yadneshSalvi/stagecraft"
          target="_blank"
          rel="noreferrer"
        >
          Source code ↗
        </a>
      </footer>
    </div>
  );
}
