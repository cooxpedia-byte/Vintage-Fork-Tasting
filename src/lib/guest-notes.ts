export function shouldHoldGuestTransition({
  currentSequence,
  nextSequence,
  notesActive,
  alreadyHolding
}: {
  currentSequence: number | null;
  nextSequence: number;
  notesActive: boolean;
  alreadyHolding: boolean;
}) {
  if (alreadyHolding) return true;
  return notesActive && currentSequence !== null && nextSequence > currentSequence;
}
