export const baseFixtureImageUrls = new Set([
  ...["ada", "theo", "mina", "jules", "ruth", "celeste"].map(
    (name) => `/assets/cast/${name}.webp`,
  ),
  ...["ada", "celeste"].map((name) => `/assets/cast/${name}-face.webp`),
  ...[
    "oxblood-coat",
    "charcoal-coat",
    "midnight-dress",
    "ivory-shirt",
    "olive-suit",
  ].map((name) => `/assets/garments/${name}.webp`),
]);
export const reviewFixtureImageUrls = new Set([
  "/assets/cast/mina-face.webp",
  "/assets/garments/burgundy-coat.webp",
  "/assets/garments/rust-jacket.webp",
  "/assets/accessories/brass-pendant.webp",
]);
export const fixtureImageUrls = new Set([
  ...baseFixtureImageUrls,
  ...reviewFixtureImageUrls,
]);
