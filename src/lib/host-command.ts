import type { EventCommand } from "@/types/domain";

type HostCommandRequest = {
  eventId: string;
  command: EventCommand;
  expectedSequence: number;
  leaseToken: string;
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
        leaseToken: request.leaseToken
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
