import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export async function GET() {
  const headerStore = await headers();
  const supplied = headerStore.get("authorization");
  if (!process.env.CRON_SECRET || supplied !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const cutoff = new Date().toISOString();
  const { data, error } = await admin.from("participants").delete().is("user_id", null).lt("delete_after", cutoff).select("id");
  if (error) { logger.error("retention_cleanup_failed", error); return NextResponse.json({ error: "Cleanup failed" }, { status: 500 }); }
  logger.info("retention_cleanup_complete", { deleted: data?.length ?? 0 });
  return NextResponse.json({ deleted: data?.length ?? 0 });
}
