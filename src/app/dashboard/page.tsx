import { SiteHeader } from "@/components/SiteHeader";
import { CustomerDashboard } from "@/components/dashboard/CustomerDashboard";
import { requireUser } from "@/lib/auth";
import { parseCustomerDashboardSection, shouldShowJournalEvent } from "@/lib/customer-dashboard";
import { getServerFeatureFlags } from "@/lib/feature-flags";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { buildArchivedJournalSessions, buildJournalSessions, type LiveJournalEventRow, type SoloJournalSessionRow } from "@/lib/tea-lab/journal";
import { buildTeaLibrary, type PersonalTeaRecordRow } from "@/lib/tea-lab/library";
import { buildPassportSeals } from "@/lib/tea-lab/passport";
import { TEA_LAB_PHOTO_BUCKET } from "@/lib/tea-lab/photos";
import {
  mapServerDraftToOfflineDraft,
  type TeaLabDescriptorOption,
  type TeaLabServerDraftRow,
  type TeaLabTeaOption
} from "@/lib/tea-lab/lab";

export const dynamic = "force-dynamic";

type DashboardTea = {
  id: string;
  name: string;
  producer: string | null;
  origin: string | null;
  tea_type: string | null;
  default_steep_seconds: number | null;
};

type DashboardResponse = Omit<LiveJournalEventRow["responses"][number], "flight"> & {
  flight: {
    id: string;
    reveal_title: string;
    position: number;
    brewing_instructions: string | null;
    steep_seconds: number | null;
    temperature_c: number | null;
    leaf_grams: number | null;
    water_ml: number | null;
    tea: DashboardTea | null;
  } | null;
};

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ section?: string | string[] }> }) {
  const { section } = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();
  const featureFlags = getServerFeatureFlags();
  const [profileResult, participantsResult] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).single(),
    supabase.from("participants").select(`
      id,event_id,status,
      event:events!inner(id,title,starts_at,timezone,location_mode,status,invite_code),
      responses:tea_responses(id,rating,first_impression,personal_notes,descriptors,intensity,saved,completed_at,stamp_released_at,
        flight:event_flight_items(id,reveal_title,position,brewing_instructions,steep_seconds,temperature_c,leaf_grams,water_ml,tea:teas(id,name,producer,origin,tea_type,default_steep_seconds)))
    `).eq("user_id", user.id).order("created_at", { ascending: false })
  ]);
  if (profileResult.error) {
    logger.warn("customer_dashboard_profile_load_failed", {
      surface: "customer_dashboard",
      code: profileResult.error.code
    });
  }
  if (participantsResult.error) {
    logger.error("customer_dashboard_participants_load_failed", undefined, {
      surface: "customer_dashboard",
      code: participantsResult.error.code
    });
    throw new Error("Unable to load your dashboard.");
  }

  const profile = profileResult.data;
  const participants = participantsResult.data;
  const rows = (participants ?? []) as unknown as Array<{ id: string; event_id: string; status: string; event: { id: string; title: string; starts_at: string; timezone: string | null; location_mode: string; status: string; invite_code: string | null }; responses: DashboardResponse[] }>;
  const completed = rows.filter(row => shouldShowJournalEvent(row.event.status)).map(row => ({ ...row.event, participant_id: row.id, responses: row.responses }));
  let soloRows: SoloJournalSessionRow[] = [];
  let personalRows: PersonalTeaRecordRow[] = [];
  let teaOptions: TeaLabTeaOption[] = [];
  let descriptorOptions: TeaLabDescriptorOption[] = [];
  let serverDrafts: NonNullable<ReturnType<typeof mapServerDraftToOfflineDraft>>[] = [];
  let teaLabReady = false;

  if (featureFlags.teaLab) {
    const [journalResult, draftResult, descriptorResult, canonicalResult, personalResult] = await Promise.all([
      supabase.from("tasting_sessions").select(`
        id,kind,status,started_at,completed_at,archived_at,revision,
        cards:tasting_cards(
          id,position,canonical_tea_id,personal_tea_record_id,
          tea_name_snapshot,producer_snapshot,origin_snapshot,tea_type_snapshot,
          cultivar_snapshot,harvest_snapshot,product_identifier_snapshot,lot_code_snapshot,
          rating,intensity,completed_at,
          brewing:brewing_setups(brewing_style,leaf_grams,water_ml,water_temperature_c,water_source,vessel,initial_steep_seconds,preparation_notes),
          brew_stages:tasting_card_brew_stages(stage_number,label,duration_seconds,temperature_c,notes),
          photos:tasting_card_photos(id,storage_path,alt_text,created_at,upload_status),
          private_notes:tasting_card_private_notes(first_impression,personal_notes),
          descriptor_links:tasting_card_descriptors(
            descriptor_id,position,
            descriptor:flavor_descriptors(id,label)
          )
        )
      `).eq("owner_user_id", user.id).eq("status", "completed").order("completed_at", { ascending: false }),
      supabase.from("tasting_sessions").select(`
        id,status,started_at,updated_at,revision,archived_at,
        cards:tasting_cards(
          id,canonical_tea_id,personal_tea_record_id,
          tea_name_snapshot,producer_snapshot,origin_snapshot,tea_type_snapshot,
          cultivar_snapshot,harvest_snapshot,product_identifier_snapshot,lot_code_snapshot,
          rating,intensity,
          brewing:brewing_setups(brewing_style,leaf_grams,water_ml,water_temperature_c,water_source,vessel,initial_steep_seconds,preparation_notes),
          brew_stages:tasting_card_brew_stages(stage_number,label,duration_seconds,temperature_c,notes),
          private_notes:tasting_card_private_notes(first_impression,personal_notes),
          descriptor_links:tasting_card_descriptors(descriptor_id,position)
        )
      `).eq("owner_user_id", user.id).in("status", ["draft", "in_progress"]).is("archived_at", null).order("updated_at", { ascending: false }),
      supabase.from("flavor_descriptors").select("id,label,category,aliases").eq("active", true).order("position"),
      supabase.from("teas").select("id,name,producer,origin,tea_type,default_steep_seconds").is("retired_at", null).order("name"),
      supabase.from("personal_tea_records").select("id,canonical_tea_id,name,producer,origin,tea_type,cultivar,harvest,product_identifier,lot_code,archived_at,created_at,updated_at").eq("owner_user_id", user.id).order("name")
    ]);
    if (journalResult.error) logger.warn("tea_lab_journal_load_failed", { surface: "customer_dashboard", code: journalResult.error.code });
    if (draftResult.error) logger.warn("tea_lab_drafts_load_failed", { surface: "customer_dashboard", code: draftResult.error.code });
    if (descriptorResult.error) logger.warn("tea_lab_descriptors_load_failed", { surface: "customer_dashboard", code: descriptorResult.error.code });
    if (canonicalResult.error) logger.warn("tea_lab_canonical_teas_load_failed", { surface: "customer_dashboard", code: canonicalResult.error.code });
    if (personalResult.error) logger.warn("tea_lab_personal_teas_load_failed", { surface: "customer_dashboard", code: personalResult.error.code });

    const teaLabFailures = [
      { source: "journal", error: journalResult.error },
      { source: "drafts", error: draftResult.error },
      { source: "descriptors", error: descriptorResult.error },
      { source: "canonical_teas", error: canonicalResult.error },
      { source: "personal_teas", error: personalResult.error }
    ].flatMap(({ source, error }) => error ? [{ source, code: error.code }] : []);
    if (teaLabFailures.length > 0) {
      logger.error("customer_dashboard_tea_lab_load_failed", undefined, {
        surface: "customer_dashboard",
        failures: teaLabFailures
      });
      throw new Error("Unable to load your dashboard.");
    }
    if ((descriptorResult.data?.length ?? 0) === 0) {
      logger.error("tea_lab_descriptor_seed_missing", undefined, { surface: "customer_dashboard" });
      throw new Error("Unable to load your dashboard.");
    }

    teaLabReady = true;
    soloRows = (journalResult.data ?? []) as unknown as SoloJournalSessionRow[];
    const paths = soloRows.flatMap(row => (row.cards ?? []).flatMap(card =>
      (card.photos ?? []).flatMap(photo => photo.upload_status === "ready" ? [photo.storage_path] : [])
    ));
    if (paths.length > 0) {
      const admin = createAdminClient();
      const { data: signed, error: signedError } = await admin.storage.from(TEA_LAB_PHOTO_BUCKET)
        .createSignedUrls(paths, 60 * 60);
      if (signedError) logger.warn("tea_lab_photo_signing_failed", { surface: "customer_dashboard" });
      else {
        const signedByPath = new Map((signed ?? []).flatMap(item => item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : []));
        soloRows = soloRows.map(row => ({
          ...row,
          cards: (row.cards ?? []).map(card => ({
            ...card,
            photos: (card.photos ?? []).map(photo => ({ ...photo, signed_url: signedByPath.get(photo.storage_path) ?? null }))
          }))
        }));
      }
    }

    serverDrafts = ((draftResult.data ?? []) as unknown as TeaLabServerDraftRow[]).flatMap(row => {
      const draft = mapServerDraftToOfflineDraft(user.id, row);
      return draft ? [draft] : [];
    });
    descriptorOptions = (descriptorResult.data ?? []) as TeaLabDescriptorOption[];
    const savedCanonicalIds = new Set(rows.flatMap(row => row.responses.flatMap(response =>
      response.saved && response.flight?.tea?.id ? [response.flight.tea.id] : []
    )));
    const canonicalOptions = ((canonicalResult.data ?? []) as DashboardTea[]).map(tea => ({
      key: `canonical:${tea.id}`,
      name: tea.name,
      producer: tea.producer,
      origin: tea.origin,
      teaType: tea.tea_type,
      defaultSteepSeconds: tea.default_steep_seconds,
      saved: savedCanonicalIds.has(tea.id),
      selection: { kind: "canonical" as const, canonicalTeaId: tea.id }
    }));
    personalRows = (personalResult.data ?? []) as PersonalTeaRecordRow[];
    const personalOptions = personalRows.filter(tea => tea.archived_at === null).map(tea => ({
      key: `personal:${tea.id}`,
      name: tea.name,
      producer: tea.producer,
      origin: tea.origin,
      teaType: tea.tea_type,
      defaultSteepSeconds: null,
      saved: false,
      selection: {
        kind: "personal" as const,
        personalTeaId: tea.id,
        name: tea.name,
        producer: tea.producer,
        origin: tea.origin,
        teaType: tea.tea_type,
        cultivar: tea.cultivar,
        harvest: tea.harvest,
        productIdentifier: tea.product_identifier,
        lotCode: tea.lot_code
      }
    }));
    teaOptions = [...canonicalOptions, ...personalOptions].sort((left, right) => Number(right.saved) - Number(left.saved) || left.name.localeCompare(right.name));
  }

  const journalSessions = teaLabReady ? buildJournalSessions(completed, soloRows) : [];
  const archivedJournalSessions = teaLabReady ? buildArchivedJournalSessions(soloRows) : [];
  const libraryItems = teaLabReady ? buildTeaLibrary(completed, personalRows, soloRows) : [];
  const passportSeals = teaLabReady ? buildPassportSeals(completed, soloRows) : [];

  return <><SiteHeader /><CustomerDashboard name={profile?.display_name || user.email?.split("@")[0] || "tea friend"} ownerUserId={user.id} events={completed} initialTab={parseCustomerDashboardSection(section)} teaLabEnabled={teaLabReady} journalSessions={journalSessions} archivedJournalSessions={archivedJournalSessions} libraryItems={libraryItems} passportSeals={passportSeals} teaOptions={teaOptions} descriptorOptions={descriptorOptions} serverDrafts={serverDrafts} /></>;
}
