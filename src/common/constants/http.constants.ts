/** A JSON API answer is a few KB; anything bigger is not what was asked for. */
export const MAX_JSON_RESPONSE_BYTES = 2 * 1024 * 1024;
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
export const COOKIE_HEADER = 'Cookie';
export const MSG_RESPONSE_TOO_LARGE = 'response too large';
export const MSG_INVALID_JSON_BODY = 'response body is not a JSON object';
export const JSON_ACCEPT_HEADER = 'application/json, text/plain, */*';
/** URL.protocol values of a plain web address. */
export const HTTP_URL_PROTOCOLS: readonly string[] = ['http:', 'https:'];
export const HTTP_URL_PREFIXES: readonly string[] = ['http://', 'https://'];

export const INTERNAL_ERROR_MESSAGE = 'Internal server error';
export const MESSAGE_SEPARATOR = ', ';
