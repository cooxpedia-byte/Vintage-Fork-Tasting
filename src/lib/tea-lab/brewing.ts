import type { TeaLabBrewStageDraft, TeaLabBrewingStyle } from "@/lib/tea-lab/offline";

export type TeaLabBrewingStyleGroup = "everyday" | "chinese" | "japanese" | "cold" | "stovetop" | "other";
export type TeaLabBrewDurationUnit = "seconds" | "minutes" | "hours";

export type TeaLabBrewingStyleDefinition = {
  id: TeaLabBrewingStyle;
  group: TeaLabBrewingStyleGroup;
  label: string;
  summary: string;
  vesselSuggestion: string;
  setupGuidance: string[];
  durationUnit: TeaLabBrewDurationUnit;
  stageNoun: string;
  stages: Array<TeaLabBrewStageDraft & { notePrompt: string }>;
  repeatable?: boolean;
  nextStageLabel?: string;
};

export const TEA_LAB_BREWING_STYLE_GROUPS: Array<{ id: TeaLabBrewingStyleGroup; label: string }> = [
  { id: "everyday", label: "Everyday infusion" },
  { id: "chinese", label: "Chinese & Taiwanese methods" },
  { id: "japanese", label: "Japanese methods" },
  { id: "cold", label: "Cold & iced methods" },
  { id: "stovetop", label: "Stovetop & concentrated methods" },
  { id: "other", label: "Flexible methods" }
];

