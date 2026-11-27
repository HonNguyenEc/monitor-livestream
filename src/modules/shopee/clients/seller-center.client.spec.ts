import {
  SELLER_CENTER_LOGIN_URL,
  SELLER_CENTER_SESSION_INFO_URL,
  SHOPEE_SHARE_REFERER,
} from '../constants/seller-center.constants';
import { DisallowedLiveUrlError } from '../errors/disallowed-live-url.error';
import { SellerCenterClient } from './seller-center.client';
import {
  SESSION_ID,
  SHARE_LINK,
  SHORT_LINK,
  TEST_COOKIE,
  USER_ID,
} from '../fixtures/seller-center.fixtures';

const TIMEOUT = 1000;
const COOKIE_PAIR = `SPC_SC_SESSION=${TEST_COOKIE}`;

function mockFetch(body: unknown, init: { status?: number; url?: string } = {}): jest.SpyInstance {
  return jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
    const response = new Response(JSON.stringify(body), { status: init.status ?? 200 });
    if (init.url) Object.defineProperty(response, 'url', { value: init.url });
    return Promise.resolve(response);
  });
}

function mockRedirects(map: Record<string, string>): jest.SpyInstance {
  return jest.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const target = map[String(input)];
    const headers: Record<string, string> = target ? { location: target } : {};
    return Promise.resolve(new Response(null, { status: target ? 302 : 200, headers }));
  });
}

function sentHeaders(spy: jest.SpyInstance, call = 0): Record<string, string> {
  return (spy.mock.calls[call] as [string, { headers: Record<string, string> }])[1].headers;
}

