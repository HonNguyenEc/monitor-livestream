export const SESSION_STATUS_LIVE = 1;
export const ONGOING_OK_ERR_CODE = 0;
export const SESSION_INFO_OK_CODE = 0;
export const SHOPEE_REQUEST_FAILED_EVENT = 'shopee_request_failed';

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
