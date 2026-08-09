import { SiteHeader } from "@/components/SiteHeader";
import { LiveEventsHub, type LiveEventsHubEvent } from "@/components/live-events/LiveEventsHub";
import { requireUser } from "@/lib/auth";
import { shouldShowUpcomingEvent } from "@/lib/customer-dashboard";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ParticipantEventRow = {
  status: string;
  event: {
    id: string;
    title: string;
    starts_at: string;
    timezone: string | null;
    location_mode: string;
    status: string;
    invite_code: string | null;
    venue_name: string | null;
  };
};

export default async function LiveEventsPage() {
  const user = await requireUser("/live-events");
  const supabase = await createClient();
  const { data, error } = await supabase.from("participants").select(`
    status,
    event:events!inner(id,title,starts_at,timezone,location_mode,status,invite_code,venue_name)
  `).eq("user_id", user.id).order("created_at", { ascending: false });

  if (error) {
    logger.error("live_events_hub_load_failed", undefined, {
      surface: "live_events_hub",
      code: error.code
    });
    throw new Error("Unable to load your live events.");
  }

  const rows = (data ?? []) as unknown as ParticipantEventRow[];
  const events = rows
    .filter(row => shouldShowUpcomingEvent(row.status, row.event.status))
    .map<LiveEventsHubEvent>(row => ({
      id: row.event.id,
      title: row.event.title,
      startsAt: row.event.starts_at,
      timezone: row.event.timezone,
      locationMode: row.event.location_mode,
      status: row.event.status,
      inviteCode: row.event.invite_code,
      venueName: row.event.venue_name
    }))
    .sort((left, right) => Number(right.status === "live") - Number(left.status === "live") || new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());

  return <><SiteHeader /><LiveEventsHub events={events} /></>;
}
