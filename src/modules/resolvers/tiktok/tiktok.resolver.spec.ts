import { Logger } from '@nestjs/common';
import { Platform } from '../../../common/enums/platform.enum';
import { DEFAULT_RESOLVE_TIMEOUT_MS } from '../constants/resolver.constants';
import { ResolveFailureCode } from '../enums/resolve-failure-code.enum';
import { ResolveRequest } from '../models/resolve-request.model';
import { failed, failedRaw, resolved, ResolveResult } from '../models/resolve-result.model';
import { YtDlpFallback } from '../ytdlp/ytdlp-fallback.service';
import {
  apiErrorStatusCode,
  apiResponse,
  endedRoom,
  FLV_HD,
  FLV_ORIGIN,
  HLS_HD,
  HLS_ORIGIN,
  liveAudioOnly,
  liveFallsToHd,
  liveMalformedStreamData,
  liveOnlyHls,
  liveOriginBoth,
  liveRoom,
  missingRoomStatus,
  ROOM_TITLE,
} from './fixtures/tiktok-room.fixtures';
import { TikTokRoomClient } from './tiktok-room.client';
import { TikTokResolver } from './tiktok.resolver';

const USERNAME = 'synthetic_user';
const FALLBACK_RESULT: ResolveResult = resolved(['https://example.invalid/ytdlp.flv'], 'yt-dlp');
const REQUEST: ResolveRequest = { key: 'shop-1', platform: Platform.TIKTOK, username: USERNAME };

