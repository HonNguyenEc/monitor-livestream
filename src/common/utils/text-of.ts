export function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
