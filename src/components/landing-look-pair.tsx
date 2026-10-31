import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Photo } from "./ui";

export function LandingLookPair() {
  return (
    <section className="landing-look-pair" aria-labelledby="look-pair-title">
      <div className="look-pair-copy">
        <p className="eyebrow">COSTUME + MAKEUP / ONE CHARACTER</p>
        <h2 id="look-pair-title">
          The silhouette.
          <br />
          The smallest <em>detail.</em>
        </h2>
        <p>
          A real YouCam garment preview and a separately generated lip-and-blush
          detail. Each keeps its own permitted source, recipe and approval.
        </p>
        <p>
          A coat change keeps a valid makeup decision. A recast asks you to
          review both for the new performer.
        </p>
        <div className="look-pair-policy">
          <Check size={15} />
          <span>
            Makeup smoothing and reshaping set to zero.
            <br />
            Every generated result still needs inspection.
          </span>
        </div>
        <Link href="/evidence">
          Follow the evidence
          <ArrowRight size={15} />
        </Link>
        <small>
          Open the example for makeup, Mae’s hair-colour studies and Nora’s
          independent necklace detail.
        </small>
      </div>
      <div className="look-pair-images">
        <figure>
          <Photo
            src="/examples/previews/nora-oxblood.webp"
            alt="Actual recorded YouCam Clothes V4 output for the fictional character Nora in an oxblood coat"
          />
          <figcaption>
            <span>01 / COSTUME</span>
            <strong>Clothes V4</strong>
          </figcaption>
        </figure>
        <figure>
          <Photo
            src="/examples/beauty/nora-ada-berry.webp"
            alt="Actual recorded YouCam Makeup VTO lip and blush output on Nora's separate synthetic face source"
          />
          <figcaption>
            <span>02 / MAKEUP DETAIL</span>
            <strong>Makeup VTO</strong>
          </figcaption>
        </figure>
        <p>Synthetic cast sources · Two genuine recorded provider outputs</p>
      </div>
    </section>
  );
}