describe('TikTokResolver', () => {
  let fetchRoom: jest.Mock;
  let ytDlpResolve: jest.Mock;
  let resolver: TikTokResolver;

  beforeEach(() => {
    fetchRoom = jest.fn();
    ytDlpResolve = jest.fn().mockResolvedValue(FALLBACK_RESULT);
    resolver = new TikTokResolver(
      { fetchRoom } as unknown as TikTokRoomClient,
      { resolve: ytDlpResolve } as unknown as YtDlpFallback,
    );
  });

  it('reports the TikTok platform', () => {
    expect(resolver.platform).toBe(Platform.TIKTOK);
  });

  it('fails as unsupported without a username', async () => {
    const result = await resolver.resolve({ key: 'shop-1', platform: Platform.TIKTOK });
    expect(result).toEqual(failed(ResolveFailureCode.UNSUPPORTED, 'TikTok shop has no username'));
    expect(fetchRoom).not.toHaveBeenCalled();
  });

  it('prefers FLV and names the quality and title', async () => {
    fetchRoom.mockResolvedValue(liveOriginBoth());
    const result = await resolver.resolve(REQUEST);
    expect(result).toEqual(
      resolved([FLV_ORIGIN, HLS_ORIGIN], `TikTok room API (origin) ${ROOM_TITLE}`),
    );
    expect(ytDlpResolve).not.toHaveBeenCalled();
  });

  it('falls to a lower quality when origin has no URL', async () => {
    fetchRoom.mockResolvedValue(liveFallsToHd());
    expect(await resolver.resolve(REQUEST)).toEqual(
      resolved([FLV_HD, HLS_HD], `TikTok room API (hd) ${ROOM_TITLE}`),
    );
  });

  it('accepts an HLS-only stream', async () => {
    fetchRoom.mockResolvedValue(liveOnlyHls());
    expect(await resolver.resolve(REQUEST)).toEqual(
      resolved([HLS_HD], `TikTok room API (sd) ${ROOM_TITLE}`),
    );
  });

  it('trims the detail when the room has no title', async () => {
    const stream = JSON.stringify({ data: { ld: { main: { flv: FLV_HD } } } });
    fetchRoom.mockResolvedValue(apiResponse(liveRoom(stream, { title: undefined })));
    expect(await resolver.resolve(REQUEST)).toEqual(resolved([FLV_HD], 'TikTok room API (ld)'));
  });

  it('reports not_live with the room status', async () => {
    fetchRoom.mockResolvedValue(endedRoom());
    expect(await resolver.resolve(REQUEST)).toEqual(
      failed(ResolveFailureCode.NOT_LIVE, 'TikTok room status=4'),
    );
    expect(ytDlpResolve).not.toHaveBeenCalled();
  });

  it.each([
    ['audio-only stream', liveAudioOnly],
    ['malformed stream_data', liveMalformedStreamData],
  ])('reports no_play_url for a live room with %s', async (_name, build) => {
    fetchRoom.mockResolvedValue(build());
    expect(await resolver.resolve(REQUEST)).toEqual(
      failed(ResolveFailureCode.NO_PLAY_URL, 'TikTok room is live but returned no stream URL'),
    );
  });

  describe('yt-dlp fallback', () => {
    it('is used on network error or timeout', async () => {
      fetchRoom.mockRejectedValue(new Error('timeout'));
      expect(await resolver.resolve({ ...REQUEST, timeoutMs: 5000 })).toBe(FALLBACK_RESULT);
      expect(ytDlpResolve).toHaveBeenCalledWith(USERNAME, 5000);
    });

    it('is used on a non-200 response', async () => {
      fetchRoom.mockResolvedValue({ ...liveOriginBoth(), status: 503 });
      expect(await resolver.resolve(REQUEST)).toBe(FALLBACK_RESULT);
    });

    it('is used when statusCode is not 0', async () => {
      fetchRoom.mockResolvedValue(apiErrorStatusCode());
      expect(await resolver.resolve(REQUEST)).toBe(FALLBACK_RESULT);
    });

    it('is used when the room has no status', async () => {
      fetchRoom.mockResolvedValue(missingRoomStatus());
      expect(await resolver.resolve(REQUEST)).toBe(FALLBACK_RESULT);
    });

    it('is used when liveRoom is absent', async () => {
      fetchRoom.mockResolvedValue({ status: 200, data: { statusCode: 0 } });
      expect(await resolver.resolve(REQUEST)).toBe(FALLBACK_RESULT);
    });

    it('is used when the body is not a JSON object', async () => {
      fetchRoom.mockResolvedValue({ status: 200, data: {}, invalidBody: true });
      expect(await resolver.resolve(REQUEST)).toBe(FALLBACK_RESULT);
    });

    describe('when the room API failed', () => {
      const YTDLP_FAILURE = failedRaw(ResolveFailureCode.YTDLP_FAILED, 'yt-dlp is not installed');
      let warn: jest.SpyInstance;

      beforeEach(() => {
        warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
        ytDlpResolve.mockResolvedValue(YTDLP_FAILURE);
      });

      afterEach(() => warn.mockRestore());

      it.each([
        ['a network error', new Error('fetch failed: ETIMEDOUT'), 'fetch failed: ETIMEDOUT'],
        ['a non-200 response', { ...liveOriginBoth(), status: 403 }, 'http 403'],
        ['a non-JSON error page', { status: 502, data: {}, invalidBody: true }, 'http 502'],
        ['a bad statusCode', apiErrorStatusCode(), 'statusCode=4000'],
        ['a missing room status', missingRoomStatus(), 'room status missing'],
        [
          'a non-JSON body',
          { status: 200, data: {}, invalidBody: true },
          'response body is not a JSON object',
        ],
      ])('logs %s and keeps the reason in the failure detail', async (_name, outcome, reason) => {
        if (outcome instanceof Error) fetchRoom.mockRejectedValue(outcome);
        else fetchRoom.mockResolvedValue(outcome);
        const result = await resolver.resolve(REQUEST);
        expect(result).toEqual({
          ok: false,
          code: ResolveFailureCode.YTDLP_FAILED,
          detail: `room API: ${reason}; yt-dlp: yt-dlp is not installed`,
        });
        expect(warn).toHaveBeenCalledWith(`tiktok_api_failed: ${reason}`);
      });

      it('masks secrets in a network error before logging it', async () => {
        fetchRoom.mockRejectedValue(new Error('boom https://x.example/a?sig=1 token=abc'));
        const result = await resolver.resolve(REQUEST);
        expect(result.detail).not.toContain('abc');
        expect(result.detail).not.toContain('sig=1');
        expect(String(warn.mock.calls[0][0])).not.toContain('sig=1');
      });

      it('returns a successful yt-dlp result unchanged', async () => {
        ytDlpResolve.mockResolvedValue(FALLBACK_RESULT);
        fetchRoom.mockRejectedValue(new Error('timeout'));
        expect(await resolver.resolve(REQUEST)).toBe(FALLBACK_RESULT);
        expect(warn).toHaveBeenCalledTimes(1);
      });
    });
  });

  it('defaults the timeout and passes the username to the client', async () => {
    fetchRoom.mockResolvedValue(liveOriginBoth());
    await resolver.resolve(REQUEST);
    expect(fetchRoom).toHaveBeenCalledWith(USERNAME, DEFAULT_RESOLVE_TIMEOUT_MS);
  });
});
