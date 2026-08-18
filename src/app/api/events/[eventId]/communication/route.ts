import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import {
  communicationActionSchema,
  evaluateCommunicationRateLimit,
  isSpotlightActive,
  type CommunicationSettings,
  type LiveChatMessage,
  type LiveReactionEvent,
  type TeaReactionType
} from "@/lib/live-communication";
import {
  canWriteCommunication,
  communicationSenderKey,
  resolveCommunicationContext,
  type CommunicationContext
} from "@/lib/live-communication-server";

const DEFAULT_PAGE_SIZE = 40;
const MAX_PAGE_SIZE = 60;

type SettingsRow = {
  chat_enabled: boolean;
  reactions_enabled: boolean;
  slow_mode_seconds: number;
};

type MessageRow = {
  id: string;
  event_id: string;
  participant_id: string | null;
  author_user_id: string | null;
  author_kind: "guest" | "host";
  author_display_name: string;
  message_kind: "chat" | "broadcast";
  body: string;
  event_flight_item_id: string | null;
  breakout_room_id:string|null;
  parent_message_id: string | null;
  ask_host: boolean;
  answered_at: string | null;
  pinned_at: string | null;
  spotlighted_at: string | null;
  spotlight_anonymous: boolean;
  spotlight_duration_seconds: number;
  deleted_at: string | null;
  client_id: string;
  created_at: string;
};

type ReactionRow = {
  id: string;
  event_id: string;
  participant_id: string | null;
  author_user_id: string | null;
  reaction_type: TeaReactionType;
  event_flight_item_id: string | null;
  breakout_room_id:string|null;
  client_id: string;
  created_at: string;
};

type FlightContextRow = { id: string; reveal_title: string; position: number };
type ParentPreviewRow = { id: string; author_display_name: string; body: string; deleted_at: string | null };

export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  try {
    const context = await resolveCommunicationContext(request, eventId);
    if (!context) return json({ error: "A current tasting seat or staff sign-in is required." }, 401);
    if (!["scheduled", "live", "completed"].includes(context.event.status)) {
      return json({ error: "Live communication is not available for this tasting." }, 409);
    }
    const url = new URL(request.url);
    const requestedLimit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(MAX_PAGE_SIZE, Math.max(1, requestedLimit)) : DEFAULT_PAGE_SIZE;
    const before = validIsoDate(url.searchParams.get("before"));
    return json(await loadSnapshot(context, limit, before));
  } catch (error) {
    logger.error("live_communication_load_failed", error, { eventId });
    return json({ error: "The room conversation could not be loaded." }, 500);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  try {
    const context = await resolveCommunicationContext(request, eventId);
    if (!context) return json({ error: "A current tasting seat or staff sign-in is required." }, 401);

    const body = await request.json().catch(() => null);
    const parsed = communicationActionSchema.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid communication request." }, 400);

    const action = parsed.data;
    if (action.action === "mark_read") return markRead(context);
    if (action.action === "report_message") return reportMessage(context, action);
    if (action.action === "moderate") {
      if (!context.viewer.canModerate) return json({ error: "Host access is required." }, 403);
      return moderateMessage(context, action);
    }
    if (action.action === "update_settings") {
      if (!context.viewer.canModerate) return json({ error: "Host access is required." }, 403);
      return updateSettings(context, action);
    }
    if (!canWriteCommunication(context.event)) {
      return json({ error: "The room conversation is closed." }, 409);
    }
    if (action.action === "send_message") return sendMessage(context, action);
    return sendReaction(context, action);
  } catch (error) {
    logger.error("live_communication_action_failed", error, { eventId });
    return json({ error: "That room action could not be completed." }, 500);
  }
}

