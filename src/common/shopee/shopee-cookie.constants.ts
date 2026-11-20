/** Anything outside printable ASCII makes fetch reject the header and echo its value. */
export const INVALID_COOKIE_CHARS = /[^\x20-\x7e]/;
