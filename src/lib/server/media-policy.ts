export const fixtureImageUrls = new Set([
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