export const TEA_LAB_BREWING_STYLES: TeaLabBrewingStyleDefinition[] = [
  {
    id: "western", group: "everyday", label: "Western pot or mug", durationUnit: "minutes", stageNoun: "steep",
    summary: "One longer infusion in a mug or full-size pot, with optional resteeps.", vesselSuggestion: "Mug, basket infuser, or teapot",
    setupGuidance: ["Give the leaves room to open.", "Decant or remove the infuser when the steep is complete."],
    stages: [{ label: "First steep", durationSeconds: 180, temperatureC: null, notes: null, notePrompt: "Aroma, balance, body…" }],
    repeatable: true, nextStageLabel: "Resteep"
  },
  {
    id: "tea_bag", group: "everyday", label: "Tea bag or sachet", durationUnit: "minutes", stageNoun: "steep",
    summary: "A simple mug infusion with the bag removed at the desired strength.", vesselSuggestion: "Mug or small pot",
    setupGuidance: ["Use fresh water suited to the tea.", "Taste before extending the steep; squeezing the bag can change texture."],
    stages: [{ label: "Steep", durationSeconds: 180, temperatureC: null, notes: null, notePrompt: "Strength, clarity, additions…" }]
  },
  {
    id: "grandpa", group: "everyday", label: "Grandpa style", durationUnit: "minutes", stageNoun: "fill",
    summary: "Leaves remain in the cup while you drink and replenish the water.", vesselSuggestion: "Tall heat-safe glass or mug",
    setupGuidance: ["Let floating leaves settle before drinking.", "Top up before the cup is empty to carry flavour forward."],
    stages: [
      { label: "Initial fill", durationSeconds: 120, temperatureC: null, notes: null, notePrompt: "When did the cup become ready to drink?" },
      { label: "First top-up", durationSeconds: null, temperatureC: null, notes: null, notePrompt: "How did the flavour shift?" }
    ], repeatable: true, nextStageLabel: "Top-up"
  },
  {
    id: "bowl", group: "everyday", label: "Bowl brewing", durationUnit: "minutes", stageNoun: "pour",
    summary: "Leaves open freely in a bowl for slow, attentive drinking or ladling.", vesselSuggestion: "Tea bowl",
    setupGuidance: ["Use fewer leaves than a small-vessel method.", "Observe how the leaf opens and the liquor changes as it cools."],
    stages: [{ label: "First pour", durationSeconds: 120, temperatureC: null, notes: null, notePrompt: "Opening aroma, texture, leaf movement…" }],
    repeatable: true, nextStageLabel: "Next pour"
  },
  {
    id: "gongfu", group: "chinese", label: "Gongfu", durationUnit: "seconds", stageNoun: "infusion",
    summary: "A high leaf-to-water ratio with many short, fully decanted infusions.", vesselSuggestion: "Gaiwan or small teapot",
    setupGuidance: ["Warm the vessel and cups.", "Keep pours consistent and decant fully between infusions."],
    stages: [
      { label: "Rinse (optional)", durationSeconds: 5, temperatureC: null, notes: null, notePrompt: "Leaf awakening and rinse aroma…" },
      { label: "Infusion 1", durationSeconds: 10, temperatureC: null, notes: null, notePrompt: "Aroma, flavour, texture, finish…" },
      { label: "Infusion 2", durationSeconds: 15, temperatureC: null, notes: null, notePrompt: "What opened or changed?" },
      { label: "Infusion 3", durationSeconds: 20, temperatureC: null, notes: null, notePrompt: "What is emerging or fading?" }
    ], repeatable: true, nextStageLabel: "Infusion"
  },
  {
    id: "chaozhou_gongfu", group: "chinese", label: "Chaozhou gongfu", durationUnit: "seconds", stageNoun: "infusion",
    summary: "A concentrated gongfu approach associated with tightly packed small pots and decisive pours.", vesselSuggestion: "Small Chaozhou or Yixing pot",
    setupGuidance: ["Arrange leaf gently; do not force or crush it.", "Use quick, complete decants and small tasting cups."],
    stages: [
      { label: "Rinse (optional)", durationSeconds: 3, temperatureC: null, notes: null, notePrompt: "Dry and warmed-leaf aroma…" },
      { label: "Infusion 1", durationSeconds: 5, temperatureC: null, notes: null, notePrompt: "Concentration, texture, finish…" },
      { label: "Infusion 2", durationSeconds: 8, temperatureC: null, notes: null, notePrompt: "How did the balance change?" },
      { label: "Infusion 3", durationSeconds: 12, temperatureC: null, notes: null, notePrompt: "Aroma, body, returning sweetness…" }
    ], repeatable: true, nextStageLabel: "Infusion"
  },
  {
    id: "sencha_kyusu", group: "japanese", label: "Sencha in a kyusu", durationUnit: "seconds", stageNoun: "infusion",
    summary: "Measured, fully decanted infusions with later steeps becoming shorter and warmer.", vesselSuggestion: "Kyusu or small Japanese teapot",
    setupGuidance: ["Cool the water to the starting temperature you want to compare.", "Pour between cups evenly and empty the kyusu completely."],
    stages: [
      { label: "Infusion 1", durationSeconds: 60, temperatureC: 70, notes: null, notePrompt: "Umami, sweetness, astringency…" },
      { label: "Infusion 2", durationSeconds: 15, temperatureC: 75, notes: null, notePrompt: "Freshness, body, colour…" },
      { label: "Infusion 3", durationSeconds: 30, temperatureC: 80, notes: null, notePrompt: "What remains in the leaf?" }
    ], repeatable: true, nextStageLabel: "Infusion"
  },
  {
    id: "gyokuro", group: "japanese", label: "Gyokuro", durationUnit: "seconds", stageNoun: "infusion",
    summary: "Small, cool, concentrated infusions designed to foreground sweetness and umami.", vesselSuggestion: "Hohin, shiboridashi, or small kyusu",
    setupGuidance: ["Cool the water carefully and use a small volume.", "Sip the concentrated first infusion slowly; raise temperature for later steeps."],
    stages: [
      { label: "Infusion 1", durationSeconds: 120, temperatureC: 50, notes: null, notePrompt: "Umami, sweetness, texture…" },
      { label: "Infusion 2", durationSeconds: 30, temperatureC: 55, notes: null, notePrompt: "Balance and marine or vegetal notes…" },
      { label: "Infusion 3", durationSeconds: 45, temperatureC: 65, notes: null, notePrompt: "Astringency, lift, finish…" }
    ], repeatable: true, nextStageLabel: "Infusion"
  },
  {
    id: "matcha_usucha", group: "japanese", label: "Matcha — usucha", durationUnit: "seconds", stageNoun: "phase",
    summary: "Thin matcha whisked briskly into a light, fine foam.", vesselSuggestion: "Chawan and chasen",
    setupGuidance: ["Warm and dry the bowl, then sift the matcha.", "Add water and whisk from the wrist until the texture is even."],
    stages: [
      { label: "Sift and add water", durationSeconds: null, temperatureC: 80, notes: null, notePrompt: "Powder amount, aroma, water feel…" },
      { label: "Whisk", durationSeconds: 15, temperatureC: null, notes: null, notePrompt: "Foam, texture, clumps…" }
    ]
  },
  {
    id: "matcha_koicha", group: "japanese", label: "Matcha — koicha", durationUnit: "seconds", stageNoun: "phase",
    summary: "A dense preparation kneaded slowly with less water and more matcha.", vesselSuggestion: "Chawan and chasen",
    setupGuidance: ["Use matcha intended for koicha and sift it well.", "Add water gradually and knead rather than aerating into foam."],
    stages: [
      { label: "Sift and add water", durationSeconds: null, temperatureC: 80, notes: null, notePrompt: "Powder amount and water volume…" },
      { label: "Knead", durationSeconds: 15, temperatureC: null, notes: null, notePrompt: "Gloss, thickness, smoothness…" }
    ]
  },
  {
    id: "cold_brew", group: "cold", label: "Cold brew", durationUnit: "hours", stageNoun: "extraction",
    summary: "A long extraction in cold water, followed by straining and tasting.", vesselSuggestion: "Covered pitcher or cold-brew bottle",
    setupGuidance: ["Keep the covered vessel refrigerated.", "Stir before serving because flavour can settle toward the bottom."],
    stages: [
      { label: "Cold extraction", durationSeconds: 14400, temperatureC: 5, notes: null, notePrompt: "Sweetness, clarity, extraction level…" },
      { label: "Strain and taste", durationSeconds: null, temperatureC: null, notes: null, notePrompt: "Dilution, serving temperature, finish…" }
    ]
  },
  {
    id: "flash_chilled", group: "cold", label: "Flash-chilled over ice", durationUnit: "seconds", stageNoun: "stage",
    summary: "A concentrated hot infusion poured directly over measured ice.", vesselSuggestion: "Teapot plus ice-filled server",
    setupGuidance: ["Use less hot water to allow for melting ice.", "Decant completely over the ice, then stir to chill evenly."],
    stages: [
      { label: "Concentrated hot steep", durationSeconds: 90, temperatureC: null, notes: null, notePrompt: "Hot extraction strength…" },
      { label: "Pour over ice", durationSeconds: null, temperatureC: null, notes: null, notePrompt: "Ice amount, dilution, clarity…" }
    ]
  },
  {
    id: "koridashi", group: "cold", label: "Ice brew / koridashi", durationUnit: "minutes", stageNoun: "melt",
    summary: "Tea extracts slowly as ice melts directly over the leaves.", vesselSuggestion: "Hohin, shiboridashi, or small bowl",
    setupGuidance: ["Place clean ice directly over the dry leaf.", "Taste the first concentrated melt before adding more ice or water."],
    stages: [
      { label: "First ice melt", durationSeconds: 1800, temperatureC: 0, notes: null, notePrompt: "Concentration, sweetness, umami…" },
      { label: "Second melt", durationSeconds: 1200, temperatureC: 0, notes: null, notePrompt: "How did the leaf open?" }
    ], repeatable: true, nextStageLabel: "Next melt"
  },
  {
    id: "masala_chai", group: "stovetop", label: "Masala chai", durationUnit: "minutes", stageNoun: "stage",
    summary: "Spices, tea, milk, and sweetener are built in stages on the stove.", vesselSuggestion: "Saucepan and fine strainer",
    setupGuidance: ["Record spice mix and the order ingredients were added.", "Watch heat closely after milk is added to prevent boil-over."],
    stages: [
      { label: "Spice decoction", durationSeconds: 300, temperatureC: null, notes: null, notePrompt: "Spices, aroma, water volume…" },
      { label: "Tea simmer", durationSeconds: 180, temperatureC: null, notes: null, notePrompt: "Tea strength and colour…" },
      { label: "Milk and sweetener finish", durationSeconds: 180, temperatureC: null, notes: null, notePrompt: "Ratio, sweetness, final texture…" }
    ]
  },
  {
    id: "karak_chai", group: "stovetop", label: "Karak / kadak chai", durationUnit: "minutes", stageNoun: "stage",
    summary: "A strong, sweet milk tea reduced on the stove, often with cardamom.", vesselSuggestion: "Saucepan and strainer",
    setupGuidance: ["Record tea strength, milk type, sugar, and aromatics.", "Control the simmer so concentration develops without scorching."],
    stages: [
      { label: "Tea and spice boil", durationSeconds: 240, temperatureC: null, notes: null, notePrompt: "Tea, cardamom, colour…" },
      { label: "Milk reduction", durationSeconds: 300, temperatureC: null, notes: null, notePrompt: "Reduction, sweetness, body…" },
      { label: "Strain and serve", durationSeconds: null, temperatureC: null, notes: null, notePrompt: "Final balance and texture…" }
    ]
  },
  {
    id: "turkish_cay", group: "stovetop", label: "Turkish çay", durationUnit: "minutes", stageNoun: "stage",
    summary: "Strong tea concentrate is prepared in a stacked çaydanlık and diluted per glass.", vesselSuggestion: "Çaydanlık or stacked kettles",
    setupGuidance: ["Brew concentrate in the upper pot while water heats below.", "Record the concentrate-to-water ratio used for each glass."],
    stages: [
      { label: "Concentrate steep", durationSeconds: 900, temperatureC: null, notes: null, notePrompt: "Leaf amount, colour, readiness…" },
      { label: "Dilute and serve", durationSeconds: null, temperatureC: null, notes: null, notePrompt: "Light or strong ratio, sugar, glass…" }
    ], repeatable: true, nextStageLabel: "Serving"
  },
  {
    id: "moroccan_mint", group: "stovetop", label: "Moroccan mint tea", durationUnit: "minutes", stageNoun: "stage",
    summary: "Green tea, mint, and sugar are rinsed, infused, mixed, and poured high.", vesselSuggestion: "Moroccan teapot or heat-safe pot",
    setupGuidance: ["Record the green tea, mint, and sugar proportions.", "Mix consistently before judging the final glass."],
    stages: [
      { label: "Rinse tea", durationSeconds: 30, temperatureC: null, notes: null, notePrompt: "Rinse colour and leaf aroma…" },
      { label: "Mint and sugar infusion", durationSeconds: 900, temperatureC: null, notes: null, notePrompt: "Mint, sweetness, strength…" },
      { label: "Mix and high pour", durationSeconds: null, temperatureC: null, notes: null, notePrompt: "Aeration, foam, final balance…" }
    ]
  },
  {
    id: "samovar", group: "stovetop", label: "Samovar / zavarka", durationUnit: "minutes", stageNoun: "stage",
    summary: "A strong zavarka concentrate is held warm and diluted with hot water to serve.", vesselSuggestion: "Samovar and small teapot, or kettle equivalent",
    setupGuidance: ["Prepare the concentrate separately from the hot dilution water.", "Record both concentrate strength and serving ratio."],
    stages: [
      { label: "Zavarka concentrate", durationSeconds: 600, temperatureC: null, notes: null, notePrompt: "Tea amount, strength, aroma…" },
      { label: "Dilute and serve", durationSeconds: null, temperatureC: null, notes: null, notePrompt: "Concentrate ratio, additions, balance…" }
    ], repeatable: true, nextStageLabel: "Serving"
  },
  {
    id: "kashmiri_kahwa", group: "stovetop", label: "Kashmiri kahwa", durationUnit: "minutes", stageNoun: "stage",
    summary: "Green tea is infused with warm spices and finished with chosen garnishes.", vesselSuggestion: "Saucepan, kettle, or samovar",
    setupGuidance: ["Record saffron, cardamom, cinnamon, nuts, and sweetener separately.", "Add delicate green tea late enough to avoid masking it with the spice decoction."],
    stages: [
      { label: "Spice and saffron infusion", durationSeconds: 300, temperatureC: null, notes: null, notePrompt: "Spice proportions and aroma…" },
      { label: "Green tea infusion", durationSeconds: 120, temperatureC: null, notes: null, notePrompt: "Tea strength and balance…" },
      { label: "Garnish and serve", durationSeconds: null, temperatureC: null, notes: null, notePrompt: "Nuts, sweetness, final aroma…" }
    ]
  },
  {
    id: "hong_kong_milk_tea", group: "stovetop", label: "Hong Kong–style milk tea", durationUnit: "minutes", stageNoun: "stage",
    summary: "A robust tea blend is repeatedly extracted and strained, then balanced with milk.", vesselSuggestion: "Kettle or pot with cloth or fine strainer",
    setupGuidance: ["Record the tea blend, extraction cycles, and straining method.", "Taste the tea base before adding evaporated or condensed milk."],
    stages: [
      { label: "Tea extraction", durationSeconds: 720, temperatureC: null, notes: null, notePrompt: "Blend, colour, aroma, strength…" },
      { label: "Strain or pull", durationSeconds: null, temperatureC: null, notes: null, notePrompt: "Number of passes and texture…" },
      { label: "Milk finish", durationSeconds: null, temperatureC: null, notes: null, notePrompt: "Milk ratio, sweetness, final body…" }
    ]
  },
  {
    id: "herbal_decoction", group: "other", label: "Herbal decoction", durationUnit: "minutes", stageNoun: "stage",
    summary: "Hardy roots, bark, seeds, or spices are simmered rather than briefly infused.", vesselSuggestion: "Covered saucepan",
    setupGuidance: ["Identify every botanical and use only ingredients known to be food-safe.", "Record simmer intensity and final volume as liquid reduces."],
    stages: [
      { label: "Covered simmer", durationSeconds: 900, temperatureC: null, notes: null, notePrompt: "Ingredients, aroma, reduction…" },
      { label: "Rest and strain", durationSeconds: 300, temperatureC: null, notes: null, notePrompt: "Final strength, colour, additions…" }
    ]
  },
  {
    id: "custom", group: "other", label: "Custom method", durationUnit: "minutes", stageNoun: "stage",
    summary: "Build a stage plan for a preparation that does not fit the listed methods.", vesselSuggestion: "Your chosen vessel",
    setupGuidance: ["Name each stage so the method is repeatable.", "Record time, temperature, and what changed at every stage."],
    stages: [{ label: "Stage 1", durationSeconds: null, temperatureC: null, notes: null, notePrompt: "What happened in this stage?" }],
    repeatable: true, nextStageLabel: "Stage"
  }
];

