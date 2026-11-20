import { NestFastifyApplication } from '@nestjs/platform-fastify';

import { Platform } from '../../src/common/enums/platform.enum';
import { BackendRequestError } from '../../src/modules/backend/errors/backend-request.error';
import { shopKey } from '../../src/modules/shops/utils/shop-identity';
import { callApi } from './http';

export const ADMIN_LOGIN = { email: 'admin@example.com', password: 'secret' };
export const BRAND_ID = '0123456789abcdef0123456789abcdef';
export const BRAND_NAME = 'Sample Brand';
export const BRAND_KEY = shopKey(Platform.SHOPEE, { brand_id: BRAND_ID });

const ADMIN_LOGIN_ANSWER = {
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  token_type: 'bearer',
  user: { id: 7, role: 'admin', email: ADMIN_LOGIN.email, name: 'Sample Admin', shop_name: '' },
};

export interface FakeBackendData {
  brands: unknown;
  board: unknown;
  playUrl: unknown;
  /** Replaces the answer of a path ending with the key by a failure. */
  failures: Record<string, BackendRequestError>;
}

/** A stand-in for BackendHttpClient that routes by URL path; tests change `data` between calls. */
export function fakeBackend(initial: Partial<FakeBackendData> = {}): {
  data: FakeBackendData;
  request: jest.Mock;
} {
  const data: FakeBackendData = {
    brands: [{ id: BRAND_ID, name: BRAND_NAME, is_connect_shopee: true }],
    board: { items: [] },
    playUrl: { session_id: '', is_live: false, play_url: '' },
    failures: {},
    ...initial,
  };
  const request = jest.fn(async (_method: string, url: string) => {
    const { pathname } = new URL(url);
    const failure = Object.entries(data.failures).find(([suffix]) => pathname.endsWith(suffix));
    if (failure) throw failure[1];
    if (pathname.endsWith('/auth/login')) return ADMIN_LOGIN_ANSWER;
    if (pathname.endsWith('/live-monitor/board')) return data.board;
    if (pathname.endsWith('/play_url')) return data.playUrl;
    if (pathname.endsWith('/brands')) return data.brands;
    throw new Error(`Unexpected backend request ${pathname}`);
  });
  return { data, request };
}

/** Logs the app in to the fake backend, which also syncs its brands and board. */
export async function loginToFakeBackend(app: NestFastifyApplication): Promise<void> {
  const response = await callApi(app, 'POST', '/backend/login', ADMIN_LOGIN);
  if (response.statusCode !== 200) {
    throw new Error(`Fake backend login answered ${response.statusCode}`);
  }
}
