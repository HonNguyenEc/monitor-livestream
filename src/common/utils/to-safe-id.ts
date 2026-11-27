import { DIGITS } from '../constants/patterns.constants';

/** A positive safe integer from a number or a digits-only string; anything looser (booleans, arrays, padded text) is rejected. */
export function toSafeId(value: unknown): number | null {
  let id: number;
  if (typeof value === 'number') id = value;
  else if (typeof value === 'string' && DIGITS.test(value)) id = Number(value);
  else return null;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
