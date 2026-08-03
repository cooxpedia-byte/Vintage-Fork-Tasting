import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerFeatureFlags } from "@/lib/feature-flags";
import { createRequestClient } from "@/lib/supabase/request-auth";
import { toTeaLabPersonalTeaResult } from "@/lib/tea-lab/api";
import { invalidTeaLabRequest, teaLabDisabledResponse, teaLabOperationFailure } from "@/lib/tea-lab/route";
import { personalTeaArchiveSchema, personalTeaParamsSchema } from "@/lib/tea-lab/validation";

type RouteContext = { params: Promise<{ teaId: string }> };
type RpcResult = Promise<{ data: unknown; error: unknown }>;

function callRpc(client: SupabaseClient, name: string, args: Record<string, unknown>): RpcResult {
  return client.rpc(name, args) as unknown as RpcResult;
}

export async function PATCH(request: Request, { params }: RouteContext) {
  if (!getServerFeatureFlags().teaLab) return teaLabDisabledResponse();
  const parsedParams = personalTeaParamsSchema.safeParse(await params);
  if (!parsedParams.success) return invalidTeaLabRequest();
  const { teaId } = parsedParams.data;

  try {
    const { client, user } = await createRequestClient(request);
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const parsed = personalTeaArchiveSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return invalidTeaLabRequest(parsed.error.issues[0]?.message);
    const { operationId, archived } = parsed.data;
    const { data, error } = await callRpc(client, "set_personal_tea_record_archived", {
      p_personal_tea_id: teaId,
      p_operation_id: operationId,
      p_archived: archived
    });
    if (error) return teaLabOperationFailure("tea_lab_personal_tea_archive_rejected", error, { teaId, operationId });
    const personalTea = toTeaLabPersonalTeaResult(data);
    return personalTea
      ? NextResponse.json({ personalTea })
      : teaLabOperationFailure("tea_lab_personal_tea_archive_failed", new Error("invalid_result"), { teaId, operationId });
  } catch (error) {
    return teaLabOperationFailure("tea_lab_personal_tea_archive_failed", error, { teaId });
  }
}
