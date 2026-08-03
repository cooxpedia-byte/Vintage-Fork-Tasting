export const MAX_TRIVIA_QUESTIONS = 10;

export type TriviaQuestionDraft = {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  answer_window_seconds: number;
};

export type PositionedTriviaQuestion = { id: string; position: number };

export function createTriviaQuestion(): TriviaQuestionDraft {
  return {
    question: "",
    options: ["", ""],
    correct_index: 0,
    explanation: "",
    answer_window_seconds: 20
  };
}

export function isTriviaQuestionComplete(question: TriviaQuestionDraft): boolean {
  return Boolean(
    question.question.trim()
    && question.options.length >= 2
    && question.options.length <= 4
    && question.options.every(option => option.trim())
    && question.correct_index >= 0
    && question.correct_index < question.options.length
    && question.answer_window_seconds >= 10
    && question.answer_window_seconds <= 60
  );
}

export function getTriviaProgress<T extends PositionedTriviaQuestion>(questions: T[], activeQuestionId: string | null) {
  const ordered = [...questions].sort((a, b) => a.position - b.position);
  const currentIndex = activeQuestionId ? ordered.findIndex(question => question.id === activeQuestionId) : -1;
  const nextIndex = currentIndex + 1;
  return {
    ordered,
    currentIndex,
    currentNumber: currentIndex >= 0 ? currentIndex + 1 : 0,
    nextNumber: nextIndex < ordered.length ? nextIndex + 1 : null,
    total: ordered.length,
    hasNext: nextIndex < ordered.length
  };
}
