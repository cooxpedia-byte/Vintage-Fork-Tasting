import { findTeaDescriptor } from "@/lib/tea-lab/descriptors";

export type GroupRevealState = "hidden" | "aroma" | "taste" | "combined" | "timeline" | "fingerprint";
export type SensoryModality = "aroma" | "taste";

export type SensoryResponseInput = {
  participantId: string;
  aromaDescriptors: string[];
  aromaIntensity: "subtle" | "clear" | "dominant" | null;
  tasteDescriptors: string[];
  tasteIntensity: "subtle" | "clear" | "dominant" | null;
};

export type RevealAggregateItem = {
  key: string;
  label: string;
  participantCount: number;
  participantTotal: number;
  prevalence: number;
  breadth: number;
  averageIntensity: number;
  medianIntensity: number;
  heat: number;
  prominence: number;
  strengthLabel: "Unique observation" | "People noticed" | "Most common";
  detailsSuppressed: boolean;
};

export type RevealLayer = {
  modality: SensoryModality;
  contributionCount: number;
  items: RevealAggregateItem[];
};

export type RevealOverlap = {
  key: string;
  label: string;
  aromaCount: number;
  tasteCount: number;
  strength: number;
}[];

export type RevealTimelineEvent = {
  id: string;
  kind: "brew" | "aroma" | "sip" | "tasting" | "breakout" | "discussion" | "cooling" | "tables";
  label: string;
  occurredAt: string;
  detail: string;
  postReveal: boolean;
};

export type GroupRevealRoomCard = {
  id: string;
  roomNumber: number;
  participantCount: number;
  flavors: string[];
  curiosity: string | null;
  lockedAt: string | null;
};

export type GroupRevealSnapshot = {
  state: GroupRevealState;
  revealedAt: string | null;
  highlightedFlavor: string | null;
  timelineIndex: number | null;
  producerNotesVisible: boolean;
  coverage: {
    participantCount: number;
    aromaContributors: number;
    tasteContributors: number;
    roomCardCount: number;
    postRevealEntries: number;
  };
  aroma: RevealLayer | null;
  taste: RevealLayer | null;
  overlap: RevealOverlap;
  timeline: RevealTimelineEvent[];
  roomCards: GroupRevealRoomCard[];
  fingerprint: Record<string, unknown> | null;
  fingerprintVersion: number;
  frozenAt: string | null;
  privateComparison?: {
    aroma: { shared: string[]; personal: string[] };
    taste: { shared: string[]; personal: string[] };
  };
};

const INTENSITY_SCORE = { subtle: 35, clear: 65, dominant: 90 } as const;
const JUDGMENT_WORDS = /\b(correct|wrong|outlier|missed|best|worst)\b/i;

export function sensoryIntensityScore(value: SensoryResponseInput["aromaIntensity"]) {
  return value ? INTENSITY_SCORE[value] : 50;
}

export function sensoryKey(value: string) {
  return value.trim().toLocaleLowerCase("en-CA").replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
}

function sensoryLabel(value: string) {
  const clean = value.replace(/\s+/g, " ").trim().slice(0, 80);
  return findTeaDescriptor(clean)?.label ?? clean;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle]! : Math.round((ordered[middle - 1]! + ordered[middle]!) / 2);
}

export function buildRevealLayer(responses: SensoryResponseInput[], modality: SensoryModality): RevealLayer {
  const contributing = responses.filter(response => (modality === "aroma" ? response.aromaDescriptors : response.tasteDescriptors).length > 0);
  const observations = new Map<string, { label: string; participants: Set<string>; intensities: number[] }>();
  for (const response of contributing) {
    const descriptors = modality === "aroma" ? response.aromaDescriptors : response.tasteDescriptors;
    const intensity = sensoryIntensityScore(modality === "aroma" ? response.aromaIntensity : response.tasteIntensity);
    const seen = new Set<string>();
    for (const descriptor of descriptors) {
      const label = sensoryLabel(descriptor);
      const key = sensoryKey(label);
      if (!key || seen.has(key) || JUDGMENT_WORDS.test(label)) continue;
      seen.add(key);
      const current = observations.get(key) ?? { label, participants: new Set<string>(), intensities: [] };
      current.participants.add(response.participantId);
      current.intensities.push(intensity);
      observations.set(key, current);
    }
  }
  const total = contributing.length;
  const items = [...observations.entries()].map(([key, observation]): RevealAggregateItem => {
    const participantCount = observation.participants.size;
    const prevalence = total ? participantCount / total : 0;
    const averageIntensity = observation.intensities.length
      ? Math.round(observation.intensities.reduce((sum, value) => sum + value, 0) / observation.intensities.length)
      : 0;
    const medianIntensity = median(observation.intensities);
    return {
      key,
      label: observation.label,
      participantCount,
      participantTotal: total,
      prevalence,
      breadth: Math.round(prevalence * 100),
      averageIntensity,
      medianIntensity,
      heat: medianIntensity,
      prominence: Math.round(prevalence * (0.65 + 0.35 * medianIntensity / 100) * 100),
      strengthLabel: participantCount === 1 ? "Unique observation" : prevalence >= 0.5 ? "Most common" : "People noticed",
      detailsSuppressed: total < 3
    };
  }).sort((left, right) => right.prominence - left.prominence || right.participantCount - left.participantCount || left.label.localeCompare(right.label, "en-CA"));
  return { modality, contributionCount: total, items };
}

export function buildRevealOverlap(aroma: RevealLayer, taste: RevealLayer): RevealOverlap {
  const tasteByKey = new Map(taste.items.map(item => [item.key, item]));
  return aroma.items.flatMap(aromaItem => {
    const tasteItem = tasteByKey.get(aromaItem.key);
    return tasteItem ? [{
      key: aromaItem.key,
      label: aromaItem.label,
      aromaCount: aromaItem.participantCount,
      tasteCount: tasteItem.participantCount,
      strength: Math.round((aromaItem.prominence + tasteItem.prominence) / 2)
    }] : [];
  }).sort((left, right) => right.strength - left.strength || left.label.localeCompare(right.label, "en-CA"));
}

export function buildPrivateComparison(response: SensoryResponseInput | null, aroma: RevealLayer, taste: RevealLayer) {
  const compare = (values: string[], layer: RevealLayer) => {
    const group = new Set(layer.items.filter(item=>item.participantCount>=2).map(item => item.key));
    const labels = values.map(sensoryLabel).filter(Boolean);
    return {
      shared: labels.filter(label => group.has(sensoryKey(label))),
      personal: labels.filter(label => !group.has(sensoryKey(label)))
    };
  };
  return {
    aroma: compare(response?.aromaDescriptors ?? [], aroma),
    taste: compare(response?.tasteDescriptors ?? [], taste)
  };
}

export function revealStateShows(state: GroupRevealState, modality: SensoryModality) {
  if (state === "hidden") return false;
  if (state === modality) return true;
  return ["combined", "timeline", "fingerprint"].includes(state);
}
