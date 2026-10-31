import type {
  Character,
  Look,
  PhysicalUnit,
  Production,
  Scene,
} from "../types";
import { sha256 } from "./hash";

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
  for (const key of ["ada", "celeste"]) {
    const performer = production.performers.find(
      (candidate) => candidate.id === `performer-${key}`,
    )!;
    performer.faceCapture = {
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
      text: "A midnight dress with a muted berry lip and softly pinned hair. A precise stage silhouette with natural skin texture.",
      palette: ["#20283C", "#7A4054"],
      essential: ["Midnight stage dress"],
    },
    julian: {
      text: "An olive tailored jacket, unbuttoned collar and a deliberate, slightly undone silhouette.",
      palette: ["#59604D", "#CEC2A9"],
      essential: ["Olive tailored jacket"],
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
        "MAE lifts a midnight-blue dress from its garment bag.",
        "RUTH wears an ivory blouse and carries a brass key ring.",
      ],
    },
    {
      number: "03",
      title: "A rehearsal without an audience",
      day: 2,
      heading: "INT. AUDITORIUM - AFTERNOON",
      chars: ["julian", "mae"],
      cues: [
        "JULIAN crosses the empty auditorium in an olive tailored jacket.",
        "MAE rehearses in the midnight-blue dress, her hair softly pinned.",
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
        "MAE waits in the midnight-blue dress as rain rattles the glass.",
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
        "MAE wears the midnight-blue dress, JULIAN the olive tailored jacket, and RUTH her ivory blouse.",
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
    id: "script-last-light-v1",
    label: "Synthetic draft 1",
    title: "THE LAST LIGHT",
    text: scriptText,
    sha256: sha256(scriptText),
    rightsConfirmed: true,
    createdAt: now,
    model: "authored-synthetic-fixture/v1",
    provenance: "synthetic",
  };
  const unitDefaults = {
    assetId: null,
    supplier: "Seabright Wardrobe · synthetic supplier",
    ownership: "rental" as const,
    location: "Seaside Theatre",
    condition: "Synthetic catalogue record; physical condition not inspected.",
    status: "available" as const,
    measurements: { chestCm: null, waistCm: null, lengthCm: null },
    fitting: {
      performerId: null,
      status: "not_measured" as const,
      evidence: "Synthetic fixture; no physical fitting has occurred.",
      provenance: "synthetic" as const,
    },
    availability: {
      from: `${dayAfter(8)}T00:00:00.000Z`,
      to: `${dayAfter(12)}T23:59:00.000Z`,
      source: "Synthetic planning window; supplier confirmation required.",
      checkedAt: now,
      confirmed: false,
      provenance: "synthetic" as const,
    },
    priceSource:
      "Synthetic GBP quote for the full production window; charged once per physical unit.",
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
  ];
  production.units = units.map((unit) => ({
    ...structuredClone(unitDefaults),
    ...unit,
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
      note: "Synthetic design and preparation estimate. Garment previews, separate makeup detail and physical evidence carry their own provenance.",
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
    reviewReason:
      "Separate beauty recipe configured. A genuine face-detail provider result and exact beauty approval are still required.",
  };
  const slots = [
    ["04", dayAfter(9), "09:00", "10:00"],
    ["01", dayAfter(9), "11:00", "12:00"],
    ["02", dayAfter(9), "14:00", "15:00"],
    ["06", dayAfter(10), "09:00", "10:00"],
    ["03", dayAfter(10), "11:00", "12:00"],
    ["05", dayAfter(10), "14:00", "15:00"],
    ["07", dayAfter(11), "18:00", "19:30"],
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
      note: "Synthetic sourcing draft. No request, supplier confirmation or physical receipt has occurred.",
    },
  ];
  production.events = [
    {
      id: `${id}-created`,
      type: "production_created",
      actor: "STAGECRAFT example",
      at: now,
      revision: 1,
      summary:
        "Created an explicitly synthetic film production. Portraits are source images; no approvals or provider previews are seeded.",
      provenance: "synthetic",
    },
  ];
  return production;
}
