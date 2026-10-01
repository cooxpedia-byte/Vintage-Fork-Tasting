import {
  mapLiveEventToJournalSession,
  mapSoloSessionToJournalSession,
  type JournalCard,
  type LiveJournalEventRow,
  type SoloJournalSessionRow
} from "@/lib/tea-lab/journal";

export type CellarRecord = {
  id: string;
  source: "live" | "solo";
  teaName: string;
  origin: string | null;
  recordedAt: string;
  contextLabel: string;
  archived: boolean;
  card: JournalCard;
};

/** Personal history is independent of stamps, prices, wallet state and trading eligibility. */
export function buildCellarRecords(liveEvents: LiveJournalEventRow[], soloRows: SoloJournalSessionRow[]): CellarRecord[] {
  const sessions = [
    ...liveEvents.map(event => {
      const session = mapLiveEventToJournalSession(event);
      // The older journal adapter dates cards by stamp release. Personal records
      // use the saved response's completion date without granting a stamp.
      const recordedDates = new Map(event.responses.map(response => [response.id, response.completed_at ?? response.stamp_released_at]));
      return { ...session, cards: session.cards.map(card => ({ ...card, completedAt: recordedDates.get(card.sourceId) ?? null })) };
    }),
    ...soloRows.map(mapSoloSessionToJournalSession)
  ];
  const records = sessions.flatMap(session => session.cards.flatMap(card => {
    if (!card.completedAt || session.status !== "completed") return [];
    return [{
      id: card.id,
      source: card.source,
      teaName: card.teaName,
      origin: card.origin,
      recordedAt: card.completedAt,
      contextLabel: session.contextLabel,
      archived: session.archivedAt !== null,
      card
    }];
  }));
  return [...new Map(records.map(record => [record.id, record])).values()]
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt) || left.id.localeCompare(right.id));
}
