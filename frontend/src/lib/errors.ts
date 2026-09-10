import type { ApiError } from "./types";

export class ApiFailure extends Error {
  readonly error: ApiError;
  constructor(error: ApiError) {
    super(error.message);
    this.error = error;
    this.name = "ApiFailure";
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiFailure) return error.error;
  return { code: "unknown_error", message: error instanceof Error ? error.message : "Something went wrong." };
}