async function loadSnapshot(context: CommunicationContext, limit: number, before: string | null) {
  const admin = createAdminClient();
  const settings = await ensureSettings(context.event.id);
  let messageQuery = admin
    .from("event_chat_messages")
    .select("id,event_id,participant_id,author_user_id,author_kind,author_display_name,message_kind,body,event_flight_item_id,breakout_room_id,parent_message_id,ask_host,answered_at,pinned_at,spotlighted_at,spotlight_anonymous,spotlight_duration_seconds,deleted_at,client_id,created_at")
    .eq("event_id", context.event.id)
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  messageQuery=context.breakoutRoomId
    ? messageQuery.or(`breakout_room_id.eq.${context.breakoutRoomId},and(breakout_room_id.is.null,message_kind.eq.broadcast)`)
    : context.viewer.canModerate?messageQuery.or("breakout_room_id.is.null,ask_host.eq.true"):messageQuery.is("breakout_room_id",null);
  if (before) messageQuery = messageQuery.lt("created_at", before);

  const recentCutoff = new Date(Date.now() - 5_000).toISOString();
  let reactionQuery=admin.from("event_reactions").select("id,event_id,participant_id,author_user_id,reaction_type,event_flight_item_id,breakout_room_id,client_id,created_at").eq("event_id", context.event.id);
  reactionQuery=context.breakoutRoomId?reactionQuery.eq("breakout_room_id",context.breakoutRoomId):reactionQuery.is("breakout_room_id",null);
  let pinnedQuery=admin.from("event_chat_messages").select("id,event_id,participant_id,author_user_id,author_kind,author_display_name,message_kind,body,event_flight_item_id,breakout_room_id,parent_message_id,ask_host,answered_at,pinned_at,spotlighted_at,spotlight_anonymous,spotlight_duration_seconds,deleted_at,client_id,created_at").eq("event_id", context.event.id);
  pinnedQuery=context.breakoutRoomId?pinnedQuery.or(`breakout_room_id.eq.${context.breakoutRoomId},and(breakout_room_id.is.null,message_kind.eq.broadcast)`):context.viewer.canModerate?pinnedQuery.or("breakout_room_id.is.null,ask_host.eq.true"):pinnedQuery.is("breakout_room_id",null);
  let spotlightQuery=admin.from("event_chat_messages").select("id,event_id,participant_id,author_user_id,author_kind,author_display_name,message_kind,body,event_flight_item_id,breakout_room_id,parent_message_id,ask_host,answered_at,pinned_at,spotlighted_at,spotlight_anonymous,spotlight_duration_seconds,deleted_at,client_id,created_at").eq("event_id", context.event.id);
  spotlightQuery=context.breakoutRoomId?spotlightQuery.or(`breakout_room_id.eq.${context.breakoutRoomId},and(breakout_room_id.is.null,message_kind.eq.broadcast)`):context.viewer.canModerate?spotlightQuery.or("breakout_room_id.is.null,ask_host.eq.true"):spotlightQuery.is("breakout_room_id",null);
  const [messageResult, readResult, reactionResult, pinnedResult, spotlightResult, currentTeaResult] = await Promise.all([
    messageQuery,
    admin.from("event_communication_reads").select("last_read_at").eq("event_id", context.event.id).eq("user_id", context.viewer.userId).maybeSingle(),
    reactionQuery.gte("created_at", recentCutoff).order("created_at").limit(80),
    pinnedQuery.not("pinned_at", "is", null).is("deleted_at", null).order("pinned_at", { ascending: false }).limit(1).maybeSingle(),
    spotlightQuery.not("spotlighted_at", "is", null).is("deleted_at", null).order("spotlighted_at", { ascending: false }).limit(1).maybeSingle(),
    context.event.current_flight_item_id
      ? admin.from("event_flight_items").select("id,reveal_title,position").eq("id", context.event.current_flight_item_id).maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);
  for (const result of [messageResult, readResult, reactionResult, pinnedResult, spotlightResult, currentTeaResult]) {
    if (result.error) throw result.error;
  }

  const rawRows = (messageResult.data ?? []) as MessageRow[];
  const hasMore = rawRows.length > limit;
  const pageRows = rawRows.slice(0, limit).reverse();
  const extraRows = [pinnedResult.data, spotlightResult.data].filter(Boolean) as MessageRow[];
  const allRows = [...pageRows, ...extraRows];
  const flightIds = [...new Set(allRows.map(row => row.event_flight_item_id).filter(Boolean))] as string[];
  const parentIds = [...new Set(allRows.map(row => row.parent_message_id).filter(Boolean))] as string[];
  const [flightResult, parentResult] = await Promise.all([
    flightIds.length
      ? admin.from("event_flight_items").select("id,reveal_title,position").in("id", flightIds)
      : Promise.resolve({ data: [], error: null }),
    parentIds.length
      ? admin.from("event_chat_messages").select("id,author_display_name,body,deleted_at").in("id", parentIds).eq("event_id", context.event.id)
      : Promise.resolve({ data: [], error: null })
  ]);
  if (flightResult.error) throw flightResult.error;
  if (parentResult.error) throw parentResult.error;
  const flightById = new Map<string, FlightContextRow>(((flightResult.data ?? []) as FlightContextRow[]).map(row => [row.id, row] as const));
  const parentById = new Map<string, ParentPreviewRow>(((parentResult.data ?? []) as ParentPreviewRow[]).map(row => [row.id, row] as const));
  const mapMessage = (row: MessageRow) => toMessage(row, flightById, parentById, context.viewer.userId, context.viewer.canModerate);
  const messages = pageRows.map(mapMessage);
  const pinnedMessage = pinnedResult.data ? mapMessage(pinnedResult.data as MessageRow) : null;
  const spotlightCandidate = spotlightResult.data ? mapMessage(spotlightResult.data as MessageRow) : null;
  const spotlightMessage = spotlightCandidate && isSpotlightActive(spotlightCandidate) ? spotlightCandidate : null;

  const lastReadAt = readResult.data?.last_read_at ?? "1970-01-01T00:00:00.000Z";
  let unreadQuery = admin
    .from("event_chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("event_id", context.event.id)
    .is("deleted_at", null)
    .gt("created_at", lastReadAt);
  unreadQuery=context.breakoutRoomId
    ? unreadQuery.or(`breakout_room_id.eq.${context.breakoutRoomId},and(breakout_room_id.is.null,message_kind.eq.broadcast)`)
    : context.viewer.canModerate?unreadQuery.or("breakout_room_id.is.null,ask_host.eq.true"):unreadQuery.is("breakout_room_id",null);
  const unreadResult=await unreadQuery.neq("author_user_id", context.viewer.userId);
  if (unreadResult.error) throw unreadResult.error;

  return {
    viewer: context.viewer,
    settings,
    event: {
      id: context.event.id,
      status: context.event.status,
      phase: context.event.phase,
      title: context.event.title,
      currentTeaId: currentTeaResult.data?.id ?? null,
      currentTeaTitle: currentTeaResult.data?.reveal_title ?? null,
      breakoutRoomId:context.breakoutRoomId
    },
    messages,
    unreadCount: unreadResult.count ?? 0,
    lastReadAt,
    nextCursor: hasMore ? pageRows[0]?.created_at ?? null : null,
    pinnedMessage,
    spotlightMessage,
    recentReactions: ((reactionResult.data ?? []) as ReactionRow[]).map(toReaction)
  };
}

async function sendMessage(context: CommunicationContext, action: Extract<ReturnType<typeof communicationActionSchema.parse>, { action: "send_message" }>) {
  const admin = createAdminClient();
  const settings = await ensureSettings(context.event.id);
  if (!settings.chatEnabled && !context.viewer.canModerate) return json({ error: "Chat is paused by the host." }, 409);
  if (action.kind === "broadcast" && !context.viewer.canModerate) return json({ error: "Host access is required." }, 403);

  const senderKey = communicationSenderKey(context.viewer);
  const duplicate = await admin.from("event_chat_messages").select("id").eq("sender_key", senderKey).eq("client_id", action.clientId).maybeSingle();
  if (duplicate.error) throw duplicate.error;
  if (duplicate.data) return json({ ok: true, id: duplicate.data.id, duplicate: true });

  const now = Date.now();
  const cutoff = new Date(now - 30_000).toISOString();
  const recentResult = await admin.from("event_chat_messages").select("created_at").eq("sender_key", senderKey).gte("created_at", cutoff).order("created_at", { ascending: false }).limit(20);
  if (recentResult.error) throw recentResult.error;
  const rate = evaluateCommunicationRateLimit({
    timestamps: (recentResult.data ?? []).map(row => new Date(row.created_at).getTime()),
    now,
    minimumGapMs: Math.max(800, settings.slowModeSeconds * 1000),
    windowMs: 30_000,
    maximumInWindow: 12
  });
  if (!rate.allowed) return rateLimited(rate.retryAfterMs);

  if (action.parentMessageId) {
    const parentResult = await admin.from("event_chat_messages").select("id,message_kind,breakout_room_id").eq("id", action.parentMessageId).eq("event_id", context.event.id).is("deleted_at", null).maybeSingle();
    if (parentResult.error) throw parentResult.error;
    if (!parentResult.data||!messageVisibleInContext(parentResult.data,context.breakoutRoomId)) return json({ error: "That message is no longer available to reply to." }, 409);
  }

  const insertResult = await admin.from("event_chat_messages").insert({
    event_id: context.event.id,
    participant_id: context.viewer.kind === "guest" ? context.viewer.id : null,
    author_user_id: context.viewer.userId,
    sender_key: senderKey,
    author_kind: context.viewer.kind,
    author_display_name: context.viewer.displayName,
    message_kind: action.kind,
    body: action.body,
    event_flight_item_id: context.event.current_flight_item_id,
    breakout_room_id:action.kind==="broadcast"?null:context.breakoutRoomId,
    parent_message_id: action.parentMessageId ?? null,
    ask_host: context.viewer.kind === "guest" && action.askHost,
    client_id: action.clientId
  }).select("id").single();
  if (insertResult.error) throw insertResult.error;
  if (action.kind === "broadcast") {
    await writeModerationLog(context, "broadcast", insertResult.data.id, null, {});
  }
  return json({ ok: true, id: insertResult.data.id }, 201);
}

async function sendReaction(context: CommunicationContext, action: Extract<ReturnType<typeof communicationActionSchema.parse>, { action: "send_reaction" }>) {
  const admin = createAdminClient();
  const settings = await ensureSettings(context.event.id);
  if (!settings.reactionsEnabled) return json({ error: "Reactions are paused by the host." }, 409);
  const senderKey = communicationSenderKey(context.viewer);
  const duplicate = await admin.from("event_reactions").select("id").eq("sender_key", senderKey).eq("client_id", action.clientId).maybeSingle();
  if (duplicate.error) throw duplicate.error;
  if (duplicate.data) return json({ ok: true, id: duplicate.data.id, duplicate: true });

  const now = Date.now();
  const cutoff = new Date(now - 10_000).toISOString();
  const recentResult = await admin.from("event_reactions").select("created_at").eq("sender_key", senderKey).gte("created_at", cutoff).order("created_at", { ascending: false }).limit(24);
  if (recentResult.error) throw recentResult.error;
  const rate = evaluateCommunicationRateLimit({
    timestamps: (recentResult.data ?? []).map(row => new Date(row.created_at).getTime()),
    now,
    minimumGapMs: 500,
    windowMs: 10_000,
    maximumInWindow: 16
  });
  if (!rate.allowed) return rateLimited(rate.retryAfterMs);

  const insertResult = await admin.from("event_reactions").insert({
    event_id: context.event.id,
    participant_id: context.viewer.kind === "guest" ? context.viewer.id : null,
    author_user_id: context.viewer.userId,
    sender_key: senderKey,
    reaction_type: action.reactionType,
    event_flight_item_id: context.event.current_flight_item_id,
    breakout_room_id:context.breakoutRoomId,
    client_id: action.clientId
  }).select("id,created_at").single();
  if (insertResult.error) throw insertResult.error;
  return json({ ok: true, id: insertResult.data.id, createdAt: insertResult.data.created_at }, 201);
}

async function markRead(context: CommunicationContext) {
  const admin = createAdminClient();
  const timestamp = new Date().toISOString();
  const result = await admin.from("event_communication_reads").upsert({
    event_id: context.event.id,
    user_id: context.viewer.userId,
    last_read_at: timestamp,
    updated_at: timestamp
  }, { onConflict: "event_id,user_id" });
  if (result.error) throw result.error;
  return json({ ok: true, lastReadAt: timestamp });
}

async function moderateMessage(context: CommunicationContext, action: Extract<ReturnType<typeof communicationActionSchema.parse>, { action: "moderate" }>) {
  const admin = createAdminClient();
  const targetResult = await admin.from("event_chat_messages").select("id,participant_id,ask_host,deleted_at").eq("id", action.messageId).eq("event_id", context.event.id).maybeSingle();
  if (targetResult.error) throw targetResult.error;
  if (!targetResult.data) return json({ error: "That message no longer exists." }, 404);
  if (action.operation === "remove_participant") {
    if (!targetResult.data.participant_id) return json({ error: "That message was not sent by a guest." }, 409);
    const removeResult = await admin.from("participants").update({ status: "removed", last_seen_at: new Date().toISOString() }).eq("id", targetResult.data.participant_id).eq("event_id", context.event.id);
    if (removeResult.error) throw removeResult.error;
    await writeModerationLog(context, "remove_participant", action.messageId, action.reason ?? "Removed from the live room", { participantId: targetResult.data.participant_id });
    return json({ ok: true });
  }
  const now = new Date().toISOString();
  let patch: Record<string, unknown>;
  if (action.operation === "answer") patch = { answered_at: now, answered_by: context.viewer.userId };
  else if (action.operation === "pin") {
    const clearResult = await admin.from("event_chat_messages").update({ pinned_at: null, pinned_by: null }).eq("event_id", context.event.id).not("pinned_at", "is", null);
    if (clearResult.error) throw clearResult.error;
    patch = { pinned_at: now, pinned_by: context.viewer.userId };
  } else if (action.operation === "unpin") patch = { pinned_at: null, pinned_by: null };
  else if (action.operation === "spotlight") patch = {
    spotlighted_at: now,
    spotlighted_by: context.viewer.userId,
    spotlight_anonymous: action.anonymous,
    spotlight_duration_seconds: 8
  };
  else patch = { body: "Message removed", deleted_at: now, deleted_by: context.viewer.userId, delete_reason: action.reason ?? "Removed by host" };

  const updateResult = await admin.from("event_chat_messages").update(patch).eq("id", action.messageId).eq("event_id", context.event.id);
  if (updateResult.error) throw updateResult.error;
  await writeModerationLog(context, action.operation, action.messageId, action.reason ?? null, action.operation === "spotlight" ? { anonymous: action.anonymous } : {});
  return json({ ok: true });
}

async function reportMessage(context: CommunicationContext, action: Extract<ReturnType<typeof communicationActionSchema.parse>, { action: "report_message" }>) {
  const admin = createAdminClient();
  const targetResult = await admin.from("event_chat_messages").select("id,author_user_id").eq("id", action.messageId).eq("event_id", context.event.id).is("deleted_at", null).maybeSingle();
  if (targetResult.error) throw targetResult.error;
  if (!targetResult.data) return json({ error: "That message is no longer available." }, 404);
  if (targetResult.data.author_user_id === context.viewer.userId) return json({ error: "You cannot report your own message." }, 409);
  await writeModerationLog(context, "report", action.messageId, action.reason ?? "Reported from the live room", { reporterKind: context.viewer.kind });
  return json({ ok: true });
}

async function updateSettings(context: CommunicationContext, action: Extract<ReturnType<typeof communicationActionSchema.parse>, { action: "update_settings" }>) {
  const admin = createAdminClient();
  const patch: Record<string, unknown> = {
    event_id: context.event.id,
    updated_by: context.viewer.userId,
    updated_at: new Date().toISOString()
  };
  if (action.chatEnabled !== undefined) patch.chat_enabled = action.chatEnabled;
  if (action.reactionsEnabled !== undefined) patch.reactions_enabled = action.reactionsEnabled;
  if (action.slowModeSeconds !== undefined) patch.slow_mode_seconds = action.slowModeSeconds;
  const result = await admin.from("event_communication_settings").upsert(patch, { onConflict: "event_id" });
  if (result.error) throw result.error;
  await writeModerationLog(context, "settings", null, null, patch);
  return json({ ok: true });
}

async function ensureSettings(eventId: string): Promise<CommunicationSettings> {
  const admin = createAdminClient();
  const existing = await admin.from("event_communication_settings").select("chat_enabled,reactions_enabled,slow_mode_seconds").eq("event_id", eventId).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    const row = existing.data as SettingsRow;
    return { chatEnabled: row.chat_enabled, reactionsEnabled: row.reactions_enabled, slowModeSeconds: row.slow_mode_seconds };
  }
  const created = await admin.from("event_communication_settings").insert({ event_id: eventId }).select("chat_enabled,reactions_enabled,slow_mode_seconds").single();
  if (created.error?.code === "23505") return ensureSettings(eventId);
  if (created.error) throw created.error;
  const row = created.data as SettingsRow;
  return { chatEnabled: row.chat_enabled, reactionsEnabled: row.reactions_enabled, slowModeSeconds: row.slow_mode_seconds };
}

async function writeModerationLog(context: CommunicationContext, action: string, messageId: string | null, reason: string | null, details: Record<string, unknown>) {
  const admin = createAdminClient();
  const result = await admin.from("event_moderation_log").insert({
    event_id: context.event.id,
    moderator_user_id: context.viewer.userId,
    action,
    target_message_id: messageId,
    reason,
    details
  });
  if (result.error) throw result.error;
}

function toMessage(
  row: MessageRow,
  flightById: Map<string, FlightContextRow>,
  parentById: Map<string, ParentPreviewRow>,
  viewerUserId: string,
  viewerCanModerate: boolean
): LiveChatMessage {
  const flight = row.event_flight_item_id ? flightById.get(row.event_flight_item_id) : null;
  const parent = row.parent_message_id&&!(viewerCanModerate&&row.breakout_room_id) ? parentById.get(row.parent_message_id) : null;
  return {
    id: row.id,
    eventId: row.event_id,
    participantId: viewerCanModerate ? row.participant_id : null,
    authorKind: row.author_kind,
    authorDisplayName: row.author_display_name,
    own: row.author_user_id === viewerUserId,
    kind: row.message_kind,
    body: row.deleted_at ? "" : row.body,
    teaId: row.event_flight_item_id,
    teaTitle: flight?.reveal_title ?? null,
    teaPosition: flight?.position ?? null,
    breakoutRoomId:row.breakout_room_id,
    parentMessageId: row.parent_message_id,
    replyPreview: parent ? {
      authorDisplayName: parent.author_display_name,
      body: parent.deleted_at ? "Message removed" : parent.body.slice(0, 120)
    } : null,
    askHost: row.ask_host,
    answeredAt: row.answered_at,
    pinnedAt: row.pinned_at,
    spotlightedAt: row.spotlighted_at,
    spotlightAnonymous: row.spotlight_anonymous,
    spotlightDurationSeconds: row.spotlight_duration_seconds,
    deleted: Boolean(row.deleted_at),
    clientId: row.client_id,
    createdAt: row.created_at
  };
}

function toReaction(row: ReactionRow): LiveReactionEvent {
  return {
    id: row.id,
    eventId: row.event_id,
    reactionType: row.reaction_type,
    teaId: row.event_flight_item_id,
    breakoutRoomId:row.breakout_room_id,
    clientId: row.client_id,
    createdAt: row.created_at
  };
}

function messageVisibleInContext(row:{message_kind:string;breakout_room_id:string|null},breakoutRoomId:string|null){
  return row.breakout_room_id===breakoutRoomId||(Boolean(breakoutRoomId)&&row.breakout_room_id===null&&row.message_kind==="broadcast");
}

function validIsoDate(value: string | null) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function rateLimited(retryAfterMs: number) {
  const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return NextResponse.json({ error: "Take a breath before sending another one.", retryAfterMs }, {
    status: 429,
    headers: { "Retry-After": String(retryAfterSeconds), "Cache-Control": "private, no-store, max-age=0" }
  });
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" }
  });
}
