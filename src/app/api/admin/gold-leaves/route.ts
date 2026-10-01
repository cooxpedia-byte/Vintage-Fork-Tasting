import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin/require-admin";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ walletId: z.string().uuid(), requestId: z.string().uuid(), amount: z.number().int().min(1).max(5000), reason: z.string().trim().min(6).max(240) }).strict();
const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request) {
  const access = await requireAdminApi();
  if (!access.ok) return response({ error: access.error }, access.status);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return response({ error: "Choose a wallet, enter 1–5,000 Leaves, and record a reason." }, 422);
  const { walletId, requestId, amount, reason } = parsed.data;
  const admin = createAdminClient();
  const { data: wallet, error: walletError } = await admin.from("merchant_wallets").select("id,owner_user_id").eq("id", walletId).maybeSingle();
  if (walletError) return response({ error: "The wallet could not be verified. Retry this request." }, 503);
  if (!wallet) return response({ error: "This Gold Leaves wallet is unavailable." }, 409);
  // The canonical RPC compares wallet, amount and source_reference on retries.
  // Bind the reason too, since descriptions/metadata are not compared by that RPC.
  const reasonHash = createHash("sha256").update(reason).digest("hex");
  const { data: entryId, error } = await admin.rpc("post_gold_leaves_entry", {
    p_wallet_id: walletId,
    p_entry_type: "adjustment",
    p_leaves_delta: amount,
    p_source: "admin_dashboard",
    p_source_reference: `${access.user.id}:${reasonHash}`,
    p_idempotency_key: `admin:${access.user.id}:${requestId}`,
    p_description: reason,
    p_metadata: { actor_type: "admin", actor_id: access.user.id, reason, request_id: requestId },
    p_allow_negative_balance: false,
  });
  if (error) {
    logger.error("admin_gold_leaves_award_failed", error, { actorId: access.user.id });
    if (error.code === "23505") return response({ error: "This request was already used for a different award. Reload to review recent activity before starting a new award." }, 409);
    // A lost response may follow a committed credit. Never promise that nothing changed.
    return response({ error: "The award could not be confirmed. Retry the same request to check it safely." }, 503);
  }
  return response({ entryId, message: `${amount.toLocaleString("en-CA")} Gold Leaves credited. Any refund debt is repaid before spendable Leaves increase.` });
}
