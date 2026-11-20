const MAX_CHAIN_LENGTH = 5;

/** The error, then what it wraps: its `cause`, or the first error of an AggregateError; fetch hides the socket error one level down. */
export function errorChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  let current: unknown = error;
  while (current !== undefined && current !== null && chain.length < MAX_CHAIN_LENGTH) {
    chain.push(current);
    const { cause, errors } = current as { cause?: unknown; errors?: unknown };
    current = cause ?? (Array.isArray(errors) ? errors[0] : undefined);
  }
  return chain;
}

/** The first string `code` (ECONNRESET, ...) on what `error` wraps, not on `error` itself. */
export function wrappedErrorCode(error: unknown): string | undefined {
  for (const node of errorChain(error).slice(1)) {
    const { code } = (node ?? {}) as { code?: unknown };
    if (typeof code === 'string') return code;
  }
  return undefined;
}
