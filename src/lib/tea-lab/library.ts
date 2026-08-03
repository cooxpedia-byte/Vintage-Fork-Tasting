import type { LiveJournalEventRow, SoloJournalSessionRow } from "@/lib/tea-lab/journal";

export type PersonalTeaRecordRow = {
  id: string;
  canonical_tea_id: string | null;
  name: string;
  producer: string | null;
  origin: string | null;
  tea_type: string | null;
  cultivar: string | null;
  harvest: string | null;
  product_identifier: string | null;
  lot_code: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TeaLibraryItem = {
  id: string;
  kind: "saved_canonical" | "personal";
  canonicalTeaId: string | null;
  personalTeaId: string | null;
  name: string;
  producer: string | null;
  origin: string | null;
  teaType: string | null;
  cultivar: string | null;
  harvest: string | null;
  productIdentifier: string | null;
  lotCode: string | null;
  savedReferences: number;
  documentedTastings: number;
  archivedAt: string | null;
  updatedAt: string;
};

export function buildTeaLibrary(
  liveEvents: LiveJournalEventRow[],
  personalRows: PersonalTeaRecordRow[],
  soloRows: SoloJournalSessionRow[]
): TeaLibraryItem[] {
  const items = new Map<string, TeaLibraryItem>();

  for (const event of liveEvents) {
    for (const response of event.responses) {
      if (!response.saved) continue;
      const tea = response.flight?.tea;
      const id = tea?.id ? `canonical:${tea.id}` : `saved-response:${response.id}`;
      const existing = items.get(id);
      const updatedAt = response.completed_at ?? event.starts_at;
      if (existing) {
        existing.savedReferences += 1;
        if (updatedAt > existing.updatedAt) existing.updatedAt = updatedAt;
        continue;
      }
      items.set(id, {
        id,
        kind: "saved_canonical",
        canonicalTeaId: tea?.id ?? null,
        personalTeaId: null,
        name: tea?.name ?? response.flight?.reveal_title ?? "Saved tea",
        producer: tea?.producer ?? null,
        origin: tea?.origin ?? null,
        teaType: tea?.tea_type ?? null,
        cultivar: null,
        harvest: null,
        productIdentifier: null,
        lotCode: null,
        savedReferences: 1,
        documentedTastings: 0,
        archivedAt: null,
        updatedAt
      });
    }
  }

  const documentedCounts = new Map<string, number>();
  for (const session of soloRows) {
    if (session.status !== "completed") continue;
    for (const card of session.cards ?? []) {
      if (!card.personal_tea_record_id || !card.completed_at) continue;
      documentedCounts.set(card.personal_tea_record_id, (documentedCounts.get(card.personal_tea_record_id) ?? 0) + 1);
    }
  }

  for (const tea of personalRows) {
    items.set(`personal:${tea.id}`, {
      id: `personal:${tea.id}`,
      kind: "personal",
      canonicalTeaId: tea.canonical_tea_id,
      personalTeaId: tea.id,
      name: tea.name,
      producer: tea.producer,
      origin: tea.origin,
      teaType: tea.tea_type,
      cultivar: tea.cultivar,
      harvest: tea.harvest,
      productIdentifier: tea.product_identifier,
      lotCode: tea.lot_code,
      savedReferences: 0,
      documentedTastings: documentedCounts.get(tea.id) ?? 0,
      archivedAt: tea.archived_at,
      updatedAt: tea.updated_at
    });
  }

  return [...items.values()].sort((left, right) =>
    Number(left.archivedAt !== null) - Number(right.archivedAt !== null)
      || right.updatedAt.localeCompare(left.updatedAt)
      || left.name.localeCompare(right.name)
  );
}
