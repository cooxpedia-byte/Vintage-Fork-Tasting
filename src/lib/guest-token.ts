import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export function createGuestToken() { return randomBytes(32).toString("base64url"); }
export function hashGuestToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
export function guestCookieName(eventId: string) { return `vf_guest_${eventId.replaceAll("-", "")}`; }

export async function requireParticipant(eventId: string) {
  const store = await cookies();
  const raw = store.get(guestCookieName(eventId))?.value;
  if (!raw) return null;
  const hash = hashGuestToken(raw);
  const admin = createAdminClient();
  const { data } = await admin.from("participant_tokens").select("participant_id,expires_at,participant:participants(*)").eq("token_hash", hash).gt("expires_at", new Date().toISOString()).single();
  if (!data?.participant) return null;
  const participant = Array.isArray(data.participant) ? data.participant[0] : data.participant;
  if (!participant || participant.event_id !== eventId) return null;
  return participant;
}

export function constantTimeEqual(a: string, b: string) {
  const aa = Buffer.from(a); const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
