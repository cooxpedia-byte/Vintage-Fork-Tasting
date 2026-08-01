import { NextResponse } from "next/server";
import { z } from "zod";
import { createRequestClient } from "@/lib/supabase/request-auth";
import { logger } from "@/lib/logger";

const schema = z.object({
  id: z.string().uuid().optional(), name: z.string().trim().min(2).max(120), producer: z.string().trim().max(160).optional(), origin: z.string().trim().max(160).optional(),
  teaType: z.string().trim().max(80).optional(), character: z.string().trim().max(600).optional(), brewing: z.string().trim().max(600).optional(),
  steepSeconds: z.number().int().min(1).max(3600), imagePath: z.string().trim().max(500).optional(), retired: z.boolean().default(false)
});

export async function POST(request: Request) {
  try {
    const { client: supabase, user } = await createRequestClient(request);
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { data: profileData } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    const profile = profileData as { role: string } | null;
    if (!profile || !["host", "admin"].includes(profile.role)) return NextResponse.json({ error: "Staff access required." }, { status: 403 });
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid tea record." }, { status: 400 });
    const value = parsed.data;
    const payload = { name:value.name, producer:value.producer||null, origin:value.origin||null, tea_type:value.teaType||null, default_character:value.character||null, default_brewing:value.brewing||null, default_steep_seconds:value.steepSeconds, image_path:value.imagePath||null, retired_at:value.retired?new Date().toISOString():null };
    if (value.id) {
      const { data, error } = await supabase.from("teas").update(payload).eq("id", value.id).select("id").single();
      if (error) throw error; return NextResponse.json({ id:data.id });
    }
    const { data, error } = await supabase.from("teas").insert(payload).select("id").single();
    if (error) throw error; return NextResponse.json({ id:data.id });
  } catch (error) {
    logger.error("tea_save_failed", error);
    return NextResponse.json({ error: "The tea could not be saved." }, { status: 500 });
  }
}
