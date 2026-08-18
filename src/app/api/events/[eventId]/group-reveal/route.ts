import { NextResponse } from "next/server";
import { canManageAgoraEvent } from "@/lib/agora";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRequestClient } from "@/lib/supabase/request-auth";
import { loadGroupRevealSnapshot } from "@/lib/group-reveal-server";
import { logger } from "@/lib/logger";

export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  try {
    const admin = createAdminClient();
    const [{ client: supabase, user }, eventResult] = await Promise.all([
      createRequestClient(request),
      admin.from("events").select("id,owner_user_id,host_user_id,backup_host_user_id,current_flight_item_id").eq("id", eventId).maybeSingle()
    ]);
    if (eventResult.error) throw eventResult.error;
    if (!eventResult.data) return NextResponse.json({ error: "Tasting not found." }, { status: 404 });
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const profileResult = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profileResult.error) throw profileResult.error;
    if (!canManageAgoraEvent(user.id, profileResult.data?.role, eventResult.data)) {
      return NextResponse.json({ error: "You cannot view this reveal." }, { status: 403 });
    }
    const snapshot = await loadGroupRevealSnapshot({ admin, eventId, eventFlightItemId: eventResult.data.current_flight_item_id });
    return NextResponse.json({ snapshot }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    logger.error("group_reveal_load_failed", error, { eventId });
    return NextResponse.json({ error: "The group portrait could not be loaded." }, { status: 500 });
  }
}
