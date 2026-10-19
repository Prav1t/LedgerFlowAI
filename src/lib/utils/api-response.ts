import { NextResponse } from "next/server";
import { ZodError } from "zod";

/** Consistent envelope for every REST endpoint. */
export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ success: true, data }, init);
}

export function created<T>(data: T) {
  return NextResponse.json({ success: true, data }, { status: 201 });
}

export function fail(message: string, status = 400, code?: string) {
  return NextResponse.json({ success: false, error: { message, code } }, { status });
}

export function validationError(error: ZodError) {
  return NextResponse.json(
    { success: false, error: { message: "Validation failed", code: "VALIDATION_ERROR", issues: error.flatten() } },
    { status: 422 }
  );
}

export function unauthorized() {
  return fail("Unauthorized", 401, "UNAUTHORIZED");
}

export function forbidden() {
  return fail("Forbidden", 403, "FORBIDDEN");
}

export function notFound(resource = "Resource") {
  return fail(`${resource} not found`, 404, "NOT_FOUND");
}
