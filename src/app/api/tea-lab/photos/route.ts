import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerFeatureFlags } from "@/lib/feature-flags";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRequestClient } from "@/lib/supabase/request-auth";
import { TEA_LAB_PHOTO_BUCKET, TEA_LAB_PHOTO_LIMIT, type TeaLabPhoto } from "@/lib/tea-lab/photos";
import { invalidTeaLabRequest, teaLabDisabledResponse } from "@/lib/tea-lab/route";
import { tastingPhotoConfirmSchema, tastingPhotoPrepareSchema } from "@/lib/tea-lab/validation";

type CardRow = { id: string; session: { status: string } | Array<{ status: string }> | null };
type PhotoRow = {
  id: string;
  card_id: string;
  owner_user_id: string;
  storage_path: string;
  content_type: string;
  size_bytes: number;
  upload_status: "uploading" | "ready";
  alt_text: string | null;
  created_at: string;
};

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

function sessionStatus(card: CardRow): string | null {
  return Array.isArray(card.session) ? card.session[0]?.status ?? null : card.session?.status ?? null;
}

async function findOwnedCard(client: SupabaseClient, ownerUserId: string, cardId: string): Promise<CardRow | null> {
  const { data, error } = await client.from("tasting_cards")
    .select("id,session:tasting_sessions!inner(status)")
    .eq("id", cardId)
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as CardRow | null;
}

function photoFromRow(row: PhotoRow, url: string | null): TeaLabPhoto {
  return {
    id: row.id,
    url,
    altText: row.alt_text,
    createdAt: row.created_at,
    status: row.upload_status
  };
}

export async function GET(request: Request) {
  if (!getServerFeatureFlags().teaLab) return teaLabDisabledResponse();
  const cardId = new URL(request.url).searchParams.get("cardId");
  const parsed = tastingPhotoPrepareSchema.shape.cardId.safeParse(cardId);
  if (!parsed.success) return invalidTeaLabRequest();

  try {
    const { client, user } = await createRequestClient(request);
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!await findOwnedCard(client, user.id, parsed.data)) {
      return NextResponse.json({ error: "Tasting card not found." }, { status: 404 });
    }

    const { data, error } = await client.from("tasting_card_photos")
      .select("id,card_id,owner_user_id,storage_path,content_type,size_bytes,upload_status,alt_text,created_at")
      .eq("card_id", parsed.data)
      .eq("owner_user_id", user.id)
      .order("created_at");
    if (error) throw error;
    const rows = (data ?? []) as unknown as PhotoRow[];
    const readyRows = rows.filter(row => row.upload_status === "ready");
    const admin = createAdminClient();
    const signedByPath = new Map<string, string>();
    if (readyRows.length > 0) {
      const { data: signed, error: signedError } = await admin.storage.from(TEA_LAB_PHOTO_BUCKET)
        .createSignedUrls(readyRows.map(row => row.storage_path), 60 * 60);
      if (signedError) throw signedError;
      for (const item of signed ?? []) if (item.signedUrl && item.path) signedByPath.set(item.path, item.signedUrl);
    }
    return NextResponse.json({ photos: rows.map(row => photoFromRow(row, signedByPath.get(row.storage_path) ?? null)) });
  } catch (error) {
    logger.error("tea_lab_photo_list_failed", error, { cardId: parsed.data });
    return NextResponse.json({ error: "Photos could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!getServerFeatureFlags().teaLab) return teaLabDisabledResponse();
  const parsed = tastingPhotoPrepareSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidTeaLabRequest(parsed.error.issues[0]?.message);

  try {
    const { client, user } = await createRequestClient(request);
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const card = await findOwnedCard(client, user.id, parsed.data.cardId);
    if (!card) return NextResponse.json({ error: "Tasting card not found." }, { status: 404 });
    if (sessionStatus(card) === "completed") {
      return NextResponse.json({ error: "Photos can only be added while the tasting is in progress." }, { status: 409 });
    }

    const { count, error: countError } = await client.from("tasting_card_photos")
      .select("id", { count: "exact", head: true })
      .eq("card_id", parsed.data.cardId)
      .eq("owner_user_id", user.id);
    if (countError) throw countError;
    if ((count ?? 0) >= TEA_LAB_PHOTO_LIMIT) {
      return NextResponse.json({ error: `A tasting can have up to ${TEA_LAB_PHOTO_LIMIT} photos.` }, { status: 409 });
    }

    const photoId = crypto.randomUUID();
    const storagePath = `${user.id}/${parsed.data.cardId}/${photoId}.${EXTENSIONS[parsed.data.contentType]}`;
    const admin = createAdminClient();
    const { data: upload, error: uploadError } = await admin.storage.from(TEA_LAB_PHOTO_BUCKET)
      .createSignedUploadUrl(storagePath);
    if (uploadError) throw uploadError;
    const { error: insertError } = await admin.from("tasting_card_photos").insert({
      id: photoId,
      card_id: parsed.data.cardId,
      owner_user_id: user.id,
      storage_path: storagePath,
      content_type: parsed.data.contentType,
      size_bytes: parsed.data.sizeBytes,
      upload_status: "uploading"
    });
    if (insertError) throw insertError;

    return NextResponse.json({ photoId, path: storagePath, token: upload.token });
  } catch (error) {
    logger.error("tea_lab_photo_prepare_failed", error, { cardId: parsed.data.cardId });
    return NextResponse.json({ error: "The photo upload could not be prepared." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!getServerFeatureFlags().teaLab) return teaLabDisabledResponse();
  const parsed = tastingPhotoConfirmSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidTeaLabRequest(parsed.error.issues[0]?.message);

  try {
    const { client, user } = await createRequestClient(request);
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { data, error } = await client.from("tasting_card_photos")
      .select("id,card_id,owner_user_id,storage_path,content_type,size_bytes,upload_status,alt_text,created_at")
      .eq("id", parsed.data.photoId)
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    const photo = data as unknown as PhotoRow | null;
    if (!photo) return NextResponse.json({ error: "Photo not found." }, { status: 404 });

    const slash = photo.storage_path.lastIndexOf("/");
    const folder = photo.storage_path.slice(0, slash);
    const filename = photo.storage_path.slice(slash + 1);
    const admin = createAdminClient();
    const { data: objects, error: listError } = await admin.storage.from(TEA_LAB_PHOTO_BUCKET)
      .list(folder, { search: filename, limit: 10 });
    if (listError) throw listError;
    if (!(objects ?? []).some(object => object.name === filename)) {
      return NextResponse.json({ error: "The photo has not finished uploading." }, { status: 409 });
    }

    const { error: updateError } = await admin.from("tasting_card_photos")
      .update({ upload_status: "ready" })
      .eq("id", photo.id)
      .eq("owner_user_id", user.id);
    if (updateError) throw updateError;
    const { data: signed, error: signedError } = await admin.storage.from(TEA_LAB_PHOTO_BUCKET)
      .createSignedUrl(photo.storage_path, 60 * 60);
    if (signedError) throw signedError;

    return NextResponse.json({ photo: photoFromRow({ ...photo, upload_status: "ready" }, signed.signedUrl) });
  } catch (error) {
    logger.error("tea_lab_photo_confirm_failed", error, { photoId: parsed.data.photoId });
    return NextResponse.json({ error: "The photo upload could not be completed." }, { status: 500 });
  }
}
