import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { EventEditor } from "@/components/admin/EventEditor";
import { requireStaff } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EventEditorPage({ params }: { params: Promise<{ "event-id": string }> }) {
  await requireStaff();
  const { "event-id": eventId } = await params;
  const supabase = await createClient();
  const [{ data: teas }, { data: staff }] = await Promise.all([
    supabase.from("teas").select("id,name,origin,default_character,default_brewing,default_steep_seconds").is("retired_at", null).order("name"),
    supabase.from("profiles").select("id,display_name,role").in("role", ["host", "admin"]).order("display_name")
  ]);
  let existing: unknown = undefined;
  if (eventId !== "new") {
    const { data: event, error: eventError } = await supabase.from("events").select(`id,title,slug,invite_code,status,location_mode,starts_at,timezone,capacity,venue_name,venue_address,video_call_url,host_user_id,backup_host_user_id,
      flight_items:event_flight_items!event_flight_items_event_id_fkey(tea_id,position,reveal_title,reveal_description,brewing_instructions,steep_seconds,temperature_c,leaf_grams,water_ml,
        trivia:trivia_questions(question,options,correct_index,explanation,answer_window_seconds))`).eq("id", eventId).single();
    if (eventError) {
      logger.error("admin_event_query_failed", eventError, { eventId });
      throw new Error("Unable to load event.");
    }
    if (!event) notFound();
    const raw = event as unknown as { flight_items: Array<Record<string, unknown> & { trivia: Array<Record<string, unknown>> | Record<string, unknown> | null }> };
    existing = { ...raw, flight_items: (raw.flight_items ?? []).sort((a,b) => Number(a.position)-Number(b.position)).map(item => ({ ...item, trivia: Array.isArray(item.trivia) ? item.trivia[0] : item.trivia ?? { question: "", options: ["", ""], correct_index: 0, explanation: "", answer_window_seconds: 20 } })) };
  }
  const record = existing as { title?: string; status?: string } | undefined;
  const locked = Boolean(record?.status && ["live", "completed", "cancelled"].includes(record.status));
  return <><SiteHeader /><main className="page-shell" id="main-content">
    <Link href="/admin" prefetch={false} className="btn btn-quiet">← All events</Link>
    <div className="row"><div><p className="eyebrow">Event workspace</p><h1 className="page-title">{eventId === "new" ? "New tasting" : record?.title}</h1></div>
      {eventId !== "new" && record?.status === "scheduled" && <><span className="spacer" /><Link className="btn btn-primary" href={`/admin/events/${eventId}/live`} prefetch={false}>Launch live console</Link></>}
      {eventId !== "new" && record?.status === "live" && <><span className="spacer" /><Link className="btn btn-primary" href={`/admin/events/${eventId}/live`} prefetch={false}>Resume live console</Link></>}
    </div>
    {locked ? <section className="card" style={{ marginTop: 20 }}><h2 className="card-title">This event is locked.</h2><p className="page-lede">{record?.status === "live" ? "Live event setup is frozen so every guest stays on the same authoritative session state." : "Completed and cancelled event setup is read-only. Use the event list to open its results."}</p></section> : <EventEditor teas={teas ?? []} staff={staff ?? []} existing={existing as never} />}
  </main></>;
}
