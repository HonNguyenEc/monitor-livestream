import { LiveStatus } from '../../../common/enums/live-status.enum';
import { ReasonCode } from '../../../common/enums/reason-code.enum';
import { ResolveFailure, ResolveFailureCode, YTDLP_UNAVAILABLE_MESSAGE } from '../../resolvers';
import { YTDLP_NOT_LIVE_MARKER } from '../constants/detection.constants';

export interface FailureVerdict {
  status: LiveStatus;
  reasonCode: ReasonCode;
}

const BY_CODE: Record<
  Exclude<ResolveFailureCode, ResolveFailureCode.YTDLP_FAILED | ResolveFailureCode.CANCELLED>,
  ReasonCode
> = {
  [ResolveFailureCode.NOT_LIVE]: ReasonCode.NOT_LIVE,
  [ResolveFailureCode.NO_PLAY_URL]: ReasonCode.NO_STREAM_URL,
  [ResolveFailureCode.MISSING_COOKIE]: ReasonCode.COOKIE_MISSING,
  [ResolveFailureCode.INVALID_COOKIE]: ReasonCode.COOKIE_INVALID,
  [ResolveFailureCode.INVALID_LIVE_URL]: ReasonCode.INVALID_LIVE_URL,
  [ResolveFailureCode.MISSING_USER_ID]: ReasonCode.MISSING_USER_ID,
  [ResolveFailureCode.ONGOING_LOOKUP_FAILED]: ReasonCode.LOOKUP_FAILED,
  [ResolveFailureCode.SELLER_CENTER_AUTH_FAILED]: ReasonCode.COOKIE_INVALID,
  [ResolveFailureCode.SELLER_CENTER_NO_ACCESS]: ReasonCode.SELLER_CENTER_NO_ACCESS,
  [ResolveFailureCode.SHOPEE_REQUEST_FAILED]: ReasonCode.PLATFORM_UNREACHABLE,
  [ResolveFailureCode.BACKEND_NOT_CONNECTED]: ReasonCode.BACKEND_NOT_CONNECTED,
  [ResolveFailureCode.BACKEND_ERROR]: ReasonCode.BACKEND_ERROR,
  [ResolveFailureCode.UNSUPPORTED]: ReasonCode.UNSUPPORTED,
};

/** The verdict table of docs/contract/live-qc-api.md: what one failed resolve says about the channel; null for a cancelled one, which says nothing. */
export function failureVerdict(failure: ResolveFailure): FailureVerdict | null {
  if (failure.code === ResolveFailureCode.CANCELLED) return null;
  const reasonCode = reasonOf(failure.code, failure.detail);
  const status = reasonCode === ReasonCode.NOT_LIVE ? LiveStatus.OFFLINE : LiveStatus.UNKNOWN;
  return { status, reasonCode };
}

function reasonOf(
  code: Exclude<ResolveFailureCode, ResolveFailureCode.CANCELLED>,
  detail: string,
): ReasonCode {
  if (code !== ResolveFailureCode.YTDLP_FAILED) return BY_CODE[code];
  const text = detail.toLowerCase();
  if (text.includes(YTDLP_NOT_LIVE_MARKER)) return ReasonCode.NOT_LIVE;
  if (text.includes(YTDLP_UNAVAILABLE_MESSAGE)) return ReasonCode.TOOL_MISSING;
  return ReasonCode.PLATFORM_UNREACHABLE;
}
