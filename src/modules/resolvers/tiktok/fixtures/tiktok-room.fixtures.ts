import { JsonResponse } from '../../../../common/http/get-json';

export const FLV_ORIGIN = 'https://example.invalid/origin.flv';
export const HLS_ORIGIN = 'https://example.invalid/origin.m3u8';
export const FLV_HD = 'https://example.invalid/hd.flv';
export const HLS_HD = 'https://example.invalid/hd.m3u8';
export const AUDIO_ONLY = 'https://example.invalid/ao.flv';
export const ROOM_TITLE = 'Synthetic title';

type QualityMap = Record<string, { main: { flv?: string; hls?: string } }>;

export function streamData(qualities: QualityMap): string {
  return JSON.stringify({ data: qualities });
}

export function liveRoom(
  rawStreamData: string | undefined,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    status: 2,
    title: ROOM_TITLE,
    ...(rawStreamData === undefined
      ? {}
      : { streamData: { pull_data: { stream_data: rawStreamData } } }),
    ...extra,
  };
}

export function apiResponse(
  room: Record<string, unknown>,
  statusCode = 0,
  status = 200,
): JsonResponse {
  return { status, data: { statusCode, data: { liveRoom: room } } };
}

export const liveOriginBoth = (): JsonResponse =>
  apiResponse(liveRoom(streamData({ origin: { main: { flv: FLV_ORIGIN, hls: HLS_ORIGIN } } })));
export const liveFallsToHd = (): JsonResponse =>
  apiResponse(
    liveRoom(streamData({ origin: { main: {} }, hd: { main: { flv: FLV_HD, hls: HLS_HD } } })),
  );
export const liveOnlyHls = (): JsonResponse =>
  apiResponse(liveRoom(streamData({ sd: { main: { hls: HLS_HD } } })));
export const liveAudioOnly = (): JsonResponse =>
  apiResponse(liveRoom(streamData({ ao: { main: { flv: AUDIO_ONLY } } })));
export const endedRoom = (): JsonResponse => apiResponse({ status: 4, title: ROOM_TITLE });
export const apiErrorStatusCode = (): JsonResponse => apiResponse(liveRoom(undefined), 4000);
export const missingRoomStatus = (): JsonResponse => apiResponse({ title: ROOM_TITLE });
export const liveMalformedStreamData = (): JsonResponse => apiResponse(liveRoom('{not json'));
