/** ValidateIf condition that validates null (unlike IsOptional) and skips only an omitted field. */
export function isPresent(_object: object, value: unknown): boolean {
  return value !== undefined;
}
