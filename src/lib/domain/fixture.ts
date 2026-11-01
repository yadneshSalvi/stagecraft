import type {
  Character,
  Look,
  PhysicalUnit,
  Production,
  Scene,
} from "../types";
import { sha256 } from "./hash";
import { appearanceRecipeHash } from "./lineage";

const FIXTURE_TIME = "2026-10-31T12:00:00.000Z";

export function createBlankProduction(
  id: string,
  title: string,
  now = new Date().toISOString(),
): Production {
  return {
    id,
    title: title.trim() || "Untitled production",
    subtitle: "A new production, ready for your first scene.",
    mode: "film",
    currency: "GBP",
    timeZone: "Europe/London",
    budgetCents: 50000,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    fixture: false,
    script: null,
    scenes: [],
    occurrences: [],
    performers: [],
    characters: [],
    looks: [],
    appearanceCandidates: [],
    detailReferences: [
      {
        id: "detail-brass-pendant",
        librarySourceId: "detail-brass-pendant",
        name: "Small brass pendant",
        imageUrl: "/assets/accessories/brass-pendant.webp",
        assetId: null,
        synthetic: true,
      },
    ],
    units: [],
    allocations: [],
    transitions: [],
    allocationResult: null,
    sourcing: [],
    proposals: [],
    packs: [],
    events: [],
  };
}

