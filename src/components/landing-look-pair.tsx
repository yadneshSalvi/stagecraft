import { Photo } from "./ui";

export function LandingLookPair() {
  return (
    <section className="landing-look-pair" aria-labelledby="look-pair-title">
      <h2 id="look-pair-title">Costume and makeup</h2>
      <div className="look-pair-images">
        <figure>
          <Photo
            src="/examples/previews/nora-oxblood.webp"
            alt="Actual recorded YouCam Clothes V4 output for the fictional character Nora in an oxblood coat"
          />
          <figcaption>Costume</figcaption>
        </figure>
        <figure>
          <Photo
            src="/examples/beauty/nora-ada-berry.webp"
            alt="Actual recorded YouCam Makeup VTO lip and blush output on Nora's separate synthetic face source"
          />
          <figcaption>Makeup</figcaption>
        </figure>
      </div>
    </section>
  );
}
