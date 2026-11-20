import { LiveStatus } from '../../../common/enums/live-status.enum';
import { ReasonCode } from '../../../common/enums/reason-code.enum';
import { ResolveFailureCode } from '../../resolvers/enums/resolve-failure-code.enum';
import { failed, failedRaw } from '../../resolvers/models/resolve-result.model';
import { failureVerdict } from './failure-verdict';

describe('failureVerdict', () => {
  it.each([
    [ResolveFailureCode.NOT_LIVE, LiveStatus.OFFLINE, ReasonCode.NOT_LIVE],
    [ResolveFailureCode.NO_PLAY_URL, LiveStatus.UNKNOWN, ReasonCode.NO_STREAM_URL],
    [ResolveFailureCode.MISSING_COOKIE, LiveStatus.UNKNOWN, ReasonCode.COOKIE_MISSING],
    [ResolveFailureCode.INVALID_COOKIE, LiveStatus.UNKNOWN, ReasonCode.COOKIE_INVALID],
    [ResolveFailureCode.SELLER_CENTER_AUTH_FAILED, LiveStatus.UNKNOWN, ReasonCode.COOKIE_INVALID],
    [
      ResolveFailureCode.SELLER_CENTER_NO_ACCESS,
      LiveStatus.UNKNOWN,
      ReasonCode.SELLER_CENTER_NO_ACCESS,
    ],
    [ResolveFailureCode.INVALID_LIVE_URL, LiveStatus.UNKNOWN, ReasonCode.INVALID_LIVE_URL],
    [ResolveFailureCode.MISSING_USER_ID, LiveStatus.UNKNOWN, ReasonCode.MISSING_USER_ID],
    [ResolveFailureCode.ONGOING_LOOKUP_FAILED, LiveStatus.UNKNOWN, ReasonCode.LOOKUP_FAILED],
    [ResolveFailureCode.SHOPEE_REQUEST_FAILED, LiveStatus.UNKNOWN, ReasonCode.PLATFORM_UNREACHABLE],
    [
      ResolveFailureCode.BACKEND_NOT_CONNECTED,
      LiveStatus.UNKNOWN,
      ReasonCode.BACKEND_NOT_CONNECTED,
    ],
    [ResolveFailureCode.BACKEND_ERROR, LiveStatus.UNKNOWN, ReasonCode.BACKEND_ERROR],
    [ResolveFailureCode.UNSUPPORTED, LiveStatus.UNKNOWN, ReasonCode.UNSUPPORTED],
  ])('maps %s', (code, status, reasonCode) => {
    expect(failureVerdict(failed(code, 'x'))).toEqual({ status, reasonCode });
  });

  it('has no verdict for a cancelled resolve', () => {
    expect(failureVerdict(failed(ResolveFailureCode.CANCELLED, 'x'))).toBeNull();
  });

  it.each(
    Object.values(ResolveFailureCode).filter(
      (code) => code !== ResolveFailureCode.CANCELLED && code !== ResolveFailureCode.YTDLP_FAILED,
    ),
  )('has a verdict for %s (ytdlp_failed is covered below)', (code) => {
    expect(failureVerdict(failed(code, 'x'))).not.toBeNull();
  });

  it('reads a yt-dlp "not currently live" as not live', () => {
    const failure = failedRaw(
      ResolveFailureCode.YTDLP_FAILED,
      'room api failed; ERROR: The channel is Not Currently Live',
    );

    expect(failureVerdict(failure)).toEqual({
      status: LiveStatus.OFFLINE,
      reasonCode: ReasonCode.NOT_LIVE,
    });
  });

  it('reports a missing yt-dlp as a missing tool', () => {
    const failure = failedRaw(ResolveFailureCode.YTDLP_FAILED, 'yt-dlp is not installed');

    expect(failureVerdict(failure)?.reasonCode).toBe(ReasonCode.TOOL_MISSING);
  });

  it('reports any other yt-dlp failure as the platform being unreachable', () => {
    const failure = failedRaw(ResolveFailureCode.YTDLP_FAILED, 'HTTP Error 429');

    expect(failureVerdict(failure)).toEqual({
      status: LiveStatus.UNKNOWN,
      reasonCode: ReasonCode.PLATFORM_UNREACHABLE,
    });
  });
});