/** Authored fictional script; no real performer, supplier, fitting or preview is implied. */
export function createExampleProduction(
  id: string,
  now = FIXTURE_TIME,
): Production {
  const production = createBlankProduction(id, "THE LAST LIGHT", now);
  const created = new Date(now);
  const dayAfter = (days: number) =>
    new Date(
      Date.UTC(
        created.getUTCFullYear(),
        created.getUTCMonth(),
        created.getUTCDate() + days,
      ),
    )
      .toISOString()
      .slice(0, 10);
  production.fixture = true;
  production.subtitle =
    "Seven scenes. Three story days. One coat that holds the story together.";
  const cast = [
    [
      "ada",
      "Ada Mercer",
      "she / her",
      "nora",
      "Nora Vale",
      "A returning stage manager, holding a theatre together for one final night.",
    ],
    [
      "theo",
      "Theo Reed",
      "he / him",
      "elias",
      "Elias Vale",
      "Nora's brother, the theatre's practical but reluctant electrician.",
    ],
    [
      "mina",
      "Mina Park",
      "she / her",
      "mae",
      "Mae Lin",
      "A singer returning to the stage where she first found her voice.",
    ],
    [
      "jules",
      "Jules Laurent",
      "they / them",
      "julian",
      "Julian Voss",
      "A promoter trying to keep the last performance alive.",
    ],
    [
      "ruth",
      "Ruth Ellis",
      "she / her",
      "ruth",
      "Ruth Bell",
      "The long-serving wardrobe custodian and keeper of the theatre's history.",
    ],
  ];
  production.performers = cast.map(([key, name, pronouns]) => ({
    id: `performer-${key}`,
    librarySourceId: `performer-${key}`,
    name,
    pronouns,
    imageUrl: `/assets/cast/${key}.webp`,
    assetId: null,
    captureVersion: 1,
    synthetic: true,
    consent: {
      granted: true,
      purpose:
        "Synthetic adult character portrait for this fictional demonstration.",
      publicDemo: true,
      recordedAt: now,
    },
    measurements: { chestCm: null, waistCm: null, heightCm: null },
  }));
  production.performers.push({
    id: "performer-celeste",
    librarySourceId: "performer-celeste",
    name: "Celeste Rowan",
    pronouns: "she / her",
    imageUrl: "/assets/cast/celeste.webp",
    assetId: null,
    captureVersion: 1,
    synthetic: true,
    consent: {
      granted: true,
      purpose:
        "Synthetic adult replacement performer for the labelled recast exercise.",
      publicDemo: true,
      recordedAt: now,
    },
    measurements: { chestCm: null, waistCm: null, heightCm: null },
  });
  for (const key of ["ada", "celeste", "mina"]) {
    const performer = production.performers.find(
      (candidate) => candidate.id === `performer-${key}`,
    )!;
    performer.faceCapture = {
      librarySourceId: `performer-${key}-face`,
      imageUrl: `/assets/cast/${key}-face.webp`,
      assetId: null,
      version: 1,
      synthetic: true,
      consent: {
        granted: true,
        publicDemo: true,
        purpose:
          "Separate synthetic adult face source for the fictional beauty-detail demonstration; no real participant.",
        recordedAt: now,
      },
    };
  }
  const directions: Record<
    string,
    { text: string; palette: string[]; essential: string[] }
  > = {
    nora: {
      text: "The oxblood velvet coat is a continuity motif across arrival, rehearsal and the final light. Keep its worn texture visible.",
      palette: ["#632C3D", "#242633", "#D4AE6A"],
      essential: [
        "A long velvet outer layer",
        "The coat repeats in scenes 01, 04 and 07",
      ],
    },
    elias: {
      text: "A practical ivory shirt, rolled sleeves and restrained makeup. Work marks are continuity notes, not generated skin corrections.",
      palette: ["#E6DDC9", "#45494C"],
      essential: ["Ivory work shirt"],
    },
    mae: {
      text: "An ivory rehearsal blouse on story days 1 and 2 gives way to a midnight stage dress on day 3. Preserve natural skin texture; hair colour and makeup details have separate evidence.",
      palette: ["#20283C", "#7A4054"],
      essential: [
        "Ivory rehearsal blouse on days 1 and 2",
        "Midnight stage dress on day 3",
      ],
    },
    julian: {
      text: "An olive tailored jacket on day 2 changes to a rust jacket for the final performance on day 3. Keep the deliberate, slightly undone silhouette.",
      palette: ["#59604D", "#CEC2A9"],
      essential: ["Olive tailored jacket on day 2", "Rust jacket on day 3"],
    },
    ruth: {
      text: "An ivory blouse, practical hair and a brass key ring. Keep the wardrobe custodian's working details legible.",
      palette: ["#E9E0CB", "#A68B55"],
      essential: ["Ivory blouse", "Brass key ring"],
    },
  };
  production.characters = cast.map(
    ([performer, , , key, name, description]): Character => ({
      id: `char-${key}`,
      name,
      description,
      performerId: `performer-${performer}`,
      direction: { revision: 1, ...directions[key], approvedBy: null },
    }),
  );
  const blocks = [
    {
      number: "01",
      title: "The return",
      day: 1,
      heading: "EXT. SEASIDE THEATRE - DAWN",
      chars: ["nora"],
      cues: [
        "NORA arrives in an oxblood velvet coat, its hem dark from the sea mist.",
      ],
    },
    {
      number: "02",
      title: "The empty dressing room",
      day: 1,
      heading: "INT. DRESSING ROOM - MORNING",
      chars: ["mae", "ruth"],
      cues: [
        "MAE wears an ivory rehearsal blouse while lifting a midnight-blue dress from its garment bag.",
        "RUTH wears an ivory blouse and carries a brass key ring.",
      ],
    },
    {
      number: "03",
      title: "A rehearsal without an audience",
      day: 2,
      heading: "INT. AUDITORIUM - AFTERNOON",
      chars: ["julian", "mae", "ruth"],
      cues: [
        "JULIAN crosses the empty auditorium in an olive tailored jacket.",
        "MAE rehearses in her ivory blouse, her bob a warm chocolate brown.",
        "RUTH watches in the same ivory blouse, a brass key ring at her waist.",
      ],
    },
    {
      number: "04",
      title: "Keeping the lights on",
      day: 2,
      heading: "INT. STAGE - LATE AFTERNOON",
      chars: ["nora", "elias"],
      cues: [
        "NORA keeps the same oxblood velvet coat over her shoulders.",
        "ELIAS rolls the sleeves of an ivory work shirt before opening the lighting box.",
      ],
    },
    {
      number: "05",
      title: "The storm outside",
      day: 2,
      heading: "INT. FOYER - NIGHT",
      chars: ["mae", "julian"],
      cues: [
        "MAE waits in the same ivory rehearsal blouse as rain rattles the glass.",
        "JULIAN's olive tailored jacket is still unbuttoned; he pockets the last unsold ticket.",
      ],
    },
    {
      number: "06",
      title: "The wardrobe key",
      day: 3,
      heading: "INT. WARDROBE - MORNING",
      chars: ["ruth", "elias"],
      cues: [
        "RUTH, still in her ivory blouse, sets the brass key ring on the table.",
        "ELIAS returns in the same ivory work shirt, sleeves rolled.",
      ],
    },
    {
      number: "07",
      title: "The last light",
      day: 3,
      heading: "INT. STAGE - DUSK",
      chars: ["nora", "elias", "mae", "julian", "ruth"],
      cues: [
        "NORA steps into the last light wearing the oxblood velvet coat once more.",
        "ELIAS stands beside her in his ivory work shirt.",
        "MAE wears the midnight-blue dress; her digital wig direction is now warm copper.",
        "JULIAN wears a rust tailored jacket for the final performance.",
        "RUTH wears her ivory blouse and carries the brass key ring.",
        "NORA's berry lip and rose blush are stronger for the final light; the coat is unchanged.",
      ],
    },
  ];
  let scriptText =
    "THE LAST LIGHT\nAn original synthetic short-film extract for STAGECRAFT.\nAll characters are fictional adults.\n\n";
  production.scenes = blocks.map((block): Scene => {
    const start = scriptText.length;
    const segment = `SCENE ${block.number} - STORY DAY ${block.day}\n${block.heading}\n\n${block.cues.join("\n")}\n\n`;
    scriptText += segment;
    return {
      id: `scene-${block.number}`,
      number: block.number,
      title: block.title,
      heading: block.heading,
      storyDay: block.day,
      storyDaySource: "script",
      characterIds: block.chars.map((key) => `char-${key}`),
      lookIds: block.chars.map((key) => `look-${key}`),
      sourceStart: start,
      sourceEnd: scriptText.length,
      reviewed: false,
      requirements: block.cues.map((cue, index) => {
        const character =
          block.chars.find((key) => cue.includes(key.toUpperCase())) ??
          block.chars[0];
        const sourceStart = scriptText.indexOf(cue, start);
        return {
          id: `req-${block.number}-${index + 1}`,
          characterId: `char-${character}`,
          text: cue,
          explicit: true,
          sourceStart,
          sourceEnd: sourceStart + cue.length,
          reviewed: false,
        };
      }),
    };
  });
  production.script = {
    id: "script-last-light-v2",
    label: "Draft 2",
    title: "THE LAST LIGHT",
    text: scriptText,
    sha256: sha256(scriptText),
    rightsConfirmed: true,
    createdAt: now,
    model: "authored-synthetic-fixture/v2",
    provenance: "synthetic",
  };
  const unitDefaults = {
    assetId: null,
    supplier: "Seabright Wardrobe",
    ownership: "rental" as const,
    location: "Seaside Theatre",
    condition: "Not inspected.",
    status: "available" as const,
    measurements: { chestCm: null, waistCm: null, lengthCm: null },
    fitting: {
      performerId: null,
      status: "not_measured" as const,
      evidence: "Not fitted yet.",
      provenance: "synthetic" as const,
    },
    availability: {
      from: `${dayAfter(8)}T00:00:00.000Z`,
      to: `${dayAfter(12)}T23:59:00.000Z`,
      source: "Planning window; supplier to confirm.",
      checkedAt: now,
      confirmed: false,
      provenance: "synthetic" as const,
    },
    priceSource: "Quote for the production window.",
    priceValidUntil: `${dayAfter(8)}T23:59:00.000Z`,
    substitutionFamily: null,
    approvedSubstituteIds: [],
    version: 1,
  };
  const units: Array<
    Pick<
      PhysicalUnit,
      | "id"
      | "code"
      | "name"
      | "category"
      | "imageUrl"
      | "color"
      | "material"
      | "priceCents"
    >
  > = [
    {
      id: "unit-coat-oxblood",
      code: "C-014",
      name: "Oxblood velvet coat",
      category: "outerwear",
      imageUrl: "/assets/garments/oxblood-coat.webp",
      color: "Oxblood",
      material: "Velvet",
      priceCents: 14500,
    },
    {
      id: "unit-coat-charcoal",
      code: "C-021",
      name: "Charcoal wool coat",
      category: "outerwear",
      imageUrl: "/assets/garments/charcoal-coat.webp",
      color: "Charcoal",
      material: "Wool",
      priceCents: 11000,
    },
    {
      id: "unit-coat-burgundy",
      code: "C-033",
      name: "Burgundy wool coat",
      category: "outerwear",
      imageUrl: "/assets/garments/burgundy-coat.webp",
      color: "Burgundy",
      material: "Wool",
      priceCents: 13000,
    },
    {
      id: "unit-dress-midnight",
      code: "D-008",
      name: "Midnight stage dress",
      category: "full_body",
      imageUrl: "/assets/garments/midnight-dress.webp",
      color: "Midnight blue",
      material: "Crepe",
      priceCents: 9500,
    },
    {
      id: "unit-shirt-ivory",
      code: "S-003",
      name: "Ivory work shirt · physical unit 1",
      category: "upper_body",
      imageUrl: "/assets/garments/ivory-shirt.webp",
      color: "Ivory",
      material: "Cotton",
      priceCents: 2500,
    },
    {
      id: "unit-jacket-olive",
      code: "T-011",
      name: "Olive tailored jacket",
      category: "upper_body",
      imageUrl: "/assets/garments/olive-suit.webp",
      color: "Olive",
      material: "Wool blend",
      priceCents: 12500,
    },
    {
      id: "unit-blouse-ivory",
      code: "S-004",
      name: "Ivory blouse · physical unit 2",
      category: "upper_body",
      imageUrl: "/assets/garments/ivory-shirt.webp",
      color: "Ivory",
      material: "Cotton",
      priceCents: 3200,
    },
    {
      id: "unit-blouse-mae",
      code: "S-009",
      name: "Mae's ivory rehearsal blouse · physical unit 3",
      category: "upper_body",
      imageUrl: "/assets/garments/ivory-shirt.webp",
      color: "Ivory",
      material: "Cotton",
      priceCents: 2800,
    },
    {
      id: "unit-jacket-rust",
      code: "J-031",
      name: "Rust tailored jacket",
      category: "upper_body",
      imageUrl: "/assets/garments/rust-jacket.webp",
      color: "Rust",
      material: "Wool blend",
      priceCents: 5000,
    },
  ];
  production.units = units.map((unit) => ({
    ...structuredClone(unitDefaults),
    ...unit,
    librarySourceId: unit.id,
  }));
  const recipes = [
    {
      key: "nora",
      unit: "unit-coat-oxblood",
      title: "The returning coat",
      category: "outerwear" as const,
      minutes: 20,
      hair: "Loose low knot, with a few wind-touched strands.",
      makeup: "Muted berry lip, warm brown liner; natural skin texture.",
      accessories: "Small brass pendant; continuity reference only.",
    },
    {
      key: "elias",
      unit: "unit-shirt-ivory",
      title: "Keeping the lights on",
      category: "upper_body" as const,
      minutes: 12,
      hair: "Natural, pushed back before work.",
      makeup: "Neutral, unretouched baseline; record any work marks manually.",
      accessories: "Prop electrician's notebook; no live electrical work.",
    },
    {
      key: "mae",
      unit: "unit-dress-midnight",
      title: "One final song",
      category: "full_body" as const,
      minutes: 25,
      hair: "Softly pinned at the nape.",
      makeup: "Muted berry lip and cool brown eye; no skin smoothing.",
      accessories: "Small silver studs.",
    },
    {
      key: "julian",
      unit: "unit-jacket-olive",
      title: "The last ticket",
      category: "upper_body" as const,
      minutes: 18,
      hair: "A deliberate, slightly undone side part.",
      makeup:
        "Restrained matte lip and soft brown definition; natural texture.",
      accessories: "One paper ticket in the inner pocket.",
    },
    {
      key: "ruth",
      unit: "unit-blouse-ivory",
      title: "Keeper of the keys",
      category: "upper_body" as const,
      minutes: 15,
      hair: "Practical pinned bun.",
      makeup: "Subtle rose lip, no skin smoothing; preserve natural texture.",
      accessories: "Brass key ring, story-essential prop.",
    },
  ];
  production.looks = recipes.map((recipe): Look => {
    const character = production.characters.find(
      (item) => item.id === `char-${recipe.key}`,
    )!;
    const scenes = production.scenes.filter((scene) =>
      scene.characterIds.includes(character.id),
    );
    return {
      id: `look-${recipe.key}`,
      title: recipe.title,
      characterId: character.id,
      performerId: character.performerId,
      revision: 1,
      sceneIds: scenes.map((scene) => scene.id),
      storyDays: [...new Set(scenes.map((scene) => scene.storyDay))],
      unitIds: [recipe.unit],
      category: recipe.category,
      silhouette: directions[recipe.key].text,
      makeup: {
        notes: recipe.makeup,
        palette: directions[recipe.key].palette,
        skinSmoothStrength: 0,
        skinSmoothColorIntensity: 0,
      },
      hair: recipe.hair,
      accessories: recipe.accessories,
      preparationMinutes: recipe.minutes,
      preparationEvidence: "estimate",
      previews: [],
      approvals: [],
      note: "",
      reviewReason: null,
    };
  });
  production.looks.find((look) => look.id === "look-nora")!.beauty = {
    revision: 1,
    recipe: {
      lipColor: "#853E5D",
      lipIntensity: 40,
      blushColor: "#9D526C",
      blushIntensity: 30,
    },
    previews: [],
    approvals: [],
    reviewReason: "Makeup needs a preview and approval.",
  };
  const nora = production.looks.find((look) => look.id === "look-nora")!;
  nora.continuityGroupId = "continuity-nora-coat";
  nora.sceneIds = ["scene-01", "scene-04"];
  nora.storyDays = [1, 2];
  const finale = structuredClone(nora);
  finale.id = "look-nora-finale";
  finale.title = "The returning coat · final light";
  finale.sceneIds = ["scene-07"];
  finale.storyDays = [3];
  finale.beauty!.recipe.lipIntensity = 65;
  finale.beauty!.recipe.blushIntensity = 45;
  const mae = production.looks.find((look) => look.id === "look-mae")!;
  mae.sceneIds = ["scene-07"];
  mae.storyDays = [3];
  const rehearsal = structuredClone(mae);
  rehearsal.id = "look-mae-rehearsal";
  rehearsal.title = "Before the final song · rehearsal";
  rehearsal.sceneIds = ["scene-02", "scene-03", "scene-05"];
  rehearsal.storyDays = [1, 2];
  rehearsal.unitIds = ["unit-blouse-mae"];
  rehearsal.category = "upper_body";
  rehearsal.preparationMinutes = 15;
  rehearsal.hair =
    "Chocolate-brown bob; digital colour direction reviewed separately.";
  const julian = production.looks.find((look) => look.id === "look-julian")!;
  julian.sceneIds = ["scene-03", "scene-05"];
  julian.storyDays = [2];
  const rust = structuredClone(julian);
  rust.id = "look-julian-finale";
  rust.title = "The last ticket · rust finale";
  rust.sceneIds = ["scene-07"];
  rust.storyDays = [3];
  rust.unitIds = ["unit-jacket-rust"];
  production.looks.push(finale, rehearsal, rust);
  production.detailReferences = [
    {
      id: "detail-brass-pendant",
      librarySourceId: "detail-brass-pendant",
      name: "Small brass pendant",
      imageUrl: "/assets/accessories/brass-pendant.webp",
      assetId: null,
      synthetic: true,
    },
  ];
  for (const look of [nora, finale])
    look.details = [
      {
        kind: "necklace",
        revision: 1,
        recipe: {
          kind: "necklace",
          referenceId: "detail-brass-pendant",
          removeBackground: true,
        },
        previews: [],
        approvals: [],
        reviewReason: "Necklace needs a preview and approval.",
      },
    ];
  for (const look of [rehearsal, mae])
    look.details = [
      {
        kind: "hair_color",
        revision: 1,
        recipe: {
          kind: "hair_color",
          preset: look.id === rehearsal.id ? "Chocolate Brown" : "Copper Red",
        },
        previews: [],
        approvals: [],
        reviewReason: "Hair colour needs a preview and approval.",
      },
    ];
  for (const scene of production.scenes)
    scene.lookIds = production.looks
      .filter((look) => look.sceneIds.includes(scene.id))
      .map((look) => look.id);
  production.appearanceCandidates = ["charcoal", "burgundy"].map((color) => {
    const recipe = {
      unitIds: [`unit-coat-${color}`],
      category: "outerwear" as const,
    };
    return {
      id: `candidate-nora-${color}`,
      lookIds: ["look-nora", "look-nora-finale"],
      sceneIds: ["scene-01", "scene-04", "scene-07"],
      performerId: "performer-ada",
      captureVersion: 1,
      recipe,
      recipeHash: appearanceRecipeHash(recipe),
      previews: [],
      approvals: [],
      createdAt: now,
    };
  });
  const slots = [
    ["04", dayAfter(9), "09:00", "10:00"],
    ["01", dayAfter(9), "11:00", "12:00"],
    ["02", dayAfter(9), "14:00", "15:00"],
    ["06", dayAfter(10), "09:00", "10:00"],
    ["03", dayAfter(10), "11:00", "12:00"],
    ["05", dayAfter(10), "14:00", "15:00"],
    ["07", dayAfter(10), "18:00", "19:30"],
  ];
  production.occurrences = slots.map(([number, date, start, end], index) => ({
    id: `occ-${number}`,
    sceneId: `scene-${number}`,
    label: `Shoot ${index + 1} · scene ${number}`,
    kind: "shoot",
    start: `${date}T${start}:00.000Z`,
    end: `${date}T${end}:00.000Z`,
    location: "Seaside Theatre",
    order: index + 1,
  }));
  production.transitions = [
    {
      id: "transition-mae-finale",
      performerId: "performer-mina",
      fromOccurrenceId: "occ-05",
      toOccurrenceId: "occ-07",
      minutes: 40,
      evidence: "estimate",
      crewResource: "Wardrobe team A",
      crewCapacity: 1,
      note: "Ivory blouse → midnight dress, same day.",
    },
    {
      id: "transition-julian-finale",
      performerId: "performer-jules",
      fromOccurrenceId: "occ-05",
      toOccurrenceId: "occ-07",
      minutes: 25,
      evidence: "estimate",
      crewResource: "Wardrobe team A",
      crewCapacity: 1,
      note: "Olive → rust jacket, same day.",
    },
  ];
  production.sourcing = [
    {
      id: "source-coat-draft",
      unitIds: ["unit-coat-oxblood"],
      supplier: unitDefaults.supplier,
      from: unitDefaults.availability.from,
      to: unitDefaults.availability.to,
      status: "draft",
      sourceRevision: 1,
      quoteCents: 14500,
      quoteValidUntil: unitDefaults.priceValidUntil,
      provenance: "synthetic",
      operator: null,
      evidence: null,
      externalReference: null,
      updatedAt: now,
      stale: false,
      note: "Collect from store; return after the shoot.",
    },
  ];
  production.events = [
    {
      id: `${id}-created`,
      type: "production_created",
      actor: "STAGECRAFT example",
      at: now,
      revision: 1,
      summary: "Created the example production.",
      provenance: "synthetic",
    },
  ];
  return production;
}
