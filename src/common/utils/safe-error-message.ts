import { errorMessage } from './error-message';
import { safeError } from './safe-error';

/** The masked message of a thrown value, with its cause; safe for logs and API fields. */
export function safeErrorMessage(error: unknown): string {
  return safeError(errorMessage(error));
}
