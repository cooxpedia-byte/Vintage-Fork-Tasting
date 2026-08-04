import type { TeaLabSoloDraft } from "@/lib/tea-lab/offline";

export const TEA_LAB_FLOW_STEPS = ["choose", "brew", "taste", "review"] as const;
export type TeaLabFlowStep = typeof TEA_LAB_FLOW_STEPS[number];

export function teaLabFlowStepIndex(step: TeaLabFlowStep): number {
  return TEA_LAB_FLOW_STEPS.indexOf(step);
}

export function furthestTeaLabFlowStep(current: TeaLabFlowStep, candidate: TeaLabFlowStep): TeaLabFlowStep {
  return teaLabFlowStepIndex(candidate) > teaLabFlowStepIndex(current) ? candidate : current;
}

export function canNavigateTeaLabFlowStep(furthest: TeaLabFlowStep, target: TeaLabFlowStep): boolean {
  return teaLabFlowStepIndex(target) <= teaLabFlowStepIndex(furthest);
}

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

export function toggleTeaLabDescriptor(selected: string[], descriptorId: string, maximum = 5): string[] {
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
