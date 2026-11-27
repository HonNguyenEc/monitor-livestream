import { COOKIE_HEADER } from '../../../common/constants/http.constants';
import {
  SELLER_CENTER_COOKIE_PREFIX,
  SELLER_CENTER_HEADERS,
} from '../constants/seller-center.constants';

/** Seller Center request headers for a stored `SPC_SC_SESSION=<value>` pair; a bare value is prefixed. */
export function sellerCenterHeaders(cookie: string): Record<string, string> {
  const value = cookie.startsWith(SELLER_CENTER_COOKIE_PREFIX)
    ? cookie
    : `${SELLER_CENTER_COOKIE_PREFIX}${cookie}`;
  return { ...SELLER_CENTER_HEADERS, [COOKIE_HEADER]: value };
}
