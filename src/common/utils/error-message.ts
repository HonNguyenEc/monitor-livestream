import { errorChain } from './error-chain';

function describe(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!(value instanceof Error)) return '';
  if (value.message) return value.message;
  const { code } = value as { code?: unknown };
  return typeof code === 'string' ? code : '';
}

/** Message of a thrown value; appends the first thing it wraps that says something (the `cause` that Node's fetch uses to carry the real network error). */
export function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = errorChain(error).slice(1).map(describe).find(Boolean);
  return cause ? `${error.message}: ${cause}` : error.message;
}
