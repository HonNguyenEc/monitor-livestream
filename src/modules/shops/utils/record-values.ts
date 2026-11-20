import { DIGITS } from '../constants/shop-fields.constants';

export function optionalString(value: unknown): string | undefined {
  return (typeof value === 'string' || typeof value === 'number') && value !== ''
    ? String(value)
    : undefined;
}

// The Python tool accepts ids typed as digit strings, so hand-edited files may hold either form.
export function optionalInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }
  return typeof value === 'string' && DIGITS.test(value) ? Number(value) : undefined;
}
