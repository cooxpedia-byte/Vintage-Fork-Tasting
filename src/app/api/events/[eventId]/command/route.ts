import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

const schema = z.object({
  command: z.enum(["open_session","reveal_tea","start_timer","open_tasting","open_trivia","close_trivia","return_to_tasting","next_tea","start_recap","end_session"]),
  expectedSequence: z.number().int().nonnegative(),
  leaseToken: z.string().uuid()
});

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid host command." }, { status: 400 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { data, error } = await supabase.rpc("apply_event_command", {
      p_event_id: eventId,
      p_command: parsed.data.command,
      p_expected_sequence: parsed.data.expectedSequence,
      p_lease_token: parsed.data.leaseToken
    });
    if (error) {
      logger.warn("host_command_rejected", { eventId, command: parsed.data.command, userId: user.id, reason: error.message });
      return NextResponse.json({ error: friendly(error.message) }, { status: 409 });
    }
    logger.info("host_command_applied", { eventId, command: parsed.data.command, userId: user.id, sequence: data?.sequence_number });
    return NextResponse.json({ event: data });
  } catch (error) {
    logger.error("host_command_failed", error, { eventId });
    return NextResponse.json({ error: "The command was not applied. Nothing changed for guests." }, { status: 500 });
  }
}
function friendly(message: string) {
  if (message.includes("stale_sequence")) return "The room moved on another device. The latest state has been loaded.";
  if (message.includes("lease_lost")) return "Another host now controls this tasting.";
  if (message.includes("not_ready")) return "Finish every launch-readiness item first.";
  if (message.includes("illegal_phase")) return "The room is already past that step.";
  if (message.includes("last_tea")) return "This is the last tea. Start the recap next.";
  if (message.includes("not_last_tea")) return "There is another tea in the flight.";
  if (message.includes("trivia_open")) return "Close the trivia question before continuing.";
  if (message.includes("tasting_not_open")) return "Reveal and open this tea before continuing.";
  if (message.includes("reveal_in_progress")) return "The reveal is still in progress. The next control will unlock when the ceremony finishes.";
  return message.replaceAll("_", " ");
}
