import { ReasonCode } from '../../../common/enums/reason-code.enum';

export type CookieFailure =
  ReasonCode.COOKIE_MISSING | ReasonCode.COOKIE_INVALID | ReasonCode.COOKIE_STORE_UNREADABLE;

const COOKIE_FAILURES: readonly CookieFailure[] = [
  ReasonCode.COOKIE_MISSING,
  ReasonCode.COOKIE_INVALID,
  ReasonCode.COOKIE_STORE_UNREADABLE,
];

/** Failures that need the stored cookie (or its file) to change before another attempt can differ. */
export const isCookieFailure = (reasonCode: ReasonCode | null): reasonCode is CookieFailure =>
  COOKIE_FAILURES.some((failure) => failure === reasonCode);

/** Whether the stored cookie differs enough from the one that failed for an attempt to be worth making. */
export function cookieChanged(
  reasonCode: ReasonCode,
  failedCookie: string | undefined,
  now: { readable: boolean; cookie: string | undefined },
): boolean {
  if (!now.readable) return false;
  if (reasonCode === ReasonCode.COOKIE_STORE_UNREADABLE) return true;
  if (reasonCode === ReasonCode.COOKIE_MISSING) return now.cookie !== undefined;
  return now.cookie !== failedCookie;
}
