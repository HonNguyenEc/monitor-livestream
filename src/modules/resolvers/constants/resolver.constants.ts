/** The default budget of one resolve, shared by its HTTP requests; TikTok's yt-dlp fallback gets a whole budget of its own. */
export const DEFAULT_RESOLVE_TIMEOUT_MS = 25_000;
export const MIN_HOP_TIMEOUT_MS = 1;
export const MSG_CANCELLED = 'resolve cancelled';
export const MSG_BUDGET_SPENT = 'the resolve budget was spent before the backend was asked';
