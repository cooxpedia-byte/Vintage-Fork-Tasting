export const INTERFACE_FEEDBACK_STORAGE_KEY = "vf:interface-sound";
export const INTERFACE_FEEDBACK_EVENT = "vf:interface-feedback-changed";

export type InterfaceFeedbackKind = "tap" | "selection" | "confirm";

export function resolveInterfaceFeedbackEnabled(stored: string | null, defaultEnabled: boolean) {
  if (stored === "on") return true;
  if (stored === "off") return false;
  return defaultEnabled;
}

export function getInterfaceFeedbackVibrationMs(kind: InterfaceFeedbackKind, reducedMotion: boolean) {
  if (reducedMotion) return 0;
  if (kind === "confirm") return 10;
  if (kind === "selection") return 7;
  return 6;
}
