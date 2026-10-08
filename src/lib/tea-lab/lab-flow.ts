import { TEA_LAB_BREWING_STYLE_IDS, type TeaLabBrewingDraft, type TeaLabSoloDraft } from "@/lib/tea-lab/offline";

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
  return draft.tea?.kind === "canonical" ? Boolean(draft.tea.canonicalTeaId.trim()) : Boolean(draft.tea?.name.trim());
}

export function inferTeaLabFlowStep(draft: TeaLabSoloDraft): TeaLabFlowStep {
  if (!isTeaSelectionReady(draft)) return "choose";
  if (!draft.brewing.style || teaLabBrewingValidationError(draft.brewing)) return "brew";
  return "taste";
}

export function isTeaLabRatingReady(rating: number | null): boolean {
  return rating !== null && Number.isInteger(rating) && rating >= 1 && rating <= 5;
}

export function teaLabBrewingValidationError(brewing: TeaLabBrewingDraft): string | null {
  if (brewing.style && !TEA_LAB_BREWING_STYLE_IDS.includes(brewing.style)) return "Choose an available brewing style.";
  if (brewing.leafGrams != null && (!Number.isFinite(brewing.leafGrams) || brewing.leafGrams <= 0 || brewing.leafGrams > 1000)) {
    return "Enter a leaf weight greater than 0 and no more than 1,000 g, or leave it blank.";
  }
  if (brewing.waterMl != null && (!Number.isInteger(brewing.waterMl) || brewing.waterMl < 1 || brewing.waterMl > 10000)) {
    return "Enter a whole water amount from 1 to 10,000 ml, or leave it blank.";
  }
  const validTemperature = (value: number | null | undefined) => value == null
    || (Number.isFinite(value) && value >= 0 && value <= 100);
  const validDuration = (value: number | null | undefined) => value == null
    || (Number.isInteger(value) && value >= 1 && value <= 216000);
  if (!validTemperature(brewing.waterTemperatureC)) return "Choose a water temperature from 0 to 100 °C.";
  if (!validDuration(brewing.initialSteepSeconds)) return "Choose an initial steep from 1 second to 60 hours, or leave it blank.";
  if ((brewing.stages?.length ?? 0) > 20) return "Keep up to 20 brewing stages.";
  for (const [index, stage] of (brewing.stages ?? []).entries()) {
    if (!stage.label.trim() || stage.label.trim().length > 80) return `Give stage ${index + 1} a name of up to 80 characters.`;
    if (!validTemperature(stage.temperatureC)) return `Choose a water temperature from 0 to 100 °C for stage ${index + 1}.`;
    if (!validDuration(stage.durationSeconds)) return `Choose a duration from 1 second to 60 hours for stage ${index + 1}, or leave it blank.`;
    if ((stage.notes?.trim().length ?? 0) > 600) return `Keep stage ${index + 1} notes within 600 characters.`;
  }
  return null;
}

export function navigableTeaLabFlowStep(draft: TeaLabSoloDraft, furthest: TeaLabFlowStep): TeaLabFlowStep {
  const requiredStep = !isTeaSelectionReady(draft) ? "choose"
    : !draft.brewing.style || teaLabBrewingValidationError(draft.brewing) ? "brew"
      : !isTeaLabRatingReady(draft.tasting.rating) ? "taste" : "review";
  return teaLabFlowStepIndex(requiredStep) < teaLabFlowStepIndex(furthest) ? requiredStep : furthest;
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
