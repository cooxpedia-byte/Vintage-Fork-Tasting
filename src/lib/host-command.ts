import type { BreakoutAssignmentMode } from "@/lib/breakouts";
import type { ConductorStage, EventCommand } from "@/types/domain";
import type { CheersContext } from "@/lib/cheers";

export type HostCommandPayload = {
  targetStage?: ConductorStage;
  seconds?: number;
  durationSeconds?: number;
  countdownSeconds?: number;
  roomSize?: number;
  assignmentMode?: BreakoutAssignmentMode;
  prompt?: string;
  cardId?: string;
  participantId?: string;
  flavorKey?: string;
  timelineIndex?: number;
  cheersWindowSeconds?: 5|8|10;
  cheersContext?: CheersContext;
  cheersSoundEnabled?: boolean;
  rewardModeEnabled?: boolean;
  conversationPromptsEnabled?: boolean;
  conversationPromptId?: string;
  conversationPromptTarget?: "main"|"breakouts";
  visibilityMode?: "quiet_start"|"shared_live";
  customNotesEnabled?: boolean;
  replayPositionMs?: number;
};

type HostCommandRequest = {
  eventId: string;
  command: EventCommand;
  expectedSequence: number;
  leaseToken: string;
  clientCommandId?: string;
  payload?: HostCommandPayload;
};

export type HostCommandOutcome<T> =
  | { kind: "applied"; event: T }
  | { kind: "rejected"; message: string }
  | { kind: "unconfirmed" };

export async function requestHostCommand<T>(
  request: HostCommandRequest,
  fetcher: typeof fetch = fetch
): Promise<HostCommandOutcome<T>> {
  try {
    const response = await fetcher(`/api/events/${request.eventId}/command`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        command: request.command,
        expectedSequence: request.expectedSequence,
        leaseToken: request.leaseToken,
        clientCommandId: request.clientCommandId ?? crypto.randomUUID(),
        payload: request.payload ?? {}
      })
    });
    const result = await response.json().catch(() => null) as { error?: string; event?: T } | null;

    if (!response.ok) {
      return { kind: "rejected", message: result?.error ?? "The command was not applied." };
    }
    if (!result?.event) return { kind: "unconfirmed" };
    return { kind: "applied", event: result.event };
  } catch {
    return { kind: "unconfirmed" };
  }
}
