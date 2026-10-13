export type ErrorCode = "UNAUTHENTICATED" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "STATE" | "INTERNAL";

/** An error whose message is safe to show to the user. */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "That item") => new AppError("NOT_FOUND", `${what} could not be found.`);
export const invalid = (message: string, fieldErrors?: Record<string, string>) => new AppError("VALIDATION", message, fieldErrors);
export const badState = (message: string) => new AppError("STATE", message);

/** Translate low-level database failures into messages that are safe to show. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const e = err as { code?: string; cause?: { code?: string }; constraint_name?: string; message?: string } | null;
  const code = e?.code ?? e?.cause?.code;
  switch (code) {
    case "23505":
      return new AppError("CONFLICT", "That already exists. Refresh the page and try again.");
    case "23514":
    case "22003":
    case "22P02":
      return new AppError("VALIDATION", "Some of the values were not accepted. Please check them and try again.");
    case "23503":
      return new AppError("NOT_FOUND", "Something this change refers to no longer exists. Refresh the page and try again.");
    case "40001":
    case "40P01":
    case "55P03":
      return new AppError("CONFLICT", "Another change was happening at the same time. Please try again.");
    case "ECONNREFUSED":
    case "CONNECTION_CLOSED":
    case "CONNECT_TIMEOUT":
    case "08006":
    case "57P01":
      return new AppError("INTERNAL", "The database is unreachable right now. Nothing was saved – please try again shortly.");
    default:
      return new AppError("INTERNAL", "Something went wrong and nothing was saved. Please try again.");
  }
}
