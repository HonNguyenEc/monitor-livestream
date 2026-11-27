/** A livestream-backend request that failed, or an answer that could not be used. */
export class BackendRequestError extends Error {
  constructor(
    message: string,
    /** HTTP status of the answer, NO_HTTP_STATUS when there is none, or 502 for a 2xx answer that is unusable. */
    readonly status: number,
    /** The backend's own error text, masked and capped; empty when it sent none. */
    readonly remoteMessage = '',
    /** Seconds from a numeric Retry-After header. */
    readonly retryAfterSeconds: number | null = null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = BackendRequestError.name;
  }
}
