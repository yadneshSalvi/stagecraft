import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ExternalLink, FileText, LockKeyhole } from "lucide-react";
import { Brand } from "@/components/brand";
import garmentRecordings from "../../../public/examples/recorded-previews.json";
import reviewGarmentRecordings from "../../../public/examples/recorded-review-previews.json";
import makeupRecordings from "../../../public/examples/recorded-beauty-previews.json";
import reviewMakeupRecordings from "../../../public/examples/recorded-review-beauty-previews.json";
import detailRecordings from "../../../public/examples/recorded-detail-previews.json";
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
export default function EvidencePage() {
  return (
    <>
      <header className="site-header">
        <Brand />
        <nav aria-label="Evidence navigation">
          <Link href="/">The working book</Link>
          <Link className="nav-workspace" href="/productions">
            My productions
            <ArrowRight size={15} />
          </Link>
        </nav>
      </header>
      <main id="main-content" className="evidence-page">
        <header>
          <p className="eyebrow">BEHIND THE SCENES / THE EVIDENCE BOOK</p>
          <h1>
            A clear line between
            <br />
            the image and the evidence.
          </h1>
          <p>
            STAGECRAFT is built to make consequential creative and operational
            decisions inspectable. Here is what the example demonstrates, where
            its images come from, and what it does not establish.
          </p>
        </header>
        <section className="evidence-intro">
          <div>
            <p className="eyebrow">THE LAST LIGHT</p>
            <h2>
              A fictional production.
              <br />
              <em>Actual provider results.</em>
            </h2>
            <p>
              The cast, script, wardrobe inventory, quotes, and disruption
              scenarios are synthetic fixtures. Actual YouCam tasks supply the
              costume, makeup, hair colour and necklace images. The continuity
              wall follows those images across story days; current visual
              approvals determine which garments the allocation can choose.
              Recorded results are reused without a new paid request.
            </p>
          </div>
          <div className="evidence-facts">
            <div>
              <strong>{recordings.length}</strong>
              <span>
                Successful recorded provider tasks, each with source, transport
                and output hashes in the public manifests.
              </span>
            </div>
            <div>
              <strong>{recordingUnits}</strong>
              <span>
                Provider units for the recorded collection. Fresh workflow
                checks are accounted for separately.
              </span>
            </div>
            <div>
              <strong>4</strong>
              <span>
                YouCam operations: Clothes V4, Makeup VTO, Hair Color V2 and
                Necklace V2. Each detail has its own review and approval.
              </span>
            </div>
          </div>
        </section>
        <section className="evidence-block">
          <h2>Read the labels literally.</h2>
          <div
            className="evidence-table"
            tabIndex={0}
            role="region"
            aria-label="Evidence label definitions"
          >
            <table>
              <thead>
                <tr>
                  <th>Label</th>
                  <th>What it means</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Synthetic sample</td>
                  <td>
                    An AI-created adult portrait, garment reference, or original
                    fictional production fixture. It is not a real performer,
                    physical fitting, or supplier stock confirmation.
                  </td>
                </tr>
                <tr>
                  <td>Recorded YouCam</td>
                  <td>
                    A genuine, previously completed provider result attached
                    only when its exact body or face source and applicable
                    garment or accessory references and effect settings match.
                    It has not been newly generated for each visitor.
                  </td>
                </tr>
                <tr>
                  <td>Fresh YouCam</td>
                  <td>
                    A fresh task completed through the application. The result
                    is stored privately and remains subject to your visual
                    review.
                  </td>
                </tr>
                <tr>
                  <td>Appearance approved</td>
                  <td>
                    A named operator approved one exact output, performer,
                    recipe, creative intent and scene scope. Costume, makeup,
                    hair and accessory approvals are independent. Approval does
                    not confirm fit, movement, comfort, stock or dressing time.
                  </td>
                </tr>
                <tr>
                  <td>Example decision</td>
                  <td>
                    An opt-in, reversible decision attributed to Example
                    reviewer (sample decision). New examples have no approvals;
                    this action demonstrates selective invalidation without
                    implying a human designer reviewed the images.
                  </td>
                </tr>
                <tr>
                  <td>Manual supplier record</td>
                  <td>
                    An operator entered an external response and evidence.
                    STAGECRAFT has no live rental merchant integration and does
                    not send sourcing messages automatically.
                  </td>
                </tr>
                <tr>
                  <td>Working pack</td>
                  <td>
                    A frozen crew document with unresolved evidence. It shows
                    the source revision and becomes visibly superseded online
                    when its dependencies change.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <section className="evidence-block">
          <h2>Useful previews. Inspectable differences.</h2>
          <p>
            The recorded outputs contain changes that matter: coat length and
            closure can drift, shirts may be rolled or tucked differently, and a
            jacket may appear open. The studio retains the original actor and
            garment references and shows inspection notes. Makeup VTO produces a
            separate face detail for the exact lip and blush settings. Skin
            smoothing and lip reshaping are set to zero, but output texture
            still requires inspection. Hair colour and necklace previews are
            separate face outputs, not a combined simulation of the full look.
            The requested Chocolate Brown hair preset reads plum in the saved
            result; the image, rather than its preset name, is what you approve.
            Other written styling instructions remain crew direction.
          </p>
          <div className="evidence-links">
            <a
              href={`${repository}/docs/evaluation-ai.md`}
              target="_blank"
              rel="noreferrer"
            >
              Independent AI evaluation
              <ExternalLink size={13} />
            </a>
            <a
              href="/examples/recorded-previews.json"
              target="_blank"
              rel="noreferrer"
            >
              Recorded garment manifest
              <FileText size={13} />
            </a>
            <a
              href={`${repository}/docs/evaluation.md`}
              target="_blank"
              rel="noreferrer"
            >
              Domain and workflow evaluation
              <ExternalLink size={13} />
            </a>
            <a
              href="/examples/recorded-beauty-previews.json"
              target="_blank"
              rel="noreferrer"
            >
              Recorded makeup manifest
              <FileText size={13} />
            </a>
            {[
              [
                "/examples/recorded-review-previews.json",
                "Additional garment recordings",
              ],
              [
                "/examples/recorded-review-beauty-previews.json",
                "Finale makeup recordings",
              ],
              [
                "/examples/recorded-detail-previews.json",
                "Hair and necklace recordings",
              ],
            ].map(([href, label]) => (
              <a key={href} href={href} target="_blank" rel="noreferrer">
                {label}
                <FileText size={13} />
              </a>
            ))}
            <a
              href={`${repository}/docs/evidence/script-import-review.json`}
              target="_blank"
              rel="noreferrer"
            >
              Full-act script evaluation
              <ExternalLink size={13} />
            </a>
            <a
              href={`${repository}/docs/evidence/browser-review.json`}
              target="_blank"
              rel="noreferrer"
            >
              Observed browser workflows
              <ExternalLink size={13} />
            </a>
          </div>
        </section>
        <section className="evidence-block">
          <h2>Measured software behaviour.</h2>
          <p>
            A full First Act of Oscar Wilde’s{" "}
            <em>The Importance of Being Earnest</em>—7,323 words, 20 pages in
            the evaluation’s own pagination—produced eight proposed cues, all
            grounded in exact original source spans, in 11.473 seconds. The
            earlier attempt grounded six of nine cues. Both attempts are
            preserved. Grounding checks quoted evidence; it does not establish
            that every useful cue was found or that the model’s interpretation
            is correct. Every imported cue still needs review.
          </p>
          <p>
            A separate agent-operated browser journey imported the full act with
            seven of seven proposed cues grounded, then used the example
            library, own-clothes scope and drafted calls to adopt a £125
            allocation. The observed upper bound was 273 seconds, including
            browser-control troubleshooting; this measures that software
            exercise, not human completion time.
          </p>
          <p>
            Allocation tests require current approval for the exact performer,
            physical unit, reference and output. A continuity group keeps one
            garment across its calls; the objective minimizes unique-unit hire
            cost, then performer changeovers. FEASIBLE means the constraints
            passed without a genuine choice. OPTIMAL requires exhaustively
            comparing the admissible alternatives. The Constraint check shares
            the solver’s demand model and is not an independent proof.
          </p>
          <p>
            The published domain benchmark uses ten in-process samples of a
            seven-scene, eight-look fixture with provider test doubles. It
            measures software computation, not network latency or crew time
            saved. Two dated AI-critique runs contain 28 observations across
            twelve garment outputs and two unchanged-source controls. They
            preserve model disagreements and visible discrepancies; the face
            details were inspected separately by the orchestration agent.
            Neither method supplies participant validation.
          </p>
          <p>
            Supplier hire orders export as CSV and a printable document, keeping
            the quote, confirmation, receipt and return evidence together. These
            are operator records: exporting does not place an order or contact a
            supplier. Physical fitting, availability and any unresolved evidence
            remain visible in the working crew pack.
          </p>
          <div className="evidence-links">
            <a
              href={`${repository}/docs/evidence/domain-benchmark.json`}
              target="_blank"
              rel="noreferrer"
            >
              Domain benchmark and scope
              <ExternalLink size={13} />
            </a>
            <a
              href={`${repository}/docs/evidence/script-import-review.json`}
              target="_blank"
              rel="noreferrer"
            >
              Both script extraction attempts
              <ExternalLink size={13} />
            </a>
            <a
              href={`${repository}/docs/evidence/own-script-browser-review.json`}
              target="_blank"
              rel="noreferrer"
            >
              Full-act browser journey <ExternalLink size={13} />
            </a>
          </div>
        </section>
        <section className="evidence-block">
          <h2>What has not been measured.</h2>
          <p>
            No human performer or costume practitioner study, physical fitting,
            real supplier transaction, production time saving, or environmental
            outcome is claimed. Automated domain tests and AI critiques exercise
            synthetic cases. They do not substitute for a real production’s
            practical judgment.
          </p>
          <div className="evidence-links">
            <a
              href={`${repository}/docs/architecture.md`}
              target="_blank"
              rel="noreferrer"
            >
              System architecture
              <ExternalLink size={13} />
            </a>
            <a
              href={`${repository}/docs/judging.md`}
              target="_blank"
              rel="noreferrer"
            >
              Guided evaluation walkthrough
              <ExternalLink size={13} />
            </a>
            <a
              href={`${repository}/docs/asset-licenses.md`}
              target="_blank"
              rel="noreferrer"
            >
              Asset provenance & font licenses
              <ExternalLink size={13} />
            </a>
          </div>
        </section>
        <section className="evidence-block">
          <p className="eyebrow">YOUR PRIVATE WORKING BOOK</p>
          <h2 style={{ marginTop: 14 }}>
            Permission stays part of the picture.
          </h2>
          <div className="privacy-grid">
            <div>
              <h3>Private to this browser</h3>
              <p>
                Each production belongs to an anonymous authenticated browser
                session. Another visitor cannot open its records or private
                uploads by knowing a URL. Keep this browser’s cookies to return;
                there is no email recovery flow. Private production records and
                uploads expire after 30 days. Public example media is
                intentionally public.
              </p>
            </div>
            <div>
              <h3>Purpose-specific processing</h3>
              <p>
                Fresh garment generation sends the selected performer and
                garment reference to YouCam. Makeup and hair generation send the
                separate face capture; necklace generation also sends its
                selected accessory reference. Script analysis sends the
                permitted script text to a configured AI model. Source
                permission and image rights are required before a private upload
                is used.
              </p>
            </div>
            <div>
              <h3>Export, withdrawal, and deletion</h3>
              <p>
                Production settings provide data export and deletion. Cast &
                sources allows permission withdrawal, blocking future
                derivations and invalidating actor-specific evidence. Previously
                printed or downloaded documents cannot be remotely recalled.
              </p>
            </div>
            <div>
              <h3>Provider retention is separate</h3>
              <p>
                Removing application data is distinct from provider retention.
                Consult the actual provider policy for its processing period. Do
                not upload material you are not authorized to process.
              </p>
              <div className="evidence-links">
                <a
                  href="https://docs.makeupar.com/develop/file_retention_period"
                  target="_blank"
                  rel="noreferrer"
                >
                  YouCam retention documentation
                  <ExternalLink size={13} />
                </a>
              </div>
            </div>
          </div>
        </section>
        <div className="button-row">
          <Link className="button button-primary" href="/productions">
            Open your working book
            <ArrowRight size={16} />
          </Link>
          <a
            className="button"
            href="https://github.com/yadneshSalvi/stagecraft"
            target="_blank"
            rel="noreferrer"
          >
            Inspect the source
            <ExternalLink size={15} />
          </a>
          <span className="muted">
            <LockKeyhole
              size={14}
              style={{ verticalAlign: "middle", marginRight: 5 }}
            />{" "}
            Private by production.
          </span>
        </div>
      </main>
    </>
  );
}
