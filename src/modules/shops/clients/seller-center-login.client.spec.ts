import { HttpStatus } from '@nestjs/common';

import { SELLER_CENTER_LOGIN_URL } from './seller-center-login.constants';
import {
  LOGIN_EXPIRED,
  LOGIN_OK,
  LOGIN_WITHOUT_SHOP,
} from './fixtures/seller-center-login.fixtures';
import { SellerCenterLoginClient } from './seller-center-login.client';

const COOKIE = 'SPC_SC_SESSION=fake';

describe('SellerCenterLoginClient', () => {
  const client = new SellerCenterLoginClient();
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
    expect(init.headers).toMatchObject({ cookie: COOKIE, referer: 'https://banhang.shopee.vn/' });
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
    ['a body that is not JSON', HttpStatus.OK, '<html></html>'],
  ])('treats %s as a rejected cookie', async (_case, status, body) => {
    answer(status, body);

    expect(await client.account(COOKIE)).toBeNull();
  });

  it('lets a network failure through', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(client.account(COOKIE)).rejects.toThrow(TypeError);
  });
});
