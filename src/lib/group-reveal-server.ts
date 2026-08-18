import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildPrivateComparison,
  buildRevealLayer,
  buildRevealOverlap,
  type GroupRevealRoomCard,
  type GroupRevealSnapshot,
  type GroupRevealState,
  type RevealTimelineEvent,
  type SensoryResponseInput
} from "@/lib/group-reveal";

type Observation = {
  aromaDescriptors?: unknown;
  descriptors?: unknown;
  conductorStage?: unknown;
};

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function timelineEvent(id: string, kind: RevealTimelineEvent["kind"], label: string, occurredAt: string, detail: string, revealedAt: string | null): RevealTimelineEvent {
  return { id, kind, label, occurredAt, detail, postReveal: Boolean(revealedAt && new Date(occurredAt).getTime() > new Date(revealedAt).getTime()) };
}

function buildTimeline({ revisions, brews, cards, revealedAt }: {
  revisions: Array<{ id: number; source: string; observation: Observation; created_at: string }>;
  brews: Array<{ id: string; infusion_number: number; started_at: string; completed_at: string | null }>;
  cards: GroupRevealRoomCard[];
  revealedAt: string | null;
}) {
  const events: RevealTimelineEvent[] = [];
  for (const brew of brews) events.push(timelineEvent(`brew-${brew.id}`, "brew", `Infusion ${brew.infusion_number} began`, brew.started_at, "Shared brew clock", revealedAt));
  const ordered = [...revisions].sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime());
  const firstAroma = ordered.find(revision => stringList(revision.observation?.aromaDescriptors).length > 0);
  const firstSip = ordered.find(revision => stringList(revision.observation?.descriptors).length > 0);
  const breakout = ordered.find(revision => revision.source === "breakout");
  const afterDiscussion = ordered.find(revision => ["reveal", "debrief"].includes(String(revision.observation?.conductorStage ?? "")) || Boolean(revealedAt && new Date(revision.created_at).getTime() > new Date(revealedAt).getTime()));
  if (firstAroma) events.push(timelineEvent(`aroma-${firstAroma.id}`, "aroma", "Early aroma", firstAroma.created_at, "The first aroma language arrived", revealedAt));
  if (firstSip) events.push(timelineEvent(`sip-${firstSip.id}`, "sip", "First sip", firstSip.created_at, "Taste observations began", revealedAt));
  if (ordered.length > 1) {
    const middle = ordered[Math.floor(ordered.length / 2)]!;
    events.push(timelineEvent(`middle-${middle.id}`, "tasting", "Mid-tasting", middle.created_at, "The group portrait continued to form", revealedAt));
  }
  if (breakout) events.push(timelineEvent(`breakout-${breakout.id}`, "breakout", "Small-table discovery", breakout.created_at, "A table observation was added", revealedAt));
  if (afterDiscussion) events.push(timelineEvent(`discussion-${afterDiscussion.id}`, "discussion", "After discussion", afterDiscussion.created_at, "A later observation was recorded", revealedAt));
  const firstRevisionAt = ordered[0] ? new Date(ordered[0].created_at).getTime() : 0;
  const lastRevision = ordered.at(-1);
  if (lastRevision && new Date(lastRevision.created_at).getTime() - firstRevisionAt >= 5 * 60_000) {
    events.push(timelineEvent(`cooling-${lastRevision.id}`, "cooling", "As the tea cooled", lastRevision.created_at, "The latest tasting language arrived", revealedAt));
  }
  const lockedCards = cards.filter(card => card.lockedAt);
  if (lockedCards.length) {
    const occurredAt = lockedCards.map(card => card.lockedAt!).sort()[0]!;
    events.push(timelineEvent("tables-gathered", "tables", "Tables gathered", occurredAt, `${lockedCards.length} room card${lockedCards.length === 1 ? "" : "s"} returned`, revealedAt));
  }
  const unique = new Map(events.map(event => [`${event.kind}:${event.occurredAt}`, event]));
  return [...unique.values()].sort((left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime());
}

