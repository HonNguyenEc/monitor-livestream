import { HttpStatus } from '@nestjs/common';

import { SELLER_CENTER_LOGIN_URL } from '../constants/seller-center.constants';
import {
  LOGIN_EXPIRED,
  LOGIN_OK,
  LOGIN_WITHOUT_SHOP,
} from '../fixtures/seller-center-login.fixtures';
import { SellerCenterUnavailableError } from '../errors/seller-center-unavailable.error';
import { SellerCenterClient } from './seller-center.client';

const COOKIE = 'SPC_SC_SESSION=fake';

describe('SellerCenterClient account', () => {
  const client = new SellerCenterClient();
  let fetchMock: jest.SpyInstance;

  const answer = (status: number, body: unknown): void => {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    fetchMock.mockResolvedValue(new Response(text, { status }));
  };

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('reads the account and sends only the given cookie to the login API', async () => {
    answer(HttpStatus.OK, LOGIN_OK);

    expect(await client.account(COOKIE)).toEqual({
      user_id: 900000001,
      shop_id: 900000002,
      username: 'sample.seller',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(SELLER_CENTER_LOGIN_URL);
    expect(init.headers).toMatchObject({ Cookie: COOKIE, referer: 'https://banhang.shopee.vn/' });
  });

  it('accepts a digit-string id and reports no shop for shopid 0', async () => {
    answer(HttpStatus.OK, LOGIN_WITHOUT_SHOP);

    expect(await client.account(COOKIE)).toEqual({
      user_id: 900000003,
      shop_id: null,
      username: '',
    });
  });

  it.each([
    ['an error body', HttpStatus.OK, LOGIN_EXPIRED],
    ['a 403', HttpStatus.FORBIDDEN, LOGIN_OK],
    ['a user id beyond the safe integer range', HttpStatus.OK, { id: '99999999999999999999' }],
  ])('treats %s as a rejected cookie', async (_case, status, body) => {
    answer(status, body);

    expect(await client.account(COOKIE)).toBeNull();
  });

  it.each([
    ['a 503', HttpStatus.SERVICE_UNAVAILABLE, ''],
    ['a 429', HttpStatus.TOO_MANY_REQUESTS, ''],
    ['a body that is not JSON', HttpStatus.OK, '<html></html>'],
  ])(
    'reports %s as Seller Center being unavailable, not as a rejected cookie',
    async (_case, status, body) => {
      answer(status, body);

      await expect(client.account(COOKIE)).rejects.toThrow(SellerCenterUnavailableError);
    },
  );

  it('reports a network failure as Seller Center being unavailable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(client.account(COOKIE)).rejects.toThrow(SellerCenterUnavailableError);
  });

  it('only parses a 200: a 4xx with an unreadable body is still a rejected cookie', async () => {
    answer(HttpStatus.UNAUTHORIZED, '<html></html>');

    expect(await client.account(COOKIE)).toBeNull();
  });
});
