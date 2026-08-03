import { notFound } from "next/navigation";
import { HostConsole } from "@/components/host/HostConsole";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LivePage({ params }: { params: Promise<{ "event-id": string }> }) {
  const { user, role } = await requireStaff();
  const { "event-id": eventId } = await params;
  const supabase = await createClient();
  const [{ data: event }, { data: flight }, { data: participants }, { data: profile }] = await Promise.all([
    supabase.from("events").select("id,title,status,phase,sequence_number,current_flight_item_id,current_trivia_question_id,tasting_opened_flight_item_id,reveal_at,timer_ends_at,trivia_closes_at,invite_code,starts_at,location_mode,capacity,host_user_id,backup_host_user_id").eq("id", eventId).single(),
    supabase.from("event_flight_items").select("id,position,reveal_title,reveal_description,brewing_instructions,steep_seconds,temperature_c,leaf_grams,water_ml,tea:teas(name,origin,producer),trivia:trivia_questions(id,position,question,options,correct_index,explanation,answer_window_seconds)").eq("event_id", eventId).order("position"),
    supabase.from("participants").select("id,display_name,status,last_seen_at,joined_at").eq("event_id", eventId).order("joined_at"),
    supabase.from("profiles").select("display_name").eq("id", user.id).single()
  ]);
  if (!event) notFound();
  return <HostConsole initialEvent={event as never} flight={(flight ?? []) as never} initialParticipants={(participants ?? []) as never} userId={user.id} userName={profile?.display_name ?? user.email ?? "Host"} userRole={role} />;
}
