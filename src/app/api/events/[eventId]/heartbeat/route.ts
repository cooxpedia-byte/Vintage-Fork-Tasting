import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireParticipant } from "@/lib/guest-token";
export async function POST(_: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const participant = await requireParticipant(eventId);
  if (!participant) return NextResponse.json({ ok: false }, { status: 401 });
  const admin = createAdminClient();
  await admin.from("participants").update({ last_seen_at: new Date().toISOString() }).eq("id", participant.id);
  return NextResponse.json({ ok: true });
}
