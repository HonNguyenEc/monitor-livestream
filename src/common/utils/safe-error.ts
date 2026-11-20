const URL_PATTERN = /https?:\/\/\S+/g;
// Cookie and Authorization values span spaces and `;` pairs, so they are masked to the end of the line.
const LINE_SECRET_PATTERN = /(cookie|authorization)(["']?[=: ]+["']?)[^\r\n]*/gi;
const TOKEN_SECRET_PATTERN = /(token|signature)(["']?[=: ]+["']?)(?:(?:bearer|basic)\s+)?\S+/gi;
// undici echoes a rejected header value verbatim, newlines included.
const SESSION_COOKIE_PATTERN = /(SPC_SC_SESSION=)(?:[^"]*(?=")|[^\s;]+)/g;
const MAX_ERROR_LENGTH = 1200;

/** Masks every http(s) URL and secret-looking values, then keeps the last MAX_ERROR_LENGTH characters. */
export function safeError(text: string): string {
  const masked = text
    .replace(URL_PATTERN, '[url]')
    .replace(SESSION_COOKIE_PATTERN, '$1[redacted]')
    .replace(LINE_SECRET_PATTERN, '$1$2[redacted]')
    .replace(TOKEN_SECRET_PATTERN, '$1$2[redacted]');
  return masked.trim().slice(-MAX_ERROR_LENGTH);
}
