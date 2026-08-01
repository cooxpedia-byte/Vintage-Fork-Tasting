import { NextResponse } from "next/server";
import { z } from "zod";
import { createRequestClient } from "@/lib/supabase/request-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

const requestSchema = z.object({
  filename: z.string().min(1).max(160),
  contentType: z.enum(["image/jpeg","image/png","image/webp","audio/mpeg","audio/ogg"]),
  eventId: z.string().uuid().optional(),
  teaId: z.string().uuid().optional()
}).refine(x => Boolean(x.eventId) !== Boolean(x.teaId), "Choose exactly one event or tea.");

export async function POST(request: Request) {
  try {
    const { client: supabase, user } = await createRequestClient(request);
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { data: profileData } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    const profile = profileData as { role: string } | null;
    if (!profile || !["host","admin"].includes(profile.role)) return NextResponse.json({ error: "Staff access required." }, { status: 403 });
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid media request." }, { status: 400 });
    const clean = parsed.data.filename.toLowerCase().replace(/[^a-z0-9._-]+/g,"-");
    if (parsed.data.eventId) {
      const { data: allowed } = await supabase.rpc("can_manage_event", { p_event_id: parsed.data.eventId, uid: user.id });
      if (!allowed) return NextResponse.json({ error: "You do not have access to that event." }, { status: 403 });
    } else {
      const { data: tea } = await supabase.from("teas").select("id").eq("id", parsed.data.teaId!).maybeSingle();
      if (!tea) return NextResponse.json({ error: "Tea not found." }, { status: 404 });
    }
    const parent = parsed.data.eventId ? `events/${parsed.data.eventId}` : `teas/${parsed.data.teaId}`;
    const path = `${parent}/${crypto.randomUUID()}-${clean}`;
    const admin = createAdminClient();
    const { data, error } = await admin.storage.from("tasting-media").createSignedUploadUrl(path);
    if (error) throw error;
    await admin.from("event_media").insert({ event_id: parsed.data.eventId ?? null, tea_id: parsed.data.teaId ?? null, storage_path: path, media_type: parsed.data.contentType, uploaded_by: user.id });
    return NextResponse.json({ path, token: data.token, signedUrl: data.signedUrl });
  } catch (error) {
    logger.error("media_upload_url_failed", error);
    return NextResponse.json({ error: "The upload could not be prepared." }, { status: 500 });
  }
}
