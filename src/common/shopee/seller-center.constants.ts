import { BROWSER_USER_AGENT } from '../constants/http.constants';

export const SELLER_CENTER_BASE_URL = 'https://banhang.shopee.vn';
export const SELLER_CENTER_LOGIN_URL = `${SELLER_CENTER_BASE_URL}/api/v2/login/`;
export const SELLER_CENTER_COOKIE_NAME = 'SPC_SC_SESSION';
export const SELLER_CENTER_COOKIE_PREFIX = `${SELLER_CENTER_COOKIE_NAME}=`;
export const SELLER_CENTER_TIMEOUT_MS = 25_000;

export const SELLER_CENTER_HEADERS: Readonly<Record<string, string>> = {
  accept: 'application/json, text/plain, */*',
  referer: `${SELLER_CENTER_BASE_URL}/`,
  'user-agent': BROWSER_USER_AGENT,
};
