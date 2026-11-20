import { DIGITS } from '../../../common/constants/patterns.constants';

export function optionalString(value: unknown): string | undefined {
  return (typeof value === 'string' || typeof value === 'number') && value !== ''
    ? String(value)
    : undefined;
}

// The Python tool accepts ids typed as digit strings, so hand-edited files may hold either form.
export function optionalInteger(value: unknown): number | undefined {
  const number = typeof value === 'string' && DIGITS.test(value) ? Number(value) : value;
  return Number.isSafeInteger(number) ? (number as number) : undefined;
}
