import { NextResponse } from "next/server";
import { getServerFeatureFlags } from "@/lib/feature-flags";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRequestClient } from "@/lib/supabase/request-auth";
import { TEA_LAB_PHOTO_BUCKET } from "@/lib/tea-lab/photos";
import { invalidTeaLabRequest, teaLabDisabledResponse } from "@/lib/tea-lab/route";
import { tastingPhotoParamsSchema } from "@/lib/tea-lab/validation";

type RouteContext = { params: Promise<{ photoId: string }> };

export async function DELETE(request: Request, { params }: RouteContext) {
  if (!getServerFeatureFlags().teaLab) return teaLabDisabledResponse();
  const parsed = tastingPhotoParamsSchema.safeParse(await params);
  if (!parsed.success) return invalidTeaLabRequest();

  try {
    const { client, user } = await createRequestClient(request);
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { data, error } = await client.from("tasting_card_photos")
      .select("id,storage_path,card:tasting_cards!inner(session:tasting_sessions!inner(status))")
      .eq("id", parsed.data.photoId)
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    const photo = data as unknown as {
      id: string;
      storage_path: string;
      card: { session: { status: string } | Array<{ status: string }> } | Array<{ session: { status: string } | Array<{ status: string }> }>;
    } | null;
    if (!photo) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    const card = Array.isArray(photo.card) ? photo.card[0] : photo.card;
    const session = card && (Array.isArray(card.session) ? card.session[0] : card.session);
    if (session?.status === "completed") {
      return NextResponse.json({ error: "Completed tasting photos cannot be changed." }, { status: 409 });
    }

    const admin = createAdminClient();
    const { error: removeError } = await admin.storage.from(TEA_LAB_PHOTO_BUCKET).remove([photo.storage_path]);
    if (removeError) throw removeError;
    const { error: deleteError } = await admin.from("tasting_card_photos")
      .delete()
      .eq("id", photo.id)
      .eq("owner_user_id", user.id);
    if (deleteError) throw deleteError;
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("tea_lab_photo_delete_failed", error, { photoId: parsed.data.photoId });
    return NextResponse.json({ error: "The photo could not be removed." }, { status: 500 });
  }
}
