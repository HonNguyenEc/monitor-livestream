import { isPlainObject } from '../../../common/utils/is-plain-object';
import { BackendTokens, BackendUser } from '../models/backend-session.model';

export function isFilledString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function toUser(value: unknown): BackendUser {
  const user = isPlainObject(value) ? value : {};
  return {
    id: typeof user.id === 'number' && Number.isSafeInteger(user.id) ? user.id : null,
    email: textOf(user.email),
    name: textOf(user.name),
    role: textOf(user.role),
  };
}

/** The token pair of a login or refresh answer, or null when either token is missing. */
export function readTokens(value: unknown): BackendTokens | null {
  if (!isPlainObject(value)) {
    return null;
  }
  const { access_token, refresh_token } = value;
  return isFilledString(access_token) && isFilledString(refresh_token)
    ? { access_token, refresh_token }
    : null;
}

/** The tokens and user of a /auth/login answer, or null without a token pair. */
export function readLoginAnswer(value: unknown): (BackendTokens & { user: BackendUser }) | null {
  const tokens = readTokens(value);
  return tokens && { ...tokens, user: toUser((value as Record<string, unknown>).user) };
}
