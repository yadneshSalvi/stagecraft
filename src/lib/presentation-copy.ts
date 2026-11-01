/** Presentation-only compatibility for known, app-authored example text. */
export function displayApproval<
  T extends {
    approvedBy: string;
    rationale: string;
    decisionSource?: string;
  },
>(approval: T): { approvedBy: string; rationale: string } {
  return approval.decisionSource === "example"
    ? { approvedBy: "Example reviewer", rationale: "Example approval." }
    : { approvedBy: approval.approvedBy, rationale: approval.rationale };
}

const fixtureText = new Map([
  ["Seabright Wardrobe · synthetic supplier", "Seabright Wardrobe"],
  ["Small brass pendant · synthetic reference", "Small brass pendant"],
  ["Synthetic draft 2 · day variants", "Draft 2"],
  [
    "Synthetic catalogue record; physical condition not inspected.",
    "Not inspected.",
  ],
  ["Synthetic fixture; no physical fitting has occurred.", "Not fitted yet."],
  [
    "Synthetic planning window; supplier confirmation required.",
    "Planning window; supplier to confirm.",
  ],
  [
    "Synthetic GBP quote for the full production window; charged once per physical unit.",
    "Quote for the production window.",
  ],
  [
    "Synthetic design and preparation estimate. Garment previews, separate makeup detail and physical evidence carry their own provenance.",
    "",
  ],
  [
    "Synthetic sourcing draft. No request, supplier confirmation or physical receipt has occurred.",
    "Collect from store; return after the shoot.",
  ],
  [
    "Replacement performer requires a physical fitting; appearance approval does not establish fit.",
    "New performer needs a fitting.",
  ],
  [
    "Synthetic production exercise. Cast portraits, script and inventory are fictional; only explicitly labelled provider previews are actual recorded or live provider outputs. No physical or supplier outcome is implied.",
    "",
  ],
]);

export function displayFixtureText(text: string, fixture: boolean): string {
  return fixture ? (fixtureText.get(text) ?? text) : text;
}

/** These prefixes identify immutable, app-authored notes from the public collection. */
const inspectionNotes: Array<[string, string]> = [
  [
    "Actual independent YouCam detail from a permitted separate face capture.",
    "Inspect colour, shape and edges.",
  ],
  [
    "Actual YouCam Makeup VTO detail from a separate face capture.",
    "Inspect lips, blush and texture.",
  ],
  [
    "Actual YouCam Clothes V4 result.",
    "Inspect identity, pose and garment detail.",
  ],
  [
    "Root visual inspection and two AI critiques found the burgundy coat visibly transferred.",
    "Inspect hem length, waist silhouette and stronger velvet highlights.",
  ],
  [
    "Both AI critiques request closer inspection: the collar opens",
    "The collar opens and cuffs turn back. Weave becomes smoother; a dark band appears near the hem.",
  ],
  [
    "Root visual inspection and both AI critiques found the navy dress visibly transferred.",
    "Neckline, sleeve length and skirt drape differ slightly.",
  ],
  [
    "The olive jacket is visibly transferred but worn open;",
    "The jacket is worn open. The underlying T-shirt and fabric texture also change.",
  ],
  [
    "Both AI critiques request closer inspection: the shirt is tucked in",
    "The shirt is tucked in. Its neckline opens and sleeves look fuller. The trouser waist also changes.",
  ],
  [
    "The charcoal coat is visibly transferred but worn open.",
    "The coat is worn open. Inspect lapels, closure and mottled texture.",
  ],
  [
    "Root visual inspection and both AI critiques found the oxblood coat visibly transferred",
    "Inspect brighter velvet highlights and button detail against the reference.",
  ],
  [
    "Actual recorded YouCam Makeup VTO detail over separately generated fictional adult face artwork.",
    "Inspect lip edges, blush and texture.",
  ],
  [
    "Recorded YouCam finale lip and blush detail.",
    "Inspect lip edges, blush and texture.",
  ],
  [
    "Recorded YouCam hair-colour detail from the separate face source; inspect colour and facial/hair boundaries before approval. Requested preset is Chocolate Brown",
    "Requested Chocolate Brown appears wine/plum. Inspect colour and facial/hair boundaries.",
  ],
  [
    "Recorded YouCam hair-colour detail from the separate face source;",
    "Inspect colour and facial/hair boundaries.",
  ],
  [
    "Recorded YouCam necklace detail with explicit background removal;",
    "Inspect pendant shape, chain placement and neck edges.",
  ],
  [
    "The coat is shown open and its texture reads more crosshatched",
    "The coat is open; its texture looks more crosshatched. Inspect closure orientation, lapels and separated hem panels.",
  ],
  [
    "The coat is shown open; the output has coarser mottling",
    "The coat is open, with coarser mottling and smaller, glossier buttons. Inspect closure orientation and drape.",
  ],
  [
    "The burgundy coat is shown open with coarser mottling",
    "The coat is open, with coarser mottling and narrower lapels. Inspect closure and hanging front edges.",
  ],
  [
    "The ivory shirt is tucked in with its collar open;",
    "The shirt is tucked in, with an open collar. Fabric looks smoother; placket buttons are faint. Hidden hem and exact weave remain uncertain.",
  ],
  [
    "The rust jacket is present, but the original white undershirt",
    "The white undershirt changes to tan, with a lower neckline. The jacket weave looks softer.",
  ],
];

export function displayInspectionNotes(text?: string): string {
  if (!text) return "";
  return (
    inspectionNotes.find(([prefix]) => text.startsWith(prefix))?.[1] ?? text
  );
}
