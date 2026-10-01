import { NextResponse } from "next/server";
import { createRequestClient } from "@/lib/supabase/request-auth";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const { client: supabase, user } = await createRequestClient(request);
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { data: profileData } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    const profile = profileData as { role: string } | null;
    if (!profile || !["host", "admin"].includes(profile.role)) return NextResponse.json({ error: "Staff access required." }, { status: 403 });
    const body = await request.json();
    if (!body?.event?.title || !Array.isArray(body?.flight)) return NextResponse.json({ error: "Invalid event payload." }, { status: 400 });
    if (body.flight.some((item: unknown) => !item || typeof item !== "object" || Array.isArray(item))) {
      return NextResponse.json({ error: "Invalid flight payload." }, { status: 400 });
    }
    // Legacy editors may still send questions. Keep event setup independent of
    // the retired game; the database also enforces this for direct RPC callers.
    const flight = body.flight.map((item: Record<string, unknown>) => Object.fromEntries(
      Object.entries(item).filter(([key]) => key !== "trivia")
    ));
    const saveEventBundle = supabase.rpc.bind(supabase) as unknown as (
      functionName: "save_event_bundle",
      args: { p_event: unknown; p_flight: unknown[] }
    ) => Promise<{ data: string | null; error: { message: string } | null }>;
    const { data, error } = await saveEventBundle("save_event_bundle", {
      p_event: body.event,
      p_flight: flight
    });
    if (error) { logger.error("event_save_failed", error, { userId: user.id }); return NextResponse.json({ error: friendly(error.message) }, { status: 400 }); }
    return NextResponse.json({ id: data });
  } catch (error) {
    logger.error("event_save_exception", error);
    return NextResponse.json({ error: "The event could not be saved." }, { status: 500 });
  }
}
function friendly(message: string) {
  if (message.includes("event_flight_history_preserved")) return "This flight has saved history. Keep its teas and order; you can still update the tasting details and brewing instructions.";
  if (message.includes("different_backup")) return "The backup host must be different from the host.";
  if (message.includes("event_locked")) return "A live or completed event cannot be edited.";
  if (message.includes("location_details")) return "Complete the location details before scheduling.";
  if (message.includes("not_ready")) return "Complete every launch-readiness item before scheduling this tasting.";
  if (message.includes("invalid_host")) return "Choose an active host or administrator for this tasting.";
  if (message.includes("invalid_backup")) return "Choose an active backup host or administrator.";
  if (message.includes("capacity_below_joined")) return "Capacity cannot be lower than the number of guests already joined.";
  return message.replaceAll("_", " ");
}

