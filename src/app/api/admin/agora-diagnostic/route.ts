import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  AGORA_TOKEN_TTL_SECONDS,
  agoraChannelName,
  agoraUserAccount,
  createAgoraRtcToken,
  getAgoraConfiguration
} from "@/lib/agora";
import { logger } from "@/lib/logger";
import { createRequestClient } from "@/lib/supabase/request-auth";

const DIAGNOSTIC_TOKEN_TTL_SECONDS = Math.min(10 * 60, AGORA_TOKEN_TTL_SECONDS);

export async function POST(request: Request) {
  try {
    const { client: supabase, user } = await createRequestClient(request);
    if (!user) return response({ error: "Authentication required." }, 401);
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!profile || !["host", "admin"].includes(profile.role)) return response({ error: "Staff access required." }, 403);

    const body = await request.json().catch(() => ({})) as { action?: string; diagnostic?: unknown };
    if (body.action === "report") {
      logger.info("agora_browser_diagnostic", {
        userId: user.id,
        diagnostic: sanitizeDiagnostic(body.diagnostic)
      });
      return response({ ok: true });
    }

    const config = getAgoraConfiguration();
    if (!config) return response({ error: "Video configuration is unavailable." }, 503);
    const channel = agoraChannelName(randomUUID());
    const account = agoraUserAccount("host", user.id);
    const token = createAgoraRtcToken({
      ...config,
      channel,
      account,
      expiresInSeconds: DIAGNOSTIC_TOKEN_TTL_SECONDS
    });
    return response({
      appId: config.appId,
      channel,
      account,
      token,
      expiresAt: new Date(Date.now() + DIAGNOSTIC_TOKEN_TTL_SECONDS * 1000).toISOString()
    });
  } catch (error) {
    logger.error("agora_browser_diagnostic_failed", error);
    return response({ error: "The video diagnostic could not start." }, 500);
  }
}

function sanitizeDiagnostic(value: unknown) {
  if (!value || typeof value !== "object") return {};
  const input = value as Record<string, unknown>;
  const allowed = ["stage", "mode", "current", "previous", "reason", "code", "message", "sdk", "browser", "online", "secureContext", "compatible", "codecs", "elapsedMs", "usingProxy"];
  return Object.fromEntries(allowed.flatMap(key => key in input ? [[key, sanitizeValue(input[key])]] : []));
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return value.slice(0, 500);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 10).map(sanitizeValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 10).map(([key, item]) => [key, sanitizeValue(item)]));
  return String(value ?? "").slice(0, 500);
}

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
