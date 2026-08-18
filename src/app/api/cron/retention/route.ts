import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export async function GET() {
  const startedAt = new Date().toISOString();
  const headerStore = await headers();
  const supplied = headerStore.get("authorization");
  if (!process.env.CRON_SECRET || supplied !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const cutoff = new Date().toISOString();
  const { data, error } = await admin.from("participants").delete().is("user_id", null).lt("delete_after", cutoff).select("id");
  if (error) {
    const { error:auditError }=await admin.from("operational_job_runs").insert({ job_name:"retention",status:"failed",started_at:startedAt,details:{ code:error.code } });
    if(auditError) logger.error("retention_audit_failed",auditError);
    logger.error("retention_cleanup_failed", error);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
  const emailCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const reactionCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [tokenCleanup, deliveryCleanup, reactionCleanup] = await Promise.all([
    admin.from("participant_deletion_tokens").delete().lt("expires_at", cutoff).select("id"),
    admin.from("recap_email_deliveries").delete().lt("requested_at", emailCutoff).select("id"),
    admin.from("event_reactions").delete().lt("created_at", reactionCutoff).select("id")
  ]);
  if (tokenCleanup.error || deliveryCleanup.error || reactionCleanup.error) {
    const cleanupError = tokenCleanup.error ?? deliveryCleanup.error ?? reactionCleanup.error;
    const { error: auditError } = await admin.from("operational_job_runs").insert({ job_name: "retention", status: "failed", started_at: startedAt, details: { code: cleanupError?.code } });
    if (auditError) logger.error("retention_audit_failed", auditError);
    logger.error("guest_privacy_retention_failed", cleanupError);
    return NextResponse.json({ error: "Guest privacy cleanup failed" }, { status: 500 });
  }
  const details = {
    deleted: data?.length ?? 0,
    expired_deletion_tokens: tokenCleanup.data?.length ?? 0,
    expired_recap_deliveries: deliveryCleanup.data?.length ?? 0,
    expired_live_reactions: reactionCleanup.data?.length ?? 0,
    live_reward_reconciliation: "not_run" as "not_run"|"complete"|"deferred"
  };
  const rewardRetry=await admin.rpc("process_live_tasting_rewards",{});
  if(rewardRetry.error){
    details.live_reward_reconciliation="deferred";
    logger.warn("live_reward_reconciliation_deferred",{code:rewardRetry.error.code});
  }else details.live_reward_reconciliation="complete";
  const { error:auditError }=await admin.from("operational_job_runs").insert({ job_name:"retention",status:"succeeded",started_at:startedAt,details });
  if(auditError){logger.error("retention_audit_failed",auditError);return NextResponse.json({error:"Cleanup completed but audit evidence failed"},{status:500})}
  logger.info("retention_cleanup_complete", details);
  return NextResponse.json(details);
}
