import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireParticipant, hashGuestToken } from "@/lib/guest-token";
import { logger } from "@/lib/logger";
import {
  buildRecapEmail,
  getRecapMailSettings,
  maskEmail,
  RecapEmailConfigurationError,
  sendRecapEmail,
  type RecapEmailTea
} from "@/lib/recap-email";
import { createAdminClient } from "@/lib/supabase/admin";
import { recapEmailSchema } from "@/lib/validation";

type FlightRow = {
  id: string;
  position: number;
  reveal_title: string;
  tea: { name: string; origin: string | null } | Array<{ name: string; origin: string | null }> | null;
};

type ResponseRow = {
  event_flight_item_id: string;
  descriptors: string[];
  intensity: string | null;
  rating: number | null;
  personal_notes: string | null;
  saved: boolean;
  completed_at: string | null;
};

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  let deliveryId: string | null = null;
  let attemptsRemaining: number | null = null;
  try {
    const participant = await requireParticipant(eventId);
    if (!participant) return NextResponse.json({ error: "Participation session expired." }, { status: 401 });

    const parsed = recapEmailSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Enter a complete email address." }, { status: 400 });
    const recipientEmail = (parsed.data.email || participant.email || "").trim().toLowerCase();
    if (!recipientEmail) return NextResponse.json({ error: "Enter an email address for your recap." }, { status: 400 });

    let settings;
    try {
      settings = getRecapMailSettings();
    } catch (error) {
      if (error instanceof RecapEmailConfigurationError) {
        return NextResponse.json({ error: "Recap email is temporarily unavailable. Your tasting remains here." }, { status: 503 });
      }
      throw error;
    }

    const admin = createAdminClient();
    const [eventResult, flightResult, responseResult] = await Promise.all([
      admin.from("events").select("id,title,status,phase,starts_at").eq("id", eventId).single(),
      admin.from("event_flight_items").select("id,position,reveal_title,tea:teas(name,origin)").eq("event_id", eventId).order("position"),
      admin.from("tea_responses").select("event_flight_item_id,descriptors,intensity,rating,personal_notes,saved,completed_at").eq("participant_id", participant.id)
    ]);
    if (eventResult.error) throw eventResult.error;
    if (flightResult.error) throw flightResult.error;
    if (responseResult.error) throw responseResult.error;
    const event = eventResult.data;
    const flightData = flightResult.data;
    const responseData = responseResult.data;
    if (!event) return NextResponse.json({ error: "Tasting not found." }, { status: 404 });
    if (event.status !== "completed" && !["recap", "ended"].includes(event.phase)) {
      return NextResponse.json({ error: "Your recap will be available when the tasting finishes." }, { status: 409 });
    }

    const { data: reservation, error: reservationError } = await admin.rpc("reserve_recap_email_delivery", {
      p_participant_id: participant.id,
      p_recipient_email: recipientEmail
    });
    if (reservationError) {
      if (reservationError.message.includes("recap_email_limit")) {
        return NextResponse.json({ error: "You’ve reached today’s recap-email limit. Your recap remains available here." }, { status: 429 });
      }
      throw reservationError;
    }
    const reserved = (Array.isArray(reservation) ? reservation[0] : reservation) as { delivery_id?: string; attempts_remaining?: number } | null;
    deliveryId = reserved?.delivery_id ?? null;
    attemptsRemaining = reserved?.attempts_remaining ?? 0;
    if (!deliveryId) throw new Error("Recap delivery was not reserved.");

    const deletionToken = randomBytes(32).toString("base64url");
    const deletionExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    const { error: tokenError } = await admin.from("participant_deletion_tokens").insert({
      participant_id: participant.id,
      event_id: eventId,
      token_hash: hashGuestToken(deletionToken),
      expires_at: deletionExpiresAt
    });
    if (tokenError) throw tokenError;

    const responses = (responseData ?? []) as ResponseRow[];
    const teas: RecapEmailTea[] = ((flightData ?? []) as unknown as FlightRow[]).map(item => {
      const response = responses.find(row => row.event_flight_item_id === item.id);
      const tea = Array.isArray(item.tea) ? item.tea[0] : item.tea;
      return {
        name: tea?.name ?? item.reveal_title,
        origin: tea?.origin ?? null,
        rating: response?.rating ?? null,
        descriptors: response?.descriptors ?? [],
        intensity: response?.intensity ?? null,
        personalNotes: response?.personal_notes ?? null,
        saved: response?.saved ?? false,
        completed: Boolean(response?.completed_at)
      };
    });
    const siteOrigin = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://tasting.vintagefork.ca").origin;
    // Keep the one-time credential in the URL fragment so it is never sent in an HTTP request or referrer.
    const deletionUrl = `${siteOrigin}/privacy/delete#event=${encodeURIComponent(eventId)}&token=${encodeURIComponent(deletionToken)}`;
    const content = buildRecapEmail({
      participantName: participant.display_name,
      eventTitle: event.title,
      eventDate: new Date(event.starts_at).toLocaleDateString("en-CA", { dateStyle: "long" }),
      teas,
      deletionUrl
    });
    const messageId = await sendRecapEmail({
      settings,
      recipientEmail,
      recipientName: participant.display_name,
      content
    });
    const { error: updateError } = await admin.from("recap_email_deliveries").update({
      status: "sent",
      provider_message_id: messageId,
      completed_at: new Date().toISOString()
    }).eq("id", deliveryId);
    if (updateError) logger.error("guest_recap_email_audit_failed", updateError, { eventId, deliveryId });

    logger.info("guest_recap_email_sent", { eventId, deliveryId });
    return NextResponse.json({
      ok: true,
      maskedEmail: maskEmail(recipientEmail),
      attemptsRemaining
    });
  } catch (error) {
    if (deliveryId) {
      const admin = createAdminClient();
      const { error: updateError } = await admin.from("recap_email_deliveries").update({
        status: "failed",
        error_code: "delivery_failed",
        completed_at: new Date().toISOString()
      }).eq("id", deliveryId);
      if (updateError) logger.error("guest_recap_email_failure_record_failed", updateError, { eventId, deliveryId });
    }
    logger.error("guest_recap_email_failed", error, { eventId, deliveryId });
    return NextResponse.json({
      error: "We couldn’t send that recap. Your tasting remains here—check the address and try again.",
      attemptsRemaining
    }, { status: 502 });
  }
}
