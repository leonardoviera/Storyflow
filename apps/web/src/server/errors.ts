export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
  }
}

export class ConflictError extends Error {}

/** 422 with explicit issues (non-Zod validation, e.g. timeline rules). */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: { path: (string | number)[]; message: string }[],
  ) {
    super(message);
  }
}
