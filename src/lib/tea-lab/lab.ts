import type { TeaLabBrewingStyle, TeaLabSoloDraft, TeaLabTeaSelection } from "@/lib/tea-lab/offline";

type OneOrMany<T> = T | T[] | null;

export type TeaLabDescriptorOption = {
  id: string;
  label: string;
  category: string;
  aliases?: string[];
};

export type TeaLabTeaOption = {
  key: string;
  name: string;
  producer: string | null;
  origin: string | null;
  teaType: string | null;
  defaultSteepSeconds: number | null;
  saved: boolean;
  selection: TeaLabTeaSelection;
};

export type TeaLabServerDraftRow = {
  id: string;
  status: string;
  started_at: string;
  updated_at: string;
  revision: number;
  archived_at: string | null;
  cards: Array<{
    id: string;
    canonical_tea_id: string | null;
    personal_tea_record_id: string | null;
    tea_name_snapshot: string;
    producer_snapshot: string | null;
    origin_snapshot: string | null;
    tea_type_snapshot: string | null;
    cultivar_snapshot: string | null;
    harvest_snapshot: string | null;
    product_identifier_snapshot: string | null;
    lot_code_snapshot: string | null;
    rating: number | null;
    intensity: "subtle" | "clear" | "dominant" | null;
    brewing: OneOrMany<{
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
    private_notes: OneOrMany<{
      first_impression: string | null;
      personal_notes: string | null;
    }>;
    descriptor_links: Array<{
      descriptor_id: string;
      position: number;
    }> | null;
  }> | null;
};

function first<T>(value: OneOrMany<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export function mapServerDraftToOfflineDraft(ownerUserId: string, row: TeaLabServerDraftRow): TeaLabSoloDraft | null {
  const card = row.cards?.[0];
  if (!card) return null;
  const brewing = first(card.brewing);
  const notes = first(card.private_notes);
  const selection: TeaLabTeaSelection | null = card.canonical_tea_id ? {
    kind: "canonical",
    canonicalTeaId: card.canonical_tea_id
  } : card.personal_tea_record_id ? {
    kind: "personal",
    personalTeaId: card.personal_tea_record_id,
    name: card.tea_name_snapshot,
    producer: card.producer_snapshot,
    origin: card.origin_snapshot,
    teaType: card.tea_type_snapshot,
    cultivar: card.cultivar_snapshot,
    harvest: card.harvest_snapshot,
    productIdentifier: card.product_identifier_snapshot,
    lotCode: card.lot_code_snapshot
  } : null;
  if (!selection) return null;

  return {
    schemaVersion: 1,
    ownerUserId,
    sessionId: row.id,
    cardId: card.id,
    serverRevision: row.revision,
    status: row.status === "completed" ? "completed" : row.status === "draft" ? "draft" : "in_progress",
    archived: row.archived_at !== null,
    tea: selection,
    brewing: {
      style: brewing?.brewing_style ?? null,
      leafGrams: brewing?.leaf_grams ?? null,
      waterMl: brewing?.water_ml ?? null,
      waterTemperatureC: brewing?.water_temperature_c ?? null,
      waterSource: brewing?.water_source ?? null,
      vessel: brewing?.vessel ?? null,
      initialSteepSeconds: brewing?.initial_steep_seconds ?? null,
      preparationNotes: brewing?.preparation_notes ?? null,
      stages: [...(card.brew_stages ?? [])]
        .sort((left, right) => left.stage_number - right.stage_number)
        .map(stage => ({
          label: stage.label,
          durationSeconds: stage.duration_seconds,
          temperatureC: stage.temperature_c,
          notes: stage.notes
        }))
    },
    tasting: {
      firstImpression: notes?.first_impression ?? null,
      descriptorIds: [...(card.descriptor_links ?? [])]
        .sort((left, right) => left.position - right.position)
        .map(link => link.descriptor_id),
      intensity: card.intensity,
      rating: card.rating,
      personalNotes: notes?.personal_notes ?? null
    },
    createdAt: row.started_at,
    updatedAt: row.updated_at,
    lastSyncedAt: row.updated_at
  };
}

export function chooseDraftForHydration(
  local: TeaLabSoloDraft | null,
  server: TeaLabSoloDraft,
  hasPendingOperations: boolean
): TeaLabSoloDraft {
  if (!local) return server;
  if (hasPendingOperations) return local;
  return server.serverRevision > local.serverRevision ? server : local;
}
