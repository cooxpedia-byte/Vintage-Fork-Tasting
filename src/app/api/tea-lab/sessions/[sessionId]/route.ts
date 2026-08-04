import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerFeatureFlags } from "@/lib/feature-flags";
import { createRequestClient } from "@/lib/supabase/request-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { TEA_LAB_PHOTO_BUCKET } from "@/lib/tea-lab/photos";
import {
  invalidTeaLabRequest,
  teaLabDisabledResponse,
  teaLabOperationFailure,
  teaLabSessionResponse
} from "@/lib/tea-lab/route";
import {
  soloSessionArchiveSchema,
  soloSessionDeletionSchema,
  soloSessionParamsSchema,
  soloSessionSaveSchema
} from "@/lib/tea-lab/validation";

type RouteContext = { params: Promise<{ sessionId: string }> };
type RpcResult = Promise<{ data: unknown; error: unknown }>;

function callRpc(client: SupabaseClient, name: string, args: Record<string, unknown>): RpcResult {
  return client.rpc(name, args) as unknown as RpcResult;
}

export async function GET(request: Request, { params }: RouteContext) {
  if (!getServerFeatureFlags().teaLab) return teaLabDisabledResponse();
  const parsedParams = soloSessionParamsSchema.safeParse(await params);
  if (!parsedParams.success) return invalidTeaLabRequest();
  const { sessionId } = parsedParams.data;

  try {
    const { client, user } = await createRequestClient(request);
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { data, error } = await client.from("tasting_sessions")
      .select("id,status,revision,completed_at,archived_at")
      .eq("id", sessionId)
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (error) return teaLabOperationFailure("tea_lab_session_state_failed", error, { sessionId });
    if (!data) return NextResponse.json({ error: "That tasting session was not found.", code: "session_not_found" }, { status: 404 });
    return teaLabSessionResponse(data)
      ?? teaLabOperationFailure("tea_lab_session_state_failed", new Error("invalid_result"), { sessionId });
  } catch (error) {
    return teaLabOperationFailure("tea_lab_session_state_failed", error, { sessionId });
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  if (!getServerFeatureFlags().teaLab) return teaLabDisabledResponse();
  const parsedParams = soloSessionParamsSchema.safeParse(await params);
  if (!parsedParams.success) return invalidTeaLabRequest();
  const { sessionId } = parsedParams.data;

  try {
    const { client, user } = await createRequestClient(request);
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const parsed = soloSessionSaveSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return invalidTeaLabRequest(parsed.error.issues[0]?.message);
    const { operationId, cardId, expectedRevision, tea, brewing, tasting } = parsed.data;
    const { data, error } = await callRpc(client, "save_solo_tasting_session_v2", {
      p_session_id: sessionId,
      p_card_id: cardId,
      p_operation_id: operationId,
      p_expected_revision: expectedRevision,
      p_tea: tea,
      p_card: { rating: tasting.rating, intensity: tasting.intensity },
      p_brewing: brewing,
      p_private_notes: {
        firstImpression: tasting.firstImpression,
        personalNotes: tasting.personalNotes
      },
      p_descriptor_ids: tasting.descriptorIds
    });
    if (error) return teaLabOperationFailure("tea_lab_session_save_rejected", error, { sessionId, operationId });
    return teaLabSessionResponse(data)
      ?? teaLabOperationFailure("tea_lab_session_save_failed", new Error("invalid_result"), { sessionId, operationId });
  } catch (error) {
    return teaLabOperationFailure("tea_lab_session_save_failed", error, { sessionId });
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  if (!getServerFeatureFlags().teaLab) return teaLabDisabledResponse();
  const parsedParams = soloSessionParamsSchema.safeParse(await params);
  if (!parsedParams.success) return invalidTeaLabRequest();
  const { sessionId } = parsedParams.data;

  try {
    const { client, user } = await createRequestClient(request);
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const parsed = soloSessionArchiveSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return invalidTeaLabRequest(parsed.error.issues[0]?.message);
    const { operationId, expectedRevision, archived } = parsed.data;
    const { data, error } = await callRpc(client, "set_tasting_session_archived", {
      p_session_id: sessionId,
      p_operation_id: operationId,
      p_expected_revision: expectedRevision,
      p_archived: archived
    });
    if (error) return teaLabOperationFailure("tea_lab_session_archive_rejected", error, { sessionId, operationId });
    return teaLabSessionResponse(data)
      ?? teaLabOperationFailure("tea_lab_session_archive_failed", new Error("invalid_result"), { sessionId, operationId });
  } catch (error) {
    return teaLabOperationFailure("tea_lab_session_archive_failed", error, { sessionId });
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  if (!getServerFeatureFlags().teaLab) return teaLabDisabledResponse();
  const parsedParams = soloSessionParamsSchema.safeParse(await params);
  if (!parsedParams.success) return invalidTeaLabRequest();
  const { sessionId } = parsedParams.data;

  try {
    const { client, user } = await createRequestClient(request);
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const parsed = soloSessionDeletionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return invalidTeaLabRequest(parsed.error.issues[0]?.message);
    const { operationId } = parsed.data;
    const { data: photoData, error: photoError } = await supabasePhotoPaths(client, user.id, sessionId);
    if (photoError) return teaLabOperationFailure("tea_lab_session_photo_cleanup_lookup_failed", photoError, { sessionId, operationId });
    const photoPaths = photoData;
    const { data, error } = await callRpc(client, "delete_tasting_session", {
      p_session_id: sessionId,
      p_operation_id: operationId
    });
    if (error) return teaLabOperationFailure("tea_lab_session_delete_rejected", error, { sessionId, operationId });
    if (data !== true) return teaLabOperationFailure("tea_lab_session_delete_failed", new Error("invalid_result"), { sessionId, operationId });
    if (photoPaths.length > 0) {
      const { error: removeError } = await createAdminClient().storage.from(TEA_LAB_PHOTO_BUCKET).remove(photoPaths);
      if (removeError) logger.error("tea_lab_session_photo_cleanup_failed", removeError, { sessionId });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return teaLabOperationFailure("tea_lab_session_delete_failed", error, { sessionId });
  }
}

async function supabasePhotoPaths(client: SupabaseClient, ownerUserId: string, sessionId: string) {
  const { data, error } = await client.from("tasting_card_photos")
    .select("storage_path,card:tasting_cards!inner(session_id)")
    .eq("owner_user_id", ownerUserId)
    .eq("card.session_id", sessionId);
  return {
    data: ((data ?? []) as unknown as Array<{ storage_path: string }>).map(row => row.storage_path),
    error
  };
}
