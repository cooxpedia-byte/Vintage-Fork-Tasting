import type { TeaLabBrewingStyle } from "@/lib/tea-lab/offline";
import { findTeaDescriptor } from "@/lib/tea-lab/descriptors";

export type JournalSource = "live" | "solo";
export type JournalSealClass = "live_event_verified" | "documented_tasting";
export type JournalSessionStatus = "draft" | "in_progress" | "completed";

export type JournalDescriptor = {
  stableId: string | null;
  label: string;
  mapped: boolean;
};

export type JournalBrewing = {
  style: TeaLabBrewingStyle | null;
  leafGrams: number | null;
  waterMl: number | null;
  waterTemperatureC: number | null;
  waterSource: string | null;
  vessel: string | null;
  initialSteepSeconds: number | null;
  instructions: string | null;
  preparationNotes: string | null;
  stages: Array<{
    label: string;
    durationSeconds: number | null;
    temperatureC: number | null;
    notes: string | null;
  }>;
};

export type JournalPhoto = {
  id: string;
  url: string;
  altText: string | null;
  createdAt: string;
};

export type JournalCard = {
  id: string;
  source: JournalSource;
  sourceId: string;
  teaName: string;
  origin: string | null;
  producer?: string | null;
  teaType?: string | null;
  cultivar?: string | null;
  harvest?: string | null;
  productIdentifier?: string | null;
  lotCode?: string | null;
  rating: number | null;
  intensity: string | null;
  descriptors: JournalDescriptor[];
  firstImpression: string | null;
  personalNotes: string | null;
  completedAt: string | null;
  saved: boolean;
  position: number;
  sealClass: JournalSealClass | null;
  brewing?: JournalBrewing | null;
  photos?: JournalPhoto[];
};

export type JournalSession = {
  id: string;
  source: JournalSource;
  sourceId: string;
  title: string;
  occurredAt: string;
  timeZone?: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  revision: number | null;
  status: JournalSessionStatus;
  contextLabel: string;
  cards: JournalCard[];
};

export type LiveJournalResponseRow = {
  id: string;
  rating: number | null;
  first_impression: string | null;
  personal_notes: string | null;
  descriptors: string[];
  intensity: string | null;
  saved: boolean;
  completed_at: string | null;
  flight: {
    id: string;
    reveal_title: string;
    position: number;
    brewing_instructions?: string | null;
    steep_seconds?: number | null;
    temperature_c?: number | null;
    leaf_grams?: number | null;
    water_ml?: number | null;
    tea: {
      id?: string;
      name: string;
      producer?: string | null;
      origin: string | null;
      tea_type?: string | null;
    } | null;
  } | null;
};

export type LiveJournalEventRow = {
  id: string;
  title: string;
  starts_at: string;
  timezone?: string | null;
  location_mode: string;
  participant_id: string;
  responses: LiveJournalResponseRow[];
};

type OneOrMany<T> = T | T[] | null;

export type SoloJournalSessionRow = {
  id: string;
  kind: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  archived_at: string | null;
  revision: number;
  cards: Array<{
    id: string;
    position: number;
    canonical_tea_id?: string | null;
    personal_tea_record_id?: string | null;
    tea_name_snapshot: string;
    producer_snapshot?: string | null;
    origin_snapshot: string | null;
    tea_type_snapshot?: string | null;
    cultivar_snapshot?: string | null;
    harvest_snapshot?: string | null;
    product_identifier_snapshot?: string | null;
    lot_code_snapshot?: string | null;
    rating: number | null;
    intensity: string | null;
    completed_at: string | null;
    brewing?: OneOrMany<{
      brewing_style?: TeaLabBrewingStyle | null;
      leaf_grams: number | null;
      water_ml: number | null;
      water_temperature_c: number | null;
      water_source: string | null;
      vessel: string | null;
      initial_steep_seconds: number | null;
      preparation_notes?: string | null;
    }>;
    brew_stages?: Array<{
      stage_number: number;
      label: string;
      duration_seconds: number | null;
      temperature_c: number | null;
      notes: string | null;
    }> | null;
    photos?: Array<{
      id: string;
      storage_path: string;
      signed_url?: string | null;
      alt_text: string | null;
      created_at: string;
      upload_status: string;
    }> | null;
    private_notes: OneOrMany<{
      first_impression: string | null;
      personal_notes: string | null;
    }>;
    descriptor_links: Array<{
      descriptor_id: string;
      position: number;
      descriptor: OneOrMany<{ id: string; label: string }>;
    }> | null;
  }> | null;
};

function first<T>(value: OneOrMany<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map(item => [item.id, item])).values()];
}

export function mapLegacyJournalDescriptor(label: string): JournalDescriptor {
  const displayLabel = label.trim();
  const definition = findTeaDescriptor(displayLabel);

  return {
    stableId: definition?.id ?? null,
    label: definition?.label ?? displayLabel,
    mapped: definition !== null
  };
}

