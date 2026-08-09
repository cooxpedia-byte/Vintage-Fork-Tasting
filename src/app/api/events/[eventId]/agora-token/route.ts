import { NextResponse } from "next/server";
import {
  AGORA_TOKEN_TTL_SECONDS,
  agoraChannelName,
  agoraUserAccount,
  createAgoraRtcToken,
  getAgoraConfiguration
} from "@/lib/agora";
import { requireParticipant } from "@/lib/guest-token";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRequestClient } from "@/lib/supabase/request-auth";

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  try {
    const identity = await resolveRoomIdentity(request, eventId);
    if (!identity) return response({ error: "A current tasting seat or staff sign-in is required." }, 401);

    const admin = createAdminClient();
    const { data: event, error } = await admin
      .from("events")
      .select("id,status,phase,location_mode")
      .eq("id", eventId)
      .maybeSingle();
    if (error) throw error;
    if (!event) return response({ error: "Tasting not found." }, 404);
    if (event.location_mode !== "remote") return response({ error: "Video is only available for remote tastings." }, 409);
    if (!["scheduled", "live"].includes(event.status) || event.phase === "ended") {
      return response({ error: "This video room is closed." }, 409);
    }

    const config = getAgoraConfiguration();
    if (!config) {
      return response({ error: "Video is waiting for its final secure configuration." }, 503);
    }

    const channel = agoraChannelName(eventId);
    const account = agoraUserAccount(identity.kind, identity.id);
    const token = createAgoraRtcToken({ ...config, channel, account });
    return response({
      appId: config.appId,
      channel,
      account,
      token,
      expiresAt: new Date(Date.now() + AGORA_TOKEN_TTL_SECONDS * 1000).toISOString()
    });
  } catch (error) {
    logger.error("agora_token_issue_failed", error, { eventId });
    return response({ error: "The secure video room could not be opened." }, 500);
  }
}

async function resolveRoomIdentity(request: Request, eventId: string): Promise<{ kind: "host" | "guest"; id: string } | null> {
  const { client: supabase, user } = await createRequestClient(request);
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profile && ["host", "admin"].includes(profile.role)) {
      const { data: allowed } = await supabase.rpc("can_manage_event", { p_event_id: eventId, uid: user.id });
      if (allowed) return { kind: "host", id: user.id };
    }
  }

  const participant = await requireParticipant(eventId);
  if (!participant || participant.status === "removed") return null;
  return { kind: "guest", id: participant.id };
}

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" }
  });
}
