const TIMEOUT_ERROR_NAMES: readonly string[] = ['TimeoutError', 'AbortError'];

/** True for what fetch throws on connection trouble: TypeError with a cause, or an abort/timeout DOMException. */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return error.cause !== undefined;
  // DOMException is not an Error instance in every realm, so match on its name.
  const { name } = (error ?? {}) as { name?: unknown };
  return typeof name === 'string' && TIMEOUT_ERROR_NAMES.includes(name);
}
