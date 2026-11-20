import { Injectable } from '@nestjs/common';
import { getJson, JsonResponse } from '../../../common/http/get-json';
import { TIKTOK_HEADERS, TIKTOK_ROOM_API_URL } from './tiktok.constants';

@Injectable()
export class TikTokRoomClient {
  /** Network errors and timeouts throw; the resolver turns them into a yt-dlp fallback. */
  fetchRoom(username: string, timeoutMs: number, signal?: AbortSignal): Promise<JsonResponse> {
    return getJson(
      `${TIKTOK_ROOM_API_URL}${encodeURIComponent(username)}`,
      { ...TIKTOK_HEADERS },
      timeoutMs,
      signal,
    );
  }
}
