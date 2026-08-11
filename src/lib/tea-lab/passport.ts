import {
  mapLiveEventToJournalSession,
  mapSoloSessionToJournalSession,
  type JournalCard,
  type JournalSealClass,
  type LiveJournalEventRow,
  type SoloJournalSessionRow
} from "@/lib/tea-lab/journal";

export type PassportSeal = {
  id: string;
  sealClass: JournalSealClass;
  label: "Live Event Verified" | "Documented Tasting";
  source: "live" | "solo";
  sourceId: string;
  teaName: string;
  origin: string | null;
  earnedAt: string;
  contextLabel: string;
  archived: boolean;
  card?: JournalCard;
};

export function cardForPassportSeal(seal: PassportSeal): JournalCard {
  return seal.card ?? {
    id: `${seal.source}:${seal.sourceId}`,
    source: seal.source,
    sourceId: seal.sourceId,
    teaName: seal.teaName,
    origin: seal.origin,
    rating: null,
    intensity: null,
    descriptors: [],
    firstImpression: null,
    personalNotes: null,
    completedAt: seal.earnedAt,
    saved: false,
    position: 1,
    sealClass: seal.sealClass,
    brewing: null,
    photos: []
  };
}

export function buildPassportSeals(
  liveEvents: LiveJournalEventRow[],
  soloRows: SoloJournalSessionRow[]
): PassportSeal[] {
  const sessions = [
    ...liveEvents.map(mapLiveEventToJournalSession),
    ...soloRows.map(mapSoloSessionToJournalSession)
  ];
  const seals = sessions.flatMap(session => session.cards.flatMap(card => {
    if (!card.sealClass || !card.completedAt || session.status !== "completed") return [];
    return [{
      id: `${card.sealClass}:${card.sourceId}`,
      sealClass: card.sealClass,
      label: card.sealClass === "live_event_verified" ? "Live Event Verified" as const : "Documented Tasting" as const,
      source: card.source,
      sourceId: card.sourceId,
      teaName: card.teaName,
      origin: card.origin,
      earnedAt: card.completedAt,
      contextLabel: session.contextLabel,
      archived: session.archivedAt !== null,
      card
    }];
  }));

  return [...new Map(seals.map(seal => [seal.id, seal])).values()]
    .sort((left, right) => right.earnedAt.localeCompare(left.earnedAt) || left.id.localeCompare(right.id));
}
