import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Brand } from "@/components/brand";
import garmentRecordings from "../../../public/examples/recorded-previews.json";
import reviewGarmentRecordings from "../../../public/examples/recorded-review-previews.json";
import makeupRecordings from "../../../public/examples/recorded-beauty-previews.json";
import reviewMakeupRecordings from "../../../public/examples/recorded-review-beauty-previews.json";
import detailRecordings from "../../../public/examples/recorded-detail-previews.json";
import "./round3.css";

export const metadata: Metadata = { title: "Evidence & limits" };
const repository = "https://github.com/yadneshSalvi/stagecraft/blob/main";
const recordings = [
  ...garmentRecordings.previews,
  ...reviewGarmentRecordings.previews,
  ...makeupRecordings.previews,
  ...reviewMakeupRecordings.previews,
  ...detailRecordings.previews,
];
const recordingUnits = recordings.reduce(
  (total, item) => total + item.estimatedUnits,
  0,
);
const measurements = [
  [
    "Full-act import",
    "8/8 cues grounded · 11.5 s",
    "script-import-review.json",
  ],
  [
    "Agent browser journey",
    "£125 allocation · ≤273 s",
    "own-script-browser-review.json",
  ],
  [
    "Library",
    "18 unit bindings · 12 recordings",
    "review-round2-production-verification.json",
  ],
  ["Domain benchmark", "10 runs · 7 scenes · 8 looks", "domain-benchmark.json"],
  ["AI critiques", "28 observations · 12 outputs", "../evaluation-ai.md"],
];

export default function EvidencePage() {
  return (
    <>
      <header className="site-header">
        <Brand />
        <nav aria-label="Evidence navigation">
          <Link href="/">Home</Link>
          <Link className="nav-workspace" href="/productions">
            My productions <ArrowRight size={15} />
          </Link>
        </nav>
      </header>
      <main id="main-content" className="evidence-page evidence-round3">
        <header>
          <h1>Evidence &amp; limits</h1>
        </header>
        <section className="evidence-intro">
          <div>
            <h2>A fictional production. Actual provider results.</h2>
            <p>Cast, script, wardrobe and quotes are fictional.</p>
            <p>Costume and beauty previews come from recorded YouCam tasks.</p>
            <p>Matching recordings are reused; fresh results remain private.</p>
          </div>
          <div className="evidence-facts">
            <div>
              <strong>{recordings.length}</strong>
              <span>Recorded YouCam tasks</span>
            </div>
            <div>
              <strong>{recordingUnits}</strong>
              <span>Units spent on this collection</span>
            </div>
            <div>
              <strong>4</strong>
              <span>Clothes V4 · Makeup VTO · Hair Color · Necklace</span>
            </div>
          </div>
        </section>
        <div className="evidence-reference-grid">
          <section className="evidence-block">
            <h2>Terms</h2>
            <dl className="evidence-definitions">
              <div>
                <dt>Approved</dt>
                <dd>One exact image; fit and stock still need confirmation.</dd>
              </div>
              <div>
                <dt>Example approval</dt>
                <dd>
                  A reversible demonstration decision, attributed to Example
                  reviewer.
                </dd>
              </div>
              <div>
                <dt>Working pack</dt>
                <dd>A frozen crew pack with open items.</dd>
              </div>
            </dl>
          </section>
          <section className="evidence-block">
            <h2>Known differences</h2>
            <ul className="evidence-notes">
              <li>Coats may render open or longer.</li>
              <li>Makeup smoothing and reshaping are set to zero.</li>
              <li>The Chocolate Brown preset renders plum.</li>
            </ul>
            <div className="evidence-links">
              {[
                ["docs/evaluation-ai.md", "AI evaluation"],
                ["docs/evaluation.md", "Workflow evaluation"],
                ["public/examples", "Recorded manifests"],
                ["docs/release-checklist.md", "Release checks"],
              ].map(([path, label]) => (
                <a
                  key={path}
                  href={`${path === "public/examples" ? repository.replace("/blob/", "/tree/") : repository}/${path}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {label}
                  <ExternalLink size={13} />
                </a>
              ))}
            </div>
          </section>
        </div>
        <section className="evidence-block">
          <h2>Measurements</h2>
          <dl className="evidence-measurements">
            {measurements.map(([label, value, file]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  <a
                    href={`${repository}/docs/evidence/${file}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {value}
                    <ExternalLink size={13} />
                  </a>
                </dd>
              </div>
            ))}
          </dl>
          <p>
            These are recorded software exercises, not measured crew time
            savings.
          </p>
        </section>
        <section className="evidence-block">
          <h2>Not measured</h2>
          <p>No human study, real fitting, supplier deal or time saving.</p>
        </section>
        <section className="evidence-block">
          <h2>Privacy</h2>
          <div className="privacy-grid">
            <div>
              <h3>Your browser workspace</h3>
              <p>Private to this browser; records expire after 30 days.</p>
            </div>
            <div>
              <h3>Processing</h3>
              <p>Images go to YouCam; permitted scripts go to the AI model.</p>
            </div>
            <div>
              <h3>Your data</h3>
              <p>Export or delete anytime in Settings.</p>
            </div>
            <div>
              <h3>Provider retention</h3>
              <p>YouCam’s own retention policy applies.</p>
              <a
                href="https://docs.makeupar.com/develop/file_retention_period"
                target="_blank"
                rel="noreferrer"
              >
                Retention policy <ExternalLink size={13} />
              </a>
            </div>
          </div>
        </section>
        <div className="button-row">
          <Link className="button button-primary" href="/productions">
            My productions <ArrowRight size={16} />
          </Link>
          <a
            className="button"
            href="https://github.com/yadneshSalvi/stagecraft"
            target="_blank"
            rel="noreferrer"
          >
            Source code <ExternalLink size={15} />
          </a>
        </div>
      </main>
    </>
  );
}
