import { describe, expect, it } from "vitest";
import {
  beginSignupSubmission,
  finishSignupSubmission,
  SIGNUP_SUCCESS_MESSAGE,
  signupResultMessage,
} from "../src/lib/signup";

describe("customer signup", () => {
  it("allows only one in-flight signup request", () => {
    const lock = { current: false };

    expect(beginSignupSubmission(lock)).toBe(true);
    expect(beginSignupSubmission(lock)).toBe(false);

    finishSignupSubmission(lock);
    expect(beginSignupSubmission(lock)).toBe(true);
  });

  it("keeps the success instruction explicit", () => {
    expect(signupResultMessage()).toBe(SIGNUP_SUCCESS_MESSAGE);
  });

  it("distinguishes email cooldowns from request throttling", () => {
    expect(signupResultMessage({ code: "over_email_send_rate_limit", status: 429 })).toBe(
      "A confirmation email was already requested. Check your inbox and spam folder before trying again.",
    );
    expect(signupResultMessage({ code: "over_request_rate_limit", status: 429 })).toBe(
      "Too many account requests were made recently. Please wait a few minutes and try again.",
    );
  });

  it("provides a safe fallback for unknown rate limits", () => {
    expect(signupResultMessage({ status: 429 })).toBe(
      "Account creation is temporarily rate-limited. Please wait a few minutes and try again.",
    );
  });

  it("preserves non-rate-limit service messages", () => {
    expect(signupResultMessage({ status: 422, message: "Password should be stronger." })).toBe(
      "Password should be stronger.",
    );
  });
});
