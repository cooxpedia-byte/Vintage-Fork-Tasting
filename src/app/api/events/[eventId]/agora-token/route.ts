import { NextResponse } from "next/server";
import {
  AGORA_TOKEN_TTL_SECONDS,
  agoraChannelName,
  agoraUserAccount,
  canManageAgoraEvent,
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
    const admin = createAdminClient();
    const [{ client: supabase, user }, eventResult, participant] = await Promise.all([
      createRequestClient(request),
      admin
        .from("events")
        .select("id,status,phase,location_mode,owner_user_id,host_user_id,backup_host_user_id")
        .eq("id", eventId)
        .maybeSingle(),
      requireParticipant(eventId)
    ]);
    const { data: event, error } = eventResult;
    if (error) throw error;

    let identity: { kind: "host" | "guest"; id: string } | null = null;
    if (user && event) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (canManageAgoraEvent(user.id, profile?.role, event)) identity = { kind: "host", id: user.id };
    }
    if (!identity && participant && participant.status !== "removed") {
      identity = { kind: "guest", id: participant.id };
    }
    if (!identity) return response({ error: "A current tasting seat or staff sign-in is required." }, 401);
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

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" }
  });
}
