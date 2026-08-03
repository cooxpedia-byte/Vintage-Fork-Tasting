import type { TeaLabSoloDraft } from "@/lib/tea-lab/offline";

export type TeaLabFlowStep = "choose" | "brew" | "taste" | "review";

export function isTeaSelectionReady(draft: TeaLabSoloDraft): boolean {
  return draft.tea?.kind === "canonical" || Boolean(draft.tea?.name.trim());
}

export function inferTeaLabFlowStep(draft: TeaLabSoloDraft): TeaLabFlowStep {
  if (!isTeaSelectionReady(draft)) return "choose";
  if (draft.tasting.rating !== null
    || draft.tasting.firstImpression
    || draft.tasting.personalNotes
    || draft.tasting.descriptorIds.length > 0
    || draft.tasting.intensity
    || draft.brewing.stages?.some(stage => Boolean(stage.notes))) return "taste";
  return "brew";
}

export function toggleTeaLabDescriptor(selected: string[], descriptorId: string, maximum = 3): string[] {
  if (selected.includes(descriptorId)) return selected.filter(id => id !== descriptorId);
  return selected.length < maximum ? [...selected, descriptorId] : selected;
}

export function parseOptionalNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function nextTeaLabRating(current: number, key: string): number | null {
  if (key === "Home") return 1;
  if (key === "End") return 5;
  if (key === "ArrowRight" || key === "ArrowUp") return current === 5 ? 1 : current + 1;
  if (key === "ArrowLeft" || key === "ArrowDown") return current === 1 ? 5 : current - 1;
  return null;
}
