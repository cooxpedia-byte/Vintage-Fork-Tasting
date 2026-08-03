type TeaLabOperationError = {
  status: number;
  code: string;
  message: string;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "";
}

const KNOWN_ERRORS: Array<{ token: string; response: TeaLabOperationError }> = [
  { token: "tea_lab_authentication_required", response: { status: 401, code: "authentication_required", message: "Authentication required." } },
  { token: "tea_lab_session_not_found", response: { status: 404, code: "session_not_found", message: "That tasting session was not found." } },
  { token: "tea_lab_canonical_tea_not_found", response: { status: 404, code: "tea_not_found", message: "That tea is no longer available." } },
  { token: "tea_lab_personal_tea_not_found", response: { status: 404, code: "tea_not_found", message: "That personal tea was not found." } },
  { token: "tea_lab_stale_revision", response: { status: 409, code: "revision_conflict", message: "This tasting changed elsewhere. Review the latest version before saving again." } },
  { token: "tea_lab_idempotency_conflict", response: { status: 409, code: "operation_conflict", message: "That save operation conflicts with an earlier request." } },
  { token: "tea_lab_card_id_conflict", response: { status: 409, code: "card_conflict", message: "This session is already linked to a different tasting card." } },
  { token: "tea_lab_rating_required", response: { status: 400, code: "rating_required", message: "Add a rating before completing this tasting." } },
  { token: "tea_lab_invalid_descriptors", response: { status: 400, code: "invalid_descriptors", message: "Choose up to three available flavor descriptors." } },
  { token: "tea_lab_invalid_operation_id", response: { status: 400, code: "invalid_operation", message: "The operation identifier is invalid." } },
  { token: "tea_lab_invalid_revision", response: { status: 400, code: "invalid_revision", message: "The session revision is invalid." } },
  { token: "tea_lab_invalid_tea", response: { status: 400, code: "invalid_tea", message: "Choose a valid tea before saving." } },
  { token: "tea_lab_solo_requires_one_card", response: { status: 400, code: "invalid_session", message: "A solo tasting must contain exactly one tea." } },
  { token: "tea_lab_unsupported_session_kind", response: { status: 400, code: "invalid_session", message: "That tasting-session type is not supported." } }
];

export function mapTeaLabOperationError(error: unknown): TeaLabOperationError {
  const message = errorMessage(error);
  return KNOWN_ERRORS.find(candidate => message.includes(candidate.token))?.response ?? {
    status: 500,
    code: "operation_failed",
    message: "We could not update that tasting just now. Please try again."
  };
}

export type TeaLabSessionResult = {
  id: string;
  status: string;
  revision: number;
  completedAt: string | null;
  archivedAt: string | null;
};

export function toTeaLabSessionResult(value: unknown): TeaLabSessionResult | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.status !== "string" || typeof row.revision !== "number") return null;

  return {
    id: row.id,
    status: row.status,
    revision: row.revision,
    completedAt: typeof row.completed_at === "string" ? row.completed_at : null,
    archivedAt: typeof row.archived_at === "string" ? row.archived_at : null
  };
}

export type TeaLabPersonalTeaResult = {
  id: string;
  archivedAt: string | null;
  updatedAt: string;
};

export function toTeaLabPersonalTeaResult(value: unknown): TeaLabPersonalTeaResult | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.updated_at !== "string") return null;
  return {
    id: row.id,
    archivedAt: typeof row.archived_at === "string" ? row.archived_at : null,
    updatedAt: row.updated_at
  };
}
