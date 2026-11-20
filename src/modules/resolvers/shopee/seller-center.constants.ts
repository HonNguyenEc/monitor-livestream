import { SELLER_CENTER_BASE_URL } from '../../../common/shopee/seller-center.constants';

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
  accept: 'application/json, text/plain, */*',
  'accept-language': 'vi-VN,vi;q=0.9,en;q=0.8',
  'user-agent': 'ios/7.830 (ios 17.0; ; iPhone 15 (A2846/A3089/A3090/A3092))',
};

export const SELLER_CENTER_SESSION_INFO_URL = `${SELLER_CENTER_BASE_URL}/api/supply/lm/sellercenter/realtime/dashboard/sessionInfo?sessionId=`;

export const STREAM_URL_PROTOCOLS: readonly string[] = ['https:', 'http:'];
export const SESSION_STATUS_LIVE = 1;
export const ONGOING_OK_ERR_CODE = 0;
export const SESSION_INFO_OK_CODE = 0;
export const SHOPEE_REQUEST_FAILED_EVENT = 'shopee_request_failed';
/** Matches what Python prints for a missing value, so details stay comparable. */
export const ABSENT_VALUE_TEXT = 'None';

export const MSG_MISSING_COOKIE =
  "add the shop's Seller Center cookie (SPC_SC_SESSION) in its config";
export const MSG_MISSING_USER_ID = 'save the shop again with its Seller Center cookie';
export const MSG_INVALID_COOKIE =
  'the stored Seller Center cookie has characters a header cannot carry; save it again';
export const MSG_INVALID_LIVE_URL = 'the live link must be an https shopee.vn or shp.ee address';
export const msgLoginUnavailable = (status: number): string =>
  `Seller Center login check answered http ${status}`;
export const msgSessionInfoUnavailable = (status: number): string =>
  `Seller Center session info answered http ${status}`;
export const MSG_NO_ONGOING = 'seller has no ongoing Shopee Live session';
export const MSG_INVALID_BODY = 'response body is not a JSON object';
export const MSG_LOGIN_EXPIRED_SUFFIX = '; Seller Center login expired?';

export const msgOngoingLookupFailed = (status: number, errCode: string): string =>
  `http ${status} err ${errCode}`;
export const msgAuthFailed = (status: number, message: string): string =>
  `http ${status} ${message}${MSG_LOGIN_EXPIRED_SUFFIX}`;
export const msgNoAccess = (sessionId: number): string =>
  `session ${sessionId} returned no details for this login`;
export const msgNotLive = (sessionId: number, sessionStatus: string): string =>
  `session ${sessionId} sessionStatus=${sessionStatus}`;
export const msgNoPlayUrl = (sessionId: number): string =>
  `Seller Center returned no sessionStreamingUrl for session ${sessionId}`;
export const msgResolved = (sessionId: number, title: string): string =>
  `session ${sessionId} via Seller Center (${title})`;
