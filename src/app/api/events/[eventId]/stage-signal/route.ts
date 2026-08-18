import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireParticipant } from "@/lib/guest-token";
import { logger } from "@/lib/logger";

const schema = z.object({ signal: z.enum(["ready", "pouring", "decanted"]) });

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  try {
    const participant = await requireParticipant(eventId);
    if (!participant || participant.status === "removed") {
      return NextResponse.json({ error: "A current tasting seat is required." }, { status: 401 });
    }
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Choose a current-stage signal." }, { status: 400 });

    const admin = createAdminClient();
    const eventResult = await admin.from("events")
      .select("status,phase,current_flight_item_id,conductor_stage")
      .eq("id", eventId)
      .maybeSingle();
    if (eventResult.error) throw eventResult.error;
    const event = eventResult.data;
    if (!event || event.status !== "live" || !event.current_flight_item_id) {
      return NextResponse.json({ error: "The tasting stage is not open." }, { status: 409 });
    }
    if (!(["prepare", "brew"] as string[]).includes(event.conductor_stage)) {
      return NextResponse.json({ error: "Readiness is not being collected in this stage." }, { status: 409 });
    }
    if (event.conductor_stage === "prepare" && parsed.data.signal !== "ready") {
      return NextResponse.json({ error: "Mark ready during preparation." }, { status: 409 });
    }

    const result = await admin.from("event_stage_signals").upsert({
      event_id: eventId,
      participant_id: participant.id,
      event_flight_item_id: event.current_flight_item_id,
      stage: event.conductor_stage,
      signal: parsed.data.signal,
      updated_at: new Date().toISOString()
    }, { onConflict: "event_id,participant_id,event_flight_item_id,stage" });
    if (result.error) throw result.error;
    return NextResponse.json({ ok: true, signal: parsed.data.signal }, {
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  } catch (error) {
    logger.error("stage_signal_failed", error, { eventId });
    return NextResponse.json({ error: "That stage update could not be shared." }, { status: 500 });
  }
}
