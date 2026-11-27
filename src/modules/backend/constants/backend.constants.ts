export const BACKEND_URL_ENV = 'AUTO_LIVES_BACKEND_URL';
export const DEFAULT_BACKEND_URL = 'http://localhost:8000';
export const BACKEND_API_PREFIX = '/api/v1';
export const TRAILING_SLASHES = /\/+$/;

export const LOGIN_PATH = '/auth/login';
export const REFRESH_PATH = '/auth/refresh';

// Other roles see only their own brands, so the QC list would be silently partial.
export const ADMIN_ROLES: readonly string[] = ['admin', 'super_admin'];

/** BackendRequestError.status when no HTTP answer exists: the backend did not answer, or no request was sent. */
export const NO_HTTP_STATUS = 0;

export const SESSION_FILE = 'backend_session.json';
// Indentation of backend_session.json, kept readable by hand.
export const SESSION_FILE_INDENT = 2;

// Also the budget of one authenticated read: its first try, a token refresh it waits for, and its retry together.
export const BACKEND_TIMEOUT_MS = 25_000;
// The window of BackendStatus.api_calls_5m.
export const API_CALLS_WINDOW_MS = 5 * 60_000;
export const MAX_REMOTE_MESSAGE_LENGTH = 300;
/** Far above any real answer (the board of a day is the biggest, a few hundred rows); only stops a runaway body. */
export const MAX_BACKEND_RESPONSE_BYTES = 8 * 1024 * 1024;
// Messages of the errors this module throws; the user sees backendErrorText, never these.
export const MSG_NOT_LOGGED_IN = 'Not logged in to the backend';
export const MSG_REFRESH_REFUSED = 'Backend refused the refresh token';
export const MSG_REFRESH_ANSWER = 'Backend refresh answer has no token pair';
export const MSG_BACKEND_ANSWER_TOO_LARGE = 'Backend answer is too large';

export const JSON_CONTENT_TYPE = 'application/json';
export const ACCEPT_JSON_HEADERS = { accept: JSON_CONTENT_TYPE } as const;
export const CONTENT_TYPE_HEADER = 'content-type';
export const AUTHORIZATION_HEADER = 'authorization';
export const BEARER_SCHEME = 'Bearer';
export const RETRY_AFTER_HEADER = 'retry-after';

export const BRANDS_PATH = '/brands';
export const BOARD_PATH = '/live-monitor/board';
export const BOARD_DATE_PARAM = 'date';
export const PLAY_URL_SESSION_PARAM = 'session_id';
export const playUrlPath = (brandId: string): string =>
  `/brands/${encodeURIComponent(brandId)}/livestream/play_url`;

// Shown on the shop detail: which session the last play_url answer was about.
export const SESSION_SOURCE_SCHEDULE = 'theo lịch';
export const SESSION_SOURCE_CURRENT = 'phiên hiện tại của shop';

export const VALIDATION_SEPARATOR = '; ';

export const MSG_BRANDS = 'Brands answer is not a list of objects';
export const MSG_BRAND_ID = 'Brand without an id';
export const MSG_BOARD = 'Board answer is not an object with a list of rows';
export const MSG_PLAY_URL = 'play_url answer is not an object';

// For the log only: an installed operator has no .env to edit, a developer does.
export const MSG_LOG_BACKEND_URL_INVALID = `${BACKEND_URL_ENV} in the data folder .env is not an http(s) URL`;
export const MSG_LOG_CHECK_BACKEND_URL = `check ${BACKEND_URL_ENV} in the data folder .env`;

export const MSG_NO_ANSWER = 'Backend did not answer';