export async function loadGroupRevealSnapshot({ admin, eventId, eventFlightItemId, participantId = null }: {
  admin: SupabaseClient;
  eventId: string;
  eventFlightItemId: string | null;
  participantId?: string | null;
}): Promise<GroupRevealSnapshot | null> {
  if (!eventFlightItemId) return null;
  const [revealResult, participantsResult, responsesResult, revisionsResult, cardsResult, brewsResult] = await Promise.all([
    admin.from("event_group_reveals").select("reveal_state,revealed_at,highlighted_flavor,timeline_index,producer_notes_visible,fingerprint,fingerprint_version,frozen_at").eq("event_id", eventId).eq("event_flight_item_id", eventFlightItemId).maybeSingle(),
    admin.from("participants").select("id").eq("event_id", eventId).in("status", ["registered","waiting","admitted","active"]),
    admin.from("tea_responses").select("participant_id,aroma_descriptors,aroma_intensity,descriptors,intensity").eq("event_flight_item_id", eventFlightItemId),
    admin.from("tea_response_revisions").select("id,source,observation,created_at").eq("event_flight_item_id", eventFlightItemId).order("created_at"),
    admin.from("room_discovery_cards").select("id,breakout_room_id,participant_ids,curiosity,locked_at").eq("event_id", eventId).eq("event_flight_item_id", eventFlightItemId).order("created_at"),
    admin.from("event_brews").select("id,infusion_number,started_at,completed_at").eq("event_id", eventId).eq("event_flight_item_id", eventFlightItemId).order("started_at")
  ]);
  for (const result of [revealResult, participantsResult, responsesResult, revisionsResult, cardsResult, brewsResult]) if (result.error) throw result.error;

  const responseInputs: SensoryResponseInput[] = (responsesResult.data ?? []).map(response => ({
    participantId: response.participant_id,
    aromaDescriptors: stringList(response.aroma_descriptors),
    aromaIntensity: response.aroma_intensity as SensoryResponseInput["aromaIntensity"],
    tasteDescriptors: stringList(response.descriptors),
    tasteIntensity: response.intensity as SensoryResponseInput["tasteIntensity"]
  }));
  const aroma = buildRevealLayer(responseInputs, "aroma");
  const taste = buildRevealLayer(responseInputs, "taste");
  const cardRows = cardsResult.data ?? [];
  const roomIds = cardRows.map(card => card.breakout_room_id);
  const [roomsResult, itemsResult] = await Promise.all([
    roomIds.length ? admin.from("event_breakout_rooms").select("id,room_number").in("id", roomIds) : Promise.resolve({ data: [], error: null }),
    cardRows.length ? admin.from("room_discovery_card_items").select("card_id,item_text,category,prevalence_count").in("card_id", cardRows.map(card => card.id)).is("removed_at", null).order("prevalence_count", { ascending: false, nullsFirst: false }) : Promise.resolve({ data: [], error: null })
  ]);
  if (roomsResult.error) throw roomsResult.error;
  if (itemsResult.error) throw itemsResult.error;
  const roomNumbers = new Map<string,number>((roomsResult.data ?? []).map(room => [String(room.id), Number(room.room_number)] as const));
  const roomCards: GroupRevealRoomCard[] = cardRows.map(card => ({
    id: card.id,
    roomNumber: roomNumbers.get(card.breakout_room_id) ?? 0,
    participantCount: Array.isArray(card.participant_ids) ? card.participant_ids.length : 0,
    flavors: (itemsResult.data ?? []).filter(item => item.card_id === card.id && ["shared", "unique", "changed"].includes(item.category)).slice(0, 5).map(item => String(item.item_text)),
    curiosity: card.curiosity,
    lockedAt: card.locked_at
  })).sort((left, right) => left.roomNumber - right.roomNumber);
  const reveal = revealResult.data;
  const state = (reveal?.reveal_state ?? "hidden") as GroupRevealState;
  const revealedAt = reveal?.revealed_at ?? null;
  const revisions = (revisionsResult.data ?? []) as Array<{ id: number; source: string; observation: Observation; created_at: string }>;
  const timeline = buildTimeline({ revisions, brews: brewsResult.data ?? [], cards: roomCards, revealedAt });
  const postRevealEntries = revealedAt ? revisions.filter(revision => new Date(revision.created_at).getTime() > new Date(revealedAt).getTime()).length : 0;
  const layersVisible = state !== "hidden";
  const ownResponse = participantId ? responseInputs.find(response => response.participantId === participantId) ?? null : null;
  return {
    state,
    revealedAt,
    highlightedFlavor: reveal?.highlighted_flavor ?? null,
    timelineIndex: reveal?.timeline_index ?? null,
    producerNotesVisible: Boolean(reveal?.producer_notes_visible),
    coverage: {
      participantCount: participantsResult.data?.length ?? 0,
      aromaContributors: aroma.contributionCount,
      tasteContributors: taste.contributionCount,
      roomCardCount: roomCards.length,
      postRevealEntries
    },
    aroma: layersVisible ? aroma : null,
    taste: layersVisible ? taste : null,
    overlap: layersVisible ? buildRevealOverlap(aroma, taste) : [],
    timeline: layersVisible ? timeline : [],
    roomCards: layersVisible ? roomCards : [],
    fingerprint: reveal?.fingerprint && typeof reveal.fingerprint === "object" ? reveal.fingerprint as Record<string, unknown> : null,
    fingerprintVersion: Number(reveal?.fingerprint_version ?? 0),
    frozenAt: reveal?.frozen_at ?? null,
    ...(participantId && layersVisible ? { privateComparison: buildPrivateComparison(ownResponse, aroma, taste) } : {})
  };
}

export function groupRevealFingerprint({ snapshot, event, tea, brews }: {
  snapshot: GroupRevealSnapshot;
  event: { id: string; title: string };
  tea: { id: string; title: string; name: string | null; origin: string | null };
  brews: Array<{ infusion_number: number; duration_ms: number; started_at: string; completed_at: string | null }>;
}) {
  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    event,
    tea,
    brewContext: brews,
    participantCount: snapshot.coverage.participantCount,
    contributionCoverage: snapshot.coverage,
    aroma: snapshot.aroma,
    taste: snapshot.taste,
    overlap: snapshot.overlap,
    roomCards: snapshot.roomCards,
    timeline: snapshot.timeline
  };
}