const stylesById = new Map(TEA_LAB_BREWING_STYLES.map(style => [style.id, style]));

export function getTeaLabBrewingStyle(style: TeaLabBrewingStyle | null | undefined): TeaLabBrewingStyleDefinition | null {
  return style ? stylesById.get(style) ?? null : null;
}

export function teaLabBrewingStyleLabel(style: TeaLabBrewingStyle | null | undefined): string | null {
  return getTeaLabBrewingStyle(style)?.label ?? null;
}

export function createDefaultTeaLabBrewStages(style: TeaLabBrewingStyle): TeaLabBrewStageDraft[] {
  return getTeaLabBrewingStyle(style)?.stages.map(({ label, durationSeconds, temperatureC, notes }) => ({
    label,
    durationSeconds: durationSeconds ?? null,
    temperatureC: temperatureC ?? null,
    notes: notes ?? null
  })) ?? [];
}

export function nextTeaLabBrewStageLabel(style: TeaLabBrewingStyle, stages: TeaLabBrewStageDraft[]): string {
  const definition = getTeaLabBrewingStyle(style);
  const base = definition?.nextStageLabel ?? "Stage";
  const number = stages.filter(stage => stage.label.toLocaleLowerCase("en-CA").includes(base.toLocaleLowerCase("en-CA"))).length + 1;
  return `${base} ${number}`;
}

export function durationSecondsToInput(seconds: number | null | undefined, unit: TeaLabBrewDurationUnit): string | number {
  if (seconds === null || seconds === undefined) return "";
  const divisor = unit === "hours" ? 3600 : unit === "minutes" ? 60 : 1;
  return Number((seconds / divisor).toFixed(2));
}

export function durationInputToSeconds(value: string, unit: TeaLabBrewDurationUnit): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const multiplier = unit === "hours" ? 3600 : unit === "minutes" ? 60 : 1;
  return Math.max(1, Math.round(parsed * multiplier));
}

export function formatTeaLabDuration(seconds: number | null | undefined): string | null {
  if (!Number.isFinite(seconds) || !seconds || seconds < 1) return null;
  let remaining = Math.round(seconds);
  const hours = Math.floor(remaining / 3600);
  remaining %= 3600;
  const minutes = Math.floor(remaining / 60);
  const trailingSeconds = remaining % 60;
  return [
    hours ? `${hours} hr` : null,
    minutes ? `${minutes} min` : null,
    trailingSeconds ? `${trailingSeconds} sec` : null
  ].filter(Boolean).join(" ");
}
