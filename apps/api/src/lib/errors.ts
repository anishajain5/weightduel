export class HttpError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, message: string) => new HttpError(400, code, message);
export const unauthorized = (code = "UNAUTHORIZED", message = "Please sign in again") =>
  new HttpError(401, code, message);
export const forbidden = (code: string, message: string) => new HttpError(403, code, message);
export const conflict = (code: string, message: string) => new HttpError(409, code, message);
export const tooMany = (message = "Too many attempts. Try again later.", retryAfterSec?: number) =>
  new HttpError(429, "RATE_LIMITED", message, retryAfterSec ? { retryAfterSec } : undefined);
