export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
  }
}

// One class for web and db helpers, so http.ts maps both to 409.
export { ConflictError } from "@storyflow/db/breakdowns";

/** An error with its own HTTP status and a stable code the UI can translate (e.g. NOT_UTF8). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** 422 with explicit issues (non-Zod validation, e.g. timeline rules). */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: { path: (string | number)[]; message: string }[],
  ) {
    super(message);
  }
}
