import { NextResponse } from "next/server";
import { requireParticipant } from "@/lib/guest-token";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { savedTeaSchema } from "@/lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  try {
    const participant = await requireParticipant(eventId);
    if (!participant) return NextResponse.json({ error: "Participation session expired." }, { status: 401 });
    if (participant.status === "removed") return NextResponse.json({ error: "You were removed from this tasting." }, { status: 403 });

    const parsed = savedTeaSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "That saved-tea change is invalid." }, { status: 400 });

    const admin = createAdminClient();
    const [{ data: event, error: eventError }, { data: flightItem, error: flightError }] = await Promise.all([
      admin.from("events").select("status,phase").eq("id", eventId).single(),
      admin.from("event_flight_items").select("id").eq("id", parsed.data.flightItemId).eq("event_id", eventId).maybeSingle()
    ]);
    if (eventError) throw eventError;
    if (flightError) throw flightError;
    if (!flightItem) return NextResponse.json({ error: "That tea does not belong to this tasting." }, { status: 400 });
    if (!event || (event.status !== "completed" && !["recap", "ended"].includes(event.phase))) {
      return NextResponse.json({ error: "Saved teas can be changed when your recap is available." }, { status: 409 });
    }

    const { data: existing, error: existingError } = await admin
      .from("tea_responses")
      .select("id")
      .eq("participant_id", participant.id)
      .eq("event_flight_item_id", flightItem.id)
      .maybeSingle();
    if (existingError) throw existingError;

    if (!existing && !parsed.data.saved) return NextResponse.json({ ok: true, saved: false });

    const write = existing
      ? await admin.from("tea_responses").update({ saved: parsed.data.saved }).eq("id", existing.id)
      : await admin.from("tea_responses").insert({
          participant_id: participant.id,
          event_flight_item_id: flightItem.id,
          saved: parsed.data.saved
        });
    if (write.error) throw write.error;

    logger.info("guest_recap_saved_tea_changed", { eventId, saved: parsed.data.saved });
    return NextResponse.json({ ok: true, saved: parsed.data.saved });
  } catch (error) {
    logger.error("guest_recap_saved_tea_failed", error, { eventId });
    return NextResponse.json({ error: "We couldn’t update that saved tea just now." }, { status: 500 });
  }
}
