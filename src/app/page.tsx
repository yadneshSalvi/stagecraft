import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Layers3,
  ScanLine,
  GitBranch,
  ShieldCheck,
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
          <Link href="#inside">The working book</Link>
          <Link href="/evidence">Behind the scenes</Link>
          <Link className="nav-workspace" href="/productions">
            My productions
            <ArrowRight size={15} />
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
            <span className="hero-image-caption">
              THE LIGHTS ARE UP. LET’S MAKE A STORY.
            </span>
          </div>
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="small-line" /> FROM FIRST READING TO FINAL
              CURTAIN
            </p>
            <h1>
              A story in
              <br />
              every <em>look.</em>
            </h1>
            <p className="hero-deck">
              The script. The cast. The coat that carries three scenes.
              <br className="desktop-break" /> Bring every detail into one
              production.
            </p>
            <ProductionEntry />
            <div className="hero-footnote">
              <span className="youcam-mark">✳</span>
              <span>
                Actor-specific costume + makeup previews
                <br />
                <strong>Powered by YouCam AI</strong>
              </span>
            </div>
          </div>
          <a href="#inside" className="hero-scroll">
            <ArrowDown size={14} /> EXPLORE THE WORKING BOOK
          </a>
        </section>
        <section id="inside" className="landing-intro">
          <div>
            <p className="eyebrow">ONE PRODUCTION. MANY MOVING PARTS.</p>
            <h2>
              Keep the vision.
              <br />
              <em>Hold the details.</em>
            </h2>
          </div>
          <p>
            A beautiful look is only the beginning. STAGECRAFT connects creative
            intent to exact garments, scene commitments, and the people
            preparing them. When something changes, you can see what needs
            attention—and what still holds.
          </p>
        </section>
        <section className="landing-workbook" aria-labelledby="sample-title">
          <div className="workbook-head">
            <div>
              <p className="eyebrow">
                OPEN THE EXAMPLE / A FICTIONAL PRODUCTION
              </p>
              <h2 id="sample-title">The Last Light</h2>
              <p>Five characters. Seven scenes. One unmistakable coat.</p>
            </div>
            <span className="mono">A WORKING BOOK IN THREE ACTS</span>
          </div>
          <div className="landing-cast">
            {[
              { id: "ada", name: "Nora", desc: "The return" },
              { id: "theo", name: "Elias", desc: "The keeper" },
              { id: "mina", name: "Mae", desc: "The witness" },
              { id: "jules", name: "Julian", desc: "The offer" },
              { id: "ruth", name: "Ruth", desc: "The memory" },
            ].map((cast, index) => (
              <div key={cast.id} className="landing-cast-person">
                <Photo
                  src={`/assets/cast/${cast.id}.webp`}
                  alt={`${cast.name}, a synthetic adult cast source portrait`}
                />
                <div>
                  <span className="mono">
                    0{index + 1} / {cast.desc}
                  </span>
                  <h3>{cast.name}</h3>
                </div>
              </div>
            ))}
          </div>
          <div className="workbook-foot">
            <p>
              <ShieldCheck size={14} /> Synthetic cast and story. Genuine
              recorded YouCam previews inside.
            </p>
            <Link href="/evidence">
              See the evidence
              <ArrowRight size={14} />
            </Link>
          </div>
        </section>
        <LandingLookPair />
        <section className="landing-steps">
          <article>
            <span className="step-number">01</span>
            <Layers3 size={22} />
            <h3>Find the story in the script.</h3>
            <p>
              Review source-linked costume cues. Keep story chronology separate
              from the shooting schedule.
            </p>
          </article>
          <article>
            <span className="step-number">02</span>
            <ScanLine size={22} />
            <h3>See the look on your cast.</h3>
            <p>
              Inspect real garment and separate makeup previews. Approve each
              exact actor, source and recipe.
            </p>
          </article>
          <article>
            <span className="step-number">03</span>
            <GitBranch size={22} />
            <h3>Keep your footing when it changes.</h3>
            <p>
              Trace a missing garment or a recast through the production. Repair
              what depends on it, then brief the crew.
            </p>
          </article>
        </section>
        <section className="landing-end">
          <p className="eyebrow">
            YOUR NEXT PRODUCTION DESERVES A WORKING BOOK.
          </p>
          <h2>Let’s set the scene.</h2>
          <ProductionEntry compact />
        </section>
      </main>
      <footer className="site-footer">
        <Brand />
        <p>Made for the work behind the performance.</p>
        <Link href="/evidence">Evidence & privacy</Link>
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
