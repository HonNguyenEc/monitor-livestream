/** Name and errno code only: a JSON parse message can quote file content, which may hold secrets. */
export function fsErrorSummary(error: unknown): string {
  const { name, code } = (error ?? {}) as NodeJS.ErrnoException;
  return `${name ?? typeof error} ${code ?? ''}`.trimEnd();
}
