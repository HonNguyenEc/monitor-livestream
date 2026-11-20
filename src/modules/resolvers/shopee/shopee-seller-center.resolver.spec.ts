import { Logger } from '@nestjs/common';
import { Platform } from '../../../common/enums/platform.enum';
import { DEFAULT_RESOLVE_TIMEOUT_MS } from '../constants/resolver.constants';
import { ResolveFailureCode } from '../enums/resolve-failure-code.enum';
import { ResolveRequest } from '../models/resolve-request.model';
import { ResolveResult } from '../models/resolve-result.model';
import {
  infoBadCode,
  infoHttp403,
  infoNoData,
  liveInfo,
  ongoingEmpty,
  ongoingErrCode,
  ongoingErrorOnly,
  ongoingFound,
  ongoingNone,
  SESSION_ID,
  SESSION_TITLE,
  SHARE_LINK,
  SHORT_LINK,
  STREAM_URL,
  TEST_COOKIE,
  USER_ID,
} from './fixtures/seller-center.fixtures';
import { DisallowedLiveUrlError } from '../../shopee/errors/disallowed-live-url.error';
import { SellerCenterClient } from '../../shopee/clients/seller-center.client';
import { ShopeeSellerCenterResolver } from './shopee-seller-center.resolver';

function networkError(message: string): TypeError {
  return new TypeError('fetch failed', { cause: new Error(message) });
}

const REQUEST: ResolveRequest = {
  key: 'shop-1',
  platform: Platform.SHOPEE,
  userId: USER_ID,
  cookie: TEST_COOKIE,
};

