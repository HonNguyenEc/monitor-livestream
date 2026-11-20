function describe(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!(value instanceof Error)) return '';
  if (value.message) return value.message;
  const { code } = value as { code?: unknown };
  if (typeof code === 'string') return code;
  const { errors } = value as { errors?: unknown };
  return Array.isArray(errors) && errors.length > 0 ? describe(errors[0]) : '';
}

/** Message of a thrown value; appends the `cause` that Node's fetch uses to carry the real network error. */
export function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = describe(error.cause);
  return cause ? `${error.message}: ${cause}` : error.message;
}
