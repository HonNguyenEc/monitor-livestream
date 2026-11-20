import { JsonResponse } from '../../../../common/http/get-json';

export const TEST_COOKIE = 'test-cookie';
export const USER_ID = 4242;
export const SESSION_ID = 987654;
export const STREAM_URL = 'https://example.invalid/live/stream.flv';
export const SESSION_TITLE = 'Synthetic show';
export const SHARE_LINK = `https://live.shopee.vn/share?from=live&session=${SESSION_ID}`;
export const SHORT_LINK = 'https://s.shopee.vn/short';

export const ongoingFound = (): JsonResponse => ({
  status: 200,
  data: { err_code: 0, data: { ongoing_live: { session_id: SESSION_ID, title: SESSION_TITLE } } },
});
export const ongoingNone = (): JsonResponse => ({
  status: 200,
  data: { err_code: 0, data: { ongoing_live: null } },
});
export const ongoingErrCode = (): JsonResponse => ({ status: 200, data: { err_code: 5 } });
export const ongoingErrorOnly = (): JsonResponse => ({ status: 500, data: { error: 'boom' } });
export const ongoingEmpty = (): JsonResponse => ({ status: 502, data: {} });

export const liveInfo = (overrides: Record<string, unknown> = {}): JsonResponse => ({
  status: 200,
  data: {
    code: 0,
    data: {
      sessionStatus: 1,
      sessionStreamingUrl: STREAM_URL,
      sessionTitle: SESSION_TITLE,
      ...overrides,
    },
  },
});
export const infoHttp403 = (): JsonResponse => ({ status: 403, data: { msg: 'forbidden' } });
export const infoBadCode = (): JsonResponse => ({
  status: 200,
  data: { code: 1, message: 'expired' },
});
export const infoNoData = (): JsonResponse => ({ status: 200, data: { code: 0, data: {} } });
