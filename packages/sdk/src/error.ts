/**
 * Error codes for ReplaneError
 */
export enum ReplaneErrorCode {
  NotFound = "not_found",
  Timeout = "timeout",
  NetworkError = "network_error",
  AuthError = "auth_error",
  Forbidden = "forbidden",
  ServerError = "server_error",
  ClientError = "client_error",
  Closed = "closed",
  NotInitialized = "not_initialized",
  Unknown = "unknown",
}

/**
 * Custom error class for Replane SDK errors
 */
export class ReplaneError extends Error {
  code: string;

  constructor(params: { message: string; code: string; cause?: unknown }) {
    super(params.message, { cause: params.cause });
    this.name = "ReplaneError";
    this.code = params.code;
  }
}
