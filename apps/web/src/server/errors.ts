export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
  }
}

// One class for web and db helpers, so http.ts maps both to 409.
export { ConflictError } from "@storyflow/db/breakdowns";

/** 422 with explicit issues (non-Zod validation, e.g. timeline rules). */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: { path: (string | number)[]; message: string }[],
  ) {
    super(message);
  }
}
