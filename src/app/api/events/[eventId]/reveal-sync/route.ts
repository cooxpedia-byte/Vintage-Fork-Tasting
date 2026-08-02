import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireParticipant } from "@/lib/guest-token";
import { logger } from "@/lib/logger";

const schema = z.object({
  kind: z.enum(["ready", "rendered"]),
  sequenceNumber: z.number().int().nonnegative(),
  flightItemId: z.string().uuid(),
  observedAt: z.string().datetime({ offset: true }),
  clockOffsetMs: z.number().int().min(-120_000).max(120_000),
  roundTripMs: z.number().int().min(0).max(120_000),
  reducedMotion: z.boolean()
});

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  try {
    const participant = await requireParticipant(eventId);
    if (!participant) return NextResponse.json({ error: "Participation session expired." }, { status: 401 });
    if (participant.status === "removed") return NextResponse.json({ error: "You were removed from this tasting." }, { status: 403 });
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid reveal measurement." }, { status: 400 });
    const body = parsed.data;
    const observed = new Date(body.observedAt).getTime();
    if (Math.abs(observed - Date.now()) > 180_000) return NextResponse.json({ error: "Reveal measurement clock is invalid." }, { status: 400 });

    const admin = createAdminClient();
    const { data: event } = await admin.from("events").select("phase,sequence_number,current_flight_item_id,reveal_at").eq("id", eventId).single();
    if (!event || event.phase !== "reveal" || event.sequence_number !== body.sequenceNumber || event.current_flight_item_id !== body.flightItemId || !event.reveal_at) {
      return NextResponse.json({ error: "The reveal has moved on." }, { status: 409 });
    }
    const { error } = await admin.rpc("record_reveal_sync_sample", {
      p_event_id:eventId,
      p_participant_id:participant.id,
      p_flight_item_id:body.flightItemId,
      p_sequence_number:body.sequenceNumber,
      p_reveal_at:event.reveal_at,
      p_ready_at:body.kind==="ready"?body.observedAt:null,
      p_rendered_at:body.kind==="rendered"?body.observedAt:null,
      p_clock_offset_ms:body.clockOffsetMs,
      p_round_trip_ms:body.roundTripMs,
      p_reveal_skew_ms:body.kind==="rendered"?Math.round(observed-new Date(event.reveal_at).getTime()):null,
      p_reduced_motion:body.reducedMotion
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("reveal_sync_sample_failed", error, { eventId });
    return NextResponse.json({ error: "Reveal measurement was not recorded." }, { status: 500 });
  }
}
