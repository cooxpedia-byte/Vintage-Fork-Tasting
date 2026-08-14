import { GuestExperience } from "@/components/guest/GuestExperience";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireParticipant } from "@/lib/guest-token";
import { logger } from "@/lib/logger";
import { guestEventPath } from "@/lib/live-events-routes";

export const dynamic = "force-dynamic";

export default async function EventPage({ params }: { params: Promise<{ "invite-code": string }> }) {
  const { "invite-code": inviteCode } = await params;
  const eventPath = guestEventPath(inviteCode);
  const user = await requireUser(eventPath);
  const admin = createAdminClient();
  const { data: event, error: eventError } = await admin.from("events").select("id,title,invite_code,status,starts_at,location_mode,capacity").eq("invite_code", inviteCode.toUpperCase()).maybeSingle();
  if (eventError) {
    logger.error("guest_event_preview_load_failed", eventError, { inviteCodeLength: inviteCode.length });
    throw new Error("Unable to load this tasting.");
  }
  if (!event) return <Blocked title="We couldn’t find that invitation." copy="Check the link you received, or ask your host to resend it." />;
  if (event.status === "cancelled") return <Blocked title="This tasting was cancelled." copy="Your host will be in touch." />;
  if (!["scheduled","live","completed"].includes(event.status)) return <Blocked title="This tasting hasn’t opened yet." copy="Check the invitation or ask your host when registration opens." />;
  const { data: accountParticipant } = await admin
    .from("participants")
    .select("id")
    .eq("event_id", event.id)
    .eq("user_id", user.id)
    .maybeSingle();
  const cookieParticipant = await requireParticipant(event.id);
  const participant = cookieParticipant?.user_id === user.id
    ? cookieParticipant
    : event.status === "completed" && !cookieParticipant?.user_id
      ? cookieParticipant
      : null;
  if (event.status === "completed" && !participant) return <Blocked title="This invitation has expired." copy="Sign in to your customer dashboard to see a tasting already linked to your account." />;
  if (!participant && !accountParticipant) {
    const { count } = await admin.from("participants").select("id", { count: "exact", head: true }).eq("event_id", event.id).neq("status", "left").neq("status", "removed");
    if ((count ?? 0) >= event.capacity) return <Blocked title="This tasting is full." copy="Speak to your host — they may be able to make room." />;
  }
  const { data: profile } = await admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const accountName = profile?.display_name?.trim()
    || stringMetadata(user.user_metadata?.display_name)
    || stringMetadata(user.user_metadata?.full_name)
    || user.email?.split("@")[0]
    || "Tea guest";
  return <GuestExperience
    preview={event as never}
    initialParticipant={participant ? { id: participant.id, display_name: participant.display_name } : null}
    account={{ displayName: accountName, email: user.email ?? null }}
  />;
}

function stringMetadata(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function Blocked({ title, copy }: { title:string; copy:string }) { return <main className="guest-shell" id="main-content"><div className="guest-pane" style={{ justifyContent:"center",textAlign:"center" }}><h1 className="page-title">{title}</h1><p>{copy}</p></div></main>; }
