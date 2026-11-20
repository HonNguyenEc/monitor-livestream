import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Platform } from '../../../common/enums/platform.enum';
import { errorMessage } from '../../../common/utils/error-message';
import { isPlainObject } from '../../../common/utils/is-plain-object';
import { safeError } from '../../../common/utils/safe-error';
import { DEFAULT_RESOLVE_TIMEOUT_MS } from '../constants/resolver.constants';
import { ResolveFailureCode } from '../enums/resolve-failure-code.enum';
import { JsonResponse } from '../../../common/http/get-json';
import { PlatformResolver } from '../interfaces/platform-resolver.interface';
import { ResolveRequest } from '../models/resolve-request.model';
import { failed, failedRaw, resolved, ResolveResult } from '../models/resolve-result.model';
import { YtDlpFallback } from '../ytdlp/ytdlp-fallback.service';
import { TikTokRoomClient } from './tiktok-room.client';
import { selectTikTokStream } from './tiktok-stream-selector';
import {
  msgRoomApiFailed,
  msgTikTokNotLive,
  msgTikTokResolved,
  TIKTOK_API_FAILED_EVENT,
  TIKTOK_API_OK_STATUS_CODE,
  TIKTOK_LIVE_STATUS,
  TIKTOK_MISSING_USERNAME_MESSAGE,
  TIKTOK_NO_STREAM_URL_MESSAGE,
  TIKTOK_REASON_INVALID_BODY,
  TIKTOK_REASON_NO_ROOM_STATUS,
  tiktokReasonHttp,
  tiktokReasonStatusCode,
} from './tiktok.constants';

type JsonObject = Record<string, unknown>;

/** Why the room API answer cannot be used, or null when it can. */
function roomApiFailure(response: JsonResponse, room: JsonObject): string | null {
  if (response.status !== HttpStatus.OK) return tiktokReasonHttp(response.status);
  if (response.invalidBody) return TIKTOK_REASON_INVALID_BODY;
  const statusCode = response.data['statusCode'];
  if (statusCode !== TIKTOK_API_OK_STATUS_CODE) {
    return tiktokReasonStatusCode(safeError(String(statusCode)));
  }
  return 'status' in room ? null : TIKTOK_REASON_NO_ROOM_STATUS;
}

function extractLiveRoom(data: JsonObject): JsonObject {
  const inner = data['data'];
  const room = isPlainObject(inner) ? inner['liveRoom'] : undefined;
  return isPlainObject(room) ? room : {};
}

@Injectable()
export class TikTokResolver implements PlatformResolver {
  readonly platform = Platform.TIKTOK;
  private readonly logger = new Logger(TikTokResolver.name);

  constructor(
    private readonly roomClient: TikTokRoomClient,
    private readonly ytDlp: YtDlpFallback,
  ) {}

  async resolve(request: ResolveRequest): Promise<ResolveResult> {
    const { username } = request;
    if (!username) return failed(ResolveFailureCode.UNSUPPORTED, TIKTOK_MISSING_USERNAME_MESSAGE);
    const timeoutMs = request.timeoutMs ?? DEFAULT_RESOLVE_TIMEOUT_MS;

    let response: JsonResponse;
    try {
      response = await this.roomClient.fetchRoom(username, timeoutMs);
    } catch (error) {
      return this.fallBackToYtDlp(username, timeoutMs, safeError(errorMessage(error)));
    }

    const room = extractLiveRoom(response.data);
    const apiFailure = roomApiFailure(response, room);
    if (apiFailure) return this.fallBackToYtDlp(username, timeoutMs, apiFailure);

    if (room['status'] !== TIKTOK_LIVE_STATUS) {
      return failed(ResolveFailureCode.NOT_LIVE, msgTikTokNotLive(String(room['status'])));
    }
    const choice = selectTikTokStream(room);
    if (!choice) return failed(ResolveFailureCode.NO_PLAY_URL, TIKTOK_NO_STREAM_URL_MESSAGE);
    const title = typeof room['title'] === 'string' ? room['title'] : '';
    return resolved(choice.urls, msgTikTokResolved(choice.quality, title));
  }

  private async fallBackToYtDlp(
    username: string,
    timeoutMs: number,
    reason: string,
  ): Promise<ResolveResult> {
    this.logger.warn(`${TIKTOK_API_FAILED_EVENT}: ${reason}`);
    const result = await this.ytDlp.resolve(username, timeoutMs);
    return result.ok ? result : failedRaw(result.code, msgRoomApiFailed(reason, result.detail));
  }
}
