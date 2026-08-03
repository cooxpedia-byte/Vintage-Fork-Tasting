import { describe, expect, it } from "vitest";
import { createTriviaQuestion, getTriviaProgress, isTriviaQuestionComplete, MAX_TRIVIA_QUESTIONS } from "@/lib/event-trivia";

describe("event trivia questions", () => {
  it("starts with one empty question rather than ten empty slots", () => {
    const questions = [createTriviaQuestion()];
    expect(questions).toHaveLength(1);
    expect(questions[0].options).toEqual(["", ""]);
    expect(MAX_TRIVIA_QUESTIONS).toBe(10);
  });

  it("requires a complete question, answers, correct choice, and valid answer window", () => {
    const complete = { ...createTriviaQuestion(), question: "Where was this tea grown?", options: ["Nepal", "Kenya"], correct_index: 0 };
    expect(isTriviaQuestionComplete(complete)).toBe(true);
    expect(isTriviaQuestionComplete({ ...complete, options: ["Nepal", ""] })).toBe(false);
    expect(isTriviaQuestionComplete({ ...complete, correct_index: 2 })).toBe(false);
    expect(isTriviaQuestionComplete({ ...complete, answer_window_seconds: 9 })).toBe(false);
  });

  it("orders questions and points to the next one in the live sequence", () => {
    const questions = [{ id: "second", position: 2 }, { id: "first", position: 1 }];
    expect(getTriviaProgress(questions, null)).toMatchObject({ currentNumber: 0, nextNumber: 1, total: 2, hasNext: true });
    expect(getTriviaProgress(questions, "first")).toMatchObject({ currentNumber: 1, nextNumber: 2, total: 2, hasNext: true });
    expect(getTriviaProgress(questions, "second")).toMatchObject({ currentNumber: 2, nextNumber: null, total: 2, hasNext: false });
  });
});
