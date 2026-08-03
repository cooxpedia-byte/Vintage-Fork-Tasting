import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { mapTeaLabOperationError, toTeaLabSessionResult } from "@/lib/tea-lab/api";

export function teaLabOperationFailure(
  event: string,
  error: unknown,
  context: Record<string, string>
) {
  const mapped = mapTeaLabOperationError(error);
  const safeContext = { ...context, code: mapped.code };

  if (mapped.status >= 500) logger.error(event, new Error(mapped.code), safeContext);
  else logger.warn(event, safeContext);

  return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.status });
}

export function teaLabSessionResponse(data: unknown) {
  const session = toTeaLabSessionResult(data);
  if (!session) return null;
  return NextResponse.json({ session });
}

export function teaLabDisabledResponse() {
  return NextResponse.json({ error: "Not found." }, { status: 404 });
}

export function invalidTeaLabRequest(message = "That tasting request is invalid.") {
  return NextResponse.json({ error: message, code: "invalid_request" }, { status: 400 });
}
