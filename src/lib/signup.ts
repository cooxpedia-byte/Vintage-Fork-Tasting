export type SignupError = {
  code?: string;
  message?: string;
  status?: number;
};

export type SignupSubmissionLock = {
  current: boolean;
};

export const SIGNUP_SUCCESS_MESSAGE = "Check your email to verify the account, then your tea cellar will open.";

export function beginSignupSubmission(lock: SignupSubmissionLock) {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function finishSignupSubmission(lock: SignupSubmissionLock) {
  lock.current = false;
}

export function signupResultMessage(error?: SignupError | null) {
  if (!error) return SIGNUP_SUCCESS_MESSAGE;

  if (error.code === "over_email_send_rate_limit") {
    return "A confirmation email was already requested. Check your inbox and spam folder before trying again.";
  }

  if (error.code === "over_request_rate_limit") {
    return "Too many account requests were made recently. Please wait a few minutes and try again.";
  }

  if (error.status === 429) {
    return "Account creation is temporarily rate-limited. Please wait a few minutes and try again.";
  }

  return error.message || "The account could not be created. Please try again or contact Vintage Fork.";
}
