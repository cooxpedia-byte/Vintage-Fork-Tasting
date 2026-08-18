import type { ConductorStage } from "@/types/domain";

export const DISCOVERY_FIRST_COPY = {
  firstSip: "First sip. Just notice.",
  noticeWhenReady: "Notice first. Name it when you're ready.",
  noExpectedFlavor: "There is no flavor you are supposed to find.",
  reveal: "Let’s see what emerged.",
  difference: "Your experience can be different from the room.",
  anotherSip: "Take another sip. Did anything change?",
  uniqueObservation: "One person noticed something different.",
  tableDiscovery: "Here’s what our table discovered.",
  producerContext: "Here’s what the producer describes.",
  tastingTimeline: "Watch how the tasting changed over time.",
  fingerprint: "This is the fingerprint of this group, this tea, and this moment.",
  emptyObservation: "Nothing here yet. Notice what comes first.",
  quietRoom: "The room is quiet for now."
} as const;

export type LiveAttentionOrder = "people-first" | "tea-first";

export function liveAttentionOrder(stage: ConductorStage): LiveAttentionOrder {
  return stage === "arrival" ? "people-first" : "tea-first";
}

const SENSORY_JUDGMENT_PATTERNS = [
  { term: "correct", pattern: /\bcorrect\b/i },
  { term: "wrong", pattern: /\bwrong\b/i },
  { term: "answer", pattern: /\banswers?\b/i },
  { term: "guess", pattern: /\bguess(?:es|ed|ing)?\b/i },
  { term: "score", pattern: /\bscores?\b/i },
  { term: "outlier", pattern: /\boutliers?\b/i },
  { term: "you should taste", pattern: /\byou should taste\b/i },
  { term: "submit answer", pattern: /\bsubmit answer\b/i }
] as const;

/** Governance helper for sensory UI copy. Factual trivia copy is intentionally out of scope. */
export function sensoryLanguageIssues(value: string) {
  return SENSORY_JUDGMENT_PATTERNS
    .filter(candidate => candidate.pattern.test(value))
    .map(candidate => candidate.term);
}
