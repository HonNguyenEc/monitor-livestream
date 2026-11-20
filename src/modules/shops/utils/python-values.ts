import { PYTHON_FALSE, PYTHON_NONE, PYTHON_TRUE } from '../constants/shops.constants';

// Shop keys must match what the Python tool derives from the same shops.json, so its truthiness
// and str() rules apply: an empty list or object is falsy, and a missing value prints as "None".
export function isPythonTruthy(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === 'object' && value !== null) {
    return Object.keys(value).length > 0;
  }
  return Boolean(value);
}

export function pythonStr(value: unknown): string {
  if (value === undefined || value === null) {
    return PYTHON_NONE;
  }
  if (typeof value === 'boolean') {
    return value ? PYTHON_TRUE : PYTHON_FALSE;
  }
  return String(value);
}
