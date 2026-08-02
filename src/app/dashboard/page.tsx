import { SiteHeader } from "@/components/SiteHeader";
import { CustomerDashboard } from "@/components/dashboard/CustomerDashboard";
import { requireUser } from "@/lib/auth";
import { shouldShowUpcomingEvent } from "@/lib/customer-dashboard";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [{ data: profile }, { data: participants }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).single(),
    supabase.from("participants").select(`
      id,event_id,status,
      event:events!inner(id,title,starts_at,location_mode,status,invite_code),
      responses:tea_responses(id,rating,first_impression,personal_notes,descriptors,intensity,saved,completed_at,
        flight:event_flight_items(id,reveal_title,position,tea:teas(name,origin)))
    `).eq("user_id", user.id).order("created_at", { ascending: false })
  ]);

  const rows = (participants ?? []) as unknown as Array<{ id: string; event_id: string; status: string; event: { id: string; title: string; starts_at: string; location_mode: string; status: string; invite_code: string | null }; responses: never[] }>;
  const completed = rows.filter(row => row.event.status === "completed").map(row => ({ ...row.event, participant_id: row.id, responses: row.responses }));
  const upcoming = rows.filter(row => shouldShowUpcomingEvent(row.status, row.event.status)).map(row => row.event);

  return <><SiteHeader /><CustomerDashboard name={profile?.display_name || user.email?.split("@")[0] || "tea friend"} events={completed} upcoming={upcoming} /></>;
}