describe('SellerCenterClient', () => {
  const client = new SellerCenterClient();

  afterEach(() => jest.restoreAllMocks());

  describe('sessionFromLink', () => {
    it('reads the session from a live.shopee link without any request', async () => {
      const spy = mockFetch({});
      await expect(client.sessionFromLink(SHARE_LINK, TIMEOUT)).resolves.toBe(SESSION_ID);
      expect(spy).not.toHaveBeenCalled();
    });

    it('follows a short link and reads the session from the final URL', async () => {
      const spy = mockRedirects({ [SHORT_LINK]: SHARE_LINK });
      await expect(client.sessionFromLink(SHORT_LINK, TIMEOUT)).resolves.toBe(SESSION_ID);
      expect(String(spy.mock.calls[0][0])).toBe(SHORT_LINK);
      expect((spy.mock.calls[0][1] as RequestInit).redirect).toBe('manual');
      expect(sentHeaders(spy)['user-agent']).toContain('ios/');
      expect(sentHeaders(spy).Cookie).toBeUndefined();
    });

    it('returns null for an unparsable live link so the caller can fall back', async () => {
      await expect(
        client.sessionFromLink('https://live.shopee.vn:bad', TIMEOUT),
      ).resolves.toBeNull();
    });

    it('returns null when the session is missing or not digits', async () => {
      await expect(
        client.sessionFromLink('https://live.shopee.vn/share?session=abc', TIMEOUT),
      ).resolves.toBeNull();
      await expect(
        client.sessionFromLink('https://live.shopee.vn/share', TIMEOUT),
      ).resolves.toBeNull();
    });
  });

  describe('ongoingLive', () => {
    it('calls the ongoing API with the share-page referer and no cookie', async () => {
      const spy = mockFetch({ err_code: 0 });
      const result = await client.ongoingLive(USER_ID, TIMEOUT);
      expect(result).toEqual({ status: 200, data: { err_code: 0 } });
      expect(spy.mock.calls[0][0]).toBe(
        `https://live.shopee.vn/api/v1/shop_page/live/ongoing?uid=${USER_ID}`,
      );
      expect(sentHeaders(spy).referer).toBe(SHOPEE_SHARE_REFERER);
      expect(sentHeaders(spy).Cookie).toBeUndefined();
    });
  });

  describe('sessionInfo', () => {
    it('sends the cookie only to Seller Center, as SPC_SC_SESSION=<value>', async () => {
      const spy = mockFetch({ code: 0 });
      await client.sessionInfo(SESSION_ID, TEST_COOKIE, TIMEOUT);
      expect(spy.mock.calls[0][0]).toBe(`${SELLER_CENTER_SESSION_INFO_URL}${SESSION_ID}`);
      expect(sentHeaders(spy).Cookie).toBe(COOKIE_PAIR);
      expect(sentHeaders(spy).referer).toBe('https://banhang.shopee.vn/');
    });

    it('keeps an already stored SPC_SC_SESSION=<value> pair unchanged', async () => {
      const spy = mockFetch({ code: 0 });
      await client.sessionInfo(SESSION_ID, COOKIE_PAIR, TIMEOUT);
      expect(sentHeaders(spy).Cookie).toBe(COOKIE_PAIR);
    });
  });

  describe('cookie forms', () => {
    it('prefixes a bare value that contains = padding', async () => {
      const spy = mockFetch({ code: 0 });
      await client.sessionInfo(SESSION_ID, 'abc==', TIMEOUT);
      expect(sentHeaders(spy).Cookie).toBe('SPC_SC_SESSION=abc==');
    });
  });

  describe('loginUserId', () => {
    it('returns the numeric id on 200', async () => {
      const spy = mockFetch({ id: USER_ID });
      await expect(client.loginUserId(TEST_COOKIE, TIMEOUT)).resolves.toMatchObject({
        status: 200,
        userId: USER_ID,
      });
      expect(spy.mock.calls[0][0]).toBe(SELLER_CENTER_LOGIN_URL);
      expect(sentHeaders(spy).Cookie).toBe(COOKIE_PAIR);
    });

    it('returns no id but keeps the status on a non-200 answer', async () => {
      mockFetch({ id: USER_ID }, { status: 401 });
      await expect(client.loginUserId(TEST_COOKIE, TIMEOUT)).resolves.toMatchObject({
        status: 401,
        userId: null,
      });
    });

    it('flags a 200 whose body is not JSON', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>', { status: 200 }));
      await expect(client.loginUserId(TEST_COOKIE, TIMEOUT)).resolves.toMatchObject({
        status: 200,
        userId: null,
        invalidBody: true,
      });
    });

    it('returns null when the id is missing or not digits', async () => {
      mockFetch({ id: 'abc' });
      await expect(client.loginUserId(TEST_COOKIE, TIMEOUT)).resolves.toMatchObject({
        userId: null,
      });
      mockFetch({});
      await expect(client.loginUserId(TEST_COOKIE, TIMEOUT)).resolves.toMatchObject({
        userId: null,
      });
    });
  });

  describe('unsafe ids', () => {
    it('rejects a session id beyond the safe integer range', async () => {
      await expect(
        client.sessionFromLink('https://live.shopee.vn/share?session=9007199254740993', TIMEOUT),
      ).resolves.toBeNull();
    });

    it('rejects a login id beyond the safe integer range', async () => {
      mockFetch({ id: '9007199254740993' });
      await expect(client.loginUserId(TEST_COOKIE, TIMEOUT)).resolves.toMatchObject({
        userId: null,
      });
    });
  });

  it('releases the short-link response body after reading the final URL', async () => {
    const cancel = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
      const response = new Response(null, { status: 302, headers: { location: SHARE_LINK } });
      Object.defineProperty(response, 'body', { value: { cancel } });
      return Promise.resolve(response);
    });
    await client.sessionFromLink(SHORT_LINK, TIMEOUT);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('returns null when a short link redirects to a URL without a session', async () => {
    mockRedirects({ [SHORT_LINK]: 'https://live.shopee.vn/share' });
    await expect(client.sessionFromLink(SHORT_LINK, TIMEOUT)).resolves.toBeNull();
  });

  describe('link allow-list', () => {
    it.each([
      ['http scheme', 'http://live.shopee.vn/share?session=1'],
      ['an unrelated host', 'https://evil.com/share?session=1'],
      ['a lookalike subdomain', 'https://shopee.vn.evil.com/share?session=1'],
      ['a lookalike suffix', 'https://evilshopee.vn/share?session=1'],
    ])('rejects %s without any request', async (_name, url) => {
      const spy = mockFetch({});
      await expect(client.sessionFromLink(url, TIMEOUT)).rejects.toBeInstanceOf(
        DisallowedLiveUrlError,
      );
      expect(spy).not.toHaveBeenCalled();
    });

    it.each(['https://live.shopee.vn/share?session=5', 'https://shopee.vn/x?session=5'])(
      'accepts %s',
      async (url) => {
        mockRedirects({});
        await expect(client.sessionFromLink(url, TIMEOUT)).resolves.toBe(5);
      },
    );

    it('follows an shp.ee short link', async () => {
      const spy = mockRedirects({ 'https://shp.ee/abc': SHARE_LINK });
      await expect(client.sessionFromLink('https://shp.ee/abc', TIMEOUT)).resolves.toBe(SESSION_ID);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it.each(['http://shp.ee/abc', 'https://shp.ee.evil.com/abc', 'https://evilshp.ee/abc'])(
      'rejects %s without any request',
      async (url) => {
        const spy = mockFetch({});
        await expect(client.sessionFromLink(url, TIMEOUT)).rejects.toBeInstanceOf(
          DisallowedLiveUrlError,
        );
        expect(spy).not.toHaveBeenCalled();
      },
    );

    it('rejects a redirect to a disallowed host without requesting it', async () => {
      const spy = mockRedirects({ [SHORT_LINK]: 'https://evil.com/share?session=1' });
      await expect(client.sessionFromLink(SHORT_LINK, TIMEOUT)).rejects.toBeInstanceOf(
        DisallowedLiveUrlError,
      );
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('rejects a redirect downgraded to http', async () => {
      mockRedirects({ [SHORT_LINK]: 'http://s.shopee.vn/next' });
      await expect(client.sessionFromLink(SHORT_LINK, TIMEOUT)).rejects.toBeInstanceOf(
        DisallowedLiveUrlError,
      );
    });

    it('gives up after too many redirects', async () => {
      jest
        .spyOn(globalThis, 'fetch')
        .mockImplementation(() =>
          Promise.resolve(new Response(null, { status: 302, headers: { location: SHORT_LINK } })),
        );
      await expect(client.sessionFromLink(SHORT_LINK, TIMEOUT)).resolves.toBeNull();
    });

    it('uses one signal for every hop of the chain, so the budget is spent once', async () => {
      const spy = mockRedirects({
        [SHORT_LINK]: '/other',
        'https://s.shopee.vn/other': SHARE_LINK,
      });
      const controller = new AbortController();

      await client.sessionFromLink(SHORT_LINK, TIMEOUT, controller.signal);

      const signals = spy.mock.calls.map(([, init]) => (init as RequestInit).signal);
      expect(signals).toHaveLength(2);
      expect(signals[0]).toBe(signals[1]);
      controller.abort();
      expect(signals[0]?.aborted).toBe(true);
    });

    it('resolves a relative Location against the current URL', async () => {
      mockRedirects({ [SHORT_LINK]: '/other', 'https://s.shopee.vn/other': SHARE_LINK });
      await expect(client.sessionFromLink(SHORT_LINK, TIMEOUT)).resolves.toBe(SESSION_ID);
    });
  });
});
