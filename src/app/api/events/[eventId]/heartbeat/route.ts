import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireParticipant } from "@/lib/guest-token";
export async function POST(_: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const serverReceivedTime = new Date().toISOString();
  const { eventId } = await params;
  const participant = await requireParticipant(eventId);
  if (!participant) return NextResponse.json({ ok: false }, { status: 401 });
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const [, { data: event }] = await Promise.all([
    admin.from("participants").update({ last_seen_at: now }).eq("id", participant.id),
    admin.from("events").select("sequence_number").eq("id", eventId).single()
  ]);
  return NextResponse.json({ ok: true, serverReceivedTime, serverTime: new Date().toISOString(), sequenceNumber: event?.sequence_number ?? null }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