export function mapLiveEventToJournalSession(event: LiveJournalEventRow): JournalSession {
  const cards = uniqueById(event.responses.map(response => ({
    id: `live:${response.id}`,
    source: "live" as const,
    sourceId: response.id,
    teaName: response.flight?.tea?.name ?? response.flight?.reveal_title ?? "Tea",
    origin: response.flight?.tea?.origin ?? null,
    producer: response.flight?.tea?.producer ?? null,
    teaType: response.flight?.tea?.tea_type ?? null,
    rating: response.rating,
    intensity: response.intensity,
    descriptors: response.descriptors.map(mapLegacyJournalDescriptor),
    firstImpression: response.first_impression,
    personalNotes: response.personal_notes,
    completedAt: response.completed_at,
    saved: response.saved,
    position: response.flight?.position ?? 0,
    sealClass: response.completed_at ? "live_event_verified" as const : null,
    brewing: response.flight ? {
      style: null,
      leafGrams: response.flight.leaf_grams ?? null,
      waterMl: response.flight.water_ml ?? null,
      waterTemperatureC: response.flight.temperature_c ?? null,
      waterSource: null,
      vessel: null,
      initialSteepSeconds: response.flight.steep_seconds ?? null,
      instructions: response.flight.brewing_instructions ?? null,
      preparationNotes: null,
      stages: []
    } : null,
    photos: []
  }))).sort((left, right) => left.position - right.position);
  const completionTimes = cards.flatMap(card => card.completedAt ? [card.completedAt] : []).sort();

  return {
    id: `live-session:${event.id}:${event.participant_id}`,
    source: "live",
    sourceId: event.id,
    title: event.title,
    occurredAt: event.starts_at,
    timeZone: event.timezone ?? null,
    completedAt: completionTimes.at(-1) ?? null,
    archivedAt: null,
    revision: null,
    status: "completed",
    contextLabel: event.location_mode === "remote" ? "Remote" : "In person",
    cards
  };
}

export function mapSoloSessionToJournalSession(row: SoloJournalSessionRow): JournalSession {
  const status: JournalSessionStatus = row.status === "completed"
    ? "completed"
    : row.status === "in_progress" ? "in_progress" : "draft";
  const cards = uniqueById((row.cards ?? []).map(card => {
    const notes = first(card.private_notes);
    const brewing = first(card.brewing ?? null);
    const descriptors = [...(card.descriptor_links ?? [])]
      .sort((left, right) => left.position - right.position)
      .flatMap(link => {
        const descriptor = first(link.descriptor);
        return descriptor ? [{ stableId: descriptor.id, label: descriptor.label, mapped: true }] : [];
      });

    return {
      id: `solo:${card.id}`,
      source: "solo" as const,
      sourceId: card.id,
      teaName: card.tea_name_snapshot,
      origin: card.origin_snapshot,
      producer: card.producer_snapshot ?? null,
      teaType: card.tea_type_snapshot ?? null,
      cultivar: card.cultivar_snapshot ?? null,
      harvest: card.harvest_snapshot ?? null,
      productIdentifier: card.product_identifier_snapshot ?? null,
      lotCode: card.lot_code_snapshot ?? null,
      rating: card.rating,
      intensity: card.intensity,
      descriptors,
      firstImpression: notes?.first_impression ?? null,
      personalNotes: notes?.personal_notes ?? null,
      completedAt: card.completed_at,
      saved: false,
      position: card.position,
      sealClass: card.completed_at ? "documented_tasting" as const : null,
      brewing: brewing ? {
        style: brewing.brewing_style ?? null,
        leafGrams: brewing.leaf_grams,
        waterMl: brewing.water_ml,
        waterTemperatureC: brewing.water_temperature_c,
        waterSource: brewing.water_source,
        vessel: brewing.vessel,
        initialSteepSeconds: brewing.initial_steep_seconds,
        instructions: null,
        preparationNotes: brewing.preparation_notes ?? null,
        stages: [...(card.brew_stages ?? [])]
          .sort((left, right) => left.stage_number - right.stage_number)
          .map(stage => ({
            label: stage.label,
            durationSeconds: stage.duration_seconds,
            temperatureC: stage.temperature_c,
            notes: stage.notes
          }))
      } : null,
      photos: (card.photos ?? []).flatMap(photo => photo.upload_status === "ready" && photo.signed_url ? [{
        id: photo.id,
        url: photo.signed_url,
        altText: photo.alt_text,
        createdAt: photo.created_at
      }] : [])
    };
  })).sort((left, right) => left.position - right.position);

  return {
    id: `solo-session:${row.id}`,
    source: "solo",
    sourceId: row.id,
    title: "Solo tasting",
    occurredAt: row.completed_at ?? row.started_at,
    timeZone: null,
    completedAt: row.completed_at,
    archivedAt: row.archived_at,
    revision: row.revision,
    status,
    contextLabel: "Personal session",
    cards
  };
}

export function buildJournalSessions(
  liveEvents: LiveJournalEventRow[],
  soloRows: SoloJournalSessionRow[]
): JournalSession[] {
  const liveSessions = liveEvents.map(mapLiveEventToJournalSession);
  const soloSessions = soloRows
    .map(mapSoloSessionToJournalSession)
    .filter(session => session.status === "completed" && session.archivedAt === null)
    .map(session => ({
      ...session,
      cards: session.cards.filter(card => card.completedAt !== null)
    }))
    .filter(session => session.cards.length > 0);

  return uniqueById([...liveSessions, ...soloSessions])
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || left.id.localeCompare(right.id));
}

export function buildArchivedJournalSessions(soloRows: SoloJournalSessionRow[]): JournalSession[] {
  return soloRows
    .map(mapSoloSessionToJournalSession)
    .filter(session => session.status === "completed" && session.archivedAt !== null)
    .map(session => ({
      ...session,
      cards: session.cards.filter(card => card.completedAt !== null)
    }))
    .filter(session => session.cards.length > 0)
    .sort((left, right) => (right.archivedAt ?? "").localeCompare(left.archivedAt ?? "") || left.id.localeCompare(right.id));
}
