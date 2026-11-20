import { BROWSER_USER_AGENT, JSON_ACCEPT_HEADER } from '../../../common/constants/http.constants';

export const TIKTOK_ROOM_API_URL =
  'https://www.tiktok.com/api-live/user/room/?aid=1988&sourceType=54&uniqueId=';

export const TIKTOK_HEADERS: Readonly<Record<string, string>> = {
  accept: JSON_ACCEPT_HEADER,
  referer: 'https://www.tiktok.com/',
  'user-agent': BROWSER_USER_AGENT,
};

/** Room status: 2 live, 4 ended. */
export const TIKTOK_LIVE_STATUS = 2;

export const TIKTOK_API_OK_STATUS_CODE = 0;

/** Best first; "ao" is audio only and must never be picked. */
export const TIKTOK_QUALITIES: readonly string[] = ['origin', 'uhd', 'hd', 'sd', 'ld'];

/** FLV is preferred over HLS. */
export const TIKTOK_STREAM_KINDS: readonly string[] = ['flv', 'hls'];

export const TIKTOK_MISSING_USERNAME_MESSAGE = 'TikTok shop has no username';
export const TIKTOK_NO_STREAM_URL_MESSAGE = 'TikTok room is live but returned no stream URL';

export const TIKTOK_API_FAILED_EVENT = 'tiktok_api_failed';
export const TIKTOK_REASON_NO_ROOM_STATUS = 'room status missing';

export const tiktokReasonHttp = (status: number): string => `http ${status}`;
export const tiktokReasonStatusCode = (statusCode: string): string => `statusCode=${statusCode}`;
export const msgTikTokNotLive = (status: string): string => `TikTok room status=${status}`;
export const msgTikTokResolved = (quality: string, title: string): string =>
  `TikTok room API (${quality}) ${title}`.trim();
export const msgRoomApiFailed = (reason: string, ytDlpDetail: string): string =>
  `room API: ${reason}; yt-dlp: ${ytDlpDetail}`;
