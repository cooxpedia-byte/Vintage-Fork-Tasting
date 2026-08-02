import type { SessionPhase } from "@/types/domain";

export function canAcquireHostControl(status: string, phase: SessionPhase): boolean {
  return (status === "scheduled" || status === "live") && phase !== "ended";
}
