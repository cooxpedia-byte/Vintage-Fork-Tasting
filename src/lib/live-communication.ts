import { z } from "zod";

export const TEA_REACTIONS = [
  { type: "tea_cup", label: "Tea Cup", shortLabel: "Cheers", meaning: "I’m with you" },
  { type: "leaf", label: "Leaf", shortLabel: "Noticed", meaning: "I noticed something" },
  { type: "flower", label: "Flower", shortLabel: "Floral", meaning: "Floral or aromatic" },
  { type: "honey_drop", label: "Honey Drop", shortLabel: "Sweet", meaning: "Sweet or luscious" },
  { type: "spark", label: "Spark", shortLabel: "Surprise", meaning: "Surprising or exciting" },
  { type: "thinking", label: "Thinking", shortLabel: "Thinking", meaning: "Still figuring it out" },
  { type: "same", label: "Same!", shortLabel: "Same", meaning: "I’m getting that too" },
  { type: "different", label: "Interesting difference", shortLabel: "Interesting", meaning: "I’m hearing or experiencing something different" },
  { type: "question", label: "Question", shortLabel: "Question", meaning: "I have a question" }
] as const;

export type TeaReactionType = (typeof TEA_REACTIONS)[number]["type"];
export type CommunicationPresentation = "guest" | "host";
export type CommunicationMessageKind = "chat" | "broadcast";

const reactionTypeSchema = z.enum([
  "tea_cup",
  "leaf",
  "flower",
  "honey_drop",
  "spark",
  "thinking",
  "same",
  "different",
  "question"
]);

const clientIdSchema = z.string().uuid();
const messageIdSchema = z.string().uuid();

export const communicationActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("send_message"),
    clientId: clientIdSchema,
    body: z.string().trim().min(1, "Write a message first.").max(600, "Keep messages under 600 characters."),
    parentMessageId: messageIdSchema.nullish(),
    askHost: z.boolean().optional().default(false),
    kind: z.enum(["chat", "broadcast"]).optional().default("chat")
  }),
  z.object({
    action: z.literal("send_reaction"),
    clientId: clientIdSchema,
    reactionType: reactionTypeSchema
  }),
  z.object({ action: z.literal("mark_read") }),
  z.object({
    action: z.literal("moderate"),
    operation: z.enum(["answer", "pin", "unpin", "spotlight", "delete", "remove_participant"]),
    messageId: messageIdSchema,
    anonymous: z.boolean().optional().default(false),
    reason: z.string().trim().max(240).optional()
  }),
  z.object({
    action: z.literal("report_message"),
    messageId: messageIdSchema,
    reason: z.string().trim().max(240).optional()
  }),
  z.object({
    action: z.literal("update_settings"),
    chatEnabled: z.boolean().optional(),
    reactionsEnabled: z.boolean().optional(),
    slowModeSeconds: z.number().int().min(0).max(60).optional()
  }).refine(value => value.chatEnabled !== undefined || value.reactionsEnabled !== undefined || value.slowModeSeconds !== undefined, {
    message: "Choose a communication setting to update."
  })
]);

export type CommunicationAction = z.infer<typeof communicationActionSchema>;

export type CommunicationSettings = {
  chatEnabled: boolean;
  reactionsEnabled: boolean;
  slowModeSeconds: number;
};

export type CommunicationViewer = {
  kind: "guest" | "host";
  id: string;
  userId: string;
  displayName: string;
  canModerate: boolean;
};

export type LiveChatMessage = {
  id: string;
  eventId: string;
  participantId: string | null;
  authorKind: "guest" | "host";
  authorDisplayName: string;
  own: boolean;
  kind: CommunicationMessageKind;
  body: string;
  teaId: string | null;
  teaTitle: string | null;
  teaPosition: number | null;
  breakoutRoomId:string|null;
  parentMessageId: string | null;
  replyPreview: null | { authorDisplayName: string; body: string };
  askHost: boolean;
  answeredAt: string | null;
  pinnedAt: string | null;
  spotlightedAt: string | null;
  spotlightAnonymous: boolean;
  spotlightDurationSeconds: number;
  deleted: boolean;
  clientId: string;
  createdAt: string;
};

export type LiveReactionEvent = {
  id: string;
  eventId: string;
  reactionType: TeaReactionType;
  teaId: string | null;
  breakoutRoomId:string|null;
  clientId: string;
  createdAt: string;
};

export type CommunicationSnapshot = {
  viewer: CommunicationViewer;
  settings: CommunicationSettings;
  event: {
    id: string;
    status: string;
    phase: string;
    title: string;
    currentTeaId: string | null;
    currentTeaTitle: string | null;
    breakoutRoomId:string|null;
  };
  messages: LiveChatMessage[];
  unreadCount: number;
  lastReadAt: string;
  nextCursor: string | null;
  pinnedMessage: LiveChatMessage | null;
  spotlightMessage: LiveChatMessage | null;
  recentReactions: LiveReactionEvent[];
};

export function getTeaReaction(type: TeaReactionType) {
  return TEA_REACTIONS.find(reaction => reaction.type === type) ?? TEA_REACTIONS[0];
}

export function evaluateCommunicationRateLimit({
  timestamps,
  now,
  minimumGapMs,
  windowMs,
  maximumInWindow
}: {
  timestamps: number[];
  now: number;
  minimumGapMs: number;
  windowMs: number;
  maximumInWindow: number;
}) {
  const recent = timestamps.filter(timestamp => Number.isFinite(timestamp) && now - timestamp < windowMs).sort((left, right) => right - left);
  const gapRetry = recent[0] === undefined ? 0 : Math.max(0, minimumGapMs - (now - recent[0]));
  const windowRetry = recent.length < maximumInWindow
    ? 0
    : Math.max(0, windowMs - (now - recent[maximumInWindow - 1]));
  const retryAfterMs = Math.max(gapRetry, windowRetry);
  return { allowed: retryAfterMs === 0, retryAfterMs };
}

export function isSpotlightActive(message: Pick<LiveChatMessage, "spotlightedAt" | "spotlightDurationSeconds">, now = Date.now()) {
  if (!message.spotlightedAt) return false;
  return new Date(message.spotlightedAt).getTime() + message.spotlightDurationSeconds * 1000 > now;
}

export function mergeMessages(current: LiveChatMessage[], incoming: LiveChatMessage[]) {
  const byId = new Map(current.map(message => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
}
