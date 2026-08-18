import { describe, expect, it } from "vitest";
import {
  TEA_REACTIONS,
  communicationActionSchema,
  evaluateCommunicationRateLimit,
  isSpotlightActive,
  mergeMessages,
  type LiveChatMessage
} from "@/lib/live-communication";

function message(id: string, createdAt: string, body = id): LiveChatMessage {
  return {
    id,
    eventId: "event-1",
    participantId: null,
    authorKind: "guest",
    authorDisplayName: "Guest",
    own: false,
    kind: "chat",
    body,
    teaId: null,
    teaTitle: null,
    teaPosition: null,
    breakoutRoomId:null,
    parentMessageId: null,
    replyPreview: null,
    askHost: false,
    answeredAt: null,
    pinnedAt: null,
    spotlightedAt: null,
    spotlightAnonymous: false,
    spotlightDurationSeconds: 8,
    deleted: false,
    clientId: "00000000-0000-4000-8000-000000000001",
    createdAt
  };
}

describe("tea-native live communication", () => {
  it("keeps the reaction vocabulary curated to nine tea-specific expressions", () => {
    expect(TEA_REACTIONS.map(reaction => reaction.type)).toEqual([
      "tea_cup", "leaf", "flower", "honey_drop", "spark", "thinking", "same", "different", "question"
    ]);
    expect(TEA_REACTIONS.every(reaction => reaction.label && reaction.meaning)).toBe(true);
  });

  it("validates message and reaction actions at the API boundary", () => {
    const messageAction = communicationActionSchema.parse({
      action: "send_message",
      clientId: "00000000-0000-4000-8000-000000000001",
      body: "  Floral after cooling  "
    });
    expect(messageAction.action === "send_message" && messageAction.body).toBe("Floral after cooling");
    expect(communicationActionSchema.safeParse({
      action: "send_reaction",
      clientId: "00000000-0000-4000-8000-000000000001",
      reactionType: "fire"
    }).success).toBe(false);
    expect(communicationActionSchema.safeParse({
      action: "send_message",
      clientId: "00000000-0000-4000-8000-000000000001",
      body: "x".repeat(601)
    }).success).toBe(false);
  });

  it("enforces both a minimum gap and a rolling-window ceiling", () => {
    expect(evaluateCommunicationRateLimit({
      timestamps: [9_700], now: 10_000, minimumGapMs: 500, windowMs: 10_000, maximumInWindow: 16
    })).toEqual({ allowed: false, retryAfterMs: 200 });
    expect(evaluateCommunicationRateLimit({
      timestamps: [1_000, 2_000, 3_000], now: 10_000, minimumGapMs: 500, windowMs: 10_000, maximumInWindow: 3
    })).toEqual({ allowed: false, retryAfterMs: 1_000 });
    expect(evaluateCommunicationRateLimit({
      timestamps: [1_000], now: 10_000, minimumGapMs: 500, windowMs: 5_000, maximumInWindow: 3
    })).toEqual({ allowed: true, retryAfterMs: 0 });
  });

  it("merges paginated and realtime messages without duplicates", () => {
    const merged = mergeMessages(
      [message("new", "2026-08-17T10:00:02.000Z")],
      [message("old", "2026-08-17T10:00:01.000Z"), message("new", "2026-08-17T10:00:02.000Z", "updated")]
    );
    expect(merged.map(item => item.id)).toEqual(["old", "new"]);
    expect(merged[1]?.body).toBe("updated");
  });

  it("expires spotlight cards using the host-selected display window", () => {
    const spotlight = { spotlightedAt: "2026-08-17T10:00:00.000Z", spotlightDurationSeconds: 8 };
    expect(isSpotlightActive(spotlight, new Date("2026-08-17T10:00:07.999Z").getTime())).toBe(true);
    expect(isSpotlightActive(spotlight, new Date("2026-08-17T10:00:08.000Z").getTime())).toBe(false);
  });
});
