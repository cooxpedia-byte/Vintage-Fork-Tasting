import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerFeatureFlags } from "@/lib/feature-flags";
import { createRequestClient } from "@/lib/supabase/request-auth";
import {
  invalidTeaLabRequest,
  teaLabDisabledResponse,
  teaLabOperationFailure,
  teaLabSessionResponse
} from "@/lib/tea-lab/route";
import { soloSessionCompletionSchema, soloSessionParamsSchema } from "@/lib/tea-lab/validation";

type RouteContext = { params: Promise<{ sessionId: string }> };
type RpcResult = Promise<{ data: unknown; error: unknown }>;

function callRpc(client: SupabaseClient, name: string, args: Record<string, unknown>): RpcResult {
  return client.rpc(name, args) as unknown as RpcResult;
}

export async function POST(request: Request, { params }: RouteContext) {
  if (!getServerFeatureFlags().teaLab) return teaLabDisabledResponse();
  const parsedParams = soloSessionParamsSchema.safeParse(await params);
  if (!parsedParams.success) return invalidTeaLabRequest();
  const { sessionId } = parsedParams.data;

  try {
    const { client, user } = await createRequestClient(request);
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const parsed = soloSessionCompletionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return invalidTeaLabRequest(parsed.error.issues[0]?.message);
    const { operationId, expectedRevision } = parsed.data;
    const { data, error } = await callRpc(client, "complete_tasting_session", {
      p_session_id: sessionId,
      p_operation_id: operationId,
      p_expected_revision: expectedRevision
    });
    if (error) return teaLabOperationFailure("tea_lab_session_complete_rejected", error, { sessionId, operationId });
    return teaLabSessionResponse(data)
      ?? teaLabOperationFailure("tea_lab_session_complete_failed", new Error("invalid_result"), { sessionId, operationId });
  } catch (error) {
    return teaLabOperationFailure("tea_lab_session_complete_failed", error, { sessionId });
  }
}