describe('ShopeeSellerCenterResolver', () => {
  let client: jest.Mocked<SellerCenterClient>;
  let resolver: ShopeeSellerCenterResolver;

  beforeEach(() => {
    client = {
      sessionFromLink: jest.fn().mockResolvedValue(null),
      ongoingLive: jest.fn().mockResolvedValue(ongoingFound()),
      sessionInfo: jest.fn().mockResolvedValue(liveInfo()),
      loginUserId: jest.fn().mockResolvedValue({ status: 200, data: {}, userId: null }),
    } as unknown as jest.Mocked<SellerCenterClient>;
    resolver = new ShopeeSellerCenterResolver(client);
  });

  const detailOf = (result: ResolveResult): string => result.detail;

  it('fails with missing_cookie and calls nothing', async () => {
    const result = await resolver.resolve({ ...REQUEST, cookie: undefined });
    expect(result).toEqual({
      ok: false,
      code: ResolveFailureCode.MISSING_COOKIE,
      detail: "missing_cookie: add the shop's Seller Center cookie (SPC_SC_SESSION) in its config",
    });
    expect(client.ongoingLive).not.toHaveBeenCalled();
  });

  it('resolves through the ongoing session and session info', async () => {
    const result = await resolver.resolve(REQUEST);
    expect(result).toEqual({
      ok: true,
      urls: [STREAM_URL],
      detail: `session ${SESSION_ID} via Seller Center (${SESSION_TITLE})`,
    });
    expect(client.ongoingLive).toHaveBeenCalledWith(USER_ID, expect.any(Number), undefined);
    expect(client.sessionInfo).toHaveBeenCalledWith(
      SESSION_ID,
      TEST_COOKIE,
      expect.any(Number),
      undefined,
    );
  });

  it('uses the live_url session and skips the ongoing lookup', async () => {
    client.sessionFromLink.mockResolvedValue(SESSION_ID);
    const result = await resolver.resolve({ ...REQUEST, liveUrl: SHARE_LINK });
    expect(result.ok).toBe(true);
    expect(client.ongoingLive).not.toHaveBeenCalled();
    expect(client.sessionInfo).toHaveBeenCalledWith(
      SESSION_ID,
      TEST_COOKIE,
      expect.any(Number),
      undefined,
    );
  });

  it('falls back to the user id when a short link carries no session', async () => {
    const result = await resolver.resolve({ ...REQUEST, liveUrl: SHORT_LINK });
    expect(client.sessionFromLink).toHaveBeenCalledWith(SHORT_LINK, expect.any(Number), undefined);
    expect(client.ongoingLive).toHaveBeenCalledWith(USER_ID, expect.any(Number), undefined);
    expect(result.ok).toBe(true);
  });

  it('reports not_live when the seller has no ongoing session', async () => {
    client.ongoingLive.mockResolvedValue(ongoingNone());
    expect(detailOf(await resolver.resolve(REQUEST))).toBe(
      'not_live: seller has no ongoing Shopee Live session',
    );
    expect(client.sessionInfo).not.toHaveBeenCalled();
  });

  it('reports ongoing_lookup_failed with err_code when the key is present', async () => {
    client.ongoingLive.mockResolvedValue(ongoingErrCode());
    expect(detailOf(await resolver.resolve(REQUEST))).toBe('ongoing_lookup_failed: http 200 err 5');
  });

  it('reports ongoing_lookup_failed with error when err_code is absent', async () => {
    client.ongoingLive.mockResolvedValue(ongoingErrorOnly());
    expect(detailOf(await resolver.resolve(REQUEST))).toBe(
      'ongoing_lookup_failed: http 500 err boom',
    );
  });

  it('prints None when neither err_code nor error exists', async () => {
    client.ongoingLive.mockResolvedValue(ongoingEmpty());
    expect(detailOf(await resolver.resolve(REQUEST))).toBe(
      'ongoing_lookup_failed: http 502 err None',
    );
  });

  it('takes the user id from the cookie when the request has none', async () => {
    client.loginUserId.mockResolvedValue({ status: 200, data: {}, userId: USER_ID });
    const result = await resolver.resolve({ ...REQUEST, userId: undefined });
    expect(client.loginUserId).toHaveBeenCalledWith(TEST_COOKIE, expect.any(Number), undefined);
    expect(client.ongoingLive).toHaveBeenCalledWith(USER_ID, expect.any(Number), undefined);
    expect(result.ok).toBe(true);
  });

  it('fails with missing_user_id when the login answers 200 without an id', async () => {
    const result = await resolver.resolve({ ...REQUEST, userId: undefined });
    expect(detailOf(result)).toBe(
      'missing_user_id: save the shop again with its Seller Center cookie',
    );
  });

  it.each([
    [
      'a 503',
      { status: 503, data: {}, userId: null },
      'shopee_request_failed: Seller Center login check answered http 503',
    ],
    [
      'a 429',
      { status: 429, data: {}, userId: null },
      'shopee_request_failed: Seller Center login check answered http 429',
    ],
    [
      'a 200 that is not JSON',
      { status: 200, data: {}, invalidBody: true as const, userId: null },
      'shopee_request_failed: response body is not a JSON object',
    ],
    [
      'a 401',
      { status: 401, data: { msg: 'expired' }, userId: null },
      'seller_center_auth_failed: http 401 expired; Seller Center login expired?',
    ],
  ])('reports %s of the login check without missing_user_id', async (_case, login, detail) => {
    client.loginUserId.mockResolvedValue(login);
    expect(detailOf(await resolver.resolve({ ...REQUEST, userId: undefined }))).toBe(detail);
    expect(client.ongoingLive).not.toHaveBeenCalled();
  });

  it('masks secret-looking text in the ongoing lookup error', async () => {
    client.ongoingLive.mockResolvedValue({ status: 500, data: { error: 'token=abc123' } });
    expect(detailOf(await resolver.resolve(REQUEST))).toBe(
      'ongoing_lookup_failed: http 500 err token=[redacted]',
    );
  });

  it.each(['https://example.invalid/x.flv', 'http://example.invalid/x.flv'])(
    'accepts the streaming url %s',
    async (sessionStreamingUrl) => {
      client.sessionInfo.mockResolvedValue(liveInfo({ sessionStreamingUrl }));
      expect((await resolver.resolve(REQUEST)).ok).toBe(true);
    },
  );

  it.each(['ftp://example.invalid/x.flv', 'javascript:alert(1)', 'not a url'])(
    'fails with no_play_url for the streaming url %s',
    async (sessionStreamingUrl) => {
      client.sessionInfo.mockResolvedValue(liveInfo({ sessionStreamingUrl }));
      expect(detailOf(await resolver.resolve(REQUEST))).toContain('no_play_url');
    },
  );

  it('fails with auth_failed on a non-200 status', async () => {
    client.sessionInfo.mockResolvedValue(infoHttp403());
    expect(detailOf(await resolver.resolve(REQUEST))).toBe(
      'seller_center_auth_failed: http 403 forbidden; Seller Center login expired?',
    );
  });

  it.each([502, 503, 429])(
    'reports a session info http %p as a request failure',
    async (status) => {
      client.sessionInfo.mockResolvedValue({ status, data: {} });
      expect(await resolver.resolve(REQUEST)).toEqual({
        ok: false,
        code: ResolveFailureCode.SHOPEE_REQUEST_FAILED,
        detail: `shopee_request_failed: Seller Center session info answered http ${status}`,
      });
    },
  );

  it('fails with auth_failed on a non-zero code', async () => {
    client.sessionInfo.mockResolvedValue(infoBadCode());
    expect(detailOf(await resolver.resolve(REQUEST))).toBe(
      'seller_center_auth_failed: http 200 expired; Seller Center login expired?',
    );
  });

  it('fails with no_access when session info is empty', async () => {
    client.sessionInfo.mockResolvedValue(infoNoData());
    expect(detailOf(await resolver.resolve(REQUEST))).toBe(
      `seller_center_no_access: session ${SESSION_ID} returned no details for this login`,
    );
  });

  it('fails with not_live when sessionStatus is not 1', async () => {
    client.sessionInfo.mockResolvedValue(liveInfo({ sessionStatus: 2 }));
    expect(detailOf(await resolver.resolve(REQUEST))).toBe(
      `not_live: session ${SESSION_ID} sessionStatus=2`,
    );
  });

  it('fails with no_play_url when the streaming url is missing', async () => {
    client.sessionInfo.mockResolvedValue(liveInfo({ sessionStreamingUrl: '' }));
    expect(detailOf(await resolver.resolve(REQUEST))).toBe(
      `no_play_url: Seller Center returned no sessionStreamingUrl for session ${SESSION_ID}`,
    );
  });

  it('turns network errors into shopee_request_failed', async () => {
    client.ongoingLive.mockRejectedValue(networkError('connect ETIMEDOUT'));
    const result = await resolver.resolve(REQUEST);
    expect(result).toEqual({
      ok: false,
      code: ResolveFailureCode.SHOPEE_REQUEST_FAILED,
      detail: 'shopee_request_failed: fetch failed: connect ETIMEDOUT',
    });
  });

  it('never leaks the cookie into an error result', async () => {
    client.sessionInfo.mockRejectedValue(
      networkError(`request failed cookie=${TEST_COOKIE} at https://example.invalid/x`),
    );
    const result = await resolver.resolve(REQUEST);
    expect(result.detail).not.toContain(TEST_COOKIE);
    expect(result.ok).toBe(false);
  });

  it('never carries the cookie in a successful result', async () => {
    expect(JSON.stringify(await resolver.resolve(REQUEST))).not.toContain(TEST_COOKIE);
  });

  it('masks secrets and URLs in the server-supplied message', async () => {
    client.sessionInfo.mockResolvedValue({
      status: 200,
      data: { code: 1, msg: 'bad token=abc123 see https://x.example/p?sig=1' },
    });
    const detail = detailOf(await resolver.resolve(REQUEST));
    expect(detail).toBe(
      'seller_center_auth_failed: http 200 bad token=[redacted] see [url]; Seller Center login expired?',
    );
    expect(detail).not.toContain('abc123');
  });

  it('masks secrets in the session title', async () => {
    client.sessionInfo.mockResolvedValue(liveInfo({ sessionTitle: 'sale token=abc123' }));
    const detail = detailOf(await resolver.resolve(REQUEST));
    expect(detail).not.toContain('abc123');
    expect(detail).toContain('token=[redacted]');
  });

  it('masks a multi-pair cookie header thrown in an error', async () => {
    client.sessionInfo.mockRejectedValue(
      networkError(`bad Cookie: SPC_SC_SESSION=${TEST_COOKIE}; other=zzz`),
    );
    const detail = detailOf(await resolver.resolve(REQUEST));
    expect(detail).not.toContain(TEST_COOKIE);
    expect(detail).not.toContain('zzz');
  });

  it('reports a non-JSON session info body as shopee_request_failed', async () => {
    client.sessionInfo.mockResolvedValue({ status: 200, data: {}, invalidBody: true });
    expect(detailOf(await resolver.resolve(REQUEST))).toBe(
      'shopee_request_failed: response body is not a JSON object',
    );
  });

  it('keeps the HTTP status for a non-JSON error page from session info', async () => {
    client.sessionInfo.mockResolvedValue({ status: 403, data: {}, invalidBody: true });
    expect(detailOf(await resolver.resolve(REQUEST))).toBe(
      'seller_center_auth_failed: http 403 ; Seller Center login expired?',
    );
  });

  it('reports a non-JSON ongoing body as ongoing_lookup_failed', async () => {
    client.ongoingLive.mockResolvedValue({ status: 200, data: {}, invalidBody: true });
    expect(detailOf(await resolver.resolve(REQUEST))).toBe(
      'ongoing_lookup_failed: http 200 err response body is not a JSON object',
    );
  });

  it('treats an absent code as success', async () => {
    const info = liveInfo();
    delete info.data.code;
    client.sessionInfo.mockResolvedValue(info);
    expect((await resolver.resolve(REQUEST)).ok).toBe(true);
  });

  it('fails with no_play_url when the streaming url is not a string', async () => {
    client.sessionInfo.mockResolvedValue(liveInfo({ sessionStreamingUrl: 123 }));
    expect(detailOf(await resolver.resolve(REQUEST))).toContain('no_play_url');
  });

  it.each([['x'], [0], [-5], [1.5], [true], [[5]], [' 7 '], ['9007199254740993']])(
    'does not accept ongoing session_id %p as a session',
    async (sessionId) => {
      client.ongoingLive.mockResolvedValue({
        status: 200,
        data: { err_code: 5, data: { ongoing_live: { session_id: sessionId } } },
      });
      expect(detailOf(await resolver.resolve(REQUEST))).toBe(
        'ongoing_lookup_failed: http 200 err 5',
      );
      expect(client.sessionInfo).not.toHaveBeenCalled();
    },
  );

  it('turns a failing short-link fetch into shopee_request_failed without the user id fallback', async () => {
    client.sessionFromLink.mockRejectedValue(networkError('connect ETIMEDOUT'));
    const result = await resolver.resolve({ ...REQUEST, liveUrl: SHORT_LINK });
    expect(detailOf(result)).toBe('shopee_request_failed: fetch failed: connect ETIMEDOUT');
    expect(client.ongoingLive).not.toHaveBeenCalled();
  });

  describe('cookie validation', () => {
    it('trims a trailing newline and forwards the clean cookie', async () => {
      await resolver.resolve({ ...REQUEST, cookie: `${TEST_COOKIE}\n` });
      expect(client.sessionInfo).toHaveBeenCalledWith(
        SESSION_ID,
        TEST_COOKIE,
        expect.any(Number),
        undefined,
      );
    });

    it.each([
      ['an embedded CR/LF', `abc\r\ndef`],
      ['a non-Latin1 character', 'abc\u1ea1'],
    ])('fails with invalid_cookie for %s without echoing the value', async (_name, cookie) => {
      const result = await resolver.resolve({ ...REQUEST, cookie });
      expect(result).toMatchObject({ ok: false, code: ResolveFailureCode.INVALID_COOKIE });
      expect(result.detail).not.toContain('abc');
      expect(client.ongoingLive).not.toHaveBeenCalled();
    });

    it('treats a whitespace-only cookie as missing', async () => {
      const result = await resolver.resolve({ ...REQUEST, cookie: ' \n' });
      expect(result).toMatchObject({ code: ResolveFailureCode.MISSING_COOKIE });
    });
  });

  describe('error handling', () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
      warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    });

    afterEach(() => warn.mockRestore());

    it('logs a network failure with its masked reason', async () => {
      client.sessionInfo.mockRejectedValue(networkError('ETIMEDOUT token=abc123'));
      const result = await resolver.resolve(REQUEST);
      expect(result.detail).not.toContain('abc123');
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^shopee_request_failed: /));
      expect(String(warn.mock.calls[0][0])).not.toContain('abc123');
    });

    it('lets a programming error surface instead of reporting a network failure', async () => {
      client.sessionInfo.mockRejectedValue(new TypeError('x is not a function'));
      await expect(resolver.resolve(REQUEST)).rejects.toThrow('x is not a function');
    });
  });

  describe('a cancelled resolve', () => {
    it('is cancelled, with no warning, when the caller aborts during a request', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const controller = new AbortController();
      client.sessionInfo.mockImplementation(() => {
        controller.abort();
        return Promise.reject(networkError('aborted'));
      });

      const result = await resolver.resolve({ ...REQUEST, signal: controller.signal });

      expect(result).toMatchObject({ ok: false, code: ResolveFailureCode.CANCELLED });
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe('deadline', () => {
    beforeEach(() => jest.useFakeTimers({ now: 1_000_000 }));
    afterEach(() => jest.useRealTimers());

    it('gives every client call the budget that is left and the caller signal', async () => {
      const controller = new AbortController();
      client.sessionFromLink.mockImplementation(() => {
        jest.advanceTimersByTime(200);
        return Promise.resolve(null);
      });
      client.loginUserId.mockImplementation(() => {
        jest.advanceTimersByTime(300);
        return Promise.resolve({ status: 200, data: {}, userId: USER_ID });
      });
      await resolver.resolve({
        ...REQUEST,
        userId: undefined,
        liveUrl: SHORT_LINK,
        timeoutMs: 1000,
        signal: controller.signal,
      });
      expect(client.sessionFromLink).toHaveBeenCalledWith(SHORT_LINK, 1000, controller.signal);
      expect(client.loginUserId).toHaveBeenCalledWith(TEST_COOKIE, 800, controller.signal);
      expect(client.ongoingLive).toHaveBeenCalledWith(USER_ID, 500, controller.signal);
      expect(client.sessionInfo).toHaveBeenCalledWith(
        SESSION_ID,
        TEST_COOKIE,
        500,
        controller.signal,
      );
    });

    it('uses the default budget when none is given', async () => {
      await resolver.resolve(REQUEST);
      expect(client.ongoingLive).toHaveBeenCalledWith(
        USER_ID,
        DEFAULT_RESOLVE_TIMEOUT_MS,
        undefined,
      );
    });
  });

  it('fails with invalid_live_url when the link is not allowed, without the user id fallback', async () => {
    client.sessionFromLink.mockRejectedValue(new DisallowedLiveUrlError());
    const result = await resolver.resolve({ ...REQUEST, liveUrl: 'https://evil.com/x' });
    expect(result).toEqual({
      ok: false,
      code: ResolveFailureCode.INVALID_LIVE_URL,
      detail: 'invalid_live_url: the live link must be an https shopee.vn or shp.ee address',
    });
    expect(client.ongoingLive).not.toHaveBeenCalled();
  });
});
