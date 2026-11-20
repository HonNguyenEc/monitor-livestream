import { BROWSER_USER_AGENT, JSON_ACCEPT_HEADER } from '../../../common/constants/http.constants';

export const SELLER_CENTER_BASE_URL = 'https://banhang.shopee.vn';
export const SELLER_CENTER_LOGIN_URL = `${SELLER_CENTER_BASE_URL}/api/v2/login/`;
export const SELLER_CENTER_COOKIE_NAME = 'SPC_SC_SESSION';
export const SELLER_CENTER_COOKIE_PREFIX = `${SELLER_CENTER_COOKIE_NAME}=`;
export const SELLER_CENTER_TIMEOUT_MS = 25_000;

export const SELLER_CENTER_HEADERS: Readonly<Record<string, string>> = {
  accept: JSON_ACCEPT_HEADER,
  referer: `${SELLER_CENTER_BASE_URL}/`,
  'user-agent': BROWSER_USER_AGENT,
};

export const SHOPEE_LIVE_BASE_URL = 'https://live.shopee.vn';
export const SHOPEE_ONGOING_PATH = '/api/v1/shop_page/live/ongoing?uid=';
export const SHOPEE_SHARE_URL = `${SHOPEE_LIVE_BASE_URL}/share?from=live&session=`;
export const SHOPEE_SHARE_REFERER = `${SHOPEE_SHARE_URL}&share_user_id=`;
export const SHOPEE_LIVE_HOST = 'live.shopee.vn';
export const MAX_LINK_REDIRECTS = 5;
export const REDIRECT_STATUS_MIN = 300;
export const REDIRECT_STATUS_MAX = 399;
export const LOCATION_HEADER = 'location';
export const SHOPEE_SESSION_QUERY_PARAM = 'session';

/** iOS app user agent, ported from ihmily/DouyinLiveRecorder. */
export const SHOPEE_HEADERS: Readonly<Record<string, string>> = {
  accept: JSON_ACCEPT_HEADER,
  'accept-language': 'vi-VN,vi;q=0.9,en;q=0.8',
  'user-agent': 'ios/7.830 (ios 17.0; ; iPhone 15 (A2846/A3089/A3090/A3092))',
};

export const SELLER_CENTER_SESSION_INFO_URL = `${SELLER_CENTER_BASE_URL}/api/supply/lm/sellercenter/realtime/dashboard/sessionInfo?sessionId=`;

export const MSG_SELLER_CENTER_NO_ANSWER = 'Seller Center did not answer';
export const msgSellerCenterAnswered = (status: number): string =>
  `Seller Center answered ${status}`;
