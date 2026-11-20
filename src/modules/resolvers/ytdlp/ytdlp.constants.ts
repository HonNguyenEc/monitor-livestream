export const YTDLP_ARGS: readonly string[] = ['--no-warnings', '--get-url'];
export const tiktokLiveUrl = (username: string): string =>
  `https://www.tiktok.com/@${encodeURIComponent(username)}/live`;
export const URL_PREFIXES: readonly string[] = ['http://', 'https://'];
export const YTDLP_SUCCESS_DETAIL = 'resolved';
export const YTDLP_EXIT_FALLBACK_PREFIX = 'yt-dlp exited';
export const YTDLP_NO_EXIT_CODE_MESSAGE = 'yt-dlp timed out or was killed';
export const YTDLP_SUCCESS_EXIT_CODE = 0;
export const YTDLP_FAILED_EVENT = 'ytdlp_failed';
export const YTDLP_UNAVAILABLE_MESSAGE = 'yt-dlp is not installed';
export const YTDLP_UNAVAILABLE_EXIT_CODE = 1;
