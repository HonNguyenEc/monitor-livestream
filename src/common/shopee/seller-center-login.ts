import { COOKIE_HEADER } from '../constants/http.constants';
import { getJson, JsonResponse } from '../http/get-json';
import {
  SELLER_CENTER_COOKIE_PREFIX,
  SELLER_CENTER_HEADERS,
  SELLER_CENTER_LOGIN_URL,
} from './seller-center.constants';

/** Seller Center request headers for a stored `SPC_SC_SESSION=<value>` pair; a bare value is prefixed. */
export function sellerCenterHeaders(cookie: string): Record<string, string> {
  const value = cookie.startsWith(SELLER_CENTER_COOKIE_PREFIX)
    ? cookie
    : `${SELLER_CENTER_COOKIE_PREFIX}${cookie}`;
  return { ...SELLER_CENTER_HEADERS, [COOKIE_HEADER]: value };
}

/** The Seller Center login check (`seller_center_account` in livestream_qc/resolvers.py). Network errors throw. */
export function fetchSellerCenterLogin(cookie: string, timeoutMs: number): Promise<JsonResponse> {
  return getJson(SELLER_CENTER_LOGIN_URL, sellerCenterHeaders(cookie), timeoutMs);
}
