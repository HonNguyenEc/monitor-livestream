/** Failure details read `<code>: <message>`, except YTDLP_FAILED, whose details are the masked yt-dlp text, and SHOPEE_REQUEST_FAILED, whose details are the masked network or login failure text; both can be prefixed by the caller with why the primary path failed. */
export enum ResolveFailureCode {
  NOT_LIVE = 'not_live',
  NO_PLAY_URL = 'no_play_url',
  MISSING_COOKIE = 'missing_cookie',
  INVALID_COOKIE = 'invalid_cookie',
  INVALID_LIVE_URL = 'invalid_live_url',
  MISSING_USER_ID = 'missing_user_id',
  ONGOING_LOOKUP_FAILED = 'ongoing_lookup_failed',
  SELLER_CENTER_AUTH_FAILED = 'seller_center_auth_failed',
  SELLER_CENTER_NO_ACCESS = 'seller_center_no_access',
  SHOPEE_REQUEST_FAILED = 'shopee_request_failed',
  YTDLP_FAILED = 'ytdlp_failed',
  BACKEND_NOT_CONNECTED = 'backend_not_connected',
  BACKEND_ERROR = 'backend_error',
  UNSUPPORTED = 'unsupported',
}
